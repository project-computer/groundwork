import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Lock, PawPrint } from 'lucide-react'
import { Trans, useLingui } from '@lingui/react/macro'
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
 *
 * Brute-force backoff (P2-20): five failures start a cooldown that doubles
 * with every further failure (30s → 60s → …, capped at 5 minutes). The
 * cooldown lives in this component's state — it guards the shared kiosk
 * against shoulder-surf guessing, not a cryptographic attack.
 */

/** Failures allowed before the first cooldown. */
const FAILURES_FREE = 5
const BASE_COOLDOWN_S = 30
const MAX_COOLDOWN_S = 300

const cooldownSeconds = (failures: number): number =>
  failures < FAILURES_FREE ? 0 : Math.min(BASE_COOLDOWN_S * 2 ** (failures - FAILURES_FREE), MAX_COOLDOWN_S)

export const LockScreen = () => {
  const { data, session, dispatch } = useClinic()
  const { t } = useLingui()
  const members = data.users.filter((u) => u.active)
  const [selectedId, setSelectedId] = useState(session.currentUserId)
  const selected = members.find((u) => u.id === selectedId) ?? members[0]
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [failures, setFailures] = useState(0)
  const [lockedUntil, setLockedUntil] = useState(0)
  const [nowMs, setNowMs] = useState(() => Date.now())

  const remainingS = useMemo(() => Math.max(0, Math.ceil((lockedUntil - nowMs) / 1000)), [lockedUntil, nowMs])
  const cooling = remainingS > 0

  // Ticks once a second while a cooldown is running so the countdown renders.
  useEffect(() => {
    if (!cooling) return
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [cooling])

  const anyPinConfigured = members.some(hasPin)

  const choose = (member: StaffUser) => {
    setSelectedId(member.id)
    setPin('')
    setError('')
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!selected) return
    if (remainingS > 0) return
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
    const ok = await verifyPin(selected, pin)
    setBusy(false)
    if (!ok) {
      const count = failures + 1
      setFailures(count)
      const wait = cooldownSeconds(count)
      if (wait > 0) {
        // Event handler, not render — Date.now() is the correct clock here.
        // oxlint-disable-next-line react/purity
        setLockedUntil(Date.now() + wait * 1000)
      }
      setError(wait > 0 ? t`Too many attempts — wait ${wait}s and try again` : t`Incorrect PIN — try again`)
      setPin('')
      return
    }
    setFailures(0)
    setLockedUntil(0)
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
                      disabled={remainingS > 0}
                    />
                    <button className="button primary" type="submit" disabled={busy || pin.length < 4 || remainingS > 0}>
                      {busy ? t`Checking…` : remainingS > 0 ? t`Wait ${remainingS}s` : t`Unlock`}
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
