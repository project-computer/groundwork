import type { ReactNode } from 'react'
import { Trans, useLingui } from '@lingui/react/macro'
import { Panel } from '@/components/patterns/fields'
import { useClinic } from '@/lib/vet/store'
import { sexLabel } from '@/lib/vet/format'
import type { Patient } from '@/lib/vet/types'

/**
 * Patient identity block (2026-10-30 plan, phase C), shared by the live and
 * archived consultation views — extracted verbatim from the Consultations
 * body. `children` extends the identity lines (the archived view appends
 * opened/closed/attending details).
 */
export const PatientSnapshot = ({ patient, children }: { patient: Patient; children?: ReactNode }) => {
  const { data } = useClinic()
  return (
    <div className="patient-profile">
      <div className="large-patient-avatar">{patient.name.slice(0, 1)}</div>
      <div>
        <h3>{patient.name}</h3>
        <span>
          {patient.mrn} · {sexLabel[patient.sex]} · {patient.breed}
        </span>
        <span><Trans>Owner: {data.owners.find((o) => o.id === patient.ownerId)?.name}</Trans></span>
        {children}
      </div>
    </div>
  )
}

/** The snapshot panel wrapper both consultation views use. */
export const SnapshotPanel = ({ children }: { children: ReactNode }) => {
  const { t } = useLingui()
  return (
    <Panel title={t`Patient snapshot`} description={t`Current patient details`}>
      {children}
    </Panel>
  )
}
