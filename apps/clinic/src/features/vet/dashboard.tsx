'use client'

import { ArrowRight, CalendarCheck, CalendarDays, PawPrint, Sparkles, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { loadSampleData, useClinicData } from '@/lib/store'
import { formatTime, isSameDay } from './format'
import { StatusBadge } from './status-badge'
import type { TabValue } from './vet-app'

export function Dashboard({ onNavigate }: { onNavigate: (tab: TabValue) => void }) {
  const { data } = useClinicData()
  const names = new Map(data.patients.map((p) => [p.id, p]))
  const today = data.appointments
    .filter((a) => isSameDay(a.dateTime) && a.status !== 'cancelled')
    .sort((a, b) => a.dateTime.localeCompare(b.dateTime))
  const upcoming = data.appointments.filter(
    (a) => a.status === 'scheduled' && new Date(a.dateTime) >= new Date(),
  ).length
  const owners = new Set(data.patients.map((p) => p.ownerName.trim().toLowerCase()).filter(Boolean)).size

  const stats = [
    { label: 'Patients', value: data.patients.length, icon: PawPrint },
    { label: 'Owners', value: owners, icon: Users },
    { label: 'Today', value: today.length, icon: CalendarCheck },
    { label: 'Upcoming', value: upcoming, icon: CalendarDays },
  ]

  if (data.patients.length === 0) {
    return (
      <Card className="items-center py-12 text-center">
        <CardContent className="flex max-w-md flex-col items-center gap-4">
          <span className="flex size-12 items-center justify-center rounded-full bg-accent text-accent-foreground">
            <PawPrint aria-hidden="true" />
          </span>
          <div className="flex flex-col gap-1">
            <h1 className="text-xl font-semibold text-balance">Welcome to your clinic desk</h1>
            <p className="text-sm text-muted-foreground text-pretty">
              Everything is stored on this device and syncs across your open tabs. Add your first
              patient or explore with sample data.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <Button onClick={() => onNavigate('patients')}>Add a patient</Button>
            <Button variant="outline" onClick={loadSampleData} className="gap-2">
              <Sparkles aria-hidden="true" />
              Load sample data
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="sr-only">Clinic overview</h1>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.map(({ label, value, icon: Icon }) => (
          <Card key={label} size="sm">
            <CardContent className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-2xl font-semibold tabular-nums">{value}</p>
              </div>
              <Icon className="size-5 text-primary" aria-hidden="true" />
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-2">
          <div className="flex flex-col gap-1">
            <CardTitle>Today&apos;s appointments</CardTitle>
            <CardDescription>
              {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
            </CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={() => onNavigate('appointments')} className="gap-1">
            Schedule
            <ArrowRight aria-hidden="true" />
          </Button>
        </CardHeader>
        <CardContent>
          {today.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No appointments today.</p>
          ) : (
            <ul className="flex flex-col divide-y">
              {today.map((a) => {
                const patient = names.get(a.patientId)
                return (
                  <li key={a.id} className="flex items-center gap-3 py-3">
                    <span className="w-16 shrink-0 font-mono text-sm tabular-nums text-muted-foreground">
                      {formatTime(a.dateTime)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {patient?.name ?? 'Unknown'}{' '}
                        <span className="font-normal text-muted-foreground">· {a.reason}</span>
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {patient?.ownerName} {a.vet ? `· ${a.vet}` : ''}
                      </p>
                    </div>
                    <StatusBadge status={a.status} />
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
