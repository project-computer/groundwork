import { invoke } from '@tauri-apps/api/core'
import { isTauri } from '@/platform'
import { fetchState, pushState } from './backend'
import { formatMrn } from './format'
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
 * target has localStorage only. Returns null when nothing usable is stored. */
export const loadState = async (): Promise<ClinicState | null> => {
  if (isTauri()) {
    try {
      const fromSidecar = parseClinicState(await fetchState())
      if (fromSidecar) return fromSidecar
    } catch (error) {
      console.error('failed to load clinic state from sidecar', error)
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

/** Save order per ADR 0012: Rust command first (source of truth), then the
 * sidecar copy for cloud sync. The web target has localStorage only. */
export const saveState = (data: ClinicState, onResult?: SaveResult) => {
  const fail = (error: unknown, scope: string) => {
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
