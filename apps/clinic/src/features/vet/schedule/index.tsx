import { useMemo, useRef, useState, type DragEvent, type PointerEvent } from 'react'
import { plural } from '@lingui/core/macro'
import { Trans, useLingui } from '@lingui/react/macro'
import { CalendarPlus, ChevronLeft, ChevronRight } from 'lucide-react'
import { Panel, PageHeader } from '@/components/vet/fields'
import { useClinic, usePermission } from '@/lib/vet/store'
import { compareTime, formatTime, shiftDays, shiftMonth, todayKey } from '@/lib/vet/format'
import { DatePicker } from '@/components/vet/date-picker'
import {
  apptDay,
  CLINIC_TZ_SUFFIX,
  dayLabel,
  DEFAULT_SLOT_MIN,
  findAppointmentConflict,
  ghostSegment,
  HOURS,
  monthLabel,
  shortDayLabel,
  SLOT_LATEST_START_MIN,
  snapMinute,
  weekDays,
  type AppointmentSlot,
  type SlotDraft,
} from '@/lib/vet/schedule'
import { AppointmentCard } from './appointment-card'
import { BookingDialog, type BookingDialogState, type BookingDraft } from './booking-dialog'
import { MonthCalendar } from './month-calendar'
import { UpcomingList } from './upcoming-list'
import { WaitingQueue } from './waiting-queue'

/**
 * Appointments & queue View — the calendar composition root (day / week /
 * month grids, drag-to-reschedule, drag-to-book pointer machinery). The
 * appointment card, waiting queue, upcoming list, walk-in form and booking
 * dialog live in their own files beside (2026-10-30 plan, phase C).
 */

const pad = (n: number) => String(n).padStart(2, '0')

/** Drag-to-create resolution and the duration used for a plain click on an empty slot. */
/** Minutes past the hour (0–60) for a pointer position inside an hour slot. */
const minuteAtPointer = (slot: HTMLElement, clientY: number): number => {
  const rect = slot.getBoundingClientRect()
  return snapMinute(((clientY - rect.top) / (rect.height || 1)) * 60)
}

/** Hour slot under `clientY` inside a container, falling back to the nearest edge slot. */
const locateSlot = (container: HTMLElement, clientY: number): { iso: string; hour: number; min: number } | null => {
  const slots = [...container.querySelectorAll<HTMLElement>('[data-slot-iso]')]
  let nearest: { iso: string; hour: number; min: number } | null = null
  for (const slot of slots) {
    const rect = slot.getBoundingClientRect()
    if (rect.height === 0) continue
    const found = { iso: slot.dataset.slotIso ?? '', hour: Number(slot.dataset.slotHour), min: 0 }
    if (clientY < rect.top) return { ...found, min: 0 }
    if (clientY <= rect.bottom) return { ...found, min: minuteAtPointer(slot, clientY) }
    nearest = { ...found, min: 60 }
  }
  return nearest
}

export const ScheduleView = () => {
  const { t } = useLingui()
  const { data, dispatch } = useClinic()
  const permission = usePermission('appointments.write')
  const [dayIso, setDayIso] = useState(todayKey())
  const [mode, setMode] = useState<'day' | 'week' | 'month'>('day')
  const [dialog, setDialog] = useState<BookingDialogState | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const [slotDraft, setSlotDraft] = useState<SlotDraft | null>(null)
  const slotAnchorRef = useRef<{ iso: string; hour: number; min: number } | null>(null)
  const slotContainerRef = useRef<HTMLElement | null>(null)

  /** Only appointments the reducer allows rescheduling are draggable. */
  const canDrag = (a: { id: string; status: string }) =>
    permission.allowed && (a.status === 'booked' || a.status === 'no_show' || a.status === 'cancelled')

  const startDrag = (e: DragEvent, id: string) => {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', id)
    setDragId(id)
  }

  const endDrag = () => {
    setDragId(null)
    setDropTarget(null)
  }

  const dragOver = (e: DragEvent, key: string) => {
    if (!dragId) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDropTarget(key)
  }

  const dragLeave = (key: string) => {
    setDropTarget((prev) => (prev === key ? null : prev))
  }

  /** Drop on a day-view hour row: keep the minutes, change the hour. */
  const dropOnHour = (e: DragEvent, hour: number) => {
    e.preventDefault()
    const id = dragId ?? e.dataTransfer.getData('text/plain')
    const appt = data.appointments.find((a) => a.id === id)
    if (appt) {
      const minutes = appt.startsAt.slice(14, 16)
      attemptReschedule(appt.id, {
        vetId: appt.vetId,
        startsAt: `${dayIso}T${pad(hour)}:${minutes}:00${CLINIC_TZ_SUFFIX}`,
        durationMin: appt.durationMin,
      })
    }
    endDrag()
  }

  /** Drop on a week-view hour slot: keep the minutes, change the day and hour. */
  const dropOnWeekSlot = (e: DragEvent, iso: string, hour: number) => {
    e.preventDefault()
    const id = dragId ?? e.dataTransfer.getData('text/plain')
    const appt = data.appointments.find((a) => a.id === id)
    if (appt) {
      const minutes = appt.startsAt.slice(14, 16)
      attemptReschedule(appt.id, {
        vetId: appt.vetId,
        startsAt: `${iso}T${pad(hour)}:${minutes}:00${CLINIC_TZ_SUFFIX}`,
        durationMin: appt.durationMin,
      })
    }
    endDrag()
  }

  const defaultVet = data.users.find((u) => u.role === 'veterinarian')

  const dayAppointments = useMemo(
    () =>
      data.appointments
        .filter((a) => apptDay(a.startsAt) === dayIso)
        .toSorted((a, b) => compareTime(a.startsAt, b.startsAt)),
    [data.appointments, dayIso],
  )
  const weekAppointments = useMemo(() => {
    const byDay = new Map<string, typeof data.appointments>()
    for (const a of data.appointments) {
      const key = apptDay(a.startsAt)
      const list = byDay.get(key) ?? []
      list.push(a)
      byDay.set(key, list)
    }
    return byDay
  }, [data.appointments])
  const waiting = dayAppointments.filter((a) => a.status === 'checked_in')
  const upcoming = data.appointments
    .filter((a) => a.status === 'booked' && apptDay(a.startsAt) > dayIso)
    .toSorted((a, b) => compareTime(a.startsAt, b.startsAt))
    .slice(0, 6)

  const openBookingAt = (iso: string, time: string, durationMin: number) => {
    setDialog({
      mode: 'book',
      override: false,
      draft: {
        patientId: data.patients[0]?.id ?? '',
        date: iso,
        time,
        durationMin,
        reason: '',
        vetId: defaultVet?.id ?? '',
      },
    })
  }

  const openBooking = () => openBookingAt(dayIso, '10:00', DEFAULT_SLOT_MIN)

  /** Press on empty grid space and drag vertically to choose a start time and duration. */
  const startSlot = (e: PointerEvent<HTMLDivElement>, iso: string, hour: number) => {
    if (!permission.allowed || e.button !== 0 || e.pointerType === 'touch') return
    if ((e.target as HTMLElement).closest('.cal-appt, button, a, input, select, textarea')) return
    e.preventDefault()
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // Synthetic pointers (tests, some devices) have no active pointer to capture.
    }
    const min = Math.min(SLOT_LATEST_START_MIN, minuteAtPointer(e.currentTarget, e.clientY))
    slotContainerRef.current = e.currentTarget.closest<HTMLElement>('[data-slot-container]')
    slotAnchorRef.current = { iso, hour, min }
    const startAbs = hour * 60 + min
    setSlotDraft({ iso, startAbs, endAbs: startAbs })
  }

  const moveSlot = (e: PointerEvent<HTMLDivElement>) => {
    const anchor = slotAnchorRef.current
    const container = slotContainerRef.current
    if (!anchor || !container) return
    const located = locateSlot(container, e.clientY)
    if (!located) return
    const anchorAbs = anchor.hour * 60 + anchor.min
    const locatedAbs = located.hour * 60 + located.min
    setSlotDraft({ iso: anchor.iso, startAbs: Math.min(anchorAbs, locatedAbs), endAbs: Math.max(anchorAbs, locatedAbs) })
  }

  const finishSlot = (e: PointerEvent<HTMLDivElement>) => {
    const anchor = slotAnchorRef.current
    const container = slotContainerRef.current
    if (!anchor || !container) return
    // Without measurable layout (tests) the release counts as a click on the anchor slot.
    const located = locateSlot(container, e.clientY) ?? anchor
    slotAnchorRef.current = null
    slotContainerRef.current = null
    setSlotDraft(null)
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
    const anchorAbs = anchor.hour * 60 + anchor.min
    const locatedAbs = located.hour * 60 + located.min
    const startAbs = Math.min(anchorAbs, locatedAbs)
    const endAbs = Math.max(anchorAbs, locatedAbs)
    openBookingAt(
      anchor.iso,
      `${pad(Math.floor(startAbs / 60))}:${pad(startAbs % 60)}`,
      endAbs === startAbs ? DEFAULT_SLOT_MIN : endAbs - startAbs,
    )
  }

  const cancelSlot = () => {
    slotAnchorRef.current = null
    slotContainerRef.current = null
    setSlotDraft(null)
  }

  const openReschedule = (appointmentId: string, overrides: Partial<BookingDraft> = {}) => {
    const appt = data.appointments.find((a) => a.id === appointmentId)
    if (!appt) return
    setDialog({
      mode: 'reschedule',
      appointmentId,
      override: false,
      draft: {
        patientId: appt.patientId,
        date: apptDay(appt.startsAt),
        time: appt.startsAt.slice(11, 16),
        durationMin: appt.durationMin,
        reason: appt.reason,
        vetId: appt.vetId,
        ...overrides,
      },
    })
  }

  /** A drag that lands on an occupied slot reopens the dialog so the clash is visible. */
  const attemptReschedule = (appointmentId: string, slot: AppointmentSlot) => {
    const clash = findAppointmentConflict(data.appointments, slot, appointmentId)
    if (clash) {
      const appt = data.appointments.find((a) => a.id === appointmentId)
      setDialog({
        mode: 'reschedule',
        appointmentId,
        override: false,
        draft: {
          patientId: appt?.patientId ?? '',
          date: apptDay(slot.startsAt),
          time: slot.startsAt.slice(11, 16),
          durationMin: slot.durationMin,
          reason: appt?.reason ?? '',
          vetId: slot.vetId,
        },
      })
      return
    }
    dispatch({ type: 'rescheduleAppointment', id: appointmentId, startsAt: slot.startsAt, durationMin: slot.durationMin })
  }

  return (
    <>
      <PageHeader
        title={t`Appointments & queue`}
        description={t`Book, check in and run the day. Walk-ins land in the waiting queue.`}
        action={
          <button className="button primary" onClick={openBooking} disabled={!permission.allowed} title={permission.reason || undefined}>
            <CalendarPlus size={16} /> <Trans>Book appointment</Trans>
          </button>
        }
      />
      <div className="toolbar">
        <div className="date-nav">
          <button
            className="icon-button"
            onClick={() => setDayIso(mode === 'week' ? shiftDays(dayIso, -7) : mode === 'month' ? shiftMonth(dayIso, -1) : shiftDays(dayIso, -1))}
            aria-label={t`Previous day`}
          >
            <ChevronLeft size={17} />
          </button>
          <strong>{mode === 'day' ? dayLabel(dayIso) : mode === 'week' ? <Trans>Week of {dayLabel(weekDays(dayIso)[0])}</Trans> : monthLabel(dayIso)}</strong>
          <button
            className="icon-button"
            onClick={() => setDayIso(mode === 'week' ? shiftDays(dayIso, 7) : mode === 'month' ? shiftMonth(dayIso, 1) : shiftDays(dayIso, 1))}
            aria-label={t`Next day`}
          >
            <ChevronRight size={17} />
          </button>
          <button className="small-button today-button" onClick={() => setDayIso(todayKey())}>
            <Trans>Today</Trans>
          </button>
          <DatePicker className="date-picker-inline" label={t`Jump to date`} value={dayIso} onChange={setDayIso} />
        </div>
        <div className="seg" role="tablist" aria-label={t`Calendar mode`}>
          {(['day', 'week', 'month'] as const).map((m) => (
            <button key={m} role="tab" aria-selected={mode === m} className={mode === m ? 'active' : ''} onClick={() => setMode(m)}>
              {m === 'day' ? <Trans>Day</Trans> : m === 'week' ? <Trans>Week</Trans> : <Trans>Month</Trans>}
            </button>
          ))}
        </div>
      </div>

      {mode === 'day' ? (
        <div className="dashboard-grid">
          <Panel title={t`Schedule — ${dayLabel(dayIso)}`} description={plural(dayAppointments.length, { one: '# appointment', other: '# appointments' })}>
            <div className="cal-day" data-slot-container>
              {dayAppointments.length === 0 && <p className="empty-state"><Trans>No appointments scheduled for this day.</Trans></p>}
              {HOURS.map((hour) => {
                const slot = `${pad(hour)}:00`
                const inSlot = dayAppointments.filter((a) => a.startsAt.slice(11, 13) === slot.slice(0, 2))
                const ghost = ghostSegment(slotDraft, dayIso, hour)
                return (
                  <div className="cal-row" key={hour}>
                    <time>{slot}</time>
                    <div
                      className={`cal-cells${dropTarget === `${dayIso}-${hour}` && dragId ? ' drop-target' : ''}`}
                      data-slot-iso={dayIso}
                      data-slot-hour={hour}
                      onDragOver={(e) => dragOver(e, `${dayIso}-${hour}`)}
                      onDragLeave={() => dragLeave(`${dayIso}-${hour}`)}
                      onDrop={(e) => dropOnHour(e, hour)}
                      onPointerDown={(e) => startSlot(e, dayIso, hour)}
                      onPointerMove={moveSlot}
                      onPointerUp={finishSlot}
                      onPointerCancel={cancelSlot}
                    >
                      {ghost && (
                        <div className="cal-slot-ghost" aria-hidden="true" style={{ top: `${ghost.top}%`, height: `${ghost.height}%` }}>
                          {ghost.label && <span>{ghost.label}</span>}
                        </div>
                      )}
                      {inSlot.map((a) => (
                        <AppointmentCard
                          key={a.id}
                          appointment={a}
                          patient={data.patients.find((p) => p.id === a.patientId)}
                          vet={data.users.find((u) => u.id === a.vetId)}
                          draggable={canDrag(a)}
                          dragging={dragId === a.id}
                          disabled={!permission.allowed}
                          onReschedule={openReschedule}
                          onDragStart={startDrag}
                          onDragEnd={endDrag}
                        />
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </Panel>
          <div className="side-stack">
            <WaitingQueue waiting={waiting} />
            <UpcomingList upcoming={upcoming} onReschedule={openReschedule} />
          </div>
        </div>
      ) : mode === 'week' ? (
        <Panel title={t`Week overview`} description={t`Appointments across the clinic week — click or drag empty space to book`}>
          <div className="week-grid">
            {weekDays(dayIso).map((iso) => {
              const list = (weekAppointments.get(iso) ?? []).toSorted((a, b) => compareTime(a.startsAt, b.startsAt))
              return (
                <div className="week-col" key={iso}>
                  <header className={iso === todayKey() ? 'today' : ''}>
                    <strong>{shortDayLabel(iso)}</strong>
                    <span>{list.length}</span>
                  </header>
                  <div className="week-cells" data-slot-container>
                    {HOURS.map((hour) => {
                      const inSlot = list.filter((a) => a.startsAt.slice(11, 13) === pad(hour))
                      const dropKey = `${iso}-${hour}`
                      const ghost = ghostSegment(slotDraft, iso, hour)
                      return (
                        <div
                          className={`week-slot${dropTarget === dropKey && dragId ? ' drop-target' : ''}`}
                          key={hour}
                          data-slot-iso={iso}
                          data-slot-hour={hour}
                          data-hour-label={`${pad(hour)}:00`}
                          onDragOver={(e) => dragOver(e, dropKey)}
                          onDragLeave={() => dragLeave(dropKey)}
                          onDrop={(e) => dropOnWeekSlot(e, iso, hour)}
                          onPointerDown={(e) => startSlot(e, iso, hour)}
                          onPointerMove={moveSlot}
                          onPointerUp={finishSlot}
                          onPointerCancel={cancelSlot}
                        >
                          {ghost && (
                            <div className="cal-slot-ghost" aria-hidden="true" style={{ top: `${ghost.top}%`, height: `${ghost.height}%` }}>
                              {ghost.label && <span>{ghost.label}</span>}
                            </div>
                          )}
                          {inSlot.map((a) => {
                            const patient = data.patients.find((p) => p.id === a.patientId)
                            const draggable = canDrag(a)
                            return (
                              <button
                                className={`cal-appt compact status-${a.status}${dragId === a.id ? ' dragging' : ''}`}
                                key={a.id}
                                draggable={draggable}
                                onDragStart={(e) => startDrag(e, a.id)}
                                onDragEnd={endDrag}
                                onClick={() => { setDayIso(iso); setMode('day') }}
                                title={draggable ? t`${patient?.name} · ${a.reason} · drag to another slot to reschedule` : t`${patient?.name} · ${a.reason}`}
                              >
                                <strong>{formatTime(a.startsAt)}</strong>
                                <span>{patient?.name}</span>
                              </button>
                            )
                          })}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
             })}
           </div>
         </Panel>
      ) : (
        <MonthCalendar
          dayIso={dayIso}
          byDay={weekAppointments}
          onSelectDay={(iso) => {
            setDayIso(iso)
            setMode('day')
          }}
        />
      )}

      {dialog && <BookingDialog state={dialog} onChange={setDialog} onClose={() => setDialog(null)} />}
    </>
  )
}
