import { describe, expect, it } from 'vitest'
import { buildWorklist } from '../worklist'
import type { ClinicState, InventoryItem, InventoryLot, Patient, Vaccination } from '../types'

/**
 * The worklist is translation-free by contract: facts carry names, dates and
 * codes, never sentences. Tests therefore assert structure and deduplication.
 */

const TODAY = '2026-10-30'

const patient = (id: string, name: string): Patient => ({
  id,
  name,
  ownerId: 'o-1',
  species: 'Dog',
  breed: 'Mixed',
  sex: 'Male',
  dateOfBirth: '2020-01-01',
  mrnSequence: 1,
  version: 1,
})

const vaccination = (id: string, patientId: string, nextDueAt?: string): Vaccination => ({
  id,
  patientId,
  vaccineName: 'Rabies',
  administeredAt: '2025-10-15T10:20:00+07:00',
  nextDueAt,
  vetId: 'u-pim',
  version: 1,
})

const item = (id: string, reorderLevel: number, unit = 'bottle'): InventoryItem => ({
  id,
  name: `Item ${id}`,
  category: 'medicine',
  unit,
  reorderLevel,
  sellingPrice: 10000,
})

const lot = (id: string, itemId: string, quantity: number, expiryDate: string): InventoryLot => ({
  id,
  itemId,
  lotNumber: `LOT-${id}`,
  quantity,
  expiryDate,
  supplierId: 'sup-1',
  costPerUnit: 5000,
  receivedDate: '2026-10-01',
})

const state = (overrides: Partial<ClinicState>): Pick<ClinicState, 'vaccinations' | 'patients' | 'inventoryItems' | 'inventoryLots'> => ({
  vaccinations: [],
  patients: [],
  inventoryItems: [],
  inventoryLots: [],
  ...overrides,
})

describe('vaccination facts', () => {
  it('lists an overdue vaccination once, as bad — not also as "due soon"', () => {
    // Regression: vaccinationsDue has no lower bound, so the old reminder list
    // showed every overdue vaccination twice.
    const facts = buildWorklist(
      state({
        patients: [patient('p-1', 'Moo Daeng')],
        vaccinations: [vaccination('v-1', 'p-1', '2026-10-15')],
      }),
      TODAY,
    )
    expect(facts).toHaveLength(1)
    expect(facts[0]).toMatchObject({
      kind: 'vaccination-overdue',
      tone: 'bad',
      patientId: 'p-1',
      patientName: 'Moo Daeng',
      dueAt: '2026-10-15',
    })
  })

  it('lists a vaccination due within the window as warn', () => {
    const facts = buildWorklist(
      state({
        patients: [patient('p-2', 'Tiger')],
        vaccinations: [vaccination('v-2', 'p-2', '2026-11-10')],
      }),
      TODAY,
    )
    expect(facts).toMatchObject([{ kind: 'vaccination-due', tone: 'warn', vaccineName: 'Rabies', patientName: 'Tiger' }])
  })

  it('ignores vaccinations beyond the window and those without a due date', () => {
    const facts = buildWorklist(
      state({
        patients: [patient('p-2', 'Tiger')],
        vaccinations: [vaccination('v-2', 'p-2', '2027-06-01'), vaccination('v-3', 'p-2')],
      }),
      TODAY,
    )
    expect(facts).toEqual([])
  })

  it('omits the patient name when the record is missing, leaving the fallback to the view', () => {
    const facts = buildWorklist(state({ vaccinations: [vaccination('v-9', 'p-gone', '2026-10-15')] }), TODAY)
    expect(facts[0]).toMatchObject({ kind: 'vaccination-overdue' })
    expect('patientName' in facts[0] ? facts[0].patientName : undefined).toBeUndefined()
  })
})

describe('inventory facts', () => {
  it('lists low-stock items with the selector rule (no zero-policy items)', () => {
    const facts = buildWorklist(
      state({
        inventoryItems: [item('a', 10), item('b', 5), item('c', 0)],
        inventoryLots: [lot('l1', 'a', 4, '2027-06-30'), lot('l2', 'b', 20, '2027-06-30'), lot('l3', 'c', 0, '2027-06-30')],
      }),
      TODAY,
    )
    expect(facts).toMatchObject([{ kind: 'stock-low', itemId: 'a', onHand: 4, reorderLevel: 10 }])
  })

  it('lists lots expiring within 30 days with the owning item', () => {
    // reorderLevel 0 keeps this lot off the low-stock list, isolating expiry.
    const facts = buildWorklist(
      state({ inventoryItems: [item('a', 0)], inventoryLots: [lot('l1', 'a', 8, '2026-11-12')] }),
      TODAY,
    )
    expect(facts).toMatchObject([{ kind: 'lot-expiring', lotNumber: 'LOT-l1', itemName: 'Item a', quantity: 8 }])
  })
})

describe('ordering', () => {
  it('sorts bad, then warn, then info', () => {
    const facts = buildWorklist(
      state({
        patients: [patient('p-1', 'Moo Daeng'), patient('p-2', 'Tiger')],
        vaccinations: [vaccination('v-1', 'p-1', '2026-10-15'), vaccination('v-2', 'p-2', '2026-11-10')],
        inventoryItems: [item('a', 10)],
        inventoryLots: [lot('l1', 'a', 4, '2026-11-12')],
      }),
      TODAY,
    )
    expect(facts.map((fact) => fact.tone)).toEqual(['bad', 'warn', 'warn', 'info'])
  })
})
