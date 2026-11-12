export type Role = 'reception' | 'veterinarian' | 'pharmacist' | 'admin'

export type Permission =
  | 'records.write'
  | 'appointments.write'
  | 'clinical.write'
  | 'billing.write'
  | 'inventory.write'
  | 'staff.manage'
  | 'clinic.manage'
  | 'data.export'

/** A clinic staff account (see CONTEXT.md: User). */
export interface StaffUser {
  id: string
  name: string
  role: Role
  active: boolean
  email?: string
  phone?: string
  /** PBKDF2-SHA-256 hash of the member's PIN; absent until one is set. */
  pinHash?: string
  /** Per-member random salt used to derive pinHash. */
  pinSalt?: string
}

/** Clinic identity — the tenant record shown across the workspace. */
export interface Clinic {
  id: string
  name: string
  timezone: string
  currency: string
  vatRate: number
  address?: string
  phone?: string
  email?: string
  /** Daily automatic backup (ADR 0021). Undefined counts as on — the safe
   * default for documents written before the toggle existed. */
  autoBackup?: boolean
}

export interface Owner {
  id: string
  name: string
  phone: string
  email: string
  address?: string
  version: number
}

export const SPECIES: Patient['species'][] = ['Dog', 'Cat', 'Rabbit', 'Bird', 'Other']
export const SEXES: Patient['sex'][] = ['Male', 'Female', 'Male (neutered)', 'Female (spayed)', 'Unknown']

export interface Patient {
  id: string
  ownerId: string
  mrn: string
  name: string
  species: 'Dog' | 'Cat' | 'Rabbit' | 'Bird' | 'Other'
  breed: string
  sex: 'Male' | 'Female' | 'Male (neutered)' | 'Female (spayed)' | 'Unknown'
  birthDate: string
  weightKg?: string
  microchip?: string
  allergies: string[]
  medicalAlerts: string[]
  lastVisit?: string
  weightUnit?: string
  /** Provenance (case transfer): set when this Patient is a copy received
   * from another clinic. NULL/undefined = registered locally. */
  originClinicId?: string
  originClinicName?: string
  originPatientId?: string
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

interface ClinicalNote {
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
  /** Provenance (case transfer): origin of a copied encounter. */
  originClinicId?: string
  originEncounterId?: string
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
  /** Service-catalog toggle: undefined counts as active; deactivated
   * services stay referenced by historical invoices and are skipped when
   * choosing the closure consultation fee. */
  active?: boolean
}

export type StockReason = 'stock_in' | 'stock_out' | 'adjustment' | 'waste'

export interface StockMovement {
  id: string
  productId?: string
  lotId?: string
  delta: number
  reason: StockReason | 'receipt' | 'dispense'
  referenceId?: string
  notes?: string
  createdAt: string
}

export type InventoryCategory = 'medicine' | 'vaccine' | 'equipment' | 'supply'

/** Supplier is an external vendor an InventoryLot was purchased from. */
export interface Supplier {
  id: string
  name: string
  phone?: string
  email?: string
  address?: string
}

/** InventoryItem is a clinic's stock-keeping definition (e.g. "Amoxicillin 250mg"). */
export interface InventoryItem {
  id: string
  name: string
  category: InventoryCategory
  unit: string
  reorderLevel: number
  sellingPrice: number // minor units
  notes?: string
}

/** InventoryLot is a specific batch of an InventoryItem from a Supplier. */
export interface InventoryLot {
  id: string
  itemId: string
  lotNumber: string
  quantity: number
  expiryDate?: string // YYYY-MM-DD
  supplierId?: string
  costPerUnit?: number // minor units
  receivedDate: string // YYYY-MM-DD
}

export interface InvoiceItem {
  id: string
  description: string
  quantity: number
  unitPrice: number
  productId?: string
}

type InvoiceStatus = 'draft' | 'posted' | 'paid' | 'void'

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

type PaymentMethod = 'cash' | 'card' | 'promptpay' | 'transfer'

export interface Payment {
  id: string
  invoiceId: string
  /**
   * Positive for money received, negative for a refund. Keeping refunds as
   * negative ledger entries means every total is a plain sum over the ledger.
   */
  amount: number
  method: PaymentMethod
  receivedAt: string
  /** Absent on legacy rows, which are treated as payments. */
  kind?: 'payment' | 'refund'
  /** The payment a refund reverses. */
  refundOf?: string
  /** Free-text reason, required by the UI for refunds. */
  note?: string
}

/** Vaccination is a discrete clinical event where a vaccine was administered
 * (see CONTEXT.md). Carries vaccine name, lot, date, vet and next-due date. */
export interface Vaccination {
  id: string
  patientId: string
  encounterId?: string
  vaccineName: string
  lotNumber?: string
  administeredAt: string
  nextDueAt?: string
  vetId: string
  notes?: string
  /** Provenance (case transfer): origin of a copied vaccination. */
  originClinicId?: string
  originVaccinationId?: string
  version: number
}

/**
 * CaseBundle is the shareable payload of a CaseTransfer (see CONTEXT.md): one
 * Patient's encounters and vaccinations, carried from one clinic to another.
 * The receiving clinic creates its own copies stamped with origin fields —
 * no rows are shared. The unguessable token guards against double-import.
 */
export interface CaseBundle {
  format: 'vetcare-case-bundle'
  version: 1
  token: string
  sharedAt: string
  fromClinic: { id: string; name: string }
  owner: Owner
  patient: Patient
  encounters: Encounter[]
  vaccinations: Vaccination[]
}

export const isCaseBundle = (value: unknown): value is CaseBundle => {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return (
    v.format === 'vetcare-case-bundle' &&
    v.version === 1 &&
    typeof v.token === 'string' &&
    v.token.length > 0 &&
    !!v.fromClinic &&
    !!v.owner &&
    !!v.patient &&
    Array.isArray(v.encounters) &&
    Array.isArray(v.vaccinations)
  )
}

interface AuditEvent {
  id: string
  actorId: string
  action: string
  entityType: string
  entityId: string
  summary: string
  occurredAt: string
}

interface SyncChange {
  changeId: string
  entityType: string
  entityId: string
  operation: 'upsert' | 'append'
  occurredAt: string
}

export interface ClinicState {
  clinic: Clinic
  users: StaffUser[]
  owners: Owner[]
  patients: Patient[]
  appointments: Appointment[]
  encounters: Encounter[]
  products: Product[]
  stockMovements: StockMovement[]
  suppliers: Supplier[]
  inventoryItems: InventoryItem[]
  inventoryLots: InventoryLot[]
  invoices: Invoice[]
  payments: Payment[]
  vaccinations: Vaccination[]
  caseTransfers: CaseBundle[]
  audit: AuditEvent[]
  outbox: SyncChange[]
  lastSyncedAt?: string
}

/**
 * The collection keys every clinic document must carry. Single source of truth
 * for the shape guards; mirrored by fixtures/clinic-document.json, the Go
 * sidecar's store.Validate and the Rust validate_state — all three are pinned
 * to the fixture by tests, so a key added here without the others fails CI.
 */
export const CLINIC_STATE_COLLECTIONS = [
  'users',
  'owners',
  'patients',
  'appointments',
  'encounters',
  'products',
  'stockMovements',
  'suppliers',
  'inventoryItems',
  'inventoryLots',
  'invoices',
  'payments',
  'vaccinations',
  'caseTransfers',
  'audit',
  'outbox',
] as const
