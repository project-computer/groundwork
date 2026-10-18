'use client'

import { CalendarPlus, ClipboardList, Stethoscope } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { startConsult, startWalkIn, useClinicData } from '@/lib/store'
import type { MedicalRecord } from '@/lib/types'
import { ConsultEditor } from './consult-editor'
import { NativeSelect } from './native-select'
import { formatDateTime } from './format'
import { StatusBadge } from './status-badge'

export function ConsultPanel() {
  const { data } = useClinicData()
  const [activeRecordId, setActiveRecordId] = useState<string | null>(null)
  const [walkInOpen, setWalkInOpen] = useState(false)
  const [walkInPatient, setWalkInPatient] = useState('')
  const [walkInReason, setWalkInReason] = useState('')

  const patients = useMemo(() => new Map(data.patients.map((p) => [p.id, p])), [data.patients])
  const activeRecord = data.records.find((r) => r.id === activeRecordId) ?? null

  const todayStr = new Date().toDateString()
  const queue = data.appointments
    .filter(
      (a) =>
        new Date(a.dateTime).toDateString() === todayStr &&
        (a.status === 'scheduled' || a.status === 'checked-in' || a.status === 'in-consult'),
    )
    .sort((a, b) => a.dateTime.localeCompare(b.dateTime))
  const drafts = data.records.filter((r) => r.status === 'draft')

  async function onStartConsult(appointmentId: string) {
    const record = await startConsult(appointmentId)
    if (record) {
      setActiveRecordId(record.id)
      toast.success('Consultation started')
    } else {
      toast.error('Could not start consultation')
    }
  }

  async function onWalkIn(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!walkInPatient) {
      toast.error('Choose a patient')
      return
    }
    const vet = e.currentTarget.vet instanceof HTMLInputElement ? e.currentTarget.vet.value : ''
    const record = await startWalkIn(walkInPatient, walkInReason, vet)
    setWalkInOpen(false)
    setWalkInPatient('')
    setWalkInReason('')
    if (record) {
      setActiveRecordId(record.id)
      toast.success('Walk-in started')
    }
  }

  if (activeRecord) {
    return (
      <ConsultEditor
        record={activeRecord}
        patient={patients.get(activeRecord.patientId)}
        settings={data.settings}
        onClose={() => setActiveRecordId(null)}
        onFollowUpAppointment={(id) => {
          const appt = data.appointments.find((a) => a.id === id)
          return appt
        }}
      />
    )
  }

  return (
    <section className="flex flex-col gap-4" aria-labelledby="consult-heading">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 id="consult-heading" className="text-lg font-semibold">
          Consultations
        </h2>
        <Button className="gap-1.5" onClick={() => setWalkInOpen((v) => !v)}>
          <Stethoscope aria-hidden="true" />
          Walk-in
        </Button>
      </div>

      {walkInOpen && (
        <Card>
          <CardContent>
            <form className="flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={onWalkIn}>
              <div className="flex-1">
                <Label htmlFor="walkin-patient">Patient</Label>
                <NativeSelect
                  id="walkin-patient"
                  value={walkInPatient}
                  onChange={(e) => setWalkInPatient(e.target.value)}
                >
                  <option value="">Choose a patient…</option>
                  {data.patients.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.species}) — {p.ownerName}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div className="flex-1">
                <Label htmlFor="walkin-reason">Reason</Label>
                <Input
                  id="walkin-reason"
                  value={walkInReason}
                  onChange={(e) => setWalkInReason(e.target.value)}
                  placeholder="e.g. Vaccination"
                />
              </div>
              <div className="flex-1">
                <Label htmlFor="walkin-vet">Vet</Label>
                <Input id="walkin-vet" name="vet" placeholder={data.settings.defaultVet || 'Dr…'} />
              </div>
              <Button type="submit">Start</Button>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent>
          <h3 className="mb-2 text-sm font-medium text-muted-foreground">Today&apos;s queue</h3>
          {queue.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No appointments today. Use Walk-in to see a patient now.
            </p>
          ) : (
            <ul className="flex flex-col divide-y">
              {queue.map((a) => {
                const p = patients.get(a.patientId)
                return (
                  <li key={a.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate font-medium">{p?.name ?? 'Unknown patient'}</p>
                        <StatusBadge status={a.status} />
                        {p?.allergies ? (
                          <span className="rounded bg-destructive/10 px-1.5 py-0.5 text-xs font-medium text-destructive">
                            ⚠ {p.allergies}
                          </span>
                        ) : null}
                      </div>
                      <p className="truncate text-sm text-muted-foreground">
                        {formatDateTime(a.dateTime)} · {a.reason}
                        {a.vet ? ` · ${a.vet}` : ''}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      className="gap-1"
                      variant={a.status === 'in-consult' ? 'secondary' : 'default'}
                      onClick={() => onStartConsult(a.id)}
                    >
                      <ClipboardList aria-hidden="true" />
                      {a.status === 'in-consult' ? 'Resume' : 'Consult'}
                    </Button>
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {drafts.length > 0 && (
        <Card>
          <CardContent>
            <h3 className="mb-2 text-sm font-medium text-muted-foreground">Draft records</h3>
            <ul className="flex flex-col divide-y">
              {drafts.map((r: MedicalRecord) => {
                const p = patients.get(r.patientId)
                return (
                  <li key={r.id} className="flex items-center justify-between gap-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{p?.name ?? 'Unknown patient'}</p>
                      <p className="text-sm text-muted-foreground">
                        {r.date ? r.date.replace('T', ' ') : ''} · {r.vet || 'no vet'}
                      </p>
                    </div>
                    <Button size="sm" variant="outline" className="gap-1" onClick={() => setActiveRecordId(r.id)}>
                      <ClipboardList aria-hidden="true" />
                      Resume
                    </Button>
                  </li>
                )
              })}
            </ul>
          </CardContent>
        </Card>
      )}

      <RecentRecords
        records={data.records.filter((r) => r.status === 'final').slice(0, 10)}
        patients={patients}
        onOpen={setActiveRecordId}
      />
    </section>
  )
}

function RecentRecords({
  records,
  patients,
  onOpen,
}: {
  records: MedicalRecord[]
  patients: Map<string, import('@/lib/types').Patient>
  onOpen: (id: string) => void
}) {
  if (records.length === 0) return null
  return (
    <Card>
      <CardContent>
        <h3 className="mb-2 text-sm font-medium text-muted-foreground">Recent completed visits</h3>
        <ul className="flex flex-col divide-y">
          {records.map((r) => {
            const p = patients.get(r.patientId)
            return (
              <li key={r.id} className="flex items-center justify-between gap-4 py-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{p?.name ?? 'Unknown patient'}</p>
                  <p className="truncate text-sm text-muted-foreground">
                    {r.date ? r.date.replace('T', ' ') : ''} · {r.assessment || r.subjective || 'Visit'}
                  </p>
                </div>
                <Button size="sm" variant="ghost" className="gap-1" onClick={() => onOpen(r.id)}>
                  <CalendarPlus aria-hidden="true" />
                  View
                </Button>
              </li>
            )
          })}
        </ul>
      </CardContent>
    </Card>
  )
}
