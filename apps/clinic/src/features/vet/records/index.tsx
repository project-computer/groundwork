import { useState } from 'react'
import { plural } from '@lingui/core/macro'
import { Stethoscope } from 'lucide-react'
import { Trans, useLingui } from '@lingui/react/macro'
import { DatePicker } from '@/components/vet/date-picker'
import { Panel, PageHeader, Pill } from '@/components/vet/fields'
import { useClinic, usePermission } from '@/lib/vet/store'
import { compareTime, formatDate, statusTone, todayKey } from '@/lib/vet/format'
import { vaccinationOverdue } from '@/lib/vet/selectors'
import { ImportCaseDialog } from './import-case-dialog'
/**
 * Medical records View: the encounters table (the Medical Record read
 * model), case-bundle import and the vaccination history.
 */
export const RecordsView = ({ onOpenConsult }: { onOpenConsult: (encounterId: string) => void }) => {
  const { data } = useClinic()
  const { t } = useLingui()
  const [query, setQuery] = useState('')
  const [importOpen, setImportOpen] = useState(false)
  const encounters = data.encounters
    .filter((e) => {
      const patient = data.patients.find((p) => p.id === e.patientId)
      return `${patient?.name} ${e.diagnoses.map((d) => d.description).join(' ')}`.toLowerCase().includes(query.toLowerCase())
    })
    .toSorted((a, b) => compareTime(b.openedAt, a.openedAt))
  return (
    <>
      <PageHeader
        title={t`Medical records`}
        description={t`Every consultation is an immutable encounter with a full note history.`}
        action={
          <div className="flex items-center gap-3">
            <input
              className="search-input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t`Search by patient or diagnosis…`}
              aria-label={t`Search medical records`}
            />
            <button className="button secondary" onClick={() => setImportOpen(true)}>
              <Trans>Import case</Trans>
            </button>
          </div>
        }
      />
      {importOpen && <ImportCaseDialog onClose={() => setImportOpen(false)} />}
      <Panel
        title={plural(encounters.length, { one: '# encounter', other: '# encounters' })}
        description={t`Newest first`}
      >
        <div className="records-table encounters-table">
          <div className="table-head">
            <span><Trans>Patient</Trans></span>
            <span><Trans>Opened</Trans></span>
            <span><Trans>Diagnoses</Trans></span>
            <span><Trans>Notes</Trans></span>
            <span />
          </div>
          {encounters.map((encounter) => {
            const patient = data.patients.find((p) => p.id === encounter.patientId)
            return (
              <div className="table-row" key={encounter.id}>
                <div className="patient-cell">
                  <div className="patient-avatar">{patient?.name.slice(0, 1)}</div>
                  <div>
                    <strong>{patient?.name}</strong>
                    <span>
                      {encounter.status === 'open' ? (
                        <Trans>Consultation in progress</Trans>
                      ) : (
                        <Trans>Closed {encounter.closedAt ? formatDate(encounter.closedAt) : ''}</Trans>
                      )}
                    </span>
                  </div>
                </div>
                <span data-label={t`Opened`}>{formatDate(encounter.openedAt)}</span>
                <span data-label={t`Diagnoses`}>{encounter.diagnoses.map((d) => d.description).join(', ') || '—'}</span>
                <span data-label={t`Notes`}>{encounter.notes.length}</span>
                {encounter.status === 'open' ? (
                  <button className="small-button" onClick={() => onOpenConsult(encounter.id)}>
                    <Stethoscope size={13} /> <Trans>Continue</Trans>
                  </button>
                ) : (
                  <div className="row-actions">
                    <Pill tone={statusTone('completed')} dot>
                      <Trans>archived</Trans>
                    </Pill>
                    <button className="small-button" onClick={() => onOpenConsult(encounter.id)}>
                      <Trans>View</Trans>
                    </button>
                  </div>
                )}
              </div>
            )
          })}
          {encounters.length === 0 && <p className="empty-state"><Trans>No encounters match your search.</Trans></p>}
        </div>
      </Panel>
      <Vaccinations />
    </>
  )
}

/* ---------- Case import (case transfer, see CONTEXT.md) ---------- */

const Vaccinations = () => {
  const { data, dispatch } = useClinic()
  const { t } = useLingui()
  const canWrite = usePermission('records.write').allowed
  const [patientId, setPatientId] = useState('')
  const [vaccineName, setVaccineName] = useState('')
  const [lotNumber, setLotNumber] = useState('')
  const [administeredAt, setAdministeredAt] = useState(todayKey())
  const [nextDueAt, setNextDueAt] = useState('')

  const record = () => {
    if (!patientId || !vaccineName.trim()) return
    dispatch({
      type: 'recordVaccination',
      patientId,
      vaccination: {
        vaccineName,
        lotNumber: lotNumber.trim() || undefined,
        administeredAt: `${administeredAt}T00:00:00+07:00`,
        nextDueAt: nextDueAt ? `${nextDueAt}T00:00:00+07:00` : undefined,
      },
    })
    setPatientId('')
    setVaccineName('')
    setLotNumber('')
    setNextDueAt('')
  }

  const rows = data.vaccinations
    .toSorted((a, b) => compareTime(b.administeredAt, a.administeredAt))
    .map((v) => {
      const patient = data.patients.find((p) => p.id === v.patientId)
      const vet = data.users.find((u) => u.id === v.vetId)
      const overdue = vaccinationOverdue(v.nextDueAt)
      return Object.assign({}, v, { patient, vet, overdue })
    })

  return (
    <Panel title={t`Vaccinations`} description={t`Vaccine history and next-due dates`}>
      {canWrite && (
        <div className="vaccination-form">
          <select value={patientId} onChange={(e) => setPatientId(e.target.value)} aria-label={t`Patient`}>
            <option value=""><Trans>Select patient…</Trans></option>
            {data.patients.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.mrn})
              </option>
            ))}
          </select>
          <input value={vaccineName} onChange={(e) => setVaccineName(e.target.value)} placeholder={t`Vaccine name`} aria-label={t`Vaccine name`} />
          <input value={lotNumber} onChange={(e) => setLotNumber(e.target.value)} placeholder={t`Lot number`} aria-label={t`Lot number`} />
          <DatePicker label={t`Date administered`} value={administeredAt} onChange={setAdministeredAt} />
          <DatePicker label={t`Next due date`} value={nextDueAt} onChange={setNextDueAt} />
          <button className="small-button" onClick={record} disabled={!patientId || !vaccineName.trim()}>
            <Trans>Record</Trans>
          </button>
        </div>
      )}
      <div className="records-table vaccinations-table">
        <div className="table-head">
          <span><Trans>Patient</Trans></span>
          <span><Trans>Vaccine</Trans></span>
          <span><Trans>Given</Trans></span>
          <span><Trans>Next due</Trans></span>
          <span><Trans>Vet</Trans></span>
        </div>
        {rows.length === 0 && <p className="empty-state"><Trans>No vaccinations recorded yet.</Trans></p>}
        {rows.map(({ patient, vet, overdue, ...v }) => (
          <div className="table-row" key={v.id}>
            <div className="patient-cell">
              <div className="patient-avatar">{patient?.name.slice(0, 1) ?? '?'}</div>
              <div>
                <strong>{patient?.name ?? <Trans>Unknown</Trans>}</strong>
                <span>{patient?.mrn}</span>
              </div>
            </div>
            <span data-label={t`Vaccine`}>
              {v.vaccineName}
              {v.lotNumber ? ` · ${v.lotNumber}` : ''}
            </span>
            <span data-label={t`Given`}>{formatDate(v.administeredAt)}</span>
            <span data-label={t`Next due`}>
              {v.nextDueAt ? (
                <Pill tone={overdue ? 'bad' : 'muted'} dot>
                  {overdue ? (
                    <>
                      <Trans>Overdue</Trans>{' '}
                    </>
                  ) : null}
                  {formatDate(v.nextDueAt)}
                </Pill>
              ) : (
                '—'
              )}
            </span>
            <span data-label={t`Vet`}>{vet?.name ?? '—'}</span>
          </div>
        ))}
      </div>
    </Panel>
  )
}

/* ---------- Staff & permissions ---------- */

