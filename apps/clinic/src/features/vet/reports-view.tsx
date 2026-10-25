import { useMemo, useState } from 'react'
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
import { formatDate, formatMoney, initials, invoiceTotals, stockOnHand, todayKey } from '@/lib/vet/format'
import type { AppointmentStatus, ClinicState } from '@/lib/vet/types'

/* ---------- period helpers ---------- */

const RANGES = [
  { id: 'today', label: 'Today' },
  { id: '7d', label: '7 days' },
  { id: '30d', label: '30 days' },
  { id: 'month', label: 'This month' },
  { id: 'year', label: 'This year' },
  { id: 'all', label: 'All time' },
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

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

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

function reportPeriod(range: ReportRange, now: Date): Period {
  const end = endOfDay(now)
  if (range === 'all') return { start: null, end }
  if (range === 'today') return { start: startOfDay(now), end }
  if (range === 'month') return { start: new Date(now.getFullYear(), now.getMonth(), 1), end }
  if (range === 'year') return { start: new Date(now.getFullYear(), 0, 1), end }
  const start = startOfDay(now)
  start.setDate(start.getDate() - (range === '7d' ? 6 : 29))
  return { start, end }
}

function within(iso: string, period: Period) {
  const time = new Date(iso).getTime()
  if (!Number.isFinite(time)) return false
  if (time > period.end.getTime()) return false
  return !period.start || time >= period.start.getTime()
}

function periodLabel(period: Period) {
  if (!period.start) return `All activity through ${formatDate(period.end.toISOString())}`
  const start = formatDate(period.start.toISOString())
  const end = formatDate(period.end.toISOString())
  return start === end ? start : `${start} – ${end}`
}

/* ---------- report model ---------- */

type BarTone = 'teal' | 'blue' | 'violet' | 'amber' | 'red' | 'muted'

const STATUS_LABELS: Record<AppointmentStatus, string> = {
  booked: 'Booked',
  checked_in: 'Checked in',
  in_consult: 'In consult',
  completed: 'Completed',
  cancelled: 'Cancelled',
  no_show: 'No-show',
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

function addTrendAmount(buckets: Map<string, TrendBucket>, key: string, kind: 'collected' | 'billed', amount: number) {
  const bucket = buckets.get(key)
  if (bucket) bucket[kind] += amount
}

function buildTrend(data: ClinicState, range: ReportRange, period: Period, now: Date) {
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
    caption = 'Hourly · 08:00–19:00'
  } else if (range === 'year') {
    buckets = MONTHS.map((label, index) => ({
      key: `${now.getFullYear()}-${pad(index + 1)}`,
      label,
      collected: 0,
      billed: 0,
      showLabel: true,
    }))
    keyOf = monthKey
    caption = 'Monthly · this year'
  } else if (range === 'all') {
    buckets = Array.from({ length: 12 }, (_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth() - (11 - index), 1)
      return {
        key: monthKey(date),
        label: MONTHS[date.getMonth()],
        collected: 0,
        billed: 0,
        showLabel: true,
      }
    })
    keyOf = monthKey
    caption = 'Monthly · last 12 months'
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
      label: range === '7d' ? WEEKDAYS[date.getDay()] : String(date.getDate()),
      collected: 0,
      billed: 0,
      showLabel:
        range === '7d' || index === 0 || (index + 1) % 5 === 0 || index === days.length - 1,
    }))
    keyOf = dayKey
    caption = range === '7d' ? 'Daily · last 7 days' : 'Daily · selected period'
  }

  const byKey = new Map(buckets.map((bucket) => [bucket.key, bucket]))
  payments.forEach((payment) => addTrendAmount(byKey, keyOf(new Date(payment.receivedAt)), 'collected', payment.amount))
  invoices.forEach((invoice) =>
    addTrendAmount(byKey, keyOf(new Date(invoice.createdAt)), 'billed', invoiceTotals(invoice, data.clinic.vatRate, data.payments).total),
  )

  return { buckets, caption, max: Math.max(0, ...buckets.map((bucket) => Math.max(bucket.collected, bucket.billed))) }
}

function buildReport(data: ClinicState, range: ReportRange) {
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

  const openInvoices = data.invoices.filter((invoice) => invoice.status !== 'paid')
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
    label: STATUS_LABELS[status],
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
  const serviceRows = [...services.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 6)
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
    .map(([id, row]) => ({ id, name: data.users.find((user) => user.id === id)?.name ?? 'Unassigned', ...row }))
    .sort((a, b) => b.revenue - a.revenue || b.visits - a.visits)
  const maxVetRevenue = Math.max(1, ...vetRows.map((row) => row.revenue))

  const stockRows = data.products
    .filter((product) => product.kind !== 'service')
    .map((product) => ({ product, onHand: stockOnHand(product.id, data.stockMovements) }))
    .filter((row) => row.onHand <= row.product.reorderThreshold)
    .sort(
      (a, b) =>
        a.onHand / Math.max(a.product.reorderThreshold, 1) - b.onHand / Math.max(b.product.reorderThreshold, 1),
    )
    .slice(0, 6)

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
  }
}

/* ---------- CSV export ---------- */

const csvCell = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`
const csvMoney = (minor: number) => (minor / 100).toFixed(2)

function exportReport(report: ReturnType<typeof buildReport>, data: ClinicState) {
  const { metrics } = report
  const lines: string[] = [
    csvCell('Vettera clinic report'),
    [csvCell('Clinic'), csvCell(data.clinic.name)].join(','),
    [csvCell('Period'), csvCell(report.periodLabel)].join(','),
    [csvCell('Generated'), csvCell(new Date().toISOString())].join(','),
    '',
    csvCell('Summary'),
    [csvCell('Metric'), csvCell('Value')].join(','),
    [csvCell('Payments collected'), csvCell(csvMoney(metrics.collected))].join(','),
    [csvCell('Billed'), csvCell(csvMoney(metrics.billed))].join(','),
    [csvCell('VAT'), csvCell(csvMoney(metrics.vat))].join(','),
    [csvCell('Outstanding balance'), csvCell(csvMoney(metrics.outstanding))].join(','),
    [csvCell('Visits'), csvCell(metrics.visitCount)].join(','),
    [csvCell('Average per visit'), csvCell(csvMoney(metrics.avgVisit))].join(','),
    [csvCell('Appointment completion (%)'), csvCell(metrics.completionRate)].join(','),
    '',
    csvCell('Revenue trend'),
    [csvCell('Bucket'), csvCell('Collected'), csvCell('Billed')].join(','),
    ...report.trend.buckets.map((bucket) =>
      [csvCell(bucket.label), csvCell(csvMoney(bucket.collected)), csvCell(csvMoney(bucket.billed))].join(','),
    ),
    '',
    csvCell('Appointments by status'),
    [csvCell('Status'), csvCell('Count')].join(','),
    ...report.statusRows.map((row) => [csvCell(row.label), csvCell(row.count)].join(',')),
    '',
    csvCell('Top services'),
    [csvCell('Service'), csvCell('Quantity'), csvCell('Revenue')].join(','),
    ...report.serviceRows.map((row) =>
      [csvCell(row.name), csvCell(row.quantity), csvCell(csvMoney(row.revenue))].join(','),
    ),
    '',
    csvCell('Veterinarian activity'),
    [csvCell('Veterinarian'), csvCell('Visits'), csvCell('Revenue')].join(','),
    ...report.vetRows.map((row) =>
      [csvCell(row.name), csvCell(row.visits), csvCell(csvMoney(row.revenue))].join(','),
    ),
    '',
    csvCell('Inventory attention'),
    [csvCell('Item'), csvCell('On hand'), csvCell('Reorder level'), csvCell('Unit')].join(','),
    ...report.stockRows.map((row) =>
      [csvCell(row.product.name), csvCell(row.onHand), csvCell(row.product.reorderThreshold), csvCell(row.product.unit)].join(','),
    ),
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

export function ReportsView() {
  const { data } = useClinic()
  const [range, setRange] = useState<ReportRange>('30d')
  const report = useMemo(() => buildReport(data, range), [data, range])
  const { metrics } = report

  const metricCards = [
    {
      label: 'Payments collected',
      value: formatMoney(metrics.collected),
      note: `${metrics.paymentCount} payment${metrics.paymentCount === 1 ? '' : 's'}`,
      icon: <CreditCard size={19} />,
      tone: 'teal',
    },
    {
      label: 'Outstanding balance',
      value: formatMoney(metrics.outstanding),
      note: `${metrics.openInvoiceCount} open invoice${metrics.openInvoiceCount === 1 ? '' : 's'}`,
      icon: <Wallet size={19} />,
      tone: 'amber',
    },
    {
      label: 'Visits',
      value: String(metrics.visitCount),
      note: `${metrics.openVisits} open · ${metrics.visitCount - metrics.openVisits} closed`,
      icon: <Stethoscope size={19} />,
      tone: 'violet',
    },
    {
      label: 'Appointment completion',
      value: `${metrics.completionRate}%`,
      note: `${metrics.completedAppointments}/${metrics.totalAppointments} completed · ${metrics.noShows} no-show${metrics.noShows === 1 ? '' : 's'}`,
      icon: <CalendarCheck size={19} />,
      tone: 'blue',
    },
  ]

  return (
    <>
      <PageHeader
        title="Reports"
        description="Revenue, appointments and clinical activity from your local data."
        action={
          <button className="button secondary" onClick={() => exportReport(report, data)}>
            <Download size={15} /> Export CSV
          </button>
        }
      />
      <div className="toolbar report-toolbar">
        <div className="seg" role="group" aria-label="Report period">
          {RANGES.map((option) => (
            <button
              key={option.id}
              className={option.id === range ? 'active' : undefined}
              aria-pressed={option.id === range}
              onClick={() => setRange(option.id)}
            >
              {option.label}
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
        <Panel title="Revenue trend" description={`Collected payments against billed invoices · ${report.trend.caption}`}>
          <div className="trend-legend" aria-hidden>
            <span>
              <i className="teal" /> Collected
            </span>
            <span>
              <i className="blue" /> Billed
            </span>
          </div>
          {report.trend.max === 0 ? (
            <p className="empty-state">No payments or invoices recorded in this period.</p>
          ) : (
            <div className="trend-bars">
              {report.trend.buckets.map((bucket) => (
                <div
                  className="trend-col"
                  key={bucket.key}
                  title={`${bucket.label} · ${formatMoney(bucket.collected)} collected · ${formatMoney(bucket.billed)} billed`}
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
              <small>Billed</small>
              <strong>{formatMoney(metrics.billed)}</strong>
            </div>
            <div>
              <small>VAT</small>
              <strong>{formatMoney(metrics.vat)}</strong>
            </div>
            <div>
              <small>Average per visit</small>
              <strong>{formatMoney(metrics.avgVisit)}</strong>
            </div>
            <div>
              <small>Open invoices</small>
              <strong>{metrics.openInvoiceCount}</strong>
            </div>
          </div>
        </Panel>

        <Panel
          title="Appointments"
          description="Status of appointments scheduled in this period."
          action={<Pill tone="muted">{metrics.totalAppointments} total</Pill>}
        >
          {report.statusRows.length === 0 ? (
            <p className="empty-state">No appointments in this period.</p>
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
            {metrics.completedAppointments} completed · {metrics.noShows} no-show
            {metrics.noShows === 1 ? '' : 's'} · {metrics.completionRate}% completion rate
          </p>
        </Panel>
      </div>

      <div className="report-grid">
        <Panel title="Top services" description="Billed items ranked by revenue in this period.">
          {report.serviceRows.length === 0 ? (
            <p className="empty-state">No posted invoices in this period.</p>
          ) : (
            <div className="bar-list">
              {report.serviceRows.map((row) => (
                <div className="bar-row" key={row.name}>
                  <span className="bar-label" title={row.name}>
                    {row.name}
                    <span>{row.quantity} sold</span>
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

        <Panel title="Veterinarian activity" description="Visits attended and revenue billed in this period.">
          {report.vetRows.length === 0 ? (
            <p className="empty-state">No clinical activity in this period.</p>
          ) : (
            <div className="report-table">
              <div className="report-table-head">
                <span>Veterinarian</span>
                <span>Visits</span>
                <span className="right">Revenue</span>
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
        title="Inventory attention"
        description="Items at or below their reorder level, based on the stock ledger."
        action={
          <Pill tone={report.stockRows.length > 0 ? 'warn' : 'ok'} dot>
            {report.stockRows.length > 0 ? `${report.stockRows.length} to reorder` : 'All healthy'}
          </Pill>
        }
      >
        {report.stockRows.length === 0 ? (
          <p className="empty-state">All items are above their reorder levels.</p>
        ) : (
          <div className="bar-list">
            {report.stockRows.map((row) => (
              <div className="bar-row stock-bar-row" key={row.product.id}>
                <span className="bar-label" title={row.product.name}>
                  {row.product.name}
                  <span>
                    reorder at {row.product.reorderThreshold} {row.product.unit}
                  </span>
                </span>
                <div className="bar-track">
                  <span
                    className={`bar-fill ${row.onHand === 0 ? 'red' : 'amber'}`}
                    style={{
                      width: `${Math.min(100, Math.max(4, (row.onHand / Math.max(row.product.reorderThreshold, 1)) * 100))}%`,
                    }}
                  />
                </div>
                <strong className="bar-value">
                  {row.onHand}
                  <small>{row.product.unit}</small>
                </strong>
              </div>
            ))}
          </div>
        )}
        <p className="report-footnote">
          <AlertTriangle size={12} /> Stock levels are a projection of the append-only movement ledger.
        </p>
      </Panel>

      <div className="report-footer-note">
        <TrendingUp size={14} /> Figures are calculated from local records only — no cloud connection required.
      </div>
    </>
  )
}
