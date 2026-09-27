import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { apiFetch, withQuery } from "@/shared/api/client"

export type BillListParams = {
  page?: number
  limit?: number
  status?: string
  petId?: number
}

export const billsApi = {
  list: (params?: BillListParams, signal?: AbortSignal) =>
    apiFetch(withQuery("/bills", params), { signal }),
  get: (id: number, signal?: AbortSignal) => apiFetch(`/bills/${id}`, { signal }),
  create: (data: Record<string, unknown>) => apiFetch("/bills", { method: "POST", json: data }),
  update: (id: number, data: Record<string, unknown>) =>
    apiFetch(`/bills/${id}`, { method: "PUT", json: data }),
}

export function useBills(params?: BillListParams) {
  return useQuery({
    queryKey: ["bills", params],
    queryFn: ({ signal }) => billsApi.list(params, signal),
  })
}

export function useCreateBill() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => billsApi.create(data),
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
      billsApi.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bills"] })
      qc.invalidateQueries({ queryKey: ["dashboard"] })
    },
  })
}
