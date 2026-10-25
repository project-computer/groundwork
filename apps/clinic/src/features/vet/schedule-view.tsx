import { useMemo, useState } from 'react'
import { CalendarPlus, ChevronLeft, ChevronRight, DoorOpen, Stethoscope, UserX, X } from 'lucide-react'
import { Field, NativeSelect, Panel, PageHeader, Pill } from '@/components/vet/fields'
import { useClinic, usePermission } from '@/lib/vet/store'
import { formatDate, formatTime, statusTone, todayKey } from '@/lib/vet/format'

const CLINIC_TZ_SUFFIX = '+07:00'

const pad = (n: number) => String(n).padStart(2, '0')

/** Appointment timestamps share the clinic-offset convention used by seeds and bookings. */
const apptDay = (iso: string) => iso.slice(0, 10)

function shiftDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function weekDays(iso: string): string[] {
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

interface BookingDraft {
  patientId: string
  date: string
  time: string
  durationMin: number
  reason: string
  vetId: string
}

export function ScheduleView() {
  const { data, session, dispatch } = useClinic()
  const permission = usePermission('appointments.write')
  const [dayIso, setDayIso] = useState(todayKey())
  const [mode, setMode] = useState<'day' | 'week'>('day')
  const [dialog, setDialog] = useState<{ mode: 'book' | 'reschedule'; appointmentId?: string; draft: BookingDraft } | null>(null)
  const [walkInOpen, setWalkInOpen] = useState(false)

  const vets = data.users.filter((u) => u.role === 'veterinarian')

  const dayAppointments = useMemo(
    () =>
      data.appointments
        .filter((a) => apptDay(a.startsAt) === dayIso)
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
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
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
    .slice(0, 6)

  const openBooking = () => {
    setDialog({
      mode: 'book',
      draft: {
        patientId: data.patients[0]?.id ?? '',
        date: dayIso,
        time: '10:00',
        durationMin: 30,
        reason: '',
        vetId: vets[0]?.id ?? '',
      },
    })
  }

  const openReschedule = (appointmentId: string) => {
    const appt = data.appointments.find((a) => a.id === appointmentId)
    if (!appt) return
    setDialog({
      mode: 'reschedule',
      appointmentId,
      draft: {
        patientId: appt.patientId,
        date: apptDay(appt.startsAt),
        time: appt.startsAt.slice(11, 16),
        durationMin: appt.durationMin,
        reason: appt.reason,
        vetId: appt.vetId,
      },
    })
  }

  const submitDialog = () => {
    if (!dialog) return
    const { mode: dialogMode, appointmentId, draft } = dialog
    if (!draft.patientId || !draft.date || !draft.time) return
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
        title="Appointments & queue"
        description="Book, check in and run the day. Walk-ins land in the waiting queue."
        action={
          <button className="button primary" onClick={openBooking} disabled={!permission.allowed} title={permission.reason || undefined}>
            <CalendarPlus size={16} /> Book appointment
          </button>
        }
      />
      <div className="toolbar">
        <div className="date-nav">
          <button className="icon-button" onClick={() => setDayIso(shiftDays(dayIso, mode === 'week' ? -7 : -1))} aria-label="Previous day">
            <ChevronLeft size={17} />
          </button>
          <strong>{mode === 'day' ? dayLabel(dayIso) : `Week of ${dayLabel(weekDays(dayIso)[0])}`}</strong>
          <button className="icon-button" onClick={() => setDayIso(shiftDays(dayIso, mode === 'week' ? 7 : 1))} aria-label="Next day">
            <ChevronRight size={17} />
          </button>
          <button className="small-button today-button" onClick={() => setDayIso(todayKey())}>
            Today
          </button>
        </div>
        <div className="seg" role="tablist" aria-label="Calendar mode">
          {(['day', 'week'] as const).map((m) => (
            <button key={m} role="tab" aria-selected={mode === m} className={mode === m ? 'active' : ''} onClick={() => setMode(m)}>
              {m === 'day' ? 'Day' : 'Week'}
            </button>
          ))}
        </div>
      </div>

      {mode === 'day' ? (
        <div className="dashboard-grid">
          <Panel title={`Schedule — ${dayLabel(dayIso)}`} description={`${dayAppointments.length} appointments`}>
            <div className="cal-day">
              {dayAppointments.length === 0 && <p className="empty-state">No appointments scheduled for this day.</p>}
              {HOURS.map((hour) => {
                const slot = `${pad(hour)}:00`
                const inSlot = dayAppointments.filter((a) => a.startsAt.slice(11, 13) === slot.slice(0, 2))
                return (
                  <div className="cal-row" key={hour}>
                    <time>{slot}</time>
                    <div className="cal-cells">
                      {inSlot.map((a) => {
                        const patient = data.patients.find((p) => p.id === a.patientId)
                        const vet = data.users.find((u) => u.id === a.vetId)
                        return (
                          <div className={`cal-appt status-${a.status}`} key={a.id}>
                            <div className="appointment-main">
                              <strong>
                                {patient?.name ?? 'Unknown'} <span className="cal-time-chip">{formatTime(a.startsAt)} · {a.durationMin}min</span>
                              </strong>
                              <span>
                                {a.reason} · {vet?.name ?? 'Unassigned'}
                              </span>
                            </div>
                            <Pill tone={statusTone(a.status)} dot>
                              {a.status.replace('_', ' ')}
                            </Pill>
                            <div className="cal-actions">
                              {a.status === 'booked' && (
                                <button className="small-button" onClick={() => dispatch({ type: 'setAppointmentStatus', id: a.id, status: 'checked_in' })} disabled={!permission.allowed}>
                                  Check in
                                </button>
                              )}
                              {(a.status === 'booked' || a.status === 'checked_in') && (
                                <button className="small-button" onClick={() => dispatch({ type: 'startEncounter', appointmentId: a.id })} disabled={!permission.allowed}>
                                  <Stethoscope size={13} /> Start
                                </button>
                              )}
                              {a.status === 'booked' && (
                                <>
                                  <button className="text-button" onClick={() => openReschedule(a.id)} disabled={!permission.allowed}>
                                    Reschedule
                                  </button>
                                  <button className="text-button" onClick={() => dispatch({ type: 'setAppointmentStatus', id: a.id, status: 'no_show' })} disabled={!permission.allowed} title="Mark no-show">
                                    <UserX size={13} /> No-show
                                  </button>
                                  <button className="text-button" onClick={() => dispatch({ type: 'setAppointmentStatus', id: a.id, status: 'cancelled' })} disabled={!permission.allowed}>
                                    Cancel
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
            <Panel title="Waiting queue" description="Checked-in patients waiting for the vet">
              <div className="appointment-list">
                {waiting.length === 0 && <p className="empty-state">No one waiting right now.</p>}
                {waiting.map((a) => {
                  const patient = data.patients.find((p) => p.id === a.patientId)
                  return (
                    <div className="appointment-row" key={a.id}>
                      <div className="pet-mini">{patient?.name.slice(0, 1)}</div>
                      <div className="appointment-main">
                        <strong>{patient?.name}</strong>
                        <span>Since {formatTime(a.startsAt)}</span>
                      </div>
                      <button className="small-button" onClick={() => dispatch({ type: 'startEncounter', appointmentId: a.id })} disabled={!permission.allowed}>
                        <Stethoscope size={13} /> Start
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
                    <DoorOpen size={16} /> Add walk-in
                  </button>
                )}
              </div>
            </Panel>
            <Panel title="Upcoming" description="Next booked appointments after this day">
              <div className="appointment-list">
                {upcoming.length === 0 && <p className="empty-state">Nothing booked ahead.</p>}
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
                        Reschedule
                      </button>
                    </div>
                  )
                })}
              </div>
            </Panel>
          </div>
        </div>
      ) : (
        <Panel title="Week overview" description="Appointments across the clinic week">
          <div className="week-grid">
            {weekDays(dayIso).map((iso) => {
              const list = (weekAppointments.get(iso) ?? []).sort((a, b) => a.startsAt.localeCompare(b.startsAt))
              return (
                <div className="week-col" key={iso}>
                  <header className={iso === todayKey() ? 'today' : ''}>
                    <strong>{shortDayLabel(iso)}</strong>
                    <span>{list.length}</span>
                  </header>
                  <div className="week-cells">
                    {list.map((a) => {
                      const patient = data.patients.find((p) => p.id === a.patientId)
                      return (
                        <button className={`cal-appt compact status-${a.status}`} key={a.id} onClick={() => { setDayIso(iso); setMode('day') }} title={`${patient?.name} · ${a.reason}`}>
                          <strong>{formatTime(a.startsAt)}</strong>
                          <span>{patient?.name}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
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
          <div className="modal" role="dialog" aria-modal="true" aria-label={dialog.mode === 'book' ? 'Book appointment' : 'Reschedule appointment'}>
            <div className="form-heading">
              <div>
                <strong>{dialog.mode === 'book' ? 'Book appointment' : 'Reschedule appointment'}</strong>
                <span>Appointments are saved to the local clinic database.</span>
              </div>
              <button className="icon-button" onClick={() => setDialog(null)} aria-label="Close dialog">
                <X size={17} />
              </button>
            </div>
            <div className="form-grid">
              <Field label="Patient" htmlFor="bk-patient">
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
              <Field label="Veterinarian" htmlFor="bk-vet">
                <NativeSelect id="bk-vet" value={dialog.draft.vetId} onChange={(e) => setDialog({ ...dialog, draft: { ...dialog.draft, vetId: e.target.value } })}>
                  {vets.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Date" htmlFor="bk-date">
                <input id="bk-date" type="date" value={dialog.draft.date} onChange={(e) => setDialog({ ...dialog, draft: { ...dialog.draft, date: e.target.value } })} />
              </Field>
              <Field label="Time" htmlFor="bk-time">
                <input id="bk-time" type="time" value={dialog.draft.time} onChange={(e) => setDialog({ ...dialog, draft: { ...dialog.draft, time: e.target.value } })} />
              </Field>
              <Field label="Duration" htmlFor="bk-duration">
                <NativeSelect id="bk-duration" value={dialog.draft.durationMin} onChange={(e) => setDialog({ ...dialog, draft: { ...dialog.draft, durationMin: Number(e.target.value) } })}>
                  {[15, 20, 30, 45, 60].map((m) => (
                    <option key={m} value={m}>
                      {m} minutes
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Reason" htmlFor="bk-reason">
                <input id="bk-reason" value={dialog.draft.reason} placeholder="e.g. Annual vaccination…" onChange={(e) => setDialog({ ...dialog, draft: { ...dialog.draft, reason: e.target.value } })} />
              </Field>
            </div>
            <div className="panel-footer">
              <button className="button secondary" onClick={() => setDialog(null)}>
                Cancel
              </button>
              <button className="button primary" onClick={submitDialog} disabled={!dialog.draft.patientId || !dialog.draft.date || !dialog.draft.time}>
                {dialog.mode === 'book' ? 'Book appointment' : 'Save new time'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function WalkInForm({
  patients,
  onSubmit,
  onCancel,
  disabled,
}: {
  patients: { id: string; name: string }[]
  onSubmit: (patientId: string, reason: string) => void
  onCancel: () => void
  disabled: boolean
}) {
  const [patientId, setPatientId] = useState(patients[0]?.id ?? '')
  const [reason, setReason] = useState('')
  return (
    <div className="walkin-form">
      <NativeSelect value={patientId} onChange={(e) => setPatientId(e.target.value)} aria-label="Walk-in patient">
        {patients.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </NativeSelect>
      <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Nail trim…" aria-label="Walk-in reason" />
      <button className="button primary" disabled={disabled || !patientId} onClick={() => { onSubmit(patientId, reason); onCancel() }}>
        Add
      </button>
      <button className="icon-button" onClick={onCancel} aria-label="Cancel walk-in">
        <X size={15} />
      </button>
    </div>
  )
}
