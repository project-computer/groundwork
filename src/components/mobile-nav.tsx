import { Link, useLocation } from "react-router-dom"
import { useState } from "react"
import {
  LayoutDashboard, PawPrint, CalendarDays, Receipt, Pill,
  Stethoscope, Menu, X, ClipboardPlus, Users, FileHeart,
} from "lucide-react"
import { cn } from "@/lib/utils"

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/patients", label: "Patients", icon: PawPrint },
  { href: "/appointments", label: "Appointments", icon: CalendarDays },
  { href: "/visits", label: "Visits", icon: ClipboardPlus },
  { href: "/queue", label: "Queue", icon: Users },
  { href: "/records", label: "Records", icon: FileHeart },
  { href: "/billing", label: "Billing", icon: Receipt },
  { href: "/prescriptions", label: "Prescriptions", icon: Pill },
]

export function MobileNav() {
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)

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
            {navItems.map((item) => {
              const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href))
              return (
                <li key={item.href}>
                  <Link
                    to={item.href}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                      isActive
                        ? "bg-sidebar-accent text-sidebar-primary"
                        : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                    )}
                  >
                    <item.icon className="w-5 h-5" />
                    {item.label}
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>
      )}
    </div>
  )
}
