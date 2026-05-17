import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react"
import { useAuth } from "@/lib/auth"
import { useBrandSettings } from "@/hooks/use-queries"

export type BrandColors = {
  primaryColor: string
  primaryForeground: string
  accentColor: string
  accentForeground: string
  secondaryColor: string
  secondaryForeground: string
  sidebarColor: string
  sidebarForeground: string
  sidebarPrimary: string
  sidebarAccent: string
  chart1: string
  chart2: string
  chart3: string
  chart4: string
  chart5: string
}

const cssVarMap: Record<keyof BrandColors, string[]> = {
  primaryColor: ["--primary", "--ring", "--chart-1"],
  primaryForeground: ["--primary-foreground"],
  accentColor: ["--accent"],
  accentForeground: ["--accent-foreground"],
  secondaryColor: ["--secondary"],
  secondaryForeground: ["--secondary-foreground"],
  sidebarColor: ["--sidebar"],
  sidebarForeground: ["--sidebar-foreground"],
  sidebarPrimary: ["--sidebar-primary"],
  sidebarAccent: ["--sidebar-accent"],
  chart1: ["--chart-1"],
  chart2: ["--chart-2"],
  chart3: ["--chart-3"],
  chart4: ["--chart-4"],
  chart5: ["--chart-5"],
}

function applyBrandColors(colors: Partial<BrandColors>) {
  const root = document.documentElement
  for (const [key, vars] of Object.entries(cssVarMap)) {
    const value = colors[key as keyof BrandColors]
    if (value) {
      for (const v of vars) {
        root.style.setProperty(v, value)
      }
    }
  }
}

type BrandContextType = {
  colors: BrandColors | null
  apply: (colors: Partial<BrandColors>) => void
}

const BrandContext = createContext<BrandContextType | null>(null)

const defaultColors: BrandColors = {
  primaryColor: "#1a8a8a",
  primaryForeground: "#ffffff",
  accentColor: "#d5eded",
  accentForeground: "#0d4a4a",
  secondaryColor: "#e0e8ec",
  secondaryForeground: "#1e2d3d",
  sidebarColor: "#1a2533",
  sidebarForeground: "#dfe5ea",
  sidebarPrimary: "#1a8a8a",
  sidebarAccent: "#243340",
  chart1: "#1a8a8a",
  chart2: "#3aae8e",
  chart3: "#2d4f72",
  chart4: "#c4a035",
  chart5: "#b84a1a",
}

export function BrandProvider({ children }: { children: ReactNode }) {
  const [colors, setColors] = useState<BrandColors | null>(null)
  const { isAuthenticated } = useAuth()
  const { data } = useBrandSettings(isAuthenticated)

  const apply = useCallback((newColors: Partial<BrandColors>) => {
    setColors((prev) => {
      const merged = { ...defaultColors, ...prev, ...newColors } as BrandColors
      applyBrandColors(merged)
      return merged
    })
  }, [])

  useEffect(() => {
    if (data) {
      const mapped: BrandColors = {
        primaryColor: data.primaryColor,
        primaryForeground: data.primaryForeground,
        accentColor: data.accentColor,
        accentForeground: data.accentForeground,
        secondaryColor: data.secondaryColor,
        secondaryForeground: data.secondaryForeground,
        sidebarColor: data.sidebarColor,
        sidebarForeground: data.sidebarForeground,
        sidebarPrimary: data.sidebarPrimary,
        sidebarAccent: data.sidebarAccent,
        chart1: data.chart1,
        chart2: data.chart2,
        chart3: data.chart3,
        chart4: data.chart4,
        chart5: data.chart5,
      }
      setColors(mapped)
      applyBrandColors(mapped)
    }
  }, [data])

  return (
    <BrandContext.Provider value={{ colors: colors ?? defaultColors, apply }}>
      {children}
    </BrandContext.Provider>
  )
}

export function useBrand() {
  const ctx = useContext(BrandContext)
  if (!ctx) throw new Error("useBrand must be used within BrandProvider")
  return ctx
}
