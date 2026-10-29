import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { msg } from '@lingui/core/macro'
import { useLingui } from '@lingui/react/macro'
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react'
import { formatDate, monthGrid, shiftMonth, todayKey } from '@/lib/vet/format'

const WEEKDAY_HEADERS = [msg`Mon`, msg`Tue`, msg`Wed`, msg`Thu`, msg`Fri`, msg`Sat`, msg`Sun`]
const CHOOSE_DATE = msg`Choose a date`
const PREVIOUS_MONTH = msg`Previous month`
const NEXT_MONTH = msg`Next month`
const TODAY = msg`Today`

const monthLabel = (iso: string) =>
  new Date(`${iso.slice(0, 7)}-01T12:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

const clinicDate = (iso: string) => formatDate(`${iso}T12:00:00+07:00`)

const ARROW_DAYS: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 7, ArrowUp: -7 }

export interface DatePickerProps {
  /** Passes through to the trigger button so `<Field htmlFor>` and tests can reach it. */
  id?: string
  /** Selected date as YYYY-MM-DD. */
  value: string
  onChange: (iso: string) => void
  disabled?: boolean
  /** Accessible name for the trigger button. */
  label?: string
  /** Extra class on the root, e.g. `date-picker-inline` for toolbar use. */
  className?: string
}

/**
 * Clinic-styled date picker: trigger button plus a Monday-start month grid.
 * Grid math comes from the shared `monthGrid` helper, the same one the
 * appointments month view uses, so the two surfaces cannot drift apart.
 */
export const DatePicker = ({ id, value, onChange, disabled, label, className }: DatePickerProps) => {
  const { i18n } = useLingui()
  const [open, setOpen] = useState(false)
  const [viewIso, setViewIso] = useState(value || todayKey())
  const [popStyle, setPopStyle] = useState<{ top: number; left: number } | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const popRef = useRef<HTMLDivElement | null>(null)
  const gridRef = useRef<HTMLDivElement | null>(null)

  const POP_HEIGHT = 330
  const POP_WIDTH = 252

  // Reopen on the month that holds the selected date, not the last one browsed.
  const toggleOpen = () => {
    if (!open) {
      const rect = triggerRef.current?.getBoundingClientRect()
      if (rect) {
        const left = Math.max(8, Math.min(rect.left, window.innerWidth - POP_WIDTH - 8))
        const below = rect.bottom + 6 + POP_HEIGHT <= window.innerHeight
        setPopStyle({ top: below ? rect.bottom + 6 : Math.max(8, rect.top - POP_HEIGHT - 6), left })
      }
      setViewIso(value || todayKey())
    }
    setOpen(!open)
  }

  // Close on outside press, scroll, or Escape; return focus to the trigger.
  useEffect(() => {
    if (!open) return
    const outside = (e: PointerEvent) => {
      const target = e.target as Node
      if (!rootRef.current?.contains(target) && !popRef.current?.contains(target)) setOpen(false)
    }
    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    const onScroll = () => setOpen(false)
    window.addEventListener('pointerdown', outside)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      window.removeEventListener('pointerdown', outside)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [open])

  // Focus lands on the selected day so arrow-key navigation starts there.
  useEffect(() => {
    if (!open) return
    const grid = gridRef.current
    if (!grid) return
    const selected = grid.querySelector<HTMLButtonElement>('[data-selected]')
    const firstInMonth = grid.querySelector<HTMLButtonElement>(`[data-iso^="${viewIso.slice(0, 7)}"]`)
    ;(selected ?? firstInMonth)?.focus()
  }, [open, viewIso])

  const days = useMemo(() => monthGrid(viewIso), [viewIso])
  const today = todayKey()

  const choose = (iso: string) => {
    onChange(iso)
    setOpen(false)
    triggerRef.current?.focus()
  }

  const onGridKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const delta = ARROW_DAYS[e.key]
    if (delta === undefined || !gridRef.current) return
    const cells = [...gridRef.current.querySelectorAll<HTMLButtonElement>('button')]
    const activeIndex = cells.indexOf(document.activeElement as HTMLButtonElement)
    if (activeIndex === -1) return
    e.preventDefault()
    cells[Math.min(cells.length - 1, Math.max(0, activeIndex + delta))]?.focus()
  }

  return (
    <div className={`date-picker${className ? ` ${className}` : ''}`} ref={rootRef}>
      <button
        id={id}
        type="button"
        ref={triggerRef}
        className="date-picker-trigger"
        data-value={value}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={label}
        disabled={disabled}
        onClick={toggleOpen}
      >
        <Calendar size={14} aria-hidden />
        <span>{value ? clinicDate(value) : '—'}</span>
      </button>
      {open && (
        <div className="date-picker-pop" role="dialog" aria-label={`${i18n._(CHOOSE_DATE)} — ${monthLabel(viewIso)}`}>
          <div className="date-picker-head">
            <button type="button" className="icon-button" aria-label={i18n._(PREVIOUS_MONTH)} onClick={() => setViewIso(shiftMonth(viewIso, -1))}>
              <ChevronLeft size={15} />
            </button>
            <strong>{monthLabel(viewIso)}</strong>
            <button type="button" className="icon-button" aria-label={i18n._(NEXT_MONTH)} onClick={() => setViewIso(shiftMonth(viewIso, 1))}>
              <ChevronRight size={15} />
            </button>
          </div>
          <div className="date-picker-weekdays" aria-hidden="true">
            {WEEKDAY_HEADERS.map((day) => (
              <span key={day.id}>{i18n._(day)}</span>
            ))}
          </div>
          <div className="date-picker-grid" role="grid" ref={gridRef} onKeyDown={onGridKeyDown}>
            {days.map((iso) => (
              <button
                type="button"
                role="gridcell"
                key={iso}
                tabIndex={iso === value ? 0 : -1}
                data-iso={iso}
                data-selected={iso === value || undefined}
                data-today={iso === today || undefined}
                data-outside={iso.slice(0, 7) === viewIso.slice(0, 7) ? undefined : ''}
                aria-selected={iso === value}
                aria-current={iso === today ? 'date' : undefined}
                aria-label={clinicDate(iso)}
                onClick={() => choose(iso)}
              >
                {Number(iso.slice(8))}
              </button>
            ))}
          </div>
          <div className="date-picker-foot">
            <button type="button" className="text-button" onClick={() => choose(today)}>
              {i18n._(TODAY)}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
