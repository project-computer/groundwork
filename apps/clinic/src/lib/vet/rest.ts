/**
 * Transport adapter for the offline-MVP REST backend (ADR 0023):
 * `server/cmd/vetcare`, the normalized-SQLite service the frontend cuts over
 * to feature-by-feature. Same loopback discipline as backend.ts — a
 * per-launch secret header plus bearer sessions — but a different process,
 * so the shell wires it through its own URL/secret pair (see
 * `configureRest`, called by the desktop shell wiring).
 *
 * The session token lives in sessionStorage: per-tab, never written to disk,
 * cleared when a call comes back 401 (expired or revoked server-side).
 */

import { invoke } from '@tauri-apps/api/core'
import { isTauri } from '@/lib/platform'

export interface RestConfig {
  baseUrl: string
  secret: string
}

let config: RestConfig | null = null
/** Memoized shell discovery: one `vetcare_url`/`vetcare_secret` pair per
 * launch, resolved on the first REST call. */
let discovered: Promise<boolean> | null = null

/** Wires the backend location and the per-launch secret. The desktop shell
 * normally answers discovery (see below); tests call this with a stub. */
export const configureRest = (next: RestConfig): void => {
  config = { baseUrl: next.baseUrl.replace(/\/$/, ''), secret: next.secret }
}

/** Clears the wiring (shell shutdown, tests). Any session token is dropped
 * with it. */
export const resetRest = (): void => {
  config = null
  discovered = null
  try {
    window.sessionStorage.removeItem(SESSION_KEY)
  } catch {
    // sessionStorage unavailable (tests without a DOM) — nothing to clear.
  }
}

export const restConfigured = (): boolean => config !== null

/**
 * The shell hands the webview the vetcare URL and the per-launch secret the
 * same way it does for clinic-core (backend.ts). Resolves false in a browser
 * (no shell) or when the vetcare binary was not bundled — the app then stays
 * on the document path. Memoized: one discovery per launch.
 */
const discoverRest = async (): Promise<boolean> => {
  if (!isTauri()) return false
  if (!discovered) {
    discovered = (async () => {
      try {
        const [url, secret] = (await Promise.all([
          invoke<string | null>('vetcare_url'),
          invoke<string | null>('vetcare_secret'),
        ])) as [string | null, string | null]
        if (url && secret) {
          configureRest({ baseUrl: url, secret })
          return true
        }
        return false
      } catch {
        return false
      }
    })()
  }
  return discovered
}

const SESSION_KEY = 'vetcare:rest-session'

export interface RestSession {
  token: string
  expiresAt: string
  user: RestUser
  clinic: RestClinic
}

export interface RestUser {
  id: string
  clinicId: string
  name: string
  username: string
  active: boolean
  roles: string[]
}

export interface RestClinic {
  id: string
  name: string
  address: string
  phone: string
  email: string
  currency: string
  locale: string
  timezone: string
}

/** A failed REST call: the backend's error envelope is {error:{code,message}}. */
export class RestError extends Error {
  readonly code: string
  readonly status: number

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'RestError'
    this.status = status
    this.code = code
  }
}

const readSession = (): string | null => {
  try {
    return window.sessionStorage.getItem(SESSION_KEY)
  } catch {
    return null
  }
}

const writeSession = (token: string): void => {
  try {
    window.sessionStorage.setItem(SESSION_KEY, token)
  } catch {
    // Session-only by contract; losing storage only loses the sign-in.
  }
}

const clearSession = (): void => {
  try {
    window.sessionStorage.removeItem(SESSION_KEY)
  } catch {
    // nothing to clear
  }
}

export const sessionToken = (): string | null => readSession()

const request = async <T>(method: string, path: string, payload?: unknown): Promise<T> => {
  if (!config && !(await discoverRest())) {
    throw new RestError(0, 'not_configured', 'REST backend is not configured')
  }
  // Re-read after discovery: the shell's `vetcare_url`/`vetcare_secret` pair
  // lands in `config` inside discoverRest, which the compiler cannot see.
  const active = config
  if (!active) {
    throw new RestError(0, 'not_configured', 'REST backend is not configured')
  }
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-VetCare-Loopback-Secret': active.secret,
  }
  const token = readSession()
  if (token) headers.Authorization = `Bearer ${token}`
  const response = await fetch(`${active.baseUrl}${path}`, {
    method,
    headers,
    body: payload === undefined ? undefined : JSON.stringify(payload),
  })
  if (response.status === 401 && token) {
    // The token is expired or revoked server-side; keeping it would make
    // every later call fail confusingly.
    clearSession()
  }
  if (!response.ok) {
    let code = 'error'
    let message = `REST ${method} ${path} failed (${response.status})`
    try {
      const envelope = (await response.json()) as { error?: { code?: string; message?: string } }
      if (envelope.error?.code) code = envelope.error.code
      if (envelope.error?.message) message = envelope.error.message
    } catch {
      // Non-JSON error body — keep the fallback message.
    }
    throw new RestError(response.status, code, message)
  }
  if (response.status === httpNoContent) return undefined as T
  return (await response.json()) as T
}

const httpNoContent = 204

const withQuery = (path: string, query?: Record<string, string | undefined>): string => {
  if (!query) return path
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') params.set(key, value)
  }
  const encoded = params.toString()
  return encoded === '' ? path : `${path}?${encoded}`
}

// --- auth ------------------------------------------------------------------

export const login = async (username: string, pin: string): Promise<RestSession> => {
  const session = await request<RestSession>('POST', '/api/v1/auth/login', { username, pin })
  writeSession(session.token)
  return session
}

export const logout = async (): Promise<void> => {
  try {
    await request<void>('POST', '/api/v1/auth/logout')
  } finally {
    // The local session dies even when the server call fails — logout must
    // never trap the user.
    clearSession()
  }
}

export const me = (): Promise<{ user: RestUser; clinic: RestClinic }> =>
  request('GET', '/api/v1/auth/me')

export interface RestStaff {
  id: string
  username: string
  name: string
  active: boolean
}

/** Pre-auth staff directory: maps a document member id to a REST username
 * before login (the lock screen has no token yet). Secret-gated server-side;
 * never carries PIN material. */
export const listStaff = (): Promise<{ users: RestStaff[] }> => request('GET', '/api/v1/users')

// --- staff management (issue 0019) --------------------------------------------

export const getStaff = (id: string): Promise<RestUser> => request('GET', `/api/v1/users/${id}`)

export const createStaffMember = (payload: {
  name: string
  username: string
  role: string
  active?: boolean
  pin?: string
}): Promise<RestUser> => request('POST', '/api/v1/users', payload)

export const updateStaff = (
  id: string,
  patch: { name?: string; role?: string; active?: boolean },
): Promise<RestUser> => request('PATCH', `/api/v1/users/${id}`, patch)

/** Admin-or-self PIN reset. The backend kills the member's sessions, so the
 * new PIN is the next credential. */
export const setStaffPin = (id: string, pin: string): Promise<{ reset: boolean }> =>
  request('PUT', `/api/v1/users/${id}/pin`, { pin })

/** Whether the backend still honours the stored session (shell restart, tab
 * restore). Returns false and clears the session when it does not. */
export const restoreSession = async (): Promise<RestSession | null> => {
  if (!readSession()) return null
  try {
    const current = await me()
    return { token: readSession() ?? '', expiresAt: '', user: current.user, clinic: current.clinic }
  } catch {
    return null
  }
}

// --- owners & patients -----------------------------------------------------

export interface RestOwner {
  id: string
  clinicId: string
  name: string
  phone: string
  email: string
  address: string
  secondaryContactName: string
  secondaryContactPhone: string
  notes: string
}

export interface RestPet {
  id: string
  clinicId: string
  ownerId: string
  ownerName?: string
  ownerPhone?: string
  mrn: string
  name: string
  species: string
  breed: string
  sex: string
  dateOfBirth: string
  color: string
  microchipNumber: string
  notes: string
}

export interface RestWeight {
  id: string
  petId: string
  weightGrams: number
  measuredAt: string
  recordedBy?: string
}

export const listOwners = (search?: string): Promise<{ owners: RestOwner[] }> =>
  request('GET', withQuery('/api/v1/owners', { search }))

export const createOwner = (payload: {
  id?: string
  name: string
  phone: string
  email?: string
  address?: string
  secondaryContactName?: string
  secondaryContactPhone?: string
  notes?: string
}): Promise<RestOwner> => request('POST', '/api/v1/owners', payload)

export const getOwner = (id: string): Promise<RestOwner> => request('GET', `/api/v1/owners/${id}`)

export const updateOwner = (
  id: string,
  patch: Partial<Pick<RestOwner, 'name' | 'phone' | 'email' | 'address' | 'secondaryContactName' | 'secondaryContactPhone' | 'notes'>>,
): Promise<RestOwner> => request('PATCH', `/api/v1/owners/${id}`, patch)

export const listPets = (search?: string): Promise<{ pets: RestPet[] }> =>
  request('GET', withQuery('/api/v1/pets', { search }))

export const createPet = (payload: {
  id?: string
  ownerId: string
  name: string
  species: string
  breed?: string
  sex?: string
  dateOfBirth?: string
  color?: string
  microchipNumber?: string
  notes?: string
}): Promise<RestPet> => request('POST', '/api/v1/pets', payload)

export const updatePet = (
  id: string,
  patch: Partial<Pick<RestPet, 'ownerId' | 'name' | 'species' | 'breed' | 'sex' | 'dateOfBirth' | 'color' | 'microchipNumber' | 'notes'>>,
): Promise<RestPet> => request('PATCH', `/api/v1/pets/${id}`, patch)

export const listWeights = (petId: string): Promise<{ weights: RestWeight[] }> =>
  request('GET', `/api/v1/pets/${petId}/weights`)

export const recordWeight = (petId: string, weightGrams: number, measuredAt?: string): Promise<RestWeight> =>
  request('POST', `/api/v1/pets/${petId}/weights`, { weightGrams, measuredAt })

// --- scheduling & clinical ---------------------------------------------------

export interface RestAppointment {
  id: string
  petId: string
  veterinarianId?: string
  scheduledAt: string
  durationMinutes: number
  reason: string
  status: 'scheduled' | 'arrived' | 'in_progress' | 'completed' | 'cancelled' | 'no_show'
  cancellationReason?: string
  notes: string
  checkedInAt?: string
  startedAt?: string
  completedAt?: string
}

export interface RestConsultation {
  id: string
  petId: string
  appointmentId?: string
  veterinarianId?: string
  chiefComplaint: string
  symptoms: string
  examination: string
  diagnosisNotes: string
  treatmentPlan: string
  notes: string
  weightGrams?: number
  temperatureCelsius?: number
  heartRateBpm?: number
  respiratoryRateBpm?: number
  status: 'open' | 'completed' | 'cancelled'
  startedAt: string
  completedAt?: string
  diagnoses: { id: string; description: string; notes: string }[]
  treatments: { id: string; description: string; notes: string }[]
}

export const listAppointments = (query?: {
  date?: string
  petId?: string
  status?: string
}): Promise<{ appointments: RestAppointment[] }> =>
  request('GET', withQuery('/api/v1/appointments', query))

export const createAppointment = (payload: {
  petId: string
  veterinarianId?: string
  scheduledAt: string
  durationMinutes?: number
  reason?: string
  notes?: string
  walkIn?: boolean
}): Promise<RestAppointment> => request('POST', '/api/v1/appointments', payload)

export const updateAppointment = (
  id: string,
  patch: Partial<
    Pick<RestAppointment, 'petId' | 'veterinarianId' | 'scheduledAt' | 'durationMinutes' | 'reason' | 'notes' | 'status'>
  > & { cancellationReason?: string },
): Promise<RestAppointment> => request('PATCH', `/api/v1/appointments/${id}`, patch)

export const createConsultation = (payload: {
  petId: string
  appointmentId?: string
  veterinarianId?: string
  chiefComplaint?: string
  symptoms?: string
  examination?: string
  diagnosisNotes?: string
  treatmentPlan?: string
  notes?: string
  vitals?: {
    weightGrams?: number
    temperatureCelsius?: number
    heartRateBpm?: number
    respiratoryRateBpm?: number
  }
  diagnoses?: { description: string; code?: string; notes?: string }[]
  treatments?: { description: string; notes?: string }[]
}): Promise<RestConsultation> => request('POST', '/api/v1/consultations', payload)

export const updateConsultation = (
  id: string,
  patch: Partial<
    Pick<
      RestConsultation,
      'chiefComplaint' | 'symptoms' | 'examination' | 'diagnosisNotes' | 'treatmentPlan' | 'notes' | 'status'
    >
  > & {
    vitals?: {
      weightGrams?: number
      temperatureCelsius?: number
      heartRateBpm?: number
      respiratoryRateBpm?: number
    }
    diagnoses?: { description: string; code?: string; notes?: string }[]
    treatments?: { description: string; notes?: string }[]
  },
): Promise<RestConsultation> => request('PATCH', `/api/v1/consultations/${id}`, patch)

export const listConsultations = (petId: string): Promise<{ consultations: RestConsultation[] }> =>
  request('GET', `/api/v1/pets/${petId}/consultations`)

export const createPrescription = (payload: {
  consultationId: string
  veterinarianId?: string
  instructions?: string
  items: {
    medicationId?: string
    medicationName: string
    strength?: string
    doseAmount?: string
    doseUnit?: string
    route?: string
    frequency?: string
    durationDays?: number
    quantityDispensed?: number
    instructions?: string
  }[]
}): Promise<{ id: string; items: unknown[] }> => request('POST', '/api/v1/prescriptions', payload)

export const listMedications = (search?: string): Promise<{ medications: { id: string; name: string; strength: string; form: string }[] }> =>
  request('GET', withQuery('/api/v1/medications', { search }))

// --- billing -----------------------------------------------------------------

export interface RestService {
  id: string
  name: string
  category: 'service' | 'product'
  unit: string
  unitPriceSatang: number
  isActive: boolean
}

export interface RestInvoiceItem {
  id: string
  serviceId?: string
  description: string
  quantity: number
  unitPriceSatang: number
  discountSatang: number
  lineTotalSatang: number
}

export interface RestPayment {
  id: string
  invoiceId: string
  amountSatang: number
  method: 'cash' | 'transfer' | 'other'
  reference: string
  status: 'paid' | 'refunded' | 'void'
  receivedAt: string
}

export interface RestInvoice {
  id: string
  clinicId: string
  ownerId: string
  petId?: string
  consultationId?: string
  invoiceNumber: string
  status: 'unpaid' | 'partial' | 'paid' | 'void'
  subtotalSatang: number
  discountSatang: number
  taxSatang: number
  totalSatang: number
  paidSatang: number
  balanceSatang: number
  notes: string
  issuedAt: string
  items: RestInvoiceItem[]
  payments: RestPayment[]
}

export const listServices = (search?: string, category?: string): Promise<{ services: RestService[] }> =>
  request('GET', withQuery('/api/v1/services', { search, category }))

export const createService = (payload: {
  name: string
  category?: string
  unit?: string
  unitPriceSatang: number
}): Promise<RestService> => request('POST', '/api/v1/services', payload)

export const updateService = (
  id: string,
  patch: Partial<Pick<RestService, 'name' | 'category' | 'unit' | 'unitPriceSatang' | 'isActive'>>,
): Promise<RestService> => request('PATCH', `/api/v1/services/${id}`, patch)

export const listInvoices = (query?: {
  ownerId?: string
  petId?: string
  status?: string
  from?: string
  to?: string
}): Promise<{ invoices: RestInvoice[] }> => request('GET', withQuery('/api/v1/invoices', query))

export const createInvoice = (payload: {
  ownerId: string
  petId?: string
  consultationId?: string
  discountSatang?: number
  taxSatang?: number
  notes?: string
  items: {
    serviceId?: string
    description?: string
    quantity: number
    unitPriceSatang: number
    discountSatang?: number
  }[]
}): Promise<RestInvoice> => request('POST', '/api/v1/invoices', payload)

export const getInvoice = (id: string): Promise<RestInvoice> => request('GET', `/api/v1/invoices/${id}`)

export const voidInvoice = (id: string): Promise<{ void: boolean }> =>
  request('POST', `/api/v1/invoices/${id}/void`)

export const createPayment = (payload: {
  invoiceId: string
  amountSatang: number
  method?: string
  reference?: string
}): Promise<RestPayment> => request('POST', '/api/v1/payments', payload)

export const voidPayment = (id: string): Promise<RestPayment> =>
  request('POST', `/api/v1/payments/${id}/void`)

// --- settings, audit, backups --------------------------------------------------

export const getSettings = (): Promise<{ clinic: RestClinic; settings: Record<string, string> }> =>
  request('GET', '/api/v1/settings')

export const updateSettings = (patch: {
  name?: string
  address?: string
  phone?: string
  email?: string
  currency?: string
  locale?: string
  timezone?: string
  settings?: Record<string, string>
}): Promise<{ clinic: RestClinic; settings: Record<string, string> }> =>
  request('PATCH', '/api/v1/settings', patch)

export interface RestAuditEvent {
  id: string
  actorUserId?: string
  action: string
  entityType: string
  entityId: string
  summary: string
  payload: unknown
  createdAt: string
}

export const listAudit = (query?: {
  entityType?: string
  action?: string
  limit?: number
  offset?: number
}): Promise<{ events: RestAuditEvent[] }> =>
  request(
    'GET',
    withQuery('/api/v1/audit', {
      entityType: query?.entityType,
      action: query?.action,
      limit: query?.limit === undefined ? undefined : String(query.limit),
      offset: query?.offset === undefined ? undefined : String(query.offset),
    }),
  )

export interface RestBackup {
  file: string
  createdAt: string
  sizeBytes: number
  trigger: string
}

export const saveBackup = (envelope: unknown): Promise<{ saved: boolean; file: string }> =>
  request('POST', '/api/v1/backups', envelope)

export const listBackups = (): Promise<{ backups: RestBackup[] }> => request('GET', '/api/v1/backups')

/** Fetches one envelope verbatim (Settings preview + restore path). */
export const getBackup = (file: string): Promise<unknown> => request('GET', `/api/v1/backups/${file}`)
