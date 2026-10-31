import { useEffect, useMemo, useRef, useState } from 'react'
import type { I18n } from '@lingui/core'
import { msg } from '@lingui/core/macro'
import { Plural, Trans, useLingui } from '@lingui/react/macro'
import { Bell, X } from 'lucide-react'
import { Pill } from '@/components/patterns/fields'
import { useClinic, type View } from '@/lib/vet/store'
import { formatDate } from '@/lib/vet/format'
import { buildWorklist, type WorklistFact } from '@/lib/vet/worklist'

type SetView = (view: View) => void

/** One actionable item in the notification center worklist. */
interface Reminder {
  id: string
  tone: 'bad' | 'warn' | 'info'
  title: string
  detail: string
  view: View
}

/**
 * The worklist selector returns facts; every sentence is written here so a
 * language switch is a plain re-render (only the facts are memoized).
 */
const reminderFor = (fact: WorklistFact, i18n: I18n): Reminder => {
  switch (fact.kind) {
    case 'vaccination-overdue':
      return {
        id: fact.id,
        tone: fact.tone,
        title: i18n._(msg`Vaccination overdue — ${fact.patientName ?? i18n._(msg`Unknown patient`)}`),
        detail: i18n._(msg`Was due ${formatDate(fact.dueAt)}`),
        view: 'records',
      }
    case 'vaccination-due':
      return {
        id: fact.id,
        tone: fact.tone,
        title: i18n._(msg`Vaccination due — ${fact.patientName ?? i18n._(msg`Unknown`)}`),
        detail: i18n._(msg`${fact.vaccineName} · due ${formatDate(fact.dueAt)}`),
        view: 'records',
      }
    case 'stock-low':
      return {
        id: fact.id,
        tone: fact.tone,
        title: i18n._(msg`Low stock — ${fact.itemName}`),
        detail: i18n._(msg`${fact.onHand} ${fact.unit} left (reorder at ${fact.reorderLevel})`),
        view: 'inventory',
      }
    case 'lot-expiring':
      return {
        id: fact.id,
        tone: fact.tone,
        title: i18n._(msg`Expiring soon — ${fact.itemName ?? i18n._(msg`Item`)} (${fact.lotNumber})`),
        detail: i18n._(msg`${fact.quantity} ${fact.unit ?? i18n._(msg`units`)} expire ${formatDate(fact.expiryDate)}`),
        view: 'inventory',
      }
  }
}

export const NotificationCenter = ({ setView }: { setView: SetView }) => {
  const { data } = useClinic()
  const { t, i18n } = useLingui()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  // Only the facts are memoized (they are translation-free); the sentences are
  // rebuilt each render, so a language switch needs no extra dependency.
  const facts = useMemo(() => buildWorklist(data), [data])
  const reminders = facts.map((fact) => reminderFor(fact, i18n))

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const badge = reminders.length > 9 ? '9+' : String(reminders.length)

  return (
    <div className="relative" ref={rootRef}>
      <button
        className="icon-button relative"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={reminders.length ? t`Notifications (${reminders.length} pending)` : t`Notifications`}
        title={t`Notifications`}
      >
        <Bell size={18} />
        {reminders.length > 0 && (
          <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-red-600 text-white text-[10px] font-bold leading-4 text-center">
            {badge}
          </span>
        )}
      </button>
      {open && (
        <div
          className="absolute right-0 top-[calc(100%+8px)] w-[min(360px,calc(100vw-32px))] max-h-[70vh] overflow-auto bg-card border border-border rounded-xl shadow-[0_12px_32px_rgb(0_0_0/0.14)] z-[60]"
          role="dialog"
          aria-label={t`Notifications`}
        >
          <div className="form-heading">
            <div>
              <strong><Trans>Notifications</Trans></strong>
              <span>
                {reminders.length === 0 ? (
                  <Trans>Nothing needs attention.</Trans>
                ) : (
                  <Plural value={reminders.length} one="# item needs attention" other="# items need attention" />
                )}
              </span>
            </div>
            <button className="icon-button" onClick={() => setOpen(false)} aria-label={t`Close notifications`}>
              <X size={16} />
            </button>
          </div>
          <div className="flex flex-col">
            {reminders.length === 0 && <p className="empty-state"><Trans>All clear — no overdue work, stock or expiry warnings.</Trans></p>}
            {reminders.map((r) => (
              <button
                key={r.id}
                className="flex items-start gap-2.5 w-full py-2.5 px-3.5 border-0 border-t border-border bg-transparent text-left cursor-pointer first:border-t-0 hover:bg-black/[0.04]"
                onClick={() => {
                  setView(r.view)
                  setOpen(false)
                }}
              >
                <Pill tone={r.tone} dot>
                  {r.tone === 'bad' ? t`overdue` : r.tone === 'warn' ? t`due soon` : t`expiring`}
                </Pill>
                <span className="flex flex-col gap-0.5 min-w-0">
                  <strong className="text-[13px]">{r.title}</strong>
                  <span className="text-xs text-muted-foreground">{r.detail}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

