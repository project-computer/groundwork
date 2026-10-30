import { lotsExpiringWithin, todayKey, vaccinationsDue } from './format'
import { latestDueByPatient, lowStockItems, vaccinationOverdue } from './selectors'
import type { ClinicState } from './types'

/**
 * Worklist facts (2026-10-29 refactor, phase 3). The notification center used
 * to derive and translate its reminders inside one memo, which forced locale
 * into its dependencies. This selector produces translation-free facts; the
 * view owns every sentence, so a language switch is a plain re-render.
 *
 * Facts are also deduplicated: an overdue vaccination used to be listed twice
 * (once as "overdue", once as "due"), because `vaccinationsDue` has no lower
 * bound. The worklist lists it once, as overdue.
 */

/** Where clicking a fact should take the user. */
export type WorklistTarget = 'records' | 'inventory'

interface WorklistFactBase {
  /** Stable across renders; also the React key. */
  id: string
  tone: 'bad' | 'warn' | 'info'
  target: WorklistTarget
}

export type WorklistFact =
  | (WorklistFactBase & {
      kind: 'vaccination-overdue'
      patientId: string
      /** Absent when the patient record is missing; the view supplies a label. */
      patientName?: string
      dueAt: string
    })
  | (WorklistFactBase & {
      kind: 'vaccination-due'
      vaccinationId: string
      patientId: string
      patientName?: string
      vaccineName: string
      dueAt: string
    })
  | (WorklistFactBase & {
      kind: 'stock-low'
      itemId: string
      itemName: string
      unit: string
      onHand: number
      reorderLevel: number
    })
  | (WorklistFactBase & {
      kind: 'lot-expiring'
      lotId: string
      lotNumber: string
      itemName?: string
      unit?: string
      quantity: number
      expiryDate: string
    })

const TONE_RANK = { bad: 0, warn: 1, info: 2 } as const

/** The text-independent ordering key: names where known, ids otherwise. */
const sortKey = (fact: WorklistFact): string => {
  switch (fact.kind) {
    case 'vaccination-overdue':
    case 'vaccination-due':
      return fact.patientName ?? fact.patientId
    case 'stock-low':
      return fact.itemName
    case 'lot-expiring':
      return fact.itemName ?? fact.lotNumber
  }
}

/** Everything that needs attention, ordered by urgency. */
export const buildWorklist = (
  data: Pick<ClinicState, 'vaccinations' | 'patients' | 'inventoryItems' | 'inventoryLots'>,
  today = todayKey(),
  dueWithinDays = 30,
): WorklistFact[] => {
  const facts: WorklistFact[] = []
  const patientName = (id: string) => data.patients.find((patient) => patient.id === id)?.name

  // Overdue: a patient's latest next-due date in the past.
  for (const [patientId, dueAt] of latestDueByPatient(data.vaccinations)) {
    if (!vaccinationOverdue(dueAt, today)) continue
    facts.push({ id: `vax-overdue-${patientId}`, kind: 'vaccination-overdue', tone: 'bad', target: 'records', patientId, patientName: patientName(patientId), dueAt })
  }

  // Due soon, excluding anything already listed as overdue.
  for (const vaccination of vaccinationsDue(data.vaccinations, dueWithinDays, today)) {
    if (vaccinationOverdue(vaccination.nextDueAt, today)) continue
    facts.push({
      id: `vax-due-${vaccination.id}`,
      kind: 'vaccination-due',
      tone: 'warn',
      target: 'records',
      vaccinationId: vaccination.id,
      patientId: vaccination.patientId,
      patientName: patientName(vaccination.patientId),
      vaccineName: vaccination.vaccineName,
      dueAt: vaccination.nextDueAt!,
    })
  }

  // Low stock shares the selector used by Dashboard, Inventory and Reports.
  for (const { item, onHand } of lowStockItems(data.inventoryItems, data.inventoryLots)) {
    facts.push({ id: `stock-low-${item.id}`, kind: 'stock-low', tone: 'warn', target: 'inventory', itemId: item.id, itemName: item.name, unit: item.unit, onHand, reorderLevel: item.reorderLevel })
  }

  for (const lot of lotsExpiringWithin(data.inventoryLots, 30, today)) {
    const item = data.inventoryItems.find((candidate) => candidate.id === lot.itemId)
    facts.push({
      id: `stock-expiry-${lot.id}`,
      kind: 'lot-expiring',
      tone: 'info',
      target: 'inventory',
      lotId: lot.id,
      lotNumber: lot.lotNumber,
      itemName: item?.name,
      unit: item?.unit,
      quantity: lot.quantity,
      expiryDate: lot.expiryDate!,
    })
  }

  return facts.toSorted((a, b) => TONE_RANK[a.tone] - TONE_RANK[b.tone] || sortKey(a).localeCompare(sortKey(b)))
}
