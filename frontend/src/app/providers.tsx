import { type ReactNode } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ThemeProvider, BaseStyles } from "@primer/react"
import "@primer/primitives/dist/css/functional/themes/light.css"
import "@primer/primitives/dist/css/functional/themes/dark.css"
import { AuthProvider } from "@/features/auth/AuthContext"

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
})

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <BaseStyles>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>{children}</AuthProvider>
        </QueryClientProvider>
      </BaseStyles>
    </ThemeProvider>
  )
}
