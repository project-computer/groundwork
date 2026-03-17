export type Pet = {
  id: string
  name: string
  species: "Dog" | "Cat" | "Bird" | "Rabbit" | "Reptile" | "Other"
  breed: string
  age: number
  weight: number
  ownerName: string
  ownerPhone: string
  ownerEmail: string
  ownerNationalId: string
  ownerNotes: string
  ownerLabel: string
  status: "Active" | "Inactive" | "Deceased"
  lastAppointment?: string
  nextAppointment?: string
  createdAt: string
  updatedAt: string
}

export type Appointment = {
  id: string
  petId: string
  petName: string
  ownerName: string
  date: string
  time: string
  type: "Checkup" | "Vaccination" | "Surgery" | "Emergency" | "Follow-up" | "Grooming"
  status: "Scheduled" | "In Progress" | "Completed" | "Cancelled"
  notes: string
  veterinarian: string
}

export type BillItem = {
  description: string
  quantity: number
  unitPrice: number
  total: number
}

export type Bill = {
  id: string
  petId: string
  petName: string
  ownerName: string
  visitId?: string
  date: string
  items: BillItem[]
  subtotal: number
  tax: number
  total: number
  status: "Pending" | "Paid" | "Overdue"
  paymentMethod?: "Cash" | "Card" | "Insurance"
}

export type Prescription = {
  id: string
  petId: string
  petName: string
  ownerName: string
  visitId?: string
  date: string
  veterinarian: string
  diagnosis: string
  medicines: PrescriptionMedicine[]
  notes: string
}

export type PrescriptionMedicine = {
  name: string
  dosage: string
  frequency: string
  duration: string
  instructions: string
}

export type OpdRecord = {
  id: string
  petId: string
  petName: string
  ownerName: string
  sourceVisitId?: string
  date: string
  time: string
  veterinarian: string
  chiefComplaint: string
  vitals: {
    temperature: string
    heartRate: string
    respiratoryRate: string
    weight: string
  }
  examination: string
  diagnosis: string
  treatment: string
  advice: string
  followUpDate: string
  status: "Ongoing" | "Resolved" | "Referred to IPD"
}

export type IpdDailyNote = {
  date: string
  time: string
  note: string
  vitals: {
    temperature: string
    heartRate: string
    respiratoryRate: string
  }
  diet: string
  medication: string
}

export type IpdRecord = {
  id: string
  petId: string
  petName: string
  ownerName: string
  sourceVisitId?: string
  admissionDate: string
  dischargeDate: string
  ward: string
  bedNumber: string
  veterinarian: string
  reasonForAdmission: string
  diagnosisOnAdmission: string
  treatmentPlan: string
  dailyNotes: IpdDailyNote[]
  dischargeSummary: string
  status: "Admitted" | "Under Observation" | "Recovering" | "Discharged"
}

export type VisitImage = {
  id: string
  url: string
  thumbnail: string
  caption: string
  uploadedAt: string
}

export type DispensedMedication = {
  name: string
  dosage: string
  frequency: string
  duration: string
  instructions: string
  envelopeLabel: boolean
}

export type Visit = {
  id: string
  petId: string
  petName: string
  ownerName: string
  appointmentId?: string
  type: "OPD" | "IPD"
  purpose: "Full" | "History Only" | "Pharmacy Only" | "Appointment Only"
  status: "Draft" | "Waiting" | "In Examination" | "Done" | "Cancelled"
  assignedVet: string
  steps: {
    basicInfo: boolean
    treatmentPlan: boolean
    lab: boolean
    dispenseMedication: boolean
    appointment: boolean
    endTreatment: boolean
  }
  chiefComplaint: string
  vitals: { temperature: string; heartRate: string; respiratoryRate: string; weight: string }
  examination: string
  differentialDiagnosis: string
  finalDiagnosis: string
  treatment: string
  advice: string
  followUpDate: string
  medications: DispensedMedication[]
  hasMedicationEnvelope: boolean
  images: VisitImage[]
  historyNotes: string
  billingStatus: "Not Sent" | "Sent to Billing" | "Billed"
  createdAt: string
  updatedAt: string
}

type ClinicState = {
  pets: Pet[]
  appointments: Appointment[]
  bills: Bill[]
  prescriptions: Prescription[]
  opdRecords: OpdRecord[]
  ipdRecords: IpdRecord[]
  visits: Visit[]
  nextPetNum: number
  nextVisitNum: number
  nextAppointmentNum: number
  nextBillNum: number
  nextPrescriptionNum: number
  nextOpdNum: number
  nextIpdNum: number
}

const STORAGE_KEY = "vetcare.clinic.state.v1"

function hasWindow() {
  return typeof window !== "undefined"
}

function todayISO() {
  const d = new Date()
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function nowTimeHHMM() {
  const d = new Date()
  const hours = String(d.getHours()).padStart(2, "0")
  const minutes = String(d.getMinutes()).padStart(2, "0")
  return `${hours}:${minutes}`
}

function clone<T>(value: T): T {
  if (value === undefined || value === null) return value
  return JSON.parse(JSON.stringify(value)) as T
}

function nextNumberFromIds(ids: string[], prefix: string) {
  const nums = ids
    .map((id) => {
      if (!id.startsWith(prefix)) return 0
      const raw = id.slice(prefix.length)
      const n = Number(raw)
      return Number.isFinite(n) ? n : 0
    })
    .filter((n) => n > 0)
  return (nums.length ? Math.max(...nums) : 0) + 1
}

function defaultState(): ClinicState {
  const pets = clone(samplePets)
  const appointments = clone(sampleAppointments)
  const bills = clone(sampleBills)
  const prescriptions = clone(samplePrescriptions)
  const opdRecords = clone(sampleOpdRecords)
  const ipdRecords = clone(sampleIpdRecords)
  const visits = clone(sampleVisits)

  return {
    pets,
    appointments,
    bills,
    prescriptions,
    opdRecords,
    ipdRecords,
    visits,
    nextPetNum: nextNumberFromIds(pets.map((p) => p.id), "C-") || 7,
    nextVisitNum: nextNumberFromIds(visits.map((v) => v.id), "VIS-") || 4,
    nextAppointmentNum: nextNumberFromIds(appointments.map((a) => a.id), "APT-") || 6,
    nextBillNum: nextNumberFromIds(bills.map((b) => b.id), "BILL-") || 5,
    nextPrescriptionNum: nextNumberFromIds(prescriptions.map((r) => r.id), "RX-") || 4,
    nextOpdNum: nextNumberFromIds(opdRecords.map((r) => r.id), "OPD-") || 5,
    nextIpdNum: nextNumberFromIds(ipdRecords.map((r) => r.id), "IPD-") || 3,
  }
}

function normalizeLoadedState(value: unknown): ClinicState | null {
  if (!value || typeof value !== "object") return null
  const candidate = value as Partial<ClinicState>

  if (
    !Array.isArray(candidate.pets) ||
    !Array.isArray(candidate.appointments) ||
    !Array.isArray(candidate.bills) ||
    !Array.isArray(candidate.prescriptions) ||
    !Array.isArray(candidate.opdRecords) ||
    !Array.isArray(candidate.ipdRecords) ||
    !Array.isArray(candidate.visits)
  ) {
    return null
  }

  const safe = defaultState()
  safe.pets = candidate.pets as Pet[]
  safe.appointments = candidate.appointments as Appointment[]
  safe.bills = candidate.bills as Bill[]
  safe.prescriptions = candidate.prescriptions as Prescription[]
  safe.opdRecords = candidate.opdRecords as OpdRecord[]
  safe.ipdRecords = candidate.ipdRecords as IpdRecord[]
  safe.visits = candidate.visits as Visit[]

  safe.nextPetNum = typeof candidate.nextPetNum === "number" ? candidate.nextPetNum : nextNumberFromIds(safe.pets.map((p) => p.id), "C-")
  safe.nextVisitNum = typeof candidate.nextVisitNum === "number" ? candidate.nextVisitNum : nextNumberFromIds(safe.visits.map((v) => v.id), "VIS-")
  safe.nextAppointmentNum = typeof candidate.nextAppointmentNum === "number" ? candidate.nextAppointmentNum : nextNumberFromIds(safe.appointments.map((a) => a.id), "APT-")
  safe.nextBillNum = typeof candidate.nextBillNum === "number" ? candidate.nextBillNum : nextNumberFromIds(safe.bills.map((b) => b.id), "BILL-")
  safe.nextPrescriptionNum = typeof candidate.nextPrescriptionNum === "number" ? candidate.nextPrescriptionNum : nextNumberFromIds(safe.prescriptions.map((r) => r.id), "RX-")
  safe.nextOpdNum = typeof candidate.nextOpdNum === "number" ? candidate.nextOpdNum : nextNumberFromIds(safe.opdRecords.map((r) => r.id), "OPD-")
  safe.nextIpdNum = typeof candidate.nextIpdNum === "number" ? candidate.nextIpdNum : nextNumberFromIds(safe.ipdRecords.map((r) => r.id), "IPD-")

  return safe
}

function loadState() {
  if (!hasWindow()) return defaultState()
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultState()
    const parsed = JSON.parse(raw) as unknown
    return normalizeLoadedState(parsed) ?? defaultState()
  } catch {
    return defaultState()
  }
}

function persistState() {
  if (!hasWindow()) return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

function commit(mutator: () => void) {
  mutator()
  persistState()
}

function buildBillTotals(items: BillItem[]) {
  const normalized = items.map((item) => ({
    ...item,
    quantity: Math.max(1, Number(item.quantity) || 1),
    unitPrice: Math.max(0, Number(item.unitPrice) || 0),
  }))
  const withTotals = normalized.map((item) => ({ ...item, total: item.quantity * item.unitPrice }))
  const subtotal = withTotals.reduce((sum, item) => sum + item.total, 0)
  const tax = Number((subtotal * 0.1).toFixed(2))
  const total = Number((subtotal + tax).toFixed(2))
  return { items: withTotals, subtotal, tax, total }
}

function findVisit(id: string) {
  return state.visits.find((v) => v.id === id)
}

function updateVisitInternal(id: string, data: Partial<Visit>) {
  state.visits = state.visits.map((v) => (v.id === id ? { ...v, ...data, updatedAt: todayISO() } : v))
}

function ensureOpdRecordFromVisit(visit: Visit) {
  if (visit.type !== "OPD") return
  const existing = state.opdRecords.find((record) => record.sourceVisitId === visit.id)
  if (existing) {
    state.opdRecords = state.opdRecords.map((record) =>
      record.id === existing.id
        ? {
            ...record,
            chiefComplaint: visit.chiefComplaint,
            vitals: visit.vitals,
            examination: visit.examination,
            diagnosis: visit.finalDiagnosis || visit.differentialDiagnosis,
            treatment: visit.treatment,
            advice: visit.advice,
            followUpDate: visit.followUpDate,
            status: visit.status === "Done" ? (visit.followUpDate ? "Ongoing" : "Resolved") : record.status,
          }
        : record,
    )
    return
  }

  const newRecord: OpdRecord = {
    id: `OPD-${String(state.nextOpdNum++).padStart(3, "0")}`,
    petId: visit.petId,
    petName: visit.petName,
    ownerName: visit.ownerName,
    sourceVisitId: visit.id,
    date: visit.updatedAt || todayISO(),
    time: nowTimeHHMM(),
    veterinarian: visit.assignedVet,
    chiefComplaint: visit.chiefComplaint,
    vitals: visit.vitals,
    examination: visit.examination,
    diagnosis: visit.finalDiagnosis || visit.differentialDiagnosis || "Pending diagnosis",
    treatment: visit.treatment,
    advice: visit.advice,
    followUpDate: visit.followUpDate,
    status: visit.followUpDate ? "Ongoing" : "Resolved",
  }
  state.opdRecords = [newRecord, ...state.opdRecords]
}

function ensureIpdRecordFromVisit(visit: Visit) {
  if (visit.type !== "IPD") return
  const existing = state.ipdRecords.find((record) => record.sourceVisitId === visit.id)
  if (existing) return

  const today = todayISO()
  const note: IpdDailyNote = {
    date: today,
    time: nowTimeHHMM(),
    note: visit.examination || visit.chiefComplaint || "IPD case started from visit workflow",
    vitals: {
      temperature: visit.vitals.temperature,
      heartRate: visit.vitals.heartRate,
      respiratoryRate: visit.vitals.respiratoryRate,
    },
    diet: "As advised",
    medication: visit.medications.map((med) => med.name).join(", ") || "As prescribed",
  }

  const newRecord: IpdRecord = {
    id: `IPD-${String(state.nextIpdNum++).padStart(3, "0")}`,
    petId: visit.petId,
    petName: visit.petName,
    ownerName: visit.ownerName,
    sourceVisitId: visit.id,
    admissionDate: today,
    dischargeDate: visit.status === "Done" ? today : "",
    ward: "General Ward",
    bedNumber: "TBD",
    veterinarian: visit.assignedVet,
    reasonForAdmission: visit.chiefComplaint || "Requires inpatient care",
    diagnosisOnAdmission: visit.finalDiagnosis || visit.differentialDiagnosis || "Pending diagnosis",
    treatmentPlan: visit.treatment || "Supportive treatment",
    dailyNotes: [note],
    dischargeSummary: visit.status === "Done" ? visit.advice || "Discharged with advice" : "",
    status: visit.status === "Done" ? "Discharged" : "Under Observation",
  }

  state.ipdRecords = [newRecord, ...state.ipdRecords]
}

function updatePetVisitDates(petId: string, lastDate: string, nextDate?: string) {
  state.pets = state.pets.map((pet) =>
    pet.id === petId
      ? {
          ...pet,
          lastAppointment: lastDate,
          nextAppointment: nextDate || pet.nextAppointment,
          updatedAt: todayISO(),
        }
      : pet,
  )
}

function monthsBack(monthCount: number) {
  const now = new Date()
  const items: { key: string; label: string }[] = []
  for (let i = monthCount - 1; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
    const label = d.toLocaleString("en-US", { month: "short" })
    items.push({ key, label })
  }
  return items
}

// Sample data
const samplePets: Pet[] = [
  {
    id: "C-1", name: "Buddy", species: "Dog", breed: "Golden Retriever", age: 5, weight: 32,
    ownerName: "John Smith", ownerPhone: "+1 (555) 123-4567", ownerEmail: "john.smith@email.com",
    ownerNationalId: "", ownerNotes: "", ownerLabel: "VIP",
    status: "Active", lastAppointment: "2026-02-24", nextAppointment: "2026-03-06",
    createdAt: "2024-01-15", updatedAt: "2026-02-24",
  },
  {
    id: "C-2", name: "Whiskers", species: "Cat", breed: "Persian", age: 3, weight: 4.5,
    ownerName: "Sarah Johnson", ownerPhone: "+1 (555) 234-5678", ownerEmail: "sarah.j@email.com",
    ownerNationalId: "", ownerNotes: "", ownerLabel: "",
    status: "Active", lastAppointment: "2026-02-24", nextAppointment: "2026-02-29",
    createdAt: "2024-02-20", updatedAt: "2026-02-24",
  },
  {
    id: "C-3", name: "Max", species: "Dog", breed: "German Shepherd", age: 7, weight: 38,
    ownerName: "Mike Davis", ownerPhone: "+1 (555) 345-6789", ownerEmail: "mike.d@email.com",
    ownerNationalId: "", ownerNotes: "Aggressive with strangers", ownerLabel: "Caution",
    status: "Active", lastAppointment: "2026-02-24",
    createdAt: "2023-11-10", updatedAt: "2026-02-24",
  },
  {
    id: "C-4", name: "Coco", species: "Bird", breed: "Cockatiel", age: 2, weight: 0.1,
    ownerName: "Emily Chen", ownerPhone: "+1 (555) 456-7890", ownerEmail: "emily.c@email.com",
    ownerNationalId: "", ownerNotes: "", ownerLabel: "",
    status: "Active", lastAppointment: "2026-02-23", nextAppointment: "2026-03-20",
    createdAt: "2024-03-05", updatedAt: "2026-02-23",
  },
  {
    id: "C-5", name: "Luna", species: "Cat", breed: "Siamese", age: 4, weight: 3.8,
    ownerName: "Alex Turner", ownerPhone: "+1 (555) 567-8901", ownerEmail: "alex.t@email.com",
    ownerNationalId: "", ownerNotes: "", ownerLabel: "",
    status: "Inactive",
    createdAt: "2023-08-22", updatedAt: "2026-02-24",
  },
  {
    id: "C-6", name: "Rocky", species: "Dog", breed: "Bulldog", age: 6, weight: 25,
    ownerName: "Lisa Brown", ownerPhone: "+1 (555) 678-9012", ownerEmail: "lisa.b@email.com",
    ownerNationalId: "", ownerNotes: "", ownerLabel: "",
    status: "Active", lastAppointment: "2026-02-24", nextAppointment: "2026-03-10",
    createdAt: "2024-04-12", updatedAt: "2026-02-24",
  },
]

const sampleAppointments: Appointment[] = [
  { id: "APT-001", petId: "C-1", petName: "Buddy", ownerName: "John Smith", date: "2026-02-24", time: "09:00", type: "Checkup", status: "Scheduled", notes: "Annual health checkup", veterinarian: "Dr. Williams" },
  { id: "APT-002", petId: "C-2", petName: "Whiskers", ownerName: "Sarah Johnson", date: "2026-02-24", time: "10:30", type: "Vaccination", status: "In Progress", notes: "FVRCP booster shot", veterinarian: "Dr. Martinez" },
  { id: "APT-003", petId: "C-3", petName: "Max", ownerName: "Mike Davis", date: "2026-02-24", time: "14:00", type: "Surgery", status: "Scheduled", notes: "Dental cleaning procedure", veterinarian: "Dr. Williams" },
  { id: "APT-004", petId: "C-6", petName: "Rocky", ownerName: "Lisa Brown", date: "2026-02-25", time: "11:00", type: "Follow-up", status: "Scheduled", notes: "Post-surgery follow up", veterinarian: "Dr. Martinez" },
  { id: "APT-005", petId: "C-4", petName: "Coco", ownerName: "Emily Chen", date: "2026-02-23", time: "15:30", type: "Checkup", status: "Completed", notes: "Feather condition check", veterinarian: "Dr. Williams" },
]

const sampleBills: Bill[] = [
  { id: "BILL-001", visitId: "VIS-001", petId: "C-1", petName: "Buddy", ownerName: "John Smith", date: "2026-02-20", items: [{ description: "General Consultation", quantity: 1, unitPrice: 75, total: 75 }, { description: "Blood Work Panel", quantity: 1, unitPrice: 120, total: 120 }, { description: "Rabies Vaccine", quantity: 1, unitPrice: 35, total: 35 }], subtotal: 230, tax: 23, total: 253, status: "Paid", paymentMethod: "Card" },
  { id: "BILL-002", petId: "C-2", petName: "Whiskers", ownerName: "Sarah Johnson", date: "2026-02-22", items: [{ description: "General Consultation", quantity: 1, unitPrice: 75, total: 75 }, { description: "FVRCP Vaccine", quantity: 1, unitPrice: 45, total: 45 }], subtotal: 120, tax: 12, total: 132, status: "Pending" },
  { id: "BILL-003", petId: "C-3", petName: "Max", ownerName: "Mike Davis", date: "2026-02-18", items: [{ description: "Dental Cleaning", quantity: 1, unitPrice: 350, total: 350 }, { description: "Anesthesia", quantity: 1, unitPrice: 150, total: 150 }, { description: "Post-Op Medication", quantity: 1, unitPrice: 60, total: 60 }], subtotal: 560, tax: 56, total: 616, status: "Overdue" },
  { id: "BILL-004", petId: "C-4", petName: "Coco", ownerName: "Emily Chen", date: "2026-02-23", items: [{ description: "Avian Consultation", quantity: 1, unitPrice: 85, total: 85 }, { description: "Feather Analysis", quantity: 1, unitPrice: 40, total: 40 }], subtotal: 125, tax: 12.5, total: 137.5, status: "Paid", paymentMethod: "Cash" },
]

const samplePrescriptions: Prescription[] = [
  { id: "RX-001", visitId: "VIS-001", petId: "C-1", petName: "Buddy", ownerName: "John Smith", date: "2026-02-20", veterinarian: "Dr. Williams", diagnosis: "Mild skin allergy with seasonal dermatitis", medicines: [{ name: "Apoquel (Oclacitinib)", dosage: "16mg", frequency: "Twice daily", duration: "14 days", instructions: "Administer with food. Do not crush or split tablets." }, { name: "Chlorhexidine Shampoo", dosage: "Apply generously", frequency: "Every 3 days", duration: "4 weeks", instructions: "Lather and leave on for 10 minutes before rinsing." }], notes: "Follow up in 2 weeks if condition does not improve." },
  { id: "RX-002", petId: "C-3", petName: "Max", ownerName: "Mike Davis", date: "2026-02-18", veterinarian: "Dr. Williams", diagnosis: "Post dental cleaning recovery - mild gingivitis", medicines: [{ name: "Amoxicillin", dosage: "500mg", frequency: "Twice daily", duration: "10 days", instructions: "Give with food. Complete full course." }, { name: "Meloxicam", dosage: "1.5mg", frequency: "Once daily", duration: "5 days", instructions: "Administer with food." }], notes: "Soft food only for the next 3 days." },
  { id: "RX-003", petId: "C-2", petName: "Whiskers", ownerName: "Sarah Johnson", date: "2026-02-22", veterinarian: "Dr. Martinez", diagnosis: "Upper respiratory infection", medicines: [{ name: "Doxycycline", dosage: "25mg", frequency: "Once daily", duration: "7 days", instructions: "Give with food." }, { name: "L-Lysine Supplement", dosage: "250mg", frequency: "Twice daily", duration: "30 days", instructions: "Can be mixed with wet food." }], notes: "Keep in warm, humid environment." },
]

const sampleOpdRecords: OpdRecord[] = [
  { id: "OPD-001", sourceVisitId: "VIS-001", petId: "C-1", petName: "Buddy", ownerName: "John Smith", date: "2026-02-20", time: "09:30", veterinarian: "Dr. Williams", chiefComplaint: "Persistent scratching on flanks and belly, hair loss in patches", vitals: { temperature: "101.5 F", heartRate: "90 bpm", respiratoryRate: "22 breaths/min", weight: "32 kg" }, examination: "Erythematous patches on ventral abdomen and medial thighs. No fleas observed.", diagnosis: "Seasonal allergic dermatitis", treatment: "Prescribed Apoquel 16mg BID for 14 days. Chlorhexidine shampoo every 3 days.", advice: "Avoid grassy areas during peak pollen hours.", followUpDate: "2026-03-06", status: "Ongoing" },
  { id: "OPD-002", petId: "C-2", petName: "Whiskers", ownerName: "Sarah Johnson", date: "2026-02-22", time: "10:00", veterinarian: "Dr. Martinez", chiefComplaint: "Sneezing, nasal discharge, decreased appetite for 3 days", vitals: { temperature: "103.2 F", heartRate: "180 bpm", respiratoryRate: "30 breaths/min", weight: "4.5 kg" }, examination: "Bilateral serous nasal discharge. Mild conjunctivitis.", diagnosis: "Upper respiratory infection (viral likely - feline herpesvirus)", treatment: "Doxycycline 25mg SID for 7 days. L-Lysine 250mg BID.", advice: "Encourage fluid intake. Warm food to enhance aroma.", followUpDate: "2026-02-29", status: "Ongoing" },
  { id: "OPD-003", petId: "C-4", petName: "Coco", ownerName: "Emily Chen", date: "2026-02-23", time: "15:30", veterinarian: "Dr. Williams", chiefComplaint: "Feather plucking on chest area", vitals: { temperature: "104.0 F", heartRate: "300 bpm", respiratoryRate: "40 breaths/min", weight: "0.1 kg" }, examination: "Bare patches on breast area. No signs of PBFD.", diagnosis: "Behavioral feather destructive disorder", treatment: "Environmental enrichment recommended. Avian-safe calming supplement.", advice: "Provide foraging toys, increase social interaction.", followUpDate: "2026-03-20", status: "Resolved" },
  { id: "OPD-004", petId: "C-6", petName: "Rocky", ownerName: "Lisa Brown", date: "2026-02-24", time: "11:00", veterinarian: "Dr. Martinez", chiefComplaint: "Limping on right front leg", vitals: { temperature: "101.8 F", heartRate: "100 bpm", respiratoryRate: "24 breaths/min", weight: "25 kg" }, examination: "Swelling and pain on palpation of right carpus.", diagnosis: "Grade II carpal sprain - right forelimb", treatment: "Meloxicam 1.5mg SID for 7 days. Cold compress for 48 hours.", advice: "Strict leash walks only, no running or jumping.", followUpDate: "2026-03-10", status: "Ongoing" },
]

const sampleIpdRecords: IpdRecord[] = [
  { id: "IPD-001", petId: "C-3", petName: "Max", ownerName: "Mike Davis", admissionDate: "2026-02-18", dischargeDate: "2026-02-20", ward: "Surgery Ward", bedNumber: "S-03", veterinarian: "Dr. Williams", reasonForAdmission: "Scheduled dental cleaning under general anesthesia", diagnosisOnAdmission: "Severe dental calculus with fractured upper premolar", treatmentPlan: "Pre-surgical blood work, dental scaling, PM4 extraction", dailyNotes: [
    { date: "2026-02-18", time: "08:00", note: "Pre-surgical blood work within normal limits. IV catheter placed.", vitals: { temperature: "101.3 F", heartRate: "85 bpm", respiratoryRate: "20 breaths/min" }, diet: "NPO", medication: "Cefazolin 22mg/kg IV" },
    { date: "2026-02-18", time: "14:00", note: "Surgery completed successfully. Patient recovering well from anesthesia.", vitals: { temperature: "100.8 F", heartRate: "92 bpm", respiratoryRate: "24 breaths/min" }, diet: "Water offered in small amounts", medication: "Meloxicam 0.2mg/kg SC" },
    { date: "2026-02-19", time: "08:00", note: "Patient bright and alert. Minor swelling at extraction site.", vitals: { temperature: "101.5 F", heartRate: "88 bpm", respiratoryRate: "22 breaths/min" }, diet: "Soft canned food - eating well", medication: "Amoxicillin 500mg PO" },
    { date: "2026-02-20", time: "09:00", note: "Swelling reduced. Cleared for discharge.", vitals: { temperature: "101.2 F", heartRate: "82 bpm", respiratoryRate: "20 breaths/min" }, diet: "Soft canned food", medication: "Amoxicillin 500mg PO (continue at home)" },
  ], dischargeSummary: "Successful dental scaling and PM4 extraction. Continue antibiotics for 10 days.", status: "Discharged" },
  { id: "IPD-002", petId: "C-1", petName: "Buddy", ownerName: "John Smith", admissionDate: "2026-02-25", dischargeDate: "", ward: "Medical Ward", bedNumber: "M-01", veterinarian: "Dr. Williams", reasonForAdmission: "Acute vomiting and diarrhea, severe dehydration", diagnosisOnAdmission: "Acute gastroenteritis with moderate dehydration", treatmentPlan: "IV fluid therapy, NPO 24h, anti-emetics, abdominal radiographs", dailyNotes: [
    { date: "2026-02-25", time: "10:00", note: "Admitted with repeated vomiting. Radiographs show no foreign body.", vitals: { temperature: "102.8 F", heartRate: "110 bpm", respiratoryRate: "28 breaths/min" }, diet: "NPO", medication: "Maropitant 1mg/kg IV, Famotidine 0.5mg/kg IV" },
    { date: "2026-02-25", time: "18:00", note: "Vomiting has stopped. Attitude more bright.", vitals: { temperature: "102.0 F", heartRate: "100 bpm", respiratoryRate: "24 breaths/min" }, diet: "NPO", medication: "Maropitant, Famotidine, IV fluids reduced" },
    { date: "2026-02-26", time: "08:00", note: "No vomiting overnight. Starting bland diet trial.", vitals: { temperature: "101.5 F", heartRate: "90 bpm", respiratoryRate: "22 breaths/min" }, diet: "Bland diet - boiled chicken and rice", medication: "Maropitant SC, Probiotics started" },
  ], dischargeSummary: "", status: "Recovering" },
]

const sampleVisits: Visit[] = [
  {
    id: "VIS-001", petId: "C-1", petName: "Buddy", ownerName: "John Smith",
    type: "OPD", purpose: "Full", status: "Done", assignedVet: "Dr. Williams",
    steps: { basicInfo: true, treatmentPlan: true, lab: true, dispenseMedication: true, appointment: true, endTreatment: true },
    chiefComplaint: "Persistent scratching on flanks and belly",
    vitals: { temperature: "101.5 F", heartRate: "90 bpm", respiratoryRate: "22 breaths/min", weight: "32 kg" },
    examination: "Erythematous patches on ventral abdomen",
    differentialDiagnosis: "Flea allergy dermatitis\nAtopic dermatitis\nFood allergy",
    finalDiagnosis: "Seasonal allergic dermatitis",
    treatment: "Apoquel 16mg BID for 14 days", advice: "Avoid grassy areas during peak pollen hours",
    followUpDate: "2026-03-06",
    medications: [{ name: "Apoquel", dosage: "16mg", frequency: "Twice daily", duration: "14 days", instructions: "Give with food", envelopeLabel: true }],
    hasMedicationEnvelope: true, images: [], historyNotes: "Previous skin issues in summer 2025",
    billingStatus: "Billed", createdAt: "2026-02-20", updatedAt: "2026-02-20",
  },
  {
    id: "VIS-002", petId: "C-2", petName: "Whiskers", ownerName: "Sarah Johnson",
    type: "OPD", purpose: "Full", status: "In Examination", assignedVet: "Dr. Martinez",
    steps: { basicInfo: true, treatmentPlan: true, lab: false, dispenseMedication: false, appointment: false, endTreatment: false },
    chiefComplaint: "Sneezing and nasal discharge for 3 days",
    vitals: { temperature: "103.2 F", heartRate: "180 bpm", respiratoryRate: "30 breaths/min", weight: "4.5 kg" },
    examination: "Bilateral serous nasal discharge. Mild conjunctivitis.",
    differentialDiagnosis: "Feline herpesvirus\nCalicivirus\nBacterial URI",
    finalDiagnosis: "", treatment: "", advice: "", followUpDate: "",
    medications: [], hasMedicationEnvelope: false, images: [], historyNotes: "",
    billingStatus: "Not Sent", createdAt: "2026-02-22", updatedAt: "2026-02-22",
  },
  {
    id: "VIS-003", petId: "C-6", petName: "Rocky", ownerName: "Lisa Brown",
    type: "OPD", purpose: "Pharmacy Only", status: "Waiting", assignedVet: "Dr. Martinez",
    steps: { basicInfo: false, treatmentPlan: false, lab: false, dispenseMedication: false, appointment: false, endTreatment: false },
    chiefComplaint: "", vitals: { temperature: "", heartRate: "", respiratoryRate: "", weight: "" },
    examination: "", differentialDiagnosis: "", finalDiagnosis: "", treatment: "", advice: "", followUpDate: "",
    medications: [{ name: "Meloxicam", dosage: "1.5mg", frequency: "Once daily", duration: "7 days", instructions: "Give with food", envelopeLabel: true }],
    hasMedicationEnvelope: true, images: [], historyNotes: "",
    billingStatus: "Not Sent", createdAt: "2026-02-24", updatedAt: "2026-02-24",
  },
]

let state = loadState()

export function getTodayISO() {
  return todayISO()
}

// Pet functions
export function getPets() { return clone(state.pets) }
export function addPet(pet: Pet) {
  commit(() => {
    state.pets = [pet, ...state.pets]
  })
}
export function updatePet(id: string, data: Partial<Pet>) {
  commit(() => {
    state.pets = state.pets.map((p) => (p.id === id ? { ...p, ...data, updatedAt: todayISO() } : p))
  })
}
export function getNextPetId(prefix = "C") {
  const id = `${prefix}-${state.nextPetNum}`
  state.nextPetNum += 1
  persistState()
  return id
}

// Appointment functions
export function getAppointments() { return clone(state.appointments) }
export function getNextAppointmentId() {
  const id = `APT-${String(state.nextAppointmentNum).padStart(3, "0")}`
  state.nextAppointmentNum += 1
  persistState()
  return id
}
export function addAppointment(apt: Appointment) {
  commit(() => {
    state.appointments = [apt, ...state.appointments]
    updatePetVisitDates(apt.petId, apt.date)
    state.pets = state.pets.map((pet) =>
      pet.id === apt.petId ? { ...pet, nextAppointment: apt.date, updatedAt: todayISO() } : pet,
    )
  })
}
export function updateAppointment(id: string, data: Partial<Appointment>) {
  commit(() => {
    state.appointments = state.appointments.map((a) => (a.id === id ? { ...a, ...data } : a))
  })
}
export function checkInAppointment(appointmentId: string, purpose: Visit["purpose"] = "Full") {
  const appointment = state.appointments.find((item) => item.id === appointmentId)
  if (!appointment) return undefined

  const existingVisit = state.visits.find((visit) => visit.appointmentId === appointmentId && visit.status !== "Cancelled")
  if (existingVisit) {
    commit(() => {
      state.appointments = state.appointments.map((item) =>
        item.id === appointmentId ? { ...item, status: "In Progress" } : item,
      )
      updateVisitInternal(existingVisit.id, { status: "Waiting" })
    })
    return getVisit(existingVisit.id)
  }

  const newVisit: Visit = {
    id: getNextVisitId(),
    appointmentId,
    petId: appointment.petId,
    petName: appointment.petName,
    ownerName: appointment.ownerName,
    type: appointment.type === "Surgery" || appointment.type === "Emergency" ? "IPD" : "OPD",
    purpose,
    status: "Waiting",
    assignedVet: appointment.veterinarian,
    steps: { basicInfo: false, treatmentPlan: false, lab: false, dispenseMedication: false, appointment: false, endTreatment: false },
    chiefComplaint: appointment.notes || appointment.type,
    vitals: { temperature: "", heartRate: "", respiratoryRate: "", weight: "" },
    examination: "",
    differentialDiagnosis: "",
    finalDiagnosis: "",
    treatment: "",
    advice: "",
    followUpDate: "",
    medications: [],
    hasMedicationEnvelope: false,
    images: [],
    historyNotes: `Checked in from appointment ${appointment.id}`,
    billingStatus: "Not Sent",
    createdAt: todayISO(),
    updatedAt: todayISO(),
  }

  commit(() => {
    state.appointments = state.appointments.map((item) =>
      item.id === appointmentId ? { ...item, status: "In Progress" } : item,
    )
    state.visits = [newVisit, ...state.visits]
    updatePetVisitDates(appointment.petId, appointment.date)
  })

  return getVisit(newVisit.id)
}

// Bill functions
export function getBills() { return clone(state.bills) }
export function getNextBillId() {
  const id = `BILL-${String(state.nextBillNum).padStart(3, "0")}`
  state.nextBillNum += 1
  persistState()
  return id
}
export function addBill(bill: Bill) {
  commit(() => {
    const totals = buildBillTotals(bill.items)
    state.bills = [{ ...bill, ...totals }, ...state.bills]
    if (bill.visitId) updateVisitInternal(bill.visitId, { billingStatus: "Billed" })
    const targetVisits = state.visits.filter((visit) => visit.petId === bill.petId && visit.billingStatus === "Sent to Billing")
    if (!bill.visitId && targetVisits.length > 0) {
      targetVisits.forEach((visit) => updateVisitInternal(visit.id, { billingStatus: "Billed" }))
    }
  })
}
export function updateBill(id: string, data: Partial<Bill>) {
  commit(() => {
    state.bills = state.bills.map((b) => {
      if (b.id !== id) return b
      if (!data.items) return { ...b, ...data }
      const totals = buildBillTotals(data.items)
      return { ...b, ...data, ...totals }
    })
  })
}
export function createBillFromVisit(visitId: string, customItems?: BillItem[]) {
  const visit = findVisit(visitId)
  if (!visit) return undefined

  const existing = state.bills.find((bill) => bill.visitId === visitId)
  if (existing) return clone(existing)

  const autoItems: BillItem[] = []
  if (visit.treatment.trim()) {
    autoItems.push({ description: "Clinical Treatment", quantity: 1, unitPrice: 120, total: 120 })
  }
  if (visit.examination.trim()) {
    autoItems.push({ description: "Consultation & Examination", quantity: 1, unitPrice: 85, total: 85 })
  }
  if (visit.images.length > 0) {
    autoItems.push({ description: "Diagnostics / Lab", quantity: 1, unitPrice: 65, total: 65 })
  }
  for (const med of visit.medications) {
    autoItems.push({ description: `Medication: ${med.name}`, quantity: 1, unitPrice: 25, total: 25 })
  }

  const items = customItems && customItems.length > 0
    ? customItems
    : autoItems.length > 0
      ? autoItems
      : [{ description: "General Consultation", quantity: 1, unitPrice: 80, total: 80 }]

  const totals = buildBillTotals(items)
  const newBill: Bill = {
    id: getNextBillId(),
    visitId,
    petId: visit.petId,
    petName: visit.petName,
    ownerName: visit.ownerName,
    date: todayISO(),
    items: totals.items,
    subtotal: totals.subtotal,
    tax: totals.tax,
    total: totals.total,
    status: "Pending",
  }

  commit(() => {
    state.bills = [newBill, ...state.bills]
    updateVisitInternal(visitId, { billingStatus: "Billed" })
  })

  return clone(newBill)
}

// Prescription functions
export function getPrescriptions() { return clone(state.prescriptions) }
export function getNextPrescriptionId() {
  const id = `RX-${String(state.nextPrescriptionNum).padStart(3, "0")}`
  state.nextPrescriptionNum += 1
  persistState()
  return id
}
export function addPrescription(rx: Prescription) {
  commit(() => {
    state.prescriptions = [rx, ...state.prescriptions]
  })
}
export function createPrescriptionFromVisit(visitId: string) {
  const visit = findVisit(visitId)
  if (!visit) return undefined

  const existing = state.prescriptions.find((rx) => rx.visitId === visitId)
  if (existing) return clone(existing)

  const medicines: PrescriptionMedicine[] = visit.medications.map((med) => ({
    name: med.name,
    dosage: med.dosage,
    frequency: med.frequency,
    duration: med.duration,
    instructions: med.instructions,
  }))

  const newRx: Prescription = {
    id: getNextPrescriptionId(),
    visitId,
    petId: visit.petId,
    petName: visit.petName,
    ownerName: visit.ownerName,
    date: todayISO(),
    veterinarian: visit.assignedVet,
    diagnosis: visit.finalDiagnosis || visit.differentialDiagnosis || visit.chiefComplaint || "Clinical follow-up",
    medicines: medicines.length > 0 ? medicines : [{
      name: "Supportive Medication",
      dosage: "As directed",
      frequency: "Twice daily",
      duration: "5 days",
      instructions: "Follow veterinarian advice",
    }],
    notes: visit.advice || "",
  }

  commit(() => {
    state.prescriptions = [newRx, ...state.prescriptions]
  })

  return clone(newRx)
}

// OPD functions
export function getOpdRecords() { return clone(state.opdRecords) }
export function addOpdRecord(record: OpdRecord) {
  commit(() => {
    state.opdRecords = [record, ...state.opdRecords]
  })
}
export function updateOpdRecord(id: string, data: Partial<OpdRecord>) {
  commit(() => {
    state.opdRecords = state.opdRecords.map((r) => (r.id === id ? { ...r, ...data } : r))
  })
}

// IPD functions
export function getIpdRecords() { return clone(state.ipdRecords) }
export function addIpdRecord(record: IpdRecord) {
  commit(() => {
    state.ipdRecords = [record, ...state.ipdRecords]
  })
}
export function updateIpdRecord(id: string, data: Partial<IpdRecord>) {
  commit(() => {
    state.ipdRecords = state.ipdRecords.map((r) => (r.id === id ? { ...r, ...data } : r))
  })
}

// Visit functions
export function getVisits() { return clone(state.visits) }
export function getVisit(id: string) { return clone(state.visits.find((v) => v.id === id)) }
export function addVisit(visit: Visit) {
  commit(() => {
    state.visits = [visit, ...state.visits]
  })
}
export function updateVisit(id: string, data: Partial<Visit>) {
  commit(() => {
    updateVisitInternal(id, data)
  })
}
export function deleteVisit(id: string) {
  commit(() => {
    state.visits = state.visits.filter((v) => v.id !== id)
  })
}
export function duplicateVisit(id: string): Visit | undefined {
  const source = state.visits.find((v) => v.id === id)
  if (!source) return undefined

  const newVisit: Visit = {
    ...source,
    id: getNextVisitId(),
    appointmentId: undefined,
    status: "Draft",
    billingStatus: "Not Sent",
    steps: { basicInfo: false, treatmentPlan: false, lab: false, dispenseMedication: false, appointment: false, endTreatment: false },
    images: [],
    createdAt: todayISO(),
    updatedAt: todayISO(),
  }

  commit(() => {
    state.visits = [newVisit, ...state.visits]
  })

  return clone(newVisit)
}
export function getNextVisitId() {
  const id = `VIS-${String(state.nextVisitNum).padStart(3, "0")}`
  state.nextVisitNum += 1
  persistState()
  return id
}
export function completeVisit(visitId: string) {
  const target = findVisit(visitId)
  if (!target) return undefined

  commit(() => {
    updateVisitInternal(visitId, {
      status: "Done",
      steps: { ...target.steps, endTreatment: true },
    })

    const updated = findVisit(visitId)
    if (!updated) return

    if (updated.appointmentId) {
      state.appointments = state.appointments.map((apt) =>
        apt.id === updated.appointmentId ? { ...apt, status: "Completed" } : apt,
      )
    }

    ensureOpdRecordFromVisit(updated)
    ensureIpdRecordFromVisit(updated)
    updatePetVisitDates(updated.petId, updated.updatedAt, updated.followUpDate || undefined)
  })

  return getVisit(visitId)
}
export function getQueueVisits() {
  return clone(state.visits.filter((v) => v.status === "Waiting" || v.status === "In Examination"))
}
export function getVisitsByBillingStatus(status: Visit["billingStatus"]) {
  return clone(state.visits.filter((v) => v.billingStatus === status))
}

// Dashboard and reports
export function getRevenueByMonth(monthCount = 6) {
  const months = monthsBack(monthCount)
  const revenueMap = new Map<string, number>()
  for (const month of months) revenueMap.set(month.key, 0)

  for (const bill of state.bills) {
    if (bill.status !== "Paid") continue
    const monthKey = bill.date.slice(0, 7)
    if (!revenueMap.has(monthKey)) continue
    revenueMap.set(monthKey, (revenueMap.get(monthKey) || 0) + bill.total)
  }

  return months.map((month) => ({
    month: month.label,
    revenue: Number((revenueMap.get(month.key) || 0).toFixed(2)),
  }))
}

export function getDashboardStats() {
  const today = todayISO()
  const totalPets = state.pets.filter((p) => p.status === "Active").length
  const todayAppointments = state.appointments.filter((a) => a.date === today && a.status !== "Cancelled").length
  const pendingBills = state.bills.filter((b) => b.status === "Pending" || b.status === "Overdue").length
  const totalRevenue = Number(state.bills.filter((b) => b.status === "Paid").reduce((sum, b) => sum + b.total, 0).toFixed(2))
  const activeOpd = state.opdRecords.filter((r) => r.status === "Ongoing" || r.status === "Referred to IPD").length
  const activeIpd = state.ipdRecords.filter((r) => r.status !== "Discharged").length
  return { totalPets, todayAppointments, pendingBills, totalRevenue, activeOpd, activeIpd }
}

export function resetClinicData() {
  state = defaultState()
  persistState()
}
