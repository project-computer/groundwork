import { shiftDays } from './format'
import type { Appointment, AppointmentStatus } from './types'

/**
 * Scheduling rules shared by the calendar and the store UI.
 *
 * Clinics occasionally double-book on purpose (emergencies, two vets sharing a
 * room), so a clash is surfaced as a warning the user must acknowledge rather
 * than a hard rejection. Only appointments that still occupy the vet's time
 * count as conflicts.
 */

const ACTIVE_STATUSES = new Set<AppointmentStatus>(['booked', 'checked_in', 'in_consult'])

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
    if (!ACTIVE_STATUSES.has(appt.status)) return false
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

/* ---------- Calendar slot math (moved out of ScheduleView, phase 3) ---------- */

/** Appointment timestamps share the clinic-offset convention used by seeds and bookings. */
export const CLINIC_TZ_SUFFIX = '+07:00'

export const apptDay = (iso: string): string => iso.slice(0, 10)

const pad = (n: number) => String(n).padStart(2, '0')

/** The seven day-keys (YYYY-MM-DD) of the Monday-start week containing `iso`. */
export const weekDays = (iso: string): string[] => {
  const d = new Date(`${iso}T12:00:00Z`)
  const weekday = d.getUTCDay() // 0 = Sunday
  const monday = shiftDays(iso, weekday === 0 ? -6 : 1 - weekday)
  return Array.from({ length: 7 }, (_, i) => shiftDays(monday, i))
}

export const dayLabel = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })

export const shortDayLabel = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' })

export const monthLabel = (iso: string) =>
  new Date(`${iso.slice(0, 7)}-01T12:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

const HOUR_START = 8
const HOUR_END = 18
/** The rendered day: 08:00 through 18:00 inclusive. */
export const HOURS: number[] = Array.from({ length: HOUR_END - HOUR_START + 1 }, (_, i) => HOUR_START + i)

/** Drag-to-create resolution and the duration used for a plain click on an empty slot. */
const SLOT_SNAP_MIN = 15
export const DEFAULT_SLOT_MIN = 30
/** Latest a slot may start inside an hour, so a single snapped step still fits. */
export const SLOT_LATEST_START_MIN = 60 - SLOT_SNAP_MIN

/** Snaps minutes-past-the-hour to the drag grid, clamped to the hour. */
export const snapMinute = (minute: number): number =>
  Math.min(60, Math.max(0, Math.round(minute / SLOT_SNAP_MIN) * SLOT_SNAP_MIN))

/** Renders minutes-from-midnight (may exceed 59 across hour boundaries) as HH:MM. */
export const minutesLabel = (abs: number): string => `${pad(Math.floor(abs / 60) % 24)}:${pad(abs % 60)}`

/** Active drag-to-create selection in minutes from midnight. */
export interface SlotDraft {
  iso: string
  startAbs: number
  endAbs: number
}

export interface SlotSegment {
  top: number
  height: number
  label: string | null
}

/** Overlap of the active selection with one hour slot, for rendering the ghost. */
export const ghostSegment = (draft: SlotDraft | null, iso: string, hour: number): SlotSegment | null => {
  if (!draft || draft.iso !== iso) return null
  const from = Math.max(draft.startAbs, hour * 60)
  const to = Math.min(draft.endAbs, hour * 60 + 60)
  if (to <= from) return null
  const anchored = draft.startAbs >= hour * 60 && draft.startAbs < hour * 60 + 60
  return {
    top: ((from - hour * 60) / 60) * 100,
    height: ((to - from) / 60) * 100,
    label: anchored ? (draft.endAbs === draft.startAbs ? minutesLabel(draft.startAbs) : `${minutesLabel(draft.startAbs)}–${minutesLabel(draft.endAbs)}`) : null,
  }
}
