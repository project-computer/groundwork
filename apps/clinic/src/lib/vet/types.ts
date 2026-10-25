export type Role = 'reception' | 'veterinarian' | 'admin'

export type Permission =
  | 'records.write'
  | 'appointments.write'
  | 'clinical.write'
  | 'billing.write'
  | 'inventory.write'
  | 'data.export'

export interface StaffUser {
  id: string
  name: string
  role: Role
}

export interface Owner {
  id: string
  name: string
  phone: string
  email: string
  address?: string
  version: number
}

export interface Patient {
  id: string
  ownerId: string
  name: string
  species: 'Dog' | 'Cat' | 'Rabbit' | 'Bird' | 'Other'
  breed: string
  sex: 'Male' | 'Female' | 'Male (neutered)' | 'Female (spayed)' | 'Unknown'
  birthDate: string
  lastVisit?: string
  weightUnit?: string
  version: number
}

export type AppointmentStatus = 'booked' | 'checked_in' | 'in_consult' | 'completed' | 'cancelled' | 'no_show'

export interface Appointment {
  id: string
  patientId: string
  startsAt: string
  durationMin: number
  reason: string
  vetId: string
  assignedUserId?: string
  status: AppointmentStatus
  version: number
}

export interface Vitals {
  weightKg: string
  tempC: string
  heartRate: string
  respRate: string
}

export interface ClinicalNote {
  id: string
  authorId: string
  body: string
  createdAt: string
  amends?: string
  amendReason?: string
}

export interface Diagnosis {
  id: string
  description: string
  status: 'provisional' | 'confirmed'
}

export interface Prescription {
  id: string
  productId?: string
  medication: string
  dose: string
  route: string
  frequency: string
  duration: string
  quantity: number
  prescriberId: string
}

export interface Encounter {
  id: string
  patientId: string
  appointmentId?: string
  attendingId: string
  status: 'open' | 'closed'
  openedAt: string
  closedAt?: string
  vitals: Vitals
  notes: ClinicalNote[]
  diagnoses: Diagnosis[]
  prescriptions: Prescription[]
  version: number
}

export interface Product {
  id: string
  sku: string
  name: string
  unit: string
  unitPrice: number
  reorderThreshold: number
  kind: 'medication' | 'service' | 'supply'
}

export interface StockMovement {
  id: string
  productId: string
  delta: number
  reason: 'receipt' | 'dispense' | 'adjustment'
  referenceId?: string
  createdAt: string
}

export interface InvoiceItem {
  id: string
  description: string
  quantity: number
  unitPrice: number
  productId?: string
}

export type InvoiceStatus = 'draft' | 'posted' | 'paid'

export interface Invoice {
  id: string
  number: string
  ownerId: string
  encounterId?: string
  status: InvoiceStatus
  items: InvoiceItem[]
  createdAt: string
  version: number
}

export interface Payment {
  id: string
  invoiceId: string
  amount: number
  method: 'cash' | 'card' | 'promptpay'
  receivedAt: string
}

export interface AuditEvent {
  id: string
  actorId: string
  action: string
  entityType: string
  entityId: string
  summary: string
  occurredAt: string
}

export interface SyncChange {
  changeId: string
  entityType: string
  entityId: string
  operation: 'upsert' | 'append'
  occurredAt: string
}

export interface ClinicState {
  clinic: { id: string; name: string; timezone: string; currency: string; vatRate: number }
  users: StaffUser[]
  owners: Owner[]
  patients: Patient[]
  appointments: Appointment[]
  encounters: Encounter[]
  products: Product[]
  stockMovements: StockMovement[]
  invoices: Invoice[]
  payments: Payment[]
  audit: AuditEvent[]
  outbox: SyncChange[]
  lastSyncedAt?: string
}
