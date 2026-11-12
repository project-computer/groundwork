import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react'
import { i18n } from '@lingui/core'
import { msg } from '@lingui/core/macro'
import { loadPlanPref, loadState, parseClinicState, restCreateOwnerAndPatient, restCreatePatient, restEnsureOwner, restSetStaffPin, restVerifyMember, savePlanPref, saveState } from './persistence'
import { runAutoBackup } from './backup'
import { useSyncWorker } from './sync'
import { can, formatMoney, formatMrn, invoiceTotals, roleLabel } from './format'
import { createPinCredential, verifyPin } from './auth'
import { seedState } from './seed'
import type {
  Appointment,
  AppointmentStatus,
  Clinic,
  ClinicState,
  Diagnosis,
  Encounter,
  InventoryItem,
  InventoryLot,
  InvoiceItem,
  CaseBundle,
  Owner,
  Patient,
  Payment,
  Permission,
  Prescription,
  Role,
  StaffUser,
  StockMovement,
  StockReason,
  Supplier,
  Vaccination,
  Vitals,
} from './types'
import type { ClinicBackup } from './backup'

type Plan = 'local' | 'cloud'

/** Inert stand-in so a document without a matching member cannot crash the
 * shell; the reducer refuses every write for an unknown actor anyway. */
const EMPTY_USER: StaffUser = { id: '', name: '—', role: 'reception', active: false }
export type View =
  | 'dashboard'
  | 'schedule'
  | 'owners'
  | 'records'
  | 'consult'
  | 'inventory'
  | 'billing'
  | 'reports'
  | 'staff'
  | 'settings'

/** Why the reducer refused an action (ADR-0015). Ephemeral UI feedback. */
interface Rejection {
  /** Stable machine identifier, e.g. 'stock.shortage', 'rbac.denied'. */
  code: string
  /** Human-readable explanation a banner can show directly. */
  message: string
  at: string
}

/** Ephemeral UI/session state; never persisted as part of the document. */
export interface Session {
  currentUserId: string
  /** True while the clinic is gated behind the staff PIN lock screen. */
  locked: boolean
  plan: Plan
  lanOnline: boolean
  internetOnline: boolean
  syncing: boolean
  view: View
  activeEncounterId?: string
  lastSyncError?: string
  /** Set when the last attempt to persist the document failed. */
  saveError?: string
  /** Why the last refused dispatch happened; cleared on the next success. */
  lastRejection?: Rejection
}

/** One reducer step: the clinic document plus its session. */
export interface Store {
  data: ClinicState
  session: Session
}


const uid = () => crypto.randomUUID()
const now = () => new Date().toISOString()

/** Every store mutation. Consumed by the sync seam (lib/vet/sync.ts) too. */
export type Action =
  | { type: 'session'; patch: Partial<Session> }
  | { type: 'registerOwner'; owner: Omit<Owner, 'id' | 'version'> & { id?: string; version?: number }; patient: Omit<Patient, 'id' | 'ownerId' | 'mrn' | 'version'> & { id?: string; mrn?: string; version?: number } }
  | { type: 'addPatient'; patient: Omit<Patient, 'id' | 'mrn' | 'version'> & { id?: string; mrn?: string; version?: number } }
  | { type: 'updatePatient'; id: string; patch: Partial<Pick<Patient, 'name' | 'species' | 'breed' | 'sex' | 'birthDate' | 'weightKg' | 'weightUnit' | 'microchip' | 'allergies' | 'medicalAlerts'>> }
  | { type: 'updateOwner'; id: string; patch: Partial<Pick<Owner, 'name' | 'phone' | 'email' | 'address'>> }
  | { type: 'bookAppointment'; appointment: Omit<Appointment, 'id' | 'version' | 'status'> }
  | { type: 'walkIn'; patientId: string; reason: string; vetId: string }
  | { type: 'rescheduleAppointment'; id: string; startsAt: string; durationMin?: number }
  | { type: 'setAppointmentStatus'; id: string; status: AppointmentStatus }
  | { type: 'startEncounter'; appointmentId: string }
  | { type: 'updateVitals'; encounterId: string; vitals: Vitals }
  | { type: 'addNote'; encounterId: string; body: string }
  | { type: 'amendNote'; encounterId: string; noteId: string; body: string; reason: string }
  | { type: 'addDiagnosis'; encounterId: string; diagnosis: Omit<Diagnosis, 'id'> }
  | { type: 'confirmDiagnosis'; encounterId: string; diagnosisId: string }
  | { type: 'addPrescription'; encounterId: string; prescription: Omit<Prescription, 'id' | 'prescriberId'> }
  | { type: 'removePrescription'; encounterId: string; prescriptionId: string }
  | { type: 'recordVaccination'; patientId: string; vaccination: Omit<Vaccination, 'id' | 'patientId' | 'vetId' | 'version'> }
  | { type: 'exportCaseBundle'; bundle: CaseBundle }
  | { type: 'importCaseBundle'; bundle: CaseBundle }
  | { type: 'closeEncounter'; encounterId: string }
  | { type: 'createInvoice'; ownerId: string; items: Omit<InvoiceItem, 'id'>[] }
  | { type: 'addInvoiceItem'; invoiceId: string; item: Omit<InvoiceItem, 'id'> }
  | { type: 'postInvoice'; invoiceId: string }
  | { type: 'recordPayment'; payment: Omit<Payment, 'id' | 'receivedAt'> }
  | { type: 'refundPayment'; invoiceId: string; paymentId: string; amount: number; note: string }
  | { type: 'voidInvoice'; invoiceId: string }
  | { type: 'addSupplier'; supplier: Omit<Supplier, 'id'> }
  | { type: 'addInventoryItem'; item: Omit<InventoryItem, 'id'> }
  | { type: 'receiveLot'; lot: Omit<InventoryLot, 'id' | 'quantity'>; quantity: number }
  | { type: 'recordStockMovement'; lotId: string; delta: number; reason: StockReason; notes?: string }
  | { type: 'addStaff'; name: string; role: Role; email?: string; phone?: string }
  | { type: 'updateStaff'; id: string; name?: string; role?: Role; email?: string; phone?: string }
  | { type: 'setStaffActive'; id: string; active: boolean }
  | { type: 'setStaffPin'; id: string; credential: { pinHash: string; pinSalt: string } | null }
  | { type: 'updateClinic'; patch: Partial<Omit<Clinic, 'id'>> }
  | { type: 'signIn'; userId: string }
  | { type: 'syncComplete'; changeIds: string[] }
  | { type: 'syncResult'; data: ClinicState }
  | { type: 'restore'; data: ClinicState }
  | { type: 'restoreBackup'; backup: ClinicBackup }
  | { type: 'recordAudit'; action: string; entityType: string; entityId: string; summary: string }

/**
 * Records a refused action in state (ADR-0015) — the UI can always explain a
 * no-op. Cleared by the next successful commit; never audited or synced.
 */
const reject = (store: Store, code: string, message: string): Store => ({
  ...store,
  session: { ...store.session, lastRejection: { code, message, at: now() } },
})

/**
 * Every business mutation passes through here so the record change, its audit
 * event and its outbox entry land in the same state transition — the in-memory
 * equivalent of the spec's single SQLite transaction. The whole document is
 * then persisted atomically to the local store (SQLite on Tauri, localStorage
 * on the web). A successful commit clears any pending rejection.
 */
const commit = (
  store: Store,
  data: ClinicState,
  entry: { action: string; entityType: string; entityId: string; summary: string; operation?: 'upsert' | 'append' },
): Store => {
  const occurredAt = now()
  return {
    ...store,
    session: { ...store.session, lastRejection: undefined },
    data: {
      ...data,
      audit: [
        {
          id: uid(),
          actorId: store.session.currentUserId,
          action: entry.action,
          entityType: entry.entityType,
          entityId: entry.entityId,
          summary: entry.summary,
          occurredAt,
        },
        ...data.audit,
      ],
      outbox: [
        ...data.outbox,
        { changeId: uid(), entityType: entry.entityType, entityId: entry.entityId, operation: entry.operation ?? 'upsert', occurredAt },
      ],
    },
  }
}

const updateEncounter = (data: ClinicState, id: string, fn: (e: Encounter) => Encounter): ClinicState => {
  return { ...data, encounters: data.encounters.map((e) => (e.id === id && e.status === 'open' ? { ...fn(e), version: e.version + 1 } : e)) }
}

const patientName = (data: ClinicState, id: string) => data.patients.find((p) => p.id === id)?.name ?? 'patient'

/** Human-readable Medical Record Number, e.g. PT-2026-0042 (see CONTEXT.md). */
/** Exposed for tests: drive business mutations and assert on the resulting document. */
export const reducer = (store: Store, action: Action): Store => {
  const { data, session } = store

  if (action.type === 'session') {
    // Patching with the current values must not mark the store dirty — the
    // save effect and sync worker key off state changes.
    const keys = Object.keys(action.patch) as (keyof Session)[]
    if (keys.every((key) => session[key] === action.patch[key])) return store
    return { ...store, session: { ...session, ...action.patch } }
  }
  if (action.type === 'syncComplete') {
    const done = new Set(action.changeIds)
    return {
      session: { ...session, syncing: false },
      data: { ...data, outbox: data.outbox.filter((c) => !done.has(c.changeId)), lastSyncedAt: now() },
    }
  }
  if (action.type === 'syncResult') {
    // The sidecar returns the merged document with acknowledged changes
    // already removed from the outbox.
    return { data: action.data, session: { ...session, syncing: false, lastSyncError: undefined } }
  }
  if (action.type === 'restore') {
    return { data: action.data, session: { ...session, view: 'dashboard', activeEncounterId: undefined } }
  }

  // Signing in is a session change, not a write — it stays available while
  // read-only, but never onto a deactivated member. The lock screen verifies
  // the PIN before dispatching.
  if (action.type === 'signIn') {
    const target = data.users.find((u) => u.id === action.userId)
    if (!target || !target.active) return reject(store, 'auth.inactive_member', 'That member is deactivated and cannot sign in.')
    return { ...store, session: { ...session, currentUserId: target.id, locked: false } }
  }

  // Writes require a reachable clinic server; cached data stays readable.
  if (!session.lanOnline) return reject(store, 'sync.offline', 'Offline from the clinic server — changes are read-only until you reconnect.')

  // Exporting and restoring are audited like any other write, but they do not
  // create an outbox entry: the audit trail is local and must not be replayed
  // to the cloud as a business change.
  if (action.type === 'recordAudit') {
    return {
      ...store,
      data: {
        ...data,
        audit: [
          {
            id: uid(),
            actorId: session.currentUserId,
            action: action.action,
            entityType: action.entityType,
            entityId: action.entityId,
            summary: action.summary,
            occurredAt: now(),
          },
          ...data.audit,
        ],
      },
    }
  }

  // Restoring a backup replaces the whole document, so it is a destructive
  // admin-level write. The session survives: if the signed-in member is absent
  // from the backup, the first active admin takes over, and the lock screen
  // applies when that account holds a PIN.
  if (action.type === 'restoreBackup') {
    const actor = data.users.find((u) => u.id === session.currentUserId)
    if (!actor || !can(actor.role, 'data.export')) return reject(store, 'rbac.denied', 'Restoring a backup needs the data-export permission.')
    const restored = parseClinicState(action.backup.state)
    if (!restored) return reject(store, 'backup.invalid', 'That file is not a readable clinic backup.')
    const nextUser =
      restored.users.find((u) => u.id === actor.id) ??
      restored.users.find((u) => u.role === 'admin' && u.active) ??
      restored.users.find((u) => u.active)
    if (!nextUser) return reject(store, 'backup.no_active_member', 'The backup contains no active staff member to sign in as.')
    const summary = `Restored backup from ${action.backup.createdAt} — ${restored.patients.length} patients, ${restored.encounters.length} encounters`
    return {
      data: {
        ...restored,
        audit: [
          {
            id: uid(),
            actorId: actor.id,
            action: 'backup.restore',
            entityType: 'clinic',
            entityId: restored.clinic.id,
            summary,
            occurredAt: now(),
          },
          ...restored.audit,
        ],
      },
      session: {
        ...session,
        currentUserId: nextUser.id,
        locked: !!nextUser.pinHash,
        activeEncounterId: undefined,
        syncing: false,
        lastSyncError: undefined,
      },
    }
  }

  // Staff administration is reserved for clinic admins and blocked offline
  // like every other write. The signed-in admin cannot lock themselves out.
  if (action.type === 'addStaff' || action.type === 'setStaffActive') {
    const actor = data.users.find((u) => u.id === session.currentUserId)
    if (!actor || !can(actor.role, 'staff.manage')) return reject(store, 'rbac.denied', 'Only clinic admins manage staff accounts.')
    if (action.type === 'setStaffActive' && !action.active && action.id === session.currentUserId)
      return reject(store, 'staff.self_deactivate', 'You cannot deactivate your own account.')
    if (action.type === 'addStaff' && !action.name.trim()) return reject(store, 'staff.empty_name', 'A staff member needs a name.')
  }

  // Members may edit their own profile; only admins may change anyone else's
  // account or grant a role.
  if (action.type === 'updateStaff') {
    const actor = data.users.find((u) => u.id === session.currentUserId)
    if (!actor || !data.users.some((u) => u.id === action.id)) return reject(store, 'staff.not_found', 'That staff member no longer exists.')
    const isSelf = actor.id === action.id
    const managesStaff = can(actor.role, 'staff.manage')
    if (!managesStaff && !isSelf) return reject(store, 'rbac.denied', 'You can only edit your own profile.')
    if (!managesStaff && action.role !== undefined && action.role !== actor.role)
      return reject(store, 'staff.self_role', 'Only clinic admins can change roles.')
    if (action.name !== undefined && !action.name.trim()) return reject(store, 'staff.empty_name', 'A staff member needs a name.')
  }

  // Clinic identity is tenant configuration, reserved for clinic admins.
  if (action.type === 'updateClinic') {
    const actor = data.users.find((u) => u.id === session.currentUserId)
    if (!actor || !can(actor.role, 'clinic.manage')) return reject(store, 'rbac.denied', 'Clinic identity is reserved for clinic admins.')
    if (action.patch.name !== undefined && !action.patch.name.trim()) return reject(store, 'clinic.empty_name', 'The clinic needs a name.')
    if (action.patch.vatRate !== undefined && (!Number.isFinite(action.patch.vatRate) || action.patch.vatRate < 0 || action.patch.vatRate > 1)) {
      return reject(store, 'clinic.invalid_vat', 'VAT must be a rate between 0 and 1.')
    }
  }

  // PINs are a credential change: admins manage anyone's, members their own.
  if (action.type === 'setStaffPin') {
    const actor = data.users.find((u) => u.id === session.currentUserId)
    if (!actor || !data.users.some((u) => u.id === action.id)) return reject(store, 'staff.not_found', 'That staff member no longer exists.')
    if (actor.role !== 'admin' && actor.id !== action.id) return reject(store, 'rbac.denied', 'You can only change your own PIN.')
  }

  // Inventory writes follow the permission matrix — admin and pharmacist
  // hold inventory.write; veterinarian and reception are read-only. The
  // matrix lives in format.ts; usePermission derives from the same source.
  if (action.type === 'addSupplier' || action.type === 'addInventoryItem' || action.type === 'receiveLot' || action.type === 'recordStockMovement') {
    const actor = data.users.find((u) => u.id === session.currentUserId)
    if (!actor || !can(actor.role, 'inventory.write')) return reject(store, 'rbac.inventory', 'Only admins and pharmacists can change stock.')
  }

  switch (action.type) {
    case 'registerOwner': {
      // ADR 0025: ids/mrn may arrive from a REST-first creation (client-minted
      // id, server MRN); local writes mint their own.
      const owner: Owner = { ...action.owner, id: action.owner.id ?? uid(), version: action.owner.version ?? 1 }
      const patient: Patient = {
        ...action.patient,
        id: action.patient.id ?? uid(),
        ownerId: owner.id,
        mrn: action.patient.mrn ?? formatMrn(data.patients.length + 1),
        version: action.patient.version ?? 1,
      }
      return commit(store, { ...data, owners: [owner, ...data.owners], patients: [patient, ...data.patients] }, {
        action: 'owner.create',
        entityType: 'owner',
        entityId: owner.id,
        summary: `Registered ${owner.name} with ${patient.name}`,
      })
    }
    case 'addPatient': {
      // ADR 0025: REST-first creation projects the server's row (client-minted
      // id, server MRN) — ids are optional in the payload and minted here
      // only when the write stayed local.
      const patient: Patient = {
        ...action.patient,
        id: action.patient.id ?? uid(),
        mrn: action.patient.mrn ?? formatMrn(data.patients.length + 1),
        version: action.patient.version ?? 1,
      }
      return commit(store, { ...data, patients: [patient, ...data.patients] }, {
        action: 'patient.create',
        entityType: 'patient',
        entityId: patient.id,
        summary: `Added patient ${patient.name}`,
      })
    }
    case 'updatePatient': {
      const patient = data.patients.find((p) => p.id === action.id)
      if (!patient) return store
      const next: Patient = { ...patient, ...action.patch, version: patient.version + 1 }
      const changed = (Object.keys(action.patch) as (keyof typeof action.patch)[]).some(
        (key) => JSON.stringify(patient[key]) !== JSON.stringify(next[key]),
      )
      if (!changed) return store
      return commit(store, { ...data, patients: data.patients.map((p) => (p.id === next.id ? next : p)) }, {
        action: 'patient.update',
        entityType: 'patient',
        entityId: next.id,
        summary:
          next.name !== patient.name
            ? `Renamed ${patient.name} to ${next.name}`
            : `Updated profile for ${next.name}`,
      })
    }
    case 'updateOwner': {
      const owner = data.owners.find((o) => o.id === action.id)
      if (!owner) return store
      if (action.patch.name !== undefined && !action.patch.name.trim()) return reject(store, 'owner.empty_name', 'An owner needs a name.')
      const next: Owner = {
        ...owner,
        ...action.patch,
        name: (action.patch.name ?? owner.name).trim(),
        version: owner.version + 1,
      }
      const changed = (Object.keys(action.patch) as (keyof typeof action.patch)[]).some(
        (key) => action.patch[key] !== owner[key],
      )
      if (!changed) return store
      return commit(store, { ...data, owners: data.owners.map((o) => (o.id === next.id ? next : o)) }, {
        action: 'owner.update',
        entityType: 'owner',
        entityId: next.id,
        summary: `Updated owner ${next.name}`,
      })
    }
    case 'bookAppointment': {
      const appt: Appointment = { ...action.appointment, id: uid(), status: 'booked', version: 1 }
      return commit(store, { ...data, appointments: [...data.appointments, appt] }, {
        action: 'appointment.book',
        entityType: 'appointment',
        entityId: appt.id,
        summary: `Booked ${patientName(data, appt.patientId)} — ${appt.reason}`,
      })
    }
    case 'walkIn': {
      const patient = data.patients.find((p) => p.id === action.patientId)
      if (!patient) return store
      const appt: Appointment = {
        id: uid(),
        patientId: action.patientId,
        startsAt: now(),
        durationMin: 20,
        reason: action.reason || 'Walk-in',
        vetId: action.vetId || session.currentUserId,
        status: 'checked_in',
        version: 1,
      }
      return commit(store, { ...data, appointments: [...data.appointments, appt] }, {
        action: 'appointment.walk_in',
        entityType: 'appointment',
        entityId: appt.id,
        summary: `Walk-in: ${patient.name} — ${appt.reason}`,
      })
    }
    case 'rescheduleAppointment': {
      const appt = data.appointments.find((a) => a.id === action.id)
      if (!appt || (appt.status !== 'booked' && appt.status !== 'no_show' && appt.status !== 'cancelled'))
        return reject(store, 'appointment.not_reschedulable', 'Only booked, no-show or cancelled appointments can be rescheduled.')
      return commit(
        store,
        {
          ...data,
          appointments: data.appointments.map((a) =>
            a.id === action.id
              ? { ...a, startsAt: action.startsAt, durationMin: action.durationMin ?? a.durationMin, status: 'booked', version: a.version + 1 }
              : a,
          ),
        },
        { action: 'appointment.reschedule', entityType: 'appointment', entityId: appt.id, summary: `Rescheduled ${patientName(data, appt.patientId)} to ${action.startsAt.slice(0, 16).replace('T', ' ')}` },
      )
    }
    case 'setAppointmentStatus': {
      const appt = data.appointments.find((a) => a.id === action.id)
      if (!appt) return store
      return commit(
        store,
        { ...data, appointments: data.appointments.map((a) => (a.id === action.id ? { ...a, status: action.status, version: a.version + 1 } : a)) },
        { action: `appointment.${action.status}`, entityType: 'appointment', entityId: appt.id, summary: `${patientName(data, appt.patientId)}: ${action.status.replace('_', ' ')}` },
      )
    }
    case 'startEncounter': {
      const appt = data.appointments.find((a) => a.id === action.appointmentId)
      if (!appt) return store
      const existing = data.encounters.find((e) => e.appointmentId === appt.id)
      if (existing) return { ...store, session: { ...session, view: 'consult', activeEncounterId: existing.id } }
      const enc: Encounter = {
        id: uid(),
        patientId: appt.patientId,
        appointmentId: appt.id,
        attendingId: session.currentUserId,
        status: 'open',
        openedAt: now(),
        vitals: { weightKg: '', tempC: '', heartRate: '', respRate: '' },
        notes: [],
        diagnoses: [],
        prescriptions: [],
        version: 1,
      }
      const next = commit(
        store,
        {
          ...data,
          encounters: [enc, ...data.encounters],
          appointments: data.appointments.map((a) => (a.id === appt.id ? { ...a, status: 'in_consult', version: a.version + 1 } : a)),
        },
        { action: 'encounter.open', entityType: 'encounter', entityId: enc.id, summary: `Opened consultation for ${patientName(data, appt.patientId)}` },
      )
      return { ...next, session: { ...next.session, view: 'consult', activeEncounterId: enc.id } }
    }
    case 'updateVitals':
      return commit(store, updateEncounter(data, action.encounterId, (e) => ({ ...e, vitals: action.vitals })), {
        action: 'observation.record',
        entityType: 'encounter',
        entityId: action.encounterId,
        summary: 'Recorded vitals',
      })
    case 'addNote': {
      const note = { id: uid(), authorId: session.currentUserId, body: action.body, createdAt: now() }
      return commit(store, updateEncounter(data, action.encounterId, (e) => ({ ...e, notes: [...e.notes, note] })), {
        action: 'note.create',
        entityType: 'clinical_note',
        entityId: note.id,
        summary: 'Added clinical note',
        operation: 'append',
      })
    }
    case 'amendNote': {
      const enc = data.encounters.find((e) => e.id === action.encounterId)
      if (!enc || enc.status !== 'open') return store
      if (!enc.notes.some((n) => n.id === action.noteId)) return store
      if (!action.body.trim() || !action.reason.trim())
        return reject(store, 'note.empty', 'An amendment needs both the new text and a reason.')
      const note = {
        id: uid(),
        authorId: session.currentUserId,
        body: action.body.trim(),
        createdAt: now(),
        amends: action.noteId,
        amendReason: action.reason.trim(),
      }
      return commit(store, updateEncounter(data, action.encounterId, (e) => ({ ...e, notes: [...e.notes, note] })), {
        action: 'note.amend',
        entityType: 'clinical_note',
        entityId: note.id,
        summary: `Amended note — ${note.amendReason}`,
        operation: 'append',
      })
    }
    case 'addDiagnosis': {
      const dx = { ...action.diagnosis, id: uid() }
      return commit(store, updateEncounter(data, action.encounterId, (e) => ({ ...e, diagnoses: [...e.diagnoses, dx] })), {
        action: 'diagnosis.create',
        entityType: 'diagnosis',
        entityId: dx.id,
        summary: `Diagnosis: ${dx.description}`,
      })
    }
    case 'confirmDiagnosis': {
      const enc = data.encounters.find((e) => e.id === action.encounterId)
      const dx = enc?.diagnoses.find((d) => d.id === action.diagnosisId)
      if (!enc || enc.status !== 'open' || !dx || dx.status === 'confirmed') return store
      return commit(
        store,
        updateEncounter(data, action.encounterId, (e) => ({
          ...e,
          diagnoses: e.diagnoses.map((d) => (d.id === action.diagnosisId ? { ...d, status: 'confirmed' } : d)),
        })),
        { action: 'diagnosis.confirm', entityType: 'diagnosis', entityId: dx.id, summary: `Confirmed diagnosis: ${dx.description}` },
      )
    }
    case 'addPrescription': {
      // Stock floor — enforced here, not only in the form (phase 2 of the
      // 2026-10-29 refactor): a prescription may not exceed the quantity on
      // hand across the item's InventoryLots. Legacy catalog products and
      // free-text medications carry no stock and are never blocked.
      if (action.prescription.productId) {
        const item = data.inventoryItems.find((i) => i.id === action.prescription.productId)
        if (item) {
          const onHand = data.inventoryLots.filter((l) => l.itemId === item.id).reduce((sum, l) => sum + l.quantity, 0)
          if (action.prescription.quantity > onHand)
            return reject(store, 'stock.shortage', `Only ${onHand} ${item.unit} of ${item.name} left in stock.`)
        }
      }
      const rx = { ...action.prescription, id: uid(), prescriberId: session.currentUserId }
      return commit(store, updateEncounter(data, action.encounterId, (e) => ({ ...e, prescriptions: [...e.prescriptions, rx] })), {
        action: 'prescription.create',
        entityType: 'prescription',
        entityId: rx.id,
        summary: `Prescribed ${rx.medication}`,
      })
    }
    case 'removePrescription': {
      const enc = data.encounters.find((e) => e.id === action.encounterId)
      const rx = enc?.prescriptions.find((p) => p.id === action.prescriptionId)
      if (!enc || enc.status !== 'open' || !rx) return store
      return commit(
        store,
        updateEncounter(data, action.encounterId, (e) => ({ ...e, prescriptions: e.prescriptions.filter((p) => p.id !== action.prescriptionId) })),
        { action: 'prescription.remove', entityType: 'prescription', entityId: rx.id, summary: `Removed prescription for ${rx.medication}` },
      )
    }
    case 'recordVaccination': {
      const patient = data.patients.find((p) => p.id === action.patientId)
      if (!patient) return store
      if (!action.vaccination.vaccineName.trim()) return reject(store, 'vaccination.empty_name', 'A vaccination needs the vaccine name.')
      const vac: Vaccination = {
        ...action.vaccination,
        vaccineName: action.vaccination.vaccineName.trim(),
        id: uid(),
        patientId: patient.id,
        vetId: session.currentUserId,
        version: 1,
      }
      return commit(store, { ...data, vaccinations: [vac, ...data.vaccinations] }, {
        action: 'vaccination.record',
        entityType: 'vaccination',
        entityId: vac.id,
        summary: `Vaccinated ${patient.name} — ${vac.vaccineName}${vac.nextDueAt ? ` (next due ${vac.nextDueAt})` : ''}`,
      })
    }
    case 'exportCaseBundle': {
      const bundle = action.bundle
      if (!data.patients.some((p) => p.id === bundle.patient.id)) return store
      return commit(store, { ...data, caseTransfers: [bundle, ...data.caseTransfers] }, {
        action: 'case.export',
        entityType: 'case_transfer',
        entityId: bundle.token,
        summary: `Shared ${bundle.patient.name}'s case (${bundle.encounters.length} visits) — token ${bundle.token.slice(0, 8)}…`,
      })
    }
    case 'importCaseBundle': {
      const bundle = action.bundle
      if (bundle.format !== 'vetcare-case-bundle') return reject(store, 'case.invalid_format', 'That file is not a VetCare case bundle.')
      // Guard: the same share token can only be received once. (The copy gets
      // a fresh local MRN, so a source-MRN clash needs no guard.)
      if (data.caseTransfers.some((t) => t.token === bundle.token))
        return reject(store, 'case.duplicate_token', `This case was already received (token ${bundle.token.slice(0, 8)}…).`)

      // Owner is matched by phone (joint records stay linked); created if new.
      let owner = data.owners.find((o) => o.phone === bundle.owner.phone)
      const owners = owner ? data.owners : [...data.owners, { ...bundle.owner, id: uid(), version: 1 }]
      if (!owner) owner = owners[owners.length - 1]

      const patient: Patient = {
        ...bundle.patient,
        id: uid(),
        ownerId: owner.id,
        mrn: formatMrn(data.patients.length + 1),
        originClinicId: bundle.fromClinic.id,
        originClinicName: bundle.fromClinic.name,
        originPatientId: bundle.patient.id,
        version: 1,
      }

      const encounters = bundle.encounters.map((e) => ({
        ...e,
        id: uid(),
        patientId: patient.id,
        status: 'closed' as const,
        originClinicId: bundle.fromClinic.id,
        originEncounterId: e.id,
        version: 1,
      }))

      const vaccinations = bundle.vaccinations.map((v) => ({
        ...v,
        id: uid(),
        patientId: patient.id,
        encounterId: undefined,
        originClinicId: bundle.fromClinic.id,
        originVaccinationId: v.id,
        version: 1,
      }))

      const ledger: CaseBundle = { ...bundle, encounters: [], vaccinations: [] }
      return commit(store, { ...data, owners, patients: [patient, ...data.patients], encounters: [...encounters, ...data.encounters], vaccinations: [...vaccinations, ...data.vaccinations], caseTransfers: [ledger, ...data.caseTransfers] }, {
        action: 'case.import',
        entityType: 'case_transfer',
        entityId: bundle.token,
        summary: `Received ${patient.name} from ${bundle.fromClinic.name} (${encounters.length} visits, ${vaccinations.length} vaccinations) as ${patient.mrn}`,
      })
    }
    case 'closeEncounter': {
      const enc = data.encounters.find((e) => e.id === action.encounterId)
      if (!enc || enc.status === 'closed') return store
      const patient = data.patients.find((p) => p.id === enc.patientId)
      if (!patient) return store
      const closedAt = now()
      const consult = data.products.find((p) => p.id === 'svc-1')
      // Resolve each prescription against the catalog: legacy products first,
      // then inventory items (the live pharmacy model). Inventory dispenses
      // deduct lots FEFO (first-expiry-first-out) so the ledger and the
      // cached lot quantities stay reconciled.
      const items: InvoiceItem[] = consult
        ? [{ id: uid(), description: consult.name, quantity: 1, unitPrice: consult.unitPrice, productId: consult.id }]
        : []
      const productDispenses: StockMovement[] = []
      const lotDispenses: StockMovement[] = []
      let lots = data.inventoryLots
      for (const rx of enc.prescriptions) {
        const product = rx.productId ? data.products.find((p) => p.id === rx.productId) : undefined
        const item = rx.productId ? data.inventoryItems.find((i) => i.id === rx.productId) : undefined
        if (product) {
          items.push({ id: uid(), description: product.name, quantity: rx.quantity, unitPrice: product.unitPrice, productId: product.id })
          productDispenses.push({ id: uid(), productId: product.id, delta: -rx.quantity, reason: 'dispense', referenceId: enc.id, createdAt: closedAt })
          continue
        }
        if (item) {
          items.push({ id: uid(), description: item.name, quantity: rx.quantity, unitPrice: item.sellingPrice, productId: item.id })
          let remaining = rx.quantity
          const fefo = lots
            .filter((l) => l.itemId === item.id && l.quantity > 0)
            .toSorted((a, b) => (a.expiryDate ?? '9999-12-31').localeCompare(b.expiryDate ?? '9999-12-31'))
          for (const lot of fefo) {
            if (remaining <= 0) break
            const take = Math.min(lot.quantity, remaining)
            lotDispenses.push({ id: uid(), lotId: lot.id, delta: -take, reason: 'stock_out', referenceId: enc.id, notes: `dispense for ${patient.name}`, createdAt: closedAt })
            lots = lots.map((l) => (l.id === lot.id ? { ...l, quantity: l.quantity - take } : l))
            remaining -= take
          }
          continue
        }
        items.push({ id: uid(), description: rx.medication, quantity: rx.quantity, unitPrice: 0 })
      }
      const invoiceId = uid()
      const number = `INV-${new Date(closedAt).getFullYear()}-${String(142 + data.invoices.length).padStart(4, '0')}`
      return commit(
        store,
        {
          ...data,
          encounters: data.encounters.map((e) => (e.id === enc.id ? { ...e, status: 'closed', closedAt, version: e.version + 1 } : e)),
          appointments: data.appointments.map((a) => (a.id === enc.appointmentId ? { ...a, status: 'completed', version: a.version + 1 } : a)),
          patients: data.patients.map((p) => (p.id === patient.id ? { ...p, lastVisit: closedAt.slice(0, 10) } : p)),
          stockMovements: [...data.stockMovements, ...productDispenses, ...lotDispenses],
          inventoryLots: lots,
          invoices: [
            { id: invoiceId, number, ownerId: patient.ownerId, encounterId: enc.id, status: 'draft', items, createdAt: closedAt, version: 1 },
            ...data.invoices,
          ],
        },
        { action: 'encounter.close', entityType: 'encounter', entityId: enc.id, summary: `Closed consultation for ${patient.name}; draft ${number}` },
      )
    }
    case 'createInvoice': {
      if (!action.items.length) return reject(store, 'invoice.empty', 'An invoice needs at least one line item.')
      const owner = data.owners.find((o) => o.id === action.ownerId)
      if (!owner) return store
      const invoiceId = uid()
      const number = `INV-${new Date().getFullYear()}-${String(142 + data.invoices.length).padStart(4, '0')}`
      const invoice = {
        id: invoiceId,
        number,
        ownerId: owner.id,
        status: 'draft' as const,
        items: action.items.map((item) => ({ ...item, id: uid() })),
        createdAt: now(),
        version: 1,
      }
      return commit(store, { ...data, invoices: [invoice, ...data.invoices] }, {
        action: 'invoice.create',
        entityType: 'invoice',
        entityId: invoiceId,
        summary: `Created draft ${number} for ${owner.name}`,
      })
    }
    case 'addInvoiceItem': {
      const item = { ...action.item, id: uid() }
      return commit(
        store,
        {
          ...data,
          invoices: data.invoices.map((i) =>
            i.id === action.invoiceId && i.status === 'draft' ? { ...i, items: [...i.items, item], version: i.version + 1 } : i,
          ),
        },
        { action: 'invoice.item_add', entityType: 'invoice', entityId: action.invoiceId, summary: `Added ${item.description}` },
      )
    }
    case 'postInvoice': {
      const inv = data.invoices.find((i) => i.id === action.invoiceId)
      if (!inv || inv.status !== 'draft') return reject(store, 'invoice.not_draft', 'Only draft invoices can be posted.')
      return commit(
        store,
        { ...data, invoices: data.invoices.map((i) => (i.id === inv.id ? { ...i, status: 'posted', version: i.version + 1 } : i)) },
        { action: 'invoice.post', entityType: 'invoice', entityId: inv.id, summary: `Posted ${inv.number}` },
      )
    }
    case 'recordPayment': {
      const payment: Payment = { ...action.payment, id: uid(), receivedAt: now() }
      const inv = data.invoices.find((i) => i.id === payment.invoiceId)
      if (!inv || inv.status !== 'posted') return reject(store, 'payment.not_posted', 'Only posted invoices can take a payment.')
      if (!Number.isFinite(payment.amount) || payment.amount <= 0)
        return reject(store, 'payment.invalid_amount', 'A payment needs a positive amount.')
      // The paid flip is decided here, not by the caller (phase 2): a payment
      // settles the invoice when the ledger reaches the invoice total.
      const balance = invoiceTotals(inv, data.clinic.vatRate, data.payments).balance
      if (payment.amount > balance) return reject(store, 'payment.overpayment', `That exceeds the balance due (${formatMoney(balance)}).`)
      const settles = payment.amount === balance
      return commit(
        store,
        {
          ...data,
          payments: [...data.payments, payment],
          invoices: settles ? data.invoices.map((i) => (i.id === inv.id ? { ...i, status: 'paid', version: i.version + 1 } : i)) : data.invoices,
        },
        { action: 'payment.record', entityType: 'payment', entityId: payment.id, summary: `Payment on ${inv.number} (${payment.method})`, operation: 'append' },
      )
    }
    case 'refundPayment': {
      const inv = data.invoices.find((i) => i.id === action.invoiceId)
      const original = data.payments.find((p) => p.id === action.paymentId)
      if (!inv || inv.status === 'draft' || inv.status === 'void') return reject(store, 'payment.not_refundable', 'Draft and void invoices cannot be refunded.')
      if (!original || original.invoiceId !== inv.id) return store
      if ((original.kind ?? 'payment') !== 'payment') return reject(store, 'payment.not_refundable', 'Only payments can be refunded, not refunds themselves.')
      const alreadyRefunded = data.payments
        .filter((p) => p.refundOf === original.id)
        .reduce((sum, p) => sum + Math.abs(p.amount), 0)
      const amount = Math.round(action.amount)
      if (!Number.isFinite(amount) || amount <= 0) return reject(store, 'payment.invalid_amount', 'A refund needs a positive amount.')
      if (amount > original.amount - alreadyRefunded)
        return reject(store, 'refund.exceeds_headroom', `Only ${formatMoney(original.amount - alreadyRefunded)} of that payment is still refundable.`)
      if (!action.note.trim()) return reject(store, 'refund.empty_note', 'A refund needs a reason for the ledger.')
      const refund: Payment = {
        id: uid(),
        invoiceId: inv.id,
        amount: -amount,
        method: original.method,
        receivedAt: now(),
        kind: 'refund',
        refundOf: original.id,
        note: action.note.trim(),
      }
      const paid = data.payments.filter((p) => p.invoiceId === inv.id).reduce((sum, p) => sum + p.amount, 0) + refund.amount
      const total = invoiceTotals(inv, data.clinic.vatRate, data.payments).total
      const reopened = inv.status === 'paid' && paid < total
      return commit(
        store,
        {
          ...data,
          payments: [...data.payments, refund],
          invoices: reopened ? data.invoices.map((i) => (i.id === inv.id ? { ...i, status: 'posted' as const, version: i.version + 1 } : i)) : data.invoices,
        },
        {
          action: 'payment.refund',
          entityType: 'payment',
          entityId: refund.id,
          summary: `Refunded ${(amount / 100).toFixed(2)} on ${inv.number} — ${refund.note}`,
          operation: 'append',
        },
      )
    }
    case 'voidInvoice': {
      const inv = data.invoices.find((i) => i.id === action.invoiceId)
      if (!inv || inv.status === 'draft' || inv.status === 'void') return reject(store, 'invoice.not_voidable', 'Only posted invoices can be voided.')
      // Parity with the cloud API's void rule: money that is still held cannot
      // be voided. Refunds net against payments, so a fully refunded invoice
      // becomes voidable again.
      const netPaid = data.payments.filter((p) => p.invoiceId === inv.id).reduce((sum, p) => sum + p.amount, 0)
      if (netPaid > 0) return reject(store, 'payment.void_has_payments', 'This invoice holds payments — refund them before voiding.')
      return commit(
        store,
        { ...data, invoices: data.invoices.map((i) => (i.id === inv.id ? { ...i, status: 'void' as const, version: i.version + 1 } : i)) },
        { action: 'invoice.void', entityType: 'invoice', entityId: inv.id, summary: `Voided ${inv.number}` },
      )
    }
    case 'addSupplier': {
      if (!action.supplier.name.trim()) return reject(store, 'supplier.empty_name', 'A supplier needs a name.')
      const supplier: Supplier = { ...action.supplier, id: uid(), name: action.supplier.name.trim() }
      return commit(store, { ...data, suppliers: [supplier, ...data.suppliers] }, {
        action: 'supplier.create',
        entityType: 'supplier',
        entityId: supplier.id,
        summary: `Added supplier ${supplier.name}`,
      })
    }
    case 'addInventoryItem': {
      if (!action.item.name.trim()) return reject(store, 'inventory.empty_name', 'An inventory item needs a name.')
      const item: InventoryItem = { ...action.item, id: uid(), name: action.item.name.trim() }
      return commit(store, { ...data, inventoryItems: [item, ...data.inventoryItems] }, {
        action: 'inventory_item.create',
        entityType: 'inventory_item',
        entityId: item.id,
        summary: `Added inventory item ${item.name}`,
      })
    }
    case 'receiveLot': {
      // A received lot lands at quantity 0 and the initial stock_in movement
      // brings it up — the ledger reconciles with the cached quantity, mirroring
      // the backend's transactional rule (slice 0008).
      const item = data.inventoryItems.find((i) => i.id === action.lot.itemId)
      if (!item || !action.lot.lotNumber.trim() || action.quantity <= 0)
        return reject(store, 'stock.invalid_lot', 'A lot needs its item, a lot number and a positive quantity.')
      const lot: InventoryLot = { ...action.lot, id: uid(), lotNumber: action.lot.lotNumber.trim(), quantity: 0 }
      const movement: StockMovement = {
        id: uid(),
        lotId: lot.id,
        delta: action.quantity,
        reason: 'stock_in',
        notes: 'initial receipt',
        createdAt: now(),
      }
      return commit(
        store,
        {
          ...data,
          inventoryLots: [lot, ...data.inventoryLots],
          stockMovements: [...data.stockMovements, movement],
        },
        { action: 'stock.lot_receive', entityType: 'inventory_lot', entityId: lot.id, summary: `Received lot ${lot.lotNumber} — ${action.quantity} × ${item.name}`, operation: 'append' },
      )
    }
    case 'recordStockMovement': {
      // Append-only ledger: the movement row and the lot's cached quantity update
      // in the same transition; negative stock is refused (CHECK-equivalent).
      const lot = data.inventoryLots.find((l) => l.id === action.lotId)
      if (!lot) return store
      if (lot.quantity + action.delta < 0) return reject(store, 'stock.negative', 'Stock cannot go negative — check the lot quantity.')
      const movement: StockMovement = {
        id: uid(),
        lotId: lot.id,
        delta: action.delta,
        reason: action.reason,
        notes: action.notes,
        createdAt: now(),
      }
      return commit(
        store,
        {
          ...data,
          inventoryLots: data.inventoryLots.map((l) => (l.id === lot.id ? { ...l, quantity: l.quantity + action.delta } : l)),
          stockMovements: [...data.stockMovements, movement],
        },
        { action: `stock.${action.reason}`, entityType: 'stock_movement', entityId: movement.id, summary: `${action.reason} ${action.delta} of lot ${lot.lotNumber}`, operation: 'append' },
      )
    }
    case 'addStaff': {
      const member: StaffUser = {
        id: uid(),
        name: action.name.trim(),
        role: action.role,
        active: true,
        email: action.email?.trim() || undefined,
        phone: action.phone?.trim() || undefined,
      }
      return commit(store, { ...data, users: [...data.users, member] }, {
        action: 'staff.create',
        entityType: 'staff_user',
        entityId: member.id,
        summary: `Added ${member.name} as ${roleLabel[member.role].toLowerCase()}`,
      })
    }
    case 'updateStaff': {
      const member = data.users.find((u) => u.id === action.id)
      if (!member) return store
      const next: StaffUser = {
        ...member,
        name: action.name?.trim() || member.name,
        role: action.role ?? member.role,
        email: action.email !== undefined ? action.email.trim() || undefined : member.email,
        phone: action.phone !== undefined ? action.phone.trim() || undefined : member.phone,
      }
      if (
        next.name === member.name &&
        next.role === member.role &&
        next.email === member.email &&
        next.phone === member.phone
      )
        return store
      const summary =
        next.role !== member.role
          ? `Changed ${next.name}'s role to ${roleLabel[next.role].toLowerCase()}`
          : next.name !== member.name
            ? `Renamed ${member.name} to ${next.name}`
            : `Updated ${next.name}'s profile`
      return commit(store, { ...data, users: data.users.map((u) => (u.id === next.id ? next : u)) }, {
        action: 'staff.update',
        entityType: 'staff_user',
        entityId: next.id,
        summary,
      })
    }
    case 'setStaffActive': {
      const member = data.users.find((u) => u.id === action.id)
      if (!member || member.active === action.active) return store
      return commit(store, { ...data, users: data.users.map((u) => (u.id === member.id ? { ...u, active: action.active } : u)) }, {
        action: action.active ? 'staff.reactivate' : 'staff.deactivate',
        entityType: 'staff_user',
        entityId: member.id,
        summary: `${action.active ? 'Reactivated' : 'Deactivated'} ${member.name}`,
      })
    }
    case 'setStaffPin': {
      const member = data.users.find((u) => u.id === action.id)
      if (!member) return store
      const next: StaffUser = {
        ...member,
        pinHash: action.credential?.pinHash,
        pinSalt: action.credential?.pinSalt,
      }
      return commit(store, { ...data, users: data.users.map((u) => (u.id === next.id ? next : u)) }, {
        action: action.credential ? 'staff.pin_set' : 'staff.pin_clear',
        entityType: 'staff_user',
        entityId: next.id,
        summary: action.credential ? `Set a PIN for ${member.name}` : `Cleared the PIN for ${member.name}`,
      })
    }
    case 'updateClinic': {
      const current = data.clinic
      const next: Clinic = {
        ...current,
        ...action.patch,
        name: action.patch.name?.trim() || current.name,
        timezone: action.patch.timezone?.trim() || current.timezone,
        currency: action.patch.currency?.trim() || current.currency,
        address: action.patch.address !== undefined ? action.patch.address.trim() || undefined : current.address,
        phone: action.patch.phone !== undefined ? action.patch.phone.trim() || undefined : current.phone,
        email: action.patch.email !== undefined ? action.patch.email.trim() || undefined : current.email,
      }
      if (
        next.name === current.name &&
        next.timezone === current.timezone &&
        next.currency === current.currency &&
        next.vatRate === current.vatRate &&
        next.address === current.address &&
        next.phone === current.phone &&
        next.email === current.email
      )
        return store
      return commit(store, { ...data, clinic: next }, {
        action: 'clinic.update',
        entityType: 'clinic',
        entityId: next.id,
        summary: next.name !== current.name ? `Renamed clinic to ${next.name}` : 'Updated clinic identity',
      })
    }
  }
}

/* ---------- persistence ---------- */

// Document I/O lives in ./persistence: loadState/saveState, the adapter
// order (ADR 0012) and the shape guards isClinicState/parseClinicState.

/* ---------- provider ---------- */

/** Exposed for tests and hydration callers. */
export const initialSession: Session = {
  currentUserId: 'u-pim',
  locked: false,
  plan: 'local',
  lanOnline: true,
  internetOnline: true,
  syncing: false,
  view: 'dashboard',
}

const StoreContext = createContext<{
  store: Store
  dispatch: (a: Action) => void
  hydrated: boolean
  signInWithPin: (member: StaffUser, pin: string) => Promise<'ok' | 'denied' | 'fallback'>
  setMemberPin: (member: StaffUser, pin: string) => void
  registerOwnerAndPatient: (
    owner: { id?: string; name: string; phone: string; email: string; address: string },
    patient: {
      name: string
      species: Patient['species']
      breed: string
      sex: Patient['sex']
      birthDate: string
      microchip?: string
      allergies: string[]
      medicalAlerts: string[]
      weightUnit?: string
    },
  ) => Promise<void>
  registerPatient: (
    owner: Owner,
    patient: {
      name: string
      species: Patient['species']
      breed: string
      sex: Patient['sex']
      birthDate: string
      microchip?: string
      allergies: string[]
      medicalAlerts: string[]
      weightUnit?: string
    },
  ) => Promise<void>
} | null>(null)

export const ClinicProvider = ({ children }: { children: ReactNode }) => {
  const [hydrated, setHydrated] = useState(false)
  const [store, dispatch] = useReducer(reducer, { data: seedState, session: initialSession })
  const { plan, internetOnline, lanOnline, syncing } = store.session
  const pending = store.data.outbox

  // On the web the plan preference survives reloads; in Tauri it is per-session.
  useEffect(() => {
    const stored = loadPlanPref()
    if (stored) {
      dispatch({ type: 'session', patch: { plan: stored } })
    }
  }, [])

  // Hydrate once from the local store; fall back to the demo seed.
  useEffect(() => {
    let alive = true
    void loadState().then((persisted) => {
      if (!alive) return
      if (persisted) {
        dispatch({ type: 'restore', data: persisted })
        // A stale member reference adopts the first active admin, mirroring
        // the restore rule — the shell needs a signed-in member to render.
        if (!persisted.users.some((u) => u.id === initialSession.currentUserId)) {
          const fallback =
            persisted.users.find((u) => u.role === 'admin' && u.active) ?? persisted.users.find((u) => u.active)
          if (fallback) dispatch({ type: 'signIn', userId: fallback.id })
        }
        // A document whose signed-in member holds a PIN starts locked, so
        // reopening the app on a shared terminal always asks for the PIN.
        const current = persisted.users.find((u) => u.id === initialSession.currentUserId)
        if (current?.pinHash) dispatch({ type: 'session', patch: { locked: true } })
      }
      setHydrated(true)
    })
    return () => {
      alive = false
    }
  }, [])

  // Persist the whole document after every committed transition.
  const firstPersist = useRef(true)
  useEffect(() => {
    if (!hydrated) return
    if (firstPersist.current && store.data === seedState) {
      firstPersist.current = false
      return
    }
    firstPersist.current = false
    saveState(store.data, (error) => {
      dispatch({ type: 'session', patch: { saveError: error ?? undefined } })
    })
  }, [hydrated, store.data])

  // Keep the plan choice in localStorage on the web backend.
  useEffect(() => {
    if (!hydrated) return
    savePlanPref(plan)
  }, [plan, hydrated])

  // Keep the latest document reachable from the sync worker without making it
  // a dependency of the sync effects.
  const dataRef = useRef(store.data)
  useEffect(() => {
    dataRef.current = store.data
  }, [store.data])

  // Daily automatic backup (ADR 0021): once per launch, on the hydrated
  // document. In a browser this is a no-op (no sidecar to hold the file).
  const autoBackupDone = useRef(false)
  useEffect(() => {
    if (!hydrated || autoBackupDone.current) return
    autoBackupDone.current = true
    void runAutoBackup(dataRef.current, dispatch)
    // Runs exactly once per launch on the loaded document; later commits are
    // deliberately out of scope.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated])

  // Credential verification for the lock screen (ADR 0024): REST-authoritative
  // when the vetcare backend knows the member, document PBKDF2 otherwise.
  // The store owns the orchestration so no UI surface touches transports.
  const signInWithPin = useCallback(
    async (member: StaffUser, pin: string): Promise<'ok' | 'denied' | 'fallback'> => {
      const outcome = await restVerifyMember(member.id, pin)
      if (outcome === 'ok') {
        dispatch({ type: 'signIn', userId: member.id })
        return 'ok'
      }
      if (outcome === 'denied') return 'denied'
      const localOk = await verifyPin(member, pin)
      if (localOk) {
        dispatch({ type: 'signIn', userId: member.id })
        return 'ok'
      }
      return 'denied'
    },
    [dispatch],
  )

  // PIN writes commit to the document first (the offline guarantee), then
  // best-effort mirror to REST when the member exists there (issue 0019).
  // REST members without a mirrored PIN would break ADR-0024 verification,
  // so a failure is logged loudly — but never blocks the local write.
  const setMemberPin = useCallback(
    (member: StaffUser, pin: string): void => {
      void createPinCredential(pin).then((credential) => {
        dispatch({ type: 'setStaffPin', id: member.id, credential })
        void restSetStaffPin(member.id, pin).then((sync) => {
          if (sync === 'failed') {
            console.error(`setMemberPin: REST mirror failed for ${member.name}`)
          }
        })
      })
    },
    [dispatch],
  )

  // Registration (ADR 0025, slice 1): REST-first with document projection.
  // The client mints the owner id, so pre-cutover owners converge; the
  // server's row (client id + server MRN) is projected through the ordinary
  // reducer actions. REST unreachable → the reducer mints locally and the
  // outbox path is untouched: the clinic never blocks on REST.
  const registerOwnerAndPatient = useCallback(
    async (
      owner: { id?: string; name: string; phone: string; email: string; address: string },
      patient: {
        name: string
        species: Patient['species']
        breed: string
        sex: Patient['sex']
        birthDate: string
        microchip?: string
        allergies: string[]
        medicalAlerts: string[]
        weightUnit?: string
      },
    ): Promise<void> => {
      const ownerId = owner.id ?? crypto.randomUUID()
      const result = await restCreateOwnerAndPatient(ownerId, { owner, patient })
      if (result.status === 'ok' && result.owner && result.pet) {
        dispatch({
          type: 'registerOwner',
          owner: { ...owner, id: result.owner.id },
          patient: {
            ...patient,
            id: result.pet.id,
            mrn: result.pet.mrn,
          },
        })
        return
      }
      dispatch({ type: 'registerOwner', owner, patient })
    },
    [dispatch],
  )

  const registerPatient = useCallback(
    async (
      owner: Owner,
      patient: {
        name: string
        species: Patient['species']
        breed: string
        sex: Patient['sex']
        birthDate: string
        microchip?: string
        allergies: string[]
        medicalAlerts: string[]
        weightUnit?: string
      },
    ): Promise<void> => {
      const ensured = await restEnsureOwner(owner.id, {
        name: owner.name,
        phone: owner.phone,
        email: owner.email,
        address: owner.address ?? '',
      })
      const result = ensured
        ? await restCreatePatient(owner.id, patient)
        : ({ status: 'local' } as const)
      if (result.status === 'ok' && result.pet) {
        dispatch({
          type: 'addPatient',
          patient: { ...patient, ownerId: owner.id, id: result.pet.id, mrn: result.pet.mrn },
        })
        return
      }
      dispatch({ type: 'addPatient', patient: { ...patient, ownerId: owner.id } })
    },
    [dispatch],
  )

  // Sync orchestration lives behind the lib/vet/sync seam (phase 5): debounced
  // push, periodic pull, connectivity resets and the in-flight mutation lock.
  const { guardedDispatch } = useSyncWorker({
    plan,
    internetOnline,
    lanOnline,
    syncing,
    pending: pending.length,
    dataRef,
    dispatch,
  })

  const value = useMemo(
    () => ({ store, dispatch: guardedDispatch, hydrated, signInWithPin, setMemberPin, registerOwnerAndPatient, registerPatient }),
    [store, guardedDispatch, hydrated, signInWithPin, setMemberPin, registerOwnerAndPatient, registerPatient],
  )
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export const useClinic = () => {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useClinic must be used inside ClinicProvider')
  const { store, dispatch, hydrated, signInWithPin, setMemberPin, registerOwnerAndPatient, registerPatient } = ctx
  // A stale or missing member (foreign document, emptied users collection)
  // must not crash the shell — the inert placeholder holds no permissions on
  // any write path because the reducer re-checks the actor on every action.
  const user =
    store.data.users.find((u) => u.id === store.session.currentUserId) ??
    store.data.users.find((u) => u.active) ??
    EMPTY_USER
  return { data: store.data, session: store.session, user, dispatch, hydrated, signInWithPin, setMemberPin, registerOwnerAndPatient, registerPatient }
}

export const usePermission = (permission: Permission) => {
  const { user, session } = useClinic()
  if (!session.lanOnline) return { allowed: false, reason: i18n._(msg`Offline from clinic server — read-only`) }
  if (!can(user.role, permission)) return { allowed: false, reason: i18n._(msg`Your role does not permit this action`) }
  return { allowed: true, reason: '' }
}

export type SyncState = 'lan_offline' | 'local_only' | 'cloud_offline' | 'syncing' | 'pending' | 'synced'

export const useSyncState = (): { state: SyncState; pending: number } => {
  const { data, session } = useClinic()
  const pending = data.outbox.length
  if (!session.lanOnline) return { state: 'lan_offline', pending }
  if (session.plan === 'local') return { state: 'local_only', pending }
  if (!session.internetOnline) return { state: 'cloud_offline', pending }
  if (session.syncing) return { state: 'syncing', pending }
  if (pending > 0) return { state: 'pending', pending }
  return { state: 'synced', pending }
}
