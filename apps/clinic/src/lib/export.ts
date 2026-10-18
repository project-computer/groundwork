import type { ClinicData } from './types'

export function download(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const today = () => new Date().toISOString().slice(0, 10)

export function exportJson(data: ClinicData) {
  download(`vetdesk-backup-${today()}.json`, JSON.stringify(data, null, 2), 'application/json')
}

function csvCell(value: unknown) {
  const s = String(value ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function toCsv(rows: Record<string, unknown>[]) {
  if (rows.length === 0) return ''
  const headers = Object.keys(rows[0])
  return [headers.join(','), ...rows.map((r) => headers.map((h) => csvCell(r[h])).join(','))].join('\n')
}

export function exportCsv(data: ClinicData) {
  const names = new Map(data.patients.map((p) => [p.id, p.name]))
  download(
    `vetdesk-patients-${today()}.csv`,
    toCsv(data.patients.map(({ id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...rest }) => rest)),
    'text/csv',
  )
  download(
    `vetdesk-appointments-${today()}.csv`,
    toCsv(
      data.appointments.map((a) => ({
        patient: names.get(a.patientId) ?? 'Unknown',
        dateTime: a.dateTime,
        durationMin: a.durationMin,
        reason: a.reason,
        vet: a.vet,
        status: a.status,
        notes: a.notes,
      })),
    ),
    'text/csv',
  )
  if (data.records.length > 0) {
    download(
      `vetdesk-records-${today()}.csv`,
      toCsv(
        data.records.map((r) => ({
          patient: names.get(r.patientId) ?? 'Unknown',
          date: r.date,
          vet: r.vet,
          weightKg: r.vitals.weightKg,
          temperatureC: r.vitals.temperatureC,
          assessment: r.assessment,
          plan: r.plan,
          medications: r.prescriptions.map((p) => `${p.drug} ${p.strength}`.trim()).join('; '),
          total: r.charges.reduce((sum, c) => sum + c.qty * c.unitPrice, 0).toFixed(2),
          paid: r.paid ? 'yes' : 'no',
          status: r.status,
        })),
      ),
      'text/csv',
    )
  }
}
