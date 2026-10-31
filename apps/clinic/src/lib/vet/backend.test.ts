import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchState, pushState, runSync } from './backend'
import { seedState } from './seed'

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

  it('pushState reports false when no sidecar is reachable', async () => {
    await expect(pushState(seedState)).resolves.toBe(false)
  })
})

/**
 * The transport discovers its base URL through the Tauri invoke; with the
 * platform mocked to the browser there is no URL. These helpers exercise the
 * request path by pointing the module's discovery at a stub URL.
 */
let stubBase: string | null = null
const runSyncAgainstStubbedBase = async () => {
  stubBase = 'http://127.0.0.1:8913'
  try {
    return await withStubbedDiscovery(() => runSync(seedState))
  } finally {
    stubBase = null
  }
}
const fetchStateViaStubbedBase = async () => {
  stubBase = 'http://127.0.0.1:8913'
  try {
    return await withStubbedDiscovery(() => fetchState())
  } finally {
    stubBase = null
  }
}
const withStubbedDiscovery = async <T>(fn: () => Promise<T>): Promise<T> => {
  const platform = await import('@/lib/platform')
  const spy = vi.spyOn(platform, 'isTauri').mockReturnValue(true)
  // The module caches its discovery promise; inject a resolved URL once.
  const core = await import('@tauri-apps/api/core')
  const invokeSpy = vi.spyOn(core, 'invoke').mockResolvedValue(stubBase)
  try {
    return await fn()
  } finally {
    spy.mockRestore()
    invokeSpy.mockRestore()
  }
}
