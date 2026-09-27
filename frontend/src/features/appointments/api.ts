import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { apiFetch, withQuery } from "@/shared/api/client"

export type AppointmentListParams = {
  page?: number
  limit?: number
  date?: string
  status?: string
}

export const appointmentsApi = {
  list: (params?: AppointmentListParams, signal?: AbortSignal) =>
    apiFetch(withQuery("/appointments", params), { signal }),
  get: (id: number, signal?: AbortSignal) => apiFetch(`/appointments/${id}`, { signal }),
  create: (data: Record<string, unknown>) =>
    apiFetch("/appointments", { method: "POST", json: data }),
  update: (id: number, data: Record<string, unknown>) =>
    apiFetch(`/appointments/${id}`, { method: "PUT", json: data }),
  delete: (id: number) => apiFetch(`/appointments/${id}`, { method: "DELETE" }),
  checkin: (id: number) => apiFetch(`/appointments/${id}/checkin`, { method: "POST" }),
  cancel: (id: number) => apiFetch(`/appointments/${id}/cancel`, { method: "POST" }),
  today: (signal?: AbortSignal) => apiFetch("/appointments/today", { signal }),
}

export function useAppointments(params?: AppointmentListParams) {
  return useQuery({
    queryKey: ["appointments", params],
    queryFn: ({ signal }) => appointmentsApi.list(params, signal),
  })
}

export function useTodayAppointments() {
  return useQuery({
    queryKey: ["appointments", "today"],
    queryFn: ({ signal }) => appointmentsApi.today(signal),
  })
}

export function useCreateAppointment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => appointmentsApi.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["appointments"] }),
  })
}

export function useUpdateAppointment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Record<string, unknown> }) =>
      appointmentsApi.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["appointments"] }),
  })
}

export function useCheckInAppointment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => appointmentsApi.checkin(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["appointments"] })
      qc.invalidateQueries({ queryKey: ["visits"] })
    },
  })
}
