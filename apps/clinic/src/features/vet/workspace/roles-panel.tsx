import { Check } from 'lucide-react'
import { Trans, useLingui } from '@lingui/react/macro'
import { useClinic } from '@/lib/vet/store'
import { PERMISSIONS, permissionLabel, permissionsFor, roleDescription, roleLabel, ROLES } from '@/lib/vet/format'

/** Role / permission matrix tab (2026-10-30 plan, phase C) — moved verbatim from index. */
export const RolesPanel = () => {
  const { user } = useClinic()
  const { t } = useLingui()
  return (
    <div className="workspace-panel">
      <p className="workspace-lede">
        <Trans>Every role is a fixed set of permissions. Assign a member's role from the Team tab; their access updates immediately.</Trans>
      </p>
      <div className="workspace-matrix-wrap">
        <table className="role-matrix">
          <thead>
            <tr>
              <th scope="col"><Trans>Permission</Trans></th>
              {ROLES.map((role) => (
                <th key={role} scope="col" className={role === user.role ? 'is-current' : undefined}>
                  {roleLabel[role]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PERMISSIONS.map((permission) => (
              <tr key={permission}>
                <th scope="row">
                  {permissionLabel[permission]}
                  <code>{permission}</code>
                </th>
                {ROLES.map((role) => (
                  <td key={role} className={role === user.role ? 'is-current' : undefined}>
                    {permissionsFor(role).includes(permission) ? (
                      <span className="matrix-yes" aria-label={t`Allowed`}>
                        <Check size={14} />
                      </span>
                    ) : (
                      <span className="matrix-no" aria-label={t`Not allowed`}>
                        —
                      </span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="workspace-role-notes">
        {ROLES.map((role) => (
          <p key={role}>
            <strong>{roleLabel[role]}</strong>
            <span>{roleDescription[role]}</span>
          </p>
        ))}
      </div>
      <div className="workspace-actions">
        <span className="workspace-hint">
          <Trans>
            You are signed in as {roleLabel[user.role]}. {permissionsFor(user.role).length} of {PERMISSIONS.length} permissions.
          </Trans>
        </span>
      </div>
    </div>
  )
}
