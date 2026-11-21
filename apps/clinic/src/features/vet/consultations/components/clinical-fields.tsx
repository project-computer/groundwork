import { useState } from 'react'
import { Trans, useLingui } from '@lingui/react/macro'
import { Field, Panel } from '@/components/patterns/fields'
import { useClinic } from '@/lib/vet/store'
import type { Encounter } from '@/lib/vet/types'

/**
 * Structured clinical fields (P1-8, backend 0005 parity): chief complaint,
 * symptoms, examination findings and the treatment plan — free-text, saved
 * as one audited write, and printed/exported with the visit record.
 */
export const ClinicalFieldsPanel = ({ encounter }: { encounter: Encounter }) => {
  const { dispatch } = useClinic()
  const { t } = useLingui()
  const [chiefComplaint, setChiefComplaint] = useState(encounter.chiefComplaint ?? '')
  const [symptoms, setSymptoms] = useState(encounter.symptoms ?? '')
  const [examination, setExamination] = useState(encounter.examination ?? '')
  const [treatmentPlan, setTreatmentPlan] = useState(encounter.treatmentPlan ?? '')
  const [saved, setSaved] = useState(false)

  const dirty =
    chiefComplaint !== (encounter.chiefComplaint ?? '') ||
    symptoms !== (encounter.symptoms ?? '') ||
    examination !== (encounter.examination ?? '') ||
    treatmentPlan !== (encounter.treatmentPlan ?? '')

  return (
    <Panel title={t`Clinical findings`} description={t`Chief complaint, symptoms, examination and treatment plan`}>
      <div className="form-grid">
        <Field label={t`Chief complaint`} htmlFor="cc-text">
          <input
            id="cc-text"
            value={chiefComplaint}
            onChange={(e) => {
              setChiefComplaint(e.target.value)
              setSaved(false)
            }}
            placeholder={t`e.g. Shaking head, scratching left ear`}
          />
        </Field>
        <Field label={t`Symptoms`} htmlFor="sym-text">
          <textarea id="sym-text" rows={2} value={symptoms} onChange={(e) => { setSymptoms(e.target.value); setSaved(false) }} placeholder={t`What the owner reports`} />
        </Field>
        <Field label={t`Examination`} htmlFor="exam-text">
          <textarea id="exam-text" rows={2} value={examination} onChange={(e) => { setExamination(e.target.value); setSaved(false) }} placeholder={t`Findings on hands`} />
        </Field>
        <Field label={t`Treatment plan`} htmlFor="plan-text">
          <textarea id="plan-text" rows={2} value={treatmentPlan} onChange={(e) => { setTreatmentPlan(e.target.value); setSaved(false) }} placeholder={t`Plan for this visit and follow-up`} />
        </Field>
      </div>
      <button
        className="button secondary"
        disabled={!dirty}
        onClick={() => {
          dispatch({
            type: 'updateClinicalFields',
            encounterId: encounter.id,
            fields: { chiefComplaint, symptoms, examination, treatmentPlan },
          })
          setSaved(true)
        }}
      >
        {saved ? <Trans>Saved</Trans> : <Trans>Save findings</Trans>}
      </button>
    </Panel>
  )
}
