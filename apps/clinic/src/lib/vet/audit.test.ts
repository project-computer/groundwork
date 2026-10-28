import { describe, expect, it } from 'vitest'
import { initialSession, reducer, type Store } from './store'
import { seedState } from './seed'

const adminSession = { ...initialSession, currentUserId: 'u-mai' }

const start = (): Store => ({ data: structuredClone(seedState), session: { ...adminSession } })

describe('audit trail coverage', () => {
  it('records exactly one audit event for every committed mutation', () => {
    const cases: { action: Parameters<typeof reducer>[1]; expectedAction: string }[] = [
      {
        action: {
          type: 'registerOwner',
          owner: { name: 'Nim Saravut', phone: '089 111 2200', email: 'nim@example.com' },
          patient: { name: 'Som Tam', species: 'Cat', breed: 'Siamese', sex: 'Female', birthDate: '2024-02-10', allergies: [], medicalAlerts: [] },
        },
        expectedAction: 'owner.create',
      },
      {
        action: {
          type: 'bookAppointment',
          appointment: { patientId: 'p-1', vetId: 'u-arun', startsAt: '2031-05-04T09:00:00+07:00', durationMin: 30, reason: 'Annual checkup' },
        },
        expectedAction: 'appointment.book',
      },
      { action: { type: 'updateOwner', id: 'o-1', patch: { phone: '081 999 8800' } }, expectedAction: 'owner.update' },
      { action: { type: 'updateClinic', patch: { name: 'Baan Sathorn Vet' } }, expectedAction: 'clinic.update' },
      { action: { type: 'addStaff', name: 'Ploy Wongsri', role: 'reception' }, expectedAction: 'staff.create' },
      { action: { type: 'recordPayment', payment: { invoiceId: 'inv-1', amount: 98440, method: 'cash' }, settles: true }, expectedAction: 'payment.record' },
      { action: { type: 'addSupplier', supplier: { name: 'Vet Supply Co' } }, expectedAction: 'supplier.create' },
      { action: { type: 'recordStockMovement', lotId: 'lot-2', delta: -2, reason: 'waste' }, expectedAction: 'stock.waste' },
    ]

    for (const { action, expectedAction } of cases) {
      const store = start()
      const before = store.data.audit.length
      const next = reducer(store, action)
      expect(next.data.audit.length, `${expectedAction} should add an audit event`).toBe(before + 1)
      const entry = next.data.audit[0]
      expect(entry.actorId).toBe('u-mai')
      expect(entry.action).toBe(expectedAction)
      expect(entry.summary.trim().length).toBeGreaterThan(0)
      expect(entry.occurredAt).toBeTruthy()
      // Business mutations queue a sync change alongside the audit event.
      expect(next.data.outbox.length).toBe(store.data.outbox.length + 1)
    }
  })

  it('never records an audit event for a refused mutation', () => {
    // A receptionist cannot change clinic identity…
    const reception = { ...initialSession, currentUserId: 'u-nok' }
    const receptionStore = { data: structuredClone(seedState), session: reception }
    const denied = reducer(receptionStore, { type: 'updateClinic', patch: { name: 'Nope' } })
    expect(denied.data).toBe(receptionStore.data)

    // …and a pharmacist cannot manage staff.
    const pharmacist = { ...initialSession, currentUserId: 'u-beer' }
    const pharmacistStore = { data: structuredClone(seedState), session: pharmacist }
    const deniedStaff = reducer(pharmacistStore, { type: 'addStaff', name: 'Nope', role: 'admin' })
    expect(deniedStaff.data).toBe(pharmacistStore.data)

    // A missing payment cannot be refunded either.
    const store = start()
    const deniedRefund = reducer(store, { type: 'refundPayment', invoiceId: 'inv-1', paymentId: 'nope', amount: 100, note: 'x' })
    expect(deniedRefund.data).toBe(store.data)
  })

  it('keeps the audit trail append-only — entries are never edited in place', () => {
    const store = start()
    const withPayment = reducer(store, { type: 'recordPayment', payment: { invoiceId: 'inv-1', amount: 98440, method: 'cash' }, settles: true })
    const withRefund = reducer(withPayment, { type: 'refundPayment', invoiceId: 'inv-1', paymentId: withPayment.data.payments.at(-1)!.id, amount: 20000, note: 'Wrong item' })

    expect(withRefund.data.audit.map((a) => a.action).slice(0, 2)).toEqual(['payment.refund', 'payment.record'])
    // The original audit entries are untouched objects.
    expect(withRefund.data.audit[1]).toBe(withPayment.data.audit[0])
    expect(withRefund.data.audit[2]).toBe(store.data.audit[0])
  })
})
