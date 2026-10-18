'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type { Appointment, Patient } from '@/lib/types'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export function dayKey(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

interface Props {
  appointments: Appointment[]
  patients: Map<string, Patient>
  selected: string
  onSelect: (day: string) => void
}

export function ScheduleCalendar({ appointments, patients, selected, onSelect }: Props) {
  const today = dayKey(new Date())
  const initial = selected || today
  const [monthCursor, setMonthCursor] = useState(() => {
    const [y, m] = initial.split('-').map(Number)
    return { year: y, month: m - 1 }
  })

  const byDay = useMemo(() => {
    const map = new Map<string, Appointment[]>()
    for (const a of appointments) {
      const key = a.dateTime.slice(0, 10)
      const list = map.get(key) ?? []
      list.push(a)
      map.set(key, list)
    }
    for (const list of map.values()) list.sort((x, y) => x.dateTime.localeCompare(y.dateTime))
    return map
  }, [appointments])

  const cells = useMemo(() => {
    const first = new Date(monthCursor.year, monthCursor.month, 1)
    const daysInMonth = new Date(monthCursor.year, monthCursor.month + 1, 0).getDate()
    const offset = (first.getDay() + 6) % 7 // Monday-first
    const out: (string | null)[] = Array.from({ length: offset }, () => null)
    for (let day = 1; day <= daysInMonth; day++) {
      out.push(dayKey(new Date(monthCursor.year, monthCursor.month, day)))
    }
    while (out.length % 7 !== 0) out.push(null)
    return out
  }, [monthCursor])

  const monthLabel = new Date(monthCursor.year, monthCursor.month, 1).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  })

  function moveMonth(delta: number) {
    setMonthCursor((c) => {
      const d = new Date(c.year, c.month + delta, 1)
      return { year: d.getFullYear(), month: d.getMonth() }
    })
  }

  return (
    <Card>
      <CardContent>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-medium">{monthLabel}</h3>
          <div className="flex gap-1">
            <Button variant="outline" size="icon-sm" aria-label="Previous month" onClick={() => moveMonth(-1)}>
              <ChevronLeft />
            </Button>
            <Button variant="outline" size="icon-sm" aria-label="Today" onClick={() => {
              const now = new Date()
              setMonthCursor({ year: now.getFullYear(), month: now.getMonth() })
              onSelect(dayKey(now))
            }}>
              Today
            </Button>
            <Button variant="outline" size="icon-sm" aria-label="Next month" onClick={() => moveMonth(1)}>
              <ChevronRight />
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center">
          {WEEKDAYS.map((w) => (
            <div key={w} className="pb-1 text-xs font-medium text-muted-foreground">
              {w}
            </div>
          ))}
          {cells.map((key, i) => {
            if (!key) return <div key={`empty-${i}`} aria-hidden />
            const dayAppointments = byDay.get(key) ?? []
            const isToday = key === today
            const isSelected = key === selected
            return (
              <button
                key={key}
                type="button"
                onClick={() => onSelect(key)}
                aria-pressed={isSelected}
                aria-current={isToday ? 'date' : undefined}
                className={`flex min-h-20 flex-col items-stretch gap-0.5 rounded-md border p-1 text-left transition-colors ${
                  isSelected
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:bg-accent'
                }`}
              >
                <span
                  className={`text-xs font-medium ${
                    isToday ? 'flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground' : ''
                  }`}
                >
                  {Number(key.slice(8))}
                </span>
                {dayAppointments.slice(0, 3).map((a) => {
                  const p = patients.get(a.patientId)
                  const cancelled = a.status === 'cancelled' || a.status === 'no-show'
                  return (
                    <span
                      key={a.id}
                      className={`truncate rounded bg-accent px-1 text-[10px] leading-4 ${
                        cancelled ? 'text-muted-foreground line-through' : ''
                      }`}
                    >
                      {a.dateTime.slice(11, 16)} {p?.name ?? '?'}
                    </span>
                  )
                })}
                {dayAppointments.length > 3 && (
                  <span className="px-1 text-[10px] text-muted-foreground">
                    +{dayAppointments.length - 3} more
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
