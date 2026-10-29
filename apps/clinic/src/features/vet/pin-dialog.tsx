import { useEffect, useState, type FormEvent } from 'react'
import { X } from 'lucide-react'
import { Trans, useLingui } from '@lingui/react/macro'
import { useClinic } from '@/lib/vet/store'
import { createPinCredential, hasPin, isPinFormat, PIN_MAX_LENGTH } from '@/lib/vet/auth'
import { Field } from '@/components/vet/fields'
import type { StaffUser } from '@/lib/vet/types'

/** Admin/self dialog for setting, changing, or removing a member's PIN. */
export const PinDialog = ({ member, onClose }: { member: StaffUser; onClose: () => void }) => {
  const { dispatch } = useClinic()
  const { t } = useLingui()
  const existing = hasPin(member)
  const [pin, setPin] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const save = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    if (!isPinFormat(pin)) {
      setError(t`PIN must be 4–8 digits`)
      return
    }
    if (pin !== confirm) {
      setError(t`PINs do not match`)
      return
    }
    setBusy(true)
    const credential = await createPinCredential(pin)
    dispatch({ type: 'setStaffPin', id: member.id, credential })
    onClose()
  }

  const clear = () => {
    dispatch({ type: 'setStaffPin', id: member.id, credential: null })
    onClose()
  }

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-label={t`Set a PIN for ${member.name}`}>
        <div className="form-heading">
          <div>
            <strong>
              {existing ? <Trans>Change PIN — {member.name}</Trans> : <Trans>Set PIN — {member.name}</Trans>}
            </strong>
            <span><Trans>PINs are hashed on this device and never synced in plain text.</Trans></span>
          </div>
          <button className="icon-button" onClick={onClose} aria-label={t`Close dialog`}>
            <X size={17} />
          </button>
        </div>
        <form onSubmit={save}>
          <div className="form-grid">
            <Field label={t`New PIN (4–8 digits)`} htmlFor="pin-new">
              <input
                id="pin-new"
                type="password"
                inputMode="numeric"
                autoComplete="new-password"
                maxLength={PIN_MAX_LENGTH}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                autoFocus
              />
            </Field>
            <Field label={t`Confirm PIN`} htmlFor="pin-confirm">
              <input
                id="pin-confirm"
                type="password"
                inputMode="numeric"
                autoComplete="new-password"
                maxLength={PIN_MAX_LENGTH}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value.replace(/\D/g, ''))}
              />
            </Field>
          </div>
          {error && (
            <p className="lock-error" role="alert">
              {error}
            </p>
          )}
          <div className="panel-footer">
            {existing && (
              <button type="button" className="small-button" onClick={clear}>
                <Trans>Remove PIN</Trans>
              </button>
            )}
            <button type="button" className="small-button" onClick={onClose}>
              <Trans>Cancel</Trans>
            </button>
            <button type="submit" className="button primary" disabled={busy || !pin || !confirm}>
              {busy ? t`Saving…` : existing ? t`Change PIN` : t`Set PIN`}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
