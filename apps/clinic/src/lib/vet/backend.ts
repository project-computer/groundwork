import { invoke } from '@tauri-apps/api/core'
import { isTauri } from '@/lib/platform'
import type { ClinicBackup } from './backup'
import type { ClinicState } from './types'

/**
 * Transport to the Go sidecar (apps/sidecar) that owns local SQLite, backup
 * files and cloud sync. Resolves to null when running in a browser or before
 * the sidecar has announced its loopback port — or when the per-launch secret
 * (ADR 0020) cannot be obtained, which is treated as the same degraded case.
 */

interface BackendConnection {
  base: string
  secret: string
}

let resolved: Promise<BackendConnection | null> | null = null

const discover = async (): Promise<BackendConnection | null> => {
  // Discovery polls the sidecar until it answers; retries are inherently
  // sequential and must not run in parallel.
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      // oxlint-disable-next-line no-await-in-loop
      const [url, secret] = (await Promise.all([
        invoke<string | null>('backend_url'),
        invoke<string | null>('backend_secret'),
      ])) as [string | null, string | null]
      if (url && secret) return { base: url.replace(/\/$/, ''), secret }
      // A URL without a secret is a shell/sidecar pairing failure: polling
      // longer cannot fix it — fail over to the Rust adapter immediately.
      if (url) return null
    } catch {
      return null
    }
    // oxlint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  return null
}

const connection = (): Promise<BackendConnection | null> => {
  if (!isTauri()) return Promise.resolve(null)
  if (!resolved) resolved = discover()
  return resolved
}

/** True when the sidecar can be reached and authenticated (ADR 0020). */
export const sidecarAvailable = async (): Promise<boolean> => (await connection()) !== null

class SyncNotConfiguredError extends Error {
  constructor(message = 'Cloud sync is not configured') {
    super(message)
    this.name = 'SyncNotConfiguredError'
  }
}

export interface SyncRunResult {
  state: ClinicState
  ackedChangeIds: string[]
  pushed: number
  pulled: number
  conflicts: number
  latestVersion: number
  lastSyncedAt?: string
}

const send = async (path: string, init?: RequestInit): Promise<Response> => {
  const conn = await connection()
  if (!conn) throw new Error('sidecar unavailable')
  return fetch(`${conn.base}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'X-VetCare-Loopback-Secret': conn.secret,
      ...init?.headers,
    },
  })
}

const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const response = await send(path, init)
  if (!response.ok) {
    const body = await response.text()
    throw new Error(`sidecar ${path} failed (${response.status}): ${body}`)
  }
  return (await response.json()) as T
}

export const fetchState = async (): Promise<unknown | null> => {
  const body = await request<{ state: unknown }>('/state')
  return body.state ?? null
}

export const pushState = async (state: ClinicState): Promise<boolean> => {
  const conn = await connection()
  if (!conn) return false
  await request('/state', { method: 'PUT', body: JSON.stringify(state) })
  return true
}

/**
 * Runs a full push+pull pass. Returns null in a browser (no sidecar) so the
 * demo can keep simulating acks. In Tauri a missing sidecar or a 503 from an
 * unconfigured cloud is an error: the outbox must stay queued.
 */
export const runSync = async (state: ClinicState): Promise<SyncRunResult | null> => {
  const conn = await connection()
  if (!conn) {
    if (isTauri()) throw new SyncNotConfiguredError('Local sync sidecar is unavailable')
    return null
  }
  const response = await send('/sync/run', { method: 'POST', body: JSON.stringify(state) })
  if (response.status === 503) {
    const body = await response.text()
    throw new SyncNotConfiguredError(body || undefined)
  }
  if (!response.ok) {
    const body = await response.text()
    throw new Error(`sync failed (${response.status}): ${body}`)
  }
  return (await response.json()) as SyncRunResult
}

// --- Backup files (ADR 0021): the sidecar owns <data dir>/backups ---

export interface BackupFileEntry {
  file: string
  createdAt: string
  sizeBytes: number
  trigger: string
}

export type BackupFileResult =
  | { status: 'saved'; file: string }
  | { status: 'unavailable' }
  | { status: 'error'; message: string }

/** Writes a backup envelope to the sidecar's rotating backup folder. */
export const saveBackupFile = async (backup: ClinicBackup): Promise<BackupFileResult> => {
  const conn = await connection()
  if (!conn) return { status: 'unavailable' }
  try {
    const body = await request<{ saved: boolean; file: string }>('/backups', {
      method: 'POST',
      body: JSON.stringify(backup),
    })
    return { status: 'saved', file: body.file }
  } catch (error) {
    return { status: 'error', message: error instanceof Error ? error.message : String(error) }
  }
}

/** Lists the sidecar's backup files, newest first. Empty in a browser. */
export const listBackupFiles = async (): Promise<BackupFileEntry[]> => {
  const conn = await connection()
  if (!conn) return []
  try {
    const body = await request<{ backups: BackupFileEntry[] }>('/backups')
    return body.backups
  } catch {
    return []
  }
}

/** Reads one backup envelope back from the sidecar's folder. */
export const fetchBackupFile = async (file: string): Promise<unknown | null> => {
  const conn = await connection()
  if (!conn) return null
  try {
    return await request<unknown>(`/backups/${encodeURIComponent(file)}`)
  } catch {
    return null
  }
}
