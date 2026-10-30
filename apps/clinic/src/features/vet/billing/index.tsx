import { useMemo, useState } from 'react'
import { Plural, Trans, useLingui } from '@lingui/react/macro'
import { BarChart3, ClipboardList, CreditCard, Plus, X } from 'lucide-react'
import { Field, NativeSelect, Panel, PageHeader, Pill } from '@/components/vet/fields'
import { useClinic, usePermission } from '@/lib/vet/store'
import { billableCatalog } from '@/lib/vet/catalog'
import { openInvoices, outstandingBalance } from '@/lib/vet/selectors'
import { compareTime, formatMoney as formatCurrency, formatDate, formatTime, invoiceTotals, statusLabel, statusTone, todayKey } from '@/lib/vet/format'
import { ReceiptDialog } from './receipt-dialog'

/**
 * Billing & payments View: stat cards, the invoice table and the payment,
 * refund and void dialogs. All writes go through the store reducer.
 */
export const Billing = () => {
  const { data, dispatch } = useClinic()
  const { t } = useLingui()
  const billing = usePermission('billing.write')
  const today = todayKey()
  const [newInvoiceOpen, setNewInvoiceOpen] = useState(false)
  const [niOwnerId, setNiOwnerId] = useState('')
  const [niCatalogId, setNiCatalogId] = useState('')
  const [niQuantity, setNiQuantity] = useState('1')
  const [addItemInvoiceId, setAddItemInvoiceId] = useState<string | null>(null)
  const [addItemCatalogId, setAddItemCatalogId] = useState('')
  const [addItemQuantity, setAddItemQuantity] = useState('1')
  const [paymentInvoiceId, setPaymentInvoiceId] = useState<string | null>(null)
  const [payAmount, setPayAmount] = useState('')
  const [payMethod, setPayMethod] = useState<'cash' | 'card' | 'promptpay' | 'transfer'>('cash')
  const [receiptInvoiceId, setReceiptInvoiceId] = useState<string | null>(null)
  const [refundPaymentId, setRefundPaymentId] = useState<string | null>(null)
  const [refundAmount, setRefundAmount] = useState('')
  const [refundNote, setRefundNote] = useState('')
  const [voidInvoiceId, setVoidInvoiceId] = useState<string | null>(null)

  // Billable catalog: legacy products (services & medications) plus live inventory items.
  const catalog = useMemo(() => billableCatalog(data), [data])

  const open = openInvoices(data.invoices)
  const outstanding = outstandingBalance(data.invoices, data.clinic.vatRate, data.payments)
  const collectedToday = data.payments
    .filter((p) => p.receivedAt.startsWith(today))
    .reduce((sum, p) => sum + p.amount, 0)
  const drafts = data.invoices.filter((i) => i.status === 'draft')
  const billedTotal = data.invoices.reduce(
    (sum, invoice) => sum + invoiceTotals(invoice, data.clinic.vatRate, data.payments).total,
    0,
  )

  const stats = [
    { label: t`Outstanding balance`, value: formatCurrency(outstanding), note: t`${open.length} open invoices`, icon: CreditCard, tone: 'teal' },
    { label: t`Collected today`, value: formatCurrency(collectedToday), note: t`${data.payments.filter((p) => p.receivedAt.startsWith(today)).length} payments`, icon: Plus, tone: 'violet' },
    { label: t`Draft invoices`, value: String(drafts.length), note: t`Ready to post`, icon: ClipboardList, tone: 'amber' },
    { label: t`Billed all time`, value: formatCurrency(billedTotal), note: t`${data.invoices.length} invoices`, icon: BarChart3, tone: 'teal' },
  ]

  const sortedInvoices = data.invoices.toSorted((a, b) => compareTime(b.createdAt, a.createdAt))
  const paymentInvoice = data.invoices.find((i) => i.id === paymentInvoiceId)
  const voidInvoice = data.invoices.find((i) => i.id === voidInvoiceId)
  const paymentBalance = paymentInvoice ? invoiceTotals(paymentInvoice, data.clinic.vatRate, data.payments).balance : 0
  const refundPayment = data.payments.find((p) => p.id === refundPaymentId)
  const refundedSoFar = refundPayment
    ? data.payments.filter((p) => p.refundOf === refundPayment.id).reduce((sum, p) => sum + Math.abs(p.amount), 0)
    : 0
  const refundable = refundPayment ? refundPayment.amount - refundedSoFar : 0

  const submitPayment = () => {
    const amount = Math.round(Number(payAmount) * 100)
    if (!paymentInvoice || !Number.isFinite(amount) || amount <= 0 || amount > paymentBalance) return
    dispatch({
      type: 'recordPayment',
      payment: { invoiceId: paymentInvoice.id, amount, method: payMethod },
    })
    setPaymentInvoiceId(null)
    setPayAmount('')
  }

  const submitRefund = () => {
    const amount = Math.round(Number(refundAmount) * 100)
    if (!refundPayment || !Number.isFinite(amount) || amount <= 0 || amount > refundable || !refundNote.trim()) return
    dispatch({
      type: 'refundPayment',
      invoiceId: refundPayment.invoiceId,
      paymentId: refundPayment.id,
      amount,
      note: refundNote,
    })
    setRefundPaymentId(null)
    setRefundAmount('')
    setRefundNote('')
  }

  return (
    <>
      <PageHeader
        title={t`Billing & payments`}
        description={t`Invoices, payments and adjustments stay traceable.`}
        action={
          <button className="button primary" onClick={() => setNewInvoiceOpen(true)} disabled={!billing.allowed} title={billing.reason || undefined}>
            <Plus size={16} /> <Trans>New invoice</Trans>
          </button>
        }
      />
      <div className="stat-grid">
        {stats.map((s) => (
          <div className="stat-card" key={s.label}>
            <span className={`stat-icon ${s.tone}`}>
              <s.icon size={19} />
            </span>
            <div>
              <small>{s.label}</small>
              <strong>{s.value}</strong>
              <span className="stat-note">{s.note}</span>
            </div>
          </div>
        ))}
      </div>
      {newInvoiceOpen && (
        <div className="inline-form">
          <div className="form-heading">
            <div>
              <strong><Trans>New invoice</Trans></strong>
              <span><Trans>Draft invoices can be edited and posted when settled at the desk.</Trans></span>
            </div>
            <button className="icon-button" onClick={() => setNewInvoiceOpen(false)} aria-label={t`Close form`}>
              <X size={17} />
            </button>
          </div>
          <div className="form-grid">
            <Field label={t`Owner`} htmlFor="ni-owner">
              <NativeSelect id="ni-owner" value={niOwnerId || data.owners[0]?.id || ''} onChange={(e) => setNiOwnerId(e.target.value)}>
                {data.owners.map((o) => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </NativeSelect>
            </Field>
            <Field label={t`Line item`} htmlFor="ni-item">
              <NativeSelect id="ni-item" value={niCatalogId} onChange={(e) => setNiCatalogId(e.target.value)}>
                <option value="">{t`— select item —`}</option>
                {catalog.map((c) => (
                  <option key={c.id} value={c.id}>{c.name} — {formatCurrency(c.unitPrice)}</option>
                ))}
              </NativeSelect>
            </Field>
            <Field label={t`Quantity`} htmlFor="ni-qty">
              <input id="ni-qty" type="number" min="1" value={niQuantity} onChange={(e) => setNiQuantity(e.target.value)} />
            </Field>
          </div>
          <div className="form-actions">
            <button
              className="button primary"
              disabled={!niCatalogId}
              onClick={() => {
                const entry = catalog.find((c) => c.id === niCatalogId)
                const owner = data.owners.find((o) => o.id === (niOwnerId || data.owners[0]?.id))
                if (!entry || !owner) return
                dispatch({
                  type: 'createInvoice',
                  ownerId: owner.id,
                  items: [{ description: entry.name, quantity: Math.max(1, Number(niQuantity) || 1), unitPrice: entry.unitPrice, productId: entry.id }],
                })
                setNiCatalogId('')
                setNiQuantity('1')
                setNewInvoiceOpen(false)
              }}
            >
              <Trans>Create draft invoice</Trans>
            </button>
          </div>
        </div>
      )}
      <Panel
        title={t`Invoices`}
        description={t`Drafts can be reviewed before posting; posted invoices are immutable.`}
      >
        <div className="records-table table-wide billing-table">
          <div className="table-head">
            <span><Trans>Invoice</Trans></span>
            <span><Trans>Owner</Trans></span>
            <span><Trans>Items</Trans></span>
            <span><Trans>Status</Trans></span>
            <span><Trans>Total</Trans></span>
            <span><Trans>Balance</Trans></span>
            <span />
          </div>
          {sortedInvoices.map((invoice) => {
            const owner = data.owners.find((o) => o.id === invoice.ownerId)
            const totals = invoiceTotals(invoice, data.clinic.vatRate, data.payments)
            const addEntry = addItemCatalogId ? catalog.find((c) => c.id === addItemCatalogId) : undefined
            return (
              <div key={invoice.id}>
                <div className="table-row">
                  <div>
                    <strong>{invoice.number}</strong>
                    <span>{formatDate(invoice.createdAt)}</span>
                  </div>
                  <span>{owner?.name}</span>
                  <span>
                    <Plural value={invoice.items.length} one="# item" other="# items" />
                  </span>
                  <span>
                    <Pill tone={statusTone(invoice.status)} dot>
                      {statusLabel(invoice.status)}
                    </Pill>
                  </span>
                  <strong>{formatCurrency(totals.total)}</strong>
                  <strong className={totals.balance > 0 ? 'balance-due' : undefined}>
                    {totals.balance > 0 ? formatCurrency(totals.balance) : '—'}
                  </strong>
                  <div className="row-actions">
                    {invoice.status === 'draft' && (
                      <>
                        <button className="row-action" onClick={() => setAddItemInvoiceId(addItemInvoiceId === invoice.id ? null : invoice.id)}>
                          <Trans>Add item</Trans>
                        </button>
                        <button
                          className="small-button"
                          onClick={() => dispatch({ type: 'postInvoice', invoiceId: invoice.id })}
                        >
                          <Trans>Post invoice</Trans>
                        </button>
                      </>
                    )}
                    {invoice.status === 'posted' && totals.balance > 0 && (
                      <button
                        className="small-button"
                        disabled={!billing.allowed}
                        title={billing.reason || undefined}
                        onClick={() => {
                          setPaymentInvoiceId(invoice.id)
                          setPayAmount((totals.balance / 100).toFixed(2))
                        }}
                      >
                        <Trans>Record payment</Trans>
                      </button>
                    )}
                    {invoice.status === 'posted' && totals.paid === 0 && (
                      <button
                        className="row-action"
                        disabled={!billing.allowed}
                        title={billing.reason || undefined}
                        onClick={() => setVoidInvoiceId(invoice.id)}
                      >
                        <Trans>Void</Trans>
                      </button>
                    )}
                    {(invoice.status !== 'draft' || totals.balance === 0) && (
                      <button className="row-action" onClick={() => setReceiptInvoiceId(invoice.id)}>
                        <Trans>Receipt</Trans>
                      </button>
                    )}
                  </div>
                </div>
                {addItemInvoiceId === invoice.id && (
                  <div className="inline-form nested">
                    <div className="form-grid">
                      <Field label={t`Item`} htmlFor={`ai-item-${invoice.id}`}>
                        <NativeSelect id={`ai-item-${invoice.id}`} value={addItemCatalogId} onChange={(e) => setAddItemCatalogId(e.target.value)}>
                          <option value="">{t`— select item —`}</option>
                          {catalog.map((c) => (
                            <option key={c.id} value={c.id}>{c.name} — {formatCurrency(c.unitPrice)}</option>
                          ))}
                        </NativeSelect>
                      </Field>
                      <Field label={t`Quantity`} htmlFor={`ai-qty-${invoice.id}`}>
                        <input id={`ai-qty-${invoice.id}`} type="number" min="1" value={addItemQuantity} onChange={(e) => setAddItemQuantity(e.target.value)} />
                      </Field>
                    </div>
                    <button
                      className="button secondary"
                      disabled={!addEntry}
                      onClick={() => {
                        dispatch({
                          type: 'addInvoiceItem',
                          invoiceId: invoice.id,
                          item: { description: addEntry!.name, quantity: Math.max(1, Number(addItemQuantity) || 1), unitPrice: addEntry!.unitPrice, productId: addEntry!.id },
                        })
                        setAddItemCatalogId('')
                        setAddItemQuantity('1')
                        setAddItemInvoiceId(null)
                      }}
                    >
                      <Trans>Add to invoice</Trans>
                    </button>
                  </div>
                )}
              </div>
            )
          })}
          {sortedInvoices.length === 0 && <p className="empty-state"><Trans>No invoices yet.</Trans></p>}
        </div>
      </Panel>
      <Panel title={t`Recent payments`} description={t`Every payment is appended to an immutable ledger.`}>
        <div className="activity-list">
          {data.payments
            .toSorted((a, b) => compareTime(b.receivedAt, a.receivedAt))
            .slice(0, 10)
            .map((payment) => {
              const invoice = data.invoices.find((i) => i.id === payment.invoiceId)
              const isRefund = payment.kind === 'refund'
              const refunded = data.payments.filter((p) => p.refundOf === payment.id).reduce((sum, p) => sum + Math.abs(p.amount), 0)
              const canRefund =
                billing.allowed &&
                !isRefund &&
                !!invoice &&
                invoice.status !== 'draft' &&
                invoice.status !== 'void' &&
                payment.amount - refunded > 0
              return (
                <div className="activity-row" key={payment.id}>
                  <div className="activity-mark">
                    <CreditCard size={14} />
                  </div>
                  <div>
                    <strong>
                      {formatCurrency(payment.amount)} · {invoice?.number ?? t`Unassigned`}
                    </strong>
                    <span>
                      {isRefund ? t`Refund — ${payment.note ?? t`no reason`}` : payment.method} · {formatDate(payment.receivedAt)} ·{' '}
                      {formatTime(payment.receivedAt)}
                    </span>
                  </div>
                  {canRefund && (
                    <button
                      className="small-button"
                      onClick={() => {
                        setRefundPaymentId(payment.id)
                        setRefundAmount(((payment.amount - refunded) / 100).toFixed(2))
                        setRefundNote('')
                      }}
                    >
                      <Trans>Refund</Trans>
                    </button>
                  )}
                  <Pill tone={isRefund ? 'bad' : 'muted'}>{isRefund ? t`refund` : payment.method}</Pill>
                </div>
              )
            })}
          {data.payments.length === 0 && <p className="empty-state"><Trans>No payments recorded yet.</Trans></p>}
        </div>
      </Panel>

      {paymentInvoice && (
        <div
          className="modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setPaymentInvoiceId(null)
          }}
        >
          <div className="modal" role="dialog" aria-modal="true" aria-label={t`Record payment for ${paymentInvoice.number}`}>
            <div className="form-heading">
              <div>
                <strong><Trans>Record payment — {paymentInvoice.number}</Trans></strong>
                <span>
                  <Trans>Balance due {formatCurrency(paymentBalance)} · partial payments are supported</Trans>
                </span>
              </div>
              <button className="icon-button" onClick={() => setPaymentInvoiceId(null)} aria-label={t`Close dialog`}>
                <X size={17} />
              </button>
            </div>
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
              <button className="button secondary" onClick={() => setPaymentInvoiceId(null)}>
                <Trans>Cancel</Trans>
              </button>
              <button
                className="button primary"
                onClick={submitPayment}
                disabled={!(Number(payAmount) > 0) || Math.round(Number(payAmount) * 100) > paymentBalance}
              >
                <Trans>Record payment</Trans>
              </button>
            </div>
          </div>
        </div>
      )}
      {receiptInvoiceId && (
        <ReceiptDialog invoiceId={receiptInvoiceId} onClose={() => setReceiptInvoiceId(null)} />
      )}
      {refundPayment && (
        <div
          className="modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setRefundPaymentId(null)
          }}
        >
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label={t`Refund payment on ${data.invoices.find((i) => i.id === refundPayment.invoiceId)?.number ?? t`invoice`}`}
          >
            <div className="form-heading">
              <div>
                <strong><Trans>Refund payment</Trans></strong>
                <span>
                  <Trans>{formatCurrency(refundPayment.amount)} recorded on {formatDate(refundPayment.receivedAt)} · up to{' '}
                  {formatCurrency(refundable)} refundable</Trans>
                </span>
              </div>
              <button className="icon-button" onClick={() => setRefundPaymentId(null)} aria-label={t`Close dialog`}>
                <X size={17} />
              </button>
            </div>
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
              <button className="button secondary" onClick={() => setRefundPaymentId(null)}>
                <Trans>Cancel</Trans>
              </button>
              <button
                className="button primary"
                onClick={submitRefund}
                disabled={!(Number(refundAmount) > 0) || Math.round(Number(refundAmount) * 100) > refundable || !refundNote.trim()}
              >
                <Trans>Record refund</Trans>
              </button>
            </div>
          </div>
        </div>
      )}
      {voidInvoice && (
        <div
          className="modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setVoidInvoiceId(null)
          }}
        >
          <div className="modal" role="dialog" aria-modal="true" aria-label={t`Void ${voidInvoice.number}`}>
            <div className="form-heading">
              <div>
                <strong><Trans>Void {voidInvoice.number}?</Trans></strong>
                <span>
                  <Trans>No payments are held against this invoice. Voiding cannot be undone.</Trans>
                </span>
              </div>
              <button className="icon-button" onClick={() => setVoidInvoiceId(null)} aria-label={t`Close dialog`}>
                <X size={17} />
              </button>
            </div>
            <div className="panel-footer">
              <button className="button secondary" onClick={() => setVoidInvoiceId(null)}>
                <Trans>Keep invoice</Trans>
              </button>
              <button
                className="button primary"
                onClick={() => {
                  dispatch({ type: 'voidInvoice', invoiceId: voidInvoice.id })
                  setVoidInvoiceId(null)
                }}
              >
                <Trans>Void invoice</Trans>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

