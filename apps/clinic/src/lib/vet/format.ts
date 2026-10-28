import type { InventoryItem, InventoryLot, Invoice, Payment, Permission, Role, StockMovement, Vaccination } from './types'

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

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'THB', currencyDisplay: 'narrowSymbol' })
const time = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: TZ })
const date = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: TZ })

export const formatMoney = (minor: number) => money.format(minor / 100)
export const formatTime = (iso: string) => time.format(new Date(iso))
export const formatDate = (iso: string) => date.format(new Date(iso))

export const ageFrom = (birthDate: string, today = todayKey()) => {
  const b = new Date(birthDate)
  const t = new Date(today)
  let months = (t.getFullYear() - b.getFullYear()) * 12 + (t.getMonth() - b.getMonth())
  if (t.getDate() < b.getDate()) months--
  if (months < 12) return `${months} mo`
  return `${Math.floor(months / 12)} yr`
}

export const invoiceTotals = (invoice: Invoice, vatRate: number, payments: Payment[]) => {
  const subtotal = invoice.items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0)
  const tax = Math.round(subtotal * vatRate)
  const total = subtotal + tax
  const paid = payments.filter((p) => p.invoiceId === invoice.id).reduce((s, p) => s + p.amount, 0)
  return { subtotal, tax, total, paid, balance: total - paid }
}

export const stockOnHand = (productId: string, movements: StockMovement[]) => {
  return movements.filter((m) => m.productId === productId).reduce((s, m) => s + m.delta, 0)
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
    .sort((a, b) => a.expiryDate!.localeCompare(b.expiryDate!))
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
    .sort((a, b) => b.usedQty - a.usedQty)
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
    .sort((a, b) => a.nextDueAt!.localeCompare(b.nextDueAt!))
}

/** Latest vaccination per patient keyed by patient id — the immunization status view. */
export const latestVaccinations = (vaccinations: Vaccination[]) => {
  const latest = new Map<string, Vaccination>()
  for (const v of vaccinations) {
    const existing = latest.get(v.patientId)
    if (!existing || v.administeredAt > existing.administeredAt) latest.set(v.patientId, v)
  }
  return latest
}

const rolePermissions: Record<Role, Permission[]> = {
  reception: ['records.write', 'appointments.write', 'billing.write'],
  veterinarian: ['records.write', 'appointments.write', 'clinical.write', 'inventory.write'],
  pharmacist: ['records.write', 'billing.write', 'inventory.write'],
  admin: ['records.write', 'appointments.write', 'billing.write', 'inventory.write', 'staff.manage', 'data.export'],
}

export const can = (role: Role, permission: Permission) => rolePermissions[role].includes(permission)

export const permissionsFor = (role: Role): Permission[] => {
  return rolePermissions[role]
}

export const roleLabel: Record<Role, string> = {
  reception: 'Reception',
  veterinarian: 'Veterinarian',
  pharmacist: 'Pharmacist',
  admin: 'Clinic admin',
}
