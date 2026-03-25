import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  patientsApi,
  appointmentsApi,
  visitsApi,
  billsApi,
  prescriptionsApi,
  dashboardApi,
} from "@/lib/api"

// --- Patients ---
export function usePatients(params?: { page?: number; limit?: number; search?: string; species?: string; status?: string }) {
  return useQuery({
    queryKey: ["patients", params],
    queryFn: () => patientsApi.list(params).then((r) => r.data),
  })
}

export function usePatient(id: number | undefined) {
  return useQuery({
    queryKey: ["patient", id],
    queryFn: () => patientsApi.get(id!).then((r) => r.data),
    enabled: !!id,
  })
}

export function useCreatePatient() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => patientsApi.create(data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["patients"] }),
  })
}

export function useUpdatePatient() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Record<string, unknown> }) =>
      patientsApi.update(id, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["patients"] }),
  })
}

export function useDeletePatient() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => patientsApi.delete(id).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["patients"] }),
  })
}

// --- Appointments ---
export function useAppointments(params?: { page?: number; limit?: number; date?: string; status?: string }) {
  return useQuery({
    queryKey: ["appointments", params],
    queryFn: () => appointmentsApi.list(params).then((r) => r.data),
  })
}

export function useTodayAppointments() {
  return useQuery({
    queryKey: ["appointments", "today"],
    queryFn: () => appointmentsApi.today().then((r) => r.data),
  })
}

export function useCreateAppointment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => appointmentsApi.create(data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["appointments"] }),
  })
}

export function useUpdateAppointment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Record<string, unknown> }) =>
      appointmentsApi.update(id, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["appointments"] }),
  })
}

export function useCheckInAppointment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => appointmentsApi.checkin(id).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["appointments"] })
      qc.invalidateQueries({ queryKey: ["visits"] })
    },
  })
}

// --- Visits ---
export function useVisits(params?: { page?: number; limit?: number; status?: string; petId?: number; type?: string }) {
  return useQuery({
    queryKey: ["visits", params],
    queryFn: () => visitsApi.list(params).then((r) => r.data),
  })
}

export function useVisit(id: number | undefined) {
  return useQuery({
    queryKey: ["visit", id],
    queryFn: () => visitsApi.get(id!).then((r) => r.data),
    enabled: !!id,
  })
}

export function useVisitQueue() {
  return useQuery({
    queryKey: ["visits", "queue"],
    queryFn: () => visitsApi.queue().then((r) => r.data),
  })
}

export function useCreateVisit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => visitsApi.create(data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["visits"] }),
  })
}

export function useUpdateVisit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Record<string, unknown> }) =>
      visitsApi.update(id, data).then((r) => r.data),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["visit", vars.id] })
      qc.invalidateQueries({ queryKey: ["visits"] })
    },
  })
}

export function useCompleteVisit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => visitsApi.complete(id).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["visits"] })
      qc.invalidateQueries({ queryKey: ["appointments"] })
    },
  })
}

export function useDuplicateVisit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => visitsApi.duplicate(id).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["visits"] }),
  })
}

// --- Bills ---
export function useBills(params?: { page?: number; limit?: number; status?: string }) {
  return useQuery({
    queryKey: ["bills", params],
    queryFn: () => billsApi.list(params).then((r) => r.data),
  })
}

export function useCreateBill() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => billsApi.create(data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bills"] })
      qc.invalidateQueries({ queryKey: ["visits"] })
      qc.invalidateQueries({ queryKey: ["dashboard"] })
    },
  })
}

export function useUpdateBill() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Record<string, unknown> }) =>
      billsApi.update(id, data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bills"] })
      qc.invalidateQueries({ queryKey: ["dashboard"] })
    },
  })
}

// --- Prescriptions ---
export function usePrescriptions(params?: { page?: number; limit?: number; petId?: number }) {
  return useQuery({
    queryKey: ["prescriptions", params],
    queryFn: () => prescriptionsApi.list(params).then((r) => r.data),
  })
}

export function useCreatePrescription() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => prescriptionsApi.create(data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["prescriptions"] }),
  })
}

// --- Dashboard ---
export function useDashboardStats() {
  return useQuery({
    queryKey: ["dashboard", "stats"],
    queryFn: () => dashboardApi.stats().then((r) => r.data),
  })
}

export function useRevenue(months = 6) {
  return useQuery({
    queryKey: ["dashboard", "revenue", months],
    queryFn: () => dashboardApi.revenue(months).then((r) => r.data),
  })
}
