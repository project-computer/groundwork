import { Plural, Trans, useLingui } from '@lingui/react/macro'
import { AlertTriangle } from 'lucide-react'
import { Field, NativeSelect } from '@/components/vet/fields'
import { DatePicker } from '@/components/vet/date-picker'
import { Modal } from '@/components/vet/modal'
import { useClinic } from '@/lib/vet/store'
import { formatTime } from '@/lib/vet/format'
import { CLINIC_TZ_SUFFIX, findAppointmentConflict, isPastSlot, type AppointmentSlot } from '@/lib/vet/schedule'

export interface BookingDraft {
  patientId: string
  date: string
  time: string
  durationMin: number
  reason: string
  vetId: string
}

export interface BookingDialogState {
  mode: 'book' | 'reschedule'
  appointmentId?: string
  draft: BookingDraft
  override: boolean
}

/**
 * Book / reschedule dialog (2026-10-30 plan, phase C), extracted from the
 * ScheduleView body. Owns the live clash check — a double-booking only saves
 * once the user acknowledges it — and the book/reschedule dispatches; the
 * grids own the draft state and open the dialog.
 */
export const BookingDialog = ({
  state,
  onChange,
  onClose,
}: {
  state: BookingDialogState
  onChange: (next: BookingDialogState) => void
  onClose: () => void
}) => {
  const { t } = useLingui()
  const { data, dispatch } = useClinic()
  const vets = data.users.filter((u) => u.role === 'veterinarian')

  const draftSlot: AppointmentSlot | null =
    state.draft.date && state.draft.time
      ? {
          vetId: state.draft.vetId,
          startsAt: `${state.draft.date}T${state.draft.time}:00${CLINIC_TZ_SUFFIX}`,
          durationMin: state.draft.durationMin,
        }
      : null
  const conflict = draftSlot ? findAppointmentConflict(data.appointments, draftSlot, state.appointmentId) : undefined
  const conflictPatientName = conflict
    ? (data.patients.find((p) => p.id === conflict.patientId)?.name ?? t`Another patient`)
    : undefined
  const conflictVetName = conflict ? (data.users.find((u) => u.id === conflict.vetId)?.name ?? t`This vet`) : undefined
  const inPast = draftSlot ? isPastSlot(draftSlot) : false

  const submit = () => {
    const { mode, appointmentId, draft } = state
    if (!draft.patientId || !draft.date || !draft.time) return
    // A clash is only saved once the user has explicitly acknowledged it.
    if (conflict && !state.override) return
    const startsAt = `${draft.date}T${draft.time}:00${CLINIC_TZ_SUFFIX}`
    if (mode === 'book') {
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
    onClose()
  }

  return (
    <Modal
      label={state.mode === 'book' ? t`Book appointment` : t`Reschedule appointment`}
      title={state.mode === 'book' ? <Trans>Book appointment</Trans> : <Trans>Reschedule appointment</Trans>}
      subtitle={<Trans>Appointments are saved to the local clinic database.</Trans>}
      onClose={onClose}
    >
      <div className="form-grid">
        <Field label={t`Patient`} htmlFor="bk-patient">
          <NativeSelect
            id="bk-patient"
            value={state.draft.patientId}
            disabled={state.mode === 'reschedule'}
            onChange={(e) => onChange({ ...state, draft: { ...state.draft, patientId: e.target.value } })}
          >
            {data.patients.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} — {data.owners.find((o) => o.id === p.ownerId)?.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label={t`Veterinarian`} htmlFor="bk-vet">
          <NativeSelect id="bk-vet" value={state.draft.vetId} onChange={(e) => onChange({ ...state, draft: { ...state.draft, vetId: e.target.value } })}>
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
            value={state.draft.date}
            onChange={(date) => onChange({ ...state, draft: { ...state.draft, date } })}
          />
        </Field>
        <Field label={t`Time`} htmlFor="bk-time">
          <input id="bk-time" type="time" value={state.draft.time} onChange={(e) => onChange({ ...state, draft: { ...state.draft, time: e.target.value } })} />
        </Field>
        <Field label={t`Duration`} htmlFor="bk-duration">
          <NativeSelect id="bk-duration" value={state.draft.durationMin} onChange={(e) => onChange({ ...state, draft: { ...state.draft, durationMin: Number(e.target.value) } })}>
            {[...new Set([15, 20, 30, 45, 60, state.draft.durationMin])].toSorted((a, b) => a - b).map((m) => (
              <option key={m} value={m}>
                <Plural value={m} one="# minute" other="# minutes" />
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label={t`Reason`} htmlFor="bk-reason">
          <input id="bk-reason" value={state.draft.reason} placeholder={t`e.g. Annual vaccination…`} onChange={(e) => onChange({ ...state, draft: { ...state.draft, reason: e.target.value } })} />
        </Field>
      </div>
      {conflict && (
        <div className="form-warning" role="alert">
          <AlertTriangle size={15} />
          <div>
            <strong>
              {t`${conflictVetName} is already booked at ${formatTime(conflict.startsAt)}`}
            </strong>
            <span>
              {conflictPatientName} · {conflict.reason} · <Trans>{conflict.durationMin} min</Trans>
            </span>
            <label className="form-warning-override">
              <input
                type="checkbox"
                checked={state.override}
                onChange={(e) => onChange({ ...state, override: e.target.checked })}
              />
              <Trans>Book anyway — double-book this veterinarian</Trans>
            </label>
          </div>
        </div>
      )}
      {inPast && !conflict && (
        <p className="form-hint">
          <Trans>This appointment starts in the past. Saving is allowed for record-keeping.</Trans>
        </p>
      )}
      <div className="panel-footer">
        <button className="button secondary" onClick={onClose}>
          <Trans>Cancel</Trans>
        </button>
        <button
          className="button primary"
          onClick={submit}
          disabled={!state.draft.patientId || !state.draft.date || !state.draft.time || (!!conflict && !state.override)}
        >
          {state.mode === 'book' ? <Trans>Book appointment</Trans> : <Trans>Save new time</Trans>}
        </button>
      </div>
    </Modal>
  )
}
