import { Trans, useLingui } from '@lingui/react/macro'
import { Modal } from '@/components/patterns/modal'
import { useClinic } from '@/lib/vet/store'
import { formatDate, sexLabel, statusLabel } from '@/lib/vet/format'
import type { Encounter, Patient } from '@/lib/vet/types'

/**
 * Printable clinical outputs (plan MED-11 / RX-05): the consultation summary
 * and the prescription sheet, both rendered as a `.print-area` subtree the
 * browser prints alone — the same discipline as the billing receipt.
 */

/** Identity block shared by both sheets. */
const IdentityBlock = ({ encounter, patient }: { encounter: Encounter; patient: Patient }) => {
  const { data } = useClinic()
  const owner = data.owners.find((o) => o.id === patient.ownerId)
  const vet = data.users.find((u) => u.id === encounter.attendingId)
  return (
    <>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12.5px]">
        <span><Trans>Patient</Trans>: <strong>{patient.name}</strong> · {patient.mrn}</span>
        <span>{sexLabel[patient.sex]} · {patient.breed}</span>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12.5px]">
        <span>
          <Trans>Owner</Trans>: {owner?.name}
          {owner?.phone ? ` · ${owner.phone}` : ''}
        </span>
        <span>
          {encounter.status === 'closed' ? <Trans>Visit</Trans> : <Trans>Open visit</Trans>}: {formatDate(encounter.openedAt)}{encounter.closedAt ? ` — ${formatDate(encounter.closedAt)}` : ''}
        </span>
        {vet && <span><Trans>Vet</Trans>: {vet.name}</span>}
      </div>
    </>
  )
}

const SheetHeader = ({ title }: { title: string }) => {
  const { data } = useClinic()
  return (
    <header className="flex flex-col gap-0.5 text-center border-b border-dashed border-border pb-2.5">
      <h2 className="m-0 text-base">{data.clinic.name}</h2>
      <span className="text-xs text-muted-foreground">{title}</span>
      <span className="text-xs text-muted-foreground">{data.clinic.address}</span>
    </header>
  )
}

const PrintFooter = ({ onClose, label }: { onClose: () => void; label: string }) => (
  <div className="panel-footer print:hidden">
    <button className="button secondary" onClick={onClose}>
      <Trans>Close</Trans>
    </button>
    <button className="button primary" onClick={() => window.print()}>
      {label}
    </button>
  </div>
)

/** MED-11: the full clinical record of one Visit, ready to print. */
export const ConsultationSummaryDialog = ({ encounter, patient, onClose }: { encounter: Encounter; patient: Patient; onClose: () => void }) => {
  const { t } = useLingui()
  const { data } = useClinic()
  const vitals = [
    { label: t`Weight (kg)`, value: encounter.vitals.weightKg },
    { label: t`Temperature (°C)`, value: encounter.vitals.tempC },
    { label: t`Heart rate (bpm)`, value: encounter.vitals.heartRate },
    { label: t`Respiratory rate`, value: encounter.vitals.respRate },
  ]
  return (
    <Modal label={t`Consultation summary for ${patient.name}`} onClose={onClose}>
      <div className="print-area flex flex-col gap-3 tabular-nums print:visible print:absolute print:left-0 print:top-0 print:w-full print:p-6">
        <SheetHeader title={t`Consultation summary`} />
        <IdentityBlock encounter={encounter} patient={patient} />
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12.5px]">
          {vitals.map(({ label, value }) => (
            <span key={label}>
              {label}: <strong>{value || '—'}</strong>
            </span>
          ))}
        </div>
        {encounter.diagnoses.length > 0 && (
          <div className="flex flex-col gap-1 border-t border-border pt-2">
            <span className="text-[11.5px] font-semibold uppercase tracking-[0.04em] text-muted-foreground"><Trans>Diagnosis</Trans></span>
            {encounter.diagnoses.map((diagnosis) => (
              <div className="text-[12.5px]" key={diagnosis.id}>
                <strong>{diagnosis.description}</strong> · {statusLabel(diagnosis.status)}
              </div>
            ))}
          </div>
        )}
        {encounter.prescriptions.length > 0 && (
          <div className="flex flex-col gap-1 border-t border-border pt-2">
            <span className="text-[11.5px] font-semibold uppercase tracking-[0.04em] text-muted-foreground"><Trans>Prescriptions</Trans></span>
            {encounter.prescriptions.map((rx) => (
              <div className="text-[12.5px]" key={rx.id}>
                <strong>{rx.medication}</strong> — {rx.dose} · {rx.route} · {rx.frequency} · {rx.duration} · <Trans>qty {rx.quantity}</Trans>
              </div>
            ))}
          </div>
        )}
        {encounter.notes.length > 0 && (
          <div className="flex flex-col gap-1 border-t border-border pt-2">
            <span className="text-[11.5px] font-semibold uppercase tracking-[0.04em] text-muted-foreground"><Trans>Clinical notes</Trans></span>
            {encounter.notes.map((note) => {
              const author = data.users.find((u) => u.id === note.authorId)
              return (
                <div className="text-[12.5px]" key={note.id}>
                  <span className="text-muted-foreground">{formatDate(note.createdAt)}{author ? ` · ${author.name}` : ''}{note.amends ? ` · ${t`amendment`}` : ''}</span>
                  <p className="m-0">{note.body}</p>
                </div>
              )
            })}
          </div>
        )}
        <footer className="text-center text-xs text-muted-foreground border-t border-dashed border-border pt-2.5"><Trans>{data.clinic.name} · {data.clinic.timezone}</Trans></footer>
      </div>
      <PrintFooter onClose={onClose} label={t`Print summary`} />
    </Modal>
  )
}

/** RX-05: the prescription sheet for one Visit's medications. */
export const PrescriptionDialog = ({ encounter, patient, onClose }: { encounter: Encounter; patient: Patient; onClose: () => void }) => {
  const { t } = useLingui()
  const { data } = useClinic()
  const vet = data.users.find((u) => u.id === encounter.attendingId)
  return (
    <Modal label={t`Prescription for ${patient.name}`} onClose={onClose}>
      <div className="print-area flex flex-col gap-3 tabular-nums print:visible print:absolute print:left-0 print:top-0 print:w-full print:p-6">
        <SheetHeader title={t`Prescription`} />
        <IdentityBlock encounter={encounter} patient={patient} />
        <div className="flex flex-col gap-1 border-t border-border pt-2">
          <div className="grid grid-cols-[minmax(0,1fr)_120px_70px] gap-2 text-[11.5px] font-semibold uppercase tracking-[0.04em] text-muted-foreground border-b border-border pb-1">
            <span className="truncate"><Trans>Medication & instructions</Trans></span>
            <span className="truncate text-right"><Trans>Frequency</Trans></span>
            <span className="truncate text-right"><Trans>Qty</Trans></span>
          </div>
          {encounter.prescriptions.map((rx) => (
            <div className="grid grid-cols-[minmax(0,1fr)_120px_70px] gap-2 text-[12.5px] items-start" key={rx.id}>
              <span>
                <strong>{rx.medication}</strong>
                <span className="block text-muted-foreground">{rx.dose} · {rx.route} · {rx.duration}</span>
              </span>
              <span className="text-right">{rx.frequency}</span>
              <span className="text-right">{rx.quantity}</span>
            </div>
          ))}
        </div>
        <footer className="text-center text-xs text-muted-foreground border-t border-dashed border-border pt-2.5">
          {vet ? <Trans>Prescriber: {vet.name}</Trans> : null} · <Trans>Signature ____________________</Trans>
        </footer>
      </div>
      <PrintFooter onClose={onClose} label={t`Print prescription`} />
    </Modal>
  )
}
