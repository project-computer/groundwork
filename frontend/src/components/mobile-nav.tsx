import { Link, useLocation } from "react-router-dom"
import { useState } from "react"
import {
  LayoutDashboard, PawPrint, CalendarDays, Receipt, Pill,
  Stethoscope, Menu, X, ClipboardPlus, Users, FileHeart,
  Send, ChevronDown, UserRound,
} from "lucide-react"
import { cn } from "@/lib/utils"
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

export const MobileNav = () => {
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {}
    for (const s of sections) initial[s.key] = s.defaultOpen ?? true
    return initial
  })

  const toggleSection = (key: string) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const isItemActive = (href: string) =>
    pathname === href || (href !== "/" && pathname.startsWith(href))

  const isSectionActive = (items: NavItem[]) =>
    items.some((item) => isItemActive(item.href))

  return (
    <div className="md:hidden">
      <header className="flex items-center justify-between px-4 py-3 bg-sidebar text-sidebar-foreground border-b border-sidebar-border">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-sidebar-primary">
            <Stethoscope className="w-4 h-4 text-sidebar-primary-foreground" />
          </div>
          <h1 className="text-base font-semibold">VetCare</h1>
        </div>
        <button onClick={() => setOpen(!open)} className="p-2 rounded-lg hover:bg-sidebar-accent" aria-label="Toggle menu">
          {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </header>
      {open && (
        <nav className="bg-sidebar border-b border-sidebar-border px-3 py-2">
          <ul className="flex flex-col gap-1">
            <li>
              <Link
                to="/"
                onClick={() => setOpen(false)}
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
                            onClick={() => setOpen(false)}
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
          </ul>
        </nav>
      )}
    </div>
  )
}
