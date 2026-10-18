'use client'

import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { saveAppointment, toLocalInput } from '@/lib/store'
import type { Appointment, Patient } from '@/lib/types'
import { NativeSelect } from './native-select'
import { Field } from './patient-form-dialog'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  appointment: Appointment | null
  patients: Patient[]
  defaultDateTime?: string
}

function nextSlot() {
  const d = new Date()
  d.setMinutes(d.getMinutes() < 30 ? 30 : 60, 0, 0)
  return toLocalInput(d)
}

export function AppointmentFormDialog({ open, onOpenChange, appointment, patients, defaultDateTime }: Props) {
  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const get = (k: string) => String(f.get(k) ?? '').trim()
    saveAppointment(
      {
        patientId: get('patientId'),
        dateTime: get('dateTime'),
        durationMin: appointment?.durationMin ?? 30,
        reason: get('reason'),
        vet: get('vet'),
        status: (get('status') || 'scheduled') as Appointment['status'],
        notes: get('notes'),
      },
      appointment?.id,
    )
    toast.success(appointment ? 'Appointment updated' : 'Appointment booked')
    onOpenChange(false)
  }

  const sorted = [...patients].sort((a, b) => a.name.localeCompare(b.name))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{appointment ? 'Edit appointment' : 'Book appointment'}</DialogTitle>
          <DialogDescription>Choose a patient, time, and reason for the visit.</DialogDescription>
        </DialogHeader>
        <form key={appointment?.id ?? 'new'} onSubmit={onSubmit} className="grid grid-cols-2 gap-3">
          <Field label="Patient" className="col-span-2">
            <NativeSelect name="patientId" required defaultValue={appointment?.patientId ?? sorted[0]?.id}>
              {sorted.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.species}){p.ownerName ? ` — ${p.ownerName}` : ''}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Date & time" className="col-span-2">
            <Input name="dateTime" type="datetime-local" required defaultValue={appointment?.dateTime ?? defaultDateTime ?? nextSlot()} />
          </Field>
          <Field label="Reason" className="col-span-2">
            <Input name="reason" required defaultValue={appointment?.reason} placeholder="Vaccination, check-up…" />
          </Field>
          <Field label="Veterinarian">
            <Input name="vet" defaultValue={appointment?.vet} placeholder="Dr. Rivera" />
          </Field>
          <Field label="Status">
            <NativeSelect name="status" defaultValue={appointment?.status ?? 'scheduled'}>
              <option value="scheduled">Scheduled</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </NativeSelect>
          </Field>
          <Field label="Notes" className="col-span-2">
            <Textarea name="notes" rows={2} defaultValue={appointment?.notes} />
          </Field>
          <DialogFooter className="col-span-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit">{appointment ? 'Save changes' : 'Book'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
