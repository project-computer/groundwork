import { useRef, useState } from 'react'
import { Activity, AlertTriangle, Database, RotateCcw, ShieldCheck, Stethoscope, X } from 'lucide-react'
import { Field, Panel, PageHeader, Pill } from '@/components/vet/fields'
import { useClinic, usePermission, useSyncState } from '@/lib/vet/store'
import { hasPin } from '@/lib/vet/auth'
import { buildBackup, downloadBackup, parseBackup, summarizeBackup, type BackupSummary, type ClinicBackup } from '@/lib/vet/backup'
import { isCaseBundle, type CaseBundle } from '@/lib/vet/types'
import { formatDate, permissionsFor, roleLabel, ROLES, statusTone, todayKey } from '@/lib/vet/format'
import type { StaffUser } from '@/lib/vet/types'
import { PinDialog } from './pin-dialog'

/* ---------- Medical records ---------- */

export const RecordsView = ({ onOpenConsult }: { onOpenConsult: (encounterId: string) => void }) => {
  const { data } = useClinic()
  const [query, setQuery] = useState('')
  const [importOpen, setImportOpen] = useState(false)
  const encounters = data.encounters
    .filter((e) => {
      const patient = data.patients.find((p) => p.id === e.patientId)
      return `${patient?.name} ${e.diagnoses.map((d) => d.description).join(' ')}`.toLowerCase().includes(query.toLowerCase())
    })
    .sort((a, b) => b.openedAt.localeCompare(a.openedAt))
  return (
    <>
      <PageHeader
        title="Medical records"
        description="Every consultation is an immutable encounter with a full note history."
        action={
          <div className="flex items-center gap-3">
            <input
              className="search-input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by patient or diagnosis…"
              aria-label="Search medical records"
            />
            <button className="button secondary" onClick={() => setImportOpen(true)}>
              Import case
            </button>
          </div>
        }
      />
      {importOpen && <ImportCaseDialog onClose={() => setImportOpen(false)} />}
      <Panel title={`${encounters.length} encounters`} description="Newest first">
        <div className="records-table encounters-table">
          <div className="table-head">
            <span>Patient</span>
            <span>Opened</span>
            <span>Diagnoses</span>
            <span>Notes</span>
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
                    <span>{encounter.status === 'open' ? 'Consultation in progress' : `Closed ${encounter.closedAt ? formatDate(encounter.closedAt) : ''}`}</span>
                  </div>
                </div>
                <span data-label="Opened">{formatDate(encounter.openedAt)}</span>
                <span data-label="Diagnoses">{encounter.diagnoses.map((d) => d.description).join(', ') || '—'}</span>
                <span data-label="Notes">{encounter.notes.length}</span>
                {encounter.status === 'open' ? (
                  <button className="small-button" onClick={() => onOpenConsult(encounter.id)}>
                    <Stethoscope size={13} /> Continue
                  </button>
                ) : (
                  <Pill tone={statusTone('completed')} dot>
                    archived
                  </Pill>
                )}
              </div>
            )
          })}
          {encounters.length === 0 && <p className="empty-state">No encounters match your search.</p>}
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
  const [paste, setPaste] = useState('')
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null)

  const receive = (raw: string) => {
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      setOutcome({ state: 'error', message: 'That is not valid JSON — paste the case bundle file contents or choose a .json file.' })
      return
    }
    if (!isCaseBundle(parsed)) {
      setOutcome({ state: 'error', message: 'This file is not a VetCare case bundle.' })
      return
    }
    const bundle = parsed as CaseBundle
    if (data.caseTransfers.some((t) => t.token === bundle.token)) {
      setOutcome({ state: 'error', message: `This case was already received (token ${bundle.token.slice(0, 8)}…). Import skipped to avoid duplicates.` })
      return
    }
    dispatch({ type: 'importCaseBundle', bundle })
    const received = data.patients.length // captured before; summary uses bundle content
    void received
    setOutcome({
      state: 'done',
      message: `Received ${bundle.patient.name} from ${bundle.fromClinic.name}: ${bundle.encounters.length} visit${bundle.encounters.length === 1 ? '' : 's'} and ${bundle.vaccinations.length} vaccination${bundle.vaccinations.length === 1 ? '' : 's'} copied into this clinic with a new MRN.`,
    })
  }

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-label="Import a case bundle">
        <div className="form-heading">
          <div>
            <strong>Import case bundle</strong>
            <span>Receives a shared case from another clinic. Copies are stamped with the source clinic — nothing is shared in place.</span>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close dialog">
            <X size={17} />
          </button>
        </div>
        <Field label="Bundle file (.json)" htmlFor="import-file">
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
        <Field label="…or paste bundle JSON" htmlFor="import-paste">
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
          <p className={outcome.state === 'error' ? 'import-error' : 'import-ok'} role="status">
            {outcome.message}
          </p>
        )}
        <div className="form-actions">
          <button className="button secondary" onClick={() => receive(paste)} disabled={!paste.trim()}>
            Import pasted bundle
          </button>
          <button className="button primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

/* ---------- Vaccinations ---------- */

const Vaccinations = () => {
  const { data, dispatch } = useClinic()
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

  const rows = [...data.vaccinations]
    .sort((a, b) => b.administeredAt.localeCompare(a.administeredAt))
    .map((v) => {
      const patient = data.patients.find((p) => p.id === v.patientId)
      const vet = data.users.find((u) => u.id === v.vetId)
      const overdue = v.nextDueAt ? v.nextDueAt < new Date().toISOString() : false
      return { ...v, patient, vet, overdue }
    })

  return (
    <Panel title="Vaccinations" description="Vaccine history and next-due dates">
      {canWrite && (
        <div className="vaccination-form">
          <select value={patientId} onChange={(e) => setPatientId(e.target.value)} aria-label="Patient">
            <option value="">Select patient…</option>
            {data.patients.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.mrn})
              </option>
            ))}
          </select>
          <input value={vaccineName} onChange={(e) => setVaccineName(e.target.value)} placeholder="Vaccine name" aria-label="Vaccine name" />
          <input value={lotNumber} onChange={(e) => setLotNumber(e.target.value)} placeholder="Lot number" aria-label="Lot number" />
          <input type="date" value={administeredAt} onChange={(e) => setAdministeredAt(e.target.value)} aria-label="Date administered" />
          <input type="date" value={nextDueAt} onChange={(e) => setNextDueAt(e.target.value)} aria-label="Next due date" />
          <button className="small-button" onClick={record} disabled={!patientId || !vaccineName.trim()}>
            Record
          </button>
        </div>
      )}
      <div className="records-table vaccinations-table">
        <div className="table-head">
          <span>Patient</span>
          <span>Vaccine</span>
          <span>Given</span>
          <span>Next due</span>
          <span>Vet</span>
        </div>
        {rows.length === 0 && <p className="empty-state">No vaccinations recorded yet.</p>}
        {rows.map(({ patient, vet, overdue, ...v }) => (
          <div className="table-row" key={v.id}>
            <div className="patient-cell">
              <div className="pet-avatar">{patient?.name.slice(0, 1) ?? '?'}</div>
              <div>
                <strong>{patient?.name ?? 'Unknown'}</strong>
                <span>{patient?.mrn}</span>
              </div>
            </div>
            <span data-label="Vaccine">
              {v.vaccineName}
              {v.lotNumber ? ` · ${v.lotNumber}` : ''}
            </span>
            <span data-label="Given">{formatDate(v.administeredAt)}</span>
            <span data-label="Next due">
              {v.nextDueAt ? (
                <Pill tone={overdue ? 'bad' : 'muted'} dot>
                  {overdue ? 'Overdue ' : ''}
                  {formatDate(v.nextDueAt)}
                </Pill>
              ) : (
                '—'
              )}
            </span>
            <span data-label="Vet">{vet?.name ?? '—'}</span>
          </div>
        ))}
      </div>
    </Panel>
  )
}

/* ---------- Staff & permissions ---------- */

export const StaffView = () => {
  const { data, session, dispatch } = useClinic()
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
      <PageHeader title="Staff & permissions" description="Roles decide who can write records, bill, adjust stock and export." />
      {manage.allowed && (
        <Panel title="Add staff member" description="New members start active with the permissions of their role">
          <div className="form-grid">
            <Field label="Full name" htmlFor="staff-name">
              <input
                id="staff-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addStaff()}
                placeholder="e.g. Anong Srisuk…"
              />
            </Field>
            <Field label="Role" htmlFor="staff-role">
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
            Add member
          </button>
        </Panel>
      )}
      <Panel title={`${data.users.filter((u) => u.active).length} active staff members`} description="Current clinic team">
        <div className="records-table table-wide staff-table">
          <div className="table-head">
            <span>Member</span>
            <span>Role</span>
            <span>Permissions</span>
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
                      {isSelf ? 'Signed in on this device' : user.active ? 'Team member' : 'Deactivated'}
                      {' · '}
                      {hasPin(user) ? 'PIN set' : 'no PIN'}
                    </span>
                  </div>
                </div>
                <span>
                  {manage.allowed ? (
                    <select
                      aria-label={`Role for ${user.name}`}
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
                      Sign in as
                    </button>
                  )}
                </span>
                <span style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                  {(manage.allowed || isSelf) && user.active && (
                    <button className="small-button" onClick={() => setPinFor(user)} aria-label={`${hasPin(user) ? 'Change' : 'Set'} PIN for ${user.name}`}>
                      {hasPin(user) ? 'Change PIN' : 'Set PIN'}
                    </button>
                  )}
                  {manage.allowed &&
                    !isSelf &&
                    (user.active ? (
                      <button className="small-button" onClick={() => dispatch({ type: 'setStaffActive', id: user.id, active: false })}>
                        Deactivate
                      </button>
                    ) : (
                      <button className="small-button" onClick={() => dispatch({ type: 'setStaffActive', id: user.id, active: true })}>
                        Reactivate
                      </button>
                    ))}
                </span>
              </div>
            )
          })}
        </div>
      </Panel>
      <Panel
        title="Audit trail"
        description="Every write lands here with actor and timestamp"
        action={
          data.audit.length > 12 ? (
            <button className="small-button" onClick={() => setShowAllAudit((v) => !v)}>
              {showAllAudit ? 'Show recent' : `Show all ${data.audit.length}`}
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
          {data.audit.length === 0 && <p className="empty-state">No activity recorded yet.</p>}
        </div>
      </Panel>
      {pinFor && <PinDialog member={pinFor} onClose={() => setPinFor(null)} />}
    </>
  )
}

/* ---------- Settings (local data, sync & plan) ---------- */

export const SettingsView = ({ onManageClinic }: { onManageClinic?: () => void }) => {
  const { data, session, dispatch } = useClinic()
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
      summary: `Exported the clinic archive — ${data.patients.length} patients, ${data.invoices.length} invoices`,
    })
    setNotice(`Clinic archive exported (${data.patients.length} patients, ${data.invoices.length} invoices).`)
  }

  const createBackup = () => {
    const backup = buildBackup(data, new Date().toISOString())
    downloadBackup(backup)
    dispatch({
      type: 'recordAudit',
      action: 'backup.create',
      entityType: 'clinic',
      entityId: data.clinic.id,
      summary: `Created a clinic backup — ${data.patients.length} patients, ${data.encounters.length} encounters`,
    })
    setNotice('Backup downloaded. Keep it somewhere outside this computer.')
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
    setNotice(`Restored ${summary.patients} patients and ${summary.encounters} encounters from the backup.`)
  }

  return (
    <>
      <PageHeader
        title="Settings"
        description="Clinic identity, data portability and plan."
        action={
          <Pill tone={session.plan === 'cloud' ? 'ok' : 'info'} dot>
            {session.plan === 'cloud' ? 'Cloud plan' : 'Local plan'}
          </Pill>
        }
      />
      <div className="data-grid">
        <Panel title="Clinic" description="Shown across the workspace and on printed documents.">
          <div className="status-stack">
            <div className="status-line">
              <span className="status-icon">
                <Activity size={17} />
              </span>
              <div>
                <strong>{data.clinic.name}</strong>
                <span>
                  {data.clinic.timezone} · currency {data.clinic.currency} · VAT {Math.round(data.clinic.vatRate * 100)}%
                </span>
              </div>
              <Pill tone="muted">Local</Pill>
            </div>
            <div className="status-line">
              <span className="status-icon">
                <Database size={17} />
              </span>
              <div>
                <strong>Connection</strong>
                <span>{session.lanOnline ? 'Clinic server connected · writes are enabled' : 'Offline · read-only mode'}</span>
              </div>
              <Pill tone={session.lanOnline ? 'ok' : 'bad'}>{session.lanOnline ? 'Connected' : 'Offline'}</Pill>
            </div>
            <div className="status-line">
              <span className="status-icon">
                <Database size={17} />
              </span>
              <div>
                <strong>Cloud synchronization</strong>
                <span>
                  {session.plan === 'local'
                    ? 'Available on Cloud plan'
                    : sync.state === 'cloud_offline'
                      ? 'Internet unavailable'
                      : `${sync.pending} changes waiting`}
                </span>
              </div>
              <Pill tone={session.plan === 'local' ? 'muted' : sync.state === 'synced' ? 'ok' : 'warn'}>
                {session.plan === 'local' ? 'Local only' : sync.state}
              </Pill>
            </div>
            {session.lastSyncError && (
              <div className="status-line">
                <span className="status-icon">
                  <AlertTriangle size={17} />
                </span>
                <div>
                  <strong>Last sync attempt failed</strong>
                  <span>{session.lastSyncError}</span>
                </div>
                <Pill tone="bad">Sync error</Pill>
              </div>
            )}
          </div>
          <div className="data-actions">
            <button className="button primary" onClick={onManageClinic} disabled={!onManageClinic}>
              Manage clinic &amp; account
            </button>
            <button className="button secondary" onClick={() => dispatch({ type: 'session', patch: { lanOnline: !session.lanOnline } })}>
              {session.lanOnline ? 'Simulate server offline' : 'Reconnect server'}
            </button>
            <button
              className="button secondary"
              onClick={() => dispatch({ type: 'session', patch: { plan: session.plan === 'local' ? 'cloud' : 'local' } })}
            >
              {session.plan === 'local' ? 'Preview Cloud plan' : 'Switch to Local plan'}
            </button>
          </div>
        </Panel>
        <Panel title="Portability & recovery" description="Export and manual backup are included in the free Local plan.">
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
              <strong>Clinic export archive</strong>
              <span>Versioned JSON snapshot of every clinic record, for reporting and hand-off.</span>
            </div>
            <button className="button primary" onClick={exportData} disabled={!dataExport.allowed} title={dataExport.reason || undefined}>
              Export data
            </button>
          </div>
          <div className="export-card">
            <div className="export-icon">
              <ShieldCheck size={20} />
            </div>
            <div>
              <strong>Clinic backup file</strong>
              <span>A restorable copy of this installation — patients, visits, billing and settings.</span>
            </div>
            <button className="button secondary" onClick={createBackup} disabled={!dataExport.allowed} title={dataExport.reason || undefined}>
              Create backup
            </button>
          </div>
          <div className="export-card">
            <div className="export-icon">
              <RotateCcw size={20} />
            </div>
            <div>
              <strong>Restore from backup</strong>
              <span>Replaces this installation's records with the backup after a preview.</span>
            </div>
            <input
              ref={restoreInput}
              type="file"
              accept="application/json,.json"
              className="sr-only"
              aria-label="Choose a backup file"
              onChange={(e) => void chooseBackup(e.target.files?.[0])}
            />
            <button
              className="button secondary"
              onClick={() => restoreInput.current?.click()}
              disabled={!dataExport.allowed}
              title={dataExport.reason || undefined}
            >
              Choose backup…
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
          <div className="modal" role="dialog" aria-modal="true" aria-label="Restore clinic backup">
            <div className="form-heading">
              <div>
                <strong>Restore clinic backup</strong>
                <span>
                  {restorePreview.summary.clinicName} · created {formatDate(restorePreview.backup.createdAt)}
                </span>
              </div>
              <button className="icon-button" onClick={() => setRestorePreview(null)} aria-label="Close dialog">
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
                    {restorePreview.summary.patients} patients · {restorePreview.summary.owners} owners
                  </strong>
                  <span>
                    {restorePreview.summary.encounters} encounters · {restorePreview.summary.appointments} appointments ·{' '}
                    {restorePreview.summary.invoices} invoices
                  </span>
                </div>
              </div>
              <div className="status-line">
                <span className="status-icon">
                  <ShieldCheck size={17} />
                </span>
                <div>
                  <strong>{restorePreview.summary.staff} staff accounts</strong>
                  <span>Includes roles and PIN credentials as they were when the backup was taken.</span>
                </div>
              </div>
            </div>
            {restorePreview.backup.state.clinic.id !== data.clinic.id && (
              <p className="form-hint is-bad">
                This backup belongs to a different clinic ({restorePreview.backup.state.clinic.name}). Restoring it will replace
                this clinic's records.
              </p>
            )}
            <p className="form-hint">
              Everything currently on this computer will be replaced. Export a fresh archive first if you are unsure.
            </p>
            <div className="panel-footer">
              <button className="button secondary" onClick={() => setRestorePreview(null)}>
                Cancel
              </button>
              <button className="button primary" onClick={restoreBackup}>
                Restore backup
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
