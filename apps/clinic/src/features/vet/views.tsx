import { useState } from 'react'
import { Activity, Database, ShieldCheck, Stethoscope } from 'lucide-react'
import { Field, Panel, PageHeader, Pill } from '@/components/vet/fields'
import { useClinic, usePermission, useSyncState } from '@/lib/vet/store'
import { formatDate, permissionsFor, roleLabel, statusTone, todayKey } from '@/lib/vet/format'
import type { StaffUser } from '@/lib/vet/types'

/* ---------- Medical records ---------- */

export function RecordsView({ onOpenConsult }: { onOpenConsult: (encounterId: string) => void }) {
  const { data } = useClinic()
  const [query, setQuery] = useState('')
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
          <input
            className="search-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by patient or diagnosis…"
            aria-label="Search medical records"
          />
        }
      />
      <Panel title={`${encounters.length} encounters`} description="Newest first">
        <div className="records-table">
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
                <span>{formatDate(encounter.openedAt)}</span>
                <span>{encounter.diagnoses.map((d) => d.description).join(', ') || '—'}</span>
                <span>{encounter.notes.length}</span>
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
        </div>
      </Panel>
    </>
  )
}

/* ---------- Staff & permissions ---------- */

const roleOptions: StaffUser['role'][] = ['reception', 'veterinarian', 'pharmacist', 'admin']

export function StaffView() {
  const { data, session, dispatch } = useClinic()
  const manage = usePermission('staff.manage')
  const [name, setName] = useState('')
  const [role, setRole] = useState<StaffUser['role']>('reception')
  const [showAllAudit, setShowAllAudit] = useState(false)

  const addStaff = () => {
    if (!name.trim()) return
    dispatch({ type: 'addStaff', name, role })
    setName('')
    setRole('reception')
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
                {roleOptions.map((r) => (
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
        <div className="records-table table-wide">
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
                    <span>{isSelf ? 'Signed in on this device' : user.active ? 'Team member' : 'Deactivated'}</span>
                  </div>
                </div>
                <span>
                  {manage.allowed ? (
                    <select
                      aria-label={`Role for ${user.name}`}
                      value={user.role}
                      onChange={(e) => dispatch({ type: 'updateStaff', id: user.id, role: e.target.value as StaffUser['role'] })}
                    >
                      {roleOptions.map((r) => (
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
                    <button className="small-button" onClick={() => dispatch({ type: 'switchUser', userId: user.id })}>
                      Sign in as
                    </button>
                  )}
                </span>
                <span>
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
    </>
  )
}

/* ---------- Settings (local data, sync & plan) ---------- */

export function SettingsView() {
  const { data, session, dispatch } = useClinic()
  const sync = useSyncState()

  const exportData = () => {
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), clinic: data.clinic, data }, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `clinicbook-export-${todayKey()}.json`
    anchor.click()
    URL.revokeObjectURL(url)
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
          </div>
          <div className="data-actions">
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
          <div className="export-card">
            <div className="export-icon">
              <Database size={20} />
            </div>
            <div>
              <strong>Clinic export archive</strong>
              <span>Versioned JSON snapshot of every clinic record.</span>
            </div>
            <button className="button primary" onClick={exportData}>
              Export data
            </button>
          </div>
          <div className="export-card">
            <div className="export-icon">
              <ShieldCheck size={20} />
            </div>
            <div>
              <strong>Native backup</strong>
              <span>Consistent database snapshot for fast restore.</span>
            </div>
            <button className="button secondary">Create backup</button>
          </div>
        </Panel>
      </div>
    </>
  )
}
