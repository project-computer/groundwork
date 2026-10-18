import { useEffect } from "react";
import useSWR, { mutate } from "swr";
import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "@/platform";
import type {
  Appointment,
  AppointmentInput,
  AppointmentStatus,
  ChargeLine,
  ClinicData,
  ClinicSettings,
  MedicalRecord,
  Patient,
  Plan,
  Prescription,
} from "./types";

export const DATA_KEY = "vetdesk:data:v1";
export const PLAN_KEY = "vetdesk:plan";

export const DEFAULT_SETTINGS: ClinicSettings = {
  name: "VetDesk Clinic",
  address: "",
  phone: "",
  email: "",
  license: "",
  currency: "USD",
  defaultVet: "",
  slotMinutes: 30,
};

export const EMPTY_DATA: ClinicData = {
  version: 2,
  patients: [],
  appointments: [],
  records: [],
  settings: DEFAULT_SETTINGS,
  updatedAt: null,
};

const nowIso = () => new Date().toISOString();

export function newId() {
  return crypto.randomUUID();
}

export function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Accepts v1 and v2 backups and upgrades them to the current shape. */
export function parseClinicData(value: unknown): ClinicData | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (!Array.isArray(v.patients) || !Array.isArray(v.appointments)) return null;
  const settings = v.settings && typeof v.settings === "object" ? (v.settings as Partial<ClinicSettings>) : {};
  return {
    version: 2,
    patients: (v.patients as Patient[]).map((p) => ({ ...p, allergies: p.allergies ?? "" })),
    appointments: (v.appointments as Appointment[]).map((a) => ({
      ...a,
      durationMin: Number(a.durationMin) || 30,
    })),
    records: Array.isArray(v.records) ? (v.records as MedicalRecord[]) : [],
    settings: { ...DEFAULT_SETTINGS, ...settings },
    updatedAt: typeof v.updatedAt === "string" ? v.updatedAt : null,
  };
}

export function isClinicData(value: unknown): value is ClinicData {
  return parseClinicData(value) !== null;
}

/* ---------- backends ---------- */

async function loadFromTauri(): Promise<ClinicData> {
  const raw = await invoke<unknown>("clinic_load_command");
  return parseClinicData(raw) ?? EMPTY_DATA;
}

function readLocalData(): ClinicData {
  try {
    const raw = window.localStorage.getItem(DATA_KEY);
    if (!raw) return EMPTY_DATA;
    return parseClinicData(JSON.parse(raw)) ?? EMPTY_DATA;
  } catch {
    return EMPTY_DATA;
  }
}

function commitLocal(draft: Omit<ClinicData, "version" | "updatedAt">) {
  const next: ClinicData = { ...draft, version: 2, updatedAt: nowIso() };
  window.localStorage.setItem(DATA_KEY, JSON.stringify(next));
  void mutate(DATA_KEY, next, { revalidate: false });
}

async function reload() {
  if (isTauri()) {
    await mutate(DATA_KEY, loadFromTauri(), { revalidate: false });
  }
}

function withTimestamps<T extends { updatedAt: string }>(item: T, now: string): T {
  return { ...item, updatedAt: now };
}

/* ---------- hooks ---------- */

export function useClinicData() {
  const fetcher = isTauri() ? loadFromTauri : readLocalData;
  const { data = EMPTY_DATA, isLoading } = useSWR(DATA_KEY, fetcher, {
    fallbackData: EMPTY_DATA,
    revalidateOnMount: true,
    revalidateOnFocus: !isTauri(),
  });

  useEffect(() => {
    if (isTauri()) return;
    function onStorage(e: StorageEvent) {
      if (e.key === DATA_KEY) void mutate(DATA_KEY, readLocalData(), { revalidate: false });
      if (e.key === PLAN_KEY) void mutate(PLAN_KEY, readPlan(), { revalidate: false });
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return { data, isLoading };
}

function readPlan(): Plan {
  return window.localStorage.getItem(PLAN_KEY) === "pro" ? "pro" : "free";
}

export function usePlan() {
  const { data = "free" } = useSWR<Plan>(PLAN_KEY, readPlan, { fallbackData: "free" });
  return data;
}

/* ---------- patients ---------- */

export function savePatient(input: Omit<Patient, "id" | "createdAt" | "updatedAt">, id?: string) {
  const now = nowIso();
  const patientId = id ?? newId();
  const patient: Patient = {
    ...input,
    id: patientId,
    createdAt: now,
    updatedAt: now,
  };
  if (isTauri()) {
    void invoke("patient_upsert_command", { patient }).then(reload);
  } else {
    const d = readLocalData();
    const patients = id
      ? d.patients.map((p) => (p.id === id ? { ...p, ...input, updatedAt: now } : p))
      : [patient, ...d.patients];
    commitLocal({ ...d, patients });
  }
  return patientId;
}

export function deletePatient(id: string) {
  if (isTauri()) {
    void invoke("patient_delete_command", { id }).then(reload);
    return;
  }
  const d = readLocalData();
  commitLocal({
    ...d,
    patients: d.patients.filter((p) => p.id !== id),
    appointments: d.appointments.filter((a) => a.patientId !== id),
    records: d.records.filter((r) => r.patientId !== id),
  });
}

/* ---------- appointments ---------- */

export function saveAppointment(input: AppointmentInput, id?: string) {
  const now = nowIso();
  const apptId = id ?? newId();
  const base = id
    ? undefined
    : { id: apptId, createdAt: now, checkedInAt: undefined, startedAt: undefined, completedAt: undefined, recordId: undefined };
  const appointment = { ...base, ...input, id: apptId, updatedAt: now } as Appointment;
  if (isTauri()) {
    void invoke("appointment_upsert_command", { appointment }).then(reload);
  } else {
    const d = readLocalData();
    const appointments = id
      ? d.appointments.map((a) => (a.id === id ? { ...a, ...input, updatedAt: now } : a))
      : [...d.appointments, appointment];
    commitLocal({ ...d, appointments });
  }
  return apptId;
}

export function setAppointmentStatus(id: string, status: AppointmentStatus) {
  if (isTauri()) {
    void invoke("appointment_set_status_command", { id, status }).then(reload);
    return;
  }
  const d = readLocalData();
  const now = nowIso();
  commitLocal({
    ...d,
    appointments: d.appointments.map((a) => {
      if (a.id !== id) return a;
      return {
        ...a,
        status,
        updatedAt: now,
        checkedInAt: status === "checked-in" ? (a.checkedInAt ?? now) : a.checkedInAt,
        completedAt: status === "completed" ? (a.completedAt ?? now) : a.completedAt,
      };
    }),
  });
}

export function deleteAppointment(id: string) {
  if (isTauri()) {
    void invoke("appointment_delete_command", { id }).then(reload);
    return;
  }
  const d = readLocalData();
  commitLocal({ ...d, appointments: d.appointments.filter((a) => a.id !== id) });
}

/* ---------- records ---------- */

export function emptyPrescription(): Prescription {
  return {
    id: newId(),
    drug: "",
    strength: "",
    dose: "",
    route: "Oral",
    frequency: "",
    durationDays: "",
    quantity: "",
    instructions: "",
  };
}

export function emptyCharge(description = "", unitPrice = 0): ChargeLine {
  return { id: newId(), description, qty: 1, unitPrice };
}

export function saveRecord(record: MedicalRecord) {
  const now = nowIso();
  const next = withTimestamps(record, now);
  if (isTauri()) {
    void invoke("record_upsert_command", { record: next }).then(reload);
  } else {
    const d = readLocalData();
    const exists = d.records.some((r) => r.id === record.id);
    commitLocal({
      ...d,
      records: exists ? d.records.map((r) => (r.id === record.id ? next : r)) : [next, ...d.records],
    });
  }
}

export function setRecordPaid(id: string, paid: boolean) {
  if (isTauri()) {
    void invoke("record_set_paid_command", { id, paid }).then(reload);
    return;
  }
  const d = readLocalData();
  const now = nowIso();
  commitLocal({
    ...d,
    records: d.records.map((r) => (r.id === id ? { ...r, paid, updatedAt: now } : r)),
  });
}

/* ---------- consult workflows ---------- */

function createLocalRecord(d: ClinicData, patientId: string, appointmentId: string | null, vet: string): MedicalRecord {
  const patient = d.patients.find((p) => p.id === patientId);
  return {
    id: newId(),
    patientId,
    appointmentId,
    vet: vet || d.settings.defaultVet,
    date: toLocalInput(new Date()),
    vitals: { weightKg: patient?.weightKg ?? "", temperatureC: "", heartRate: "", respRate: "" },
    subjective: "",
    objective: "",
    assessment: "",
    plan: "",
    prescriptions: [],
    charges: [],
    followUp: null,
    followUpAppointmentId: null,
    paid: false,
    status: "draft",
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
}

export async function startConsult(appointmentId: string): Promise<MedicalRecord | null> {
  if (isTauri()) {
    const record = await invoke<MedicalRecord>("consult_start_command", { appointmentId });
    await reload();
    return record;
  }
  const d = readLocalData();
  const appt = d.appointments.find((a) => a.id === appointmentId);
  if (!appt) return null;
  const now = nowIso();
  const existing = appt.recordId ? d.records.find((r) => r.id === appt.recordId) : undefined;
  const record = existing ?? createLocalRecord(d, appt.patientId, appt.id, appt.vet);
  commitLocal({
    ...d,
    appointments: d.appointments.map((a) =>
      a.id !== appointmentId
        ? a
        : {
            ...a,
            status: a.status === "completed" ? "completed" : "in-consult",
            checkedInAt: a.checkedInAt ?? now,
            startedAt: a.startedAt ?? now,
            recordId: record.id,
            updatedAt: now,
          },
    ),
    records: existing ? d.records : [record, ...d.records],
  });
  return record;
}

export async function startWalkIn(patientId: string, reason: string, vet: string): Promise<MedicalRecord | null> {
  if (isTauri()) {
    const record = await invoke<MedicalRecord>("walk_in_start_command", { patientId, reason, vet });
    await reload();
    return record;
  }
  const d = readLocalData();
  const now = nowIso();
  const apptId = newId();
  const record = createLocalRecord(d, patientId, apptId, vet);
  record.appointmentId = apptId;
  const appt: Appointment = {
    id: apptId,
    patientId,
    dateTime: toLocalInput(new Date()),
    durationMin: d.settings.slotMinutes,
    reason: reason || "Walk-in",
    vet: record.vet,
    status: "in-consult",
    notes: "Walk-in",
    checkedInAt: now,
    startedAt: now,
    recordId: record.id,
    createdAt: now,
    updatedAt: now,
  };
  commitLocal({ ...d, appointments: [...d.appointments, appt], records: [record, ...d.records] });
  return record;
}

export function saveRecordDraft(record: MedicalRecord) {
  saveRecord(record);
}

export async function finishVisit(record: MedicalRecord): Promise<MedicalRecord> {
  if (isTauri()) {
    const finalRecord = await invoke<MedicalRecord>("visit_finish_command", { record });
    await reload();
    return finalRecord;
  }
  const d = readLocalData();
  const now = nowIso();
  let appointments = d.appointments;
  let followUpAppointmentId = record.followUpAppointmentId;

  if (record.followUp?.dateTime) {
    const fu = record.followUp;
    const linked = followUpAppointmentId ? appointments.find((a) => a.id === followUpAppointmentId) : undefined;
    if (linked) {
      appointments = appointments.map((a) =>
        a.id === linked.id ? { ...a, dateTime: fu.dateTime, reason: fu.reason || a.reason, updatedAt: now } : a,
      );
    } else {
      followUpAppointmentId = newId();
      appointments = [
        ...appointments,
        {
          id: followUpAppointmentId,
          patientId: record.patientId,
          dateTime: fu.dateTime,
          durationMin: d.settings.slotMinutes,
          reason: fu.reason || "Follow-up",
          vet: record.vet,
          status: "scheduled",
          notes: "Booked at end of previous visit",
          createdAt: now,
          updatedAt: now,
        },
      ];
    }
  }

  appointments = appointments.map((a) =>
    a.id === record.appointmentId
      ? { ...a, status: "completed", completedAt: a.completedAt ?? now, recordId: record.id, updatedAt: now }
      : a,
  );

  const finalRecord: MedicalRecord = { ...record, status: "final", followUpAppointmentId, updatedAt: now };
  const weight = record.vitals.weightKg.trim();
  commitLocal({
    ...d,
    appointments,
    records: d.records.some((r) => r.id === record.id)
      ? d.records.map((r) => (r.id === record.id ? finalRecord : r))
      : [finalRecord, ...d.records],
    patients: weight
      ? d.patients.map((p) => (p.id === record.patientId ? { ...p, weightKg: weight, updatedAt: now } : p))
      : d.patients,
  });
  return finalRecord;
}

/* ---------- settings & backups ---------- */

export function saveSettings(settings: ClinicSettings) {
  if (isTauri()) {
    void invoke("settings_save_command", { settings }).then(reload);
    return;
  }
  const d = readLocalData();
  commitLocal({ ...d, settings });
}

export function replaceAllData(next: ClinicData) {
  if (isTauri()) {
    void invoke("data_replace_command", { data: next }).then(reload);
    return;
  }
  commitLocal({
    patients: next.patients,
    appointments: next.appointments,
    records: next.records,
    settings: next.settings,
  });
}

export function mergeData(incoming: ClinicData) {
  if (isTauri()) {
    void invoke("data_merge_command", { data: incoming }).then(reload);
    return;
  }
  const d = readLocalData();
  const byId = <T extends { id: string; updatedAt: string }>(a: T[], b: T[]) => {
    const map = new Map(a.map((x) => [x.id, x]));
    for (const item of b) {
      const existing = map.get(item.id);
      if (!existing || item.updatedAt > existing.updatedAt) map.set(item.id, item);
    }
    return [...map.values()];
  };
  commitLocal({
    patients: byId(d.patients, incoming.patients),
    appointments: byId(d.appointments, incoming.appointments),
    records: byId(d.records, incoming.records),
    settings: d.settings.name === DEFAULT_SETTINGS.name ? incoming.settings : d.settings,
  });
}

export { loadSampleData } from "./sample-data";
