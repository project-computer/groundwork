import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { apiFetch, withQuery } from "@/shared/api/client"

export type VisitListParams = {
  page?: number
  limit?: number
  status?: string
  petId?: number
  type?: string
}

export const visitsApi = {
  list: (params?: VisitListParams, signal?: AbortSignal) =>
    apiFetch(withQuery("/visits", params), { signal }),
  get: (id: number, signal?: AbortSignal) => apiFetch(`/visits/${id}`, { signal }),
  create: (data: Record<string, unknown>) => apiFetch("/visits", { method: "POST", json: data }),
  update: (id: number, data: Record<string, unknown>) =>
    apiFetch(`/visits/${id}`, { method: "PUT", json: data }),
  delete: (id: number) => apiFetch(`/visits/${id}`, { method: "DELETE" }),
  complete: (id: number) => apiFetch(`/visits/${id}/complete`, { method: "POST" }),
  duplicate: (id: number) => apiFetch(`/visits/${id}/duplicate`, { method: "POST" }),
  queue: (signal?: AbortSignal) => apiFetch("/visits/queue", { signal }),
}

export function useVisits(params?: VisitListParams) {
  return useQuery({
    queryKey: ["visits", params],
    queryFn: ({ signal }) => visitsApi.list(params, signal),
  })
}

export function useVisit(id: number | undefined) {
  return useQuery({
    queryKey: ["visit", id],
    queryFn: ({ signal }) => visitsApi.get(id!, signal),
    enabled: !!id,
  })
}

export function useVisitQueue() {
  return useQuery({
    queryKey: ["visits", "queue"],
    queryFn: ({ signal }) => visitsApi.queue(signal),
  })
}

export function useCreateVisit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => visitsApi.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["visits"] }),
  })
}

export function useUpdateVisit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Record<string, unknown> }) =>
      visitsApi.update(id, data),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["visit", vars.id] })
      qc.invalidateQueries({ queryKey: ["visits"] })
    },
  })
}

export function useCompleteVisit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => visitsApi.complete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["visits"] })
      qc.invalidateQueries({ queryKey: ["appointments"] })
    },
  })
}

export function useDuplicateVisit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => visitsApi.duplicate(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["visits"] }),
  })
}
