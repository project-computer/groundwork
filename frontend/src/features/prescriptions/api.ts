import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { apiFetch, withQuery } from "@/shared/api/client"

export type PrescriptionListParams = {
  page?: number
  limit?: number
  petId?: number
}

export const prescriptionsApi = {
  list: (params?: PrescriptionListParams, signal?: AbortSignal) =>
    apiFetch(withQuery("/prescriptions", params), { signal }),
  get: (id: number, signal?: AbortSignal) => apiFetch(`/prescriptions/${id}`, { signal }),
  create: (data: Record<string, unknown>) =>
    apiFetch("/prescriptions", { method: "POST", json: data }),
}

export function usePrescriptions(params?: PrescriptionListParams) {
  return useQuery({
    queryKey: ["prescriptions", params],
    queryFn: ({ signal }) => prescriptionsApi.list(params, signal),
  })
}

export function useCreatePrescription() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => prescriptionsApi.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["prescriptions"] }),
  })
}
