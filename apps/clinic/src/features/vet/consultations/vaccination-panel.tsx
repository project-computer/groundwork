import { useState } from 'react'
import { CalendarDays } from 'lucide-react'
import { Trans, useLingui } from '@lingui/react/macro'
import { DatePicker } from '@/components/vet/date-picker'
import { Field, Panel } from '@/components/vet/fields'
import { useClinic } from '@/lib/vet/store'
import { formatDate } from '@/lib/vet/format'
import type { Encounter, Patient } from '@/lib/vet/types'

const nowIso = () => new Date().toISOString()

/**
 * Vaccination panel for the live consultation (2026-10-30 plan, phase C):
 * the record form (vaccine options from live inventory) plus the patient's
 * vaccination history, extracted verbatim from the Consultations body.
 */
export const VaccinationPanel = ({ encounter, patient }: { encounter: Encounter; patient: Patient }) => {
  const { t } = useLingui()
  const { data, dispatch } = useClinic()
  const [vacName, setVacName] = useState('')
  const [vacLot, setVacLot] = useState('')
  const [vacNextDue, setVacNextDue] = useState('')
  const patientVaccinations = data.vaccinations.filter((v) => v.patientId === patient.id)

  const recordVac = () => {
    if (!vacName.trim()) return
    dispatch({
      type: 'recordVaccination',
      patientId: patient.id,
      vaccination: {
        vaccineName: vacName.trim(),
        lotNumber: vacLot.trim() || undefined,
        administeredAt: nowIso(),
        nextDueAt: vacNextDue || undefined,
        encounterId: encounter.id,
      },
    })
    setVacName('')
    setVacLot('')
    setVacNextDue('')
  }

  return (
    <Panel title={t`Vaccinations`} description={t`Recorded during this visit and prior history`}>
      <div className="inline-form nested">
        <div className="form-grid">
          <Field label={t`Vaccine`} htmlFor="vac-name">
            <input id="vac-name" list="vac-options" value={vacName} onChange={(e) => setVacName(e.target.value)} placeholder={t`e.g. Rabies vaccine…`} />
            <datalist id="vac-options">
              {data.inventoryItems.filter((i) => i.category === 'vaccine').map((i) => (
                <option key={i.id} value={i.name} />
              ))}
            </datalist>
          </Field>
          <Field label={t`Lot number`} htmlFor="vac-lot">
            <input id="vac-lot" value={vacLot} onChange={(e) => setVacLot(e.target.value)} placeholder={t`e.g. RAB-2610B…`} />
          </Field>
          <Field label={t`Next due`} htmlFor="vac-next">
            <DatePicker id="vac-next" label={t`Next due`} value={vacNextDue} onChange={setVacNextDue} />
          </Field>
        </div>
        <button className="button secondary" onClick={recordVac} disabled={!vacName.trim()}>
          <Trans>Record vaccination</Trans>
        </button>
      </div>
      <div className="activity-list">
        {patientVaccinations.length === 0 && <p className="empty-state"><Trans>No vaccinations recorded for this patient.</Trans></p>}
        {patientVaccinations.map((v) => (
          <div className="activity-row" key={v.id}>
            <div className="activity-mark"><CalendarDays size={14} /></div>
            <div>
              <strong>{v.vaccineName}</strong>
              <span>
                {formatDate(v.administeredAt)}
                {v.lotNumber ? <> · <Trans>lot {v.lotNumber}</Trans></> : ''}
                {v.nextDueAt ? <> · <Trans>next due {v.nextDueAt}</Trans></> : ''}
              </span>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  )
}
