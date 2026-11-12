import { useMemo, useState } from 'react'
import { Trans, useLingui } from '@lingui/react/macro'
import { Field, NativeSelect, Panel, Pill } from '@/components/patterns/fields'
import { useClinic } from '@/lib/vet/store'
import { dispensableCatalog } from '@/lib/vet/catalog'
import { itemOnHand } from '@/lib/vet/format'
import type { Encounter, Patient } from '@/lib/vet/types'
import { PrescriptionDialog } from './clinical-prints'

/**
 * Prescription panel for the live consultation (2026-10-30 plan, phase C):
 * the form with its live stock-floor and allergy cross-checks, plus the
 * visit's prescription list. Extracted verbatim from the Consultations body —
 * the reducer re-checks the stock floor on `addPrescription` (ADR-0015).
 */
export const PrescriptionPanel = ({ encounter, patient }: { encounter: Encounter; patient: Patient }) => {
  const { t } = useLingui()
  const { data, dispatch } = useClinic()
  const [rxItemId, setRxItemId] = useState('')
  const [rxDose, setRxDose] = useState('')
  const [rxRoute, setRxRoute] = useState('PO')
  const [rxFrequency, setRxFrequency] = useState('BID')
  const [rxDuration, setRxDuration] = useState(t`7 days`)
  const [rxQuantity, setRxQuantity] = useState('1')
  const [printingRx, setPrintingRx] = useState(false)

  // Dispensable catalog: live inventory items (medicine/vaccine) plus legacy
  // medication products so historical prescriptions still resolve.
  const catalog = useMemo(() => dispensableCatalog(data), [data])
  const selectedRx = catalog.find((c) => c.id === rxItemId)
  /** Units left for an inventory item after what this visit already prescribed. */
  const stockLeft = (itemId: string) => {
    const already = encounter.prescriptions.filter((rx) => rx.productId === itemId).reduce((sum, rx) => sum + rx.quantity, 0)
    return itemOnHand(itemId, data.inventoryLots) - already
  }
  const selectedStock = selectedRx && data.inventoryItems.some((i) => i.id === selectedRx.id) ? stockLeft(selectedRx.id) : undefined
  const requestedQty = Math.max(1, Number(rxQuantity) || 1)
  const stockShortage = selectedStock !== undefined && requestedQty > selectedStock
  const allergyHit = patient && selectedRx ? patient.allergies.find((a) => a && selectedRx.name.toLowerCase().includes(a.toLowerCase())) : undefined

  const addRx = () => {
    if (!selectedRx || !rxDose.trim()) return
    dispatch({
      type: 'addPrescription',
      encounterId: encounter.id,
      prescription: {
        productId: selectedRx.id,
        medication: selectedRx.name,
        dose: rxDose.trim(),
        route: rxRoute.trim(),
        frequency: rxFrequency.trim(),
        duration: rxDuration.trim(),
        quantity: Math.max(1, Number(rxQuantity) || 1),
      },
    })
    setRxItemId('')
    setRxDose('')
    setRxQuantity('1')
  }

  return (
    <Panel
      title={t`Prescriptions`}
      description={t`Dispensed from pharmacy stock when the visit closes`}
      action={
        encounter.prescriptions.length > 0 ? (
          <button className="small-button" onClick={() => setPrintingRx(true)}>
            <Trans>Print prescription</Trans>
          </button>
        ) : undefined
      }
    >
      <div className="inline-form nested">
        <div className="form-grid">
          <Field label={t`Medication`} htmlFor="rx-item">
            <NativeSelect id="rx-item" value={rxItemId} onChange={(e) => setRxItemId(e.target.value)}>
              <option value="">{t`— select medication —`}</option>
              {catalog.map((c) => {
                const stock = data.inventoryItems.some((i) => i.id === c.id) ? stockLeft(c.id) : undefined
                return (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {stock !== undefined ? <> — <Trans>{stock} {c.unit} in stock</Trans></> : ''}
                  </option>
                )
              })}
            </NativeSelect>
          </Field>
          <Field label={t`Dose`} htmlFor="rx-dose">
            <input id="rx-dose" value={rxDose} onChange={(e) => setRxDose(e.target.value)} placeholder={t`e.g. 0.1 mg/kg`} />
          </Field>
          <Field label={t`Route`} htmlFor="rx-route">
            <input id="rx-route" value={rxRoute} onChange={(e) => setRxRoute(e.target.value)} placeholder={t`PO / SC / IM`} />
          </Field>
          <Field label={t`Frequency`} htmlFor="rx-freq">
            <input id="rx-freq" value={rxFrequency} onChange={(e) => setRxFrequency(e.target.value)} placeholder={t`SID / BID / TID`} />
          </Field>
          <Field label={t`Duration`} htmlFor="rx-duration">
            <input id="rx-duration" value={rxDuration} onChange={(e) => setRxDuration(e.target.value)} placeholder={t`e.g. 7 days`} />
          </Field>
          <Field label={t`Quantity`} htmlFor="rx-qty">
            <input id="rx-qty" type="number" min="1" value={rxQuantity} onChange={(e) => setRxQuantity(e.target.value)} />
          </Field>
        </div>
        {allergyHit && (
          <p className="allergy-warning" role="alert">
            <Pill tone="bad" dot><Trans>Allergy warning</Trans></Pill>
            <Trans>{patient.name} is allergic to “{allergyHit}” — check this prescription before dispensing.</Trans>
          </p>
        )}
        {selectedRx && selectedStock !== undefined && (
          <p className={stockShortage ? 'form-hint is-bad' : 'form-hint'} role={stockShortage ? 'alert' : undefined}>
            {stockShortage
              ? t`Only ${Math.max(0, selectedStock)} ${selectedRx.unit} left in stock — reduce the quantity or receive a delivery first.`
              : t`${selectedStock} ${selectedRx.unit} available in stock.`}
          </p>
        )}
        <button className="button secondary" onClick={addRx} disabled={!selectedRx || !rxDose.trim() || stockShortage}>
          <Trans>Add prescription</Trans>
        </button>
      </div>
      <div className="rx-list">
        {encounter.prescriptions.length === 0 && <p className="empty-state"><Trans>No prescriptions on this visit.</Trans></p>}
        {encounter.prescriptions.map((rx) => (
          <div className="rx-row" key={rx.id}>
            <div>
              <strong>{rx.medication}</strong>
              <span>
                {rx.dose} · {rx.route} · {rx.frequency} · {rx.duration} · <Trans>qty {rx.quantity}</Trans>
              </span>
            </div>
            <button className="text-button" onClick={() => dispatch({ type: 'removePrescription', encounterId: encounter.id, prescriptionId: rx.id })}>
              <Trans>Remove</Trans>
            </button>
          </div>
        ))}
      </div>
      {printingRx && <PrescriptionDialog encounter={encounter} patient={patient} onClose={() => setPrintingRx(false)} />}
    </Panel>
  )
}
