import { useEffect, useState } from 'react'
import type { MessageDescriptor } from '@lingui/core'
import { msg } from '@lingui/core/macro'
import { Trans, useLingui } from '@lingui/react/macro'
import { Modal } from '@/components/vet/modal'
import { AccountPanel } from './account-panel'
import { ClinicPanel } from './clinic-panel'
import { RolesPanel } from './roles-panel'
import { TeamPanel, useSwitchAccount } from '../staff'
import { useClinic, type View } from '@/lib/vet/store'
import { roleLabel } from '@/lib/vet/format'
import type { StaffUser } from '@/lib/vet/types'
import { PinDialog } from '../pin-dialog'

export type WorkspaceTab = 'clinic' | 'account' | 'team' | 'roles'

const TABS: { id: WorkspaceTab; label: MessageDescriptor }[] = [
  { id: 'clinic', label: msg`Clinic` },
  { id: 'account', label: msg`My account` },
  { id: 'team', label: msg`Team` },
  { id: 'roles', label: msg`Roles & permissions` },
]

/**
 * Clinic and user management: identity, the signed-in account, team roster and
 * the role/permission matrix. Opened from the clinic card in the sidebar and
 * from the account avatar in the top bar. Panels live in their own files
 * beside (2026-10-30 plan, phase C); the team panel is the staff feature's
 * second surface, imported through its public API.
 */
export const WorkspaceDialog = ({
  initialTab,
  onClose,
  onNavigate,
}: {
  initialTab: WorkspaceTab
  onClose: () => void
  onNavigate: (view: View) => void
}) => {
  const { data, user } = useClinic()
  const { t, i18n } = useLingui()
  const [tab, setTab] = useState<WorkspaceTab>(initialTab)
  const [pinFor, setPinFor] = useState<StaffUser | null>(null)

  // Signing in as another member is instant until they set a PIN; after that
  // the lock screen verifies the credential. Shared with Staff & Permissions
  // (staff/member-form.tsx) through the staff feature's public API.
  const switchAccount = useSwitchAccount(onClose)

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // A PIN dialog owns Escape while it is open.
      if (e.key === 'Escape' && !pinFor) onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose, pinFor])

  return (
    <Modal
      label={t`Clinic and account management`}
      title={<Trans>Clinic & account</Trans>}
      subtitle={<>{data.clinic.name} · {roleLabel[user.role]} · {user.name}</>}
      closeLabel={t`Close clinic and account management`}
      closeOnEscape={false}
      wide
      className="workspace-dialog"
      onClose={onClose}
    >
      <div className="seg workspace-tabs" role="tablist" aria-label={t`Management sections`}>
        {TABS.map((item) => (
          <button
            key={item.id}
            role="tab"
            aria-selected={tab === item.id}
            className={tab === item.id ? 'active' : ''}
            onClick={() => setTab(item.id)}
          >
            {i18n._(item.label)}
          </button>
        ))}
      </div>

      <div className="workspace-body" role="tabpanel">
        {tab === 'clinic' && <ClinicPanel />}
        {tab === 'account' && <AccountPanel onSetPin={() => setPinFor(user)} onClose={onClose} />}
        {tab === 'team' && <TeamPanel onSetPin={setPinFor} onSwitchAccount={switchAccount} onNavigate={onNavigate} />}
        {tab === 'roles' && <RolesPanel />}
      </div>

      {pinFor && <PinDialog member={pinFor} onClose={() => setPinFor(null)} />}
    </Modal>
  )
}
