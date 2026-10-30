import { Trans, useLingui } from '@lingui/react/macro'
import { Modal } from '@/components/vet/modal'
import { useClinic } from '@/lib/vet/store'

/**
 * Void-invoice confirmation (2026-10-30 plan, phase C), extracted verbatim
 * from the Billing body. The reducer only voids fully unposted invoices —
 * netting is single-sourced there (ADR-0015).
 */
export const VoidInvoiceDialog = ({ invoiceId, onClose }: { invoiceId: string; onClose: () => void }) => {
  const { data, dispatch } = useClinic()
  const { t } = useLingui()
  const invoice = data.invoices.find((i) => i.id === invoiceId)
  if (!invoice) return null
  return (
    <Modal
      label={t`Void ${invoice.number}`}
      title={<Trans>Void {invoice.number}?</Trans>}
      subtitle={<Trans>No payments are held against this invoice. Voiding cannot be undone.</Trans>}
      onClose={onClose}
    >
      <div className="panel-footer">
        <button className="button secondary" onClick={onClose}>
          <Trans>Keep invoice</Trans>
        </button>
        <button
          className="button primary"
          onClick={() => {
            dispatch({ type: 'voidInvoice', invoiceId: invoice.id })
            onClose()
          }}
        >
          <Trans>Void invoice</Trans>
        </button>
      </div>
    </Modal>
  )
}
