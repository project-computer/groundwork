import { invoke } from '@tauri-apps/api/core'
import { isMobilePlatform, isTauri } from '@/lib/platform'
import { fetchState, pushState } from './backend'
import { formatMrn } from './format'
import { RestError, getOwner as restGetOwner, createOwner as restCreateOwner, createPet as restCreatePet, listStaff, login as restLogin, setStaffPin as restSetStaffPinCall } from './rest'
import { CLINIC_STATE_COLLECTIONS, type ClinicState, type Patient } from './types'

/**
 * Persistence seam: where the clinic document lives, and in which order the
 * adapters are tried (ADR 0012). One interface — loadState/saveState — over
 * three adapters: sidecar HTTP, Rust invoke fallback, localStorage (web).
 * The store imports only this module for document I/O.
 */

const STORAGE_KEY = 'clinicbook:state:v1'

/** Clinical profile fields arrive after the first release — documents saved
 * before them are backfilled so the reducer never sees undefined arrays. */
const backfillPatient = (patient: Patient, index: number): Patient => {
  return {
    ...patient,
    mrn: patient.mrn ?? formatMrn(index + 1),
    allergies: patient.allergies ?? [],
    medicalAlerts: patient.medicalAlerts ?? [],
  }
}

/**
 * Strict structural guard so a corrupt or foreign payload never reaches the
 * reducer. The required-collection list is `CLINIC_STATE_COLLECTIONS`; the Go
 * sidecar (`store.Validate`) and the Rust fallback (`validate_state`) enforce
 * the same list, and all three are pinned to `fixtures/clinic-document.json`
 * by tests.
 */
export const isClinicState = (value: unknown): value is ClinicState => {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return !!v.clinic && CLINIC_STATE_COLLECTIONS.every((key) => Array.isArray(v[key]))
}

/**
 * Validates and normalises a foreign document (storage, backup, sync result):
 * collections added after older persisted documents are backfilled with empty
 * arrays, staff activation defaults on, and patient fields are backfilled.
 * A collection that is present but not an array is corrupt and rejected —
 * never silently dropped. Returns null when the payload is not a clinic
 * document at all.
 */
export const parseClinicState = (raw: unknown): ClinicState | null => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const candidate = raw as Record<string, unknown>
  if (!candidate.clinic) return null
  const filled: Record<string, unknown> = { ...candidate }
  for (const key of CLINIC_STATE_COLLECTIONS) {
    if (filled[key] === undefined) filled[key] = []
  }
  if (!isClinicState(filled)) return null
  const state = filled as ClinicState
  // Documents persisted before staff activation existed default to active.
  return {
    ...state,
    users: state.users.map((u) => ({ ...u, active: u.active ?? true })),
    patients: state.patients.map(backfillPatient),
  }
}

/** Load order per ADR 0012: sidecar first, Rust fallback second; the web
 * target has localStorage only. The mobile shell skips the sidecar probe —
 * there is no sidecar in an APK and polling it delays hydration by seconds. */
export const loadState = async (): Promise<ClinicState | null> => {
  if (isTauri()) {
    if (!isMobilePlatform()) {
      try {
        const fromSidecar = parseClinicState(await fetchState())
        if (fromSidecar) return fromSidecar
      } catch (error) {
        console.error('failed to load clinic state from sidecar', error)
      }
    }
    try {
      return parseClinicState(await invoke<unknown>('state_load_command'))
    } catch {
      return null
    }
  }
  try {
    return parseClinicState(JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null'))
  } catch {
    return null
  }
}

/** Reports why a save failed so the UI can tell the clinic something is wrong. */
export type SaveResult = (error: string | null) => void

const PLAN_KEY = 'clinicbook:plan'

export type PlanPref = 'cloud' | 'local'

/** The web target remembers the sync-plan choice across reloads; in Tauri it
 * is per-session. Returns null when nothing usable is stored. */
export const loadPlanPref = (): PlanPref | null => {
  if (isTauri()) return null
  try {
    const stored = window.localStorage.getItem(PLAN_KEY)
    return stored === 'cloud' || stored === 'local' ? stored : null
  } catch {
    return null
  }
}

export const savePlanPref = (plan: PlanPref) => {
  if (isTauri()) return
  try {
    window.localStorage.setItem(PLAN_KEY, plan)
  } catch {
    // Choice stays session-only when persistence is unavailable.
  }
}

// --- REST auth bridge (ADR 0024) ---------------------------------------------
// Credential verification for the lock screen. When the vetcare REST backend
// is reachable, credentials are authoritative there (bcrypt, server-side);
// `fallback` falls back to the document's PBKDF2 hash — the same degraded
// path philosophy as the ADR-0012 adapter order.

export type RestAuthOutcome = 'ok' | 'denied' | 'fallback'

/**
 * Verifies a member's PIN against the REST backend when the member exists in
 * its staff directory. Returns 'fallback' when REST is unreachable or the
 * member is document-only, so the caller can verify against the document
 * hash. A directory hit is authoritative: wrong PIN means denied — the
 * document hash is never consulted for REST-known members.
 */
export const restVerifyMember = async (memberId: string, pin: string): Promise<RestAuthOutcome> => {
  try {
    const directory = await listStaff()
    const match = directory.users.find((user) => user.id === memberId && user.active)
    if (!match) return 'fallback'
    const session = await restLogin(match.username, pin)
    return session.token ? 'ok' : 'denied'
  } catch (error) {
    // Wrong PIN on a directory hit is a denial; anything else (sidecar
    // absent, network hiccup) degrades to the document path.
    if (error instanceof RestError && error.status === 401) return 'denied'
    return 'fallback'
  }
}

export type RestPinSync = 'synced' | 'skipped' | 'failed'

// --- REST-first owner/patient creation (ADR 0025) -----------------------------
// The client mints UUIDs so the document and the normalized store never
// diverge on identity; REST is the durable store, the document write is the
// projection the UI reads. Unreachable backend degrades to a local-only
// commit (the clinic never blocks on REST).

export interface RestRegistrationPayload {
  owner: { name: string; phone: string; email: string; address: string }
  patient: {
    name: string
    species: string
    breed: string
    sex: string
    birthDate: string
    microchip?: string
  }
}

export interface RestRegistrationResult {
  status: 'ok' | 'local'
  /** The server rows: the document projects these (id, server MRN). Present
   * only when status === 'ok'. */
  owner?: { id: string }
  pet?: { id: string; mrn: string }
}

/** Document sex vocabulary → the REST schema's base sex. Neutered/spayed
 * nuances stay in the document (mirroring the importer's note-folding). */
export const toRestSex = (sex: string): string => {
  if (sex.startsWith('Male')) return 'male'
  if (sex.startsWith('Female')) return 'female'
  return 'unknown'
}

const toRestPatient = (patient: RestRegistrationPayload['patient']) => ({
  name: patient.name,
  species: patient.species.toLowerCase(),
  breed: patient.breed,
  sex: toRestSex(patient.sex),
  dateOfBirth: patient.birthDate,
  microchipNumber: patient.microchip,
})

/** Ensures the owner exists under the document's own id (client-minted ids
 * are honored server-side), so pre-cutover owners converge instead of
 * forking identities. Returns false when REST is unavailable. */
export const restEnsureOwner = async (
  ownerId: string,
  profile: RestRegistrationPayload['owner'],
): Promise<boolean> => {
  try {
    try {
      await restGetOwner(ownerId)
      return true
    } catch (error) {
      if (!(error instanceof RestError) || error.status !== 404) throw error
    }
    await restCreateOwner({ id: ownerId, ...profile })
    return true
  } catch (error) {
    console.error('restEnsureOwner: REST unavailable, degrading to local-only commit', error)
    return false
  }
}

/** Creates the owner + patient in REST, projecting the caller-minted ids. */
export const restCreateOwnerAndPatient = async (
  ownerId: string,
  payload: RestRegistrationPayload,
): Promise<RestRegistrationResult> => {
  try {
    const owner = await restCreateOwner({ id: ownerId, ...payload.owner })
    const pet = await restCreatePet({ id: crypto.randomUUID(), ownerId: owner.id, ...toRestPatient(payload.patient) })
    return { status: 'ok', owner: { id: owner.id }, pet: { id: pet.id, mrn: pet.mrn } }
  } catch (error) {
    console.error('restCreateOwnerAndPatient: degraded to local-only commit', error)
    return { status: 'local' }
  }
}

/** Creates a patient under an owner that already exists in REST. */
export const restCreatePatient = async (
  ownerId: string,
  patient: RestRegistrationPayload['patient'],
): Promise<RestRegistrationResult> => {
  try {
    const pet = await restCreatePet({ id: crypto.randomUUID(), ownerId, ...toRestPatient(patient) })
    return { status: 'ok', owner: { id: ownerId }, pet: { id: pet.id, mrn: pet.mrn } }
  } catch (error) {
    console.error('restCreatePatient: degraded to local-only commit', error)
    return { status: 'local' }
  }
}

/**
 * Mirrors a PIN change to the REST backend (issue 0019) so the bridge in
 * ADR 0024 can verify it server-side. REST-known members are updated; members
 * only the document knows are skipped (there is nothing to sync); failures
 * never block the document write — offline-first means the local hash is the
 * guarantee, the mirror is an upgrade. Best-effort by contract.
 */
export const restSetStaffPin = async (memberId: string, pin: string): Promise<RestPinSync> => {
  try {
    const directory = await listStaff()
    if (!directory.users.some((user) => user.id === memberId && user.active)) return 'skipped'
    await restSetStaffPinCall(memberId, pin)
    return 'synced'
  } catch (error) {
    if (error instanceof RestError && error.status === 404) return 'skipped'
    console.error('restSetStaffPin: mirror failed (document PIN remains authoritative)', error)
    return 'failed'
  }
}

/** Save order per ADR 0012: Rust command first (source of truth), then the
 * sidecar copy for cloud sync. The web target has localStorage only. */
export const saveState = (data: ClinicState, onResult?: SaveResult) => {  const fail = (error: unknown, scope: string) => {
    console.error(scope, error)
    onResult?.(error instanceof Error ? error.message : String(error))
  }
  if (isTauri()) {
    void (async () => {
      // The SQLite document is the source of truth for every collection
      // (owners, users, invoices, PIN hashes…). The sidecar's normalized tables
      // only model a subset, so always persist the full document here.
      try {
        await invoke('state_save_command', { state: data })
      } catch (error) {
        return fail(error, 'failed to persist clinic state')
      }
      // Keep the sidecar's extracted copy current for cloud sync.
      try {
        await pushState(data)
      } catch (error) {
        return fail(error, 'failed to persist clinic state via sidecar')
      }
      onResult?.(null)
    })()
    return
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    onResult?.(null)
  } catch (error) {
    fail(error, 'failed to persist clinic state')
  }
}
