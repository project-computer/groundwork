import { Link, useLocation } from "react-router-dom"
import {
  LayoutDashboard, PawPrint, CalendarDays, Receipt, Pill,
  Stethoscope, ClipboardPlus, Users, FileHeart,
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

export function AppSidebar() {
  const { pathname } = useLocation()

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
      <nav className="flex-1 px-3 py-4">
        <ul className="flex flex-col gap-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href))
            return (
              <li key={item.href}>
                <Link
                  to={item.href}
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
      <div className="px-4 py-4 border-t border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-sidebar-primary flex items-center justify-center text-sidebar-primary-foreground text-sm font-semibold">
            DW
          </div>
          <div>
            <p className="text-sm font-medium text-sidebar-foreground">Dr. Williams</p>
            <p className="text-xs text-sidebar-foreground/60">Veterinarian</p>
          </div>
        </div>
      </div>
    </aside>
  )
}
