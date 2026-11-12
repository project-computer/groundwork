import { i18n, type MessageDescriptor } from '@lingui/core'
import { msg } from '@lingui/core/macro'
import type { InventoryItem, InventoryLot, Invoice, Payment, Permission, Role, StockMovement, Vaccination } from './types'

/**
 * Turns a map of Lingui message descriptors into a map of lazily translated
 * strings. Property access always reads the active locale, so existing
 * `map[key]` call sites keep working across language switches.
 */
const translatedMap = <K extends string>(messages: Record<K, MessageDescriptor>): Record<K, string> => {
  const output = {} as Record<K, string>
  for (const key of Object.keys(messages) as K[]) {
    Object.defineProperty(output, key, {
      enumerable: true,
      get: () => i18n._(messages[key]),
    })
  }
  return output
}


/** Shared pill tone mapping for entity statuses across views. */
export const statusTone = (status: string): 'ok' | 'warn' | 'bad' | 'muted' | 'info' => {
  if (status === 'paid' || status === 'completed') return 'ok'
  if (status === 'draft' || status === 'booked') return 'info'
  if (status === 'cancelled' || status === 'no_show' || status === 'void') return 'bad'
  return 'warn'
}

export const initials = (name: string) => {
  return name
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

const TZ = 'Asia/Bangkok'

const pad = (n: number) => String(n).padStart(2, '0')

/** Local calendar date (YYYY-MM-DD) used to scope "today" views and seeds. */
export const todayKey = (now = new Date()) => {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/** Calendar date key n days from today — demo seeds keep their worklist
 * windows (expiring lots, due-soon vaccinations) stable forever. */
export const dateKeyFromToday = (days: number, now = new Date()) => {
  const date = new Date(now)
  date.setDate(date.getDate() + days)
  return todayKey(date)
}

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'THB', currencyDisplay: 'narrowSymbol' })
const time = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: TZ })
const date = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: TZ })

export const formatMoney = (minor: number) => money.format(minor / 100)
export const formatTime = (iso: string) => time.format(new Date(iso))
export const formatDate = (iso: string) => date.format(new Date(iso))

/** Human-readable file size for backup history (KB/MB). */
export const formatBytes = (bytes: number): string =>
  bytes >= 1_048_576 ? `${(bytes / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`

/**
 * Chronological comparison for ISO timestamps that may mix UTC (`Z`) and
 * offset (`+07:00`) forms. String order is wrong across offsets —
 * `09:42+07:00` (= 02:42Z) sorts after `08:56Z` — so every timestamp sort
 * must go through here, never `localeCompare`.
 */
export const compareTime = (a: string, b: string) => Date.parse(a) - Date.parse(b)

/** Shifts a YYYY-MM-DD key by whole days. */
export const shiftDays = (iso: string, days: number): string => {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Shifts a YYYY-MM-DD key by whole months, anchored to the first of the month. */
export const shiftMonth = (iso: string, delta: number): string => {
  const d = new Date(`${iso.slice(0, 7)}-01T12:00:00Z`)
  d.setUTCMonth(d.getUTCMonth() + delta)
  return d.toISOString().slice(0, 10)
}

/** 6-week Monday-start grid of YYYY-MM-DD keys covering the month of `iso`. */
export const monthGrid = (iso: string): string[] => {
  const first = `${iso.slice(0, 7)}-01`
  const weekday = new Date(`${first}T12:00:00Z`).getUTCDay()
  const monday = shiftDays(first, weekday === 0 ? -6 : 1 - weekday)
  return Array.from({ length: 42 }, (_, i) => shiftDays(monday, i))
}

export const invoiceTotals = (invoice: Invoice, vatRate: number, payments: Payment[]) => {
  const subtotal = invoice.items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0)
  const tax = Math.round(subtotal * vatRate)
  const total = subtotal + tax
  const paid = payments.filter((p) => p.invoiceId === invoice.id).reduce((s, p) => s + p.amount, 0)
  return { subtotal, tax, total, paid, balance: total - paid }
}

/** Quantity-on-hand for an item is the sum of its lots' quantities (slice 0008). */
export const itemOnHand = (itemId: string, lots: InventoryLot[]) => {
  return lots.filter((l) => l.itemId === itemId).reduce((s, l) => s + l.quantity, 0)
}

/** Lots expiring within `days` from today (slice 0009 "Expiring Soon" widget). */
export const lotsExpiringWithin = (lots: InventoryLot[], days = 30, today = todayKey()) => {
  const limit = new Date(today)
  limit.setDate(limit.getDate() + days)
  return lots
    .filter((l) => l.expiryDate && l.quantity > 0)
    .filter((l) => {
      const expiry = new Date(l.expiryDate!)
      return expiry >= new Date(today) && expiry <= limit
    })
    .toSorted((a, b) => a.expiryDate!.localeCompare(b.expiryDate!))
}

/** Top stock_out items over `days`, medicine + vaccine only (slice 0009). */
export const mostUsedItems = (
  items: InventoryItem[],
  movements: StockMovement[],
  lots: InventoryLot[],
  days = 30,
  today = new Date(),
) => {
  const since = new Date(today)
  since.setDate(since.getDate() - days)
  const lotById = new Map(lots.map((l) => [l.id, l]))
  const itemById = new Map(items.map((i) => [i.id, i]))
  const usage = new Map<string, number>()
  for (const m of movements) {
    if (m.reason !== 'stock_out' || !m.lotId) continue
    const createdAt = new Date(m.createdAt)
    if (createdAt < since) continue
    const lot = lotById.get(m.lotId)
    if (!lot) continue
    const item = itemById.get(lot.itemId)
    if (!item || (item.category !== 'medicine' && item.category !== 'vaccine')) continue
    usage.set(item.id, (usage.get(item.id) ?? 0) + Math.abs(m.delta))
  }
  return [...usage.entries()]
    .map(([id, usedQty]) => ({ item: itemById.get(id)!, usedQty }))
    .filter((r) => r.item)
    .toSorted((a, b) => b.usedQty - a.usedQty)
    .slice(0, 5)
}

/** Stock valuation: sum of lot quantity × cost per unit (minor units). */
export const stockValuation = (lots: InventoryLot[]) => {
  return lots.reduce((sum, l) => sum + l.quantity * (l.costPerUnit ?? 0), 0)
}

/** Vaccinations due within `days` (or overdue), newest due date first. */
export const vaccinationsDue = (vaccinations: Vaccination[], days = 30, today = todayKey()) => {
  const limit = new Date(today)
  limit.setDate(limit.getDate() + days)
  return vaccinations
    .filter((v) => v.nextDueAt)
    .filter((v) => {
      const due = new Date(v.nextDueAt!)
      return due <= limit
    })
    .toSorted((a, b) => a.nextDueAt!.localeCompare(b.nextDueAt!))
}

const rolePermissions: Record<Role, Permission[]> = {
  reception: ['records.write', 'appointments.write', 'billing.write'],
  veterinarian: ['records.write', 'appointments.write', 'clinical.write'],
  pharmacist: ['records.write', 'billing.write', 'inventory.write'],
  admin: ['records.write', 'appointments.write', 'billing.write', 'inventory.write', 'staff.manage', 'clinic.manage', 'data.export'],
}

export const can = (role: Role, permission: Permission) => rolePermissions[role].includes(permission)

export const permissionsFor = (role: Role): Permission[] => {
  return rolePermissions[role]
}

/** Roles in display order — shared by the staff view and workspace dialog. */
export const ROLES: Role[] = ['reception', 'veterinarian', 'pharmacist', 'admin']

/** Every permission in display order — drives the role/permission matrix. */
export const PERMISSIONS: Permission[] = [
  'records.write',
  'appointments.write',
  'clinical.write',
  'billing.write',
  'inventory.write',
  'staff.manage',
  'clinic.manage',
  'data.export',
]

export const permissionLabel = translatedMap<Permission>({
  'records.write': msg`Patients & records`,
  'appointments.write': msg`Appointments & queue`,
  'clinical.write': msg`Clinical records`,
  'billing.write': msg`Billing & payments`,
  'inventory.write': msg`Pharmacy & inventory`,
  'staff.manage': msg`Staff management`,
  'clinic.manage': msg`Clinic identity`,
  'data.export': msg`Data export`,
})

export const roleLabel = translatedMap<Role>({
  reception: msg`Reception`,
  veterinarian: msg`Veterinarian`,
  pharmacist: msg`Pharmacist`,
  admin: msg`Clinic admin`,
})

export const roleDescription = translatedMap<Role>({
  reception: msg`Front desk — registers patients, books appointments and takes payments.`,
  veterinarian: msg`Clinical care — records visits, diagnoses and prescriptions.`,
  pharmacist: msg`Dispensing — manages stock, lots and pharmacy billing.`,
  admin: msg`Full workspace control, including staff and clinic identity.`,
})

export const speciesLabel = translatedMap<'Dog' | 'Cat' | 'Rabbit' | 'Bird' | 'Other'>({
  Dog: msg`Dog`,
  Cat: msg`Cat`,
  Rabbit: msg`Rabbit`,
  Bird: msg`Bird`,
  Other: msg`Other`,
})

export const sexLabel = translatedMap<'Male' | 'Female' | 'Male (neutered)' | 'Female (spayed)' | 'Unknown'>({
  Male: msg`Male`,
  Female: msg`Female`,
  'Male (neutered)': msg`Male (neutered)`,
  'Female (spayed)': msg`Female (spayed)`,
  Unknown: msg`Unknown`,
})

const appointmentStatusMessages = {
  booked: msg`booked`,
  checked_in: msg`checked in`,
  in_consult: msg`in consultation`,
  completed: msg`completed`,
  cancelled: msg`cancelled`,
  no_show: msg`no show`,
} as const

const invoiceStatusMessages = {
  draft: msg`draft`,
  posted: msg`posted`,
  paid: msg`paid`,
  void: msg`void`,
  refunded: msg`refunded`,
} as const

const stockReasonMessages = {
  stock_in: msg`stock in`,
  stock_out: msg`stock out`,
  adjustment: msg`adjustment`,
  waste: msg`waste`,
} as const

const statusMessages: Record<string, MessageDescriptor> = {
  ...appointmentStatusMessages,
  ...invoiceStatusMessages,
  ...stockReasonMessages,
  open: msg`open`,
  closed: msg`closed`,
  archived: msg`archived`,
  active: msg`active`,
  inactive: msg`inactive`,
  provisional: msg`provisional`,
  confirmed: msg`confirmed`,
}

/** Human-readable status label; unknown statuses fall back to the raw value. */
export const statusLabel = (status: string): string => {
  const descriptor = statusMessages[status]
  return descriptor ? i18n._(descriptor) : status.replace(/_/g, ' ')
}

/** Medical record number: `PT-<year>-<sequence>`, zero-padded to 4 digits. */
export const formatMrn = (sequence: number, year = new Date().getFullYear()) => {
  return `PT-${year}-${String(sequence).padStart(4, '0')}`
}
