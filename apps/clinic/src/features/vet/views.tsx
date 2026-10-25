import { useState } from 'react'
import { Activity, BarChart3, Database, ShieldCheck, Stethoscope } from 'lucide-react'
import { Panel, PageHeader, Pill } from '@/components/vet/fields'
import { useClinic, useSyncState } from '@/lib/vet/store'
import { formatDate, formatMoney, invoiceTotals, permissionsFor, roleLabel, statusTone, todayKey } from '@/lib/vet/format'

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
            placeholder="Search by patient or diagnosis"
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

/* ---------- Reports ---------- */

export function ReportsView() {
  const { data } = useClinic()
  const today = todayKey()
  const paidToday = data.payments
    .filter((p) => p.receivedAt.startsWith(today))
    .reduce((sum, p) => sum + p.amount, 0)
  const outstanding = data.invoices
    .filter((i) => i.status !== 'paid')
    .reduce((sum, invoice) => sum + invoiceTotals(invoice, data.clinic.vatRate, data.payments).balance, 0)
  const monthPrefix = today.slice(0, 7)
  const visitsThisMonth = data.encounters.filter((e) => e.openedAt.startsWith(monthPrefix)).length
  const newClients = data.owners.filter((o) => o.version === 1).length
  const noShows = data.appointments.filter((a) => a.status === 'no_show').length
  const stats = [
    { label: 'Payments received today', value: formatMoney(paidToday), note: `${data.payments.filter((p) => p.receivedAt.startsWith(today)).length} payments` },
    { label: 'Outstanding balance', value: formatMoney(outstanding), note: `${data.invoices.filter((i) => i.status !== 'paid').length} open invoices` },
    { label: 'Encounters this month', value: String(visitsThisMonth), note: 'Consultation volume' },
    { label: 'No-shows (all time)', value: String(noShows), note: `${newClients} owners on file` },
  ]
  return (
    <>
      <PageHeader title="Reports" description="Daily numbers from your local data — no cloud required." />
      <div className="stat-grid">
        {stats.map((s) => (
          <div className="stat-card" key={s.label}>
            <span className="stat-icon teal">
              <BarChart3 size={19} />
            </span>
            <div>
              <small>{s.label}</small>
              <strong>{s.value}</strong>
              <span className="stat-note">{s.note}</span>
            </div>
          </div>
        ))}
      </div>
      <Panel title="Coming in phase 2" description="Planned reporting capabilities">
        <p className="empty-state">
          Revenue by service, payment-method breakdown, stock valuation, expiry losses and CSV/Excel exports for owners, pets,
          visits, invoices and inventory.
        </p>
      </Panel>
    </>
  )
}

/* ---------- Staff & permissions ---------- */

export function StaffView() {
  const { data, session } = useClinic()
  return (
    <>
      <PageHeader title="Staff & permissions" description="Roles decide who can write records, bill, adjust stock and export." />
      <Panel title={`${data.users.length} staff members`} description="Current clinic team">
        <div className="records-table">
          <div className="table-head">
            <span>Member</span>
            <span>Role</span>
            <span>Permissions</span>
            <span />
            <span />
          </div>
          {data.users.map((user) => (
            <div className="table-row" key={user.id}>
              <div className="patient-cell">
                <div className="pet-avatar">{user.name.slice(0, 1)}</div>
                <div>
                  <strong>{user.name}</strong>
                  <span>{user.id === session.currentUserId ? 'Signed in on this device' : 'Team member'}</span>
                </div>
              </div>
              <span>
                <Pill tone={user.id === session.currentUserId ? 'ok' : 'muted'} dot={user.id === session.currentUserId}>
                  {roleLabel[user.role]}
                </Pill>
              </span>
              <span className="perm-list">
                {permissionsFor(user.role).map((permission) => (
                  <Pill key={permission} tone="muted">
                    {permission}
                  </Pill>
                ))}
              </span>
              <span />
              <span />
            </div>
          ))}
        </div>
      </Panel>
      <Panel title="Audit trail" description="Every write lands here with actor and timestamp">
        <div className="activity-list">
          {data.audit.slice(0, 12).map((item) => (
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
