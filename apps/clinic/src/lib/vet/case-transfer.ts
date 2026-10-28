import type { CaseBundle, ClinicState, Patient } from './types'

/** Unguessable share token (128-bit hex), the credential of a share link/file. */
export const newShareToken = (): string => {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

/** Assembles the shareable bundle for one patient: identity + full history. */
export const buildCaseBundle = (data: ClinicState, patient: Patient, token: string, sharedAt: string): CaseBundle => {
  const owner = data.owners.find((o) => o.id === patient.ownerId)
  return {
    format: 'vetcare-case-bundle',
    version: 1,
    token,
    sharedAt,
    fromClinic: { id: data.clinic.id, name: data.clinic.name },
    owner: owner ?? { id: 'unknown', name: 'Unknown', phone: '', email: '', version: 1 },
    patient,
    encounters: data.encounters.filter((e) => e.patientId === patient.id),
    vaccinations: data.vaccinations.filter((v) => v.patientId === patient.id),
  }
}

/** Downloads the bundle as a JSON file — the transport for local-first sharing. */
export const downloadCaseBundle = (bundle: CaseBundle) => {
  const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `case-${bundle.patient.mrn}-${bundle.token.slice(0, 8)}.json`
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}
