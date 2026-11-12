import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

// The mobile path reads the bundled SQLite document through this command.
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))
import { loadState, restSetStaffPin, restVerifyMember, saveState } from '../persistence'
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

describe('restSetStaffPin', () => {
  beforeEach(() => {
    configureRest({ baseUrl: 'http://127.0.0.1:51731', secret: 'launch-secret' })
    window.sessionStorage.clear()
  })
  afterEach(() => {
    resetRest()
    vi.unstubAllGlobals()
  })

  it('synced: mirrors to a REST-known member', async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(
        restJson(200, { users: [{ id: 'u-pim', username: 'pim', name: 'Pim', active: true }] }),
      )
      .mockResolvedValueOnce(restJson(200, { reset: true }))
    vi.stubGlobal('fetch', fetchSpy)
    await expect(restSetStaffPin('u-pim', '4321')).resolves.toBe('synced')
    expect(fetchSpy.mock.calls[1][0]).toBe('http://127.0.0.1:51731/api/v1/users/u-pim/pin')
  })

  it('skipped: a document-only member has nothing to sync', async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(restJson(200, { users: [] }))
    vi.stubGlobal('fetch', fetchSpy)
    await expect(restSetStaffPin('u-local', '4321')).resolves.toBe('skipped')
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('failed: backend errors never block the document write', async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(
        restJson(200, { users: [{ id: 'u-pim', username: 'pim', name: 'Pim', active: true }] }),
      )
      .mockResolvedValueOnce(new Response('boom', { status: 500 }))
    vi.stubGlobal('fetch', fetchSpy)
    await expect(restSetStaffPin('u-pim', '4321')).resolves.toBe('failed')
  })
})

// --- REST-first registration (ADR 0025, slice 1) -----------------------------

import { restCreateOwnerAndPatient, restCreatePatient, restEnsureOwner, toRestSex } from '../persistence'

describe('toRestSex', () => {
  it('folds neutered/spayed into the base sex like the importer', () => {
    expect(toRestSex('Male')).toBe('male')
    expect(toRestSex('Male (neutered)')).toBe('male')
    expect(toRestSex('Female (spayed)')).toBe('female')
    expect(toRestSex('Unknown')).toBe('unknown')
  })
})

const registrationFetch = () => {
  const calls: { url: string; body: unknown }[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const payload = init?.body ? JSON.parse(String(init.body)) : undefined
      calls.push({ url: String(url), body: payload })
      if (String(url).endsWith('/owners')) return restJson(201, { id: payload.id, mrn: '' })
      // Pet creation: the server allocates the MRN.
      return restJson(201, { id: payload.id, mrn: 'PT-2026-0042' })
    }),
  )
  return calls
}

describe('restCreateOwnerAndPatient', () => {
  beforeEach(() => {
    configureRest({ baseUrl: 'http://127.0.0.1:51731', secret: 'launch-secret' })
    window.sessionStorage.clear()
  })
  afterEach(() => {
    resetRest()
    vi.unstubAllGlobals()
  })

  it('mints the owner id client-side and projects the server MRN', async () => {
    const calls = registrationFetch()
    const result = await restCreateOwnerAndPatient('owner-uuid-1', {
      owner: { name: 'Nok', phone: '0812345678', email: '', address: '' },
      patient: {
        name: 'Mochi', species: 'Cat', breed: 'mix', sex: 'Female (spayed)',
        birthDate: '2021-03-01', microchip: '98511',
      },
    })
    expect(result.status).toBe('ok')
    expect(result.owner?.id).toBe('owner-uuid-1')
    expect(result.pet?.mrn).toBe('PT-2026-0042')
    expect(calls[0].body).toMatchObject({ id: 'owner-uuid-1', name: 'Nok' })
    expect(calls[1].body).toMatchObject({
      ownerId: 'owner-uuid-1', species: 'cat', sex: 'female', microchipNumber: '98511',
    })
  })

  it('degrades to a local-only commit when REST is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    }))
    const result = await restCreateOwnerAndPatient('owner-uuid-2', {
      owner: { name: 'Nok', phone: '0812345678', email: '', address: '' },
      patient: { name: 'Mochi', species: 'Dog', breed: '', sex: 'Male', birthDate: '' },
    })
    expect(result.status).toBe('local')
  })
})

describe('restEnsureOwner', () => {
  beforeEach(() => {
    configureRest({ baseUrl: 'http://127.0.0.1:51731', secret: 'launch-secret' })
    window.sessionStorage.clear()
  })
  afterEach(() => {
    resetRest()
    vi.unstubAllGlobals()
  })

  it('keeps an existing REST owner without recreating it', async () => {
    const fetchSpy = vi.fn(async () => restJson(200, { id: 'owner-1', name: 'Nok' }))
    vi.stubGlobal('fetch', fetchSpy)
    await expect(restEnsureOwner('owner-1', { name: 'Nok', phone: '', email: '', address: '' })).resolves.toBe(true)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('creates a missing owner under the document id (convergence)', async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(restJson(404, { error: { code: 'not_found', message: 'owner not found' } }))
      .mockResolvedValueOnce(restJson(201, { id: 'owner-2' }))
    vi.stubGlobal('fetch', fetchSpy)
    await expect(restEnsureOwner('owner-2', { name: 'Nok', phone: '0812345678', email: '', address: '' })).resolves.toBe(true)
    expect(JSON.parse(String(fetchSpy.mock.calls[1][1]?.body))).toMatchObject({ id: 'owner-2', name: 'Nok' })
  })

  it('reports unavailable when REST is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    }))
    await expect(restEnsureOwner('owner-3', { name: 'Nok', phone: '', email: '', address: '' })).resolves.toBe(false)
  })
})

describe('restCreatePatient', () => {
  beforeEach(() => {
    configureRest({ baseUrl: 'http://127.0.0.1:51731', secret: 'launch-secret' })
    window.sessionStorage.clear()
  })
  afterEach(() => {
    resetRest()
    vi.unstubAllGlobals()
  })

  it('projects the server MRN for the second patient', async () => {
    registrationFetch()
    const result = await restCreatePatient(
      'owner-1',
      { name: 'Tiger', species: 'Dog', breed: '', sex: 'Male', birthDate: '', microchip: undefined },
    )
    expect(result.status).toBe('ok')
    expect(result.pet?.mrn).toBe('PT-2026-0042')
  })
})
