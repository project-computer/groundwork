import { todayKey } from './format'
import type { ClinicState } from './types'

export const TODAY = todayKey()
const at = (time: string) => `${TODAY}T${time}:00+07:00`

export const seedState: ClinicState = {
  clinic: {
    id: 'clinic-01',
    name: 'Baan Sathorn Animal Clinic',
    timezone: 'Asia/Bangkok',
    currency: 'THB',
    vatRate: 0.07,
  },
  users: [
    { id: 'u-nok', name: 'Nok Srisuk', role: 'reception' },
    { id: 'u-pim', name: 'Dr. Pim Chaiyasit', role: 'veterinarian' },
    { id: 'u-arun', name: 'Dr. Arun Wongsa', role: 'veterinarian' },
    { id: 'u-mai', name: 'Mai Rattana', role: 'admin' },
  ],
  owners: [
    { id: 'o-1', name: 'Kanya Thongdee', phone: '081 234 5678', email: 'kanya@example.com', version: 1 },
    { id: 'o-2', name: 'Somchai Prasert', phone: '089 876 5432', email: 'somchai@example.com', version: 1 },
    { id: 'o-3', name: 'Lisa Mueller', phone: '062 555 0199', email: 'lisa.m@example.com', version: 1 },
    { id: 'o-4', name: 'Anan Kittisak', phone: '095 111 2233', email: 'anan@example.com', version: 1 },
  ],
  patients: [
    { id: 'p-1', ownerId: 'o-1', name: 'Moo Daeng', species: 'Dog', breed: 'Thai Ridgeback', sex: 'Male (neutered)', birthDate: '2021-03-12', version: 1 },
    { id: 'p-2', ownerId: 'o-1', name: 'Khao Niao', species: 'Cat', breed: 'Khao Manee', sex: 'Female (spayed)', birthDate: '2019-08-02', version: 1 },
    { id: 'p-3', ownerId: 'o-2', name: 'Tiger', species: 'Dog', breed: 'Golden Retriever', sex: 'Male', birthDate: '2017-11-20', version: 1 },
    { id: 'p-4', ownerId: 'o-3', name: 'Mochi', species: 'Rabbit', breed: 'Holland Lop', sex: 'Female', birthDate: '2023-05-14', version: 1 },
    { id: 'p-5', ownerId: 'o-4', name: 'Pla Too', species: 'Cat', breed: 'Domestic Shorthair', sex: 'Male (neutered)', birthDate: '2022-01-09', version: 1 },
  ],
  appointments: [
    { id: 'a-1', patientId: 'p-3', startsAt: at('09:00'), durationMin: 30, reason: 'Limping, right hind leg', vetId: 'u-pim', status: 'completed', version: 3 },
    { id: 'a-2', patientId: 'p-1', startsAt: at('10:00'), durationMin: 20, reason: 'Annual vaccination', vetId: 'u-pim', status: 'checked_in', version: 2 },
    { id: 'a-3', patientId: 'p-4', startsAt: at('10:30'), durationMin: 30, reason: 'Reduced appetite', vetId: 'u-arun', status: 'booked', version: 1 },
    { id: 'a-4', patientId: 'p-5', startsAt: at('13:30'), durationMin: 20, reason: 'Dental check', vetId: 'u-pim', status: 'booked', version: 1 },
    { id: 'a-5', patientId: 'p-2', startsAt: at('15:00'), durationMin: 30, reason: 'Follow-up: skin irritation', vetId: 'u-arun', status: 'booked', version: 1 },
  ],
  encounters: [
    {
      id: 'e-1',
      patientId: 'p-3',
      appointmentId: 'a-1',
      attendingId: 'u-pim',
      status: 'closed',
      openedAt: at('09:04'),
      closedAt: at('09:41'),
      vitals: { weightKg: '32.4', tempC: '38.6', heartRate: '96', respRate: '22' },
      notes: [
        {
          id: 'n-1',
          authorId: 'u-pim',
          body: 'Mild lameness RH, grade 2/5. Pain on stifle flexion, no drawer sign. Likely soft tissue strain. Rest 7 days, NSAID course.',
          createdAt: at('09:30'),
        },
      ],
      diagnoses: [{ id: 'd-1', description: 'Soft tissue strain, right stifle', status: 'provisional' }],
      prescriptions: [
        { id: 'rx-1', productId: 'pr-1', medication: 'Meloxicam 1.5 mg/ml oral', dose: '0.1 mg/kg', route: 'PO', frequency: 'SID', duration: '7 days', quantity: 1, prescriberId: 'u-pim' },
      ],
      version: 6,
    },
  ],
  products: [
    { id: 'pr-1', sku: 'MED-MEL-15', name: 'Meloxicam 1.5 mg/ml oral 10ml', unit: 'bottle', unitPrice: 42000, reorderThreshold: 5, kind: 'medication' },
    { id: 'pr-2', sku: 'MED-AMX-250', name: 'Amoxicillin 250 mg tablet', unit: 'tablet', unitPrice: 1500, reorderThreshold: 50, kind: 'medication' },
    { id: 'pr-3', sku: 'VAC-DHPP', name: 'DHPPi vaccine', unit: 'dose', unitPrice: 55000, reorderThreshold: 10, kind: 'medication' },
    { id: 'pr-4', sku: 'VAC-RAB', name: 'Rabies vaccine', unit: 'dose', unitPrice: 35000, reorderThreshold: 10, kind: 'medication' },
    { id: 'pr-5', sku: 'SUP-BND', name: 'Cohesive bandage 5cm', unit: 'roll', unitPrice: 9000, reorderThreshold: 20, kind: 'supply' },
    { id: 'svc-1', sku: 'SVC-CONS', name: 'Consultation', unit: 'visit', unitPrice: 50000, reorderThreshold: 0, kind: 'service' },
    { id: 'svc-2', sku: 'SVC-VACC', name: 'Vaccination administration', unit: 'visit', unitPrice: 20000, reorderThreshold: 0, kind: 'service' },
  ],
  stockMovements: [
    { id: 'sm-1', productId: 'pr-1', delta: 8, reason: 'receipt', createdAt: '2026-10-01T09:00:00+07:00' },
    { id: 'sm-2', productId: 'pr-2', delta: 300, reason: 'receipt', createdAt: '2026-10-01T09:00:00+07:00' },
    { id: 'sm-3', productId: 'pr-3', delta: 14, reason: 'receipt', createdAt: '2026-10-01T09:00:00+07:00' },
    { id: 'sm-4', productId: 'pr-4', delta: 9, reason: 'receipt', createdAt: '2026-10-01T09:00:00+07:00' },
    { id: 'sm-5', productId: 'pr-5', delta: 40, reason: 'receipt', createdAt: '2026-10-01T09:00:00+07:00' },
    { id: 'sm-6', productId: 'pr-1', delta: -1, reason: 'dispense', referenceId: 'e-1', createdAt: at('09:41') },
  ],
  invoices: [
    {
      id: 'inv-1',
      number: 'INV-2026-0142',
      ownerId: 'o-2',
      encounterId: 'e-1',
      status: 'posted',
      items: [
        { id: 'ii-1', description: 'Consultation', quantity: 1, unitPrice: 50000, productId: 'svc-1' },
        { id: 'ii-2', description: 'Meloxicam 1.5 mg/ml oral 10ml', quantity: 1, unitPrice: 42000, productId: 'pr-1' },
      ],
      createdAt: at('09:42'),
      version: 2,
    },
  ],
  payments: [],
  audit: [
    { id: 'ae-1', actorId: 'u-pim', action: 'encounter.close', entityType: 'encounter', entityId: 'e-1', summary: 'Closed consultation for Tiger', occurredAt: at('09:41') },
    { id: 'ae-2', actorId: 'u-nok', action: 'invoice.post', entityType: 'invoice', entityId: 'inv-1', summary: 'Posted INV-2026-0142', occurredAt: at('09:42') },
  ],
  outbox: [],
  lastSyncedAt: at('09:45'),
}
