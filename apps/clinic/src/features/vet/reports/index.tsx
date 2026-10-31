import { useMemo, useState } from 'react'
import { i18n as globalI18n } from '@lingui/core'
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
import { StatCard } from '@/components/patterns/data-table'
import { Panel, PageHeader, Pill } from '@/components/patterns/fields'
import { useClinic } from '@/lib/vet/store'
import { formatMoney, initials } from '@/lib/vet/format'
import { buildReport, type ReportRange } from '@/lib/vet/report'
import { exportReport } from './export-csv'
import { bucketLabel, formatPeriodLabel, RANGES, STATUS_LABELS, STATUS_TONE, TREND_CAPTIONS, vetName } from './labels'

/* ---------- view ---------- */

/* Chart fill tones; every class spelled out so Tailwind's scanner sees it. */
const BAR_TONE = {
  teal: 'bg-[var(--teal)]',
  blue: 'bg-[var(--blue)]',
  violet: 'bg-[var(--violet)]',
  amber: 'bg-[var(--amber)]',
  red: 'bg-destructive',
  muted: 'bg-[var(--ink-muted)]',
} as const

/* Shared bar-chart layout (status, services and stock). ≤600px reflows to a
   two-row grid via named areas. The `.report-toolbar` hook class is kept
   because the ≤600px `.report-toolbar .seg` grid lives in records.css and
   `.seg`'s unlayered `display` would beat a utility override. */
const BAR_ROW =
  "grid grid-cols-[minmax(96px,1.1fr)_2fr_auto] items-center gap-2.5 max-[600px]:[grid-template-areas:'label_value'_'track_track'] max-[600px]:grid-cols-[minmax(0,1fr)_auto] max-[600px]:gap-[7px_8px]"
const BAR_LABEL =
  'min-w-0 truncate text-[11px] text-[var(--ink)] max-[600px]:[grid-area:label] max-[600px]:overflow-visible max-[600px]:whitespace-normal max-[600px]:[text-overflow:clip]'
const BAR_LABEL_NOTE = 'mt-0.5 block text-[9px] text-[var(--ink-muted)]'
const BAR_FILL = 'block h-full min-w-[2px] rounded-full'
const BAR_TRACK = 'h-[7px] overflow-hidden rounded-full bg-[var(--row-border)] max-[600px]:[grid-area:track]'
const BAR_VALUE =
  'min-w-[54px] text-right text-[11px] tabular-nums max-[600px]:[grid-area:value] max-[600px]:min-w-0'
const BAR_VALUE_NOTE = 'block text-[9px] font-normal text-[var(--ink-muted)]'
const TREND_FILL =
  'w-[46%] max-w-[10px] rounded-t-[3px] group-hover:brightness-[0.92] max-[600px]:w-[52%] max-[600px]:max-w-[7px]'
const SUMMARY =
  'mt-3.5 flex flex-wrap gap-x-6 gap-y-2 border-t border-[var(--line)] pt-3.5 max-[600px]:grid max-[600px]:grid-cols-2 max-[600px]:gap-x-4 max-[600px]:gap-y-3'
const SUMMARY_ITEM = 'flex flex-col gap-0.5'
const SUMMARY_LABEL = 'text-[10px] text-[var(--ink-muted)]'
const SUMMARY_VALUE = 'text-[13px]'

export const ReportsView = () => {
  const { t, i18n } = useLingui()
  const { data } = useClinic()
  const [range, setRange] = useState<ReportRange>('30d')
  // The model is translation-free; labels translate at render time, so a
  // language switch re-renders without rebuilding the report.
  const report = useMemo(() => buildReport(data, range), [data, range])
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
  ] as const

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
      {/* report-toolbar: responsive hook consumed by records.css (seg phone grid). */}
      <div className="toolbar report-toolbar items-center justify-between max-[600px]:flex-col max-[600px]:items-start">
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
        <span className="text-[11px] text-[var(--ink-muted)]">{formatPeriodLabel(report.periodLabel)}</span>
      </div>
      <div className="stat-grid report-stat-grid">
        {metricCards.map((metric) => (
          <StatCard
            key={metric.label}
            label={metric.label}
            value={metric.value}
            note={metric.note}
            icon={metric.icon}
            tone={metric.tone}
          />
        ))}
      </div>

      <div className="grid grid-cols-[1.55fr_1fr] gap-[18px] [&>*]:min-w-0 max-[900px]:grid-cols-1">
        <Panel title={t`Revenue trend`} description={t`Collected payments against billed invoices · ${globalI18n._(TREND_CAPTIONS[report.trend.captionKey])}`}>
          <div className="mb-2.5 flex justify-end gap-3.5 text-[10px] text-[var(--ink-muted)]" aria-hidden>
            <span className="inline-flex items-center gap-[5px]">
              <i className={`inline-block h-[7px] w-[7px] rounded-[2px] ${BAR_TONE.teal}`} /> <Trans>Collected</Trans>
            </span>
            <span className="inline-flex items-center gap-[5px]">
              <i className={`inline-block h-[7px] w-[7px] rounded-[2px] ${BAR_TONE.blue}`} /> <Trans>Billed</Trans>
            </span>
          </div>
          {report.trend.max === 0 ? (
            <p className="empty-state"><Trans>No payments or invoices recorded in this period.</Trans></p>
          ) : (
            <div className="flex items-end gap-1 overflow-x-auto pb-0.5 max-[600px]:gap-px">
              {report.trend.buckets.map((bucket) => (
                <div
                  className="group flex min-w-[14px] flex-1 basis-0 flex-col items-center gap-1.5 max-[600px]:min-w-0"
                  key={bucket.key}
                  title={t`${bucketLabel(bucket.label)} · ${formatMoney(bucket.collected)} collected · ${formatMoney(bucket.billed)} billed`}
                >
                  <div className="flex h-[140px] w-full items-end justify-center gap-0.5 border-b border-[var(--line)]">
                    <span
                      className={`${TREND_FILL} ${BAR_TONE.teal}`}
                      style={{ height: `${(bucket.collected / report.trend.max) * 100}%` }}
                    />
                    <span
                      className={`${TREND_FILL} ${BAR_TONE.blue}`}
                      style={{ height: `${(bucket.billed / report.trend.max) * 100}%` }}
                    />
                  </div>
                  <small className="whitespace-nowrap text-[9px] text-[var(--ink-muted)] max-[600px]:text-[8px]">
                    {bucket.showLabel ? bucketLabel(bucket.label) : ''}
                  </small>
                </div>
              ))}
            </div>
          )}
          <div className={SUMMARY}>
            <div className={SUMMARY_ITEM}>
              <small className={SUMMARY_LABEL}><Trans>Billed</Trans></small>
              <strong className={SUMMARY_VALUE}>{formatMoney(metrics.billed)}</strong>
            </div>
            <div className={SUMMARY_ITEM}>
              <small className={SUMMARY_LABEL}><Trans>VAT</Trans></small>
              <strong className={SUMMARY_VALUE}>{formatMoney(metrics.vat)}</strong>
            </div>
            <div className={SUMMARY_ITEM}>
              <small className={SUMMARY_LABEL}><Trans>Average per visit</Trans></small>
              <strong className={SUMMARY_VALUE}>{formatMoney(metrics.avgVisit)}</strong>
            </div>
            <div className={SUMMARY_ITEM}>
              <small className={SUMMARY_LABEL}><Trans>Open invoices</Trans></small>
              <strong className={SUMMARY_VALUE}>{metrics.openInvoiceCount}</strong>
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
            <div className="flex flex-col gap-3">
              {report.statusRows.map((row) => (
                <div className={BAR_ROW} key={row.status}>
                  <span className={BAR_LABEL}>{i18n._(STATUS_LABELS[row.status])}</span>
                  <div className={BAR_TRACK}>
                    <span
                      className={`${BAR_FILL} ${BAR_TONE[STATUS_TONE[row.status]]}`}
                      style={{ width: `${Math.max(4, (row.count / report.maxStatus) * 100)}%` }}
                    />
                  </div>
                  <strong className={BAR_VALUE}>{row.count}</strong>
                </div>
              ))}
            </div>
          )}
          <p className="mt-3.5 flex items-center gap-[5px] text-[10px] text-[var(--ink-muted)]">
            <Trans>{metrics.completedAppointments} completed ·</Trans>{' '}
            <Plural value={metrics.noShows} one="# no-show" other="# no-shows" />
            <Trans> · {metrics.completionRate}% completion rate</Trans>
          </p>
        </Panel>
      </div>

      <div className="grid grid-cols-[1.55fr_1fr] gap-[18px] [&>*]:min-w-0 max-[900px]:grid-cols-1">
        <Panel title={t`Top services`} description={t`Billed items ranked by revenue in this period.`}>
          {report.serviceRows.length === 0 ? (
            <p className="empty-state"><Trans>No posted invoices in this period.</Trans></p>
          ) : (
            <div className="flex flex-col gap-3">
              {report.serviceRows.map((row) => (
                <div className={BAR_ROW} key={row.name}>
                  <span className={BAR_LABEL} title={row.name}>
                    {row.name}
                    <span className={BAR_LABEL_NOTE}><Plural value={row.quantity} one="# sold" other="# sold" /></span>
                  </span>
                  <div className={BAR_TRACK}>
                    <span
                      className={`${BAR_FILL} ${BAR_TONE.teal}`}
                      style={{ width: `${Math.max(4, (row.revenue / report.maxService) * 100)}%` }}
                    />
                  </div>
                  <strong className={BAR_VALUE}>{formatMoney(row.revenue)}</strong>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel title={t`Veterinarian activity`} description={t`Visits attended and revenue billed in this period.`}>
          {report.vetRows.length === 0 ? (
            <p className="empty-state"><Trans>No clinical activity in this period.</Trans></p>
          ) : (
            <div className="flex flex-col">
              <div className="grid grid-cols-[1.55fr_0.55fr_0.9fr] items-center gap-2.5 border-b border-[var(--row-border)] pb-2.5 pt-0 text-[9px] uppercase tracking-[0.06em] text-[var(--ink-muted)]">
                <span><Trans>Veterinarian</Trans></span>
                <span><Trans>Visits</Trans></span>
                <span className="text-right"><Trans>Revenue</Trans></span>
              </div>
              {report.vetRows.map((row) => {
                const name = vetName(data, row.id)
                return (
                <div
                  className="grid grid-cols-[1.55fr_0.55fr_0.9fr] items-center gap-2.5 border-b border-[var(--row-border)] py-2.5 last:border-b-0"
                  key={row.id}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <div className="grid h-[26px] w-[26px] place-items-center rounded-[7px] bg-[var(--avatar-bg)] text-[10px] font-bold text-[var(--teal-dark)]">
                      {initials(name)}
                    </div>
                    <strong className="truncate text-[11px]">{name}</strong>
                  </div>
                  <span className="text-[11px] text-[var(--table-fg)]">{row.visits}</span>
                  <span className="text-right text-[11px] text-[var(--table-fg)]">
                    {formatMoney(row.revenue)}
                    <span className="block text-[9px] text-[var(--ink-muted)]">
                      {Math.round((row.revenue / report.maxVetRevenue) * 100)}%
                    </span>
                  </span>
                </div>
                )
              })}
            </div>
          )}
        </Panel>
      </div>

      <Panel
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
          <div className="flex flex-col gap-3">
            {report.stockRows.map((row) => (
              <div className={BAR_ROW} key={row.item.id}>
                <span className={BAR_LABEL} title={row.item.name}>
                  {row.item.name}
                  <span className={BAR_LABEL_NOTE}>
                    <Trans>reorder at {row.item.reorderLevel} {row.item.unit}</Trans>
                  </span>
                </span>
                <div className={BAR_TRACK}>
                  <span
                    className={`${BAR_FILL} ${row.onHand === 0 ? BAR_TONE.red : BAR_TONE.amber}`}
                    style={{
                      width: `${Math.min(100, Math.max(4, (row.onHand / Math.max(row.item.reorderLevel, 1)) * 100))}%`,
                    }}
                  />
                </div>
                <strong className={BAR_VALUE}>
                  {row.onHand}
                  <small className={BAR_VALUE_NOTE}>{row.item.unit}</small>
                </strong>
              </div>
            ))}
          </div>
        )}
        <div className={SUMMARY}>
          <div className={SUMMARY_ITEM}>
            <small className={SUMMARY_LABEL}><Trans>Stock value at cost</Trans></small>
            <strong className={SUMMARY_VALUE}>{formatMoney(report.stockValue)}</strong>
          </div>
          <div className={SUMMARY_ITEM}>
            <small className={SUMMARY_LABEL}><Trans>Lots expiring ≤ 30 days</Trans></small>
            <strong className={SUMMARY_VALUE}>{report.expiringLots.length}</strong>
          </div>
        </div>
        <p className="mt-3.5 flex items-center gap-[5px] text-[10px] text-[var(--ink-muted)]">
          <AlertTriangle size={12} /> <Trans>Stock levels are a projection of the append-only movement ledger.</Trans>
        </p>
      </Panel>

      <div className="flex items-center justify-center gap-1.5 text-[10px] text-[var(--ink-muted)]">
        <TrendingUp size={14} /> <Trans>Figures are calculated from local records only — no cloud connection required.</Trans>
      </div>
    </>
  )
}
