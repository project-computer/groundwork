import { Link, useLocation } from "react-router-dom"
import { useState } from "react"
import { NavList, IconButton, Heading } from "@primer/react"
import { ThreeBarsIcon, XIcon } from "@primer/octicons-react"
import {
  LayoutDashboard, PawPrint, CalendarDays, Receipt, Pill,
  Stethoscope, ClipboardPlus, Users, FileHeart,
} from "lucide-react"

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
    <div className="mobile-nav" style={{ display: "none" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid var(--borderColor-default)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 32, height: 32, borderRadius: 8, background: "var(--bgColor-accent-emphasis)" }}>
            <Stethoscope size={16} color="white" />
          </div>
          <Heading as="h2" sx={{ fontSize: 2 }}>VetCare</Heading>
        </div>
        <IconButton
          icon={open ? XIcon : ThreeBarsIcon}
          aria-label="Toggle menu"
          variant="invisible"
          onClick={() => setOpen(!open)}
        />
      </header>
      {open && (
        <nav style={{ padding: 12, borderBottom: "1px solid var(--borderColor-default)" }}>
          <NavList>
            {navItems.map((item) => {
              const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href))
              return (
                <NavList.Item key={item.href} as={Link} to={item.href} aria-current={isActive ? "page" : undefined} onClick={() => setOpen(false)}>
                  <item.icon size={16} />
                  {item.label}
                </NavList.Item>
              )
            })}
          </NavList>
        </nav>
      )}
      <style>{`@media (max-width: 767px) { .mobile-nav { display: block !important; } }`}</style>
    </div>
  )
}
