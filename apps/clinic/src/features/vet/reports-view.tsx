import { useMemo, useState } from 'react'
import { i18n as globalI18n, type MessageDescriptor } from '@lingui/core'
import { msg } from '@lingui/core/macro'
import { Plural, Trans, useLingui } from '@lingui/react/macro'
import {
  AlertTriangle,
  CalendarCheck,
  CreditCard,
  Download,
  Stethoscope,
  TrendingUp,
  Wallet,
} from 'lucide-react'
import { Panel, PageHeader, Pill } from '@/components/vet/fields'
import { useClinic } from '@/lib/vet/store'
import { formatDate, formatMoney, initials, invoiceTotals, itemOnHand, lotsExpiringWithin, stockValuation, todayKey } from '@/lib/vet/format'
import type { AppointmentStatus, ClinicState } from '@/lib/vet/types'

/* ---------- period helpers ---------- */

const RANGES = [
  { id: 'today', label: msg`Today` },
  { id: '7d', label: msg`7 days` },
  { id: '30d', label: msg`30 days` },
  { id: 'month', label: msg`This month` },
  { id: 'year', label: msg`This year` },
  { id: 'all', label: msg`All time` },
] as const

type ReportRange = (typeof RANGES)[number]['id']

interface Period {
  start: Date | null
  end: Date
}

interface TrendBucket {
  key: string
  label: string
  collected: number
  billed: number
  showLabel: boolean
}

const MONTHS = [msg`Jan`, msg`Feb`, msg`Mar`, msg`Apr`, msg`May`, msg`Jun`, msg`Jul`, msg`Aug`, msg`Sep`, msg`Oct`, msg`Nov`, msg`Dec`]
const WEEKDAYS = [msg`Sun`, msg`Mon`, msg`Tue`, msg`Wed`, msg`Thu`, msg`Fri`, msg`Sat`]

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

const reportPeriod = (range: ReportRange, now: Date): Period => {
  const end = endOfDay(now)
  if (range === 'all') return { start: null, end }
  if (range === 'today') return { start: startOfDay(now), end }
  if (range === 'month') return { start: new Date(now.getFullYear(), now.getMonth(), 1), end }
  if (range === 'year') return { start: new Date(now.getFullYear(), 0, 1), end }
  const start = startOfDay(now)
  start.setDate(start.getDate() - (range === '7d' ? 6 : 29))
  return { start, end }
}

const within = (iso: string, period: Period) => {
  const time = new Date(iso).getTime()
  if (!Number.isFinite(time)) return false
  if (time > period.end.getTime()) return false
  return !period.start || time >= period.start.getTime()
}

const periodLabel = (period: Period) => {
  if (!period.start) return globalI18n._(msg`All activity through ${formatDate(period.end.toISOString())}`)
  const start = formatDate(period.start.toISOString())
  const end = formatDate(period.end.toISOString())
  return start === end ? start : `${start} – ${end}`
}

/* ---------- report model ---------- */

type BarTone = 'teal' | 'blue' | 'violet' | 'amber' | 'red' | 'muted'

const STATUS_LABELS: Record<AppointmentStatus, MessageDescriptor> = {
  booked: msg`Booked`,
  checked_in: msg`Checked in`,
  in_consult: msg`In consult`,
  completed: msg`Completed`,
  cancelled: msg`Cancelled`,
  no_show: msg`No-show`,
}

const STATUS_TONE: Record<AppointmentStatus, BarTone> = {
  booked: 'blue',
  checked_in: 'violet',
  in_consult: 'violet',
  completed: 'teal',
  cancelled: 'amber',
  no_show: 'red',
}

const STATUS_ORDER: AppointmentStatus[] = ['booked', 'checked_in', 'in_consult', 'completed', 'cancelled', 'no_show']

const addTrendAmount = (buckets: Map<string, TrendBucket>, key: string, kind: 'collected' | 'billed', amount: number) => {
  const bucket = buckets.get(key)
  if (bucket) bucket[kind] += amount
}

const buildTrend = (data: ClinicState, range: ReportRange, period: Period, now: Date) => {
  const payments = data.payments.filter((p) => within(p.receivedAt, period))
  const invoices = data.invoices.filter((i) => i.status !== 'draft' && within(i.createdAt, period))

  let buckets: TrendBucket[]
  let keyOf: (date: Date) => string
  let caption: string

  if (range === 'today') {
    buckets = Array.from({ length: 12 }, (_, index) => {
      const hour = index + 8
      return { key: String(hour), label: pad(hour), collected: 0, billed: 0, showLabel: index % 2 === 0 || index === 11 }
    })
    keyOf = (date) => String(date.getHours())
    caption = globalI18n._(msg`Hourly · 08:00–19:00`)
  } else if (range === 'year') {
    buckets = MONTHS.map((label, index) => ({
      key: `${now.getFullYear()}-${pad(index + 1)}`,
      label: globalI18n._(label),
      collected: 0,
      billed: 0,
      showLabel: true,
    }))
    keyOf = monthKey
    caption = globalI18n._(msg`Monthly · this year`)
  } else if (range === 'all') {
    buckets = Array.from({ length: 12 }, (_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth() - (11 - index), 1)
      return {
        key: monthKey(date),
        label: globalI18n._(MONTHS[date.getMonth()]),
        collected: 0,
        billed: 0,
        showLabel: true,
      }
    })
    keyOf = monthKey
    caption = globalI18n._(msg`Monthly · last 12 months`)
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
      label: range === '7d' ? globalI18n._(WEEKDAYS[date.getDay()]) : String(date.getDate()),
      collected: 0,
      billed: 0,
      showLabel:
        range === '7d' || index === 0 || (index + 1) % 5 === 0 || index === days.length - 1,
    }))
    keyOf = dayKey
    caption = range === '7d' ? globalI18n._(msg`Daily · last 7 days`) : globalI18n._(msg`Daily · selected period`)
  }

  const byKey = new Map(buckets.map((bucket) => [bucket.key, bucket]))
  payments.forEach((payment) => addTrendAmount(byKey, keyOf(new Date(payment.receivedAt)), 'collected', payment.amount))
  invoices.forEach((invoice) =>
    addTrendAmount(byKey, keyOf(new Date(invoice.createdAt)), 'billed', invoiceTotals(invoice, data.clinic.vatRate, data.payments).total),
  )

  return { buckets, caption, max: Math.max(0, ...buckets.map((bucket) => Math.max(bucket.collected, bucket.billed))) }
}

const buildReport = (data: ClinicState, range: ReportRange) => {
  const now = new Date()
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

  const openInvoices = data.invoices.filter((invoice) => invoice.status !== 'paid' && invoice.status !== 'void')
  const outstanding = openInvoices.reduce(
    (sum, invoice) => sum + invoiceTotals(invoice, data.clinic.vatRate, data.payments).balance,
    0,
  )

  const completedAppointments = appointments.filter((appointment) => appointment.status === 'completed').length
  const noShows = appointments.filter((appointment) => appointment.status === 'no_show').length
  const completionRate = appointments.length ? Math.round((completedAppointments / appointments.length) * 100) : 0
  const openVisits = encounters.filter((encounter) => encounter.status === 'open').length

  const statusRows = STATUS_ORDER.map((status) => ({
    status,
    label: globalI18n._(STATUS_LABELS[status]),
    tone: STATUS_TONE[status],
    count: appointments.filter((appointment) => appointment.status === status).length,
  })).filter((row) => row.count > 0)
  const maxStatus = Math.max(1, ...statusRows.map((row) => row.count))

  const services = new Map<string, { name: string; quantity: number; revenue: number }>()
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
    .map(([id, row]) => ({ id, name: data.users.find((user) => user.id === id)?.name ?? globalI18n._(msg`Unassigned`), visits: row.visits, revenue: row.revenue }))
    .toSorted((a, b) => b.revenue - a.revenue || b.visits - a.visits)
  const maxVetRevenue = Math.max(1, ...vetRows.map((row) => row.revenue))

  const stockRows = data.inventoryItems
    .map((item) => ({ item, onHand: itemOnHand(item.id, data.inventoryLots) }))
    .filter((row) => row.onHand <= row.item.reorderLevel)
    .toSorted((a, b) => a.onHand / Math.max(a.item.reorderLevel, 1) - b.onHand / Math.max(b.item.reorderLevel, 1))
    .slice(0, 6)
  const stockValue = stockValuation(data.inventoryLots)
  const expiringLots = lotsExpiringWithin(data.inventoryLots, 30)

  return {
    range,
    period,
    periodLabel: periodLabel(period),
    trend: buildTrend(data, range, period, now),
    metrics: {
      collected,
      paymentCount: payments.length,
      outstanding,
      openInvoiceCount: openInvoices.length,
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

/* ---------- CSV export ---------- */

const csvCell = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`
const csvMoney = (minor: number) => (minor / 100).toFixed(2)
const csvLabel = (message: MessageDescriptor) => globalI18n._(message)

const exportReport = (report: ReturnType<typeof buildReport>, data: ClinicState) => {
  const { metrics } = report
  const lines: string[] = [
    csvCell(csvLabel(msg`Vettera clinic report`)),
    [csvCell(csvLabel(msg`Clinic`)), csvCell(data.clinic.name)].join(','),
    [csvCell(csvLabel(msg`Period`)), csvCell(report.periodLabel)].join(','),
    [csvCell(csvLabel(msg`Generated`)), csvCell(new Date().toISOString())].join(','),
    '',
    csvCell(csvLabel(msg`Summary`)),
    [csvCell(csvLabel(msg`Metric`)), csvCell(csvLabel(msg`Value`))].join(','),
    [csvCell(csvLabel(msg`Payments collected`)), csvCell(csvMoney(metrics.collected))].join(','),
    [csvCell(csvLabel(msg`Billed`)), csvCell(csvMoney(metrics.billed))].join(','),
    [csvCell(csvLabel(msg`VAT`)), csvCell(csvMoney(metrics.vat))].join(','),
    [csvCell(csvLabel(msg`Outstanding balance`)), csvCell(csvMoney(metrics.outstanding))].join(','),
    [csvCell(csvLabel(msg`Visits`)), csvCell(metrics.visitCount)].join(','),
    [csvCell(csvLabel(msg`Average per visit`)), csvCell(csvMoney(metrics.avgVisit))].join(','),
    [csvCell(csvLabel(msg`Appointment completion (%)`)), csvCell(metrics.completionRate)].join(','),
    '',
    csvCell(csvLabel(msg`Revenue trend`)),
    [csvCell(csvLabel(msg`Bucket`)), csvCell(csvLabel(msg`Collected`)), csvCell(csvLabel(msg`Billed`))].join(','),
    ...report.trend.buckets.map((bucket) =>
      [csvCell(bucket.label), csvCell(csvMoney(bucket.collected)), csvCell(csvMoney(bucket.billed))].join(','),
    ),
    '',
    csvCell(csvLabel(msg`Appointments by status`)),
    [csvCell(csvLabel(msg`Status`)), csvCell(csvLabel(msg`Count`))].join(','),
    ...report.statusRows.map((row) => [csvCell(row.label), csvCell(row.count)].join(',')),
    '',
    csvCell(csvLabel(msg`Top services`)),
    [csvCell(csvLabel(msg`Service`)), csvCell(csvLabel(msg`Quantity`)), csvCell(csvLabel(msg`Revenue`))].join(','),
    ...report.serviceRows.map((row) =>
      [csvCell(row.name), csvCell(row.quantity), csvCell(csvMoney(row.revenue))].join(','),
    ),
    '',
    csvCell(csvLabel(msg`Veterinarian activity`)),
    [csvCell(csvLabel(msg`Veterinarian`)), csvCell(csvLabel(msg`Visits`)), csvCell(csvLabel(msg`Revenue`))].join(','),
    ...report.vetRows.map((row) =>
      [csvCell(row.name), csvCell(row.visits), csvCell(csvMoney(row.revenue))].join(','),
    ),
    '',
    csvCell(csvLabel(msg`Inventory attention`)),
    [csvCell(csvLabel(msg`Item`)), csvCell(csvLabel(msg`On hand`)), csvCell(csvLabel(msg`Reorder level`)), csvCell(csvLabel(msg`Unit`))].join(','),
    ...report.stockRows.map((row) =>
      [csvCell(row.item.name), csvCell(row.onHand), csvCell(row.item.reorderLevel), csvCell(row.item.unit)].join(','),
    ),
    '',
    csvCell(csvLabel(msg`Stock valuation`)),
    [csvCell(csvLabel(msg`Metric`)), csvCell(csvLabel(msg`Value`))].join(','),
    [csvCell(csvLabel(msg`Inventory value at cost`)), csvCell(csvMoney(report.stockValue))].join(','),
    [csvCell(csvLabel(msg`Lots expiring within 30 days`)), csvCell(report.expiringLots.length)].join(','),
  ]

  const blob = new Blob([`\uFEFF${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `vettera-report-${report.range}-${todayKey()}.csv`
  anchor.click()
  URL.revokeObjectURL(url)
}

/* ---------- view ---------- */

export const ReportsView = () => {
  const { t, i18n } = useLingui()
  const { data } = useClinic()
  const [range, setRange] = useState<ReportRange>('30d')
  // Report labels are translated inside buildReport, so the language change is
  // intentionally a rebuild trigger even though the callback never reads it.
  // oxlint-disable-next-line react-hooks/exhaustive-deps, react/memo-dependencies
  const report = useMemo(() => buildReport(data, range), [data, range, i18n.locale])
  const { metrics } = report

  const metricCards = [
    {
      label: t`Payments collected`,
      value: formatMoney(metrics.collected),
      note: <Plural value={metrics.paymentCount} one="# payment" other="# payments" />,
      icon: <CreditCard size={19} />,
      tone: 'teal',
    },
    {
      label: t`Outstanding balance`,
      value: formatMoney(metrics.outstanding),
      note: <Plural value={metrics.openInvoiceCount} one="# open invoice" other="# open invoices" />,
      icon: <Wallet size={19} />,
      tone: 'amber',
    },
    {
      label: t`Visits`,
      value: String(metrics.visitCount),
      note: <Trans>{metrics.openVisits} open · {metrics.visitCount - metrics.openVisits} closed</Trans>,
      icon: <Stethoscope size={19} />,
      tone: 'violet',
    },
    {
      label: t`Appointment completion`,
      value: `${metrics.completionRate}%`,
      note: (
        <>
          <Trans>{metrics.completedAppointments}/{metrics.totalAppointments} completed ·</Trans>{' '}
          <Plural value={metrics.noShows} one="# no-show" other="# no-shows" />
        </>
      ),
      icon: <CalendarCheck size={19} />,
      tone: 'blue',
    },
  ]

  return (
    <>
      <PageHeader
        title={t`Reports`}
        description={t`Revenue, appointments and clinical activity from your local data.`}
        action={
          <button className="button secondary" onClick={() => exportReport(report, data)}>
            <Download size={15} /> <Trans>Export CSV</Trans>
          </button>
        }
      />
      <div className="toolbar report-toolbar">
        <div className="seg" role="group" aria-label={t`Report period`}>
          {RANGES.map((option) => (
            <button
              key={option.id}
              className={option.id === range ? 'active' : undefined}
              aria-pressed={option.id === range}
              onClick={() => setRange(option.id)}
            >
              {i18n._(option.label)}
            </button>
          ))}
        </div>
        <span className="report-period">{report.periodLabel}</span>
      </div>
      <div className="stat-grid report-stat-grid">
        {metricCards.map((metric) => (
          <div className="stat-card" key={metric.label}>
            <span className={`stat-icon ${metric.tone}`}>{metric.icon}</span>
            <div>
              <small>{metric.label}</small>
              <strong>{metric.value}</strong>
              <span className="stat-note">{metric.note}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="report-grid">
        <Panel title={t`Revenue trend`} description={t`Collected payments against billed invoices · ${report.trend.caption}`}>
          <div className="trend-legend" aria-hidden>
            <span>
              <i className="teal" /> <Trans>Collected</Trans>
            </span>
            <span>
              <i className="blue" /> <Trans>Billed</Trans>
            </span>
          </div>
          {report.trend.max === 0 ? (
            <p className="empty-state"><Trans>No payments or invoices recorded in this period.</Trans></p>
          ) : (
            <div className="trend-bars">
              {report.trend.buckets.map((bucket) => (
                <div
                  className="trend-col"
                  key={bucket.key}
                  title={t`${bucket.label} · ${formatMoney(bucket.collected)} collected · ${formatMoney(bucket.billed)} billed`}
                >
                  <div className="trend-track">
                    <span
                      className="trend-fill teal"
                      style={{ height: `${(bucket.collected / report.trend.max) * 100}%` }}
                    />
                    <span
                      className="trend-fill blue"
                      style={{ height: `${(bucket.billed / report.trend.max) * 100}%` }}
                    />
                  </div>
                  <small>{bucket.showLabel ? bucket.label : ''}</small>
                </div>
              ))}
            </div>
          )}
          <div className="report-summary">
            <div>
              <small><Trans>Billed</Trans></small>
              <strong>{formatMoney(metrics.billed)}</strong>
            </div>
            <div>
              <small><Trans>VAT</Trans></small>
              <strong>{formatMoney(metrics.vat)}</strong>
            </div>
            <div>
              <small><Trans>Average per visit</Trans></small>
              <strong>{formatMoney(metrics.avgVisit)}</strong>
            </div>
            <div>
              <small><Trans>Open invoices</Trans></small>
              <strong>{metrics.openInvoiceCount}</strong>
            </div>
          </div>
        </Panel>

        <Panel
          title={t`Appointments`}
          description={t`Status of appointments scheduled in this period.`}
          action={<Pill tone="muted"><Trans>{metrics.totalAppointments} total</Trans></Pill>}
        >
          {report.statusRows.length === 0 ? (
            <p className="empty-state"><Trans>No appointments in this period.</Trans></p>
          ) : (
            <div className="bar-list">
              {report.statusRows.map((row) => (
                <div className="bar-row" key={row.status}>
                  <span className="bar-label">{row.label}</span>
                  <div className="bar-track">
                    <span
                      className={`bar-fill ${row.tone}`}
                      style={{ width: `${Math.max(4, (row.count / report.maxStatus) * 100)}%` }}
                    />
                  </div>
                  <strong className="bar-value">{row.count}</strong>
                </div>
              ))}
            </div>
          )}
          <p className="report-footnote">
            <Trans>{metrics.completedAppointments} completed ·</Trans>{' '}
            <Plural value={metrics.noShows} one="# no-show" other="# no-shows" />
            <Trans> · {metrics.completionRate}% completion rate</Trans>
          </p>
        </Panel>
      </div>

      <div className="report-grid">
        <Panel title={t`Top services`} description={t`Billed items ranked by revenue in this period.`}>
          {report.serviceRows.length === 0 ? (
            <p className="empty-state"><Trans>No posted invoices in this period.</Trans></p>
          ) : (
            <div className="bar-list">
              {report.serviceRows.map((row) => (
                <div className="bar-row" key={row.name}>
                  <span className="bar-label" title={row.name}>
                    {row.name}
                    <span><Plural value={row.quantity} one="# sold" other="# sold" /></span>
                  </span>
                  <div className="bar-track">
                    <span
                      className="bar-fill teal"
                      style={{ width: `${Math.max(4, (row.revenue / report.maxService) * 100)}%` }}
                    />
                  </div>
                  <strong className="bar-value">{formatMoney(row.revenue)}</strong>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel title={t`Veterinarian activity`} description={t`Visits attended and revenue billed in this period.`}>
          {report.vetRows.length === 0 ? (
            <p className="empty-state"><Trans>No clinical activity in this period.</Trans></p>
          ) : (
            <div className="report-table">
              <div className="report-table-head">
                <span><Trans>Veterinarian</Trans></span>
                <span><Trans>Visits</Trans></span>
                <span className="right"><Trans>Revenue</Trans></span>
              </div>
              {report.vetRows.map((row) => (
                <div className="report-table-row" key={row.id}>
                  <div className="report-vet">
                    <div className="pet-avatar">{initials(row.name)}</div>
                    <strong>{row.name}</strong>
                  </div>
                  <span>{row.visits}</span>
                  <span className="right">
                    {formatMoney(row.revenue)}
                    <span className="vet-share">
                      {Math.round((row.revenue / report.maxVetRevenue) * 100)}%
                    </span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <Panel
        className="report-stock"
        title={t`Inventory attention`}
        description={t`Items at or below their reorder level, from live lot quantities.`}
        action={
          <Pill tone={report.stockRows.length > 0 ? 'warn' : 'ok'} dot>
            {report.stockRows.length > 0 ? <Plural value={report.stockRows.length} one="# to reorder" other="# to reorder" /> : <Trans>All healthy</Trans>}
          </Pill>
        }
      >
        {report.stockRows.length === 0 ? (
          <p className="empty-state"><Trans>All items are above their reorder levels.</Trans></p>
        ) : (
          <div className="bar-list">
            {report.stockRows.map((row) => (
              <div className="bar-row stock-bar-row" key={row.item.id}>
                <span className="bar-label" title={row.item.name}>
                  {row.item.name}
                  <span>
                    <Trans>reorder at {row.item.reorderLevel} {row.item.unit}</Trans>
                  </span>
                </span>
                <div className="bar-track">
                  <span
                    className={`bar-fill ${row.onHand === 0 ? 'red' : 'amber'}`}
                    style={{
                      width: `${Math.min(100, Math.max(4, (row.onHand / Math.max(row.item.reorderLevel, 1)) * 100))}%`,
                    }}
                  />
                </div>
                <strong className="bar-value">
                  {row.onHand}
                  <small>{row.item.unit}</small>
                </strong>
              </div>
            ))}
          </div>
        )}
        <div className="report-summary">
          <div>
            <small><Trans>Stock value at cost</Trans></small>
            <strong>{formatMoney(report.stockValue)}</strong>
          </div>
          <div>
            <small><Trans>Lots expiring ≤ 30 days</Trans></small>
            <strong>{report.expiringLots.length}</strong>
          </div>
        </div>
        <p className="report-footnote">
          <AlertTriangle size={12} /> <Trans>Stock levels are a projection of the append-only movement ledger.</Trans>
        </p>
      </Panel>

      <div className="report-footer-note">
        <TrendingUp size={14} /> <Trans>Figures are calculated from local records only — no cloud connection required.</Trans>
      </div>
    </>
  )
}
