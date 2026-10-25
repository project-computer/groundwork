import type { Invoice, Payment, Permission, Role, StockMovement } from './types'

/** Shared pill tone mapping for entity statuses across views. */
export function statusTone(status: string): 'ok' | 'warn' | 'bad' | 'muted' | 'info' {
  if (status === 'paid' || status === 'completed') return 'ok'
  if (status === 'draft' || status === 'booked') return 'info'
  if (status === 'cancelled' || status === 'no_show') return 'bad'
  return 'warn'
}

export function initials(name: string) {
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
export function todayKey(now = new Date()) {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'THB', currencyDisplay: 'narrowSymbol' })
const time = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: TZ })
const date = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: TZ })

export const formatMoney = (minor: number) => money.format(minor / 100)
export const formatTime = (iso: string) => time.format(new Date(iso))
export const formatDate = (iso: string) => date.format(new Date(iso))

export function ageFrom(birthDate: string, today = todayKey()) {
  const b = new Date(birthDate)
  const t = new Date(today)
  let months = (t.getFullYear() - b.getFullYear()) * 12 + (t.getMonth() - b.getMonth())
  if (t.getDate() < b.getDate()) months--
  if (months < 12) return `${months} mo`
  return `${Math.floor(months / 12)} yr`
}

export function invoiceTotals(invoice: Invoice, vatRate: number, payments: Payment[]) {
  const subtotal = invoice.items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0)
  const tax = Math.round(subtotal * vatRate)
  const total = subtotal + tax
  const paid = payments.filter((p) => p.invoiceId === invoice.id).reduce((s, p) => s + p.amount, 0)
  return { subtotal, tax, total, paid, balance: total - paid }
}

export function stockOnHand(productId: string, movements: StockMovement[]) {
  return movements.filter((m) => m.productId === productId).reduce((s, m) => s + m.delta, 0)
}

const rolePermissions: Record<Role, Permission[]> = {
  reception: ['records.write', 'appointments.write', 'billing.write'],
  veterinarian: ['records.write', 'appointments.write', 'clinical.write', 'inventory.write'],
  admin: ['records.write', 'appointments.write', 'billing.write', 'inventory.write', 'data.export'],
}

export const can = (role: Role, permission: Permission) => rolePermissions[role].includes(permission)

export function permissionsFor(role: Role): Permission[] {
  return rolePermissions[role]
}

export const roleLabel: Record<Role, string> = {
  reception: 'Reception',
  veterinarian: 'Veterinarian',
  admin: 'Clinic admin',
}
