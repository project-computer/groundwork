import { compareTime, invoiceTotals, itemOnHand, todayKey } from './format'
import type { Encounter, InventoryItem, InventoryLot, Invoice, Payment, Vaccination } from './types'

/**
 * Read-model selectors (2026-10-29 refactor, phase 3). Pure state → derived
 * facts with one home each — outstanding balance, low stock, overdue
 * vaccinations. Every surface (Dashboard, Billing, Reports, notification
 * worklist) consumes these instead of recomputing the rules inline.
 *
 * Date keys are YYYY-MM-DD strings compared as keys — that is safe; only
 * full ISO timestamps need compareTime (see format.ts).
 */

/** Invoices that still need money or action: not paid, not void. */
export const openInvoices = (invoices: Invoice[]): Invoice[] => invoices.filter((i) => i.status !== 'paid' && i.status !== 'void')

/** Money still owed across every open invoice, in minor units. */
export const outstandingBalance = (invoices: Invoice[], vatRate: number, payments: Payment[]): number =>
  openInvoices(invoices).reduce((sum, invoice) => sum + invoiceTotals(invoice, vatRate, payments).balance, 0)

export interface LowStockRow {
  item: InventoryItem
  onHand: number
}

/**
 * Items at or below their reorder level, most critical first. Items with
 * `reorderLevel === 0` have no reorder policy and are never low — the one
 * semantics for Dashboard, Inventory and Reports alike.
 */
export const lowStockItems = (items: InventoryItem[], lots: InventoryLot[]): LowStockRow[] =>
  items
    .filter((item) => item.reorderLevel > 0)
    .map((item) => ({ item, onHand: itemOnHand(item.id, lots) }))
    .filter(({ item, onHand }) => onHand <= item.reorderLevel)
    .toSorted((a, b) => a.onHand - b.onHand)

/** Date-key of a Vaccination's next-due field, which may be a YYYY-MM-DD key
 * or a full timestamp — both truncate to their calendar date. */
const dueKey = (nextDueAt: string): string => nextDueAt.slice(0, 10)

/** True when a Vaccination's next-due date has passed. */
export const vaccinationOverdue = (nextDueAt: string | undefined, today = todayKey()): boolean =>
  !!nextDueAt && dueKey(nextDueAt) < today

/** Vaccinations whose next-due date has passed. */
export const overdueVaccinations = (vaccinations: Vaccination[], today = todayKey()): Vaccination[] =>
  vaccinations.filter((v) => vaccinationOverdue(v.nextDueAt, today))

export interface WeightObservation {
  valueKg: string
  recordedAt: string
}

/**
 * Latest recorded vital weight for a patient (ADR 0022): the clinical weight
 * record is the Visit's vitals entry — the patient-level `weightKg` field is
 * only the owner-reported baseline. Ordered by encounter time (close time
 * when closed, otherwise open). Null before the first recorded weight.
 */
export const latestWeightKg = (patientId: string, encounters: Encounter[]): WeightObservation | null => {
  let latest: WeightObservation | null = null
  for (const encounter of encounters) {
    if (encounter.patientId !== patientId || !encounter.vitals.weightKg) continue
    const recordedAt = encounter.closedAt ?? encounter.openedAt
    if (!latest || compareTime(recordedAt, latest.recordedAt) > 0) {
      latest = { valueKg: encounter.vitals.weightKg, recordedAt }
    }
  }
  return latest
}

/** Latest next-due date per patient — a patient is overdue when their most
 * recent schedule is in the past. Drives the reminder worklist. */
export const latestDueByPatient = (vaccinations: Vaccination[]): Map<string, string> => {
  const latest = new Map<string, string>()
  for (const v of vaccinations) {
    if (!v.nextDueAt) continue
    const key = dueKey(v.nextDueAt)
    const current = latest.get(v.patientId)
    if (!current || key > current) latest.set(v.patientId, key)
  }
  return latest
}

/** All recorded weight observations for a patient, oldest first (ADR 0022):
 * the measurement history behind the latest-weight read-out. */
export const weightHistory = (patientId: string, encounters: Encounter[]): WeightObservation[] => {
  const history: WeightObservation[] = []
  for (const encounter of encounters) {
    if (encounter.patientId !== patientId || !encounter.vitals.weightKg) continue
    const recordedAt = encounter.closedAt ?? encounter.openedAt
    history.push({ valueKg: encounter.vitals.weightKg, recordedAt })
  }
  return history.toSorted((a, b) => compareTime(a.recordedAt, b.recordedAt))
}
