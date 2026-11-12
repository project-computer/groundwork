import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

// The mobile path reads the bundled SQLite document through this command.
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))
import { loadState, restVerifyMember, saveState } from '../persistence'
import { configureRest, resetRest } from '../rest'
import { seedState } from '../seed'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  window.localStorage.clear()
})

describe('saveState error reporting', () => {
  it('reports when the browser store refuses the write', () => {
    const onResult = vi.fn()
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded')
    })
    saveState(seedState, onResult)
    expect(onResult).toHaveBeenCalledWith('quota exceeded')
  })

  it('reports success with null', () => {
    const onResult = vi.fn()
    saveState(seedState, onResult)
    expect(onResult).toHaveBeenCalledWith(null)
  })
})

describe('loadState (web adapter)', () => {
  it('returns the stored document', async () => {
    window.localStorage.setItem('clinicbook:state:v1', JSON.stringify(seedState))
    const loaded = await loadState()
    expect(loaded?.clinic.id).toBe(seedState.clinic.id)
    expect(loaded?.patients).toHaveLength(seedState.patients.length)
  })

  it('returns null when nothing is stored', async () => {
    await expect(loadState()).resolves.toBeNull()
  })

  it('returns null for corrupt JSON', async () => {
    window.localStorage.setItem('clinicbook:state:v1', '{not json')
    await expect(loadState()).resolves.toBeNull()
  })

  it('returns null for a foreign payload', async () => {
    window.localStorage.setItem('clinicbook:state:v1', JSON.stringify({ hello: 'world' }))
    await expect(loadState()).resolves.toBeNull()
  })

  it('backfills collections a legacy document is missing', async () => {
    const legacy = {
      clinic: seedState.clinic,
      users: seedState.users,
      owners: seedState.owners,
      patients: seedState.patients,
      appointments: seedState.appointments,
      encounters: seedState.encounters,
      invoices: seedState.invoices,
    }
    window.localStorage.setItem('clinicbook:state:v1', JSON.stringify(legacy))
    const loaded = await loadState()
    expect(loaded?.vaccinations).toEqual([])
    expect(loaded?.outbox).toEqual([])
  })
})

describe('loadState (Tauri mobile)', () => {
  it('skips the sidecar probe and reads the bundled Rust document', async () => {
    const platform = await import('@/lib/platform')
    vi.spyOn(platform, 'isTauri').mockReturnValue(true)
    vi.spyOn(platform, 'isMobilePlatform').mockReturnValue(true)
    const core = await import('@tauri-apps/api/core')
    const invoke = vi.mocked(core.invoke).mockResolvedValue(seedState)
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const loaded = await loadState()

    expect(loaded?.clinic.id).toBe(seedState.clinic.id)
    expect(invoke).toHaveBeenCalledWith('state_load_command')
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

// --- REST auth bridge (ADR 0024) ---------------------------------------------

const restJson = (status: number, body: unknown) =>
  new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

describe('restVerifyMember', () => {
  beforeEach(() => {
    configureRest({ baseUrl: 'http://127.0.0.1:51731', secret: 'launch-secret' })
    window.sessionStorage.clear()
  })
  afterEach(() => {
    resetRest()
    vi.unstubAllGlobals()
  })

  it('ok: directory hit plus accepted credentials dispatches the caller', async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(
        restJson(200, { users: [{ id: 'u-pim', username: 'pim', name: 'Pim', active: true }] }),
      )
      .mockResolvedValueOnce(restJson(200, { token: 'tok-1', user: {}, clinic: {} }))
    vi.stubGlobal('fetch', fetchSpy)
    await expect(restVerifyMember('u-pim', '1234')).resolves.toBe('ok')
    expect(fetchSpy.mock.calls[1][1]?.headers).toMatchObject({
      'X-VetCare-Loopback-Secret': 'launch-secret',
      'Content-Type': 'application/json',
    })
    expect(JSON.parse(String(fetchSpy.mock.calls[1][1]?.body))).toEqual({ username: 'pim', pin: '1234' })
  })

  it('denied: a directory hit with wrong credentials is authoritative', async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(
        restJson(200, { users: [{ id: 'u-pim', username: 'pim', name: 'Pim', active: true }] }),
      )
      .mockResolvedValueOnce(restJson(401, { error: { code: 'invalid_credentials', message: 'username or PIN is incorrect' } }))
    vi.stubGlobal('fetch', fetchSpy)
    await expect(restVerifyMember('u-pim', '9999')).resolves.toBe('denied')
  })

  it('fallback: a document-only member never reaches REST login', async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(restJson(200, { users: [{ id: 'u-somchai', username: 'somchai', name: 'Somchai', active: true }] }))
    vi.stubGlobal('fetch', fetchSpy)
    await expect(restVerifyMember('u-pim', '1234')).resolves.toBe('fallback')
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('fallback: an unreachable backend degrades to the document path', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    }))
    await expect(restVerifyMember('u-pim', '1234')).resolves.toBe('fallback')
  })

  it('ignores inactive directory entries', async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(
        restJson(200, { users: [{ id: 'u-pim', username: 'pim', name: 'Pim', active: false }] }),
      )
    vi.stubGlobal('fetch', fetchSpy)
    await expect(restVerifyMember('u-pim', '1234')).resolves.toBe('fallback')
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })
})
