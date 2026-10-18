import type { MedicalRecord, Prescription } from '@/lib/types'

export function formatRelative(iso: string) {
  const diff = (new Date(iso).getTime() - Date.now()) / 1000
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
  const abs = Math.abs(diff)
  if (abs < 60) return 'just now'
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute')
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour')
  return rtf.format(Math.round(diff / 86400), 'day')
}

export function formatDateTime(local: string) {
  const d = new Date(local)
  if (Number.isNaN(d.getTime())) return local
  return d.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function formatLongDateTime(local: string) {
  const d = new Date(local)
  if (Number.isNaN(d.getTime())) return local
  return d.toLocaleString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function formatDate(local: string) {
  const d = new Date(local)
  if (Number.isNaN(d.getTime())) return local
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export function formatTime(local: string) {
  const d = new Date(local)
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

export function formatDayHeading(local: string) {
  const d = new Date(local)
  const today = new Date()
  const tomorrow = new Date()
  tomorrow.setDate(today.getDate() + 1)
  const label = d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
  if (isSameDay(local, today)) return `Today · ${label}`
  if (isSameDay(local, tomorrow)) return `Tomorrow · ${label}`
  return label
}

export function isSameDay(local: string, ref = new Date()) {
  const d = new Date(local)
  return (
    d.getFullYear() === ref.getFullYear() &&
    d.getMonth() === ref.getMonth() &&
    d.getDate() === ref.getDate()
  )
}

export function ageFrom(birthDate: string) {
  if (!birthDate) return ''
  const b = new Date(birthDate)
  const now = new Date()
  let months = (now.getFullYear() - b.getFullYear()) * 12 + (now.getMonth() - b.getMonth())
  if (now.getDate() < b.getDate()) months--
  if (months < 0) return ''
  if (months < 12) return `${months} mo`
  return `${Math.floor(months / 12)} yr`
}

export function formatMoney(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount)
  } catch {
    return amount.toFixed(2)
  }
}

export function recordTotal(r: Pick<MedicalRecord, 'charges'>) {
  return r.charges.reduce((sum, c) => sum + (Number(c.qty) || 0) * (Number(c.unitPrice) || 0), 0)
}

export function sigText(rx: Prescription) {
  return [
    rx.dose && `Give ${rx.dose}`,
    rx.route && `(${rx.route.toLowerCase()})`,
    rx.frequency && rx.frequency.toLowerCase(),
    rx.durationDays && `for ${rx.durationDays} days`,
  ]
    .filter(Boolean)
    .join(' ')
}
