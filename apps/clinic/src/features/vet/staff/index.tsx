import { useState } from 'react'
import { plural } from '@lingui/core/macro'
import { ShieldCheck } from 'lucide-react'
import { Trans, useLingui } from '@lingui/react/macro'
import { DataTable } from '@/components/patterns/data-table'
import { Field, Panel, PageHeader } from '@/components/patterns/fields'
import { useClinic, usePermission } from '@/lib/vet/store'
import { formatDate, permissionsFor, roleLabel, ROLES } from '@/lib/vet/format'
import { hasPin } from '@/lib/vet/auth'
import type { StaffUser } from '@/lib/vet/types'
import { useMemberForm, useSwitchAccount } from './components/member-form'
import { MemberActivationButton, MemberPinButton, MemberSignInButton } from './components/member-row-actions'
import { PinDialog } from '@/features/vet/session'

// The workspace dialog consumes the staff feature through this public API —
// never its folder internals (2026-10-30 plan, phase D).
export { TeamPanel } from './components/team-panel'
export { useSwitchAccount } from './components/member-form'

/**
 * Staff & permissions View: add members, change roles, switch accounts,
 * manage PINs and read the audit trail. The workspace dialog's team panel
 * (staff/team-panel.tsx) is the compact second surface onto the same data —
 * the add form and row actions are shared via member-form / member-row-actions.
 */
export const StaffView = () => {
  const { data, session, dispatch } = useClinic()
  const { t } = useLingui()
  const manage = usePermission('staff.manage')
  const { name, setName, role, setRole, canSubmit, submit } = useMemberForm()
  const signInAs = useSwitchAccount()
  const [showAllAudit, setShowAllAudit] = useState(false)
  const [pinFor, setPinFor] = useState<StaffUser | null>(null)

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
                onKeyDown={(e) => e.key === 'Enter' && submit()}
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
          <button className="button primary" onClick={submit} disabled={!canSubmit}>
            <Trans>Add member</Trans>
          </button>
        </Panel>
      )}
      <Panel
        title={plural(data.users.filter((u) => u.active).length, { one: '# active staff member', other: '# active staff members' })}
        description={t`Current clinic team`}
      >
        <DataTable
          className="table-wide staff-table"
          columns={[
            <Trans key="member">Member</Trans>,
            <Trans key="role">Role</Trans>,
            <Trans key="permissions">Permissions</Trans>,
            null,
            null,
          ]}
        >
          {data.users.map((user) => {
            const isSelf = user.id === session.currentUserId
            return (
              <div className="table-row" key={user.id} style={!user.active ? { opacity: 0.5 } : undefined}>
                <div className="patient-cell">
                  <div className="member-avatar">{user.name.slice(0, 1)}</div>
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
                  {!isSelf && user.active && <MemberSignInButton member={user} isSelf={isSelf} onSignIn={signInAs} />}
                </span>
                <span style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                  <MemberPinButton member={user} isSelf={isSelf} onSetPin={setPinFor} />
                  <MemberActivationButton member={user} isSelf={isSelf} />
                </span>
              </div>
            )
          })}
        </DataTable>
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

