import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { apiFetch, withQuery } from "@/shared/api/client"

export type PatientListParams = {
  page?: number
  limit?: number
  search?: string
  species?: string
  status?: string
}

export const patientsApi = {
  list: (params?: PatientListParams, signal?: AbortSignal) =>
    apiFetch(withQuery("/patients", params), { signal }),
  get: (id: number, signal?: AbortSignal) => apiFetch(`/patients/${id}`, { signal }),
  create: (data: Record<string, unknown>) => apiFetch("/patients", { method: "POST", json: data }),
  update: (id: number, data: Record<string, unknown>) =>
    apiFetch(`/patients/${id}`, { method: "PUT", json: data }),
  delete: (id: number) => apiFetch(`/patients/${id}`, { method: "DELETE" }),
}

export function usePatients(params?: PatientListParams) {
  return useQuery({
    queryKey: ["patients", params],
    queryFn: ({ signal }) => patientsApi.list(params, signal),
  })
}

export function usePatient(id: number | undefined) {
  return useQuery({
    queryKey: ["patient", id],
    queryFn: ({ signal }) => patientsApi.get(id!, signal),
    enabled: !!id,
  })
}

export function useCreatePatient() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => patientsApi.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["patients"] }),
  })
}

export function useUpdatePatient() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Record<string, unknown> }) =>
      patientsApi.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["patients"] }),
  })
}

export function useDeletePatient() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => patientsApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["patients"] }),
  })
}
