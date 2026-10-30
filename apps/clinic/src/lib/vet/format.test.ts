import { describe, expect, it } from 'vitest'
import {
  can,
  compareTime,
  invoiceTotals,
  itemOnHand,
  lotsExpiringWithin,
  permissionsFor,
  statusTone,
  todayKey,
  vaccinationsDue,
} from './format'
import type { Invoice, InventoryLot, Payment, Vaccination } from './types'

const invoice = (items: { quantity: number; unitPrice: number }[]): Invoice => ({
  id: 'inv-x',
  number: 'INV-2026-0001',
  ownerId: 'o-1',
  status: 'posted',
  items: items.map((item, index) => ({ id: `ii-${index}`, description: `Item ${index}`, ...item })),
  createdAt: '2026-10-28T09:00:00+07:00',
  version: 1,
})

const payment = (amount: number, kind?: 'refund'): Payment => ({
  id: `pay-${Math.random()}`,
  invoiceId: 'inv-x',
  amount,
  method: 'cash',
  receivedAt: '2026-10-28T10:00:00+07:00',
  ...(kind ? { kind } : {}),
})

describe('invoiceTotals', () => {
  it('adds VAT on top of the subtotal', () => {
    // 500.00 + 42.00 subtotal, 7% VAT on 542.00 → 542.00 + 37.94.
    const totals = invoiceTotals(invoice([{ quantity: 1, unitPrice: 50000 }, { quantity: 1, unitPrice: 42000 }]), 0.07, [])
    expect(totals.subtotal).toBe(92000)
    expect(totals.tax).toBe(6440)
    expect(totals.total).toBe(98440)
    expect(totals.paid).toBe(0)
    expect(totals.balance).toBe(98440)
  })

  it('nets refunds against payments for the balance', () => {
    const payments = [payment(98440), payment(-20000, 'refund')]
    const totals = invoiceTotals(invoice([{ quantity: 1, unitPrice: 50000 }, { quantity: 1, unitPrice: 42000 }]), 0.07, payments)
    expect(totals.paid).toBe(78440)
    expect(totals.balance).toBe(20000)
  })

  it('ignores payments on other invoices', () => {
    const other = { ...payment(50000), invoiceId: 'inv-other' }
    const totals = invoiceTotals(invoice([{ quantity: 2, unitPrice: 1000 }]), 0, [other])
    expect(totals.paid).toBe(0)
  })
})

describe('compareTime', () => {
  it('orders mixed-offset timestamps chronologically, unlike string order', () => {
    // 09:42+07:00 is 02:42Z — seven hours EARLIER than 08:56Z — but plain
    // string comparison ranks it later. Timestamp sorts must use compareTime.
    const offsetForm = '2026-10-30T09:42:00+07:00'
    const utcForm = '2026-10-30T08:56:00Z'
    expect(offsetForm > utcForm).toBe(true)
    expect(compareTime(utcForm, offsetForm)).toBeGreaterThan(0)
    expect(compareTime(offsetForm, utcForm)).toBeLessThan(0)
  })

  it('treats equivalent instants in different offsets as equal', () => {
    expect(compareTime('2026-10-30T09:42:00+07:00', '2026-10-30T02:42:00Z')).toBe(0)
  })
})

describe('itemOnHand', () => {
  it('sums every lot of the item, including empty lots', () => {
    const lots: InventoryLot[] = [
      { id: 'l1', itemId: 'it-1', lotNumber: 'A', quantity: 12, expiryDate: '2027-01-01', costPerUnit: 100, receivedDate: '2026-01-01' },
      { id: 'l2', itemId: 'it-1', lotNumber: 'B', quantity: 0, expiryDate: '2027-02-01', costPerUnit: 100, receivedDate: '2026-01-01' },
      { id: 'l3', itemId: 'it-2', lotNumber: 'C', quantity: 50, expiryDate: '2027-03-01', costPerUnit: 100, receivedDate: '2026-01-01' },
    ]
    expect(itemOnHand('it-1', lots)).toBe(12)
    expect(itemOnHand('it-2', lots)).toBe(50)
    expect(itemOnHand('missing', lots)).toBe(0)
  })
})

describe('role permissions', () => {
  it('gives reception the front desk but never clinical or staff rights', () => {
    expect(can('reception', 'appointments.write')).toBe(true)
    expect(can('reception', 'billing.write')).toBe(true)
    expect(can('reception', 'clinical.write')).toBe(false)
    expect(can('reception', 'staff.manage')).toBe(false)
  })

  it('lets veterinarians treat but not bill or manage', () => {
    expect(can('veterinarian', 'clinical.write')).toBe(true)
    expect(can('veterinarian', 'billing.write')).toBe(false)
    expect(can('veterinarian', 'data.export')).toBe(false)
  })

  it('lets pharmacists run the pharmacy and pharmacy billing only', () => {
    expect(can('pharmacist', 'inventory.write')).toBe(true)
    expect(can('pharmacist', 'billing.write')).toBe(true)
    expect(can('pharmacist', 'clinical.write')).toBe(false)
    expect(can('pharmacist', 'clinic.manage')).toBe(false)
  })

  it('gives admins everything and a stable permission list', () => {
    for (const permission of permissionsFor('admin')) expect(can('admin', permission)).toBe(true)
    expect(permissionsFor('admin')).toContain('data.export')
    expect(permissionsFor('veterinarian')).not.toContain('staff.manage')
  })
})

describe('statusTone', () => {
  it('maps health, warning and failure states', () => {
    expect(statusTone('paid')).toBe('ok')
    expect(statusTone('completed')).toBe('ok')
    expect(statusTone('booked')).toBe('info')
    expect(statusTone('draft')).toBe('info')
    expect(statusTone('void')).toBe('bad')
    expect(statusTone('no_show')).toBe('bad')
    // Unknown statuses lean toward attention, not invisibility.
    expect(statusTone('mystery')).toBe('warn')
  })
})

describe('due and expiry windows', () => {
  const lots: InventoryLot[] = [
    { id: 'l1', itemId: 'it-1', lotNumber: 'EXPIRED', quantity: 3, expiryDate: '2026-10-01', costPerUnit: 100, receivedDate: '2026-01-01' },
    { id: 'l2', itemId: 'it-1', lotNumber: 'SOON', quantity: 5, expiryDate: '2026-11-10', costPerUnit: 100, receivedDate: '2026-01-01' },
    { id: 'l3', itemId: 'it-1', lotNumber: 'LATER', quantity: 0, expiryDate: '2026-11-15', costPerUnit: 100, receivedDate: '2026-01-01' },
    { id: 'l4', itemId: 'it-1', lotNumber: 'FAR', quantity: 9, expiryDate: '2027-06-01', costPerUnit: 100, receivedDate: '2026-01-01' },
  ]

  it('lists only in-date, in-stock lots that expire inside the window, soonest first', () => {
    const expiring = lotsExpiringWithin(lots, 30, '2026-10-28')
    expect(expiring.map((l) => l.lotNumber)).toEqual(['SOON'])
  })

  it('lists vaccinations due inside the window including overdue ones', () => {
    const vaccinations: Vaccination[] = [
      { id: 'v1', patientId: 'p-1', vaccineName: 'Rabies', nextDueAt: '2026-10-20', vetId: 'u-pim', version: 1 },
      { id: 'v2', patientId: 'p-2', vaccineName: 'FVRCP', nextDueAt: '2026-11-15', vetId: 'u-arun', version: 1 },
      { id: 'v3', patientId: 'p-3', vaccineName: 'Rabies', nextDueAt: '2027-10-20', vetId: 'u-pim', version: 1 },
      { id: 'v4', patientId: 'p-4', vaccineName: 'DHPPi', vetId: 'u-pim', version: 1 },
    ]
    const due = vaccinationsDue(vaccinations, 30, '2026-10-28')
    expect(due.map((v) => v.id)).toEqual(['v1', 'v2'])
  })

  it('keeps the today key in YYYY-MM-DD', () => {
    expect(todayKey(new Date('2026-10-28T23:59:59+07:00'))).toBe('2026-10-28')
  })
})
