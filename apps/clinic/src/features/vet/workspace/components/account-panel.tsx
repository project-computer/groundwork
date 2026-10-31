import { useState, type FormEvent } from 'react'
import { KeyRound, Lock, ShieldCheck } from 'lucide-react'
import { Trans, useLingui } from '@lingui/react/macro'
import { Field, Pill, ReadOnlyNote } from '@/components/patterns/fields'
import { useClinic } from '@/lib/vet/store'
import { hasPin } from '@/lib/vet/auth'
import { initials, permissionLabel, permissionsFor, roleDescription, roleLabel } from '@/lib/vet/format'

/** Signed-in account tab (2026-10-30 plan, phase C) — moved verbatim from index. */
export const AccountPanel = ({ onSetPin, onClose }: { onSetPin: () => void; onClose: () => void }) => {
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
