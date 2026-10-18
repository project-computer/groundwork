import { download } from './export'
import type { Appointment, ClinicSettings, Patient } from './types'

type Audience = 'owner' | 'clinic'

const pad = (n: number) => String(n).padStart(2, '0')

function utcStamp(d: Date) {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
}

function escapeText(s: string) {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}

// RFC 5545 requires content lines to be folded at 75 octets.
function fold(line: string) {
  if (line.length <= 74) return line
  const parts = [line.slice(0, 74)]
  for (let i = 74; i < line.length; i += 73) parts.push(` ${line.slice(i, i + 73)}`)
  return parts.join('\r\n')
}

export function appointmentRange(a: Appointment) {
  const start = new Date(a.dateTime)
  const end = new Date(start.getTime() + (a.durationMin || 30) * 60_000)
  return { start, end }
}

function title(a: Appointment, p: Patient | undefined, s: ClinicSettings, audience: Audience) {
  if (audience === 'owner') return `${p?.name ?? 'Pet'} — vet visit at ${s.name}`
  return `${p?.name ?? 'Patient'}${p ? ` (${p.species})` : ''} — ${a.reason}`
}

function details(a: Appointment, p: Patient | undefined, s: ClinicSettings, audience: Audience) {
  const lines = [`Reason: ${a.reason}`]
  if (a.vet) lines.push(`Veterinarian: ${a.vet}`)
  if (audience === 'clinic') {
    if (p?.ownerName) lines.push(`Owner: ${p.ownerName}${p.ownerPhone ? ` · ${p.ownerPhone}` : ''}`)
    if (p?.allergies) lines.push(`Allergies: ${p.allergies}`)
    if (a.notes) lines.push(`Notes: ${a.notes}`)
  } else {
    lines.push('Please arrive 10 minutes early.')
    if (s.phone) lines.push(`To reschedule call ${s.phone}.`)
  }
  return lines.join('\n')
}

function location(s: ClinicSettings) {
  return [s.name, s.address.replace(/\n/g, ', ')].filter(Boolean).join(', ')
}

function vevent(a: Appointment, p: Patient | undefined, s: ClinicSettings, audience: Audience) {
  const { start, end } = appointmentRange(a)
  const cancelled = a.status === 'cancelled' || a.status === 'no-show'
  const alarms =
    audience === 'owner'
      ? ['-P1D', '-PT2H']
      : ['-PT15M']
  return [
    'BEGIN:VEVENT',
    `UID:${a.id}@vetdesk.app`,
    `DTSTAMP:${utcStamp(new Date())}`,
    `DTSTART:${utcStamp(start)}`,
    `DTEND:${utcStamp(end)}`,
    `SEQUENCE:${Math.floor(new Date(a.updatedAt).getTime() / 1000)}`,
    `SUMMARY:${escapeText(title(a, p, s, audience))}`,
    `DESCRIPTION:${escapeText(details(a, p, s, audience))}`,
    `LOCATION:${escapeText(location(s))}`,
    `STATUS:${cancelled ? 'CANCELLED' : 'CONFIRMED'}`,
    ...alarms.flatMap((trigger) => [
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${escapeText(title(a, p, s, audience))}`,
      `TRIGGER:${trigger}`,
      'END:VALARM',
    ]),
    'END:VEVENT',
  ]
}

function calendar(name: string, events: string[][]) {
  return (
    [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//VetDesk//Clinic Schedule//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      `X-WR-CALNAME:${escapeText(name)}`,
      ...events.flat(),
      'END:VCALENDAR',
    ]
      .map(fold)
      .join('\r\n') + '\r\n'
  )
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'appointment'

export function downloadAppointmentIcs(a: Appointment, p: Patient | undefined, s: ClinicSettings) {
  const ics = calendar(s.name, [vevent(a, p, s, 'owner')])
  download(`${slug(p?.name ?? 'pet')}-${a.dateTime.slice(0, 10)}.ics`, ics, 'text/calendar')
}

export function downloadScheduleIcs(appointments: Appointment[], patients: Map<string, Patient>, s: ClinicSettings) {
  const ics = calendar(`${s.name} schedule`, appointments.map((a) => vevent(a, patients.get(a.patientId), s, 'clinic')))
  download(`${slug(s.name)}-schedule.ics`, ics, 'text/calendar')
}

export function googleCalendarUrl(a: Appointment, p: Patient | undefined, s: ClinicSettings) {
  const { start, end } = appointmentRange(a)
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title(a, p, s, 'owner'),
    dates: `${utcStamp(start)}/${utcStamp(end)}`,
    details: details(a, p, s, 'owner'),
    location: location(s),
  })
  return `https://calendar.google.com/calendar/render?${params}`
}

export function outlookCalendarUrl(a: Appointment, p: Patient | undefined, s: ClinicSettings) {
  const { start, end } = appointmentRange(a)
  const params = new URLSearchParams({
    path: '/calendar/action/compose',
    rru: 'addevent',
    subject: title(a, p, s, 'owner'),
    startdt: start.toISOString(),
    enddt: end.toISOString(),
    body: details(a, p, s, 'owner'),
    location: location(s),
  })
  return `https://outlook.live.com/calendar/0/deeplink/compose?${params}`
}

export function ownerEmailUrl(a: Appointment, p: Patient, s: ClinicSettings) {
  const when = new Date(a.dateTime).toLocaleString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
  const body = [
    `Hi ${p.ownerName || 'there'},`,
    '',
    `${p.name} is booked at ${s.name} on ${when}.`,
    details(a, p, s, 'owner'),
    '',
    `Add it to Google Calendar: ${googleCalendarUrl(a, p, s)}`,
    '',
    s.name,
  ].join('\n')
  const subject = `Appointment for ${p.name} — ${when}`
  return `mailto:${encodeURIComponent(p.ownerEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}
