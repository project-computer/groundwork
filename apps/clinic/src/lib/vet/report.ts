import { formatDate, invoiceTotals, lotsExpiringWithin, stockValuation } from './format'
import { lowStockItems, openInvoices, outstandingBalance, type LowStockRow } from './selectors'
import type { AppointmentStatus, ClinicState } from './types'

/**
 * Report model (2026-10-29 refactor, phase 3). Pure data derivation for the
 * Reports view: periods, trend buckets, metrics and rankings. Deliberately
 * translation-free — labels leave here as descriptors (bucket label kinds,
 * caption keys, status codes) and the view translates them, so the model no
 * longer depends on the active locale and can be unit-tested directly.
 */

export const REPORT_RANGES = ['today', '7d', '30d', 'month', 'year', 'all'] as const
export type ReportRange = (typeof REPORT_RANGES)[number]

export interface ReportPeriod {
  /** null means "everything up to `end`" (the all-time range). */
  start: Date | null
  end: Date
}

/** How to render a trend bucket's axis label; the view owns the wording. */
export type BucketLabel =
  | { kind: 'hour'; hour: number }
  | { kind: 'month'; month: number }
  | { kind: 'weekday'; weekday: number }
  | { kind: 'day'; day: number }

export interface TrendBucket {
  key: string
  label: BucketLabel
  collected: number
  billed: number
  showLabel: boolean
}

/** Which sentence describes the trend granularity; the view translates it. */
export type TrendCaptionKey = 'hourly' | 'monthly-year' | 'monthly-12m' | 'daily-7d' | 'daily-period'

export interface ReportTrend {
  buckets: TrendBucket[]
  captionKey: TrendCaptionKey
  max: number
}

/** Appointment counts in the order the report lists them. */
export const REPORT_STATUS_ORDER: AppointmentStatus[] = [
  'booked',
  'checked_in',
  'in_consult',
  'completed',
  'cancelled',
  'no_show',
]

export interface ReportStatusRow {
  status: AppointmentStatus
  count: number
}

export interface ReportServiceRow {
  name: string
  quantity: number
  revenue: number
}

export interface ReportVetRow {
  /** User id; the view resolves the name and supplies the unassigned fallback. */
  id: string
  visits: number
  revenue: number
}

export interface ReportMetrics {
  collected: number
  paymentCount: number
  outstanding: number
  openInvoiceCount: number
  visitCount: number
  openVisits: number
  completedAppointments: number
  totalAppointments: number
  noShows: number
  completionRate: number
  billed: number
  vat: number
  avgVisit: number
}

export interface Report {
  range: ReportRange
  period: ReportPeriod
  periodLabel: ReportPeriodLabel
  trend: ReportTrend
  metrics: ReportMetrics
  statusRows: ReportStatusRow[]
  maxStatus: number
  serviceRows: ReportServiceRow[]
  maxService: number
  vetRows: ReportVetRow[]
  maxVetRevenue: number
  stockRows: LowStockRow[]
  /** Inventory value at cost, in minor units. */
  stockValue: number
  expiringLots: ReturnType<typeof lotsExpiringWithin>
}

const pad = (n: number) => String(n).padStart(2, '0')
const dayKey = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
const monthKey = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}`

const startOfDay = (date: Date) => {
  const next = new Date(date)
  next.setHours(0, 0, 0, 0)
  return next
}

const endOfDay = (date: Date) => {
  const next = new Date(date)
  next.setHours(23, 59, 59, 999)
  return next
}

/** The window a range covers, anchored to `now`. */
export const reportPeriod = (range: ReportRange, now: Date): ReportPeriod => {
  const end = endOfDay(now)
  if (range === 'all') return { start: null, end }
  if (range === 'today') return { start: startOfDay(now), end }
  if (range === 'year') return { start: new Date(now.getFullYear(), 0, 1), end }
  if (range === 'month') return { start: new Date(now.getFullYear(), now.getMonth(), 1), end }

  const start = startOfDay(now)
  start.setDate(start.getDate() - (range === '7d' ? 6 : 29))
  return { start, end }
}

const within = (iso: string, period: ReportPeriod) => {
  const time = new Date(iso).getTime()
  if (!Number.isFinite(time)) return false
  if (time > period.end.getTime()) return false
  return !period.start || time >= period.start.getTime()
}

/**
 * The window as dates only — `start` is null for all time, which the view
 * renders as its own "All activity through …" sentence (so that string stays
 * in the translation catalog).
 */
export interface ReportPeriodLabel {
  start: string | null
  end: string
}

export const reportPeriodLabel = (period: ReportPeriod): ReportPeriodLabel => ({
  start: period.start ? formatDate(period.start.toISOString()) : null,
  end: formatDate(period.end.toISOString()),
})

const addTrendAmount = (buckets: Map<string, TrendBucket>, key: string, kind: 'collected' | 'billed', amount: number) => {
  const bucket = buckets.get(key)
  if (bucket) bucket[kind] += amount
}

const buildTrend = (data: ClinicState, range: ReportRange, period: ReportPeriod, now: Date): ReportTrend => {
  const payments = data.payments.filter((p) => within(p.receivedAt, period))
  const invoices = data.invoices.filter((i) => i.status !== 'draft' && within(i.createdAt, period))

  let buckets: TrendBucket[]
  let keyOf: (date: Date) => string
  let captionKey: TrendCaptionKey

  if (range === 'today') {
    buckets = Array.from({ length: 12 }, (_, index) => {
      const hour = index + 8
      return {
        key: String(hour),
        label: { kind: 'hour', hour },
        collected: 0,
        billed: 0,
        showLabel: index % 2 === 0 || index === 11,
      }
    })
    keyOf = (date) => String(date.getHours())
    captionKey = 'hourly'
  } else if (range === 'year') {
    buckets = Array.from({ length: 12 }, (_, index) => ({
      key: `${now.getFullYear()}-${pad(index + 1)}`,
      label: { kind: 'month', month: index },
      collected: 0,
      billed: 0,
      showLabel: true,
    }))
    keyOf = monthKey
    captionKey = 'monthly-year'
  } else if (range === 'all') {
    buckets = Array.from({ length: 12 }, (_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth() - (11 - index), 1)
      return {
        key: monthKey(date),
        label: { kind: 'month', month: date.getMonth() },
        collected: 0,
        billed: 0,
        showLabel: true,
      }
    })
    keyOf = monthKey
    captionKey = 'monthly-12m'
  } else {
    const start = period.start ?? startOfDay(now)
    const days: Date[] = []
    const cursor = new Date(start)
    while (cursor.getTime() <= period.end.getTime() && days.length < 366) {
      days.push(new Date(cursor))
      cursor.setDate(cursor.getDate() + 1)
    }
    buckets = days.map((date, index) => ({
      key: dayKey(date),
      label: range === '7d' ? { kind: 'weekday', weekday: date.getDay() } : { kind: 'day', day: date.getDate() },
      collected: 0,
      billed: 0,
      showLabel: range === '7d' || index === 0 || (index + 1) % 5 === 0 || index === days.length - 1,
    }))
    keyOf = dayKey
    captionKey = range === '7d' ? 'daily-7d' : 'daily-period'
  }

  const byKey = new Map(buckets.map((bucket) => [bucket.key, bucket]))
  payments.forEach((payment) => addTrendAmount(byKey, keyOf(new Date(payment.receivedAt)), 'collected', payment.amount))
  invoices.forEach((invoice) =>
    addTrendAmount(byKey, keyOf(new Date(invoice.createdAt)), 'billed', invoiceTotals(invoice, data.clinic.vatRate, data.payments).total),
  )

  return { buckets, captionKey, max: Math.max(0, ...buckets.map((bucket) => Math.max(bucket.collected, bucket.billed))) }
}

/** Every number the Reports view renders, derived from one document. */
export const buildReport = (data: ClinicState, range: ReportRange, now = new Date()): Report => {
  const period = reportPeriod(range, now)

  const payments = data.payments.filter((payment) => within(payment.receivedAt, period))
  const invoices = data.invoices.filter((invoice) => within(invoice.createdAt, period))
  const postedInvoices = invoices.filter((invoice) => invoice.status !== 'draft')
  const encounters = data.encounters.filter((encounter) => within(encounter.openedAt, period))
  const appointments = data.appointments.filter((appointment) => within(appointment.startsAt, period))
  const totals = postedInvoices.map((invoice) => invoiceTotals(invoice, data.clinic.vatRate, data.payments))

  const collected = payments.reduce((sum, payment) => sum + payment.amount, 0)
  const billed = totals.reduce((sum, total) => sum + total.total, 0)
  const vat = totals.reduce((sum, total) => sum + total.tax, 0)
  const avgVisit = encounters.length ? Math.round(billed / encounters.length) : 0

  const open = openInvoices(data.invoices)
  const outstanding = outstandingBalance(data.invoices, data.clinic.vatRate, payments)

  const completedAppointments = appointments.filter((appointment) => appointment.status === 'completed').length
  const noShows = appointments.filter((appointment) => appointment.status === 'no_show').length
  const completionRate = appointments.length ? Math.round((completedAppointments / appointments.length) * 100) : 0
  const openVisits = encounters.filter((encounter) => encounter.status === 'open').length

  const statusRows = REPORT_STATUS_ORDER.map((status) => ({
    status,
    count: appointments.filter((appointment) => appointment.status === status).length,
  })).filter((row) => row.count > 0)
  const maxStatus = Math.max(1, ...statusRows.map((row) => row.count))

  const services = new Map<string, ReportServiceRow>()
  postedInvoices.forEach((invoice) => {
    invoice.items.forEach((item) => {
      const key = item.productId ?? item.description
      const row = services.get(key) ?? { name: item.description, quantity: 0, revenue: 0 }
      row.quantity += item.quantity
      row.revenue += item.quantity * item.unitPrice
      services.set(key, row)
    })
  })
  const serviceRows = [...services.values()].toSorted((a, b) => b.revenue - a.revenue).slice(0, 6)
  const maxService = Math.max(1, ...serviceRows.map((row) => row.revenue))

  const vets = new Map<string, { visits: number; revenue: number }>()
  encounters.forEach((encounter) => {
    const row = vets.get(encounter.attendingId) ?? { visits: 0, revenue: 0 }
    row.visits += 1
    vets.set(encounter.attendingId, row)
  })
  postedInvoices.forEach((invoice) => {
    const encounter = invoice.encounterId ? data.encounters.find((item) => item.id === invoice.encounterId) : undefined
    if (!encounter) return
    const row = vets.get(encounter.attendingId) ?? { visits: 0, revenue: 0 }
    row.revenue += invoiceTotals(invoice, data.clinic.vatRate, data.payments).total
    vets.set(encounter.attendingId, row)
  })
  const vetRows = [...vets.entries()]
    .map(([id, row]) => ({ id, visits: row.visits, revenue: row.revenue }))
    .toSorted((a, b) => b.revenue - a.revenue || b.visits - a.visits)
  const maxVetRevenue = Math.max(1, ...vetRows.map((row) => row.revenue))

  // The selector owns the "low" rule (reorderLevel > 0 guard); the report
  // re-sorts by severity ratio for display.
  const stockRows = lowStockItems(data.inventoryItems, data.inventoryLots)
    .toSorted((a, b) => a.onHand / Math.max(a.item.reorderLevel, 1) - b.onHand / Math.max(b.item.reorderLevel, 1))
    .slice(0, 6)
  const stockValue = stockValuation(data.inventoryLots)
  const expiringLots = lotsExpiringWithin(data.inventoryLots, 30)

  return {
    range,
    period,
    periodLabel: reportPeriodLabel(period),
    trend: buildTrend(data, range, period, now),
    metrics: {
      collected,
      paymentCount: payments.length,
      outstanding,
      openInvoiceCount: open.length,
      visitCount: encounters.length,
      openVisits,
      completedAppointments,
      totalAppointments: appointments.length,
      noShows,
      completionRate,
      billed,
      vat,
      avgVisit,
    },
    statusRows,
    maxStatus,
    serviceRows,
    maxService,
    vetRows,
    maxVetRevenue,
    stockRows,
    stockValue,
    expiringLots,
  }
}

/* ---------- CSV export helpers (pure) ---------- */

/** Escape one CSV cell — quotes doubled, value always quoted. */
export const csvCell = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`

/** Minor units (cents) → plain decimal string, the CSV money format. */
export const csvMoney = (minor: number) => (minor / 100).toFixed(2)
