import { Stethoscope } from 'lucide-react'
import { Trans, useLingui } from '@lingui/react/macro'
import { Panel, PageHeader } from '@/components/patterns/fields'
import { useClinic } from '@/lib/vet/store'
import { compareTime, formatDate } from '@/lib/vet/format'

/**
 * Empty consultation state (2026-10-30 plan, phase C): no active Visit —
 * prompt to open an appointment plus the recent-visit list. Extracted
 * verbatim from the Consultations body.
 */
export const NoActiveConsultation = ({ onOpen }: { onOpen: (encounterId: string) => void }) => {
  const { t } = useLingui()
  const { data } = useClinic()
  const recentEncounters = data.encounters.toSorted((a, b) => compareTime(b.openedAt, a.openedAt)).slice(0, 8)
  return (
    <>
      <PageHeader title={t`Consultation`} description={t`Open an appointment to start a consultation.`} />
      <Panel title={t`No active consultation`}>
        <p className="empty-state">
          <Trans>Choose a booked appointment from the calendar to begin, or open a past visit below.</Trans>
        </p>
        {recentEncounters.length > 0 && (
          <div className="activity-list">
            {recentEncounters.map((encounter) => {
              const encounterPatient = data.patients.find((p) => p.id === encounter.patientId)
              return (
                <div className="activity-row" key={encounter.id}>
                  <div className="activity-mark"><Stethoscope size={14} /></div>
                  <div>
                    <strong>{encounterPatient?.name ?? t`Unknown patient`}</strong>
                    <span>
                      {formatDate(encounter.openedAt)} ·{' '}
                      {encounter.status === 'open' ? <Trans>Consultation in progress</Trans> : <Trans>Archived visit</Trans>}
                    </span>
                  </div>
                  <button className="small-button" onClick={() => onOpen(encounter.id)}>
                    {encounter.status === 'open' ? <Trans>Continue</Trans> : <Trans>View</Trans>}
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </Panel>
    </>
  )
}
