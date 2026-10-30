import { useState } from 'react'
import { msg } from '@lingui/core/macro'
import type { MessageDescriptor } from '@lingui/core'
import { Plural, Trans, useLingui } from '@lingui/react/macro'
import { Package, Plus, X } from 'lucide-react'
import { DatePicker } from '@/components/vet/date-picker'
import { Field, Panel, PageHeader, Pill } from '@/components/vet/fields'
import { useClinic, usePermission } from '@/lib/vet/store'
import { formatMoney as formatCurrency, itemOnHand, todayKey } from '@/lib/vet/format'
import type { InventoryCategory } from '@/lib/vet/types'

/**
 * Pharmacy & inventory View: InventoryItems, InventoryLots with the receive /
 * dispense / waste ledger, and suppliers. RBAC: admin and pharmacist only.
 */

/** Display names for InventoryCategory chips, shared with the Dashboard. */
export const categoryLabel: Record<string, MessageDescriptor> = {
  medicine: msg`Medicine`,
  vaccine: msg`Vaccine`,
  equipment: msg`Equipment`,
  supply: msg`Supply`,
}

export const Inventory = () => {
  const { data, dispatch } = useClinic()
  const { t, i18n } = useLingui()
  const inventory = usePermission('inventory.write')
  const [category, setCategory] = useState<'all' | 'medicine' | 'vaccine' | 'equipment' | 'supply'>('all')
  const [showItemForm, setShowItemForm] = useState(false)
  const [showSupplierForm, setShowSupplierForm] = useState(false)
  const [receivingItemId, setReceivingItemId] = useState<string | null>(null)
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null)

  const [itemName, setItemName] = useState('')
  const [itemCategory, setItemCategory] = useState<InventoryCategory>('medicine')
  const [itemUnit, setItemUnit] = useState('')
  const [itemReorder, setItemReorder] = useState('0')
  const [itemPrice, setItemPrice] = useState('')

  const [supplierName, setSupplierName] = useState('')
  const [supplierPhone, setSupplierPhone] = useState('')

  const [lotNumber, setLotNumber] = useState('')
  const [lotQuantity, setLotQuantity] = useState('10')
  const [lotExpiry, setLotExpiry] = useState('')
  const [lotSupplier, setLotSupplier] = useState('')
  const [lotCost, setLotCost] = useState('')

  const items = data.inventoryItems.filter((i) => category === 'all' || i.category === category)

  const receiveLot = (itemId: string) => {
    const qty = Number(lotQuantity)
    if (!lotNumber.trim() || !Number.isFinite(qty) || qty <= 0) return
    dispatch({
      type: 'receiveLot',
      lot: {
        itemId,
        lotNumber,
        expiryDate: lotExpiry || undefined,
        supplierId: lotSupplier || undefined,
        costPerUnit: lotCost ? Math.round(Number(lotCost) * 100) : undefined,
        receivedDate: todayKey(),
      },
      quantity: qty,
    })
    setReceivingItemId(null)
    setLotNumber('')
    setLotQuantity('10')
    setLotExpiry('')
    setLotCost('')
  }

  return (
    <>
      <PageHeader
        title={t`Pharmacy & inventory`}
        description={t`Items, batch lots and an append-only stock ledger with clear reorder signals.`}
        action={
          <button className="button primary" onClick={() => setShowItemForm((v) => !v)} disabled={!inventory.allowed}>
            <Plus size={16} /> <Trans>Add item</Trans>
          </button>
        }
      />
      {!inventory.allowed && <p className="empty-state">{inventory.reason}. <Trans>Inventory changes require admin or pharmacist access.</Trans></p>}
      {showItemForm && (
        <div className="inline-form">
          <div className="form-heading">
            <div>
              <strong><Trans>Add inventory item</Trans></strong>
              <span><Trans>Define the stock-keeping unit; lots are received against it.</Trans></span>
            </div>
            <button className="icon-button" onClick={() => setShowItemForm(false)} aria-label={t`Close form`}>
              <X size={17} />
            </button>
          </div>
          <div className="form-grid">
            <Field label={t`Name`} htmlFor="inv-name">
              <input id="inv-name" value={itemName} onChange={(e) => setItemName(e.target.value)} placeholder={t`e.g. Amoxicillin 250 mg…`} />
            </Field>
            <Field label={t`Category`} htmlFor="inv-cat">
              <select id="inv-cat" value={itemCategory} onChange={(e) => setItemCategory(e.target.value as InventoryCategory)}>
                {Object.entries(categoryLabel).map(([value, label]) => (
                  <option key={value} value={value}>{i18n._(label)}</option>
                ))}
              </select>
            </Field>
            <Field label={t`Unit`} htmlFor="inv-unit">
              <input id="inv-unit" value={itemUnit} onChange={(e) => setItemUnit(e.target.value)} placeholder={t`tablet / dose / bottle…`} />
            </Field>
            <Field label={t`Reorder level`} htmlFor="inv-reorder">
              <input id="inv-reorder" type="number" min="0" value={itemReorder} onChange={(e) => setItemReorder(e.target.value)} />
            </Field>
            <Field label={t`Selling price (THB)`} htmlFor="inv-price">
              <input id="inv-price" type="number" min="0" step="0.01" value={itemPrice} onChange={(e) => setItemPrice(e.target.value)} />
            </Field>
          </div>
          <button
            className="button primary"
            onClick={() => {
              if (!itemName.trim() || !itemUnit.trim()) return
              dispatch({
                type: 'addInventoryItem',
                item: {
                  name: itemName,
                  category: itemCategory,
                  unit: itemUnit,
                  reorderLevel: Math.max(0, Number(itemReorder) || 0),
                  sellingPrice: Math.round((Number(itemPrice) || 0) * 100),
                },
              })
              setItemName('')
              setItemUnit('')
              setItemPrice('')
              setShowItemForm(false)
            }}
          >
            <Trans>Save item</Trans>
          </button>
        </div>
      )}
      {showSupplierForm && (
        <div className="inline-form">
          <div className="form-heading">
            <div>
              <strong><Trans>Add supplier</Trans></strong>
              <span><Trans>Lots can be tagged with the vendor they were purchased from.</Trans></span>
            </div>
            <button className="icon-button" onClick={() => setShowSupplierForm(false)} aria-label={t`Close form`}>
              <X size={17} />
            </button>
          </div>
          <div className="form-grid">
            <Field label={t`Supplier name`} htmlFor="sup-name">
              <input id="sup-name" value={supplierName} onChange={(e) => setSupplierName(e.target.value)} placeholder={t`e.g. Thai Vet Pharma Co.…`} />
            </Field>
            <Field label={t`Phone`} htmlFor="sup-phone">
              <input id="sup-phone" value={supplierPhone} onChange={(e) => setSupplierPhone(e.target.value)} />
            </Field>
          </div>
          <button
            className="button primary"
            onClick={() => {
              if (!supplierName.trim()) return
              dispatch({ type: 'addSupplier', supplier: { name: supplierName, phone: supplierPhone } })
              setSupplierName('')
              setSupplierPhone('')
              setShowSupplierForm(false)
            }}
          >
            <Trans>Save supplier</Trans>
          </button>
        </div>
      )}
      <div className="toolbar">
        <div className="filter-group" role="tablist" aria-label={t`Inventory category filter`}>
          {(['all', 'medicine', 'vaccine', 'equipment', 'supply'] as const).map((c) => (
            <button key={c} className={`filter-chip ${category === c ? 'active' : ''}`} onClick={() => setCategory(c)}>
              {c === 'all' ? t`All` : i18n._(categoryLabel[c])}
            </button>
          ))}
        </div>
        <button className="filter-button" onClick={() => setShowSupplierForm((v) => !v)}>
          <Trans>Suppliers ({data.suppliers.length})</Trans> <span>⌄</span>
        </button>
      </div>
      <Panel
        title={items.length === 1 ? t`1 item` : t`${items.length} items`}
        description={t`Quantity-on-hand is derived from lot quantities`}
      >
        <div className="records-table table-wide">
          <div className="table-head">
            <span><Trans>Item</Trans></span>
            <span><Trans>Category</Trans></span>
            <span><Trans>On hand</Trans></span>
            <span><Trans>Stock</Trans></span>
            <span />
          </div>
          {items.map((item) => {
            const onHand = itemOnHand(item.id, data.inventoryLots)
            const low = onHand <= item.reorderLevel
            const lots = data.inventoryLots.filter((l) => l.itemId === item.id)
            return (
              <div key={item.id}>
                <div className="table-row">
                  <div>
                    <strong>{item.name}</strong>
                    <span>{item.unit} · {formatCurrency(item.sellingPrice)}</span>
                  </div>
                  <span><Pill tone="info">{i18n._(categoryLabel[item.category])}</Pill></span>
                  <strong>{onHand}</strong>
                  <span>
                    <Pill tone={low ? 'warn' : 'ok'} dot>{low ? t`Low — reorder at ${item.reorderLevel}` : t`In stock`}</Pill>
                  </span>
                  <div className="row-actions">
                    <button className="row-action" onClick={() => setExpandedItemId(expandedItemId === item.id ? null : item.id)}>
                      {expandedItemId === item.id ? t`Hide lots` : t`Lots (${lots.length})`}
                    </button>
                    <button className="small-button" onClick={() => setReceivingItemId(receivingItemId === item.id ? null : item.id)} disabled={!inventory.allowed}>
                      <Trans>Receive stock</Trans>
                    </button>
                  </div>
                </div>
                {receivingItemId === item.id && (
                  <div className="inline-form nested">
                    <div className="form-grid">
                      <Field label={t`Lot number`} htmlFor={`lot-num-${item.id}`}>
                        <input id={`lot-num-${item.id}`} value={lotNumber} onChange={(e) => setLotNumber(e.target.value)} placeholder={t`e.g. AMX-2611C…`} />
                      </Field>
                      <Field label={t`Quantity`} htmlFor={`lot-qty-${item.id}`}>
                        <input id={`lot-qty-${item.id}`} type="number" min="1" value={lotQuantity} onChange={(e) => setLotQuantity(e.target.value)} />
                      </Field>
                      <Field label={t`Expiry date`} htmlFor={`lot-exp-${item.id}`}>
                        <DatePicker id={`lot-exp-${item.id}`} label={t`Expiry date`} value={lotExpiry} onChange={setLotExpiry} />
                      </Field>
                      <Field label={t`Supplier`} htmlFor={`lot-sup-${item.id}`}>
                        <select id={`lot-sup-${item.id}`} value={lotSupplier} onChange={(e) => setLotSupplier(e.target.value)}>
                          <option value="">{t`— none —`}</option>
                          {data.suppliers.map((s) => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </select>
                      </Field>
                      <Field label={t`Cost/unit (THB)`} htmlFor={`lot-cost-${item.id}`}>
                        <input id={`lot-cost-${item.id}`} type="number" min="0" step="0.01" value={lotCost} onChange={(e) => setLotCost(e.target.value)} />
                      </Field>
                    </div>
                    <button className="button primary" onClick={() => receiveLot(item.id)}><Trans>Record receipt</Trans></button>
                  </div>
                )}
                {expandedItemId === item.id && (
                  <div className="lot-breakdown">
                    {lots.length === 0 && <p className="empty-state"><Trans>No lots received yet.</Trans></p>}
                    {lots.map((lot) => {
                      const supplier = data.suppliers.find((s) => s.id === lot.supplierId)
                      const movements = data.stockMovements.filter((m) => m.lotId === lot.id)
                      return (
                        <div className="lot-row" key={lot.id}>
                          <div className="lot-main">
                            <strong><Trans>Lot {lot.lotNumber}</Trans></strong>
                            <span>
                              {lot.quantity} {item.unit}
                              {lot.expiryDate ? <> · <Trans>exp {lot.expiryDate}</Trans></> : ''}
                              {supplier ? ` · ${supplier.name}` : ''}
                            </span>
                          </div>
                          <span className="lot-ledger"><Plural value={movements.length} one="# ledger entry" other="# ledger entries" /></span>
                          <div className="row-actions">
                            <button
                              className="row-action"
                              disabled={!inventory.allowed || lot.quantity <= 0}
                              onClick={() => dispatch({ type: 'recordStockMovement', lotId: lot.id, delta: -1, reason: 'stock_out', notes: 'manual dispense' })}
                            >
                              <Trans>Dispense 1</Trans>
                            </button>
                            <button
                              className="row-action"
                              disabled={!inventory.allowed}
                              onClick={() => dispatch({ type: 'recordStockMovement', lotId: lot.id, delta: -1, reason: 'waste', notes: 'write-off' })}
                            >
                              <Trans>Waste 1</Trans>
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
          {items.length === 0 && <p className="empty-state"><Trans>No items in this category yet.</Trans></p>}
        </div>
      </Panel>
      <Panel title={t`Suppliers`} description={t`Vendors lots are purchased from`}>
        <div className="activity-list">
          {data.suppliers.map((s) => (
            <div className="activity-row" key={s.id}>
              <div className="activity-mark"><Package size={14} /></div>
              <div>
                <strong>{s.name}</strong>
                <span>{[s.phone, s.email].filter(Boolean).join(' · ') || t`No contact details`}</span>
              </div>
              <Pill tone="muted"><Plural value={data.inventoryLots.filter((l) => l.supplierId === s.id).length} one="# lot" other="# lots" /></Pill>
            </div>
          ))}
          {data.suppliers.length === 0 && <p className="empty-state"><Trans>No suppliers recorded yet.</Trans></p>}
        </div>
      </Panel>
    </>
  )
}

