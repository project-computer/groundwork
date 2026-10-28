import { useEffect, useState, type FormEvent } from 'react'
import { X } from 'lucide-react'
import { useClinic } from '@/lib/vet/store'
import { createPinCredential, hasPin, isPinFormat, PIN_MAX_LENGTH } from '@/lib/vet/auth'
import { Field } from '@/components/vet/fields'
import type { StaffUser } from '@/lib/vet/types'

/** Admin/self dialog for setting, changing, or removing a member's PIN. */
export const PinDialog = ({ member, onClose }: { member: StaffUser; onClose: () => void }) => {
  const { dispatch } = useClinic()
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
      setError('PIN must be 4–8 digits')
      return
    }
    if (pin !== confirm) {
      setError('PINs do not match')
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
      <div className="modal" role="dialog" aria-modal="true" aria-label={`Set a PIN for ${member.name}`}>
        <div className="form-heading">
          <div>
            <strong>
              {existing ? 'Change' : 'Set'} PIN — {member.name}
            </strong>
            <span>PINs are hashed on this device and never synced in plain text.</span>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close dialog">
            <X size={17} />
          </button>
        </div>
        <form onSubmit={save}>
          <div className="form-grid">
            <Field label="New PIN (4–8 digits)" htmlFor="pin-new">
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
            <Field label="Confirm PIN" htmlFor="pin-confirm">
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
                Remove PIN
              </button>
            )}
            <button type="button" className="small-button" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="button primary" disabled={busy || !pin || !confirm}>
              {busy ? 'Saving…' : existing ? 'Change PIN' : 'Set PIN'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
