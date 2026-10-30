import type { DragEvent } from 'react'
import { Trans, useLingui } from '@lingui/react/macro'
import { Stethoscope, UserX } from 'lucide-react'
import { Pill } from '@/components/vet/fields'
import { useClinic } from '@/lib/vet/store'
import { formatTime, statusLabel, statusTone } from '@/lib/vet/format'
import type { Appointment, Patient, StaffUser } from '@/lib/vet/types'

/**
 * Day-view appointment card (2026-10-30 plan, phase C): status chip plus the
 * check-in / start / reschedule / no-show / cancel actions, extracted verbatim
 * from the ScheduleView body. The week grid keeps its own compact button.
 */
export const AppointmentCard = ({
  appointment: a,
  patient,
  vet,
  draggable,
  dragging,
  disabled,
  onReschedule,
  onDragStart,
  onDragEnd,
}: {
  appointment: Appointment
  patient: Patient | undefined
  vet: StaffUser | undefined
  draggable: boolean
  dragging: boolean
  disabled: boolean
  onReschedule: (appointmentId: string) => void
  onDragStart: (e: DragEvent, id: string) => void
  onDragEnd: () => void
}) => {
  const { t } = useLingui()
  const { dispatch } = useClinic()
  return (
    <div
      className={`cal-appt status-${a.status}${dragging ? ' dragging' : ''}`}
      draggable={draggable}
      onDragStart={(e) => onDragStart(e, a.id)}
      onDragEnd={onDragEnd}
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
          <button className="small-button" onClick={() => dispatch({ type: 'setAppointmentStatus', id: a.id, status: 'checked_in' })} disabled={disabled}>
            <Trans>Check in</Trans>
          </button>
        )}
        {(a.status === 'booked' || a.status === 'checked_in') && (
          <button className="small-button" onClick={() => dispatch({ type: 'startEncounter', appointmentId: a.id })} disabled={disabled}>
            <Stethoscope size={13} /> <Trans>Start</Trans>
          </button>
        )}
        {a.status === 'booked' && (
          <>
            <button className="text-button" onClick={() => onReschedule(a.id)} disabled={disabled}>
              <Trans>Reschedule</Trans>
            </button>
            <button className="text-button" onClick={() => dispatch({ type: 'setAppointmentStatus', id: a.id, status: 'no_show' })} disabled={disabled} title={t`Mark no-show`}>
              <UserX size={13} /> <Trans>No-show</Trans>
            </button>
            <button className="text-button" onClick={() => dispatch({ type: 'setAppointmentStatus', id: a.id, status: 'cancelled' })} disabled={disabled}>
              <Trans>Cancel</Trans>
            </button>
          </>
        )}
      </div>
    </div>
  )
}
