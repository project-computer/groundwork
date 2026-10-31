import { i18n as globalI18n, type MessageDescriptor } from '@lingui/core'
import { msg } from '@lingui/core/macro'
import { todayKey } from '@/lib/vet/format'
import { buildReport, csvCell, csvMoney } from '@/lib/vet/report'
import type { ClinicState } from '@/lib/vet/types'
import { bucketLabel, formatPeriodLabel, STATUS_LABELS, vetName } from '../components/labels'

/**
 * CSV export (2026-10-30 plan, phase C): builds the report spreadsheet from
 * the pure report model — escaping and money formatting live in
 * `lib/vet/report.ts` (`csvCell` / `csvMoney`), translated labels come from
 * `./labels`. Moved verbatim from the Reports view.
 */
const csvLabel = (message: MessageDescriptor) => globalI18n._(message)

export const exportReport = (report: ReturnType<typeof buildReport>, data: ClinicState) => {
  const { metrics } = report
  const lines: string[] = [
    csvCell(csvLabel(msg`Vettera clinic report`)),
    [csvCell(csvLabel(msg`Clinic`)), csvCell(data.clinic.name)].join(','),
    [csvCell(csvLabel(msg`Period`)), csvCell(formatPeriodLabel(report.periodLabel))].join(','),
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
      [csvCell(bucketLabel(bucket.label)), csvCell(csvMoney(bucket.collected)), csvCell(csvMoney(bucket.billed))].join(','),
    ),
    '',
    csvCell(csvLabel(msg`Appointments by status`)),
    [csvCell(csvLabel(msg`Status`)), csvCell(csvLabel(msg`Count`))].join(','),
    ...report.statusRows.map((row) => [csvCell(csvLabel(STATUS_LABELS[row.status])), csvCell(row.count)].join(',')),
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
      [csvCell(vetName(data, row.id)), csvCell(row.visits), csvCell(csvMoney(row.revenue))].join(','),
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
