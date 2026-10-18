import { isTauri } from "@/platform";
import { invoke } from "@tauri-apps/api/core";
import type { Appointment, AppointmentStatus, ClinicData, MedicalRecord, Patient } from "./types";
import { mergeData, newId, toLocalInput } from "./store";

function buildSampleData(): ClinicData {
  const now = new Date();
  const iso = now.toISOString();
  const at = (dayOffset: number, hour: number, min = 0) => {
    const d = new Date(now);
    d.setDate(d.getDate() + dayOffset);
    d.setHours(hour, min, 0, 0);
    return toLocalInput(d);
  };
  const p = (name: string, species: Patient["species"], breed: string, owner: string, extra: Partial<Patient>): Patient => ({
    id: newId(),
    name,
    species,
    breed,
    sex: "Unknown",
    birthDate: "",
    weightKg: "",
    ownerName: owner,
    ownerPhone: "",
    ownerEmail: "",
    allergies: "",
    notes: "",
    createdAt: iso,
    updatedAt: iso,
    ...extra,
  });
  const biscuit = p("Biscuit", "Dog", "Golden Retriever", "Maya Chen", {
    sex: "Male",
    weightKg: "31.2",
    birthDate: `${now.getFullYear() - 5}-03-14`,
    ownerPhone: "(555) 201-4410",
    ownerEmail: "maya.chen@example.com",
  });
  const luna = p("Luna", "Cat", "Siamese", "Daniel Ortiz", {
    sex: "Female",
    weightKg: "4.1",
    birthDate: `${now.getFullYear() - 3}-08-02`,
    ownerPhone: "(555) 388-9012",
    allergies: "Penicillin",
  });
  const pepper = p("Pepper", "Rabbit", "Holland Lop", "Aisha Patel", { weightKg: "1.8", ownerPhone: "(555) 640-2277" });

  const a = (patientId: string, dateTime: string, reason: string, status: AppointmentStatus, extra: Partial<Appointment> = {}): Appointment => ({
    id: newId(),
    patientId,
    dateTime,
    durationMin: 30,
    reason,
    vet: "Dr. Rivera",
    status,
    notes: "",
    createdAt: iso,
    updatedAt: iso,
    ...extra,
  });

  const pastVisit = a(biscuit.id, at(-7, 10), "Ear infection", "completed", { completedAt: iso });
  const recheck = a(biscuit.id, at(7, 10), "Ear recheck", "scheduled", { notes: "Booked at end of previous visit" });
  const record: MedicalRecord = {
    id: newId(),
    patientId: biscuit.id,
    appointmentId: pastVisit.id,
    vet: "Dr. Rivera",
    date: pastVisit.dateTime,
    vitals: { weightKg: "31.2", temperatureC: "38.9", heartRate: "96", respRate: "22" },
    subjective: "Owner reports head shaking and scratching at left ear for 4 days. Eating and drinking normally.",
    objective: "Left ear canal erythematous with brown waxy discharge. Right ear normal. Otherwise bright, alert, responsive.",
    assessment: "Otitis externa, left ear. Cytology consistent with Malassezia.",
    plan: "Ear flush in clinic. Topical otic ointment for 10 days. Recheck in 2 weeks.",
    prescriptions: [
      {
        id: newId(),
        drug: "Otomax otic ointment",
        strength: "15 g",
        dose: "4 drops",
        route: "Otic",
        frequency: "Twice daily",
        durationDays: "10",
        quantity: "1 tube",
        instructions: "Clean the ear before applying. Massage the base of the ear afterwards.",
      },
    ],
    charges: [
      { id: newId(), description: "Consultation", qty: 1, unitPrice: 65 },
      { id: newId(), description: "Ear cytology", qty: 1, unitPrice: 35 },
      { id: newId(), description: "Otomax otic ointment 15 g", qty: 1, unitPrice: 28 },
    ],
    followUp: { dateTime: recheck.dateTime, reason: "Ear recheck" },
    followUpAppointmentId: recheck.id,
    paid: true,
    status: "final",
    createdAt: iso,
    updatedAt: iso,
  };
  pastVisit.recordId = record.id;

  return {
    version: 2,
    patients: [biscuit, luna, pepper],
    appointments: [
      pastVisit,
      recheck,
      a(luna.id, at(0, now.getHours(), 0), "Dental check", "checked-in", { checkedInAt: iso }),
      a(pepper.id, at(0, Math.min(now.getHours() + 2, 22)), "Nail trim and weigh-in", "scheduled"),
      a(biscuit.id, at(2, 9, 30), "Annual vaccination", "scheduled"),
    ],
    records: [record],
    settings: {
      name: "Riverside Animal Clinic",
      address: "120 Riverside Ave\nSpringfield",
      phone: "(555) 010-2000",
      email: "hello@riverside.vet",
      license: "VET-48213",
      currency: "USD",
      defaultVet: "Dr. Rivera",
      slotMinutes: 30,
    },
    updatedAt: iso,
  };
}

export function loadSampleData() {
  const sample = buildSampleData();
  if (isTauri()) {
    void invoke("data_replace_command", { data: sample });
    return;
  }
  mergeData(sample);
}
