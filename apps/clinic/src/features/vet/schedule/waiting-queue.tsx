import { useState } from 'react'
import { Trans, useLingui } from '@lingui/react/macro'
import { DoorOpen, Stethoscope } from 'lucide-react'
import { Panel } from '@/components/vet/fields'
import { useClinic, usePermission } from '@/lib/vet/store'
import { formatTime } from '@/lib/vet/format'
import type { Appointment } from '@/lib/vet/types'
import { WalkInForm } from './walk-in-form'

/**
 * Waiting queue side panel (2026-10-30 plan, phase C): checked-in patients
 * plus the walk-in entry, extracted from the ScheduleView body. Owns the
 * walk-in open/closed toggle and the `walkIn` dispatch.
 */
export const WaitingQueue = ({ waiting }: { waiting: Appointment[] }) => {
  const { t } = useLingui()
  const { data, session, dispatch } = useClinic()
  const permission = usePermission('appointments.write')
  const [walkInOpen, setWalkInOpen] = useState(false)

  const submitWalkIn = (patientId: string, reason: string) => {
    if (!patientId) return
    dispatch({ type: 'walkIn', patientId, reason, vetId: session.currentUserId })
  }

  return (
    <Panel title={t`Waiting queue`} description={t`Checked-in patients waiting for the vet`}>
      <div className="appointment-list">
        {waiting.length === 0 && <p className="empty-state"><Trans>No one waiting right now.</Trans></p>}
        {waiting.map((a) => {
          const patient = data.patients.find((p) => p.id === a.patientId)
          return (
            <div className="appointment-row" key={a.id}>
              <div className="patient-mini">{patient?.name.slice(0, 1)}</div>
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
  )
}
