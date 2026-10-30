import { msg, plural } from '@lingui/core/macro'
import { useLingui } from '@lingui/react/macro'
import { Panel } from '@/components/vet/fields'
import { monthGrid, todayKey } from '@/lib/vet/format'
import { dayLabel, monthLabel } from '@/lib/vet/schedule'
import type { Appointment } from '@/lib/vet/types'

const WEEKDAY_HEADERS = [msg`Mon`, msg`Tue`, msg`Wed`, msg`Thu`, msg`Fri`, msg`Sat`, msg`Sun`]

/**
 * Month calendar (2026-10-30 plan, phase C): appointments-per-day grid,
 * extracted verbatim from the ScheduleView body. Selecting a day opens it in
 * the day view.
 */
export const MonthCalendar = ({
  dayIso,
  byDay,
  onSelectDay,
}: {
  dayIso: string
  byDay: Map<string, Appointment[]>
  onSelectDay: (iso: string) => void
}) => {
  const { t, i18n } = useLingui()
  return (
    <Panel title={monthLabel(dayIso)} description={t`Appointments per day — select a day to open it`}>
      <div className="month-grid" role="grid" aria-label={t`${monthLabel(dayIso)} calendar`}>
        {WEEKDAY_HEADERS.map((label) => (
          <div className="month-head" key={label.id}>{i18n._(label)}</div>
        ))}
        {monthGrid(dayIso).map((iso) => {
          const list = byDay.get(iso) ?? []
          const inMonth = iso.slice(0, 7) === dayIso.slice(0, 7)
          return (
            <button
              className={`month-cell ${iso === todayKey() ? 'today' : ''} ${inMonth ? '' : 'outside'}`}
              key={iso}
              onClick={() => onSelectDay(iso)}
              aria-label={t`${dayLabel(iso)} — ${plural(list.length, { one: '# appointment', other: '# appointments' })}`}
            >
              <span className="month-day">{Number(iso.slice(8))}</span>
              {list.length > 0 && <span className="month-count">{list.length}</span>}
            </button>
          )
        })}
      </div>
    </Panel>
  )
}
