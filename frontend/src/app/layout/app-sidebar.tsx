import { Link, useLocation } from "react-router-dom"
import { NavList, Avatar, Heading, Text, IconButton, Stack } from "@primer/react"
import { SignOutIcon } from "@primer/octicons-react"
import { useAuth } from "@/features/auth/AuthContext"
import {
  LayoutDashboard, PawPrint, CalendarDays, Receipt, Pill,
  ClipboardPlus, Users, FileHeart, Stethoscope,
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

export function AppSidebar() {
  const { pathname } = useLocation()
  const { user, logout } = useAuth()

  return (
    <Stack
      as="aside"
      direction="vertical"
      gap="none"
      className="hidden md:flex"
      style={{ width: 264, minHeight: "100vh", borderRight: "1px solid var(--borderColor-default)" }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "20px 24px", borderBottom: "1px solid var(--borderColor-default)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 36, height: 36, borderRadius: 8, background: "var(--bgColor-accent-emphasis)" }}>
          <Stethoscope size={20} color="white" />
        </div>
        <div>
          <Heading as="h2" sx={{ fontSize: 2 }}>VetCare</Heading>
          <Text as="p" sx={{ fontSize: 0, color: "fg.muted" }}>Clinic Manager</Text>
        </div>
      </div>
      <div style={{ flex: 1, padding: 12 }}>
        <NavList>
          {navItems.map((item) => {
            const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href))
            return (
              <NavList.Item key={item.href} as={Link} to={item.href} aria-current={isActive ? "page" : undefined}>
                <item.icon size={16} />
                {item.label}
              </NavList.Item>
            )
          })}
        </NavList>
      </div>
      <div style={{ padding: 16, borderTop: "1px solid var(--borderColor-default)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Avatar src="" size={32} alt={user?.name ?? "User"} />
          <div>
            <Text as="p" sx={{ fontSize: 1, fontWeight: "bold" }}>{user?.name || "User"}</Text>
            <Text as="p" sx={{ fontSize: 0, color: "fg.muted", textTransform: "capitalize" }}>{user?.role || ""}</Text>
          </div>
        </div>
        <IconButton icon={SignOutIcon} aria-label="Sign out" variant="invisible" onClick={logout} />
      </div>
    </Stack>
  )
}

