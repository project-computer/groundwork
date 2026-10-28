import { isClinicState } from './store'
import type { ClinicState } from './types'

/**
 * Clinic backup files (MVP-08). A backup is the full clinic document plus a
 * small envelope, so it can be validated and previewed before it replaces
 * anything. It is deliberately different from a CaseBundle: a case bundle is
 * one patient's shareable history, a backup is the whole installation.
 */

export const BACKUP_FORMAT = 'vetcare-clinic-backup'
export const BACKUP_VERSION = 1

export interface ClinicBackup {
  format: typeof BACKUP_FORMAT
  version: typeof BACKUP_VERSION
  createdAt: string
  state: ClinicState
}

export interface BackupSummary {
  clinicName: string
  owners: number
  patients: number
  appointments: number
  encounters: number
  invoices: number
  payments: number
  staff: number
}

export type BackupParseResult =
  | { ok: true; backup: ClinicBackup }
  | { ok: false; error: string }

export const buildBackup = (state: ClinicState, createdAt: string): ClinicBackup => ({
  format: BACKUP_FORMAT,
  version: BACKUP_VERSION,
  createdAt,
  state,
})

/** Structural guard: a backup envelope whose payload is a real clinic document. */
export const isClinicBackup = (value: unknown): value is ClinicBackup => {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return (
    v.format === BACKUP_FORMAT &&
    v.version === BACKUP_VERSION &&
    typeof v.createdAt === 'string' &&
    v.createdAt.length > 0 &&
    isClinicState(v.state)
  )
}

/** Parses a backup file, returning a human-readable reason on failure. */
export const parseBackup = (text: string): BackupParseResult => {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { ok: false, error: 'That file is not valid JSON.' }
  }
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'That file is not a clinic backup.' }
  const candidate = raw as Record<string, unknown>
  if (candidate.format !== BACKUP_FORMAT) {
    return { ok: false, error: 'That file is not a VetCare clinic backup.' }
  }
  if (candidate.version !== BACKUP_VERSION) {
    return { ok: false, error: `Backup version ${String(candidate.version)} is not supported by this app.` }
  }
  if (!isClinicBackup(raw)) {
    return { ok: false, error: 'The backup is missing clinic records and cannot be restored.' }
  }
  return { ok: true, backup: raw }
}

export const summarizeBackup = (backup: ClinicBackup): BackupSummary => ({
  clinicName: backup.state.clinic.name,
  owners: backup.state.owners.length,
  patients: backup.state.patients.length,
  appointments: backup.state.appointments.length,
  encounters: backup.state.encounters.length,
  invoices: backup.state.invoices.length,
  payments: backup.state.payments.length,
  staff: backup.state.users.length,
})

/** `vetcare-backup-2026-10-28-1430.json` — sortable and timezone-obvious. */
export const backupFileName = (createdAt: string): string => {
  const stamp = createdAt.replace(/[:.]/g, '-').replace('T', '-').slice(0, 16)
  return `vetcare-backup-${stamp}.json`
}

/** Downloads the backup as a JSON file — the transport for local recovery. */
export const downloadBackup = (backup: ClinicBackup) => {
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = backupFileName(backup.createdAt)
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}
