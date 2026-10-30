import { Trans, useLingui } from '@lingui/react/macro'
import { Panel } from '@/components/vet/fields'
import { useClinic, usePermission } from '@/lib/vet/store'
import { formatDate, formatTime } from '@/lib/vet/format'
import type { Appointment } from '@/lib/vet/types'

/**
 * Upcoming side panel (2026-10-30 plan, phase C): the next booked
 * appointments after the selected day, extracted from the ScheduleView body.
 */
export const UpcomingList = ({ upcoming, onReschedule }: { upcoming: Appointment[]; onReschedule: (appointmentId: string) => void }) => {
  const { t } = useLingui()
  const { data } = useClinic()
  const permission = usePermission('appointments.write')
  return (
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
              <button className="text-button" onClick={() => onReschedule(a.id)} disabled={!permission.allowed}>
                <Trans>Reschedule</Trans>
              </button>
            </div>
          )
        })}
      </div>
    </Panel>
  )
}
