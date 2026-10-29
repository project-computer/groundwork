import { useMemo, useRef, useState, type DragEvent, type PointerEvent } from 'react'
import { msg, plural } from '@lingui/core/macro'
import { Plural, Trans, useLingui } from '@lingui/react/macro'
import { AlertTriangle, CalendarPlus, ChevronLeft, ChevronRight, DoorOpen, Stethoscope, UserX, X } from 'lucide-react'
import { Field, NativeSelect, Panel, PageHeader, Pill } from '@/components/vet/fields'
import { useClinic, usePermission } from '@/lib/vet/store'
import { formatDate, formatTime, monthGrid, shiftDays, shiftMonth, statusLabel, statusTone, todayKey } from '@/lib/vet/format'
import { DatePicker } from '@/components/vet/date-picker'
import { findAppointmentConflict, isPastSlot, type AppointmentSlot } from '@/lib/vet/schedule'

const CLINIC_TZ_SUFFIX = '+07:00'

const pad = (n: number) => String(n).padStart(2, '0')

/** Appointment timestamps share the clinic-offset convention used by seeds and bookings. */
const apptDay = (iso: string) => iso.slice(0, 10)

const weekDays = (iso: string): string[] => {
  const d = new Date(`${iso}T12:00:00Z`)
  const weekday = d.getUTCDay() // 0 = Sunday
  const monday = shiftDays(iso, weekday === 0 ? -6 : 1 - weekday)
  return Array.from({ length: 7 }, (_, i) => shiftDays(monday, i))
}

const dayLabel = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })

const shortDayLabel = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' })

const HOUR_START = 8
const HOUR_END = 18
const HOURS = Array.from({ length: HOUR_END - HOUR_START + 1 }, (_, i) => HOUR_START + i)

/** Drag-to-create resolution and the duration used for a plain click on an empty slot. */
const SLOT_SNAP_MIN = 15
const DEFAULT_SLOT_MIN = 30
/** Latest a slot may start inside an hour, so a single snapped step still fits. */
const SLOT_LATEST_START_MIN = 60 - SLOT_SNAP_MIN

const snapMinute = (minute: number): number =>
  Math.min(60, Math.max(0, Math.round(minute / SLOT_SNAP_MIN) * SLOT_SNAP_MIN))

const minutesLabel = (abs: number): string => `${pad(Math.floor(abs / 60) % 24)}:${pad(abs % 60)}`

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

/** Active drag-to-create selection in minutes from midnight. */
interface SlotDraft {
  iso: string
  startAbs: number
  endAbs: number
}

interface SlotSegment {
  top: number
  height: number
  label: string | null
}

/** Overlap of the active selection with one hour slot, for rendering the ghost. */
const ghostSegment = (draft: SlotDraft | null, iso: string, hour: number): SlotSegment | null => {
  if (!draft || draft.iso !== iso) return null
  const from = Math.max(draft.startAbs, hour * 60)
  const to = Math.min(draft.endAbs, hour * 60 + 60)
  if (to <= from) return null
  const anchored = draft.startAbs >= hour * 60 && draft.startAbs < hour * 60 + 60
  return {
    top: ((from - hour * 60) / 60) * 100,
    height: ((to - from) / 60) * 100,
    label: anchored ? (draft.endAbs === draft.startAbs ? minutesLabel(draft.startAbs) : `${minutesLabel(draft.startAbs)}–${minutesLabel(draft.endAbs)}`) : null,
  }
}

const WEEKDAY_HEADERS = [msg`Mon`, msg`Tue`, msg`Wed`, msg`Thu`, msg`Fri`, msg`Sat`, msg`Sun`]

const monthLabel = (iso: string) =>
  new Date(`${iso.slice(0, 7)}-01T12:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

interface BookingDraft {
  patientId: string
  date: string
  time: string
  durationMin: number
  reason: string
  vetId: string
}

export const ScheduleView = () => {
  const { t, i18n } = useLingui()
  const { data, session, dispatch } = useClinic()
  const permission = usePermission('appointments.write')
  const [dayIso, setDayIso] = useState(todayKey())
  const [mode, setMode] = useState<'day' | 'week' | 'month'>('day')
  const [dialog, setDialog] = useState<{ mode: 'book' | 'reschedule'; appointmentId?: string; draft: BookingDraft; override: boolean } | null>(null)
  const [walkInOpen, setWalkInOpen] = useState(false)
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

  const vets = data.users.filter((u) => u.role === 'veterinarian')

  const dayAppointments = useMemo(
    () =>
      data.appointments
        .filter((a) => apptDay(a.startsAt) === dayIso)
        .toSorted((a, b) => a.startsAt.localeCompare(b.startsAt)),
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
    .toSorted((a, b) => a.startsAt.localeCompare(b.startsAt))
    .slice(0, 6)

  // Live clash check for the open dialog: the user must acknowledge a
  // double-booking before the save button unlocks.
  const draftSlot: AppointmentSlot | null =
    dialog && dialog.draft.date && dialog.draft.time
      ? {
          vetId: dialog.draft.vetId,
          startsAt: `${dialog.draft.date}T${dialog.draft.time}:00${CLINIC_TZ_SUFFIX}`,
          durationMin: dialog.draft.durationMin,
        }
      : null
  const dialogConflict = draftSlot ? findAppointmentConflict(data.appointments, draftSlot, dialog?.appointmentId) : undefined
  const conflictPatient = dialogConflict ? data.patients.find((p) => p.id === dialogConflict.patientId) : undefined
  const conflictVet = dialogConflict ? data.users.find((u) => u.id === dialogConflict.vetId) : undefined
  const conflictVetName = conflictVet?.name ?? t`This vet`
  const conflictPatientName = conflictPatient?.name ?? t`Another patient`
  const dialogInPast = draftSlot ? isPastSlot(draftSlot) : false

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
        vetId: vets[0]?.id ?? '',
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

  const submitDialog = () => {
    if (!dialog) return
    const { mode: dialogMode, appointmentId, draft } = dialog
    if (!draft.patientId || !draft.date || !draft.time) return
    // A clash is only saved once the user has explicitly acknowledged it.
    if (dialogConflict && !dialog.override) return
    const startsAt = `${draft.date}T${draft.time}:00${CLINIC_TZ_SUFFIX}`
    if (dialogMode === 'book') {
      dispatch({
        type: 'bookAppointment',
        appointment: {
          patientId: draft.patientId,
          startsAt,
          durationMin: draft.durationMin,
          reason: draft.reason || 'Consultation',
          vetId: draft.vetId || vets[0]?.id || data.users[0]?.id || '',
        },
      })
    } else if (appointmentId) {
      dispatch({ type: 'rescheduleAppointment', id: appointmentId, startsAt, durationMin: draft.durationMin })
    }
    setDialog(null)
  }

  const submitWalkIn = (patientId: string, reason: string) => {
    if (!patientId) return
    dispatch({ type: 'walkIn', patientId, reason, vetId: session.currentUserId })
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
                      {inSlot.map((a) => {
                        const patient = data.patients.find((p) => p.id === a.patientId)
                        const vet = data.users.find((u) => u.id === a.vetId)
                        const draggable = canDrag(a)
                        return (
                          <div
                            className={`cal-appt status-${a.status}${dragId === a.id ? ' dragging' : ''}`}
                            key={a.id}
                            draggable={draggable}
                            onDragStart={(e) => startDrag(e, a.id)}
                            onDragEnd={endDrag}
                            title={draggable ? t`Drag to another hour to reschedule` : undefined}
                          >
                            <div className="appointment-main">
                              <strong>
                                {patient?.name ?? <Trans>Unknown</Trans>} <span className="cal-time-chip">{formatTime(a.startsAt)} · <Trans>{a.durationMin}min</Trans></span>
                              </strong>
                              <span>
                                {a.reason} · {vet?.name ?? <Trans>Unassigned</Trans>}
                              </span>
                            </div>
                            <Pill tone={statusTone(a.status)} dot>
                              {statusLabel(a.status)}
                            </Pill>
                            <div className="cal-actions">
                              {a.status === 'booked' && (
                                <button className="small-button" onClick={() => dispatch({ type: 'setAppointmentStatus', id: a.id, status: 'checked_in' })} disabled={!permission.allowed}>
                                  <Trans>Check in</Trans>
                                </button>
                              )}
                              {(a.status === 'booked' || a.status === 'checked_in') && (
                                <button className="small-button" onClick={() => dispatch({ type: 'startEncounter', appointmentId: a.id })} disabled={!permission.allowed}>
                                  <Stethoscope size={13} /> <Trans>Start</Trans>
                                </button>
                              )}
                              {a.status === 'booked' && (
                                <>
                                  <button className="text-button" onClick={() => openReschedule(a.id)} disabled={!permission.allowed}>
                                    <Trans>Reschedule</Trans>
                                  </button>
                                  <button className="text-button" onClick={() => dispatch({ type: 'setAppointmentStatus', id: a.id, status: 'no_show' })} disabled={!permission.allowed} title={t`Mark no-show`}>
                                    <UserX size={13} /> <Trans>No-show</Trans>
                                  </button>
                                  <button className="text-button" onClick={() => dispatch({ type: 'setAppointmentStatus', id: a.id, status: 'cancelled' })} disabled={!permission.allowed}>
                                    <Trans>Cancel</Trans>
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </Panel>
          <div className="side-stack">
            <Panel title={t`Waiting queue`} description={t`Checked-in patients waiting for the vet`}>
              <div className="appointment-list">
                {waiting.length === 0 && <p className="empty-state"><Trans>No one waiting right now.</Trans></p>}
                {waiting.map((a) => {
                  const patient = data.patients.find((p) => p.id === a.patientId)
                  return (
                    <div className="appointment-row" key={a.id}>
                      <div className="pet-mini">{patient?.name.slice(0, 1)}</div>
                      <div className="appointment-main">
                        <strong>{patient?.name}</strong>
                        <span><Trans>Since {formatTime(a.startsAt)}</Trans></span>
                      </div>
                      <button className="small-button" onClick={() => dispatch({ type: 'startEncounter', appointmentId: a.id })} disabled={!permission.allowed}>
                        <Stethoscope size={13} /> <Trans>Start</Trans>
                      </button>
                    </div>
                  )
                })}
              </div>
              <div className="panel-footer">
                {walkInOpen ? (
                  <WalkInForm patients={data.patients} onCancel={() => setWalkInOpen(false)} onSubmit={submitWalkIn} disabled={!permission.allowed} />
                ) : (
                  <button className="button secondary" onClick={() => setWalkInOpen(true)} disabled={!permission.allowed}>
                    <DoorOpen size={16} /> <Trans>Add walk-in</Trans>
                  </button>
                )}
              </div>
            </Panel>
            <Panel title={t`Upcoming`} description={t`Next booked appointments after this day`}>
              <div className="appointment-list">
                {upcoming.length === 0 && <p className="empty-state"><Trans>Nothing booked ahead.</Trans></p>}
                {upcoming.map((a) => {
                  const patient = data.patients.find((p) => p.id === a.patientId)
                  return (
                    <div className="appointment-row" key={a.id}>
                      <div className="appointment-main">
                        <strong>{patient?.name}</strong>
                        <span>
                          {formatDate(a.startsAt)} · {formatTime(a.startsAt)} · {a.reason}
                        </span>
                      </div>
                      <button className="text-button" onClick={() => openReschedule(a.id)} disabled={!permission.allowed}>
                        <Trans>Reschedule</Trans>
                      </button>
                    </div>
                  )
                })}
              </div>
            </Panel>
          </div>
        </div>
      ) : mode === 'week' ? (
        <Panel title={t`Week overview`} description={t`Appointments across the clinic week — click or drag empty space to book`}>
          <div className="week-grid">
            {weekDays(dayIso).map((iso) => {
              const list = (weekAppointments.get(iso) ?? []).toSorted((a, b) => a.startsAt.localeCompare(b.startsAt))
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
        <Panel title={monthLabel(dayIso)} description={t`Appointments per day — select a day to open it`}>
          <div className="month-grid" role="grid" aria-label={t`${monthLabel(dayIso)} calendar`}>
            {WEEKDAY_HEADERS.map((label) => (
              <div className="month-head" key={label.id}>{i18n._(label)}</div>
            ))}
            {monthGrid(dayIso).map((iso) => {
              const list = weekAppointments.get(iso) ?? []
              const inMonth = iso.slice(0, 7) === dayIso.slice(0, 7)
              return (
                <button
                  className={`month-cell ${iso === todayKey() ? 'today' : ''} ${inMonth ? '' : 'outside'}`}
                  key={iso}
                  onClick={() => {
                    setDayIso(iso)
                    setMode('day')
                  }}
                  aria-label={t`${dayLabel(iso)} — ${plural(list.length, { one: '# appointment', other: '# appointments' })}`}
                >
                  <span className="month-day">{Number(iso.slice(8))}</span>
                  {list.length > 0 && <span className="month-count">{list.length}</span>}
                </button>
              )
            })}
          </div>
        </Panel>
      )}

      {dialog && (
        <div
          className="modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setDialog(null)
          }}
        >
          <div className="modal" role="dialog" aria-modal="true" aria-label={dialog.mode === 'book' ? t`Book appointment` : t`Reschedule appointment`}>
            <div className="form-heading">
              <div>
                <strong>{dialog.mode === 'book' ? <Trans>Book appointment</Trans> : <Trans>Reschedule appointment</Trans>}</strong>
                <span><Trans>Appointments are saved to the local clinic database.</Trans></span>
              </div>
              <button className="icon-button" onClick={() => setDialog(null)} aria-label={t`Close dialog`}>
                <X size={17} />
              </button>
            </div>
            <div className="form-grid">
              <Field label={t`Patient`} htmlFor="bk-patient">
                <NativeSelect
                  id="bk-patient"
                  value={dialog.draft.patientId}
                  disabled={dialog.mode === 'reschedule'}
                  onChange={(e) => setDialog({ ...dialog, draft: { ...dialog.draft, patientId: e.target.value } })}
                >
                  {data.patients.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — {data.owners.find((o) => o.id === p.ownerId)?.name}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label={t`Veterinarian`} htmlFor="bk-vet">
                <NativeSelect id="bk-vet" value={dialog.draft.vetId} onChange={(e) => setDialog({ ...dialog, draft: { ...dialog.draft, vetId: e.target.value } })}>
                  {vets.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label={t`Date`} htmlFor="bk-date">
                <DatePicker
                  id="bk-date"
                  label={t`Appointment date`}
                  value={dialog.draft.date}
                  onChange={(date) => setDialog({ ...dialog, draft: { ...dialog.draft, date } })}
                />
              </Field>
              <Field label={t`Time`} htmlFor="bk-time">
                <input id="bk-time" type="time" value={dialog.draft.time} onChange={(e) => setDialog({ ...dialog, draft: { ...dialog.draft, time: e.target.value } })} />
              </Field>
              <Field label={t`Duration`} htmlFor="bk-duration">
                <NativeSelect id="bk-duration" value={dialog.draft.durationMin} onChange={(e) => setDialog({ ...dialog, draft: { ...dialog.draft, durationMin: Number(e.target.value) } })}>
                  {[...new Set([15, 20, 30, 45, 60, dialog.draft.durationMin])].toSorted((a, b) => a - b).map((m) => (
                    <option key={m} value={m}>
                      <Plural value={m} one="# minute" other="# minutes" />
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label={t`Reason`} htmlFor="bk-reason">
                <input id="bk-reason" value={dialog.draft.reason} placeholder={t`e.g. Annual vaccination…`} onChange={(e) => setDialog({ ...dialog, draft: { ...dialog.draft, reason: e.target.value } })} />
              </Field>
            </div>
            {dialogConflict && (
              <div className="form-warning" role="alert">
                <AlertTriangle size={15} />
                <div>
                  <strong>
                    {t`${conflictVetName} is already booked at ${formatTime(dialogConflict.startsAt)}`}
                  </strong>
                  <span>
                    {conflictPatientName} · {dialogConflict.reason} · <Trans>{dialogConflict.durationMin} min</Trans>
                  </span>
                  <label className="form-warning-override">
                    <input
                      type="checkbox"
                      checked={dialog.override}
                      onChange={(e) => setDialog({ ...dialog, override: e.target.checked })}
                    />
                    <Trans>Book anyway — double-book this veterinarian</Trans>
                  </label>
                </div>
              </div>
            )}
            {dialogInPast && !dialogConflict && (
              <p className="form-hint">
                <Trans>This appointment starts in the past. Saving is allowed for record-keeping.</Trans>
              </p>
            )}
            <div className="panel-footer">
              <button className="button secondary" onClick={() => setDialog(null)}>
                <Trans>Cancel</Trans>
              </button>
              <button
                className="button primary"
                onClick={submitDialog}
                disabled={!dialog.draft.patientId || !dialog.draft.date || !dialog.draft.time || (!!dialogConflict && !dialog.override)}
              >
                {dialog.mode === 'book' ? <Trans>Book appointment</Trans> : <Trans>Save new time</Trans>}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

const WalkInForm = ({
  patients,
  onSubmit,
  onCancel,
  disabled,
}: {
  patients: { id: string; name: string }[]
  onSubmit: (patientId: string, reason: string) => void
  onCancel: () => void
  disabled: boolean
}) => {
  const { t } = useLingui()
  const [patientId, setPatientId] = useState(patients[0]?.id ?? '')
  const [reason, setReason] = useState('')
  return (
    <div className="walkin-form">
      <NativeSelect value={patientId} onChange={(e) => setPatientId(e.target.value)} aria-label={t`Walk-in patient`}>
        {patients.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </NativeSelect>
      <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t`e.g. Nail trim…`} aria-label={t`Walk-in reason`} />
      <button className="button primary" disabled={disabled || !patientId} onClick={() => { onSubmit(patientId, reason); onCancel() }}>
        <Trans>Add</Trans>
      </button>
      <button className="icon-button" onClick={onCancel} aria-label={t`Cancel walk-in`}>
        <X size={15} />
      </button>
    </div>
  )
}
