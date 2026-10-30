import { describe, expect, it } from 'vitest'
import { ghostSegment, minutesLabel, snapMinute, weekDays } from './schedule'

describe('weekDays', () => {
  it('returns the Monday-start week containing the day', () => {
    // 2026-10-28 is a Wednesday: the week runs Oct 26 (Mon) – Nov 1 (Sun).
    expect(weekDays('2026-10-28')).toEqual([
      '2026-10-26',
      '2026-10-27',
      '2026-10-28',
      '2026-10-29',
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
    ])
  })

  it('handles a Sunday by starting the week six days back', () => {
    expect(weekDays('2026-11-01')[0]).toBe('2026-10-26')
  })
})

describe('snapMinute', () => {
  it('snaps to the 15-minute drag grid', () => {
    expect(snapMinute(7)).toBe(0)
    expect(snapMinute(8)).toBe(15)
    expect(snapMinute(37)).toBe(30)
  })

  it('clamps to the hour', () => {
    expect(snapMinute(-20)).toBe(0)
    expect(snapMinute(80)).toBe(60)
  })
})

describe('minutesLabel', () => {
  it('renders minutes-from-midnight, including the next hour boundary', () => {
    expect(minutesLabel(0)).toBe('00:00')
    expect(minutesLabel(8 * 60 + 30)).toBe('08:30')
    expect(minutesLabel(18 * 60)).toBe('18:00')
  })
})

describe('ghostSegment', () => {
  const draft = { iso: '2026-10-28', startAbs: 8 * 60 + 30, endAbs: 9 * 60 + 15 }

  it('renders the overlap of the selection with an hour slot', () => {
    const segment = ghostSegment(draft, '2026-10-28', 8)!
    expect(segment.top).toBe(50) // selection starts half past the hour
    expect(segment.height).toBe(50) // runs to the end of the hour
    expect(segment.label).toBe('08:30–09:15') // full range, shown in the anchored hour
  })

  it('draws the continuation hour without a label', () => {
    const segment = ghostSegment(draft, '2026-10-28', 9)!
    expect(segment.top).toBe(0)
    expect(segment.height).toBe(25) // 09:00–09:15
    expect(segment.label).toBeNull() // the time range is labelled once, on the anchor
  })

  it('returns null for other days and empty selections', () => {
    expect(ghostSegment(draft, '2026-10-29', 8)).toBeNull()
    expect(ghostSegment(null, '2026-10-28', 8)).toBeNull()
  })
})
