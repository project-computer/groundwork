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
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { savePatient } from '@/lib/store'
import { SPECIES, type Patient } from '@/lib/types'
import { NativeSelect } from './native-select'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  patient: Patient | null
}

export function PatientFormDialog({ open, onOpenChange, patient }: Props) {
  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const get = (k: string) => String(f.get(k) ?? '').trim()
    const name = get('name')
    if (!name) return
    savePatient(
      {
        name,
        species: get('species') as Patient['species'],
        breed: get('breed'),
        sex: get('sex') as Patient['sex'],
        birthDate: get('birthDate'),
        weightKg: get('weightKg'),
        ownerName: get('ownerName'),
        ownerPhone: get('ownerPhone'),
        ownerEmail: get('ownerEmail'),
        allergies: get('allergies'),
        notes: get('notes'),
      },
      patient?.id,
    )
    toast.success(patient ? `${name} updated` : `${name} added`)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{patient ? `Edit ${patient.name}` : 'New patient'}</DialogTitle>
          <DialogDescription>Pet and owner details are saved on this device.</DialogDescription>
        </DialogHeader>
        <form key={patient?.id ?? 'new'} onSubmit={onSubmit} className="flex flex-col gap-4">
          <fieldset className="grid grid-cols-2 gap-3">
            <legend className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">Pet</legend>
            <Field label="Name" className="col-span-2">
              <Input name="name" required defaultValue={patient?.name} autoFocus />
            </Field>
            <Field label="Species">
              <NativeSelect name="species" defaultValue={patient?.species ?? 'Dog'}>
                {SPECIES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Sex">
              <NativeSelect name="sex" defaultValue={patient?.sex ?? 'Unknown'}>
                <option>Male</option>
                <option>Female</option>
                <option>Unknown</option>
              </NativeSelect>
            </Field>
            <Field label="Breed" className="col-span-2">
              <Input name="breed" defaultValue={patient?.breed} />
            </Field>
            <Field label="Birth date">
              <Input name="birthDate" type="date" defaultValue={patient?.birthDate} />
            </Field>
            <Field label="Weight (kg)">
              <Input name="weightKg" type="number" step="0.1" min="0" inputMode="decimal" defaultValue={patient?.weightKg} />
            </Field>
          </fieldset>
          <fieldset className="grid grid-cols-2 gap-3">
            <legend className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">Owner</legend>
            <Field label="Owner name" className="col-span-2">
              <Input name="ownerName" defaultValue={patient?.ownerName} autoComplete="off" />
            </Field>
            <Field label="Phone">
              <Input name="ownerPhone" type="tel" defaultValue={patient?.ownerPhone} autoComplete="off" />
            </Field>
            <Field label="Email">
              <Input name="ownerEmail" type="email" defaultValue={patient?.ownerEmail} autoComplete="off" />
            </Field>
            <Field label="Allergies" className="col-span-2">
              <Input
                name="allergies"
                defaultValue={patient?.allergies}
                autoComplete="off"
                placeholder="e.g. Penicillin (leave empty if none)"
              />
            </Field>
            <Field label="Medical notes" className="col-span-2">
              <Textarea name="notes" rows={3} defaultValue={patient?.notes} placeholder="Conditions, medications" />
            </Field>
          </fieldset>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit">{patient ? 'Save changes' : 'Add patient'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function Field({
  label,
  className,
  children,
}: {
  label: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <Label className={`flex flex-col items-stretch gap-1.5 ${className ?? ''}`}>
      <span className="text-sm">{label}</span>
      {children}
    </Label>
  )
}
