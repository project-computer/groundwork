import { useState } from 'react'
import { Trans, useLingui } from '@lingui/react/macro'
import { Field, NativeSelect } from '@/components/vet/fields'
import { Modal } from '@/components/vet/modal'
import { useClinic } from '@/lib/vet/store'
import { formatMoney as formatCurrency, invoiceTotals } from '@/lib/vet/format'

/**
 * Record-payment dialog (2026-10-30 plan, phase C), extracted verbatim from
 * the Billing body. Opens pre-filled with the invoice balance; partial
 * payments are supported and the reducer rejects overpayment (ADR-0015).
 */
export const PaymentDialog = ({ invoiceId, onClose }: { invoiceId: string; onClose: () => void }) => {
  const { data, dispatch } = useClinic()
  const { t } = useLingui()
  const invoice = data.invoices.find((i) => i.id === invoiceId)
  const balance = invoice ? invoiceTotals(invoice, data.clinic.vatRate, data.payments).balance : 0
  const [payAmount, setPayAmount] = useState(() => (balance / 100).toFixed(2))
  const [payMethod, setPayMethod] = useState<'cash' | 'card' | 'promptpay' | 'transfer'>('cash')

  if (!invoice) return null

  const submit = () => {
    const amount = Math.round(Number(payAmount) * 100)
    if (!Number.isFinite(amount) || amount <= 0 || amount > balance) return
    dispatch({
      type: 'recordPayment',
      payment: { invoiceId: invoice.id, amount, method: payMethod },
    })
    onClose()
  }

  return (
    <Modal
      label={t`Record payment for ${invoice.number}`}
      title={<Trans>Record payment — {invoice.number}</Trans>}
      subtitle={<Trans>Balance due {formatCurrency(balance)} · partial payments are supported</Trans>}
      onClose={onClose}
    >
      <div className="form-grid">
        <Field label={t`Amount (THB)`} htmlFor="pay-amount">
          <input id="pay-amount" type="number" min="0" step="0.01" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} />
        </Field>
        <Field label={t`Method`} htmlFor="pay-method">
          <NativeSelect id="pay-method" value={payMethod} onChange={(e) => setPayMethod(e.target.value as typeof payMethod)}>
            <option value="cash">{t`Cash`}</option>
            <option value="card">{t`Card`}</option>
            <option value="promptpay">{t`PromptPay`}</option>
            <option value="transfer">{t`Bank transfer`}</option>
          </NativeSelect>
        </Field>
      </div>
      <div className="panel-footer">
        <button className="button secondary" onClick={onClose}>
          <Trans>Cancel</Trans>
        </button>
        <button
          className="button primary"
          onClick={submit}
          disabled={!(Number(payAmount) > 0) || Math.round(Number(payAmount) * 100) > balance}
        >
          <Trans>Record payment</Trans>
        </button>
      </div>
    </Modal>
  )
}
