import { useState } from 'react'
import { Trans, useLingui } from '@lingui/react/macro'
import { Field } from '@/components/patterns/fields'
import { Modal } from '@/components/patterns/modal'
import { useClinic } from '@/lib/vet/store'

/**
 * Cancellation dialog (APT-04 / P2-14): the reducer refuses a reason-less
 * cancel, mirroring the backend's required `cancellationReason`. The reason
 * shows on the appointment card and in the audit trail.
 */
export const CancelAppointmentDialog = ({
  appointmentId,
  patientName,
  onClose,
}: {
  appointmentId: string
  patientName: string
  onClose: () => void
}) => {
  const { t } = useLingui()
  const { dispatch } = useClinic()
  const [reason, setReason] = useState('')

  const submit = () => {
    if (!reason.trim()) return
    dispatch({ type: 'setAppointmentStatus', id: appointmentId, status: 'cancelled', reason })
    onClose()
  }

  return (
    <Modal
      label={t`Cancel appointment for ${patientName}`}
      title={<Trans>Cancel appointment — {patientName}</Trans>}
      subtitle={<Trans>The reason is kept on the record and shown in the audit trail.</Trans>}
      onClose={onClose}
    >
      <div className="form-grid">
        <Field label={t`Reason`} htmlFor="cancel-reason">
          <input
            id="cancel-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t`e.g. Owner rescheduled to next week`}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit()
            }}
          />
        </Field>
      </div>
      <div className="panel-footer">
        <button className="button secondary" onClick={onClose}>
          <Trans>Keep appointment</Trans>
        </button>
        <button className="button primary" onClick={submit} disabled={!reason.trim()}>
          <Trans>Cancel appointment</Trans>
        </button>
      </div>
    </Modal>
  )
}
