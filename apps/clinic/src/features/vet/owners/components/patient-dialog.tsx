import { useEffect, useState } from 'react'
import { Plural, Trans, useLingui } from '@lingui/react/macro'
import { DatePicker } from '@/components/patterns/date-picker'
import { Field, NativeSelect, Pill } from '@/components/patterns/fields'
import { Modal } from '@/components/patterns/modal'
import { useClinic } from '@/lib/vet/store'
import { compareTime, formatDate, sexLabel, speciesLabel } from '@/lib/vet/format'
import { latestWeightKg } from '@/lib/vet/selectors'
import { SPECIES, SEXES, type Patient } from '@/lib/vet/types'

const splitList = (value: string) =>
  value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)

/**
 * Clinical dialog for one Patient: identity + owner forms, the medical
 * timeline (Visits merged with Vaccinations) and clinical flags.
 */
export const PatientClinicalDialog = ({ patientId, onClose, canWrite }: { patientId: string; onClose: () => void; canWrite: boolean }) => {
  const { data, dispatch } = useClinic()
  const { t } = useLingui()
  const patient = data.patients.find((p) => p.id === patientId)
  const owner = data.owners.find((o) => o.id === patient?.ownerId)
  const [name, setName] = useState(patient?.name ?? '')
  const [species, setSpecies] = useState<Patient['species']>(patient?.species ?? 'Dog')
  const [breed, setBreed] = useState(patient?.breed ?? '')
  const [sex, setSex] = useState<Patient['sex']>(patient?.sex ?? 'Unknown')
  const [birthDate, setBirthDate] = useState(patient?.birthDate ?? '')
  const [weightKg, setWeightKg] = useState(patient?.weightKg ?? '')
  const [microchip, setMicrochip] = useState(patient?.microchip ?? '')
  const [allergies, setAllergies] = useState(patient?.allergies.join(', ') ?? '')
  const [alerts, setAlerts] = useState(patient?.medicalAlerts.join(', ') ?? '')
  const [ownerName, setOwnerName] = useState(owner?.name ?? '')
  const [ownerPhone, setOwnerPhone] = useState(owner?.phone ?? '')
  const [ownerEmail, setOwnerEmail] = useState(owner?.email ?? '')
  const [ownerAddress, setOwnerAddress] = useState(owner?.address ?? '')
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])
  if (!patient) return null
  // ADR 0022: the clinical weight is the latest recorded Visit vital; the
  // editable field below is only the owner-reported baseline.
  const recordedWeight = latestWeightKg(patient.id, data.encounters)
  const timeline = [
    ...data.encounters
      .filter((e) => e.patientId === patient.id)
      .map((e) => ({
        kind: 'visit' as const,
        at: e.openedAt,
        encounter: e,
      })),
    ...data.vaccinations
      .filter((v) => v.patientId === patient.id)
      .map((v) => ({
        kind: 'vaccination' as const,
        at: v.administeredAt,
        vaccination: v,
      })),
  ].toSorted((a, b) => compareTime(b.at, a.at))
  return (
    <Modal
      label={t`Clinical profile for ${patient.name}`}
      title={name || patient.name}
      subtitle={
        <>
          {patient.mrn} · {ownerName || owner?.name || t`No owner`}{ownerPhone ? ` · ${ownerPhone}` : ''} · {speciesLabel[species]} · {breed}
        </>
      }
      wide
      onClose={onClose}
    >
      <fieldset className="form-section" disabled={!canWrite}>
        <legend><Trans>Owner</Trans></legend>
        <div className="form-grid">
          <Field label={t`Owner name`} htmlFor="pt-owner-name">
            <input
              id="pt-owner-name"
              name="owner-name"
              autoComplete="off"
              value={ownerName}
              onChange={(e) => setOwnerName(e.target.value)}
              placeholder={t`e.g. Anong Srisuk…`}
            />
          </Field>
          <Field label={t`Phone`} htmlFor="pt-owner-phone">
            <input
              id="pt-owner-phone"
              name="owner-phone"
              type="tel"
              autoComplete="off"
              value={ownerPhone}
              onChange={(e) => setOwnerPhone(e.target.value)}
              placeholder={t`e.g. 081 234 5678…`}
            />
          </Field>
          <Field label={t`Email`} htmlFor="pt-owner-email">
            <input
              id="pt-owner-email"
              name="owner-email"
              type="email"
              autoComplete="off"
              value={ownerEmail}
              onChange={(e) => setOwnerEmail(e.target.value)}
              placeholder={t`e.g. anong@example.com…`}
            />
          </Field>
          <Field label={t`Address`} htmlFor="pt-owner-address">
            <input
              id="pt-owner-address"
              name="owner-address"
              autoComplete="off"
              value={ownerAddress}
              onChange={(e) => setOwnerAddress(e.target.value)}
              placeholder={t`Street, city, postcode…`}
            />
          </Field>
        </div>
      </fieldset>

      <fieldset className="form-section" disabled={!canWrite}>
        <legend><Trans>Patient</Trans></legend>
        <div className="form-grid">
          <Field label={t`Patient name`} htmlFor="pt-name">
            <input
              id="pt-name"
              name="patient-name"
              autoComplete="off"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t`e.g. Milo…`}
            />
          </Field>
          <Field label={t`Species`} htmlFor="pt-species">
            <NativeSelect id="pt-species" value={species} onChange={(e) => setSpecies(e.target.value as Patient['species'])}>
              {SPECIES.map((s) => (
                <option key={s} value={s}>{speciesLabel[s]}</option>
              ))}
            </NativeSelect>
          </Field>
          <Field label={t`Breed`} htmlFor="pt-breed">
            <input id="pt-breed" autoComplete="off" value={breed} onChange={(e) => setBreed(e.target.value)} placeholder={t`e.g. Golden Retriever…`} />
          </Field>
          <Field label={t`Sex`} htmlFor="pt-sex">
            <NativeSelect id="pt-sex" value={sex} onChange={(e) => setSex(e.target.value as Patient['sex'])}>
              {SEXES.map((s) => (
                <option key={s} value={s}>{sexLabel[s]}</option>
              ))}
            </NativeSelect>
          </Field>
          <Field label={t`Date of birth`} htmlFor="pt-birth">
            <DatePicker id="pt-birth" label={t`Date of birth`} value={birthDate} onChange={setBirthDate} />
          </Field>
          <Field label={t`Baseline weight (kg)`} htmlFor="pt-weight">
            <input
              id="pt-weight"
              inputMode="decimal"
              autoComplete="off"
              value={weightKg}
              onChange={(e) => setWeightKg(e.target.value)}
              placeholder={t`e.g. 4.2…`}
            />
            <p className="form-hint">
              {recordedWeight ? (
                <Trans>
                  Last recorded {recordedWeight.valueKg} kg on {formatDate(recordedWeight.recordedAt)} — from the visit's vitals.
                </Trans>
              ) : (
                <Trans>Owner-reported starting weight; the clinical weight comes from each visit's vitals.</Trans>
              )}
            </p>
          </Field>
        </div>
      </fieldset>

      <fieldset className="form-section" disabled={!canWrite}>
        <legend><Trans>Clinical</Trans></legend>
        <div className="form-grid">
          <Field label={t`Microchip`} htmlFor="pt-microchip">
            <input
              id="pt-microchip"
              name="microchip"
              autoComplete="off"
              inputMode="numeric"
              spellCheck={false}
              value={microchip}
              onChange={(e) => setMicrochip(e.target.value)}
              placeholder={t`e.g. 985141002341238…`}
            />
          </Field>
          <Field label={t`Allergies (comma-separated)`} htmlFor="pt-allergies">
            <input
              id="pt-allergies"
              name="allergies"
              autoComplete="off"
              value={allergies}
              onChange={(e) => setAllergies(e.target.value)}
              placeholder={t`e.g. Penicillin, Flea topical (pyrethrin)…`}
            />
          </Field>
          <Field label={t`Medical alerts (comma-separated)`} htmlFor="pt-alerts">
            <input
              id="pt-alerts"
              name="medical-alerts"
              autoComplete="off"
              value={alerts}
              onChange={(e) => setAlerts(e.target.value)}
              placeholder={t`e.g. Aggressive during handling — muzzle first…`}
            />
          </Field>
        </div>
      </fieldset>

      <div className="panel-footer">
        <button className="button secondary" onClick={onClose}>
          <Trans>Cancel</Trans>
        </button>
        <button
          className="button primary"
          disabled={!canWrite || !name.trim() || (!!owner && !ownerName.trim())}
          onClick={() => {
            dispatch({
              type: 'updatePatient',
              id: patient.id,
              patch: {
                name: name.trim(),
                species,
                breed: breed.trim(),
                sex,
                birthDate,
                weightKg: weightKg.trim() || undefined,
                microchip: microchip.trim() || undefined,
                allergies: splitList(allergies),
                medicalAlerts: splitList(alerts),
              },
            })
            if (owner) {
              dispatch({
                type: 'updateOwner',
                id: owner.id,
                patch: {
                  name: ownerName.trim(),
                  phone: ownerPhone.trim(),
                  email: ownerEmail.trim(),
                  address: ownerAddress.trim() || undefined,
                },
              })
            }
            onClose()
          }}
        >
          <Trans>Save Profile</Trans>
        </button>
      </div>
      <div className="timeline" aria-label={t`Medical timeline`}>
        <h3><Trans>Medical timeline</Trans></h3>
        {timeline.length === 0 && <p className="empty-state"><Trans>No visits or vaccinations recorded yet.</Trans></p>}
        {timeline.map((entry) =>
          entry.kind === 'vaccination' ? (
            <div className="timeline-row" key={entry.vaccination.id}>
              <Pill tone="info" dot><Trans>Vaccine</Trans></Pill>
              <div>
                <strong>{entry.vaccination.vaccineName}</strong>
                <span>
                  {formatDate(entry.vaccination.administeredAt)}
                  {entry.vaccination.lotNumber ? <> · <Trans>lot {entry.vaccination.lotNumber}</Trans></> : ''}
                  {entry.vaccination.nextDueAt ? <> · <Trans>next due {entry.vaccination.nextDueAt}</Trans></> : ''}
                </span>
              </div>
            </div>
          ) : (
            <div className="timeline-row" key={entry.encounter.id}>
              <Pill tone={entry.encounter.status === 'open' ? 'warn' : 'ok'} dot>
                {entry.encounter.status === 'open' ? t`Open visit` : t`Visit`}
              </Pill>
              <div>
                <strong>
                  {formatDate(entry.encounter.openedAt)}
                  {entry.encounter.diagnoses.length > 0 && ` — ${entry.encounter.diagnoses.map((d) => d.description).join('; ')}`}
                </strong>
                {entry.encounter.prescriptions.length > 0 && (
                  <span>
                    <Trans>Rx: {entry.encounter.prescriptions.map((rx) => `${rx.medication} (${rx.dose} ${rx.frequency})`).join(', ')}</Trans>
                  </span>
                )}
                <span>
                  <Plural value={entry.encounter.notes.length} one="# note" other="# notes" />
                  {entry.encounter.vitals.weightKg ? <> · <Trans>weight {entry.encounter.vitals.weightKg} kg</Trans></> : ''}
                </span>
              </div>
            </div>
          ),
        )}
      </div>
    </Modal>
  )
}

