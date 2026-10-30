import { describe, expect, it } from 'vitest'
import { initialSession, reducer, type Store } from './store'
import { seedState } from './seed'
import type { CaseBundle, ClinicState, Encounter } from './types'

/**
 * Characterization tests for the write paths the 2026-10-29 frontend refactor
 * (phase 2) will change: payments, refunds, voids, walk-ins, case imports,
 * backup restores and prescriptions. They pin CURRENT behaviour — including
 * the known gaps called out per test — so the phase-2 diffs are deliberate.
 * See docs/plans/2026-10-29-frontend-refactor.md.
 */

const adminSession = { ...initialSession, currentUserId: 'u-mai' }

const baseStore = (): Store => ({
  data: structuredClone(seedState),
  session: { ...adminSession },
})

/** 92000 subtotal + 7% VAT = 98440 minor units (see format.test.ts). */
const seedInvoiceTotal = 98440

/** inv-1 fully paid in one cash payment (posted → paid). */
const paidStore = () => payInvoice(baseStore(), seedInvoiceTotal, true)

const payInvoice = (store: Store, amount: number, settles: boolean) =>
  reducer(store, { type: 'recordPayment', payment: { invoiceId: 'inv-1', amount, method: 'cash' }, settles })

describe('recordPayment (characterisation)', () => {
  it('flips posted→paid when the caller claims settles, even for a partial amount', () => {
    // GAP (phase 2): the reducer trusts the caller's `settles` flag; the paid
    // transition is decided in the UI (clinic-shell billing). A partial
    // payment marked settles=true closes an invoice that is not fully paid.
    const next = payInvoice(baseStore(), 40000, true)
    expect(next.data.payments).toHaveLength(1)
    expect(next.data.invoices.find((i) => i.id === 'inv-1')!.status).toBe('paid')
  })

  it('keeps the invoice posted when settles is false', () => {
    const next = payInvoice(baseStore(), 40000, false)
    expect(next.data.invoices.find((i) => i.id === 'inv-1')!.status).toBe('posted')
    expect(next.data.payments).toHaveLength(1)
  })

  it('accepts an overpayment — the reducer does not know the balance', () => {
    // GAP (phase 2): the UI blocks amount > balance; the reducer does not.
    const next = payInvoice(baseStore(), 200000, false)
    expect(next.data.payments).toHaveLength(1)
    expect(next.data.payments[0].amount).toBe(200000)
  })

  it('ignores payments on draft invoices', () => {
    const store = baseStore()
    store.data.invoices = store.data.invoices.map((i) => (i.id === 'inv-1' ? { ...i, status: 'draft' } : i))
    const next = payInvoice(store, 40000, true)
    expect(next.data.payments).toHaveLength(0)
    expect(next.data.invoices.find((i) => i.id === 'inv-1')!.status).toBe('draft')
  })
})

describe('refundPayment (characterisation)', () => {

  it('records a negative payment linked to the original', () => {
    const store = paidStore()
    const original = store.data.payments[0]
    const next = reducer(store, { type: 'refundPayment', invoiceId: 'inv-1', paymentId: original.id, amount: 48440, note: 'partial return' })
    const refund = next.data.payments.find((p) => p.kind === 'refund')!
    expect(refund).toMatchObject({ amount: -48440, refundOf: original.id, method: original.method })
  })

  it('reopens a paid invoice when the refund drops it below the total', () => {
    const store = paidStore()
    const original = store.data.payments[0]
    const next = reducer(store, { type: 'refundPayment', invoiceId: 'inv-1', paymentId: original.id, amount: 48440, note: 'partial return' })
    expect(next.data.invoices.find((i) => i.id === 'inv-1')!.status).toBe('posted')
  })

  it('refuses refunds beyond the remaining headroom', () => {
    const store = paidStore()
    const original = store.data.payments[0]
    const next = reducer(store, { type: 'refundPayment', invoiceId: 'inv-1', paymentId: original.id, amount: 98441, note: 'too much' })
    expect(next.data.payments).toHaveLength(store.data.payments.length)
    expect(next.data).toBe(store.data)
  })

  it('refuses refunds without a note', () => {
    const store = paidStore()
    const original = store.data.payments[0]
    const next = reducer(store, { type: 'refundPayment', invoiceId: 'inv-1', paymentId: original.id, amount: 1000, note: '   ' })
    expect(next.data.payments).toHaveLength(store.data.payments.length)
  })
})

describe('voidInvoice (characterisation)', () => {
  it('refuses to void while money is still held', () => {
    const store = payInvoice(baseStore(), 40000, false)
    const next = reducer(store, { type: 'voidInvoice', invoiceId: 'inv-1' })
    expect(next.data.invoices.find((i) => i.id === 'inv-1')!.status).toBe('posted')
  })

  it('nets refunds against payments — a fully refunded invoice is voidable again', () => {
    let store = payInvoice(baseStore(), 98440, true)
    const original = store.data.payments[0]
    store = reducer(store, { type: 'refundPayment', invoiceId: 'inv-1', paymentId: original.id, amount: 98440, note: 'full refund' })
    // The refund reopened the invoice to posted; net money held is zero.
    const next = reducer(store, { type: 'voidInvoice', invoiceId: 'inv-1' })
    expect(next.data.invoices.find((i) => i.id === 'inv-1')!.status).toBe('void')
  })
})

describe('walkIn (characterisation)', () => {
  it('creates a checked-in slot with defaults for vet and reason', () => {
    const store = baseStore()
    const next = reducer(store, { type: 'walkIn', patientId: 'p-1', reason: '', vetId: '' })
    const appt = next.data.appointments.find((a) => !store.data.appointments.some((s) => s.id === a.id))!
    expect(appt).toMatchObject({ patientId: 'p-1', vetId: adminSession.currentUserId, reason: 'Walk-in', durationMin: 20, status: 'checked_in' })
    expect(next.data.audit[0]).toMatchObject({ action: 'appointment.walk_in' })
  })

  it('ignores walk-ins for unknown patients', () => {
    const store = baseStore()
    const next = reducer(store, { type: 'walkIn', patientId: 'p-404', reason: '', vetId: '' })
    expect(next).toBe(store)
  })
})

const bundle = (token: string, ownerPhone: string): CaseBundle => ({
  format: 'vetcare-case-bundle',
  version: 1,
  token,
  sharedAt: '2026-10-28T08:00:00+07:00',
  fromClinic: { id: 'clinic-02', name: 'Chiang Mai Pet Hospital' },
  owner: { id: 'ox-1', name: 'Sara Long', phone: ownerPhone, version: 1 },
  patient: {
    id: 'px-1',
    name: 'Luna',
    ownerId: 'ox-1',
    mrn: 'PT-2026-0099',
    species: 'Cat',
    sex: 'Female',
    birthDate: '2023-05-01',
    version: 1,
  },
  encounters: [
    {
      id: 'ex-1',
      patientId: 'px-1',
      attendingId: 'u-ext',
      status: 'closed',
      openedAt: '2026-09-01T09:00:00+07:00',
      vitals: { weightKg: '4.2', tempC: '', heartRate: '', respRate: '' },
      notes: [],
      diagnoses: [],
      prescriptions: [],
      version: 1,
    },
  ],
  vaccinations: [],
})

describe('importCaseBundle (characterisation)', () => {
  it('copies the patient with a fresh MRN and stamps origin provenance', () => {
    const next = reducer(baseStore(), { type: 'importCaseBundle', bundle: bundle('tok-wxyz9876abcd', '099 000 1111') })
    const imported = next.data.patients.find((p) => p.name === 'Luna')!
    expect(imported.mrn).not.toBe('PT-2026-0099')
    expect(imported.originClinicId).toBe('clinic-02')
    expect(next.data.encounters.find((e) => e.id !== 'e-1')!.originEncounterId).toBe('ex-1')
    expect(next.data.audit[0]).toMatchObject({ action: 'case.import' })
  })

  it('reuses an existing owner matched by phone', () => {
    // o-2 Somchai Prasert shares the phone below: no second owner row.
    const next = reducer(baseStore(), { type: 'importCaseBundle', bundle: bundle('tok-phone-match01', '089 876 5432') })
    expect(next.data.owners).toHaveLength(seedState.owners.length)
    expect(next.data.patients.find((p) => p.name === 'Luna')!.ownerId).toBe('o-2')
  })

  it('refuses the same share token twice', () => {
    const once = reducer(baseStore(), { type: 'importCaseBundle', bundle: bundle('tok-duplicate001', '099 000 1111') })
    const twice = reducer(once, { type: 'importCaseBundle', bundle: bundle('tok-duplicate001', '099 000 1111') })
    expect(twice.data.patients).toHaveLength(once.data.patients.length)
    expect(twice.data.caseTransfers.filter((t) => t.token === 'tok-duplicate001')).toHaveLength(1)
  })
})

const backupOf = (state: ClinicState) => ({
  format: 'vetcare-clinic-backup' as const,
  version: 1 as const,
  createdAt: '2026-10-28T12:00:00+07:00',
  state,
})

describe('restoreBackup (characterisation)', () => {
  it('refuses restores from roles without data.export', () => {
    const receptionist = { ...initialSession, currentUserId: 'u-nok' }
    const store: Store = { data: structuredClone(seedState), session: receptionist }
    const next = reducer(store, { type: 'restoreBackup', backup: backupOf(structuredClone(seedState)) })
    expect(next).toBe(store)
  })

  it('keeps the signed-in admin when the backup contains them', () => {
    const next = reducer(baseStore(), { type: 'restoreBackup', backup: backupOf(structuredClone(seedState)) })
    expect(next.session.currentUserId).toBe('u-mai')
    expect(next.data.audit[0]).toMatchObject({ action: 'backup.restore' })
  })

  it('falls back to the first active member and locks when they hold a PIN', () => {
    const restored = structuredClone(seedState)
    restored.users = restored.users.filter((u) => u.id !== 'u-mai')
    restored.users[0] = { ...restored.users[0], pinHash: 'h', pinSalt: 's' } // u-nok, reception, PIN set
    const next = reducer(baseStore(), { type: 'restoreBackup', backup: backupOf(restored) })
    expect(next.session.currentUserId).toBe('u-nok')
    expect(next.session.locked).toBe(true)
  })
})

const openEncounterStore = (): Store => {
  const encounter: Encounter = {
    id: 'e-9',
    patientId: 'p-1',
    attendingId: 'u-pim',
    status: 'open',
    openedAt: '2026-10-28T10:05:00+07:00',
    vitals: { weightKg: '', tempC: '', heartRate: '', respRate: '' },
    notes: [],
    diagnoses: [],
    prescriptions: [],
    version: 1,
  }
  return { data: { ...structuredClone(seedState), encounters: [encounter, ...seedState.encounters] }, session: { ...adminSession } }
}

describe('addPrescription (characterisation)', () => {
  it('accepts a prescription that exceeds stock on hand — the floor lives only in the UI', () => {
    // GAP (phase 2): 30 tablets against 24 on hand (lot-2). Today the reducer
    // accepts any quantity and closeEncounter silently under-dispenses
    // (see close-encounter.test.ts). Phase 2 moves the stock floor into the
    // reducer and this test flips to expect a rejection with a reason.
    const next = reducer(openEncounterStore(), {
      type: 'addPrescription',
      encounterId: 'e-9',
      prescription: { productId: 'it-2', medication: 'Amoxicillin 250 mg tablet', dose: '1', route: 'oral', frequency: 'twice daily', duration: '5 days', quantity: 30 },
    })
    expect(next.data.encounters.find((e) => e.id === 'e-9')!.prescriptions).toHaveLength(1)
  })
})
