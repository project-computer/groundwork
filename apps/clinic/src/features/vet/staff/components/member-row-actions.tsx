import { useLingui, Trans } from '@lingui/react/macro'
import { useClinic, usePermission } from '@/lib/vet/store'
import { hasPin } from '@/lib/vet/auth'
import type { StaffUser } from '@/lib/vet/types'

/**
 * Shared member row buttons (2026-10-30 plan, phase B) — sign-in, PIN and
 * activate/deactivate with their hasPin / self / active conditionals, one
 * implementation behind the Staff & Permissions table and the workspace
 * team panel. Each surface places them; grouping stays per surface.
 */

export const MemberSignInButton = ({
  member,
  isSelf,
  onSignIn,
}: {
  member: StaffUser
  isSelf: boolean
  onSignIn: (member: StaffUser) => void
}) => {
  if (isSelf || !member.active) return null
  return (
    <button className="small-button" type="button" onClick={() => onSignIn(member)}>
      {hasPin(member) ? <Trans>Sign in (PIN)</Trans> : <Trans>Sign in as</Trans>}
    </button>
  )
}

export const MemberPinButton = ({
  member,
  isSelf,
  onSetPin,
}: {
  member: StaffUser
  isSelf: boolean
  onSetPin: (member: StaffUser) => void
}) => {
  const { t } = useLingui()
  const manage = usePermission('staff.manage')
  if (!member.active || !(manage.allowed || isSelf)) return null
  return (
    <button
      className="small-button"
      type="button"
      onClick={() => onSetPin(member)}
      aria-label={hasPin(member) ? t`Change PIN for ${member.name}` : t`Set PIN for ${member.name}`}
    >
      {hasPin(member) ? <Trans>Change PIN</Trans> : <Trans>Set PIN</Trans>}
    </button>
  )
}

export const MemberActivationButton = ({ member, isSelf }: { member: StaffUser; isSelf: boolean }) => {
  const { dispatch } = useClinic()
  const manage = usePermission('staff.manage')
  if (!manage.allowed || isSelf) return null
  return (
    <button
      className="small-button"
      type="button"
      onClick={() => dispatch({ type: 'setStaffActive', id: member.id, active: !member.active })}
    >
      {member.active ? <Trans>Deactivate</Trans> : <Trans>Reactivate</Trans>}
    </button>
  )
}
