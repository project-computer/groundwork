'use client'

import { ArrowLeft, CalendarPlus, Check, Download, Pill, Plus, Printer, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { downloadAppointmentIcs } from '@/lib/ics'
import { printInvoice, printPrescription, printVisitSummary } from '@/lib/print'
import { emptyCharge, emptyPrescription, finishVisit, saveRecordDraft, setRecordPaid, toLocalInput } from '@/lib/store'
import type { Appointment, ChargeLine, ClinicSettings, MedicalRecord, Patient, Prescription } from '@/lib/types'

interface Props {
  record: MedicalRecord
  patient: Patient | undefined
  settings: ClinicSettings
  onClose: () => void
  onFollowUpAppointment: (id: string) => Appointment | undefined
}

const VITALS: { key: keyof MedicalRecord['vitals']; label: string }[] = [
  { key: 'weightKg', label: 'Weight (kg)' },
  { key: 'temperatureC', label: 'Temp (°C)' },
  { key: 'heartRate', label: 'Heart rate' },
  { key: 'respRate', label: 'Resp rate' },
]

const SOAP: { key: 'subjective' | 'objective' | 'assessment' | 'plan'; label: string; rows: number }[] = [
  { key: 'subjective', label: 'Subjective — history, owner report', rows: 3 },
  { key: 'objective', label: 'Objective — exam findings', rows: 3 },
  { key: 'assessment', label: 'Assessment — diagnosis', rows: 2 },
  { key: 'plan', label: 'Plan — treatment', rows: 3 },
]

export function ConsultEditor({ record, patient, settings, onClose, onFollowUpAppointment }: Props) {
  const [draft, setDraft] = useState<MedicalRecord>(record)
  const final_ = record.status === 'final'
  const followUpAppt = record.followUpAppointmentId ? onFollowUpAppointment(record.followUpAppointmentId) : undefined

  function patch(changes: Partial<MedicalRecord>) {
    setDraft((d) => ({ ...d, ...changes }))
  }
  function patchVital(key: keyof MedicalRecord['vitals'], value: string) {
    setDraft((d) => ({ ...d, vitals: { ...d.vitals, [key]: value } }))
  }
  function patchRx(id: string, changes: Partial<Prescription>) {
    setDraft((d) => ({
      ...d,
      prescriptions: d.prescriptions.map((p) => (p.id === id ? { ...p, ...changes } : p)),
    }))
  }
  function patchCharge(id: string, changes: Partial<ChargeLine>) {
    setDraft((d) => ({ ...d, charges: d.charges.map((c) => (c.id === id ? { ...c, ...changes } : c)) }))
  }

  async function onFinish() {
    try {
      const finalRecord = await finishVisit(draft)
      toast.success('Visit completed')
      if (finalRecord.prescriptions.length > 0) {
        setTimeout(() => printPrescription(finalRecord, patient, settings), 300)
      }
      onClose()
    } catch {
      toast.error('Could not finish visit')
    }
  }

  return (
    <section className="flex flex-col gap-4" aria-labelledby="consult-editor-heading">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon-sm" aria-label="Back to queue" onClick={onClose}>
            <ArrowLeft />
          </Button>
          <div>
            <h2 id="consult-editor-heading" className="text-lg font-semibold">
              {patient?.name ?? 'Unknown patient'}
              {patient ? <span className="font-normal text-muted-foreground"> · {patient.species}</span> : null}
            </h2>
            <p className="text-sm text-muted-foreground">
              {record.vet || 'no vet'} · {record.date ? record.date.replace('T', ' ') : ''}
              {patient?.allergies ? <span className="ml-2 font-medium text-destructive">⚠ Allergies: {patient.allergies}</span> : null}
            </p>
          </div>
        </div>
        {final_ ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => printVisitSummary(record, patient, settings, followUpAppt)}>
              <Printer aria-hidden="true" /> Summary
            </Button>
            {record.prescriptions.length > 0 && (
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => printPrescription(record, patient, settings)}>
                <Pill aria-hidden="true" /> Rx
              </Button>
            )}
            {record.charges.length > 0 && (
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => printInvoice(record, patient, settings)}>
                <Printer aria-hidden="true" /> {record.paid ? 'Receipt' : 'Invoice'}
              </Button>
            )}
            {followUpAppt && (
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => downloadAppointmentIcs(followUpAppt, patient, settings)}>
                <Download aria-hidden="true" /> Next visit (.ics)
              </Button>
            )}
          </div>
        ) : (
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => {
                saveRecordDraft(draft)
                toast.success('Draft saved')
              }}
            >
              Save draft
            </Button>
            <Button className="gap-1.5" onClick={onFinish}>
              <Check aria-hidden="true" />
              Finish visit
            </Button>
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Vitals</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              {VITALS.map(({ key, label }) => (
                <div key={key} className="flex flex-col gap-1">
                  <Label htmlFor={`vital-${key}`}>{label}</Label>
                  <Input
                    id={`vital-${key}`}
                    value={draft.vitals[key]}
                    disabled={final_}
                    onChange={(e) => patchVital(key, e.target.value)}
                  />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Clinical notes (SOAP)</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {SOAP.map(({ key, label, rows }) => (
              <div key={key} className="flex flex-col gap-1">
                <Label htmlFor={`soap-${key}`}>{label}</Label>
                <Textarea
                  id={`soap-${key}`}
                  rows={rows}
                  value={draft[key]}
                  disabled={final_}
                  onChange={(e) => patch({ [key]: e.target.value } as Partial<MedicalRecord>)}
                />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Prescriptions</CardTitle>
            {!final_ && (
              <Button variant="outline" size="sm" className="gap-1" onClick={() => patch({ prescriptions: [...draft.prescriptions, emptyPrescription()] })}>
                <Plus aria-hidden="true" /> Add
              </Button>
            )}
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {draft.prescriptions.length === 0 && (
              <p className="text-sm text-muted-foreground">No medications yet.</p>
            )}
            {draft.prescriptions.map((p, i) => (
              <div key={p.id} className="flex flex-col gap-2 rounded-lg border p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">Medication {i + 1}</span>
                  {!final_ && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Remove medication"
                      onClick={() => patch({ prescriptions: draft.prescriptions.filter((x) => x.id !== p.id) })}
                    >
                      <Trash2 />
                    </Button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Input placeholder="Drug" value={p.drug} disabled={final_} onChange={(e) => patchRx(p.id, { drug: e.target.value })} />
                  <Input placeholder="Strength" value={p.strength} disabled={final_} onChange={(e) => patchRx(p.id, { strength: e.target.value })} />
                  <Input placeholder="Dose" value={p.dose} disabled={final_} onChange={(e) => patchRx(p.id, { dose: e.target.value })} />
                  <Input placeholder="Route" value={p.route} disabled={final_} onChange={(e) => patchRx(p.id, { route: e.target.value })} />
                  <Input placeholder="Frequency" value={p.frequency} disabled={final_} onChange={(e) => patchRx(p.id, { frequency: e.target.value })} />
                  <Input placeholder="Days" value={p.durationDays} disabled={final_} onChange={(e) => patchRx(p.id, { durationDays: e.target.value })} />
                  <Input placeholder="Quantity" value={p.quantity} disabled={final_} onChange={(e) => patchRx(p.id, { quantity: e.target.value })} />
                  <Input placeholder="Instructions" value={p.instructions} disabled={final_} onChange={(e) => patchRx(p.id, { instructions: e.target.value })} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Charges</CardTitle>
            {!final_ && (
              <Button variant="outline" size="sm" className="gap-1" onClick={() => patch({ charges: [...draft.charges, emptyCharge()] })}>
                <Plus aria-hidden="true" /> Add
              </Button>
            )}
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {draft.charges.length === 0 && <p className="text-sm text-muted-foreground">No charges yet.</p>}
            {draft.charges.map((c) => (
              <div key={c.id} className="flex items-center gap-2">
                <Input
                  className="flex-1"
                  placeholder="Description"
                  value={c.description}
                  disabled={final_}
                  onChange={(e) => patchCharge(c.id, { description: e.target.value })}
                />
                <Input
                  className="w-16"
                  type="number"
                  min={1}
                  aria-label="Quantity"
                  value={c.qty}
                  disabled={final_}
                  onChange={(e) => patchCharge(c.id, { qty: Number(e.target.value) || 1 })}
                />
                <Input
                  className="w-24"
                  type="number"
                  min={0}
                  step="0.01"
                  aria-label="Unit price"
                  value={c.unitPrice}
                  disabled={final_}
                  onChange={(e) => patchCharge(c.id, { unitPrice: Number(e.target.value) || 0 })}
                />
                <span className="w-20 text-right text-sm tabular-nums text-muted-foreground">
                  {(c.qty * c.unitPrice).toFixed(2)}
                </span>
                {!final_ && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Remove charge"
                    onClick={() => patch({ charges: draft.charges.filter((x) => x.id !== c.id) })}
                  >
                    <Trash2 />
                  </Button>
                )}
              </div>
            ))}
            {draft.charges.length > 0 && (
              <p className="text-right text-sm font-medium">
                Total:{' '}
                {draft.charges.reduce((sum, c) => sum + c.qty * c.unitPrice, 0).toFixed(2)} {settings.currency}
              </p>
            )}
            {final_ && (
              <Button variant="outline" size="sm" onClick={() => setRecordPaid(record.id, !record.paid)}>
                Mark as {record.paid ? 'unpaid' : 'paid'}
              </Button>
            )}
          </CardContent>
        </Card>
      </div>

      {!final_ && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarPlus aria-hidden="true" className="size-4" /> Follow-up
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor="followup-at">Next visit</Label>
              <Input
                id="followup-at"
                type="datetime-local"
                value={draft.followUp?.dateTime ?? ''}
                onChange={(e) =>
                  patch({ followUp: e.target.value ? { dateTime: e.target.value, reason: draft.followUp?.reason ?? '' } : null })
                }
              />
            </div>
            <div className="flex flex-1 flex-col gap-1">
              <Label htmlFor="followup-reason">Reason</Label>
              <Input
                id="followup-reason"
                value={draft.followUp?.reason ?? ''}
                disabled={!draft.followUp?.dateTime}
                onChange={(e) =>
                  patch({ followUp: draft.followUp ? { ...draft.followUp, reason: e.target.value } : null })
                }
              />
            </div>
            <p className="w-full text-xs text-muted-foreground">
              Finishing the visit books this appointment automatically. The next visit is printed on the Rx and can be
              exported as a calendar file. Suggested:{' '}
              {toLocalInput(new Date(Date.now() + 14 * 24 * 60 * 60 * 1000))}
            </p>
          </CardContent>
        </Card>
      )}
    </section>
  )
}
