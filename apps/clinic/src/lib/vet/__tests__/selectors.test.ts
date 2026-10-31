import { describe, expect, it } from 'vitest'
import { lowStockItems, openInvoices, outstandingBalance, overdueVaccinations } from '../selectors'
import type { InventoryItem, InventoryLot, Invoice, Payment, Vaccination } from '../types'

const item = (id: string, reorderLevel: number): InventoryItem => ({
  id,
  name: `Item ${id}`,
  category: 'medicine',
  unit: 'bottle',
  reorderLevel,
  sellingPrice: 10000,
})

const lot = (id: string, itemId: string, quantity: number): InventoryLot => ({
  id,
  itemId,
  lotNumber: `LOT-${id}`,
  quantity,
  expiryDate: '2027-06-30',
  supplierId: 'sup-1',
  costPerUnit: 5000,
  receivedDate: '2026-10-01',
})

describe('lowStockItems', () => {
  it('flags items at or below their reorder level, most critical first', () => {
    const rows = lowStockItems([item('a', 10), item('b', 5), item('c', 20)], [lot('l1', 'a', 10), lot('l2', 'b', 5), lot('l3', 'c', 19)])
    expect(rows.map((r) => r.item.id)).toEqual(['b', 'a', 'c'])
  })

  it('never flags items without a reorder policy', () => {
    // The one-semantics fix: reorderLevel 0 means "no policy", not "always low"
    // — Inventory and Reports used to disagree on exactly this.
    const rows = lowStockItems([item('a', 0)], [lot('l1', 'a', 0)])
    expect(rows).toEqual([])
  })

  it('sums on-hand across lots', () => {
    const rows = lowStockItems([item('a', 12)], [lot('l1', 'a', 5), lot('l2', 'a', 5)])
    expect(rows).toHaveLength(1)
    expect(rows[0].onHand).toBe(10)
  })
})

const invoice = (id: string, subtotal: number, status: Invoice['status']): Invoice => ({
  id,
  number: `INV-${id}`,
  ownerId: 'o-1',
  status,
  items: [{ id: `ii-${id}`, description: 'Consult', quantity: 1, unitPrice: subtotal }],
  createdAt: '2026-10-28T09:00:00+07:00',
  version: 1,
})

describe('outstandingBalance', () => {

  it('sums open-invoice balances, net of payments, ignoring paid and void', () => {
    const invoices = [invoice('a', 100000, 'posted'), invoice('b', 50000, 'draft'), invoice('c', 70000, 'paid'), invoice('d', 30000, 'void')]
    const payments: Payment[] = [{ id: 'p1', invoiceId: 'a', amount: 40000, method: 'cash', receivedAt: '2026-10-28T10:00:00+07:00' }]
    // a: 107000 (VAT) - 40000 = 67000; b: 53500.
    expect(outstandingBalance(invoices, 0.07, payments)).toBe(67000 + 53500)
  })
})

const vaccination = (id: string, nextDueAt?: string): Vaccination => ({
  id,
  patientId: 'p-1',
  vaccineName: 'Rabies',
  administeredAt: '2025-10-15T10:20:00+07:00',
  nextDueAt,
  vetId: 'u-pim',
  version: 1,
})

describe('overdueVaccinations', () => {

  it('returns only vaccinations with a past due date', () => {
    const rows = overdueVaccinations([vaccination('a', '2026-01-01'), vaccination('b', '2027-01-01'), vaccination('c')], '2026-10-28')
    expect(rows.map((v) => v.id)).toEqual(['a'])
  })
})

describe('openInvoices', () => {
  it('excludes paid and void invoices', () => {
    expect(openInvoices([invoice('draft', 0, 'draft'), invoice('posted', 0, 'posted'), invoice('paid', 0, 'paid'), invoice('void', 0, 'void')]).map((i) => i.id)).toEqual(['draft', 'posted'])
  })
})
