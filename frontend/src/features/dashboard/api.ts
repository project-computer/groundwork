import { useQuery } from "@tanstack/react-query"
import { apiFetch, withQuery } from "@/shared/api/client"

export const dashboardApi = {
  stats: (signal?: AbortSignal) => apiFetch("/dashboard/stats", { signal }),
  revenue: (months?: number, signal?: AbortSignal) =>
    apiFetch(withQuery("/dashboard/revenue", { months }), { signal }),
}

export function useDashboardStats() {
  return useQuery({
    queryKey: ["dashboard", "stats"],
    queryFn: ({ signal }) => dashboardApi.stats(signal),
  })
}

export function useRevenue(months = 6) {
  return useQuery({
    queryKey: ["dashboard", "revenue", months],
    queryFn: ({ signal }) => dashboardApi.revenue(months, signal),
  })
}
