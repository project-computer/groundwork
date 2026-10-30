import { useRef, useState } from 'react'
import { Activity, AlertTriangle, Database, RotateCcw, ShieldCheck, Stethoscope, X } from 'lucide-react'
import { plural } from '@lingui/core/macro'
import { Trans, Plural, useLingui } from '@lingui/react/macro'
import { DatePicker } from '@/components/vet/date-picker'
import { Field, Panel, PageHeader, Pill } from '@/components/vet/fields'
import { useClinic, usePermission, useSyncState } from '@/lib/vet/store'
import { hasPin } from '@/lib/vet/auth'
import { buildBackup, downloadBackup, parseBackup, summarizeBackup, type BackupSummary, type ClinicBackup } from '@/lib/vet/backup'
import { isCaseBundle, type CaseBundle } from '@/lib/vet/types'
import { compareTime, formatDate, permissionsFor, roleLabel, ROLES, statusLabel, statusTone, todayKey } from '@/lib/vet/format'
import type { StaffUser } from '@/lib/vet/types'
import { PinDialog } from './pin-dialog'

/* ---------- Medical records ---------- */

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
                  <div className="pet-avatar">{patient?.name.slice(0, 1)}</div>
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

type ImportOutcome =
  | { state: 'error'; message: string }
  | { state: 'done'; message: string }

const ImportCaseDialog = ({ onClose }: { onClose: () => void }) => {
  const { data, dispatch } = useClinic()
  const { t } = useLingui()
  const [paste, setPaste] = useState('')
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null)

  const receive = (raw: string) => {
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      setOutcome({ state: 'error', message: t`That is not valid JSON — paste the case bundle file contents or choose a .json file.` })
      return
    }
    if (!isCaseBundle(parsed)) {
      setOutcome({ state: 'error', message: t`This file is not a VetCare case bundle.` })
      return
    }
    const bundle = parsed as CaseBundle
    if (data.caseTransfers.some((transfer) => transfer.token === bundle.token)) {
      setOutcome({
        state: 'error',
        message: t`This case was already received (token ${bundle.token.slice(0, 8)}…). Import skipped to avoid duplicates.`,
      })
      return
    }
    dispatch({ type: 'importCaseBundle', bundle })
    const received = data.patients.length // captured before; summary uses bundle content
    void received
    setOutcome({
      state: 'done',
      message: t`Received ${bundle.patient.name} from ${bundle.fromClinic.name}: ${plural(bundle.encounters.length, { one: '# visit', other: '# visits' })} and ${plural(bundle.vaccinations.length, { one: '# vaccination', other: '# vaccinations' })} copied into this clinic with a new MRN.`,
    })
  }

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-label={t`Import a case bundle`}>
        <div className="form-heading">
          <div>
            <strong><Trans>Import case bundle</Trans></strong>
            <span><Trans>Receives a shared case from another clinic. Copies are stamped with the source clinic — nothing is shared in place.</Trans></span>
          </div>
          <button className="icon-button" onClick={onClose} aria-label={t`Close dialog`}>
            <X size={17} />
          </button>
        </div>
        <Field label={t`Bundle file (.json)`} htmlFor="import-file">
          <input
            id="import-file"
            type="file"
            accept="application/json,.json"
            onChange={async (e) => {
              const file = e.target.files?.[0]
              if (file) receive(await file.text())
            }}
          />
        </Field>
        <Field label={t`…or paste bundle JSON`} htmlFor="import-paste">
          <textarea
            id="import-paste"
            rows={6}
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            placeholder='{"format":"vetcare-case-bundle","version":1,…}'
            spellCheck={false}
          />
        </Field>
        {outcome && (
          <p className={outcome.state === 'error' ? 'text-[13px] text-red-700' : 'text-[13px] text-green-700'} role="status">
            {outcome.message}
          </p>
        )}
        <div className="form-actions">
          <button className="button secondary" onClick={() => receive(paste)} disabled={!paste.trim()}>
            <Trans>Import pasted bundle</Trans>
          </button>
          <button className="button primary" onClick={onClose}>
            <Trans>Done</Trans>
          </button>
        </div>
      </div>
    </div>
  )
}

/* ---------- Vaccinations ---------- */

const Vaccinations = () => {
  const { data, dispatch } = useClinic()
  const { t } = useLingui()
  const canWrite = usePermission('records.write').allowed
  const [patientId, setPatientId] = useState('')
  const [vaccineName, setVaccineName] = useState('')
  const [lotNumber, setLotNumber] = useState('')
  const [administeredAt, setAdministeredAt] = useState(todayKey())
  const [nextDueAt, setNextDueAt] = useState('')
  // Captured once per mount: the "overdue" column refreshes when the view remounts.
  const [nowIso] = useState(() => new Date().toISOString())

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
      const overdue = v.nextDueAt ? v.nextDueAt < nowIso : false
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
              <div className="pet-avatar">{patient?.name.slice(0, 1) ?? '?'}</div>
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

export const StaffView = () => {
  const { data, session, dispatch } = useClinic()
  const { t } = useLingui()
  const manage = usePermission('staff.manage')
  const [name, setName] = useState('')
  const [role, setRole] = useState<StaffUser['role']>('reception')
  const [showAllAudit, setShowAllAudit] = useState(false)
  const [pinFor, setPinFor] = useState<StaffUser | null>(null)

  const addStaff = () => {
    if (!name.trim()) return
    dispatch({ type: 'addStaff', name, role })
    setName('')
    setRole('reception')
  }

  // Switching accounts is instant until a member sets a PIN; after that the
  // app locks on that member so the PIN is verified on the lock screen.
  const signInAs = (member: StaffUser) => {
    if (!hasPin(member)) {
      dispatch({ type: 'signIn', userId: member.id })
      return
    }
    dispatch({ type: 'session', patch: { locked: true, currentUserId: member.id } })
  }

  return (
    <>
      <PageHeader
        title={t`Staff & permissions`}
        description={t`Roles decide who can write records, bill, adjust stock and export.`}
      />
      {manage.allowed && (
        <Panel title={t`Add staff member`} description={t`New members start active with the permissions of their role`}>
          <div className="form-grid">
            <Field label={t`Full name`} htmlFor="staff-name">
              <input
                id="staff-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addStaff()}
                placeholder={t`e.g. Anong Srisuk…`}
              />
            </Field>
            <Field label={t`Role`} htmlFor="staff-role">
              <select id="staff-role" value={role} onChange={(e) => setRole(e.target.value as StaffUser['role'])}>
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {roleLabel[r]}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <button className="button primary" onClick={addStaff} disabled={!name.trim()}>
            <Trans>Add member</Trans>
          </button>
        </Panel>
      )}
      <Panel
        title={plural(data.users.filter((u) => u.active).length, { one: '# active staff member', other: '# active staff members' })}
        description={t`Current clinic team`}
      >
        <div className="records-table table-wide staff-table">
          <div className="table-head">
            <span><Trans>Member</Trans></span>
            <span><Trans>Role</Trans></span>
            <span><Trans>Permissions</Trans></span>
            <span />
            <span />
          </div>
          {data.users.map((user) => {
            const isSelf = user.id === session.currentUserId
            return (
              <div className="table-row" key={user.id} style={!user.active ? { opacity: 0.5 } : undefined}>
                <div className="patient-cell">
                  <div className="pet-avatar">{user.name.slice(0, 1)}</div>
                  <div>
                    <strong>{user.name}</strong>
                    <span>
                      {isSelf ? (
                        <Trans>Signed in on this device</Trans>
                      ) : user.active ? (
                        <Trans>Team member</Trans>
                      ) : (
                        <Trans>Deactivated</Trans>
                      )}
                      {' · '}
                      {hasPin(user) ? <Trans>PIN set</Trans> : <Trans>no PIN</Trans>}
                    </span>
                  </div>
                </div>
                <span>
                  {manage.allowed ? (
                    <select
                      aria-label={t`Role for ${user.name}`}
                      value={user.role}
                      onChange={(e) => dispatch({ type: 'updateStaff', id: user.id, role: e.target.value as StaffUser['role'] })}
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {roleLabel[r]}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className={isSelf ? 'role-badge is-self' : 'role-badge'}>{roleLabel[user.role]}</span>
                  )}
                </span>
                <span className="perm-list">
                  {permissionsFor(user.role).map((permission) => (
                    <span key={permission} className="perm-tag">
                      {permission}
                    </span>
                  ))}
                </span>
                <span>
                  {!isSelf && user.active && (
                    <button className="small-button" onClick={() => signInAs(user)}>
                      <Trans>Sign in as</Trans>
                    </button>
                  )}
                </span>
                <span style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                  {(manage.allowed || isSelf) && user.active && (
                    <button
                      className="small-button"
                      onClick={() => setPinFor(user)}
                      aria-label={hasPin(user) ? t`Change PIN for ${user.name}` : t`Set PIN for ${user.name}`}
                    >
                      {hasPin(user) ? <Trans>Change PIN</Trans> : <Trans>Set PIN</Trans>}
                    </button>
                  )}
                  {manage.allowed &&
                    !isSelf &&
                    (user.active ? (
                      <button className="small-button" onClick={() => dispatch({ type: 'setStaffActive', id: user.id, active: false })}>
                        <Trans>Deactivate</Trans>
                      </button>
                    ) : (
                      <button className="small-button" onClick={() => dispatch({ type: 'setStaffActive', id: user.id, active: true })}>
                        <Trans>Reactivate</Trans>
                      </button>
                    ))}
                </span>
              </div>
            )
          })}
        </div>
      </Panel>
      <Panel
        title={t`Audit trail`}
        description={t`Every write lands here with actor and timestamp`}
        action={
          data.audit.length > 12 ? (
            <button className="small-button" onClick={() => setShowAllAudit((v) => !v)}>
              {showAllAudit ? <Trans>Show recent</Trans> : <Trans>Show all {data.audit.length}</Trans>}
            </button>
          ) : undefined
        }
      >
        <div className="activity-list">
          {(showAllAudit ? data.audit : data.audit.slice(0, 12)).map((item) => (
            <div className="activity-row" key={item.id}>
              <div className="activity-mark">
                <ShieldCheck size={14} />
              </div>
              <div>
                <strong>{item.summary}</strong>
                <span>
                  {data.users.find((u) => u.id === item.actorId)?.name ?? item.actorId} · {formatDate(item.occurredAt)} · {item.action}
                </span>
              </div>
            </div>
          ))}
          {data.audit.length === 0 && <p className="empty-state"><Trans>No activity recorded yet.</Trans></p>}
        </div>
      </Panel>
      {pinFor && <PinDialog member={pinFor} onClose={() => setPinFor(null)} />}
    </>
  )
}

/* ---------- Settings (local data, sync & plan) ---------- */

export const SettingsView = ({ onManageClinic }: { onManageClinic?: () => void }) => {
  const { data, session, dispatch } = useClinic()
  const { t } = useLingui()
  const sync = useSyncState()
  const dataExport = usePermission('data.export')
  const restoreInput = useRef<HTMLInputElement>(null)
  const [restorePreview, setRestorePreview] = useState<{ backup: ClinicBackup; summary: BackupSummary } | null>(null)
  const [restoreError, setRestoreError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const exportData = () => {
    const exportedAt = new Date().toISOString()
    const blob = new Blob([JSON.stringify({ exportedAt, clinic: data.clinic, data }, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `clinicbook-export-${todayKey()}.json`
    anchor.click()
    URL.revokeObjectURL(url)
    dispatch({
      type: 'recordAudit',
      action: 'data.export',
      entityType: 'clinic',
      entityId: data.clinic.id,
      summary: t`Exported the clinic archive — ${plural(data.patients.length, { one: '# patient', other: '# patients' })}, ${plural(data.invoices.length, { one: '# invoice', other: '# invoices' })}`,
    })
    setNotice(t`Clinic archive exported (${plural(data.patients.length, { one: '# patient', other: '# patients' })}, ${plural(data.invoices.length, { one: '# invoice', other: '# invoices' })}).`)
  }

  const createBackup = () => {
    const backup = buildBackup(data, new Date().toISOString())
    downloadBackup(backup)
    dispatch({
      type: 'recordAudit',
      action: 'backup.create',
      entityType: 'clinic',
      entityId: data.clinic.id,
      summary: t`Created a clinic backup — ${plural(data.patients.length, { one: '# patient', other: '# patients' })}, ${plural(data.encounters.length, { one: '# encounter', other: '# encounters' })}`,
    })
    setNotice(t`Backup downloaded. Keep it somewhere outside this computer.`)
  }

  const chooseBackup = async (file: File | undefined) => {
    setRestoreError(null)
    setNotice(null)
    if (!file) return
    const result = parseBackup(await file.text())
    if (!result.ok) {
      setRestoreError(result.error)
      return
    }
    setRestorePreview({ backup: result.backup, summary: summarizeBackup(result.backup) })
  }

  const restoreBackup = () => {
    if (!restorePreview) return
    const summary = summarizeBackup(restorePreview.backup)
    dispatch({ type: 'restoreBackup', backup: restorePreview.backup })
    setRestorePreview(null)
    if (restoreInput.current) restoreInput.current.value = ''
    setNotice(t`Restored ${plural(summary.patients, { one: '# patient', other: '# patients' })} and ${plural(summary.encounters, { one: '# encounter', other: '# encounters' })} from the backup.`)
  }

  return (
    <>
      <PageHeader
        title={t`Settings`}
        description={t`Clinic identity, data portability and plan.`}
        action={
          <Pill tone={session.plan === 'cloud' ? 'ok' : 'info'} dot>
            {session.plan === 'cloud' ? <Trans>Cloud plan</Trans> : <Trans>Local plan</Trans>}
          </Pill>
        }
      />
      <div className="data-grid">
        <Panel title={t`Clinic`} description={t`Shown across the workspace and on printed documents.`}>
          <div className="status-stack">
            <div className="status-line">
              <span className="status-icon">
                <Activity size={17} />
              </span>
              <div>
                <strong>{data.clinic.name}</strong>
                <span>
                  {data.clinic.timezone} · <Trans>currency {data.clinic.currency}</Trans> · <Trans>VAT {Math.round(data.clinic.vatRate * 100)}%</Trans>
                </span>
              </div>
              <Pill tone="muted"><Trans>Local</Trans></Pill>
            </div>
            <div className="status-line">
              <span className="status-icon">
                <Database size={17} />
              </span>
              <div>
                <strong><Trans>Connection</Trans></strong>
                <span>
                  {session.lanOnline ? (
                    <Trans>Clinic server connected · writes are enabled</Trans>
                  ) : (
                    <Trans>Offline · read-only mode</Trans>
                  )}
                </span>
              </div>
              <Pill tone={session.lanOnline ? 'ok' : 'bad'}>
                {session.lanOnline ? <Trans>Connected</Trans> : <Trans>Offline</Trans>}
              </Pill>
            </div>
            <div className="status-line">
              <span className="status-icon">
                <Database size={17} />
              </span>
              <div>
                <strong><Trans>Cloud synchronization</Trans></strong>
                <span>
                  {session.plan === 'local' ? (
                    <Trans>Available on Cloud plan</Trans>
                  ) : sync.state === 'cloud_offline' ? (
                    <Trans>Internet unavailable</Trans>
                  ) : (
                    plural(sync.pending, { one: '# change waiting', other: '# changes waiting' })
                  )}
                </span>
              </div>
              <Pill tone={session.plan === 'local' ? 'muted' : sync.state === 'synced' ? 'ok' : 'warn'}>
                {session.plan === 'local' ? <Trans>Local only</Trans> : statusLabel(sync.state)}
              </Pill>
            </div>
            {session.lastSyncError && (
              <div className="status-line">
                <span className="status-icon">
                  <AlertTriangle size={17} />
                </span>
                <div>
                  <strong><Trans>Last sync attempt failed</Trans></strong>
                  <span>{session.lastSyncError}</span>
                </div>
                <Pill tone="bad"><Trans>Sync error</Trans></Pill>
              </div>
            )}
          </div>
          <div className="data-actions">
            <button className="button primary" onClick={onManageClinic} disabled={!onManageClinic}>
              <Trans>Manage clinic & account</Trans>
            </button>
            <button className="button secondary" onClick={() => dispatch({ type: 'session', patch: { lanOnline: !session.lanOnline } })}>
              {session.lanOnline ? <Trans>Simulate server offline</Trans> : <Trans>Reconnect server</Trans>}
            </button>
            <button
              className="button secondary"
              onClick={() => dispatch({ type: 'session', patch: { plan: session.plan === 'local' ? 'cloud' : 'local' } })}
            >
              {session.plan === 'local' ? <Trans>Preview Cloud plan</Trans> : <Trans>Switch to Local plan</Trans>}
            </button>
          </div>
        </Panel>
        <Panel title={t`Portability & recovery`} description={t`Export and manual backup are included in the free Local plan.`}>
          {notice && (
            <p className="form-hint" role="status">
              {notice}
            </p>
          )}
          <div className="export-card">
            <div className="export-icon">
              <Database size={20} />
            </div>
            <div>
              <strong><Trans>Clinic export archive</Trans></strong>
              <span><Trans>Versioned JSON snapshot of every clinic record, for reporting and hand-off.</Trans></span>
            </div>
            <button className="button primary" onClick={exportData} disabled={!dataExport.allowed} title={dataExport.reason || undefined}>
              <Trans>Export data</Trans>
            </button>
          </div>
          <div className="export-card">
            <div className="export-icon">
              <ShieldCheck size={20} />
            </div>
            <div>
              <strong><Trans>Clinic backup file</Trans></strong>
              <span><Trans>A restorable copy of this installation — patients, visits, billing and settings.</Trans></span>
            </div>
            <button className="button secondary" onClick={createBackup} disabled={!dataExport.allowed} title={dataExport.reason || undefined}>
              <Trans>Create backup</Trans>
            </button>
          </div>
          <div className="export-card">
            <div className="export-icon">
              <RotateCcw size={20} />
            </div>
            <div>
              <strong><Trans>Restore from backup</Trans></strong>
              <span><Trans>Replaces this installation's records with the backup after a preview.</Trans></span>
            </div>
            <input
              ref={restoreInput}
              type="file"
              accept="application/json,.json"
              className="sr-only"
              aria-label={t`Choose a backup file`}
              onChange={(e) => void chooseBackup(e.target.files?.[0])}
            />
            <button
              className="button secondary"
              onClick={() => restoreInput.current?.click()}
              disabled={!dataExport.allowed}
              title={dataExport.reason || undefined}
            >
              <Trans>Choose backup…</Trans>
            </button>
          </div>
          {restoreError && (
            <p className="form-hint is-bad" role="alert">
              {restoreError}
            </p>
          )}
          {!dataExport.allowed && <p className="form-hint">{dataExport.reason}</p>}
        </Panel>
      </div>
      {restorePreview && (
        <div
          className="modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setRestorePreview(null)
          }}
        >
          <div className="modal" role="dialog" aria-modal="true" aria-label={t`Restore clinic backup`}>
            <div className="form-heading">
              <div>
                <strong><Trans>Restore clinic backup</Trans></strong>
                <span>
                  {restorePreview.summary.clinicName} · <Trans>created {formatDate(restorePreview.backup.createdAt)}</Trans>
                </span>
              </div>
              <button className="icon-button" onClick={() => setRestorePreview(null)} aria-label={t`Close dialog`}>
                <X size={17} />
              </button>
            </div>
            <div className="status-stack">
              <div className="status-line">
                <span className="status-icon">
                  <Database size={17} />
                </span>
                <div>
                  <strong>
                    <Plural value={restorePreview.summary.patients} one="# patient" other="# patients" /> ·{' '}
                    <Plural value={restorePreview.summary.owners} one="# owner" other="# owners" />
                  </strong>
                  <span>
                    <Plural value={restorePreview.summary.encounters} one="# encounter" other="# encounters" /> ·{' '}
                    <Plural value={restorePreview.summary.appointments} one="# appointment" other="# appointments" /> ·{' '}
                    <Plural value={restorePreview.summary.invoices} one="# invoice" other="# invoices" />
                  </span>
                </div>
              </div>
              <div className="status-line">
                <span className="status-icon">
                  <ShieldCheck size={17} />
                </span>
                <div>
                  <strong>
                    <Plural value={restorePreview.summary.staff} one="# staff account" other="# staff accounts" />
                  </strong>
                  <span><Trans>Includes roles and PIN credentials as they were when the backup was taken.</Trans></span>
                </div>
              </div>
            </div>
            {restorePreview.backup.state.clinic.id !== data.clinic.id && (
              <p className="form-hint is-bad">
                <Trans>
                  This backup belongs to a different clinic ({restorePreview.backup.state.clinic.name}). Restoring it will replace
                  this clinic's records.
                </Trans>
              </p>
            )}
            <p className="form-hint">
              <Trans>Everything currently on this computer will be replaced. Export a fresh archive first if you are unsure.</Trans>
            </p>
            <div className="panel-footer">
              <button className="button secondary" onClick={() => setRestorePreview(null)}>
                <Trans>Cancel</Trans>
              </button>
              <button className="button primary" onClick={restoreBackup}>
                <Trans>Restore backup</Trans>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
