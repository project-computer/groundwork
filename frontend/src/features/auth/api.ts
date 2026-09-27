import { apiFetch } from "@/shared/api/client"

export type User = {
  id: number
  email: string
  name: string
  role: string
  phone?: string
  avatarUrl?: string
}

export type LoginResponse = {
  accessToken: string
  refreshToken: string
  user: User
}

export const authApi = {
  login: (email: string, password: string) =>
    apiFetch<LoginResponse>("/auth/login", { method: "POST", json: { email, password } }),
  refresh: (refreshToken: string) =>
    apiFetch<{ accessToken: string; refreshToken: string }>("/auth/refresh", {
      method: "POST",
      json: { refreshToken },
    }),
  me: (signal?: AbortSignal) => apiFetch("/auth/me", { signal }),
  updateProfile: (data: { name?: string; phone?: string }) =>
    apiFetch("/auth/me", { method: "PUT", json: data }),
  changePassword: (oldPassword: string, newPassword: string) =>
    apiFetch("/auth/password", { method: "PUT", json: { oldPassword, newPassword } }),
  logout: () => apiFetch("/auth/logout", { method: "POST" }),
}
