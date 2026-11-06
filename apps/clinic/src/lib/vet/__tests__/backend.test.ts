import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchBackupFile, fetchState, listBackupFiles, pushState, runSync, saveBackupFile } from '../backend'
import { buildBackup } from '../backup'
import { seedState } from '../seed'

/**
 * Interface tests for the sidecar transport. The platform layer and the
 * network are mocked; what is under test is the contract: URL handling,
 * error mapping (503 = not configured) and the browser null path.
 */

vi.mock('@/lib/platform', () => ({ isTauri: () => false }))
vi.mock('@tauri-apps/api/core', () => ({ invoke: async () => null }))

afterEach(() => {
  vi.unstubAllGlobals()
})

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

describe('runSync (browser, no sidecar)', () => {
  it('resolves null so the demo can simulate acks', async () => {
    await expect(runSync(seedState)).resolves.toBeNull()
  })
})

describe('runSync (sidecar reachable)', () => {
  it('POSTs the document to /sync/run and returns the result', async () => {
    const calls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push(`${init?.method} ${String(input)}`)
      return jsonResponse(200, { state: seedState, ackedChangeIds: ['c1'], pushed: 1, pulled: 0, conflicts: 0, latestVersion: 2 })
    }))
    // The browser transport reaches the sidecar on a discovered base URL only;
    // force one by stubbing isTauri through a reachable fetch on any URL.
    const result = await runSyncAgainstStubbedBase()
    expect(result).toMatchObject({ pushed: 1, ackedChangeIds: ['c1'] })
    expect(calls.some((c) => c.startsWith('POST ') && c.endsWith('/sync/run'))).toBe(true)
  })

  it('maps a 503 to a not-configured error with the sidecar message', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(503, 'cloud not configured')))
    await expect(runSyncAgainstStubbedBase()).rejects.toThrow('cloud not configured')
  })
})

describe('fetchState / pushState', () => {
  it('returns the state field from /state', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, { state: seedState })))
    await expect(fetchStateViaStubbedBase()).resolves.toMatchObject({ clinic: { id: 'clinic-01' } })
  })

  it('sends the per-launch secret header on every request (ADR 0020)', async () => {
    const headers: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      headers.push(String(new Headers(init?.headers).get('X-VetCare-Loopback-Secret')))
      return jsonResponse(200, { state: seedState })
    }))
    await fetchStateViaStubbedBase()
    expect(headers).toEqual(['launch-secret'])
  })

  it('pushState reports false when no sidecar is reachable', async () => {
    await expect(pushState(seedState)).resolves.toBe(false)
  })
})

describe('backup files (ADR 0021)', () => {
  // The transport caches its discovery promise per module instance; these
  // tests each need a fresh discovery, so they reset modules and import a
  // private copy of the transport.
  const fresh = async () => {
    vi.resetModules()
    return import('../backend')
  }

  it('treats a missing secret as an unavailable sidecar', async () => {
    vi.stubGlobal('fetch', vi.fn())
    const backend = await fresh()
    const result = await withDiscovery(
      { url: 'http://127.0.0.1:8913', secret: null },
      () => backend.saveBackupFile(buildBackup(seedState, '2026-11-06T09:00:00Z', 'auto')),
    )
    expect(result).toEqual({ status: 'unavailable' })
  })

  it('POSTs the envelope and returns the server-derived file name', async () => {
    let seenHeader: string | null = null
    let seenPath = ''
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      seenPath = String(input)
      seenHeader = new Headers(init?.headers).get('X-VetCare-Loopback-Secret')
      return jsonResponse(200, { saved: true, file: '20261106-090000-auto.json' })
    }))
    const backend = await fresh()
    const result = await withDiscovery({ url: 'http://127.0.0.1:8913', secret: 'launch-secret' }, () =>
      backend.saveBackupFile(buildBackup(seedState, '2026-11-06T09:00:00Z', 'auto')),
    )
    expect(result).toEqual({ status: 'saved', file: '20261106-090000-auto.json' })
    expect(seenPath).toBe('http://127.0.0.1:8913/backups')
    expect(seenHeader).toBe('launch-secret')
  })

  it('maps a sidecar failure to an error result instead of throwing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(500, 'disk full')))
    const backend = await fresh()
    const result = await withDiscovery({ url: 'http://127.0.0.1:8913', secret: 'launch-secret' }, () =>
      backend.saveBackupFile(buildBackup(seedState, '2026-11-06T09:00:00Z', 'pre-restore')),
    )
    expect(result).toMatchObject({ status: 'error', message: expect.stringContaining('disk full') })
  })

  it('lists files and fetches one back, empty in a browser', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, { backups: [{ file: 'a.json', createdAt: '2026-11-06T09:00:00Z', sizeBytes: 10, trigger: 'auto' }] })))
    const backend = await fresh()
    const files = await withDiscovery({ url: 'http://127.0.0.1:8913', secret: 'launch-secret' }, () => backend.listBackupFiles())
    expect(files).toHaveLength(1)
    const payload = await withDiscovery({ url: 'http://127.0.0.1:8913', secret: 'launch-secret' }, () => backend.fetchBackupFile('a.json'))
    expect(payload).toMatchObject({ backups: [{ file: 'a.json' }] })
    // Browser: no sidecar, no history.
    expect(await listBackupFiles()).toEqual([])
    expect(await fetchBackupFile('a.json')).toBeNull()
  })
})

/**
 * The transport discovers its base URL through the Tauri invoke; with the
 * platform mocked to the browser there is no URL. These helpers exercise the
 * request path by pointing the module's discovery at a stub URL + secret.
 */
let stubBase: string | null = null
const runSyncAgainstStubbedBase = async () => {
  stubBase = 'http://127.0.0.1:8913'
  try {
    return await withDiscovery({ url: stubBase, secret: 'launch-secret' }, () => runSync(seedState))
  } finally {
    stubBase = null
  }
}
const fetchStateViaStubbedBase = async () => {
  stubBase = 'http://127.0.0.1:8913'
  try {
    return await withDiscovery({ url: stubBase, secret: 'launch-secret' }, () => fetchState())
  } finally {
    stubBase = null
  }
}
const withDiscovery = async <T>(
  connection: { url: string; secret: string | null },
  fn: () => Promise<T>,
): Promise<T> => {
  const platform = await import('@/lib/platform')
  const spy = vi.spyOn(platform, 'isTauri').mockReturnValue(true)
  // The module caches its discovery promise; inject a resolved URL + secret
  // once — backend_url and backend_secret are both answered by the shell.
  const core = await import('@tauri-apps/api/core')
  const invokeSpy = vi.spyOn(core, 'invoke').mockImplementation(async (command: string) =>
    command === 'backend_secret' ? connection.secret : connection.url,
  )
  try {
    return await fn()
  } finally {
    spy.mockRestore()
    invokeSpy.mockRestore()
  }
}
