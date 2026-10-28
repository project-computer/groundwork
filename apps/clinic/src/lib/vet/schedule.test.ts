import { describe, expect, it } from 'vitest'
import { findAppointmentConflict, isPastSlot } from './schedule'
import type { Appointment } from './types'

const at = (time: string, day = '2026-03-04') => `${day}T${time}:00+07:00`

const appt = (overrides: Partial<Appointment> & { id: string; startsAt: string }): Appointment => ({
  patientId: 'p-1',
  durationMin: 30,
  reason: 'Consultation',
  vetId: 'u-pim',
  status: 'booked',
  version: 1,
  ...overrides,
})

describe('findAppointmentConflict', () => {
  const existing = [
    appt({ id: 'a-1', startsAt: at('10:00'), durationMin: 30, status: 'checked_in' }),
    appt({ id: 'a-2', startsAt: at('13:00'), vetId: 'u-arun', status: 'booked' }),
    appt({ id: 'a-3', startsAt: at('15:00'), status: 'cancelled' }),
  ]

  it('flags an overlapping slot for the same vet', () => {
    const clash = findAppointmentConflict(existing, { vetId: 'u-pim', startsAt: at('10:15'), durationMin: 30 })
    expect(clash?.id).toBe('a-1')
  })

  it('treats back-to-back appointments as free', () => {
    expect(findAppointmentConflict(existing, { vetId: 'u-pim', startsAt: at('10:30'), durationMin: 30 })).toBeUndefined()
  })

  it('ignores other vets, cancelled appointments and itself', () => {
    expect(findAppointmentConflict(existing, { vetId: 'u-pim', startsAt: at('13:00'), durationMin: 30 })).toBeUndefined()
    expect(findAppointmentConflict(existing, { vetId: 'u-pim', startsAt: at('15:00'), durationMin: 30 })).toBeUndefined()
    expect(findAppointmentConflict(existing, { vetId: 'u-pim', startsAt: at('10:00'), durationMin: 30 }, 'a-1')).toBeUndefined()
  })

  it('detects a slot that fully contains an existing appointment', () => {
    const clash = findAppointmentConflict(existing, { vetId: 'u-pim', startsAt: at('09:45'), durationMin: 120 })
    expect(clash?.id).toBe('a-1')
  })

  it('only counts appointments that still hold the vet time', () => {
    const completed = [appt({ id: 'c-1', startsAt: at('11:00'), status: 'completed' })]
    expect(findAppointmentConflict(completed, { vetId: 'u-pim', startsAt: at('11:00'), durationMin: 30 })).toBeUndefined()
  })
})

describe('isPastSlot', () => {
  const now = Date.parse(at('12:00'))

  it('is true before now and false after', () => {
    expect(isPastSlot({ vetId: 'u-pim', startsAt: at('11:59'), durationMin: 30 }, now)).toBe(true)
    expect(isPastSlot({ vetId: 'u-pim', startsAt: at('12:01'), durationMin: 30 }, now)).toBe(false)
  })
})
