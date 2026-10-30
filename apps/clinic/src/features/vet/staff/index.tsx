import { useState } from 'react'
import { plural } from '@lingui/core/macro'
import { ShieldCheck } from 'lucide-react'
import { Trans, useLingui } from '@lingui/react/macro'
import { Field, Panel, PageHeader } from '@/components/vet/fields'
import { useClinic, usePermission } from '@/lib/vet/store'
import { formatDate, permissionsFor, roleLabel, ROLES } from '@/lib/vet/format'
import { hasPin } from '@/lib/vet/auth'
import type { StaffUser } from '@/lib/vet/types'
import { PinDialog } from '../pin-dialog'

/**
 * Staff & permissions View: add members, change roles, switch accounts,
 * manage PINs and read the audit trail. The workspace dialog's team panel
 * (staff/team-panel.tsx) is the compact second surface onto the same data.
 */
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

