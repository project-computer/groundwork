import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react"
import { authApi } from "./api"

type User = {
  id: number
  email: string
  name: string
  role: string
  phone?: string
  avatarUrl?: string
}

type AuthContextType = {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  isAuthenticated: boolean
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchUser = useCallback(async () => {
    const token = localStorage.getItem("vet.accessToken")
    if (!token) {
      setLoading(false)
      return
    }
    try {
      const { data } = await authApi.me()
      setUser(data.user || data)
    } catch {
      localStorage.removeItem("vet.accessToken")
      localStorage.removeItem("vet.refreshToken")
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchUser()
  }, [fetchUser])

  const login = async (email: string, password: string) => {
    const { data } = await authApi.login(email, password)
    localStorage.setItem("vet.accessToken", data.accessToken)
    localStorage.setItem("vet.refreshToken", data.refreshToken)
    setUser(data.user)
  }

  const logout = () => {
    authApi.logout().catch(() => {})
    localStorage.removeItem("vet.accessToken")
    localStorage.removeItem("vet.refreshToken")
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within AuthProvider")
  return ctx
}
