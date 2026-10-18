'use client'

import { Pencil, Phone, Plus, Search, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { deletePatient, useClinicData } from '@/lib/store'
import type { Patient } from '@/lib/types'
import { ageFrom } from './format'
import { PatientFormDialog } from './patient-form-dialog'

export function PatientsPanel() {
  const { data } = useClinicData()
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<Patient | null>(null)
  const [open, setOpen] = useState(false)

  const q = query.trim().toLowerCase()
  const patients = data.patients.filter(
    (p) =>
      !q ||
      [p.name, p.ownerName, p.breed, p.species, p.ownerPhone].some((f) => f.toLowerCase().includes(q)),
  )

  function openNew() {
    setEditing(null)
    setOpen(true)
  }

  function remove(p: Patient) {
    if (!window.confirm(`Delete ${p.name} and all their appointments?`)) return
    deletePatient(p.id)
    toast.success(`${p.name} removed`)
  }

  return (
    <section className="flex flex-col gap-4" aria-labelledby="patients-heading">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 id="patients-heading" className="text-lg font-semibold">
          Patients <span className="font-normal text-muted-foreground">({data.patients.length})</span>
        </h2>
        <div className="flex gap-2">
          <div className="relative flex-1 sm:w-64">
            <Search
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search pets or owners"
              aria-label="Search patients"
              className="pl-8"
            />
          </div>
          <Button onClick={openNew} className="gap-1.5">
            <Plus aria-hidden="true" />
            <span className="sr-only sm:not-sr-only">New patient</span>
          </Button>
        </div>
      </div>

      {patients.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {data.patients.length === 0 ? 'No patients yet. Add your first one.' : 'No matches.'}
          </CardContent>
        </Card>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {patients.map((p) => (
            <li key={p.id}>
              <Card size="sm" className="h-full">
                <CardContent className="flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{p.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {[p.breed, p.sex !== 'Unknown' ? p.sex : '', ageFrom(p.birthDate), p.weightKg && `${p.weightKg} kg`]
                          .filter(Boolean)
                          .join(' · ') || 'No details'}
                      </p>
                    </div>
                    <Badge variant="secondary">{p.species}</Badge>
                  </div>
                  <div className="flex items-center justify-between gap-2 border-t pt-3">
                    <div className="min-w-0 text-sm">
                      <p className="truncate">{p.ownerName || 'No owner'}</p>
                      {p.ownerPhone && (
                        <a
                          href={`tel:${p.ownerPhone}`}
                          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                        >
                          <Phone className="size-3" aria-hidden="true" />
                          {p.ownerPhone}
                        </a>
                      )}
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Edit ${p.name}`}
                        onClick={() => {
                          setEditing(p)
                          setOpen(true)
                        }}
                      >
                        <Pencil />
                      </Button>
                      <Button variant="ghost" size="icon-sm" aria-label={`Delete ${p.name}`} onClick={() => remove(p)}>
                        <Trash2 />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <PatientFormDialog open={open} onOpenChange={setOpen} patient={editing} />
    </section>
  )
}
