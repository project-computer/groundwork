import type { Appointment, AppointmentStatus } from './types'

/**
 * Scheduling rules shared by the calendar and the store UI.
 *
 * Clinics occasionally double-book on purpose (emergencies, two vets sharing a
 * room), so a clash is surfaced as a warning the user must acknowledge rather
 * than a hard rejection. Only appointments that still occupy the vet's time
 * count as conflicts.
 */

const ACTIVE_STATUSES: AppointmentStatus[] = ['booked', 'checked_in', 'in_consult']

export interface AppointmentSlot {
  vetId: string
  startsAt: string
  durationMin: number
}

const toRange = (slot: AppointmentSlot) => {
  const start = Date.parse(slot.startsAt)
  return { start, end: start + slot.durationMin * 60_000 }
}

/** The first active appointment for the same vet that overlaps the slot. */
export const findAppointmentConflict = (
  appointments: Appointment[],
  slot: AppointmentSlot,
  excludeId?: string,
): Appointment | undefined => {
  const { start, end } = toRange(slot)
  if (Number.isNaN(start)) return undefined
  return appointments.find((appt) => {
    if (appt.id === excludeId || appt.vetId !== slot.vetId) return false
    if (!ACTIVE_STATUSES.includes(appt.status)) return false
    const other = toRange(appt)
    if (Number.isNaN(other.start)) return false
    return start < other.end && other.start < end
  })
}

/** True when the slot starts before `now`; backdated entries stay allowed. */
export const isPastSlot = (slot: AppointmentSlot, now: number = Date.now()): boolean => {
  const { start } = toRange(slot)
  return !Number.isNaN(start) && start < now
}
