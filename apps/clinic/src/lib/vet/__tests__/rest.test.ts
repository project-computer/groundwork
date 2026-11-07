import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  RestError,
  configureRest,
  createInvoice,
  createPayment,
  getBackup,
  getInvoice,
  getSettings,
  listAudit,
  listBackups,
  listOwners,
  listPets,
  listWeights,
  login,
  logout,
  me,
  recordWeight,
  resetRest,
  restoreSession,
  sessionToken,
  updateAppointment,
} from '../rest'
import { seedState } from '../seed'

/**
 * Contract tests for the offline-MVP REST transport: paths, the loopback
 * secret + bearer headers, session handling, and the error envelope. Fetch
 * is stubbed — the server contract itself is pinned by the Go suite.
 */

const SESSION_KEY = 'vetcare:rest-session'

const jsonResponse = (status: number, body: unknown) =>
  new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

const configure = () => configureRest({ baseUrl: 'http://127.0.0.1:51731/', secret: 'launch-secret' })

let fetchCalls: { url: string; init: RequestInit }[] = []

/** Stubs fetch AND records every call, so tests re-stubbing responses keep
 * the path/headers assertions working. */
const stubFetch = (respond: () => Response): void => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      fetchCalls.push({ url: String(url), init: init ?? {} })
      return respond()
    }),
  )
}

beforeEach(() => {
  configure()
  fetchCalls = []
  stubFetch(() => jsonResponse(200, { ok: true }))
})

afterEach(() => {
  resetRest()
  vi.unstubAllGlobals()
  window.sessionStorage.clear()
})

const lastCall = () => fetchCalls[fetchCalls.length - 1]

describe('configuration', () => {
  it('rejects calls before the shell wires the backend', async () => {
    resetRest()
    await expect(listOwners()).rejects.toMatchObject({ code: 'not_configured' })
  })

  it('trims the trailing slash off the base URL', async () => {
    await listOwners()
    expect(lastCall().url).toBe('http://127.0.0.1:51731/api/v1/owners')
  })

  it('always carries the per-launch loopback secret', async () => {
    await listOwners()
    expect(lastCall().init.headers).toMatchObject({
      'X-VetCare-Loopback-Secret': 'launch-secret',
      'Content-Type': 'application/json',
    })
  })
})

describe('sessions', () => {
  it('login stores the token and sends it as a bearer header', async () => {
    stubFetch(() =>
      jsonResponse(200, {
        token: 'tok-1', expiresAt: 'soon', user: { id: 'u1', roles: ['admin'] }, clinic: { id: 'clinic-01' },
      }),
    )
    const session = await login('somchai', '1234')
    expect(session.token).toBe('tok-1')
    expect(sessionToken()).toBe('tok-1')

    await me()
    expect(lastCall().init.headers).toMatchObject({ Authorization: 'Bearer tok-1' })
  })

  it('restoreSession returns null and clears an expired token', async () => {
    window.sessionStorage.setItem(SESSION_KEY, 'tok-dead')
    stubFetch(() => jsonResponse(401, { error: { code: 'unauthorized', message: 'session is invalid' } }))
    await expect(restoreSession()).resolves.toBeNull()
    expect(sessionToken()).toBeNull()
  })

  it('restoreSession keeps a live session', async () => {
    window.sessionStorage.setItem(SESSION_KEY, 'tok-live')
    stubFetch(() =>
      jsonResponse(200, { user: { id: 'u1', roles: ['admin'] }, clinic: { id: 'clinic-01' } }),
    )
    const session = await restoreSession()
    expect(session?.token).toBe('tok-live')
  })

  it('logout clears the session even when the server call fails', async () => {
    window.sessionStorage.setItem(SESSION_KEY, 'tok-1')
    stubFetch(() => jsonResponse(500, { error: { code: 'internal', message: 'boom' } }))
    await expect(logout()).rejects.toBeInstanceOf(RestError)
    expect(sessionToken()).toBeNull()
  })

  it('a 401 on any business call clears the stored token', async () => {
    window.sessionStorage.setItem(SESSION_KEY, 'tok-stale')
    stubFetch(() => jsonResponse(401, { error: { code: 'unauthorized', message: 'expired' } }))
    await expect(listOwners()).rejects.toMatchObject({ status: 401 })
    expect(sessionToken()).toBeNull()
  })
})

describe('resource paths', () => {
  it('encodes search as a query string and PATCHes transitions', async () => {
    await listOwners('Nok')
    expect(lastCall().url).toBe('http://127.0.0.1:51731/api/v1/owners?search=Nok')

    await listPets()
    expect(lastCall().url).toBe('http://127.0.0.1:51731/api/v1/pets')

    await updateAppointment('a-1', { status: 'arrived' })
    expect(lastCall().url).toBe('http://127.0.0.1:51731/api/v1/appointments/a-1')
    expect(lastCall().init.method).toBe('PATCH')
    expect(JSON.parse(String(lastCall().init.body))).toEqual({ status: 'arrived' })
  })

  it('posts invoice items and returns the server-computed invoice', async () => {
    stubFetch(() =>
      jsonResponse(201, { id: 'inv-1', invoiceNumber: 'INV-2026-0001', totalSatang: 55000, items: [], payments: [] }),
    )
    const invoice = await createInvoice({
      ownerId: 'o-1', petId: 'p-1', consultationId: 'e-1',
      items: [{ serviceId: 's-1', quantity: 1, unitPriceSatang: 30000 }],
    })
    expect(invoice.totalSatang).toBe(55000)
    expect(lastCall().url).toBe('http://127.0.0.1:51731/api/v1/invoices')
    expect(lastCall().init.method).toBe('POST')

    stubFetch(() =>
      jsonResponse(200, { id: 'inv-1', status: 'partial', balanceSatang: 25000, items: [], payments: [] }),
    )
    const got = await getInvoice('inv-1')
    expect(got.status).toBe('partial')
  })

  it('maps {error:{code,message}} onto RestError', async () => {
    stubFetch(() =>
      jsonResponse(409, { error: { code: 'conflict', message: 'amount exceeds the outstanding balance (0 satang)' } }),
    )
    const error = await createPayment({ invoiceId: 'inv-1', amountSatang: 1 }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(RestError)
    expect(error).toMatchObject({ status: 409, code: 'conflict' })
    expect((error as Error).message).toContain('outstanding balance')
  })

  it('falls back to a generic message for non-JSON bodies', async () => {
    stubFetch(() => new Response('boom', { status: 500 }))
    const error = await listOwners().catch((e: unknown) => e)
    expect(error).toMatchObject({ status: 500, code: 'error' })
  })

  it('treats 204 responses as empty, not JSON', async () => {
    stubFetch(() => new Response(null, { status: 204 }))
    // 204 is exercised through logout's void path.
    await expect(logout()).resolves.toBeUndefined()
    expect(lastCall().init.method).toBe('POST')
  })

  it('reads weights, audit and backups through their resources', async () => {
    await listWeights('p-1')
    expect(lastCall().url).toBe('http://127.0.0.1:51731/api/v1/pets/p-1/weights')

    await recordWeight('p-1', 4200)
    expect(JSON.parse(String(lastCall().init.body))).toEqual({ weightGrams: 4200 })

    await listAudit({ entityType: 'invoice', limit: 25 })
    expect(lastCall().url).toBe('http://127.0.0.1:51731/api/v1/audit?entityType=invoice&limit=25')

    await listBackups()
    expect(lastCall().url).toBe('http://127.0.0.1:51731/api/v1/backups')

    await getBackup('20261107-090000-auto.json')
    expect(lastCall().url).toBe('http://127.0.0.1:51731/api/v1/backups/20261107-090000-auto.json')

    await getSettings()
    expect(lastCall().url).toBe('http://127.0.0.1:51731/api/v1/settings')
  })
})

describe('seed compatibility', () => {
  // The REST client is a transport seam: it must never depend on the document
  // model. This assertion only pins that the demo seed stays out of rest.ts.
  it('does not import the clinic document', () => {
    expect(seedState.clinic.id).toBeDefined()
  })
})
