import { useState } from 'react'
import { Trans, useLingui } from '@lingui/react/macro'
import { DatePicker } from '@/components/vet/date-picker'
import { Field, Panel } from '@/components/vet/fields'
import { useClinic } from '@/lib/vet/store'
import type { Encounter } from '@/lib/vet/types'

/**
 * Follow-up booking panel for the live consultation (2026-10-30 plan, phase
 * C), extracted verbatim from the Consultations body. Derives the patient and
 * the originating appointment for the follow-up reason.
 */
export const FollowUpPanel = ({ encounter }: { encounter: Encounter }) => {
  const { t } = useLingui()
  const { data, dispatch } = useClinic()
  const [followUpDate, setFollowUpDate] = useState('')
  const [followUpTime, setFollowUpTime] = useState('10:00')
  const patient = data.patients.find((p) => p.id === encounter.patientId)
  const appt = data.appointments.find((a) => a.id === encounter.appointmentId)

  const bookFollowUp = () => {
    if (!followUpDate || !patient) return
    dispatch({
      type: 'bookAppointment',
      appointment: {
        patientId: patient.id,
        startsAt: `${followUpDate}T${followUpTime || '10:00'}:00+07:00`,
        durationMin: 30,
        reason: appt ? t`Follow-up: ${appt.reason}` : t`Follow-up`,
        vetId: encounter.attendingId,
      },
    })
    setFollowUpDate('')
  }

  return (
    <Panel title={t`Follow-up`} description={t`Book the next visit before closing`}>
      <div className="inline-form nested">
        <div className="form-grid">
          <Field label={t`Follow-up date`} htmlFor="fu-date">
            <DatePicker id="fu-date" label={t`Follow-up date`} value={followUpDate} onChange={setFollowUpDate} />
          </Field>
          <Field label={t`Time`} htmlFor="fu-time">
            <input id="fu-time" type="time" value={followUpTime} onChange={(e) => setFollowUpTime(e.target.value)} />
          </Field>
        </div>
        <button className="button secondary" onClick={bookFollowUp} disabled={!followUpDate}>
          <Trans>Book follow-up</Trans>
        </button>
      </div>
    </Panel>
  )
}
