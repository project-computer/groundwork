import { useEffect, useRef, useState } from 'react'
import { Plural, Trans, useLingui } from '@lingui/react/macro'
import { Plus, Search, X } from 'lucide-react'
import { DatePicker } from '@/components/vet/date-picker'
import { Field, NativeSelect, Panel, PageHeader, Pill } from '@/components/vet/fields'
import { useClinic } from '@/lib/vet/store'
import { buildCaseBundle, downloadCaseBundle, newShareToken } from '@/lib/vet/case-transfer'
import { formatDate, sexLabel, speciesLabel } from '@/lib/vet/format'
import { SPECIES, SEXES, type Patient } from '@/lib/vet/types'
import { PatientClinicalDialog } from './patient-dialog'

/**
 * Owners & patients View: search, the dual-mode registration form
 * (new owner / existing owner) and the patients table with case-bundle
 * sharing. Vocabulary note: the domain entity is a Patient (CONTEXT.md).
 */
export const Owners = ({
  query,
  setQuery,
  showForm,
  setShowForm,
  canWrite,
}: {
  query: string
  setQuery: (q: string) => void
  showForm: boolean
  setShowForm: (b: boolean) => void
  canWrite: boolean
}) => {
  const { data, dispatch } = useClinic()
  const { t } = useLingui()
  const [formMode, setFormMode] = useState<'new-owner' | 'existing-owner'>('new-owner')
  const [ownerId, setOwnerId] = useState('')
  const [ownerName, setOwnerName] = useState('')
  const [ownerPhone, setOwnerPhone] = useState('')
  const [patientName, setPetName] = useState('')
  const [species, setSpecies] = useState<Patient['species']>('Dog')
  const [breed, setBreed] = useState('')
  const [sex, setSex] = useState<Patient['sex']>('Unknown')
  const [birthDate, setBirthDate] = useState('')
  const [microchip, setMicrochip] = useState('')
  const [detailId, setDetailId] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const ownerInputRef = useRef<HTMLInputElement>(null)
  const patientInputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (!showForm) return
    const target = formMode === 'new-owner' ? ownerInputRef.current : patientInputRef.current
    target?.focus()
  }, [showForm, formMode])
  const filtered = data.patients.filter((p) => {
    const owner = data.owners.find((o) => o.id === p.ownerId)
    return `${p.name} ${owner?.name ?? ''} ${owner?.phone ?? ''} ${owner?.email ?? ''} ${p.mrn} ${p.microchip ?? ''}`
      .toLowerCase()
      .includes(query.toLowerCase())
  })
  const resetForm = () => {
    setPetName('')
    setBreed('')
    setBirthDate('')
    setMicrochip('')
    setSex('Unknown')
  }
  const save = () => {
    const name = patientName.trim()
    if (!name) return
    if (formMode === 'new-owner') {
      if (!ownerName.trim()) return
      dispatch({
        type: 'registerOwner',
        owner: { name: ownerName.trim(), phone: ownerPhone.trim(), email: '', address: '' },
        patient: {
          name: patientName.trim(),
          species,
          breed: breed.trim() || t`Mixed breed`,
          sex,
          birthDate,
          weightKg: undefined,
          microchip: microchip.trim() || undefined,
          allergies: [],
          medicalAlerts: [],
          weightUnit: 'kg',
        },
      })
      setOwnerName('')
      setOwnerPhone('')
    } else {
      const owner = data.owners.find((o) => o.id === ownerId) ?? data.owners[0]
      if (!owner) return
      dispatch({
        type: 'addPatient',
        patient: {
          ownerId: owner.id,
          name: patientName.trim(),
          species,
          breed: breed.trim() || t`Mixed breed`,
          sex,
          birthDate,
          weightKg: undefined,
          microchip: microchip.trim() || undefined,
          allergies: [],
          medicalAlerts: [],
          weightUnit: 'kg',
        },
      })
    }
    resetForm()
    setQuery('')
    setNotice(t`${name} registered.`)
    setShowForm(false)
  }
  return (
    <>
      <PageHeader
        title={t`Owners & patients`}
        description={t`Find a record quickly or register a new patient.`}
        action={
          <button className="button primary" onClick={() => { setNotice(''); setShowForm(true) }} disabled={!canWrite}>
            <Plus size={16} /> <Trans>Register Patient</Trans>
          </button>
        }
      />
      <div className="toolbar owners-toolbar">
        <div className="search-field">
          <Search size={17} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t`Search by owner, phone, patient, MRN or microchip…`}
            aria-label={t`Search owners or patients`}
          />
        </div>
        <button className="filter-button">
          <Trans>All patients</Trans> <span aria-hidden="true">⌄</span>
        </button>
      </div>
      {notice && (
        <p className="form-notice" role="status">
          {notice}
        </p>
      )}
      {showForm && (
        <div className="inline-form">
          <div className="form-heading">
            <div>
              <strong><Trans>Register patient</Trans></strong>
              <span><Trans>Owner and patient records are saved in one local transaction.</Trans></span>
            </div>
            <button className="icon-button" onClick={() => setShowForm(false)} aria-label={t`Close form`}>
              <X size={17} />
            </button>
          </div>
          <div className="seg" role="tablist" aria-label={t`Registration mode`}>
            <button role="tab" aria-selected={formMode === 'new-owner'} className={formMode === 'new-owner' ? 'active' : ''} onClick={() => setFormMode('new-owner')}>
              <Trans>New owner</Trans>
            </button>
            <button role="tab" aria-selected={formMode === 'existing-owner'} className={formMode === 'existing-owner' ? 'active' : ''} onClick={() => setFormMode('existing-owner')}>
              <Trans>Existing owner</Trans>
            </button>
          </div>
          <div className="form-grid">
            {formMode === 'new-owner' ? (
              <>
                <Field label={t`Owner name`} htmlFor="owner">
                  <input
                    id="owner"
                    name="owner-name"
                    autoComplete="off"
                    ref={ownerInputRef}
                    value={ownerName}
                    onChange={(e) => setOwnerName(e.target.value)}
                    placeholder={t`e.g. Anong Srisuk…`}
                  />
                </Field>
                <Field label={t`Owner phone`} htmlFor="owner-phone">
                  <input
                    id="owner-phone"
                    name="owner-phone"
                    autoComplete="off"
                    inputMode="tel"
                    value={ownerPhone}
                    onChange={(e) => setOwnerPhone(e.target.value)}
                    placeholder={t`e.g. 081 234 5678…`}
                  />
                </Field>
              </>
            ) : (
              <Field label={t`Owner`} htmlFor="owner-select">
                <NativeSelect id="owner-select" value={ownerId || data.owners[0]?.id || ''} onChange={(e) => setOwnerId(e.target.value)}>
                  {data.owners.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name} (<Plural value={data.patients.filter((p) => p.ownerId === o.id).length} one="# patient" other="# patients" />)
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            )}
            <Field label={t`Patient name`} htmlFor="patient">
              <input
                id="patient"
                name="patient-name"
                autoComplete="off"
                ref={patientInputRef}
                value={patientName}
                onChange={(e) => setPetName(e.target.value)}
                placeholder={t`e.g. Milo…`}
              />
            </Field>
            <Field label={t`Species`} htmlFor="patient-species">
              <NativeSelect id="patient-species" value={species} onChange={(e) => setSpecies(e.target.value as Patient['species'])}>
                {SPECIES.map((s) => (
                  <option key={s} value={s}>{speciesLabel[s]}</option>
                ))}
              </NativeSelect>
            </Field>
            <Field label={t`Breed`} htmlFor="patient-breed">
              <input id="patient-breed" autoComplete="off" value={breed} onChange={(e) => setBreed(e.target.value)} placeholder={t`e.g. Golden Retriever…`} />
            </Field>
            <Field label={t`Sex`} htmlFor="patient-sex">
              <NativeSelect id="patient-sex" value={sex} onChange={(e) => setSex(e.target.value as Patient['sex'])}>
                {SEXES.map((s) => (
                  <option key={s} value={s}>{sexLabel[s]}</option>
                ))}
              </NativeSelect>
            </Field>
            <Field label={t`Date of birth`} htmlFor="patient-dob">
              <DatePicker id="patient-dob" label={t`Date of birth`} value={birthDate} onChange={setBirthDate} />
            </Field>
            <Field label={t`Microchip (optional)`} htmlFor="microchip">
              <input
                id="microchip"
                name="microchip"
                autoComplete="off"
                inputMode="numeric"
                spellCheck={false}
                value={microchip}
                onChange={(e) => setMicrochip(e.target.value)}
                placeholder={t`e.g. 985141002341238…`}
              />
            </Field>
          </div>
          <div className="form-actions">
            <button
              className="button primary"
              onClick={save}
              disabled={!patientName.trim() || (formMode === 'new-owner' && !ownerName.trim()) || (formMode === 'existing-owner' && data.owners.length === 0)}
            >
              <Trans>Save Records</Trans>
            </button>
          </div>
        </div>
      )}
      <Panel
        title={filtered.length === 1 ? t`1 patient` : t`${filtered.length} patients`}
        description={t`Patient identity and owner contact details`}
      >
        <div className="records-table patients-table">
          <div className="table-head">
            <span><Trans>Patient</Trans></span>
            <span><Trans>Owner</Trans></span>
            <span><Trans>Species</Trans></span>
            <span><Trans>Last visit</Trans></span>
            <span />
          </div>
          {filtered.map((patient) => {
            const owner = data.owners.find((o) => o.id === patient.ownerId)
            const flags = [...patient.medicalAlerts, ...patient.allergies]
            return (
              <div className="table-row" key={patient.id}>
                <div className="patient-cell">
                  <div className="patient-avatar">{patient.name.slice(0, 1)}</div>
                  <div>
                    <strong>{patient.name}</strong>
                    <span>
                      {patient.mrn} · {patient.breed} · {sexLabel[patient.sex]}
                    </span>
                    {patient.originClinicName && (
                      <span className="patient-flags">
                        <Pill tone="info"><Trans>Received from {patient.originClinicName}</Trans></Pill>
                      </span>
                    )}
                    {flags.length > 0 && (
                      <span className="patient-flags">
                        {patient.allergies.map((a) => (
                          <Pill key={a} tone="bad">
                            <Trans>Allergy: {a}</Trans>
                          </Pill>
                        ))}
                        {patient.medicalAlerts.map((a) => (
                          <Pill key={a} tone="warn">
                            {a}
                          </Pill>
                        ))}
                      </span>
                    )}
                  </div>
                </div>
                <span data-label={t`Owner`}>{owner?.name ?? '—'}</span>
                <span data-label={t`Species`}>
                  <Pill tone="info">{speciesLabel[patient.species]}</Pill>
                </span>
                <span data-label={t`Last visit`}>
                  {patient.lastVisit ? formatDate(patient.lastVisit) : t`New patient`}
                </span>
                <div className="row-actions">
                  <button className="row-action" onClick={() => setDetailId(patient.id)}>
                    <Trans>View</Trans>
                  </button>
                  {canWrite && (
                    <button
                      className="row-action"
                      title={t`Export this patient's case bundle for another clinic`}
                      onClick={() => {
                        const bundle = buildCaseBundle(data, patient, newShareToken(), new Date().toISOString())
                        downloadCaseBundle(bundle)
                        dispatch({ type: 'exportCaseBundle', bundle })
                      }}
                    >
                      <Trans>Share</Trans>
                    </button>
                  )}
                </div>
              </div>
            )
          })}
          {filtered.length === 0 && <p className="empty-state patients-empty"><Trans>No patients match your search.</Trans></p>}
        </div>
      </Panel>
      {detailId && <PatientClinicalDialog patientId={detailId} onClose={() => setDetailId(null)} canWrite={canWrite} />}
    </>
  )
}

