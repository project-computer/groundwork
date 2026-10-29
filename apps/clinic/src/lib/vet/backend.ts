import { invoke } from '@tauri-apps/api/core'
import { isTauri } from '@/platform'
import type { ClinicState } from './types'

/**
 * Transport to the Go sidecar (desktop/) that owns local SQLite and cloud
 * sync. Resolves to null when running in a browser or before the sidecar has
 * announced its loopback port.
 */

let resolved: Promise<string | null> | null = null

const discover = async (): Promise<string | null> => {
  // Discovery polls the sidecar until it answers; retries are inherently
  // sequential and must not run in parallel.
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      // oxlint-disable-next-line no-await-in-loop
      const url = await invoke<string | null>('backend_url')
      if (url) return url.replace(/\/$/, '')
    } catch {
      return null
    }
    // oxlint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  return null
}

const backendUrl = (): Promise<string | null> => {
  if (!isTauri()) return Promise.resolve(null)
  if (!resolved) resolved = discover()
  return resolved
}

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

const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const base = await backendUrl()
  if (!base) throw new Error('sidecar unavailable')
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
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
  const base = await backendUrl()
  if (!base) return false
  await request('/state', { method: 'PUT', body: JSON.stringify(state) })
  return true
}

/**
 * Runs a full push+pull pass. Returns null in a browser (no sidecar) so the
 * demo can keep simulating acks. In Tauri a missing sidecar or a 503 from an
 * unconfigured cloud is an error: the outbox must stay queued.
 */
export const runSync = async (state: ClinicState): Promise<SyncRunResult | null> => {
  const base = await backendUrl()
  if (!base) {
    if (isTauri()) throw new SyncNotConfiguredError('Local sync sidecar is unavailable')
    return null
  }
  const response = await fetch(`${base}/sync/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(state),
  })
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
