import { useState } from 'react'
import { Trans, useLingui } from '@lingui/react/macro'
import { Field, Panel } from '@/components/patterns/fields'
import { useClinic } from '@/lib/vet/store'
import type { Encounter, Vitals } from '@/lib/vet/types'

/**
 * Vitals form panel for the live consultation (2026-10-30 plan, phase C),
 * extracted from the Consultations body. Owns the vitals draft and resets it
 * when a different encounter opens.
 */
export const VitalsPanel = ({ encounter }: { encounter: Encounter }) => {
  const { t } = useLingui()
  const { dispatch } = useClinic()
  const [vitals, setVitals] = useState<Vitals>(encounter.vitals)
  // Reset the vitals draft when a different encounter opens. Adjusting state
  // during render keeps the reset in the same pass — no effect, no stale deps.
  const [vitalsEncounterId, setVitalsEncounterId] = useState(encounter.id)
  if (encounter.id !== vitalsEncounterId) {
    setVitalsEncounterId(encounter.id)
    setVitals(encounter.vitals)
  }
  return (
    <Panel title={t`Vitals`} description={t`Weight, temperature, pulse and respiration`}>
      <div className="form-grid">
        <Field label={t`Weight (kg)`} htmlFor="vt-weight">
          <input id="vt-weight" inputMode="decimal" value={vitals.weightKg} onChange={(e) => setVitals({ ...vitals, weightKg: e.target.value })} placeholder={t`e.g. 28.6`} />
        </Field>
        <Field label={t`Temperature (°C)`} htmlFor="vt-temp">
          <input id="vt-temp" inputMode="decimal" value={vitals.tempC} onChange={(e) => setVitals({ ...vitals, tempC: e.target.value })} placeholder={t`e.g. 38.6`} />
        </Field>
        <Field label={t`Heart rate (bpm)`} htmlFor="vt-hr">
          <input id="vt-hr" inputMode="numeric" value={vitals.heartRate} onChange={(e) => setVitals({ ...vitals, heartRate: e.target.value })} placeholder={t`e.g. 96`} />
        </Field>
        <Field label={t`Respiratory rate`} htmlFor="vt-rr">
          <input id="vt-rr" inputMode="numeric" value={vitals.respRate} onChange={(e) => setVitals({ ...vitals, respRate: e.target.value })} placeholder={t`e.g. 22`} />
        </Field>
      </div>
      <div className="panel-footer">
        <button
          className="button secondary"
          onClick={() => dispatch({ type: 'updateVitals', encounterId: encounter.id, vitals })}
        >
          <Trans>Record vitals</Trans>
        </button>
      </div>
    </Panel>
  )
}
