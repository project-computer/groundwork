// Thin fetch wrapper used by every feature's TanStack Query hooks.
// fetch answers "how do I talk to the server" — TanStack Query (in features/*/api.ts)
// answers "how do I manage the server data" (cache, dedupe, retries, invalidation).

export const API_BASE = import.meta.env.VITE_API_URL || "/api/v1"

export class ApiError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message?: string) {
    super(message || code)
    this.name = "ApiError"
    this.status = status
    this.code = code
  }
}

type ApiFetchOptions = RequestInit & { json?: unknown }

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("vet.accessToken")
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function parseError(res: Response): Promise<ApiError> {
  let code = `HTTP_${res.status}`
  let message = res.statusText
  try {
    const body = await res.json()
    if (body?.error) code = body.error
    if (body?.message) message = body.message
  } catch {
    // non-JSON error body — keep status-based fallbacks
  }
  return new ApiError(res.status, code, message)
}

async function refreshTokens(): Promise<boolean> {
  const refreshToken = localStorage.getItem("vet.refreshToken")
  if (!refreshToken) return false
  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    })
    if (!res.ok) throw new Error("refresh failed")
    const data = await res.json()
    localStorage.setItem("vet.accessToken", data.accessToken)
    localStorage.setItem("vet.refreshToken", data.refreshToken)
    return true
  } catch {
    localStorage.removeItem("vet.accessToken")
    localStorage.removeItem("vet.refreshToken")
    return false
  }
}

// Endpoints where a 401 means "bad credentials", not "session expired" —
// never trigger the refresh/redirect flow for them.
const AUTH_PATHS = ["/auth/login", "/auth/refresh"]

/**
 * Parse JSON in, throw {@link ApiError} on non-2xx, attach the auth header,
 * and transparently refresh the access token once on 401.
 *
 * T defaults to `any` for now; feature `types.ts` files will tighten this
 * per domain (see docs/PLAN.md §6b follow-ups).
 */
export async function apiFetch<T = any>(
  path: string,
  init: ApiFetchOptions = {},
  allowRefresh = true,
): Promise<T> {
  const { json, headers, ...rest } = init
  const res = await fetch(`${API_BASE}${path}`, {
    ...rest,
    headers: {
      ...(json !== undefined ? { "Content-Type": "application/json" } : {}),
      ...authHeaders(),
      ...headers,
    },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  })

  if (res.status === 401 && allowRefresh && !AUTH_PATHS.some((p) => path.startsWith(p))) {
    if (await refreshTokens()) {
      return apiFetch<T>(path, init, false)
    }
    window.location.href = "/login"
    throw new ApiError(401, "SESSION_EXPIRED", "Session expired")
  }

  if (!res.ok) throw await parseError(res)
  if (res.status === 204) return undefined as T
  return res.json()
}

/** Append defined params as a query string: withQuery("/patients", {page: 1}) → "/patients?page=1" */
export function withQuery(path: string, params?: Record<string, unknown>): string {
  if (!params) return path
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      search.set(key, String(value))
    }
  }
  const qs = search.toString()
  return qs ? `${path}?${qs}` : path
}
