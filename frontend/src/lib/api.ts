import axios from "axios"

const API_BASE = import.meta.env.VITE_API_URL || "/api/v1"

const api = axios.create({
  baseURL: API_BASE,
  headers: { "Content-Type": "application/json" },
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("vet.accessToken")
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true
      const refreshToken = localStorage.getItem("vet.refreshToken")
      if (refreshToken) {
        try {
          const { data } = await axios.post(`${API_BASE}/auth/refresh`, { refreshToken })
          localStorage.setItem("vet.accessToken", data.accessToken)
          localStorage.setItem("vet.refreshToken", data.refreshToken)
          original.headers.Authorization = `Bearer ${data.accessToken}`
          return api(original)
        } catch {
          localStorage.removeItem("vet.accessToken")
          localStorage.removeItem("vet.refreshToken")
          window.location.href = "/login"
        }
      } else {
        window.location.href = "/login"
      }
    }
    return Promise.reject(error)
  },
)

export default api

// Auth
export const authApi = {
  login: (email: string, password: string) =>
    api.post("/auth/login", { email, password }),
  refresh: (refreshToken: string) =>
    api.post("/auth/refresh", { refreshToken }),
  me: () => api.get("/auth/me"),
  updateProfile: (data: { name?: string; phone?: string }) =>
    api.put("/auth/me", data),
  changePassword: (oldPassword: string, newPassword: string) =>
    api.put("/auth/password", { oldPassword, newPassword }),
  logout: () => api.post("/auth/logout"),
}

// Patients
export const patientsApi = {
  list: (params?: { page?: number; limit?: number; search?: string; species?: string; status?: string }) =>
    api.get("/patients", { params }),
  get: (id: number) => api.get(`/patients/${id}`),
  create: (data: Record<string, unknown>) => api.post("/patients", data),
  update: (id: number, data: Record<string, unknown>) => api.put(`/patients/${id}`, data),
  delete: (id: number) => api.delete(`/patients/${id}`),
}

// Appointments
export const appointmentsApi = {
  list: (params?: { page?: number; limit?: number; date?: string; status?: string }) =>
    api.get("/appointments", { params }),
  get: (id: number) => api.get(`/appointments/${id}`),
  create: (data: Record<string, unknown>) => api.post("/appointments", data),
  update: (id: number, data: Record<string, unknown>) => api.put(`/appointments/${id}`, data),
  delete: (id: number) => api.delete(`/appointments/${id}`),
  checkin: (id: number) => api.post(`/appointments/${id}/checkin`),
  cancel: (id: number) => api.post(`/appointments/${id}/cancel`),
  today: () => api.get("/appointments/today"),
}

// Visits
export const visitsApi = {
  list: (params?: { page?: number; limit?: number; status?: string; petId?: number; type?: string }) =>
    api.get("/visits", { params }),
  get: (id: number) => api.get(`/visits/${id}`),
  create: (data: Record<string, unknown>) => api.post("/visits", data),
  update: (id: number, data: Record<string, unknown>) => api.put(`/visits/${id}`, data),
  delete: (id: number) => api.delete(`/visits/${id}`),
  complete: (id: number) => api.post(`/visits/${id}/complete`),
  duplicate: (id: number) => api.post(`/visits/${id}/duplicate`),
  queue: () => api.get("/visits/queue"),
}

// Bills
export const billsApi = {
  list: (params?: { page?: number; limit?: number; status?: string; petId?: number }) =>
    api.get("/bills", { params }),
  get: (id: number) => api.get(`/bills/${id}`),
  create: (data: Record<string, unknown>) => api.post("/bills", data),
  update: (id: number, data: Record<string, unknown>) => api.put(`/bills/${id}`, data),
}

// Prescriptions
export const prescriptionsApi = {
  list: (params?: { page?: number; limit?: number; petId?: number }) =>
    api.get("/prescriptions", { params }),
  get: (id: number) => api.get(`/prescriptions/${id}`),
  create: (data: Record<string, unknown>) => api.post("/prescriptions", data),
}

// Dashboard
export const dashboardApi = {
  stats: () => api.get("/dashboard/stats"),
  revenue: (months?: number) => api.get("/dashboard/revenue", { params: { months } }),
}
