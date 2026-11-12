import { useState, type FormEvent } from 'react'
import { Lock, PawPrint } from 'lucide-react'
import { Trans, useLingui } from '@lingui/react/macro'
import { useClinic } from '@/lib/vet/store'
import { hasPin, isPinFormat } from '@/lib/vet/auth'
import { initials, roleLabel } from '@/lib/vet/format'
import type { StaffUser } from '@/lib/vet/types'

/**
 * Full-screen gate shown when the session is locked. Credential verification
 * is orchestrated by the store (`signInWithPin`, ADR 0024): REST-authoritative
 * when the vetcare backend knows the member, document PBKDF2 otherwise. Then
 * a plain `signIn` dispatch replaces the session user. Members without a PIN
 * (a clinic that has not finished setup) can enter directly — admins are
 * prompted in Staff & Permissions to set one.
 */
export const LockScreen = () => {
  const { data, session, dispatch, signInWithPin } = useClinic()
  const { t } = useLingui()
  const members = data.users.filter((u) => u.active)
  const [selectedId, setSelectedId] = useState(session.currentUserId)
  const selected = members.find((u) => u.id === selectedId) ?? members[0]
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const anyPinConfigured = members.some(hasPin)

  const choose = (member: StaffUser) => {
    setSelectedId(member.id)
    setPin('')
    setError('')
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!selected) return
    setError('')
    if (!hasPin(selected)) {
      dispatch({ type: 'signIn', userId: selected.id })
      return
    }
    if (!isPinFormat(pin)) {
      setError(t`Enter your 4–8 digit PIN`)
      return
    }
    setBusy(true)
    const outcome = await signInWithPin(selected, pin)
    setBusy(false)
    if (outcome !== 'ok') {
      setError(t`Incorrect PIN — try again`)
      setPin('')
      return
    }
  }

  return (
    <div className="lock-screen">
      <form className="lock-card" onSubmit={submit}>
        <div className="lock-brand">
          <div className="brand-mark">
            <PawPrint size={19} />
          </div>
          <div>
            <strong>{data.clinic.name}</strong>
            <span>{members.length === 0 ? t`No staff on file` : t`Clinic locked`}</span>
          </div>
        </div>

        {members.length === 0 ? (
          <p className="lock-hint"><Trans>No active staff members are on file for this clinic.</Trans></p>
        ) : (
          <>
            <div className="lock-members" role="list" aria-label={t`Staff members`}>
              {members.map((member) => (
                <button
                  key={member.id}
                  type="button"
                  role="listitem"
                  className={`lock-member ${member.id === selected?.id ? 'active' : ''}`}
                  onClick={() => choose(member)}
                >
                  <span className="lock-avatar">{initials(member.name)}</span>
                  <span>
                    <strong>{member.name}</strong>
                    <em>
                      {roleLabel[member.role]}
                      {hasPin(member) ? '' : <> · <Trans>no PIN</Trans></>}
                    </em>
                  </span>
                </button>
              ))}
            </div>

            {selected && (
              <div className="lock-pin">
                <label htmlFor="lock-pin-input">
                  <Lock size={14} /> <Trans>PIN for {selected.name}</Trans>
                </label>
                {hasPin(selected) ? (
                  <>
                    <input
                      id="lock-pin-input"
                      type="password"
                      inputMode="numeric"
                      autoComplete="off"
                      maxLength={8}
                      value={pin}
                      onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                      placeholder="••••"
                      autoFocus
                    />
                    <button className="button primary" type="submit" disabled={busy || pin.length < 4}>
                      {busy ? t`Checking…` : t`Unlock`}
                    </button>
                  </>
                ) : (
                  <>
                    <p className="lock-hint"><Trans>This member has no PIN configured yet.</Trans></p>
                    <button className="button primary" type="submit">
                      <Trans>Continue without PIN</Trans>
                    </button>
                  </>
                )}
                {error && (
                  <p className="lock-error" role="alert">
                    {error}
                  </p>
                )}
              </div>
            )}

            {!anyPinConfigured && (
              <p className="lock-hint">
                <Trans>No staff PINs are set up yet. An admin can add them under Staff &amp; Permissions.</Trans>
              </p>
            )}
          </>
        )}
      </form>
    </div>
  )
}
