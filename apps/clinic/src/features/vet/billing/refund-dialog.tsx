import { useState } from 'react'
import { Trans, useLingui } from '@lingui/react/macro'
import { Field } from '@/components/vet/fields'
import { Modal } from '@/components/vet/modal'
import { useClinic } from '@/lib/vet/store'
import { formatMoney as formatCurrency, formatDate } from '@/lib/vet/format'

/**
 * Refund dialog (2026-10-30 plan, phase C), extracted verbatim from the
 * Billing body. Opens pre-filled with the remaining refund headroom; the
 * reducer enforces that headroom again on `refundPayment` (ADR-0015).
 */
export const RefundDialog = ({ paymentId, onClose }: { paymentId: string; onClose: () => void }) => {
  const { data, dispatch } = useClinic()
  const { t } = useLingui()
  const payment = data.payments.find((p) => p.id === paymentId)
  const refundedSoFar = payment
    ? data.payments.filter((p) => p.refundOf === payment.id).reduce((sum, p) => sum + Math.abs(p.amount), 0)
    : 0
  const refundable = payment ? payment.amount - refundedSoFar : 0
  const [refundAmount, setRefundAmount] = useState(() => (refundable / 100).toFixed(2))
  const [refundNote, setRefundNote] = useState('')

  if (!payment) return null

  const submit = () => {
    const amount = Math.round(Number(refundAmount) * 100)
    if (!Number.isFinite(amount) || amount <= 0 || amount > refundable || !refundNote.trim()) return
    dispatch({
      type: 'refundPayment',
      invoiceId: payment.invoiceId,
      paymentId: payment.id,
      amount,
      note: refundNote,
    })
    onClose()
  }

  return (
    <Modal
      label={t`Refund payment on ${data.invoices.find((i) => i.id === payment.invoiceId)?.number ?? t`invoice`}`}
      title={<Trans>Refund payment</Trans>}
      subtitle={
        <Trans>{formatCurrency(payment.amount)} recorded on {formatDate(payment.receivedAt)} · up to{' '}
        {formatCurrency(refundable)} refundable</Trans>
      }
      onClose={onClose}
    >
      <div className="form-grid">
        <Field label={t`Refund amount (THB)`} htmlFor="refund-amount">
          <input
            id="refund-amount"
            type="number"
            min="0"
            step="0.01"
            value={refundAmount}
            onChange={(e) => setRefundAmount(e.target.value)}
          />
        </Field>
        <Field label={t`Reason (recorded on the receipt)`} htmlFor="refund-note">
          <input
            id="refund-note"
            value={refundNote}
            onChange={(e) => setRefundNote(e.target.value)}
            placeholder={t`e.g. Dispensed the wrong strength…`}
          />
        </Field>
      </div>
      <p className="form-hint">
        <Trans>Refunds are appended to the payment ledger; the original payment and the receipt stay unchanged.</Trans>
      </p>
      <div className="panel-footer">
        <button className="button secondary" onClick={onClose}>
          <Trans>Cancel</Trans>
        </button>
        <button
          className="button primary"
          onClick={submit}
          disabled={!(Number(refundAmount) > 0) || Math.round(Number(refundAmount) * 100) > refundable || !refundNote.trim()}
        >
          <Trans>Record refund</Trans>
        </button>
      </div>
    </Modal>
  )
}
