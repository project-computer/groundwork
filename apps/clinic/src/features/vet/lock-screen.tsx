import { useState, type FormEvent } from 'react'
import { Lock, PawPrint } from 'lucide-react'
import { useClinic } from '@/lib/vet/store'
import { hasPin, isPinFormat, verifyPin } from '@/lib/vet/auth'
import { initials, roleLabel } from '@/lib/vet/format'
import type { StaffUser } from '@/lib/vet/types'

/**
 * Full-screen gate shown when the session is locked. Signing in is local: the
 * PIN is verified against the member's PBKDF2 hash, then a plain `signIn`
 * dispatch replaces the session user. Members without a PIN (a clinic that has
 * not finished setup) can enter directly — admins are prompted in Staff &
 * Permissions to set one.
 */
export const LockScreen = () => {
  const { data, session, dispatch } = useClinic()
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
      setError('Enter your 4–8 digit PIN')
      return
    }
    setBusy(true)
    const ok = await verifyPin(selected, pin)
    setBusy(false)
    if (!ok) {
      setError('Incorrect PIN — try again')
      setPin('')
      return
    }
    dispatch({ type: 'signIn', userId: selected.id })
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
            <span>{members.length === 0 ? 'No staff on file' : 'Clinic locked'}</span>
          </div>
        </div>

        {members.length === 0 ? (
          <p className="lock-hint">No active staff members are on file for this clinic.</p>
        ) : (
          <>
            <div className="lock-members" role="list" aria-label="Staff members">
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
                      {hasPin(member) ? '' : ' · no PIN'}
                    </em>
                  </span>
                </button>
              ))}
            </div>

            {selected && (
              <div className="lock-pin">
                <label htmlFor="lock-pin-input">
                  <Lock size={14} /> PIN for {selected.name}
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
                      {busy ? 'Checking…' : 'Unlock'}
                    </button>
                  </>
                ) : (
                  <>
                    <p className="lock-hint">This member has no PIN configured yet.</p>
                    <button className="button primary" type="submit">
                      Continue without PIN
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
                No staff PINs are set up yet. An admin can add them under Staff &amp; Permissions.
              </p>
            )}
          </>
        )}
      </form>
    </div>
  )
}
