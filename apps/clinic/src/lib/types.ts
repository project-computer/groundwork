export type Species = 'Dog' | 'Cat' | 'Bird' | 'Rabbit' | 'Reptile' | 'Other'

export const SPECIES: Species[] = ['Dog', 'Cat', 'Bird', 'Rabbit', 'Reptile', 'Other']

export interface Patient {
  id: string
  name: string
  species: Species
  breed: string
  sex: 'Male' | 'Female' | 'Unknown'
  birthDate: string
  weightKg: string
  ownerName: string
  ownerPhone: string
  ownerEmail: string
  allergies: string
  notes: string
  createdAt: string
  updatedAt: string
}

export type AppointmentStatus =
  | 'scheduled'
  | 'checked-in'
  | 'in-consult'
  | 'completed'
  | 'cancelled'
  | 'no-show'

export const ACTIVE_STATUSES: AppointmentStatus[] = ['scheduled', 'checked-in', 'in-consult']

export interface Appointment {
  id: string
  patientId: string
  dateTime: string
  durationMin: number
  reason: string
  vet: string
  status: AppointmentStatus
  notes: string
  checkedInAt?: string
  startedAt?: string
  completedAt?: string
  recordId?: string
  createdAt: string
  updatedAt: string
}

export type AppointmentInput = Pick<
  Appointment,
  'patientId' | 'dateTime' | 'durationMin' | 'reason' | 'vet' | 'status' | 'notes'
>

export interface Prescription {
  id: string
  drug: string
  strength: string
  dose: string
  route: string
  frequency: string
  durationDays: string
  quantity: string
  instructions: string
}

export interface ChargeLine {
  id: string
  description: string
  qty: number
  unitPrice: number
}

export interface Vitals {
  weightKg: string
  temperatureC: string
  heartRate: string
  respRate: string
}

export interface FollowUp {
  dateTime: string
  reason: string
}

export interface MedicalRecord {
  id: string
  patientId: string
  appointmentId: string | null
  vet: string
  date: string
  vitals: Vitals
  subjective: string
  objective: string
  assessment: string
  plan: string
  prescriptions: Prescription[]
  charges: ChargeLine[]
  followUp: FollowUp | null
  followUpAppointmentId: string | null
  paid: boolean
  status: 'draft' | 'final'
  createdAt: string
  updatedAt: string
}

export interface ClinicSettings {
  name: string
  address: string
  phone: string
  email: string
  license: string
  currency: string
  defaultVet: string
  slotMinutes: number
}

export interface ClinicData {
  version: 2
  patients: Patient[]
  appointments: Appointment[]
  records: MedicalRecord[]
  settings: ClinicSettings
  updatedAt: string | null
}

export type Plan = 'free' | 'pro'
