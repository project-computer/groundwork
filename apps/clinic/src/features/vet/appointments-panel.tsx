'use client'

import { Check, CalendarPlus, Download, Pencil, Plus, Trash2, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { deleteAppointment, setAppointmentStatus, useClinicData } from '@/lib/store'
import { downloadAppointmentIcs, downloadScheduleIcs } from '@/lib/ics'
import type { Appointment } from '@/lib/types'
import { AppointmentFormDialog } from './appointment-form-dialog'
import { formatDateTime, formatDate } from './format'
import { dayKey, ScheduleCalendar } from './schedule-calendar'
import { StatusBadge } from './status-badge'

const FILTERS = ['upcoming', 'past', 'all', 'day'] as const
type Filter = (typeof FILTERS)[number]

export function AppointmentsPanel() {
  const { data } = useClinicData()
  const [filter, setFilter] = useState<Filter>('upcoming')
  const [editing, setEditing] = useState<Appointment | null>(null)
  const [open, setOpen] = useState(false)
  const [selectedDay, setSelectedDay] = useState(dayKey(new Date()))
  const patients = useMemo(() => new Map(data.patients.map((p) => [p.id, p])), [data.patients])

  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const list = data.appointments
    .filter((a) => {
      const d = new Date(a.dateTime)
      if (filter === 'day') return a.dateTime.slice(0, 10) === selectedDay
      if (filter === 'upcoming') return d >= startOfToday && a.status === 'scheduled'
      if (filter === 'past') return d < startOfToday || a.status !== 'scheduled'
      return true
    })
    .sort((a, b) =>
      filter === 'past' ? b.dateTime.localeCompare(a.dateTime) : a.dateTime.localeCompare(b.dateTime),
    )

  function book(defaultDateTime?: string) {
    if (data.patients.length === 0) {
      toast.error('Add a patient first')
      return
    }
    setEditing(null)
    setBookDefault(defaultDateTime)
    setOpen(true)
  }

  const [bookDefault, setBookDefault] = useState<string | undefined>()

  return (
    <section className="flex flex-col gap-4" aria-labelledby="schedule-heading">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 id="schedule-heading" className="text-lg font-semibold">
          Schedule
        </h2>
        <div className="flex gap-2">
          <div role="group" aria-label="Filter appointments" className="flex flex-1 rounded-lg border p-0.5">
            {FILTERS.map((f) => (
              <Button
                key={f}
                size="sm"
                variant={filter === f ? 'secondary' : 'ghost'}
                aria-pressed={filter === f}
                onClick={() => setFilter(f)}
                className="flex-1 capitalize"
              >
                {f}
              </Button>
            ))}
          </div>
          <Button
            variant="outline"
            size="icon"
            aria-label="Download clinic schedule as calendar file"
            onClick={() => {
              downloadScheduleIcs(data.appointments, patients, data.settings)
              toast.success('Clinic calendar downloaded')
            }}
          >
            <Download />
          </Button>
          <Button aria-label="Book appointment" onClick={() => book(filter === 'day' ? `${selectedDay}T09:00` : undefined)} className="gap-1.5">
            <Plus aria-hidden="true" />
            <span className="sr-only sm:not-sr-only">Book</span>
          </Button>
        </div>
      </div>

      {filter === 'day' && (
        <>
          <ScheduleCalendar
            appointments={data.appointments}
            patients={patients}
            selected={selectedDay}
            onSelect={setSelectedDay}
          />
          <p className="text-sm font-medium text-muted-foreground">
            {formatDate(selectedDay)} — {list.length} appointment{list.length === 1 ? '' : 's'}
          </p>
        </>
      )}

      <Card>
        <CardContent>
          {list.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {filter === 'day' ? 'Nothing booked for this day.' : 'No appointments here.'}
            </p>
          ) : (
            <ul className="flex flex-col divide-y">
              {list.map((a) => {
                const p = patients.get(a.patientId)
                return (
                  <li key={a.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate font-medium">{p?.name ?? 'Unknown patient'}</p>
                        <StatusBadge status={a.status} />
                      </div>
                      <p className="truncate text-sm text-muted-foreground">
                        {formatDateTime(a.dateTime)} · {a.reason}
                        {a.vet ? ` · ${a.vet}` : ''}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      {a.status === 'scheduled' && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1"
                            onClick={() => setAppointmentStatus(a.id, 'completed')}
                          >
                            <Check aria-hidden="true" />
                            Done
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label="Cancel appointment"
                            onClick={() => setAppointmentStatus(a.id, 'cancelled')}
                          >
                            <X />
                          </Button>
                        </>
                      )}
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Download calendar file"
                        onClick={() => {
                          downloadAppointmentIcs(a, p, data.settings)
                          toast.success('Calendar file downloaded')
                        }}
                      >
                        <CalendarPlus />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Edit appointment"
                        onClick={() => {
                          setEditing(a)
                          setOpen(true)
                        }}
                      >
                        <Pencil />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Delete appointment"
                        onClick={() => {
                          if (window.confirm('Delete this appointment?')) deleteAppointment(a.id)
                        }}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <AppointmentFormDialog
        open={open}
        onOpenChange={setOpen}
        appointment={editing}
        patients={data.patients}
        defaultDateTime={bookDefault}
      />
    </section>
  )
}
