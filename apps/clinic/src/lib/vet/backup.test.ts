import { describe, expect, it } from 'vitest'
import { backupFileName, buildBackup, isClinicBackup, parseBackup, summarizeBackup } from './backup'
import { seedState } from './seed'

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
    const backup = { ...buildBackup(seedState, createdAt), state: { clinic: {} } }
    expect(parseBackup(JSON.stringify(backup))).toEqual({
      ok: false,
      error: 'The backup is missing clinic records and cannot be restored.',
    })
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
})
