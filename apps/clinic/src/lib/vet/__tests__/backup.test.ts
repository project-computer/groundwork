import { describe, expect, it } from 'vitest'
import { backupFileName, buildBackup, isClinicBackup, lastAutoBackupDay, parseBackup, shouldAutoBackup, summarizeBackup } from '../backup'
import { seedState } from '../seed'

const createdAt = '2026-10-28T14:30:05.123Z'

describe('clinic backup files', () => {
  it('round-trips a full clinic document', () => {
    const backup = buildBackup(seedState, createdAt)
    const parsed = parseBackup(JSON.stringify(backup))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.backup.state.clinic.id).toBe(seedState.clinic.id)
    expect(parsed.backup.state.patients).toHaveLength(seedState.patients.length)
    expect(parsed.backup.createdAt).toBe(createdAt)
    expect(isClinicBackup(parsed.backup)).toBe(true)
  })

  it('rejects files that are not JSON or not a backup', () => {
    expect(parseBackup('not json')).toEqual({ ok: false, error: 'That file is not valid JSON.' })
    expect(parseBackup('null')).toEqual({ ok: false, error: 'That file is not a clinic backup.' })
    expect(parseBackup(JSON.stringify({ hello: 'world' }))).toEqual({
      ok: false,
      error: 'That file is not a VetCare clinic backup.',
    })
  })

  it('rejects an unsupported backup version', () => {
    const backup = { ...buildBackup(seedState, createdAt), version: 99 }
    expect(parseBackup(JSON.stringify(backup))).toEqual({
      ok: false,
      error: 'Backup version 99 is not supported by this app.',
    })
  })

  it('rejects a backup whose payload is not a clinic document', () => {
    const backup = { ...buildBackup(seedState, createdAt), state: { hello: 'world' } }
    expect(parseBackup(JSON.stringify(backup))).toEqual({
      ok: false,
      error: 'The backup is missing clinic records and cannot be restored.',
    })
  })

  it('parses a legacy backup missing newer collections', () => {
    const legacy = {
      format: 'vetcare-clinic-backup',
      version: 1,
      createdAt,
      state: {
        clinic: seedState.clinic,
        users: seedState.users,
        owners: seedState.owners,
        patients: seedState.patients,
        appointments: seedState.appointments,
        encounters: seedState.encounters,
        invoices: seedState.invoices,
      },
    }
    const parsed = parseBackup(JSON.stringify(legacy))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.backup.state.vaccinations).toEqual([])
    expect(parsed.backup.state.outbox).toEqual([])
  })

  it('summarises the contents for the restore preview', () => {
    const summary = summarizeBackup(buildBackup(seedState, createdAt))
    expect(summary).toEqual({
      clinicName: seedState.clinic.name,
      owners: seedState.owners.length,
      patients: seedState.patients.length,
      appointments: seedState.appointments.length,
      encounters: seedState.encounters.length,
      invoices: seedState.invoices.length,
      payments: seedState.payments.length,
      staff: seedState.users.length,
    })
  })

  it('names files so they sort chronologically', () => {
    expect(backupFileName(createdAt)).toBe('vetcare-backup-2026-10-28-14-30.json')
  })

  it('carries the trigger and tolerates pre-trigger (ADR 0014) files', () => {
    const auto = buildBackup(seedState, createdAt, 'auto')
    expect(auto.trigger).toBe('auto')
    const parsed = parseBackup(JSON.stringify(auto))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.backup.trigger).toBe('auto')

    // An ADR-0014 envelope has no trigger field and must keep parsing.
    const legacy = JSON.parse(JSON.stringify(buildBackup(seedState, createdAt)))
    delete legacy.trigger
    const legacyParsed = parseBackup(JSON.stringify(legacy))
    expect(legacyParsed.ok).toBe(true)
    if (!legacyParsed.ok) return
    expect(legacyParsed.backup.trigger).toBeUndefined()
  })

  it('defaults an unknown trigger to absent rather than passing it through', () => {
    const weird = { ...buildBackup(seedState, createdAt), trigger: 'hacker' }
    const parsed = parseBackup(JSON.stringify(weird))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.backup.trigger).toBeUndefined()
  })
})

describe('daily automatic backup gate (ADR 0021)', () => {
  const today = '2026-11-06'

  it('is due when the toggle is on and no auto backup was recorded today', () => {
    expect(shouldAutoBackup(seedState, today)).toBe(true)
  })

  it('is not due when an auto backup audit event exists for today', () => {
    const backedUp = {
      ...seedState,
      audit: [
        {
          id: 'a-1',
          actorId: 'u-mai',
          action: 'backup.auto',
          entityType: 'clinic',
          entityId: seedState.clinic.id,
          summary: 'Automatic daily backup saved as x.json',
          occurredAt: `${today}T09:12:00.000Z`,
        },
      ],
    }
    expect(shouldAutoBackup(backedUp, today)).toBe(false)
  })

  it('is due again the next day', () => {
    const backedUp = {
      ...seedState,
      audit: [
        {
          id: 'a-1',
          actorId: 'u-mai',
          action: 'backup.auto',
          entityType: 'clinic',
          entityId: seedState.clinic.id,
          summary: '',
          occurredAt: '2026-11-05T09:12:00.000Z',
        },
      ],
    }
    expect(shouldAutoBackup(backedUp, today)).toBe(true)
  })

  it('is never due when the clinic turned the toggle off', () => {
    const off = { ...seedState, clinic: { ...seedState.clinic, autoBackup: false } }
    expect(shouldAutoBackup(off, today)).toBe(false)
  })

  it('reads the last auto-backup day from the audit trail', () => {
    expect(lastAutoBackupDay(seedState)).toBeNull()
  })
})
