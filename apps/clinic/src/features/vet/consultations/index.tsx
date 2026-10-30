import { useMemo, useState } from 'react'
import { CalendarDays, Stethoscope } from 'lucide-react'
import { Trans, useLingui } from '@lingui/react/macro'
import { DatePicker } from '@/components/vet/date-picker'
import { Field, NativeSelect, Panel, PageHeader, Pill } from '@/components/vet/fields'
import { useClinic } from '@/lib/vet/store'
import { dispensableCatalog } from '@/lib/vet/catalog'
import { compareTime, formatDate, itemOnHand, sexLabel, speciesLabel, statusLabel } from '@/lib/vet/format'
import type { Vitals } from '@/lib/vet/types'

const nowIso = () => new Date().toISOString()

/**
 * Consultation View: the live Visit workspace — vitals, vaccinations,
 * diagnosis, prescriptions (with the stock-floor and allergy cross-checks),
 * notes with amendments and the follow-up booking.
 */
export const Consultations = ({ onOpen }: { onOpen: (encounterId: string) => void }) => {
  const { data, session, dispatch } = useClinic()
  const { t } = useLingui()
  const open =
    data.encounters.find((e) => e.id === session.activeEncounterId) ??
    data.encounters.find((e) => e.status === 'open')
  const patient = open && data.patients.find((p) => p.id === open.patientId)
  const appt = open && data.appointments.find((a) => a.id === open.appointmentId)
  const recentEncounters = data.encounters.toSorted((a, b) => compareTime(b.openedAt, a.openedAt)).slice(0, 8)
  const [note, setNote] = useState('')
  const [vitals, setVitals] = useState<Vitals>(open?.vitals ?? { weightKg: '', tempC: '', heartRate: '', respRate: '' })
  const [dxText, setDxText] = useState('')
  const [dxStatus, setDxStatus] = useState<'provisional' | 'confirmed'>('provisional')
  const [rxItemId, setRxItemId] = useState('')
  const [rxDose, setRxDose] = useState('')
  const [rxRoute, setRxRoute] = useState('PO')
  const [rxFrequency, setRxFrequency] = useState('BID')
  const [rxDuration, setRxDuration] = useState(t`7 days`)
  const [rxQuantity, setRxQuantity] = useState('1')
  const [vacName, setVacName] = useState('')
  const [vacLot, setVacLot] = useState('')
  const [vacNextDue, setVacNextDue] = useState('')
  const [followUpDate, setFollowUpDate] = useState('')
  const [followUpTime, setFollowUpTime] = useState('10:00')
  const [amendNoteId, setAmendNoteId] = useState<string | null>(null)
  const [amendBody, setAmendBody] = useState('')
  const [amendReason, setAmendReason] = useState('')
  // Reset the vitals draft when a different encounter opens. Adjusting state
  // during render keeps the reset in the same pass — no effect, no stale deps.
  const [vitalsEncounterId, setVitalsEncounterId] = useState(open?.id)
  if (open && open.id !== vitalsEncounterId) {
    setVitalsEncounterId(open.id)
    setVitals(open.vitals)
  }
  // Dispensable catalog: live inventory items (medicine/vaccine) plus legacy
  // medication products so historical prescriptions still resolve.
  const catalog = useMemo(() => dispensableCatalog(data), [data.inventoryItems, data.products])
  const selectedRx = catalog.find((c) => c.id === rxItemId)
  /** Units left for an inventory item after what this visit already prescribed. */
  const stockLeft = (itemId: string) => {
    const already = open ? open.prescriptions.filter((rx) => rx.productId === itemId).reduce((sum, rx) => sum + rx.quantity, 0) : 0
    return itemOnHand(itemId, data.inventoryLots) - already
  }
  const selectedStock = selectedRx && data.inventoryItems.some((i) => i.id === selectedRx.id) ? stockLeft(selectedRx.id) : undefined
  const requestedQty = Math.max(1, Number(rxQuantity) || 1)
  const stockShortage = selectedStock !== undefined && requestedQty > selectedStock
  const allergyHit = patient && selectedRx ? patient.allergies.find((a) => a && selectedRx.name.toLowerCase().includes(a.toLowerCase())) : undefined
  if (!open || !patient)
    return (
      <>
        <PageHeader title={t`Consultation`} description={t`Open an appointment to start a consultation.`} />
        <Panel title={t`No active consultation`}>
          <p className="empty-state">
            <Trans>Choose a booked appointment from the calendar to begin, or open a past visit below.</Trans>
          </p>
          {recentEncounters.length > 0 && (
            <div className="activity-list">
              {recentEncounters.map((encounter) => {
                const encounterPatient = data.patients.find((p) => p.id === encounter.patientId)
                return (
                  <div className="activity-row" key={encounter.id}>
                    <div className="activity-mark"><Stethoscope size={14} /></div>
                    <div>
                      <strong>{encounterPatient?.name ?? t`Unknown patient`}</strong>
                      <span>
                        {formatDate(encounter.openedAt)} ·{' '}
                        {encounter.status === 'open' ? <Trans>Consultation in progress</Trans> : <Trans>Archived visit</Trans>}
                      </span>
                    </div>
                    <button className="small-button" onClick={() => onOpen(encounter.id)}>
                      {encounter.status === 'open' ? <Trans>Continue</Trans> : <Trans>View</Trans>}
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </Panel>
      </>
    )
  if (open.status === 'closed') {
    const invoice = data.invoices.find((i) => i.encounterId === open.id)
    const owner = data.owners.find((o) => o.id === patient.ownerId)
    const attending = data.users.find((u) => u.id === open.attendingId)
    const vitalsRows = [
      { label: t`Weight (kg)`, value: open.vitals.weightKg },
      { label: t`Temperature (°C)`, value: open.vitals.tempC },
      { label: t`Heart rate (bpm)`, value: open.vitals.heartRate },
      { label: t`Respiratory rate`, value: open.vitals.respRate },
    ]
    return (
      <>
        <PageHeader
          title={t`Consultation closed`}
          description={t`The clinical record for ${patient.name} is archived — notes, diagnoses and prescriptions are preserved.`}
          action={<Pill tone="muted" dot><Trans>Archived</Trans></Pill>}
        />
        <div className="consult-grid">
          <div className="side-stack">
            <Panel title={t`Patient snapshot`} description={t`Current patient details`}>
              <div className="patient-profile">
                <div className="large-pet-avatar">{patient.name.slice(0, 1)}</div>
                <div>
                  <h3>{patient.name}</h3>
                  <span>{patient.mrn} · {sexLabel[patient.sex]} · {patient.breed}</span>
                  <span><Trans>Owner: {owner?.name}</Trans></span>
                  <span>
                    {formatDate(open.openedAt)}
                    {open.closedAt ? <> · <Trans>Closed {formatDate(open.closedAt)}</Trans></> : null}
                    {attending ? <> · {attending.name}</> : null}
                  </span>
                </div>
              </div>
            </Panel>
            <Panel title={t`Vitals`} description={t`Weight, temperature, pulse and respiration`}>
              <div className="activity-list">
                {vitalsRows.map(({ label, value }) => (
                  <div className="activity-row" key={label}>
                    <div>
                      <strong>{label}</strong>
                      <span>{value || '—'}</span>
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
          </div>
          <div className="side-stack">
            <Panel title={t`Diagnoses`} description={t`Provisional working diagnoses and confirmed findings`}>
              <div className="rx-list">
                {open.diagnoses.length === 0 && <p className="empty-state"><Trans>No diagnoses recorded yet.</Trans></p>}
                {open.diagnoses.map((diagnosis) => (
                  <div className="rx-row" key={diagnosis.id}>
                    <div>
                      <strong>{diagnosis.description}</strong>
                      <span>{statusLabel(diagnosis.status)}</span>
                    </div>
                    <Pill tone={diagnosis.status === 'confirmed' ? 'ok' : 'warn'} dot>
                      {statusLabel(diagnosis.status)}
                    </Pill>
                  </div>
                ))}
              </div>
            </Panel>
            <Panel title={t`Prescriptions`} description={t`Dispensed from pharmacy stock when the visit closes`}>
              <div className="rx-list">
                {open.prescriptions.length === 0 && <p className="empty-state"><Trans>No prescriptions on this visit.</Trans></p>}
                {open.prescriptions.map((rx) => (
                  <div className="rx-row" key={rx.id}>
                    <div>
                      <strong>{rx.medication}</strong>
                      <span>
                        {rx.dose} · {rx.route} · {rx.frequency} · {rx.duration} · <Trans>qty {rx.quantity}</Trans>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
            <Panel title={t`Clinical notes`} description={t`Authored notes are preserved as a revision history`}>
              {open.notes.length === 0 && <p className="empty-state"><Trans>No notes were recorded for this visit.</Trans></p>}
              {open.notes.length > 0 && (
                <div className="note-history">
                  {open.notes.map((clinicalNote) => {
                    const author = data.users.find((u) => u.id === clinicalNote.authorId)
                    const amendmentReason = clinicalNote.amendReason || t`not recorded`
                    return (
                      <div key={clinicalNote.id} className={clinicalNote.amends ? 'note-entry amended' : 'note-entry'}>
                        <span>
                          {formatDate(clinicalNote.createdAt)}
                          {author ? ` · ${author.name}` : ''}
                          {clinicalNote.amends && (
                            <>
                              {' · '}
                              <Pill tone="warn" dot>
                                <Trans>Amendment</Trans>
                              </Pill>
                            </>
                          )}
                        </span>
                        <p>{clinicalNote.body}</p>
                        {clinicalNote.amends && (
                          <span className="note-amend-meta">
                            <Trans>Reason: {amendmentReason}</Trans>
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </Panel>
            <Panel title={t`Visit complete`}>
              <p className="empty-state">
                {invoice ? t`Draft invoice ${invoice.number} was created and is ready to post in Billing.` : t`No invoice was created for this visit.`}
              </p>
              <div className="panel-footer">
                <button
                  className="button primary"
                  onClick={() => dispatch({ type: 'session', patch: { view: 'billing', activeEncounterId: undefined } })}
                >
                  <Trans>Go to billing</Trans>
                </button>
              </div>
            </Panel>
          </div>
        </div>
      </>
    )
  }
  const patientVaccinations = data.vaccinations.filter((v) => v.patientId === patient.id)
  const startAmend = (noteId: string, body: string) => {
    setAmendNoteId(noteId)
    setAmendBody(body)
    setAmendReason('')
  }
  const cancelAmend = () => {
    setAmendNoteId(null)
    setAmendBody('')
    setAmendReason('')
  }
  const saveAmend = () => {
    if (!amendNoteId || !amendBody.trim() || !amendReason.trim()) return
    dispatch({ type: 'amendNote', encounterId: open.id, noteId: amendNoteId, body: amendBody, reason: amendReason })
    cancelAmend()
  }
  const addRx = () => {
    if (!selectedRx || !rxDose.trim()) return
    dispatch({
      type: 'addPrescription',
      encounterId: open.id,
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
  const recordVac = () => {
    if (!vacName.trim()) return
    dispatch({
      type: 'recordVaccination',
      patientId: patient.id,
      vaccination: {
        vaccineName: vacName.trim(),
        lotNumber: vacLot.trim() || undefined,
        administeredAt: nowIso(),
        nextDueAt: vacNextDue || undefined,
        encounterId: open.id,
      },
    })
    setVacName('')
    setVacLot('')
    setVacNextDue('')
  }
  const bookFollowUp = () => {
    if (!followUpDate) return
    dispatch({
      type: 'bookAppointment',
      appointment: {
        patientId: patient.id,
        startsAt: `${followUpDate}T${followUpTime || '10:00'}:00+07:00`,
        durationMin: 30,
        reason: appt ? t`Follow-up: ${appt.reason}` : t`Follow-up`,
        vetId: open.attendingId,
      },
    })
    setFollowUpDate('')
  }
  const apptSuffix = appt ? ` · ${appt.reason}` : ''
  return (
    <>
      <PageHeader
        title={t`Consultation`}
        description={t`Clinical record for ${patient.name} · ${speciesLabel[patient.species]} · ${patient.breed}${apptSuffix}`}
        action={
          <Pill tone="ok" dot>
            <Trans>Saved locally</Trans>
          </Pill>
        }
      />
      <div className="consult-grid">
        <div className="side-stack">
          <Panel title={t`Patient snapshot`} description={t`Current patient details`}>
            <div className="patient-profile">
              <div className="large-pet-avatar">{patient.name.slice(0, 1)}</div>
              <div>
                <h3>{patient.name}</h3>
                <span>
                  {patient.mrn} · {sexLabel[patient.sex]} · {patient.breed}
                </span>
                <span><Trans>Owner: {data.owners.find((o) => o.id === patient.ownerId)?.name}</Trans></span>
              </div>
            </div>
            {(patient.allergies.length > 0 || patient.medicalAlerts.length > 0) && (
              <div className="patient-flags consult-flags" role="alert">
                {patient.allergies.map((a) => (
                  <Pill key={a} tone="bad" dot>
                    <Trans>Allergy: {a}</Trans>
                  </Pill>
                ))}
                {patient.medicalAlerts.map((a) => (
                  <Pill key={a} tone="warn" dot>
                    {a}
                  </Pill>
                ))}
              </div>
            )}
          </Panel>
          <Panel title={t`Vitals`} description={t`Weight, temperature, pulse and respiration`}>
            <div className="form-grid">
              <Field label={t`Weight (kg)`} htmlFor="vt-weight">
                <input id="vt-weight" inputMode="decimal" value={vitals.weightKg} onChange={(e) => setVitals({ ...vitals, weightKg: e.target.value })} placeholder={t`e.g. 28.6`} />
              </Field>
              <Field label={t`Temperature (°C)`} htmlFor="vt-temp">
                <input id="vt-temp" inputMode="decimal" value={vitals.tempC} onChange={(e) => setVitals({ ...vitals, tempC: e.target.value })} placeholder={t`e.g. 38.6`} />
              </Field>
              <Field label={t`Heart rate (bpm)`} htmlFor="vt-hr">
                <input id="vt-hr" inputMode="numeric" value={vitals.heartRate} onChange={(e) => setVitals({ ...vitals, heartRate: e.target.value })} placeholder={t`e.g. 96`} />
              </Field>
              <Field label={t`Respiratory rate`} htmlFor="vt-rr">
                <input id="vt-rr" inputMode="numeric" value={vitals.respRate} onChange={(e) => setVitals({ ...vitals, respRate: e.target.value })} placeholder={t`e.g. 22`} />
              </Field>
            </div>
            <div className="panel-footer">
              <button
                className="button secondary"
                onClick={() => dispatch({ type: 'updateVitals', encounterId: open.id, vitals })}
              >
                <Trans>Record vitals</Trans>
              </button>
            </div>
          </Panel>
          <Panel title={t`Vaccinations`} description={t`Recorded during this visit and prior history`}>
            <div className="inline-form nested">
              <div className="form-grid">
                <Field label={t`Vaccine`} htmlFor="vac-name">
                  <input id="vac-name" list="vac-options" value={vacName} onChange={(e) => setVacName(e.target.value)} placeholder={t`e.g. Rabies vaccine…`} />
                  <datalist id="vac-options">
                    {data.inventoryItems.filter((i) => i.category === 'vaccine').map((i) => (
                      <option key={i.id} value={i.name} />
                    ))}
                  </datalist>
                </Field>
                <Field label={t`Lot number`} htmlFor="vac-lot">
                  <input id="vac-lot" value={vacLot} onChange={(e) => setVacLot(e.target.value)} placeholder={t`e.g. RAB-2610B…`} />
                </Field>
                <Field label={t`Next due`} htmlFor="vac-next">
                  <DatePicker id="vac-next" label={t`Next due`} value={vacNextDue} onChange={setVacNextDue} />
                </Field>
              </div>
              <button className="button secondary" onClick={recordVac} disabled={!vacName.trim()}>
                <Trans>Record vaccination</Trans>
              </button>
            </div>
            <div className="activity-list">
              {patientVaccinations.length === 0 && <p className="empty-state"><Trans>No vaccinations recorded for this patient.</Trans></p>}
              {patientVaccinations.map((v) => (
                <div className="activity-row" key={v.id}>
                  <div className="activity-mark"><CalendarDays size={14} /></div>
                  <div>
                    <strong>{v.vaccineName}</strong>
                    <span>
                      {formatDate(v.administeredAt)}
                      {v.lotNumber ? <> · <Trans>lot {v.lotNumber}</Trans></> : ''}
                      {v.nextDueAt ? <> · <Trans>next due {v.nextDueAt}</Trans></> : ''}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </div>
        <div className="side-stack">
          <Panel title={t`Diagnoses`} description={t`Provisional working diagnoses and confirmed findings`}>
            <div className="inline-form nested">
              <div className="form-grid">
                <Field label={t`Diagnosis`} htmlFor="dx-text">
                  <input id="dx-text" value={dxText} onChange={(e) => setDxText(e.target.value)} placeholder={t`e.g. Soft tissue strain, right stifle…`} />
                </Field>
                <Field label={t`Status`} htmlFor="dx-status">
                  <NativeSelect id="dx-status" value={dxStatus} onChange={(e) => setDxStatus(e.target.value as 'provisional' | 'confirmed')}>
                    <option value="provisional">{t`Provisional`}</option>
                    <option value="confirmed">{t`Confirmed`}</option>
                  </NativeSelect>
                </Field>
              </div>
              <button
                className="button secondary"
                disabled={!dxText.trim()}
                onClick={() => {
                  dispatch({ type: 'addDiagnosis', encounterId: open.id, diagnosis: { description: dxText.trim(), status: dxStatus } })
                  setDxText('')
                }}
              >
                <Trans>Add diagnosis</Trans>
              </button>
            </div>
            <div className="rx-list">
              {open.diagnoses.length === 0 && <p className="empty-state"><Trans>No diagnoses recorded yet.</Trans></p>}
              {open.diagnoses.map((d) => (
                <div className="rx-row" key={d.id}>
                  <div>
                    <strong>{d.description}</strong>
                    <span>{statusLabel(d.status)}</span>
                  </div>
                  {d.status === 'provisional' ? (
                    <button
                      className="small-button"
                      onClick={() => dispatch({ type: 'confirmDiagnosis', encounterId: open.id, diagnosisId: d.id })}
                      aria-label={t`Confirm diagnosis ${d.description}`}
                    >
                      <Trans>Confirm</Trans>
                    </button>
                  ) : (
                    <Pill tone="ok" dot>{statusLabel(d.status)}</Pill>
                  )}
                </div>
              ))}
            </div>
          </Panel>
          <Panel title={t`Prescriptions`} description={t`Dispensed from pharmacy stock when the visit closes`}>
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
              {open.prescriptions.length === 0 && <p className="empty-state"><Trans>No prescriptions on this visit.</Trans></p>}
              {open.prescriptions.map((rx) => (
                <div className="rx-row" key={rx.id}>
                  <div>
                    <strong>{rx.medication}</strong>
                    <span>
                      {rx.dose} · {rx.route} · {rx.frequency} · {rx.duration} · <Trans>qty {rx.quantity}</Trans>
                    </span>
                  </div>
                  <button className="text-button" onClick={() => dispatch({ type: 'removePrescription', encounterId: open.id, prescriptionId: rx.id })}>
                    <Trans>Remove</Trans>
                  </button>
                </div>
              ))}
            </div>
          </Panel>
          <Panel title={t`Clinical notes`} description={t`Authored notes are preserved as a revision history`}>
            <textarea
              className="note-box"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              aria-label={t`Clinical notes`}
              placeholder={t`Record the consultation findings, assessment and plan…`}
            />
            <div className="panel-footer">
              <span className="save-hint">
                <span className="pulse" /> <Trans>Draft is saved locally</Trans>
              </span>
              <button
                className="button secondary"
                onClick={() => {
                  if (note.trim()) {
                    dispatch({
                      type: 'addNote',
                      encounterId: open.id,
                      body: note,
                    })
                    setNote('')
                  }
                }}
              >
                <Trans>Add note</Trans>
              </button>
              <button
                className="button primary"
                onClick={() => dispatch({ type: 'closeEncounter', encounterId: open.id })}
              >
                <Trans>Close consultation</Trans>
              </button>
            </div>
            {open.notes.length > 0 && (
              <div className="note-history">
                {open.notes.map((n) => {
                  const author = data.users.find((u) => u.id === n.authorId)
                  const amends = n.amends ? open.notes.find((x) => x.id === n.amends) : undefined
                  const amendmentReason = n.amendReason || t`not recorded`
                  return (
                    <div key={n.id} className={n.amends ? 'note-entry amended' : 'note-entry'}>
                      <span>
                        {formatDate(n.createdAt)}
                        {author ? ` · ${author.name}` : ''}
                        {n.amends && (
                          <>
                            {' · '}
                            <Pill tone="warn" dot>
                              <Trans>Amendment</Trans>
                            </Pill>
                          </>
                        )}
                      </span>
                      <p>{n.body}</p>
                      {n.amends && (
                        <span className="note-amend-meta">
                          <Trans>Reason: {amendmentReason}</Trans>
                          {amends ? <> · <Trans>supersedes an earlier note</Trans></> : <> · <Trans>original note no longer on file</Trans></>}
                        </span>
                      )}
                      {amendNoteId === n.id ? (
                        <div className="note-amend-form">
                          <Field label={t`Reason for amendment`} htmlFor="note-amend-reason">
                            <input
                              id="note-amend-reason"
                              value={amendReason}
                              onChange={(e) => setAmendReason(e.target.value)}
                              placeholder={t`e.g. Corrected the recorded dose…`}
                            />
                          </Field>
                          <textarea
                            className="note-box"
                            aria-label={t`Amended note`}
                            value={amendBody}
                            onChange={(e) => setAmendBody(e.target.value)}
                          />
                          <div className="panel-footer">
                            <button className="small-button" onClick={cancelAmend}>
                              <Trans>Cancel</Trans>
                            </button>
                            <button className="button primary" onClick={saveAmend} disabled={!amendBody.trim() || !amendReason.trim()}>
                              <Trans>Save amendment</Trans>
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button className="text-button" onClick={() => startAmend(n.id, n.body)}>
                          <Trans>Amend</Trans>
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </Panel>
          <Panel title={t`Follow-up`} description={t`Book the next visit before closing`}>
            <div className="inline-form nested">
              <div className="form-grid">
                <Field label={t`Follow-up date`} htmlFor="fu-date">
                  <DatePicker id="fu-date" label={t`Follow-up date`} value={followUpDate} onChange={setFollowUpDate} />
                </Field>
                <Field label={t`Time`} htmlFor="fu-time">
                  <input id="fu-time" type="time" value={followUpTime} onChange={(e) => setFollowUpTime(e.target.value)} />
                </Field>
              </div>
              <button className="button secondary" onClick={bookFollowUp} disabled={!followUpDate}>
                <Trans>Book follow-up</Trans>
              </button>
            </div>
          </Panel>
        </div>
      </div>
    </>
  )
}


