import { i18n as globalI18n, type MessageDescriptor } from '@lingui/core'
import { msg } from '@lingui/core/macro'
import type { AppointmentStatus, ClinicState } from '@/lib/vet/types'
import type { BucketLabel, ReportPeriodLabel, TrendCaptionKey } from '@/lib/vet/report'

/**
 * Report labels (2026-10-30 plan, phase C): every translation the Reports
 * view and its CSV export render — the report model itself stays
 * translation-free, so a language switch re-renders without rebuilding.
 * Moved verbatim from the Reports view.
 */

export const RANGES = [
  { id: 'today', label: msg`Today` },
  { id: '7d', label: msg`7 days` },
  { id: '30d', label: msg`30 days` },
  { id: 'month', label: msg`This month` },
  { id: 'year', label: msg`This year` },
  { id: 'all', label: msg`All time` },
] as const

type BarTone = 'teal' | 'blue' | 'violet' | 'amber' | 'red' | 'muted'

const MONTHS = [msg`Jan`, msg`Feb`, msg`Mar`, msg`Apr`, msg`May`, msg`Jun`, msg`Jul`, msg`Aug`, msg`Sep`, msg`Oct`, msg`Nov`, msg`Dec`]
const WEEKDAYS = [msg`Sun`, msg`Mon`, msg`Tue`, msg`Wed`, msg`Thu`, msg`Fri`, msg`Sat`]

export const STATUS_LABELS: Record<AppointmentStatus, MessageDescriptor> = {
  booked: msg`Booked`,
  checked_in: msg`Checked in`,
  in_consult: msg`In consult`,
  completed: msg`Completed`,
  cancelled: msg`Cancelled`,
  no_show: msg`No-show`,
}

export const STATUS_TONE: Record<AppointmentStatus, BarTone> = {
  booked: 'blue',
  checked_in: 'violet',
  in_consult: 'violet',
  completed: 'teal',
  cancelled: 'muted',
  no_show: 'red',
}

export const TREND_CAPTIONS: Record<TrendCaptionKey, MessageDescriptor> = {
  hourly: msg`Hourly · 08:00–19:00`,
  'monthly-year': msg`Monthly · this year`,
  'monthly-12m': msg`Monthly · last 12 months`,
  'daily-7d': msg`Daily · last 7 days`,
  'daily-period': msg`Daily · selected period`,
}

export const bucketLabel = (label: BucketLabel): string => {
  switch (label.kind) {
    case 'hour':
      return String(label.hour).padStart(2, '0')
    case 'month':
      return globalI18n._(MONTHS[label.month])
    case 'weekday':
      return globalI18n._(WEEKDAYS[label.weekday])
    case 'day':
      return String(label.day)
  }
}

export const formatPeriodLabel = (label: ReportPeriodLabel): string => {
  if (label.start === null) return globalI18n._(msg`All activity through ${label.end}`)
  return label.start === label.end ? label.start : `${label.start} – ${label.end}`
}

export const vetName = (data: ClinicState, id: string): string =>
  data.users.find((user) => user.id === id)?.name ?? globalI18n._(msg`Unassigned`)
