import { useState } from 'react'
import type { FormEvent } from 'react'
import { Trans, useLingui } from '@lingui/react/macro'
import { Plus } from 'lucide-react'
import { Field, NativeSelect, Pill, ReadOnlyNote } from '@/components/vet/fields'
import { useClinic, usePermission, type View } from '@/lib/vet/store'
import { initials, roleLabel, ROLES } from '@/lib/vet/format'
import { hasPin } from '@/lib/vet/auth'
import type { Role, StaffUser } from '@/lib/vet/types'

/** Compact team roster for the workspace dialog — second surface of staff/. */
/* ---------- Team roster ---------- */

export const TeamPanel = ({
  onSetPin,
  onSwitchAccount,
  onNavigate,
}: {
  onSetPin: (member: StaffUser) => void
  onSwitchAccount: (member: StaffUser) => void
  onNavigate: (view: View) => void
}) => {
  const { data, session, dispatch } = useClinic()
  const { t } = useLingui()
  const manage = usePermission('staff.manage')
  const [name, setName] = useState('')
  const [role, setRole] = useState<Role>('reception')
  const [email, setEmail] = useState('')

  const addMember = (event: FormEvent) => {
    event.preventDefault()
    if (!name.trim() || !manage.allowed) return
    dispatch({ type: 'addStaff', name: name.trim(), role, email: email.trim() })
    setName('')
    setEmail('')
    setRole('reception')
  }

  return (
    <div className="workspace-panel">
      {!manage.allowed && <ReadOnlyNote reason={manage.reason} />}

      {manage.allowed && (
        <form className="workspace-add" onSubmit={addMember}>
          <div className="workspace-grid">
            <Field label={t`New member`} htmlFor="team-name">
              <input
                id="team-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t`e.g. Anong Srisuk…`}
                autoComplete="off"
              />
            </Field>
            <Field label={t`Role`} htmlFor="team-role">
              <NativeSelect id="team-role" value={role} onChange={(e) => setRole(e.target.value as Role)}>
                {ROLES.map((option) => (
                  <option key={option} value={option}>
                    {roleLabel[option]}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label={t`Email (optional)`} htmlFor="team-email" className="workspace-wide">
              <input
                id="team-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t`e.g. anong@clinic.vet…`}
                autoComplete="off"
              />
            </Field>
          </div>
          <div className="workspace-actions">
            <span className="workspace-hint"><Trans>New members start active with the permissions of their role.</Trans></span>
            <button className="button primary" type="submit" disabled={!name.trim()}>
              <Plus size={15} /> <Trans>Add member</Trans>
            </button>
          </div>
        </form>
      )}

      <div className="workspace-members">
        {data.users.map((member) => {
          const isSelf = member.id === session.currentUserId
          return (
            <div className={`workspace-member ${member.active ? '' : 'is-inactive'}`} key={member.id}>
              <div className="avatar">{initials(member.name)}</div>
              <div className="workspace-member-main">
                <strong>
                  {member.name}
                  {isSelf && (
                    <span className="workspace-self">
                      <Pill tone="info"><Trans>You</Trans></Pill>
                    </span>
                  )}
                </strong>
                <span>
                  {member.email || roleLabel[member.role]}
                  {member.phone ? ` · ${member.phone}` : ''}
                  {' · '}
                  {member.active ? (hasPin(member) ? <Trans>PIN set</Trans> : <Trans>no PIN</Trans>) : <Trans>deactivated</Trans>}
                </span>
              </div>
              {manage.allowed ? (
                <NativeSelect
                  className="workspace-role-select"
                  aria-label={t`Role for ${member.name}`}
                  value={member.role}
                  onChange={(e) => dispatch({ type: 'updateStaff', id: member.id, role: e.target.value as Role })}
                >
                  {ROLES.map((option) => (
                    <option key={option} value={option}>
                      {roleLabel[option]}
                    </option>
                  ))}
                </NativeSelect>
              ) : (
                <span className="role-badge">{roleLabel[member.role]}</span>
              )}
              <div className="workspace-member-actions">
                {member.active && (manage.allowed || isSelf) && (
                  <button
                    className="small-button"
                    type="button"
                    onClick={() => onSetPin(member)}
                    aria-label={hasPin(member) ? t`Change PIN for ${member.name}` : t`Set PIN for ${member.name}`}
                  >
                    {hasPin(member) ? <Trans>Change PIN</Trans> : <Trans>Set PIN</Trans>}
                  </button>
                )}
                {!isSelf && member.active && (
                  <button className="small-button" type="button" onClick={() => onSwitchAccount(member)}>
                    {hasPin(member) ? <Trans>Sign in (PIN)</Trans> : <Trans>Sign in as</Trans>}
                  </button>
                )}
                {manage.allowed && !isSelf && member.active && (
                  <button className="small-button" type="button" onClick={() => dispatch({ type: 'setStaffActive', id: member.id, active: false })}>
                    <Trans>Deactivate</Trans>
                  </button>
                )}
                {manage.allowed && !isSelf && !member.active && (
                  <button className="small-button" type="button" onClick={() => dispatch({ type: 'setStaffActive', id: member.id, active: true })}>
                    <Trans>Reactivate</Trans>
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div className="workspace-actions">
        <span className="workspace-hint"><Trans>Switch accounts here or open the full staff view for the audit trail.</Trans></span>
        <button className="text-button" type="button" onClick={() => onNavigate('staff')}>
          <Trans>Open Staff & Permissions</Trans>
        </button>
      </div>
    </div>
  )
}

