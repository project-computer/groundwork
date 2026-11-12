import { useState } from 'react'
import { Trans, useLingui } from '@lingui/react/macro'
import { Panel, PageHeader, Pill } from '@/components/patterns/fields'
import { useClinic } from '@/lib/vet/store'
import { formatDate, statusLabel } from '@/lib/vet/format'
import type { Encounter, Patient } from '@/lib/vet/types'
import { PatientSnapshot, SnapshotPanel } from './patient-snapshot'
import { ConsultationSummaryDialog, PrescriptionDialog } from './clinical-prints'

/**
 * Archived consultation view (2026-10-30 plan, phase C): the read-only
 * clinical record for a closed Visit — snapshot, vitals, diagnoses,
 * prescriptions, notes and the billing hand-off. Extracted verbatim from the
 * Consultations body.
 */
export const ClosedEncounter = ({ encounter: open, patient }: { encounter: Encounter; patient: Patient }) => {
  const { t } = useLingui()
  const { data, dispatch } = useClinic()
  const [printSheet, setPrintSheet] = useState<'summary' | 'prescription' | null>(null)
  const invoice = data.invoices.find((i) => i.encounterId === open.id)
  const attending = data.users.find((u) => u.id === open.attendingId)
  const vitalsRows = [
    { label: t`Weight (kg)`, value: open.vitals.weightKg },
    { label: t`Temperature (°C)`, value: open.vitals.tempC },
    { label: t`Heart rate (bpm)`, value: open.vitals.heartRate },
    { label: t`Respiratory rate`, value: open.vitals.respRate },
  ]
  return (
    <>
      <PageHeader
        title={t`Consultation closed`}
        description={t`The clinical record for ${patient.name} is archived — notes, diagnoses and prescriptions are preserved.`}
        action={<Pill tone="muted" dot><Trans>Archived</Trans></Pill>}
      />
      <div className="consult-grid">
        <div className="side-stack">
          <SnapshotPanel>
            <PatientSnapshot patient={patient}>
              <span>
                {formatDate(open.openedAt)}
                {open.closedAt ? <> · <Trans>Closed {formatDate(open.closedAt)}</Trans></> : null}
                {attending ? <> · {attending.name}</> : null}
              </span>
            </PatientSnapshot>
          </SnapshotPanel>
          <Panel title={t`Vitals`} description={t`Weight, temperature, pulse and respiration`}>
            <div className="activity-list">
              {vitalsRows.map(({ label, value }) => (
                <div className="activity-row" key={label}>
                  <div>
                    <strong>{label}</strong>
                    <span>{value || '—'}</span>
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </div>
        <div className="side-stack">
          <Panel title={t`Diagnoses`} description={t`Provisional working diagnoses and confirmed findings`}>
            <div className="rx-list">
              {open.diagnoses.length === 0 && <p className="empty-state"><Trans>No diagnoses recorded yet.</Trans></p>}
              {open.diagnoses.map((diagnosis) => (
                <div className="rx-row" key={diagnosis.id}>
                  <div>
                    <strong>{diagnosis.description}</strong>
                    <span>{statusLabel(diagnosis.status)}</span>
                  </div>
                  <Pill tone={diagnosis.status === 'confirmed' ? 'ok' : 'warn'} dot>
                    {statusLabel(diagnosis.status)}
                  </Pill>
                </div>
              ))}
            </div>
          </Panel>
          <Panel title={t`Prescriptions`} description={t`Dispensed from pharmacy stock when the visit closes`}>
            <div className="rx-list">
              {open.prescriptions.length === 0 && <p className="empty-state"><Trans>No prescriptions on this visit.</Trans></p>}
              {open.prescriptions.map((rx) => (
                <div className="rx-row" key={rx.id}>
                  <div>
                    <strong>{rx.medication}</strong>
                    <span>
                      {rx.dose} · {rx.route} · {rx.frequency} · {rx.duration} · <Trans>qty {rx.quantity}</Trans>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </Panel>
          <Panel title={t`Clinical notes`} description={t`Authored notes are preserved as a revision history`}>
            {open.notes.length === 0 && <p className="empty-state"><Trans>No notes were recorded for this visit.</Trans></p>}
            {open.notes.length > 0 && (
              <div className="note-history">
                {open.notes.map((clinicalNote) => {
                  const author = data.users.find((u) => u.id === clinicalNote.authorId)
                  const amendmentReason = clinicalNote.amendReason || t`not recorded`
                  return (
                    <div key={clinicalNote.id} className={clinicalNote.amends ? 'note-entry amended' : 'note-entry'}>
                      <span>
                        {formatDate(clinicalNote.createdAt)}
                        {author ? ` · ${author.name}` : ''}
                        {clinicalNote.amends && (
                          <>
                            {' · '}
                            <Pill tone="warn" dot>
                              <Trans>Amendment</Trans>
                            </Pill>
                          </>
                        )}
                      </span>
                      <p>{clinicalNote.body}</p>
                      {clinicalNote.amends && (
                        <span className="note-amend-meta">
                          <Trans>Reason: {amendmentReason}</Trans>
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </Panel>
          <Panel title={t`Visit complete`}>
            <p className="empty-state">
              {invoice ? t`Draft invoice ${invoice.number} was created and is ready to post in Billing.` : t`No invoice was created for this visit.`}
            </p>
            <div className="panel-footer">
              <button className="button secondary" onClick={() => setPrintSheet('summary')}>
                <Trans>Print summary</Trans>
              </button>
              {open.prescriptions.length > 0 && (
                <button className="button secondary" onClick={() => setPrintSheet('prescription')}>
                  <Trans>Print prescription</Trans>
                </button>
              )}
              <button
                className="button primary"
                onClick={() => dispatch({ type: 'session', patch: { view: 'billing', activeEncounterId: undefined } })}
              >
                <Trans>Go to billing</Trans>
              </button>
            </div>
          </Panel>
        </div>
      </div>
      {printSheet === 'summary' && <ConsultationSummaryDialog encounter={open} patient={patient} onClose={() => setPrintSheet(null)} />}
      {printSheet === 'prescription' && <PrescriptionDialog encounter={open} patient={patient} onClose={() => setPrintSheet(null)} />}
    </>
  )
}
