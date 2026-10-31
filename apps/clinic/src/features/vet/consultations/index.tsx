import { useState } from 'react'
import { Trans, useLingui } from '@lingui/react/macro'
import { Field, NativeSelect, Panel, PageHeader, Pill } from '@/components/patterns/fields'
import { useClinic } from '@/lib/vet/store'
import { speciesLabel, statusLabel } from '@/lib/vet/format'
import { ClosedEncounter } from './closed-encounter'
import { ClinicalNotes } from './clinical-notes'
import { FollowUpPanel } from './follow-up-panel'
import { NoActiveConsultation } from './no-active-consultation'
import { PatientSnapshot, SnapshotPanel } from './patient-snapshot'
import { PrescriptionPanel } from './prescription-panel'
import { VaccinationPanel } from './vaccination-panel'
import { VitalsPanel } from './vitals-panel'

/**
 * Consultation View (composition root, 2026-10-30 plan, phase C): the live
 * Visit workspace — snapshot, vitals, vaccinations, diagnoses and follow-up
 * compose here; prescriptions, notes, the archived record and the empty state
 * live in their own files beside. The open Visit resolves from the session's
 * active encounter, falling back to the first open one.
 */
export const Consultations = ({ onOpen }: { onOpen: (encounterId: string) => void }) => {
  const { data, session, dispatch } = useClinic()
  const { t } = useLingui()
  const open =
    data.encounters.find((e) => e.id === session.activeEncounterId) ??
    data.encounters.find((e) => e.status === 'open')
  const patient = open && data.patients.find((p) => p.id === open.patientId)
  const appt = open && data.appointments.find((a) => a.id === open.appointmentId)
  const [dxText, setDxText] = useState('')
  const [dxStatus, setDxStatus] = useState<'provisional' | 'confirmed'>('provisional')

  if (!open || !patient) return <NoActiveConsultation onOpen={onOpen} />
  if (open.status === 'closed') return <ClosedEncounter encounter={open} patient={patient} />

  const apptSuffix = appt ? ` · ${appt.reason}` : ''
  return (
    <>
      <PageHeader
        title={t`Consultation`}
        description={t`Clinical record for ${patient.name} · ${speciesLabel[patient.species]} · ${patient.breed}${apptSuffix}`}
        action={
          <Pill tone="ok" dot>
            <Trans>Saved locally</Trans>
          </Pill>
        }
      />
      <div className="consult-grid">
        <div className="side-stack">
          <SnapshotPanel>
            <PatientSnapshot patient={patient} />
            {(patient.allergies.length > 0 || patient.medicalAlerts.length > 0) && (
              <div className="patient-flags consult-flags" role="alert">
                {patient.allergies.map((a) => (
                  <Pill key={a} tone="bad" dot>
                    <Trans>Allergy: {a}</Trans>
                  </Pill>
                ))}
                {patient.medicalAlerts.map((a) => (
                  <Pill key={a} tone="warn" dot>
                    {a}
                  </Pill>
                ))}
              </div>
            )}
          </SnapshotPanel>
          <VitalsPanel encounter={open} />
          <VaccinationPanel encounter={open} patient={patient} />
        </div>
        <div className="side-stack">
          <Panel title={t`Diagnoses`} description={t`Provisional working diagnoses and confirmed findings`}>
            <div className="inline-form nested">
              <div className="form-grid">
                <Field label={t`Diagnosis`} htmlFor="dx-text">
                  <input id="dx-text" value={dxText} onChange={(e) => setDxText(e.target.value)} placeholder={t`e.g. Soft tissue strain, right stifle…`} />
                </Field>
                <Field label={t`Status`} htmlFor="dx-status">
                  <NativeSelect id="dx-status" value={dxStatus} onChange={(e) => setDxStatus(e.target.value as 'provisional' | 'confirmed')}>
                    <option value="provisional">{t`Provisional`}</option>
                    <option value="confirmed">{t`Confirmed`}</option>
                  </NativeSelect>
                </Field>
              </div>
              <button
                className="button secondary"
                disabled={!dxText.trim()}
                onClick={() => {
                  dispatch({ type: 'addDiagnosis', encounterId: open.id, diagnosis: { description: dxText.trim(), status: dxStatus } })
                  setDxText('')
                }}
              >
                <Trans>Add diagnosis</Trans>
              </button>
            </div>
            <div className="rx-list">
              {open.diagnoses.length === 0 && <p className="empty-state"><Trans>No diagnoses recorded yet.</Trans></p>}
              {open.diagnoses.map((d) => (
                <div className="rx-row" key={d.id}>
                  <div>
                    <strong>{d.description}</strong>
                    <span>{statusLabel(d.status)}</span>
                  </div>
                  {d.status === 'provisional' ? (
                    <button
                      className="small-button"
                      onClick={() => dispatch({ type: 'confirmDiagnosis', encounterId: open.id, diagnosisId: d.id })}
                      aria-label={t`Confirm diagnosis ${d.description}`}
                    >
                      <Trans>Confirm</Trans>
                    </button>
                  ) : (
                    <Pill tone="ok" dot>{statusLabel(d.status)}</Pill>
                  )}
                </div>
              ))}
            </div>
          </Panel>
          <PrescriptionPanel encounter={open} patient={patient} />
          <ClinicalNotes encounter={open} />
          <FollowUpPanel encounter={open} />
        </div>
      </div>
    </>
  )
}
