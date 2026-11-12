import { isClinicState, parseClinicState } from './persistence'
import {
  fetchBackupFile,
  listBackupFiles,
  saveBackupFile,
  sidecarAvailable,
  type BackupFileEntry,
} from './backend'
import { todayKey } from './format'
import type { ClinicState } from './types'

export type { BackupFileEntry }

/**
 * Clinic backup files (ADR 0014). A backup is the full clinic document plus a
 * small envelope, so it can be validated and previewed before it replaces
 * anything. It is deliberately different from a CaseBundle: a case bundle is
 * one patient's shareable history, a backup is the whole installation.
 *
 * File persistence (ADR 0021) lives here too: scheduled daily backups and the
 * pre-restore safety snapshot are written by the desktop sidecar. In a
 * browser every helper below degrades to a no-op or to the download-based
 * manual flow.
 */

const BACKUP_FORMAT = 'vetcare-clinic-backup'
const BACKUP_VERSION = 1

export type BackupTrigger = 'auto' | 'manual' | 'pre-restore'

const BACKUP_TRIGGERS = new Set<BackupTrigger>(['auto', 'manual', 'pre-restore'])

export interface ClinicBackup {
  format: typeof BACKUP_FORMAT
  version: typeof BACKUP_VERSION
  createdAt: string
  /** Why the file was written; absent on ADR-0014 files, which are treated
   * as manual backups everywhere the distinction matters. */
  trigger?: BackupTrigger
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

export const buildBackup = (state: ClinicState, createdAt: string, trigger: BackupTrigger = 'manual'): ClinicBackup => ({
  format: BACKUP_FORMAT,
  version: BACKUP_VERSION,
  createdAt,
  trigger,
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
  if (typeof candidate.createdAt !== 'string' || candidate.createdAt.length === 0) {
    return { ok: false, error: 'The backup is missing clinic records and cannot be restored.' }
  }
  // Normalises backups written before newer collections existed, so an old
  // export still restores into the current document shape.
  const state = parseClinicState(candidate.state)
  if (!state) {
    return { ok: false, error: 'The backup is missing clinic records and cannot be restored.' }
  }
  const trigger = BACKUP_TRIGGERS.has(candidate.trigger as BackupTrigger)
    ? (candidate.trigger as BackupTrigger)
    : undefined
  return { ok: true, backup: { format: BACKUP_FORMAT, version: BACKUP_VERSION, createdAt: candidate.createdAt, trigger, state } }
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

// --- Scheduled and pre-restore backups (ADR 0021) ---

/** Local day key (YYYY-MM-DD) of the last recorded automatic backup, if any. */
export const lastAutoBackupDay = (state: ClinicState): string | null => {
  for (const event of state.audit) {
    if (event.action === 'backup.auto') return event.occurredAt.slice(0, 10)
  }
  return null
}

/**
 * True when this launch owes the clinic its daily backup (ADR 0021): the
 * toggle is on and no `backup.auto` audit event exists for today. The audit
 * trail is the dedup key, so relaunches on the same day are no-ops.
 */
export const shouldAutoBackup = (state: ClinicState, today = todayKey()): boolean =>
  state.clinic.autoBackup !== false && lastAutoBackupDay(state) !== today

/** Structural shape of the store's audit-only dispatch — backup audit events
 * stay local (ADR 0014) and never enter the sync outbox. */
type AuditDispatch = (action: {
  type: 'recordAudit'
  action: string
  entityType: string
  entityId: string
  summary: string
}) => void

/**
 * Runs the once-per-day automatic backup. Desktop only — in a browser the
 * sidecar transport is unavailable and nothing happens (the web target keeps
 * manual downloads). Returns the saved file name, or null.
 */
export const runAutoBackup = async (state: ClinicState, dispatch: AuditDispatch, today = todayKey()): Promise<string | null> => {
  if (!shouldAutoBackup(state, today)) return null
  const backup = buildBackup(state, new Date().toISOString(), 'auto')
  const result = await saveBackupFile(backup)
  if (result.status !== 'saved') return null
  dispatch({
    type: 'recordAudit',
    action: 'backup.auto',
    entityType: 'clinic',
    entityId: state.clinic.id,
    summary: `Automatic daily backup saved as ${result.file}`,
  })
  return result.file
}

export type RestoreSnapshotResult = { ok: true; file: string } | { ok: false; reason: string }

/**
 * Snapshots the current document as a `pre-restore` backup before a restore
 * replaces it (ADR 0021, fail closed): a restore must never be the operation
 * that loses the only copy of the data. `unavailable` happens in a browser —
 * the Settings flow substitutes the manual download confirmation there.
 */
export const snapshotForRestore = async (state: ClinicState): Promise<RestoreSnapshotResult> => {
  const backup = buildBackup(state, new Date().toISOString(), 'pre-restore')
  const result = await saveBackupFile(backup)
  if (result.status === 'saved') return { ok: true, file: result.file }
  if (result.status === 'unavailable') {
    return { ok: false, reason: 'No local sidecar is available to hold the safety copy.' }
  }
  return { ok: false, reason: result.message }
}

/**
 * True when the restore flow needs the manual download confirmation instead
 * of an automatic safety snapshot — i.e. there is no sidecar (web target).
 */
export const restoreNeedsManualSafetyCopy = async (): Promise<boolean> => !(await sidecarAvailable())

/** The sidecar's backup folder, newest first. Empty in a browser. */
export const loadBackupHistory = async (): Promise<BackupFileEntry[]> => listBackupFiles()

/** Reads one history entry back as a parsed envelope (or null). */
export const readBackupFromHistory = async (file: string): Promise<unknown | null> => fetchBackupFile(file)
