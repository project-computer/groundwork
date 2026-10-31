import { describe, expect, it } from 'vitest'
import { initialSession, reducer, type Store } from '../store'
import { seedState } from '../seed'
import type { Encounter } from '../types'

const adminSession = { ...initialSession, currentUserId: 'u-mai' }

const withOpenEncounter = (prescriptions: Encounter['prescriptions']): Store => ({
  data: {
    ...structuredClone(seedState),
    encounters: [
      {
        id: 'e-9',
        patientId: 'p-1',
        attendingId: 'u-pim',
        status: 'open',
        openedAt: '2026-10-28T10:05:00+07:00',
        vitals: { weightKg: '28.6', tempC: '38.4', heartRate: '88', respRate: '20' },
        notes: [{ id: 'n-9', body: 'Routine check', at: '2026-10-28T10:10:00+07:00', authorId: 'u-pim' }],
        diagnoses: [],
        prescriptions,
        version: 1,
      },
      ...structuredClone(seedState.encounters),
    ],
  },
  session: { ...adminSession },
})

describe('closing an encounter', () => {
  it('dispenses inventory prescriptions first-expiry-first-out and drafts the invoice', () => {
    // lot-2 holds 24 amoxicillin tablets, expiring 2026-11-10.
    const store = withOpenEncounter([
      { id: 'rx-1', productId: 'it-2', medication: 'Amoxicillin 250 mg tablet', dose: '1 tablet', route: 'oral', frequency: 'twice daily', duration: '5 days', quantity: 30, prescriberId: 'u-pim' },
    ])
    const next = reducer(store, { type: 'closeEncounter', encounterId: 'e-9' })

    // 30 tablets from a 24-tablet lot: the lot empties and the shortfall is
    // ignored rather than driving stock negative.
    const lot = next.data.inventoryLots.find((l) => l.id === 'lot-2')!
    expect(lot.quantity).toBe(0)
    const dispensed = next.data.stockMovements.filter((m) => m.reason === 'stock_out' && m.referenceId === 'e-9')
    expect(dispensed).toHaveLength(1)
    expect(dispensed[0]).toMatchObject({ lotId: 'lot-2', delta: -24, referenceId: 'e-9' })

    // The draft carries the consultation line plus the medication at its
    // selling price.
    const draft = next.data.invoices.find((i) => i.status === 'draft')!
    expect(draft.items).toEqual([
      expect.objectContaining({ description: 'Consultation', quantity: 1, unitPrice: 50000 }),
      expect.objectContaining({ description: 'Amoxicillin 250 mg tablet', quantity: 30, unitPrice: 1500, productId: 'it-2' }),
    ])
    expect(draft.ownerId).toBe('o-1')

    // The visit itself is closed and the queue slot completed.
    expect(next.data.encounters.find((e) => e.id === 'e-9')?.status).toBe('closed')
    expect(next.data.audit[0]).toMatchObject({ action: 'encounter.close' })
  })

  it('draws across lots oldest expiry first', () => {
    // A second amoxicillin lot with a later expiry forces FEFO ordering.
    const store = withOpenEncounter([
      { id: 'rx-2', productId: 'it-2', medication: 'Amoxicillin 250 mg tablet', dose: '1 tablet', route: 'oral', frequency: 'once daily', duration: '30 days', quantity: 26, prescriberId: 'u-pim' },
    ])
    store.data.inventoryLots = [
      ...store.data.inventoryLots,
      { id: 'lot-2b', itemId: 'it-2', lotNumber: 'AMX-2701A', quantity: 40, expiryDate: '2027-01-15', supplierId: 'sup-1', costPerUnit: 900, receivedDate: '2026-10-20' },
    ]
    const next = reducer(store, { type: 'closeEncounter', encounterId: 'e-9' })

    const movements = next.data.stockMovements.filter((m) => m.reason === 'stock_out' && m.referenceId === 'e-9')
    expect(movements.map((m) => [m.lotId, m.delta])).toEqual([['lot-2', -24], ['lot-2b', -2]])
    expect(next.data.inventoryLots.find((l) => l.id === 'lot-2b')!.quantity).toBe(38)
  })

  it('bills legacy catalog products from stock movements, not lots', () => {
    const store = withOpenEncounter([
      { id: 'rx-3', productId: 'pr-1', medication: 'Meloxicam 1.5 mg/ml oral 10ml', dose: '2 ml', route: 'oral', frequency: 'once daily', duration: '4 days', quantity: 1, prescriberId: 'u-pim' },
    ])
    const next = reducer(store, { type: 'closeEncounter', encounterId: 'e-9' })

    expect(next.data.stockMovements.some((m) => m.productId === 'pr-1' && m.delta === -1 && m.reason === 'dispense')).toBe(true)
    expect(next.data.invoices.find((i) => i.status === 'draft')!.items).toEqual(
      expect.arrayContaining([expect.objectContaining({ productId: 'pr-1', quantity: 1 })]),
    )
  })
})
