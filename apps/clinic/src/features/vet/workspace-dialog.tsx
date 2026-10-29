import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react'
import { Check, KeyRound, Lock, Plus, ShieldCheck, X } from 'lucide-react'
import type { MessageDescriptor } from '@lingui/core'
import { msg } from '@lingui/core/macro'
import { Trans, useLingui } from '@lingui/react/macro'
import { Field, NativeSelect, Pill, ReadOnlyNote } from '@/components/vet/fields'
import { useClinic, usePermission, type View } from '@/lib/vet/store'
import { hasPin } from '@/lib/vet/auth'
import {
  initials,
  PERMISSIONS,
  permissionLabel,
  permissionsFor,
  roleDescription,
  roleLabel,
  ROLES,
} from '@/lib/vet/format'
import type { Role, StaffUser } from '@/lib/vet/types'
import { PinDialog } from './pin-dialog'

export type WorkspaceTab = 'clinic' | 'account' | 'team' | 'roles'

const TABS: { id: WorkspaceTab; label: MessageDescriptor }[] = [
  { id: 'clinic', label: msg`Clinic` },
  { id: 'account', label: msg`My account` },
  { id: 'team', label: msg`Team` },
  { id: 'roles', label: msg`Roles & permissions` },
]

const TIMEZONES = ['Asia/Bangkok', 'Asia/Ho_Chi_Minh', 'Asia/Vientiane', 'Asia/Phnom_Penh', 'Asia/Yangon', 'Asia/Kuala_Lumpur', 'Asia/Singapore', 'UTC']
const CURRENCIES = ['THB', 'USD', 'EUR', 'LAK', 'VND', 'KHR', 'MMK', 'SGD']

/**
 * Clinic and user management: identity, the signed-in account, team roster and
 * the role/permission matrix. Opened from the clinic card in the sidebar and
 * from the account avatar in the top bar.
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
  const { data, user, dispatch } = useClinic()
  const { t, i18n } = useLingui()
  const [tab, setTab] = useState<WorkspaceTab>(initialTab)
  const [pinFor, setPinFor] = useState<StaffUser | null>(null)

  // Signing in as another member is instant until they set a PIN; after that
  // the lock screen verifies the credential. Mirrors Staff & Permissions.
  const switchAccount = (member: StaffUser) => {
    if (!hasPin(member)) {
      dispatch({ type: 'signIn', userId: member.id })
      onClose()
      return
    }
    dispatch({ type: 'session', patch: { locked: true, currentUserId: member.id } })
  }

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // A PIN dialog owns Escape while it is open.
      if (e.key === 'Escape' && !pinFor) onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose, pinFor])

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="modal modal-wide workspace-dialog" role="dialog" aria-modal="true" aria-label={t`Clinic and account management`}>
        <div className="form-heading">
          <div>
            <strong><Trans>Clinic & account</Trans></strong>
            <span>
              {data.clinic.name} · {roleLabel[user.role]} · {user.name}
            </span>
          </div>
          <button className="icon-button" onClick={onClose} aria-label={t`Close clinic and account management`}>
            <X size={17} />
          </button>
        </div>

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
      </div>
    </div>
  )
}

/* ---------- Clinic identity ---------- */

const ClinicPanel = () => {
  const { data, dispatch } = useClinic()
  const { t } = useLingui()
  const manage = usePermission('clinic.manage')
  const [name, setName] = useState(data.clinic.name)
  const [timezone, setTimezone] = useState(data.clinic.timezone)
  const [currency, setCurrency] = useState(data.clinic.currency)
  const [vat, setVat] = useState(String(Math.round(data.clinic.vatRate * 1000) / 10))
  const [address, setAddress] = useState(data.clinic.address ?? '')
  const [phone, setPhone] = useState(data.clinic.phone ?? '')
  const [email, setEmail] = useState(data.clinic.email ?? '')
  const [saved, setSaved] = useState(false)

  const vatNumber = Number(vat)
  const vatValid = vat.trim() !== '' && Number.isFinite(vatNumber) && vatNumber >= 0 && vatNumber <= 100
  const valid = name.trim() !== '' && vatValid

  const save = (event: FormEvent) => {
    event.preventDefault()
    if (!valid || !manage.allowed) return
    dispatch({
      type: 'updateClinic',
      patch: {
        name: name.trim(),
        timezone,
        currency,
        vatRate: vatNumber / 100,
        address: address.trim(),
        phone: phone.trim(),
        email: email.trim(),
      },
    })
    setSaved(true)
  }

  const field =
    (setter: (value: string) => void) =>
    (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setter(e.target.value)
      setSaved(false)
    }

  return (
    <form className="workspace-panel" onSubmit={save}>
      {!manage.allowed && <ReadOnlyNote reason={manage.reason} />}
      <div className="workspace-grid">
        <Field label={t`Clinic name`} htmlFor="clinic-name" className="workspace-wide">
          <input
            id="clinic-name"
            value={name}
            onChange={field(setName)}
            disabled={!manage.allowed}
            placeholder={t`e.g. Baan Sathorn Animal Clinic…`}
            required
          />
        </Field>
        <Field label={t`Timezone`} htmlFor="clinic-timezone">
          <NativeSelect
            id="clinic-timezone"
            value={timezone}
            onChange={(e) => {
              setTimezone(e.target.value)
              setSaved(false)
            }}
            disabled={!manage.allowed}
          >
            {TIMEZONES.map((zone) => (
              <option key={zone} value={zone}>
                {zone}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label={t`Currency`} htmlFor="clinic-currency">
          <NativeSelect
            id="clinic-currency"
            value={currency}
            onChange={(e) => {
              setCurrency(e.target.value)
              setSaved(false)
            }}
            disabled={!manage.allowed}
          >
            {CURRENCIES.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label={t`VAT rate (%)`} htmlFor="clinic-vat">
          <input
            id="clinic-vat"
            type="number"
            min="0"
            max="100"
            step="0.1"
            inputMode="decimal"
            value={vat}
            onChange={field(setVat)}
            disabled={!manage.allowed}
            aria-invalid={!vatValid}
          />
        </Field>
        <Field label={t`Phone`} htmlFor="clinic-phone">
          <input
            id="clinic-phone"
            value={phone}
            onChange={field(setPhone)}
            disabled={!manage.allowed}
            autoComplete="off"
            inputMode="tel"
            placeholder={t`e.g. 02 234 5678…`}
          />
        </Field>
        <Field label={t`Email`} htmlFor="clinic-email" className="workspace-wide">
          <input
            id="clinic-email"
            type="email"
            value={email}
            onChange={field(setEmail)}
            disabled={!manage.allowed}
            autoComplete="off"
            placeholder={t`e.g. hello@clinic.vet…`}
          />
        </Field>
        <Field label={t`Address`} htmlFor="clinic-address" className="workspace-wide">
          <textarea
            id="clinic-address"
            rows={2}
            value={address}
            onChange={field(setAddress)}
            disabled={!manage.allowed}
            placeholder={t`Street, district, city, postal code…`}
          />
        </Field>
      </div>
      <div className="workspace-actions">
        <span className="workspace-hint">
          {manage.allowed ? (
            <Trans>Shown across the workspace and on printed documents.</Trans>
          ) : (
            <Trans>Only a clinic admin can change clinic identity.</Trans>
          )}
        </span>
        {saved && manage.allowed && (
          <Pill tone="ok" dot>
            <Trans>Saved locally</Trans>
          </Pill>
        )}
        <button className="button primary" type="submit" disabled={!manage.allowed || !valid || saved}>
          <Trans>Save clinic</Trans>
        </button>
      </div>
    </form>
  )
}

/* ---------- Signed-in account ---------- */

const AccountPanel = ({ onSetPin, onClose }: { onSetPin: () => void; onClose: () => void }) => {
  const { session, user, dispatch } = useClinic()
  const { t } = useLingui()
  const [name, setName] = useState(user.name)
  const [email, setEmail] = useState(user.email ?? '')
  const [phone, setPhone] = useState(user.phone ?? '')
  const [saved, setSaved] = useState(false)

  const dirty = name.trim() !== user.name || email.trim() !== (user.email ?? '') || phone.trim() !== (user.phone ?? '')
  const writable = session.lanOnline

  const save = (event: FormEvent) => {
    event.preventDefault()
    if (!name.trim() || !writable) return
    dispatch({ type: 'updateStaff', id: user.id, name: name.trim(), email: email.trim(), phone: phone.trim() })
    setSaved(true)
  }

  return (
    <div className="workspace-panel">
      <div className="workspace-account">
        <div className="avatar workspace-account-avatar">{initials(user.name)}</div>
        <div>
          <strong>{user.name}</strong>
          <span>
            {roleLabel[user.role]} · {hasPin(user) ? <Trans>PIN protected</Trans> : <Trans>No PIN set</Trans>}
          </span>
        </div>
        <Pill tone="info">{session.locked ? <Trans>Locked</Trans> : <Trans>Signed in</Trans>}</Pill>
      </div>

      {!writable && <ReadOnlyNote reason={t`Offline from clinic server — account changes are read-only`} />}

      <form onSubmit={save}>
        <div className="workspace-grid">
          <Field label={t`Full name`} htmlFor="account-name" className="workspace-wide">
            <input
              id="account-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                setSaved(false)
              }}
              disabled={!writable}
              autoComplete="off"
            />
          </Field>
          <Field label={t`Email`} htmlFor="account-email">
            <input
              id="account-email"
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                setSaved(false)
              }}
              disabled={!writable}
              autoComplete="off"
            />
          </Field>
          <Field label={t`Phone`} htmlFor="account-phone">
            <input
              id="account-phone"
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value)
                setSaved(false)
              }}
              disabled={!writable}
              autoComplete="off"
              inputMode="tel"
            />
          </Field>
        </div>
        <div className="workspace-actions">
          <span className="workspace-hint">
            {writable ? <Trans>Your teammates see this name on notes and the audit trail.</Trans> : ''}
          </span>
          {saved && !dirty && (
            <Pill tone="ok" dot>
              <Trans>Profile saved</Trans>
            </Pill>
          )}
          <button className="button primary" type="submit" disabled={!writable || !dirty || !name.trim()}>
            <Trans>Save profile</Trans>
          </button>
        </div>
      </form>

      <div className="workspace-section">
        <div className="workspace-section-head">
          <div>
            <strong><Trans>Authentication</Trans></strong>
            <span><Trans>This device unlocks with your staff PIN.</Trans></span>
          </div>
          <KeyRound size={17} />
        </div>
        <div className="workspace-actions">
          <span className="workspace-hint">
            {hasPin(user) ? (
              <Trans>A PIN is set for this account.</Trans>
            ) : (
              <Trans>Set a PIN so this account is protected on shared terminals.</Trans>
            )}
          </span>
          <button className="button secondary" type="button" onClick={onSetPin}>
            {hasPin(user) ? <Trans>Change PIN</Trans> : <Trans>Set PIN</Trans>}
          </button>
          <button
            className="button secondary"
            type="button"
            onClick={() => {
              onClose()
              dispatch({ type: 'session', patch: { locked: true } })
            }}
          >
            <Lock size={15} /> <Trans>Lock screen</Trans>
          </button>
        </div>
      </div>

      <div className="workspace-section">
        <div className="workspace-section-head">
          <div>
            <strong><Trans>Permissions from your role</Trans></strong>
            <span>
              {roleLabel[user.role]} — {roleDescription[user.role]}
            </span>
          </div>
          <ShieldCheck size={17} />
        </div>
        <div className="perm-list workspace-perms">
          {permissionsFor(user.role).map((permission) => (
            <span key={permission} className="perm-tag">
              {permissionLabel[permission]}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ---------- Team roster ---------- */

const TeamPanel = ({
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

/* ---------- Role / permission matrix ---------- */

const RolesPanel = () => {
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
