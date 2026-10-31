import { Trans, useLingui } from '@lingui/react/macro'
import { Plus } from 'lucide-react'
import { Field, NativeSelect, Pill, ReadOnlyNote } from '@/components/patterns/fields'
import { useClinic, usePermission, type View } from '@/lib/vet/store'
import { initials, roleLabel, ROLES } from '@/lib/vet/format'
import { hasPin } from '@/lib/vet/auth'
import type { Role, StaffUser } from '@/lib/vet/types'
import { useMemberForm } from './member-form'
import { MemberActivationButton, MemberPinButton, MemberSignInButton } from './member-row-actions'

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
  const { name, setName, role, setRole, email, setEmail, canSubmit, submit } = useMemberForm()

  return (
    <div className="workspace-panel">
      {!manage.allowed && <ReadOnlyNote reason={manage.reason} />}

      {manage.allowed && (
        <form className="workspace-add" onSubmit={(event) => { event.preventDefault(); submit() }}>
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
            <button className="button primary" type="submit" disabled={!canSubmit}>
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
                <MemberPinButton member={member} isSelf={isSelf} onSetPin={onSetPin} />
                <MemberSignInButton member={member} isSelf={isSelf} onSignIn={onSwitchAccount} />
                <MemberActivationButton member={member} isSelf={isSelf} />
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

