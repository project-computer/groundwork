import { describe, expect, it } from 'vitest'
import { buildReport, REPORT_RANGES, REPORT_STATUS_ORDER, reportPeriod } from './report'
import { seedState } from './seed'
import { shiftDays, todayKey } from './format'
import type { ClinicState } from './types'

/**
 * The report model is translation-free by contract: labels leave it as
 * descriptors, so these tests run without a locale and assert structure,
 * windows and numbers only.
 */

// The seed is anchored to the day the module loads, so the report clock is
// derived from it rather than hard-coded.
const SEED_DAY = seedState.invoices[0].createdAt.slice(0, 10)
const NOW = new Date(`${SEED_DAY}T13:00:00+07:00`)
const build = (range: Parameters<typeof buildReport>[1], data: ClinicState = seedState) => buildReport(data, range, NOW)

describe('reportPeriod', () => {
  it('covers the whole of today for the today range', () => {
    const period = reportPeriod('today', NOW)
    expect(period.start?.getHours()).toBe(0)
    expect(period.start?.getDate()).toBe(NOW.getDate())
    expect(period.end.getHours()).toBe(23)
  })

  it('covers seven inclusive days for the 7d range', () => {
    const period = reportPeriod('7d', NOW)
    expect(period.start && todayKey(period.start)).toBe(shiftDays(SEED_DAY, -6))
    expect(period.end && todayKey(period.end)).toBe(SEED_DAY)
  })

  it('covers calendar month and year to date', () => {
    expect(reportPeriod('month', NOW).start?.getDate()).toBe(1)
    expect(reportPeriod('year', NOW).start?.getMonth()).toBe(0)
  })

  it('has no lower bound for all time', () => {
    expect(reportPeriod('all', NOW).start).toBeNull()
  })
})

describe('reportPeriodLabel', () => {
  it('carries dates only, leaving the all-time sentence to the view', () => {
    expect(build('today').periodLabel.start).not.toBeNull()
    const all = build('all').periodLabel
    expect(all.start).toBeNull()
    expect(all.end).toMatch(/\d/)
  })
})

describe('buildReport trend', () => {
  it('buckets today by clinic hour, 08:00–19:00', () => {
    const { buckets } = build('today').trend
    expect(buckets).toHaveLength(12)
    expect(buckets.map((b) => b.label)).toEqual(
      Array.from({ length: 12 }, (_, i) => ({ kind: 'hour', hour: i + 8 })),
    )
  })

  it('buckets a week by weekday descriptor', () => {
    const { buckets } = build('7d').trend
    expect(buckets).toHaveLength(7)
    expect(buckets[0].key).toBe(shiftDays(SEED_DAY, -6))
    expect(buckets.every((b) => b.label.kind === 'weekday')).toBe(true)
  })

  it('buckets 30 days by day-of-month descriptor', () => {
    const { buckets } = build('30d').trend
    expect(buckets).toHaveLength(30)
    expect(buckets.at(-1)?.label).toEqual({ kind: 'day', day: NOW.getDate() })
  })

  it('buckets a year and all time by month descriptor', () => {
    expect(build('year').trend.buckets.map((b) => b.label)).toEqual(
      Array.from({ length: 12 }, (_, month) => ({ kind: 'month', month })),
    )
    expect(build('all').trend.buckets).toHaveLength(12)
  })

  it('names the granularity with a caption key the view translates', () => {
    expect(build('today').trend.captionKey).toBe('hourly')
    expect(build('7d').trend.captionKey).toBe('daily-7d')
    expect(build('year').trend.captionKey).toBe('monthly-year')
    expect(build('all').trend.captionKey).toBe('monthly-12m')
  })
})

describe('buildReport metrics and rankings', () => {
  it('bills the posted invoices in the window', () => {
    // Seed: one posted invoice, 50,000 + 42,000 at 7% VAT.
    expect(build('today').metrics.billed).toBe(98440)
    expect(build('today').metrics.vat).toBe(6440)
    expect(build('today').metrics.collected).toBe(0)
    expect(build('today').metrics.outstanding).toBe(98440)
  })

  it('lists only statuses that occurred, in report order', () => {
    const rows = build('today').statusRows
    expect(rows).toEqual([
      { status: 'booked', count: 3 },
      { status: 'checked_in', count: 1 },
      { status: 'completed', count: 1 },
    ])
    // Order follows the model's list, not appointment insertion order.
    expect(rows.map((r) => r.status)).toEqual(
      REPORT_STATUS_ORDER.filter((status) => rows.some((r) => r.status === status)),
    )
  })

  it('ranks vets by revenue and carries ids, never translated names', () => {
    const rows = build('today').vetRows
    expect(rows[0]).toMatchObject({ id: 'u-pim', visits: 1, revenue: 98440 })
    expect(rows.some((row) => 'name' in row)).toBe(false)
  })

  it('reuses the low-stock selector so the report cannot disagree with Inventory', () => {
    const report = build('today')
    const names = report.stockRows.map((row) => row.item.id)
    expect(report.stockRows.every((row) => row.item.reorderLevel > 0)).toBe(true)
    expect(names.length).toBeLessThanOrEqual(6)
  })

  it('exposes one report range per segmented control entry', () => {
    expect(REPORT_RANGES).toEqual(['today', '7d', '30d', 'month', 'year', 'all'])
  })
})
