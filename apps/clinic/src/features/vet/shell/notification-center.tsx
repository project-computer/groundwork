import { useEffect, useMemo, useRef, useState } from 'react'
import { Plural, Trans, useLingui } from '@lingui/react/macro'
import { Bell, X } from 'lucide-react'
import { Pill } from '@/components/vet/fields'
import { useClinic, type View } from '@/lib/vet/store'
import { formatDate, itemOnHand, lotsExpiringWithin, todayKey, vaccinationsDue } from '@/lib/vet/format'

type SetView = (view: View) => void

/** One actionable item in the notification center worklist. */
/** One actionable item in the notification center worklist. */
interface Reminder {
  id: string
  tone: 'bad' | 'warn' | 'info'
  title: string
  detail: string
  view: View
}

export const NotificationCenter = ({ setView }: { setView: SetView }) => {
  const { data } = useClinic()
  const { t, i18n } = useLingui()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  const reminders = useMemo<Reminder[]>(() => {
    const today = todayKey()
    const items: Reminder[] = []

    // Overdue vaccinations: a patient's latest next-due date in the past.
    const latestDue = new Map<string, string>()
    for (const v of data.vaccinations) {
      if (!v.nextDueAt) continue
      const current = latestDue.get(v.patientId)
      if (!current || v.nextDueAt > current) latestDue.set(v.patientId, v.nextDueAt)
    }
    for (const [patientId, due] of latestDue) {
      const dueKey = due.slice(0, 10)
      if (dueKey < today) {
        const patient = data.patients.find((p) => p.id === patientId)
        items.push({
          id: `vax-overdue-${patientId}`,
          tone: 'bad',
          title: t`Vaccination overdue — ${patient?.name ?? t`Unknown patient`}`,
          detail: t`Was due ${formatDate(due)}`,
          view: 'records',
        })
      }
    }

    // Due within 30 days.
    for (const v of vaccinationsDue(data.vaccinations, 30, today)) {
      const patient = data.patients.find((p) => p.id === v.patientId)
      items.push({
        id: `vax-due-${v.id}`,
        tone: 'warn',
        title: t`Vaccination due — ${patient?.name ?? t`Unknown`}`,
        detail: t`${v.vaccineName} · due ${formatDate(v.nextDueAt!)}`,
        view: 'records',
      })
    }

    // Low stock: on-hand at or below a non-zero reorder level.
    for (const item of data.inventoryItems) {
      if (item.reorderLevel <= 0) continue
      const onHand = itemOnHand(item.id, data.inventoryLots)
      if (onHand <= item.reorderLevel) {
        items.push({
          id: `stock-low-${item.id}`,
          tone: 'warn',
          title: t`Low stock — ${item.name}`,
          detail: t`${onHand} ${item.unit} left (reorder at ${item.reorderLevel})`,
          view: 'inventory',
        })
      }
    }

    // Lots expiring within 30 days.
    for (const lot of lotsExpiringWithin(data.inventoryLots, 30, today)) {
      const item = data.inventoryItems.find((i) => i.id === lot.itemId)
      items.push({
        id: `stock-expiry-${lot.id}`,
        tone: 'info',
        title: t`Expiring soon — ${item?.name ?? t`Item`} (${lot.lotNumber})`,
        detail: t`${lot.quantity} ${item?.unit ?? t`units`} expire ${formatDate(lot.expiryDate!)}`,
        view: 'inventory',
      })
    }

    return items.toSorted((a, b) => a.tone.localeCompare(b.tone) || a.title.localeCompare(b.title))
    // Reminder titles are translated in this memo, so a language switch is
    // intentionally a rebuild trigger even though `locale` is never read here.
    // oxlint-disable-next-line react-hooks/exhaustive-deps, react/memo-dependencies
  }, [data, t, i18n.locale])

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

