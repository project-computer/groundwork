import { useState } from "react"
import { Link, useLocation } from "react-router-dom"
import { useAuth } from "@/lib/auth"
import {
  LayoutDashboard, PawPrint, CalendarDays, Receipt, Pill,
  Stethoscope, ClipboardPlus, Users, FileHeart, LogOut,
  Palette, Send, ChevronDown, UserRound,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible"

type NavItem = { href: string; label: string; icon: typeof LayoutDashboard }
type NavSection = {
  key: string
  label: string
  icon: typeof LayoutDashboard
  items: NavItem[]
  defaultOpen?: boolean
}

const sections: NavSection[] = [
  {
    key: "counter",
    label: "Counter",
    icon: UserRound,
    defaultOpen: true,
    items: [
      { href: "/patients", label: "Patients", icon: PawPrint },
      { href: "/appointments", label: "Appointments", icon: CalendarDays },
      { href: "/billing", label: "Billing", icon: Receipt },
    ],
  },
  {
    key: "doctor",
    label: "Doctor",
    icon: Stethoscope,
    defaultOpen: true,
    items: [
      { href: "/queue", label: "Treatment OPD", icon: Users },
      { href: "/visits", label: "Treatment IPD", icon: ClipboardPlus },
      { href: "/records", label: "Treatment History", icon: FileHeart },
      { href: "/prescriptions", label: "Prescriptions", icon: Pill },
      { href: "/transfers", label: "Transfers", icon: Send },
    ],
  },
]

const adminItems: NavItem[] = [
  { href: "/brand", label: "Brand", icon: Palette },
]

export const AppSidebar = () => {
  const { pathname } = useLocation()
  const { user, logout } = useAuth()
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {}
    for (const s of sections) initial[s.key] = s.defaultOpen ?? true
    return initial
  })

  const initials = user?.name
    ? user.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : "?"

  const toggleSection = (key: string) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const isItemActive = (href: string) =>
    pathname === href || (href !== "/" && pathname.startsWith(href))

  const isSectionActive = (items: NavItem[]) =>
    items.some((item) => isItemActive(item.href))

  return (
    <aside className="hidden md:flex w-64 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
      <div className="flex items-center gap-3 px-6 py-5 border-b border-sidebar-border">
        <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-sidebar-primary">
          <Stethoscope className="w-5 h-5 text-sidebar-primary-foreground" />
        </div>
        <div>
          <h1 className="text-base font-semibold text-sidebar-foreground">VetCare</h1>
          <p className="text-xs text-sidebar-foreground/60">Clinic Manager</p>
        </div>
      </div>
      <nav className="flex-1 px-3 py-4 overflow-y-auto">
        <ul className="flex flex-col gap-1">
          <li>
            <Link
              to="/"
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                pathname === "/"
                  ? "bg-sidebar-accent text-sidebar-primary"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
              )}
            >
              <LayoutDashboard className="w-5 h-5" />
              Dashboard
            </Link>
          </li>

          {sections.map((section) => (
            <li key={section.key}>
              <Collapsible
                open={openSections[section.key]}
                onOpenChange={() => toggleSection(section.key)}
              >
                <CollapsibleTrigger asChild>
                  <button
                    className={cn(
                      "flex items-center justify-between w-full px-3 py-2 rounded-lg text-xs font-semibold uppercase tracking-wider transition-colors",
                      isSectionActive(section.items)
                        ? "text-sidebar-primary"
                        : "text-sidebar-foreground/50 hover:text-sidebar-foreground/80"
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <section.icon className="w-4 h-4" />
                      {section.label}
                    </span>
                    <ChevronDown
                      className={cn(
                        "w-4 h-4 transition-transform duration-200",
                        openSections[section.key] ? "rotate-180" : "rotate-0"
                      )}
                    />
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <ul className="flex flex-col gap-0.5 mt-1 ml-2 pl-3 border-l border-sidebar-border">
                    {section.items.map((item) => (
                      <li key={item.href}>
                        <Link
                          to={item.href}
                          className={cn(
                            "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                            isItemActive(item.href)
                              ? "bg-sidebar-accent text-sidebar-primary"
                              : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                          )}
                        >
                          <item.icon className="w-4 h-4" />
                          {item.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </CollapsibleContent>
              </Collapsible>
            </li>
          ))}

          {user?.role === "admin" && (
            <li className="mt-2 pt-2 border-t border-sidebar-border">
              <p className="px-3 py-1 text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/40">
                Admin
              </p>
              {adminItems.map((item) => (
                <Link
                  key={item.href}
                  to={item.href}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                    isItemActive(item.href)
                      ? "bg-sidebar-accent text-sidebar-primary"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                  )}
                >
                  <item.icon className="w-5 h-5" />
                  {item.label}
                </Link>
              ))}
            </li>
          )}
        </ul>
      </nav>
      <div className="px-4 py-4 border-t border-sidebar-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-sidebar-primary flex items-center justify-center text-sidebar-primary-foreground text-sm font-semibold">
              {initials}
            </div>
            <div>
              <p className="text-sm font-medium text-sidebar-foreground">{user?.name || "User"}</p>
              <p className="text-xs text-sidebar-foreground/60 capitalize">{user?.role || ""}</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={logout} className="text-sidebar-foreground/60 hover:text-sidebar-foreground">
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </aside>
  )
}
