import { describe, expect, it } from 'vitest'
import { medicalRecordsExport, ownersPatientsCsv, recordsExportFileName, registerFileName } from '../exports'
import { seedState } from '../seed'

describe('ownersPatientsCsv (BKP-06)', () => {
  it('writes a BOM-prefixed header with owner and patient columns', () => {
    const csv = ownersPatientsCsv(seedState)
    expect(csv.startsWith('\uFEFF')).toBe(true)
    const lines = csv.slice(1).split('\r\n')
    expect(lines[0]).toContain('"Owner"')
    expect(lines[0]).toContain('"Patient"')
    expect(lines[0]).toContain('"MRN"')
    // One row per seeded patient, owner columns denormalized.
    expect(lines.length).toBe(seedState.patients.length + 1)
  })

  it('escapes quotes and commas and lists owner details per patient', () => {
    const withTricky = {
      ...seedState,
      owners: [{ id: 'o-x', name: 'Comma, "Quoted" Owner', phone: '081 000 0000', email: 'x@example.com', version: 1 }],
      patients: [
        { ...seedState.patients[0], id: 'p-x', ownerId: 'o-x', name: 'Cat, "Quoted"' },
      ],
    }
    const csv = ownersPatientsCsv(withTricky)
    expect(csv).toContain('"Comma, ""Quoted"" Owner"')
    expect(csv).toContain('"Cat, ""Quoted"""')
  })

  it('still lists an owner who has no patients', () => {
    const withAlone = {
      ...seedState,
      owners: [
        { id: 'o-x', name: 'Solo Owner', phone: '', email: '', version: 1 },
      ],
      patients: seedState.patients.filter((p) => p.ownerId !== 'o-x'),
    }
    const csv = ownersPatientsCsv(withAlone)
    expect(csv).toContain('"Solo Owner"')
  })

  it('derives a sortable, slugged file name', () => {
    expect(registerFileName('Baan Sathorn Animal Clinic', new Date('2026-11-06T09:00:00Z'))).toBe(
      'vetcare-register-baan-sathorn-animal-clinic-2026-11-06.csv',
    )
  })
})

describe('medicalRecordsExport (BKP-07)', () => {
  it('carries clinic identity and every patient with visits, diagnoses, prescriptions and vaccinations', () => {
    const exported = medicalRecordsExport(seedState, '2026-11-06T09:00:00Z')
    expect(exported.format).toBe('vetcare-medical-records')
    expect(exported.version).toBe(1)
    expect(exported.clinic.name).toBe(seedState.clinic.name)
    expect(exported.patients).toHaveLength(seedState.patients.length)

    const tiger = exported.patients.find((p) => p.mrn === 'PT-2026-0003')
    expect(tiger?.owner?.name).toBeDefined()
    expect(tiger?.visits).toHaveLength(1)
    expect(tiger?.visits[0].diagnoses[0].description).toBe('Soft tissue strain, right stifle')
    expect(tiger?.visits[0].prescriptions[0].medication).toContain('Meloxicam')
    expect(tiger?.visits[0].vitals.weightKg).toBe('32.4')
    expect(tiger?.visits[0].veterinarian).toContain('Pim')
    // The export stays free of sync/outbox bookkeeping.
    expect(JSON.stringify(exported)).not.toContain('outbox')
    expect(JSON.stringify(exported)).not.toContain('lastSyncedAt')
  })

  it('names the file so it sorts by clinic then date', () => {
    expect(recordsExportFileName('Baan Sathorn', new Date('2026-11-06T09:00:00Z'))).toBe(
      'vetcare-records-baan-sathorn-2026-11-06.json',
    )
  })
})
