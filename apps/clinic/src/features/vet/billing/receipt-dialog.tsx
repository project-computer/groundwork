import { Trans, useLingui } from '@lingui/react/macro'
import { useClinic } from '@/lib/vet/store'
import { formatMoney as formatCurrency, formatDate, invoiceTotals } from '@/lib/vet/format'

/** Printable receipt dialog for one invoice (the .print-area subtree). */
export const ReceiptDialog = ({ invoiceId, onClose }: { invoiceId: string; onClose: () => void }) => {
  const { data } = useClinic()
  const { t } = useLingui()
  const invoice = data.invoices.find((i) => i.id === invoiceId)
  if (!invoice) return null
  const owner = data.owners.find((o) => o.id === invoice.ownerId)
  const totals = invoiceTotals(invoice, data.clinic.vatRate, data.payments)
  const invoicePayments = data.payments.filter((p) => p.invoiceId === invoice.id)
  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-label={t`Receipt for ${invoice.number}`}>
        <div className="print-area flex flex-col gap-3 tabular-nums print:visible print:absolute print:left-0 print:top-0 print:w-full print:p-6">
          <header className="flex flex-col gap-0.5 text-center border-b border-dashed border-border pb-2.5">
            <h2 className="m-0 text-base">{data.clinic.name}</h2>
            <span className="text-xs text-muted-foreground"><Trans>Invoice / Receipt</Trans></span>
          </header>
          <div className="flex flex-wrap gap-3 text-[12.5px]">
            <span>{invoice.number}</span>
            <span>{formatDate(invoice.createdAt)}</span>
            <span>{owner?.name}</span>
          </div>
          <div className="flex flex-col gap-1">
            <div className="grid grid-cols-[minmax(0,1fr)_40px_90px_90px] gap-2 text-[11.5px] font-semibold uppercase tracking-[0.04em] text-muted-foreground border-b border-border pb-1">
              <span className="truncate"><Trans>Item</Trans></span>
              <span className="truncate text-right"><Trans>Qty</Trans></span>
              <span className="truncate text-right"><Trans>Price</Trans></span>
              <span className="truncate text-right"><Trans>Amount</Trans></span>
            </div>
            {invoice.items.map((item) => (
              <div className="grid grid-cols-[minmax(0,1fr)_40px_90px_90px] gap-2 text-[12.5px]" key={item.id}>
                <span className="truncate">{item.description}</span>
                <span className="truncate text-right">{item.quantity}</span>
                <span className="truncate text-right">{formatCurrency(item.unitPrice)}</span>
                <span className="truncate text-right">{formatCurrency(item.quantity * item.unitPrice)}</span>
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-1 border-t border-border pt-2">
            <div className="flex justify-between text-[12.5px]"><span><Trans>Subtotal</Trans></span><strong>{formatCurrency(totals.subtotal)}</strong></div>
            <div className="flex justify-between text-[12.5px]"><span><Trans>VAT ({Math.round(data.clinic.vatRate * 100)}%)</Trans></span><strong>{formatCurrency(totals.tax)}</strong></div>
            <div className="flex justify-between border-t border-dashed border-border pt-1 font-bold text-[13.5px]"><span><Trans>Total</Trans></span><strong>{formatCurrency(totals.total)}</strong></div>
            {invoicePayments.length > 0 && (
              <>
                {invoicePayments.map((p) => (
                  <div className="flex justify-between text-[12.5px]" key={p.id}>
                    <span>
                      {p.kind === 'refund' ? t`Refund` : t`Paid`} — {p.method}
                      {p.note ? ` · ${p.note}` : ''}
                    </span>
                    <strong>{formatCurrency(p.amount)}</strong>
                  </div>
                ))}
                <div className="flex justify-between border-t border-dashed border-border pt-1 font-bold text-[13.5px]"><span><Trans>Balance due</Trans></span><strong>{formatCurrency(totals.balance)}</strong></div>
              </>
            )}
          </div>
          <footer className="text-center text-xs text-muted-foreground border-t border-dashed border-border pt-2.5"><Trans>Thank you — {data.clinic.name} · {data.clinic.timezone}</Trans></footer>
        </div>
        <div className="panel-footer print:hidden">
          <button className="button secondary" onClick={onClose}>
            <Trans>Close</Trans>
          </button>
          <button className="button primary" onClick={() => window.print()}>
            <Trans>Print receipt</Trans>
          </button>
        </div>
      </div>
    </div>
  )
}

