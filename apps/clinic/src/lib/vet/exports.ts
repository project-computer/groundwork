import type { MessageDescriptor } from '@lingui/core'
import { i18n } from '@lingui/core'
import { msg } from '@lingui/core/macro'
import { sexLabel, speciesLabel, todayKey } from './format'
import { csvCell } from './report'
import type { ClinicState } from './types'

/**
 * Portable exports (BKP-06/BKP-07): the owner/patient CSV register and the
 * human-readable medical-records JSON document. Pure builders — downloads and
 * audit events live in the Settings view. Medical records deliberately avoid
 * the sync/outbox fields; only clinical and identity content ships.
 */
const label = (message: MessageDescriptor) => i18n._(message)

/** One row per patient; owners with no patients still appear once. */
export const ownersPatientsCsv = (data: ClinicState): string => {
  const head = [
    msg`Owner`,
    msg`Owner phone`,
    msg`Owner email`,
    msg`Owner address`,
    msg`Patient`,
    msg`MRN`,
    msg`Species`,
    msg`Breed`,
    msg`Sex`,
    msg`Date of birth`,
    msg`Microchip`,
    msg`Baseline weight (kg)`,
    msg`Allergies`,
    msg`Medical alerts`,
  ]
  const lines = [head.map(label).map(csvCell).join(',')]
  const empty = ['', '', '', '', '', '', '', '', '', '', '', '', '', '']
  for (const owner of data.owners) {
    const patients = data.patients.filter((p) => p.ownerId === owner.id)
    const ownerCells = [owner.name, owner.phone, owner.email, owner.address ?? '']
    if (patients.length === 0) {
      lines.push([...ownerCells, ...empty.slice(ownerCells.length)].map(csvCell).join(','))
      continue
    }
    for (const patient of patients) {
      lines.push(
        [...ownerCells, patient.name, patient.mrn, speciesLabel[patient.species], patient.breed,
          sexLabel[patient.sex], patient.birthDate, patient.microchip ?? '',
          patient.weightKg ?? '', patient.allergies.join('; '), patient.medicalAlerts.join('; ')]
          .map(csvCell).join(','),
      )
    }
  }
  return `\uFEFF${lines.join('\r\n')}`
}

/**
 * The full clinical record as machine-readable JSON. Field names mirror the
 * CONTEXT.md vocabulary (Patient, Visit, Vaccination). Shape:
 *   { format: 'vetcare-medical-records', version: 1, exportedAt, clinic,
 *     patients: [{ id, mrn, name, species, breed, sex, birthDate, microchip,
 *       allergies, medicalAlerts, owner | null,
 *       visits: [{ id, openedAt, closedAt, veterinarian, vitals, diagnoses,
 *                 prescriptions, notes }],
 *       vaccinations: [{ vaccineName, lotNumber, administeredAt, nextDueAt,
 *                        veterinarian }] }] }
 */
export const medicalRecordsExport = (
  data: ClinicState,
  exportedAt = new Date().toISOString(),
) => {
  return {
    format: 'vetcare-medical-records',
    version: 1,
    exportedAt,
    clinic: { id: data.clinic.id, name: data.clinic.name, timezone: data.clinic.timezone, currency: data.clinic.currency },
    patients: data.patients.map((patient) => ({
      id: patient.id,
      mrn: patient.mrn,
      name: patient.name,
      species: patient.species,
      breed: patient.breed,
      sex: patient.sex,
      birthDate: patient.birthDate,
      microchip: patient.microchip,
      allergies: patient.allergies,
      medicalAlerts: patient.medicalAlerts,
      owner: (() => {
        const owner = data.owners.find((o) => o.id === patient.ownerId)
        return owner ? { id: owner.id, name: owner.name, phone: owner.phone, email: owner.email } : null
      })(),
      visits: data.encounters
        .filter((e) => e.patientId === patient.id)
        .map((encounter) => ({
          id: encounter.id,
          openedAt: encounter.openedAt,
          closedAt: encounter.closedAt,
          veterinarian: data.users.find((u) => u.id === encounter.attendingId)?.name ?? encounter.attendingId,
          vitals: { ...encounter.vitals },
          diagnoses: encounter.diagnoses.map((d) => ({ description: d.description, status: d.status })),
          prescriptions: encounter.prescriptions.map((rx) => ({
            medication: rx.medication,
            dose: rx.dose,
            route: rx.route,
            frequency: rx.frequency,
            duration: rx.duration,
            quantity: rx.quantity,
          })),
          notes: encounter.notes.map((note) => ({
            authorId: note.authorId,
            at: note.createdAt,
            body: note.body,
            amends: note.amends,
            amendReason: note.amendReason,
          })),
        })),
      vaccinations: data.vaccinations
        .filter((v) => v.patientId === patient.id)
        .map((v) => ({
          id: v.id,
          vaccineName: v.vaccineName,
          lotNumber: v.lotNumber,
          administeredAt: v.administeredAt,
          nextDueAt: v.nextDueAt,
          veterinarian: data.users.find((u) => u.id === v.vetId)?.name ?? v.vetId,
        })),
    })),
  }
}

const slug = (clinicName: string) => clinicName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

/** Sortable, import-friendly file name for the medical-records export. */
export const recordsExportFileName = (clinicName: string, at = new Date()): string =>
  `vetcare-records-${slug(clinicName)}-${todayKey(at)}.json`

/** Sortable file name for the owners/patients register. */
export const registerFileName = (clinicName: string, at = new Date()): string =>
  `vetcare-register-${slug(clinicName)}-${todayKey(at)}.csv`
