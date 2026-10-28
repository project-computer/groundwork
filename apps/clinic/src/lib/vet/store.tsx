import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { isTauri } from '@/platform'
import { fetchState, pushState, runSync } from './backend'
import { can, roleLabel } from './format'
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

export type Plan = 'local' | 'cloud'
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
}

interface Store {
  data: ClinicState
  session: Session
}

const STORAGE_KEY = 'clinicbook:state:v1'
const PLAN_KEY = 'clinicbook:plan'

const uid = () => crypto.randomUUID()
const now = () => new Date().toISOString()

type Action =
  | { type: 'session'; patch: Partial<Session> }
  | { type: 'registerOwner'; owner: Omit<Owner, 'id' | 'version'>; patient: Omit<Patient, 'id' | 'ownerId' | 'mrn' | 'version'> }
  | { type: 'addPatient'; patient: Omit<Patient, 'id' | 'mrn' | 'version'> }
  | { type: 'updatePatient'; id: string; patch: Partial<Pick<Patient, 'microchip' | 'allergies' | 'medicalAlerts'>> }
  | { type: 'bookAppointment'; appointment: Omit<Appointment, 'id' | 'version' | 'status'> }
  | { type: 'walkIn'; patientId: string; reason: string; vetId: string }
  | { type: 'rescheduleAppointment'; id: string; startsAt: string; durationMin?: number }
  | { type: 'setAppointmentStatus'; id: string; status: AppointmentStatus }
  | { type: 'startEncounter'; appointmentId: string }
  | { type: 'updateVitals'; encounterId: string; vitals: Vitals }
  | { type: 'addNote'; encounterId: string; body: string }
  | { type: 'amendNote'; encounterId: string; noteId: string; body: string; reason: string }
  | { type: 'addDiagnosis'; encounterId: string; diagnosis: Omit<Diagnosis, 'id'> }
  | { type: 'addPrescription'; encounterId: string; prescription: Omit<Prescription, 'id' | 'prescriberId'> }
  | { type: 'removePrescription'; encounterId: string; prescriptionId: string }
  | { type: 'recordVaccination'; patientId: string; vaccination: Omit<Vaccination, 'id' | 'patientId' | 'vetId' | 'version'> }
  | { type: 'exportCaseBundle'; bundle: CaseBundle }
  | { type: 'importCaseBundle'; bundle: CaseBundle }
  | { type: 'closeEncounter'; encounterId: string }
  | { type: 'createInvoice'; ownerId: string; items: Omit<InvoiceItem, 'id'>[] }
  | { type: 'addInvoiceItem'; invoiceId: string; item: Omit<InvoiceItem, 'id'> }
  | { type: 'postInvoice'; invoiceId: string }
  | { type: 'recordPayment'; payment: Omit<Payment, 'id' | 'receivedAt'>; settles: boolean }
  | { type: 'voidInvoice'; invoiceId: string }
  | { type: 'receiveStock'; productId: string; quantity: number }
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

/**
 * Every business mutation passes through here so the record change, its audit
 * event and its outbox entry land in the same state transition — the in-memory
 * equivalent of the spec's single SQLite transaction. The whole document is
 * then persisted atomically to the local store (SQLite on Tauri, localStorage
 * on the web).
 */
const commit = (
  store: Store,
  data: ClinicState,
  entry: { action: string; entityType: string; entityId: string; summary: string; operation?: 'upsert' | 'append' },
): Store => {
  const occurredAt = now()
  return {
    ...store,
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
export const formatMrn = (sequence: number, year = new Date().getFullYear()) => {
  return `PT-${year}-${String(sequence).padStart(4, '0')}`
}

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

const reducer = (store: Store, action: Action): Store => {
  const { data, session } = store

  if (action.type === 'session') return { ...store, session: { ...session, ...action.patch } }
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
    if (!target || !target.active) return store
    return { ...store, session: { ...session, currentUserId: target.id, locked: false } }
  }

  // Writes require a reachable clinic server; cached data stays readable.
  if (!session.lanOnline) return store

  // Staff administration is reserved for clinic admins and blocked offline
  // like every other write. The signed-in admin cannot lock themselves out.
  if (action.type === 'addStaff' || action.type === 'setStaffActive') {
    const actor = data.users.find((u) => u.id === session.currentUserId)
    if (!actor || !can(actor.role, 'staff.manage')) return store
    if (action.type === 'setStaffActive' && !action.active && action.id === session.currentUserId) return store
    if (action.type === 'addStaff' && !action.name.trim()) return store
  }

  // Members may edit their own profile; only admins may change anyone else's
  // account or grant a role.
  if (action.type === 'updateStaff') {
    const actor = data.users.find((u) => u.id === session.currentUserId)
    if (!actor || !data.users.some((u) => u.id === action.id)) return store
    const isSelf = actor.id === action.id
    const managesStaff = can(actor.role, 'staff.manage')
    if (!managesStaff && !isSelf) return store
    if (!managesStaff && action.role !== undefined && action.role !== actor.role) return store
    if (action.name !== undefined && !action.name.trim()) return store
  }

  // Clinic identity is tenant configuration, reserved for clinic admins.
  if (action.type === 'updateClinic') {
    const actor = data.users.find((u) => u.id === session.currentUserId)
    if (!actor || !can(actor.role, 'clinic.manage')) return store
    if (action.patch.name !== undefined && !action.patch.name.trim()) return store
    if (action.patch.vatRate !== undefined && (!Number.isFinite(action.patch.vatRate) || action.patch.vatRate < 0 || action.patch.vatRate > 1)) {
      return store
    }
  }

  // PINs are a credential change: admins manage anyone's, members their own.
  if (action.type === 'setStaffPin') {
    const actor = data.users.find((u) => u.id === session.currentUserId)
    if (!actor || !data.users.some((u) => u.id === action.id)) return store
    if (actor.role !== 'admin' && actor.id !== action.id) return store
  }

  // Inventory writes follow the slice 0007/0008 RBAC matrix: admin and
  // pharmacist write; veterinarian and reception read-only.
  if (action.type === 'addSupplier' || action.type === 'addInventoryItem' || action.type === 'receiveLot' || action.type === 'recordStockMovement') {
    const actor = data.users.find((u) => u.id === session.currentUserId)
    if (!actor || (actor.role !== 'admin' && actor.role !== 'pharmacist')) return store
  }

  switch (action.type) {
    case 'registerOwner': {
      const owner: Owner = { ...action.owner, id: uid(), version: 1 }
      const patient: Patient = { ...action.patient, id: uid(), ownerId: owner.id, mrn: formatMrn(data.patients.length + 1), version: 1 }
      return commit(store, { ...data, owners: [owner, ...data.owners], patients: [patient, ...data.patients] }, {
        action: 'owner.create',
        entityType: 'owner',
        entityId: owner.id,
        summary: `Registered ${owner.name} with ${patient.name}`,
      })
    }
    case 'addPatient': {
      const patient: Patient = { ...action.patient, id: uid(), mrn: formatMrn(data.patients.length + 1), version: 1 }
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
      if (
        next.microchip === patient.microchip &&
        next.allergies.length === patient.allergies.length &&
        next.medicalAlerts.length === patient.medicalAlerts.length &&
        next.allergies.every((a, i) => a === patient.allergies[i]) &&
        next.medicalAlerts.every((a, i) => a === patient.medicalAlerts[i])
      )
        return store
      return commit(store, { ...data, patients: data.patients.map((p) => (p.id === next.id ? next : p)) }, {
        action: 'patient.update',
        entityType: 'patient',
        entityId: next.id,
        summary: `Updated clinical profile for ${next.name}`,
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
      if (!appt || (appt.status !== 'booked' && appt.status !== 'no_show' && appt.status !== 'cancelled')) return store
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
      const note = {
        id: uid(),
        authorId: session.currentUserId,
        body: action.body,
        createdAt: now(),
        amends: action.noteId,
        amendReason: action.reason,
      }
      return commit(store, updateEncounter(data, action.encounterId, (e) => ({ ...e, notes: [...e.notes, note] })), {
        action: 'note.amend',
        entityType: 'clinical_note',
        entityId: note.id,
        summary: `Amended note — ${action.reason}`,
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
    case 'addPrescription': {
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
      if (!patient || !action.vaccination.vaccineName.trim()) return store
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
      if (bundle.format !== 'vetcare-case-bundle') return store
      // Guard: the same share token can only be received once. (The copy gets
      // a fresh local MRN, so a source-MRN clash needs no guard.)
      if (data.caseTransfers.some((t) => t.token === bundle.token)) return store

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
            .sort((a, b) => (a.expiryDate ?? '9999-12-31').localeCompare(b.expiryDate ?? '9999-12-31'))
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
      if (!action.items.length) return store
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
      if (!inv || inv.status !== 'draft') return store
      return commit(
        store,
        { ...data, invoices: data.invoices.map((i) => (i.id === inv.id ? { ...i, status: 'posted', version: i.version + 1 } : i)) },
        { action: 'invoice.post', entityType: 'invoice', entityId: inv.id, summary: `Posted ${inv.number}` },
      )
    }
    case 'recordPayment': {
      const payment: Payment = { ...action.payment, id: uid(), receivedAt: now() }
      const inv = data.invoices.find((i) => i.id === payment.invoiceId)
      if (!inv || inv.status !== 'posted') return store
      return commit(
        store,
        {
          ...data,
          payments: [...data.payments, payment],
          invoices: action.settles ? data.invoices.map((i) => (i.id === inv.id ? { ...i, status: 'paid', version: i.version + 1 } : i)) : data.invoices,
        },
        { action: 'payment.record', entityType: 'payment', entityId: payment.id, summary: `Payment on ${inv.number} (${payment.method})`, operation: 'append' },
      )
    }
    case 'voidInvoice': {
      const inv = data.invoices.find((i) => i.id === action.invoiceId)
      if (!inv || inv.status === 'draft' || inv.status === 'void') return store
      // Parity with the cloud API's void rule: invoices with recorded payments
      // cannot be voided — refunds must be handled explicitly first.
      const hasPayments = data.payments.some((p) => p.invoiceId === inv.id)
      if (hasPayments) return store
      return commit(
        store,
        { ...data, invoices: data.invoices.map((i) => (i.id === inv.id ? { ...i, status: 'void' as const, version: i.version + 1 } : i)) },
        { action: 'invoice.void', entityType: 'invoice', entityId: inv.id, summary: `Voided ${inv.number}` },
      )
    }
    case 'receiveStock': {
      const movement = { id: uid(), productId: action.productId, delta: action.quantity, reason: 'receipt' as const, createdAt: now() }
      const product = data.products.find((p) => p.id === action.productId)
      return commit(store, { ...data, stockMovements: [...data.stockMovements, movement] }, {
        action: 'stock.receive',
        entityType: 'stock_movement',
        entityId: movement.id,
        summary: `Received ${action.quantity} × ${product?.name ?? 'item'}`,
        operation: 'append',
      })
    }
    case 'addSupplier': {
      if (!action.supplier.name.trim()) return store
      const supplier: Supplier = { ...action.supplier, id: uid(), name: action.supplier.name.trim() }
      return commit(store, { ...data, suppliers: [supplier, ...data.suppliers] }, {
        action: 'supplier.create',
        entityType: 'supplier',
        entityId: supplier.id,
        summary: `Added supplier ${supplier.name}`,
      })
    }
    case 'addInventoryItem': {
      if (!action.item.name.trim()) return store
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
      if (!item || !action.lot.lotNumber.trim() || action.quantity <= 0) return store
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
      if (lot.quantity + action.delta < 0) return store
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

/** Structural guard so a corrupt or foreign payload never reaches the reducer. */
export const isClinicState = (value: unknown): value is ClinicState => {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return (
    !!v.clinic &&
    Array.isArray(v.users) &&
    Array.isArray(v.owners) &&
    Array.isArray(v.patients) &&
    Array.isArray(v.appointments) &&
    Array.isArray(v.encounters) &&
    Array.isArray(v.invoices)
  )
}

const parseState = (raw: unknown): ClinicState | null => {
  if (!isClinicState(raw)) return null
  // Documents persisted before staff activation existed default to active.
  return {
    ...raw,
    users: raw.users.map((u) => ({ ...u, active: u.active ?? true })),
    patients: raw.patients.map(backfillPatient),
    suppliers: raw.suppliers ?? [],
    inventoryItems: raw.inventoryItems ?? [],
    inventoryLots: raw.inventoryLots ?? [],
    vaccinations: raw.vaccinations ?? [],
    caseTransfers: raw.caseTransfers ?? [],
  }
}

export const loadState = async (): Promise<ClinicState | null> => {
  if (isTauri()) {
    try {
      const fromSidecar = parseState(await fetchState())
      if (fromSidecar) return fromSidecar
    } catch (error) {
      console.error('failed to load clinic state from sidecar', error)
    }
    try {
      return parseState(await invoke<unknown>('state_load_command'))
    } catch {
      return null
    }
  }
  try {
    return parseState(JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null'))
  } catch {
    return null
  }
}

export const saveState = (data: ClinicState) => {
  if (isTauri()) {
    void (async () => {
      try {
        if (await pushState(data)) return
      } catch (error) {
        console.error('failed to persist clinic state via sidecar', error)
      }
      try {
        await invoke('state_save_command', { state: data })
      } catch (error) {
        console.error('failed to persist clinic state', error)
      }
    })()
    return
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch (error) {
    console.error('failed to persist clinic state', error)
  }
}

/* ---------- provider ---------- */

const initialSession: Session = {
  currentUserId: 'u-pim',
  locked: false,
  plan: 'local',
  lanOnline: true,
  internetOnline: true,
  syncing: false,
  view: 'dashboard',
}

const StoreContext = createContext<{ store: Store; dispatch: (a: Action) => void } | null>(null)

export const ClinicProvider = ({ children }: { children: ReactNode }) => {
  const [hydrated, setHydrated] = useState(false)
  const [store, dispatch] = useReducer(reducer, { data: seedState, session: initialSession })
  const { plan, internetOnline, lanOnline, syncing } = store.session
  const pending = store.data.outbox

  // On the web the plan preference survives reloads; in Tauri it is per-session.
  useEffect(() => {
    if (isTauri()) return
    const stored = window.localStorage.getItem(PLAN_KEY)
    if (stored === 'cloud' || stored === 'local') {
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
    saveState(store.data)
  }, [hydrated, store.data])

  // Keep the plan choice in localStorage on the web backend.
  useEffect(() => {
    if (isTauri() || !hydrated) return
    window.localStorage.setItem(PLAN_KEY, plan)
  }, [plan, hydrated])

  // Keep the latest document reachable from the sync worker without making it
  // a dependency of the sync effect.
  const dataRef = useRef(store.data)
  useEffect(() => {
    dataRef.current = store.data
  }, [store.data])

  // Cloud sync worker: hands the document to the Go sidecar which pushes the
  // outbox and pulls remote entities. The returned document is authoritative,
  // so business mutations are refused while a pass is in flight; otherwise a
  // syncResult could overwrite an edit made after the sync snapshot.
  const inFlight = useRef(false)
  const guardedDispatch = useCallback((action: Action) => {
    if (inFlight.current && action.type !== 'session' && action.type !== 'syncResult' && action.type !== 'syncComplete' && action.type !== 'restore') {
      return
    }
    dispatch(action)
  }, [])

  const syncNow = useCallback(async () => {
    if (inFlight.current) return
    inFlight.current = true
    dispatch({ type: 'session', patch: { syncing: true } })
    try {
      const result = await runSync(dataRef.current)
      if (result && isClinicState(result.state)) {
        if (result.pushed > 0 || result.pulled > 0 || result.ackedChangeIds.length > 0) {
          dispatch({ type: 'syncResult', data: result.state })
        } else {
          dispatch({ type: 'session', patch: { syncing: false, lastSyncError: undefined } })
        }
        return
      }
      // No cloud configured (browser demo): acknowledge a bounded batch so the
      // pending indicator behaves as before.
      const batch = dataRef.current.outbox.slice(0, 25).map((c) => c.changeId)
      if (batch.length > 0) dispatch({ type: 'syncComplete', changeIds: batch })
      else dispatch({ type: 'session', patch: { syncing: false } })
    } catch (error) {
      dispatch({
        type: 'session',
        patch: { syncing: false, lastSyncError: error instanceof Error ? error.message : String(error) },
      })
    } finally {
      inFlight.current = false
    }
  }, [])

  useEffect(() => {
    if (plan !== 'cloud' || !internetOnline || !lanOnline) return
    if (pending.length === 0) return
    const timer = setTimeout(() => {
      void syncNow()
    }, 300)
    return () => clearTimeout(timer)
  }, [plan, internetOnline, lanOnline, pending, syncNow])

  // Periodic pull so remote edits arrive even when there is nothing to push.
  useEffect(() => {
    if (plan !== 'cloud' || !internetOnline || !lanOnline) return
    const timer = setInterval(() => {
      void syncNow()
    }, 60_000)
    return () => clearInterval(timer)
  }, [plan, internetOnline, lanOnline, syncNow])

  // If connectivity drops mid-push, the batch was never acknowledged and stays queued.
  useEffect(() => {
    if (syncing && (!internetOnline || plan !== 'cloud' || !lanOnline)) {
      dispatch({ type: 'session', patch: { syncing: false } })
    }
  }, [syncing, internetOnline, plan, lanOnline])

  const value = useMemo(() => ({ store, dispatch: guardedDispatch }), [store, guardedDispatch])
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export const useClinic = () => {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useClinic must be used inside ClinicProvider')
  const { store, dispatch } = ctx
  const user = store.data.users.find((u) => u.id === store.session.currentUserId)!
  return { data: store.data, session: store.session, user, dispatch }
}

export const usePermission = (permission: Permission) => {
  const { user, session } = useClinic()
  if (!session.lanOnline) return { allowed: false, reason: 'Offline from clinic server — read-only' }
  if (!can(user.role, permission)) return { allowed: false, reason: 'Your role does not permit this action' }
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
