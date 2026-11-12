import { useState, type FormEvent } from 'react'
import { Trans, useLingui } from '@lingui/react/macro'
import { useClinic } from '@/lib/vet/store'
import { hasPin, isPinFormat, PIN_MAX_LENGTH } from '@/lib/vet/auth'
import { Field } from '@/components/patterns/fields'
import { Modal } from '@/components/patterns/modal'
import type { StaffUser } from '@/lib/vet/types'

/** Admin/self dialog for setting, changing, or removing a member's PIN. The
 * store orchestrates the write: the document hash commits first (the offline
 * guarantee), then the change mirrors to the REST backend when the member is
 * known there (ADR 0024, issue 0019). */
export const PinDialog = ({ member, onClose }: { member: StaffUser; onClose: () => void }) => {
  const { dispatch, setMemberPin } = useClinic()
  const { t } = useLingui()
  const existing = hasPin(member)
  const [pin, setPin] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

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
    setMemberPin(member, pin)
    onClose()
  }

  const clear = () => {
    dispatch({ type: 'setStaffPin', id: member.id, credential: null })
    onClose()
  }

  return (
    <Modal
      label={t`Set a PIN for ${member.name}`}
      title={existing ? <Trans>Change PIN — {member.name}</Trans> : <Trans>Set PIN — {member.name}</Trans>}
      subtitle={<Trans>PINs are hashed on this device and never synced in plain text.</Trans>}
      onClose={onClose}
    >
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
    </Modal>
  )
}
