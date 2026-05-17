import { useState, useEffect } from "react"
import { useBrandSettings, useUpdateBrandSettings } from "@/hooks/use-queries"
import { useBrand, type BrandColors } from "@/lib/brand"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { useAuth } from "@/lib/auth"
import { Palette, RotateCcw, Save, Eye } from "lucide-react"
import { toast } from "sonner"

type ColorField = { key: keyof BrandColors; label: string }

const colorGroups: { title: string; description: string; fields: ColorField[] }[] = [
  {
    title: "Primary Brand",
    description: "Main brand color used for buttons, links, and highlights",
    fields: [
      { key: "primaryColor", label: "Primary Color" },
      { key: "primaryForeground", label: "Primary Text" },
    ],
  },
  {
    title: "Accent",
    description: "Used for hover states, highlights, and secondary emphasis",
    fields: [
      { key: "accentColor", label: "Accent Color" },
      { key: "accentForeground", label: "Accent Text" },
    ],
  },
  {
    title: "Secondary",
    description: "Subtle backgrounds and muted elements",
    fields: [
      { key: "secondaryColor", label: "Secondary Color" },
      { key: "secondaryForeground", label: "Secondary Text" },
    ],
  },
  {
    title: "Sidebar",
    description: "Navigation sidebar background and text colors",
    fields: [
      { key: "sidebarColor", label: "Sidebar Background" },
      { key: "sidebarForeground", label: "Sidebar Text" },
      { key: "sidebarPrimary", label: "Sidebar Primary" },
      { key: "sidebarAccent", label: "Sidebar Hover" },
    ],
  },
  {
    title: "Chart Colors",
    description: "Colors used in dashboard charts and graphs",
    fields: [
      { key: "chart1", label: "Chart 1" },
      { key: "chart2", label: "Chart 2" },
      { key: "chart3", label: "Chart 3" },
      { key: "chart4", label: "Chart 4" },
      { key: "chart5", label: "Chart 5" },
    ],
  },
]

const defaults: BrandColors = {
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

function ColorPicker({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="relative">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-10 h-10 rounded-lg border border-border cursor-pointer appearance-none bg-transparent p-0.5 [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded-md [&::-moz-color-swatch]:rounded-md [&::-moz-color-swatch]:border-none [&::-webkit-color-swatch]:border-none"
        />
      </div>
      <div className="flex-1 min-w-0">
        <Label className="text-sm mb-1 block">{label}</Label>
        <Input
          value={value}
          onChange={(e) => {
            const v = e.target.value
            if (/^#[0-9a-fA-F]{0,6}$/.test(v) || v === "") onChange(v)
          }}
          onBlur={(e) => {
            const v = e.target.value
            if (!/^#[0-9a-fA-F]{6}$/.test(v)) onChange(value)
          }}
          className="h-8 font-mono text-xs"
          maxLength={7}
        />
      </div>
    </div>
  )
}

export default function BrandSettingsPage() {
  const { user } = useAuth()
  const { data } = useBrandSettings()
  const updateBrand = useUpdateBrandSettings()
  const { apply } = useBrand()

  const [form, setForm] = useState<BrandColors>(defaults)

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
      setForm(mapped)
    }
  }, [data])

  const handleChange = (key: keyof BrandColors, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }))
    apply({ [key]: value })
  }

  const handleSave = async () => {
    try {
      await updateBrand.mutateAsync(form)
      toast.success("Brand settings saved successfully")
    } catch {
      toast.error("Failed to save brand settings")
    }
  }

  const handleReset = () => {
    setForm(defaults)
    apply(defaults)
  }

  if (user?.role !== "admin") {
    return (
      <div className="p-4 lg:p-6">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Palette className="w-12 h-12 text-muted-foreground mb-4" />
            <h2 className="text-lg font-semibold">Access Denied</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Only administrators can manage brand settings.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="p-4 lg:p-6 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Brand Settings</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Customize the clinic's colors to match your customer's brand identity.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleReset}>
            <RotateCcw className="w-4 h-4 mr-2" />
            Reset to Default
          </Button>
          <Button onClick={handleSave} disabled={updateBrand.isPending}>
            <Save className="w-4 h-4 mr-2" />
            {updateBrand.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>

      <div className="space-y-6">
        {colorGroups.map((group, gi) => (
          <Card key={group.title}>
            <CardHeader className="pb-4">
              <CardTitle className="text-base">{group.title}</CardTitle>
              <CardDescription className="text-sm">{group.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {group.fields.map((field) => (
                  <ColorPicker
                    key={field.key}
                    label={field.label}
                    value={form[field.key]}
                    onChange={(v) => handleChange(field.key, v)}
                  />
                ))}
              </div>
            </CardContent>
            {gi < colorGroups.length - 1 && <Separator />}
          </Card>
        ))}
      </div>

      <Card className="mt-6">
        <CardHeader className="pb-4">
          <CardTitle className="text-base flex items-center gap-2">
            <Eye className="w-4 h-4" />
            Live Preview
          </CardTitle>
          <CardDescription>
            Changes are applied in real-time. Click "Save Changes" to persist.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-xl border border-border overflow-hidden">
            <div className="flex">
              <div
                className="w-40 p-4 space-y-3"
                style={{ backgroundColor: form.sidebarColor }}
              >
                <div className="flex items-center gap-2 mb-4">
                  <div
                    className="w-7 h-7 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: form.sidebarPrimary }}
                  >
                    <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: form.primaryForeground }} />
                  </div>
                  <span className="text-xs font-semibold" style={{ color: form.sidebarForeground }}>VetCare</span>
                </div>
                {["Dashboard", "Patients", "Appointments"].map((item, i) => (
                  <div
                    key={item}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-md text-xs"
                    style={{
                      backgroundColor: i === 0 ? form.sidebarAccent : "transparent",
                      color: i === 0 ? form.sidebarPrimary : form.sidebarForeground,
                    }}
                  >
                    <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: i === 0 ? form.sidebarPrimary : "currentColor", opacity: i === 0 ? 1 : 0.5 }} />
                    {item}
                  </div>
                ))}
              </div>
              <div className="flex-1 p-4 space-y-3" style={{ backgroundColor: "#f8fafb" }}>
                <div className="flex gap-3">
                  {[
                    { bg: form.primaryColor, fg: form.primaryForeground, label: "Primary" },
                    { bg: form.accentColor, fg: form.accentForeground, label: "Accent" },
                    { bg: form.secondaryColor, fg: form.secondaryForeground, label: "Secondary" },
                  ].map((c) => (
                    <div key={c.label} className="flex-1 rounded-lg p-3" style={{ backgroundColor: c.bg }}>
                      <div className="w-6 h-1.5 rounded mb-2" style={{ backgroundColor: c.fg, opacity: 0.8 }} />
                      <div className="text-[10px] font-medium" style={{ color: c.fg }}>{c.label}</div>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  {[form.chart1, form.chart2, form.chart3, form.chart4, form.chart5].map((c, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1">
                      <div
                        className="w-full h-16 rounded-md"
                        style={{ backgroundColor: c }}
                      />
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button
                    className="px-3 py-1.5 rounded-md text-xs font-medium"
                    style={{ backgroundColor: form.primaryColor, color: form.primaryForeground }}
                  >
                    Save
                  </button>
                  <button
                    className="px-3 py-1.5 rounded-md text-xs font-medium border"
                    style={{ borderColor: form.primaryColor, color: form.primaryColor }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
