import { Box, Heading, Text, Button, Label } from "@primer/react"
import { useAuth } from "@/features/auth/AuthContext"
import { useDashboardStats, useRevenue } from "@/features/dashboard/api"
import { useTodayAppointments } from "@/features/appointments/api"
import { useVisits } from "@/features/visits/api"
import { DataTable } from "@primer/react/experimental"
import { Link } from "react-router-dom"
import {
  PawPrint, CalendarDays, Receipt, DollarSign, ClipboardPlus, Users,
  Pill, FileHeart,
} from "lucide-react"
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip } from "recharts"

const quickActions = [
  { label: "Add Patient", href: "/patients", icon: PawPrint, description: "Register a new pet" },
  { label: "New Visit", href: "/visits", icon: ClipboardPlus, description: "Start a new case" },
  { label: "View Queue", href: "/queue", icon: Users, description: "Check patient queue" },
  { label: "Medical Records", href: "/records", icon: FileHeart, description: "Open OPD/IPD history" },
  { label: "New Appointment", href: "/appointments", icon: CalendarDays, description: "Schedule a visit" },
  { label: "Create Bill", href: "/billing", icon: Receipt, description: "Generate an invoice" },
  { label: "New Prescription", href: "/prescriptions", icon: Pill, description: "Write a prescription" },
]

type Appointment = {
  id?: string | number
  customId?: string
  petName?: string
  ownerName?: string
  time?: string
  type?: string
  status?: string
}

const statusVariant: Record<string, "accent" | "attention" | "success" | "danger" | "default"> = {
  Scheduled: "accent",
  "In Progress": "attention",
  Completed: "success",
  Cancelled: "danger",
}

export default function DashboardPage() {
  const { user } = useAuth()
  const { data: stats } = useDashboardStats()
  const { data: revenueData } = useRevenue(6)
  const { data: todayApts } = useTodayAppointments()
  const { data: visitsData } = useVisits({ limit: 100 })

  const queueCount = visitsData?.data?.filter(
    (v: { status: string }) => v.status === "Waiting" || v.status === "In Examination"
  )?.length ?? 0

  const statCards = [
    { label: "Active Patients", value: stats?.activePatients ?? 0, icon: PawPrint },
    { label: "Today's Appointments", value: stats?.todayAppointments ?? 0, icon: CalendarDays },
    { label: "Pending Bills", value: stats?.pendingVisits ?? 0, icon: Receipt },
    { label: "Month Revenue", value: `$${(stats?.monthRevenue ?? 0).toFixed(2)}`, icon: DollarSign },
    { label: "Week Revenue", value: `$${(stats?.weekRevenue ?? 0).toFixed(2)}`, icon: ClipboardPlus },
    { label: "In Queue", value: queueCount, icon: Users },
  ]

  const rawAppointments: Appointment[] = Array.isArray(todayApts) ? todayApts : todayApts?.data ?? []
  const appointments = rawAppointments.slice(0, 10).map((apt, i) => ({
    id: String(apt.id ?? apt.customId ?? i),
    customId: apt.customId ?? "",
    petName: apt.petName ?? "",
    ownerName: apt.ownerName ?? "",
    time: apt.time ?? "",
    type: apt.type ?? "",
    status: apt.status ?? "",
  }))

  return (
    <Box sx={{ p: [3, 4] }}>
      <Box sx={{ mb: 3 }}>
        <Heading as="h2" sx={{ fontSize: 4, fontWeight: "semibold" }}>Dashboard</Heading>
        <Text as="p" sx={{ fontSize: 1, color: "fg.muted", mt: 1 }}>
          Welcome back, {user?.name || "Doctor"}. Here is your clinic overview for today.
        </Text>
      </Box>

      {/* Stats */}
      <Box sx={{ display: "grid", gridTemplateColumns: ["1fr", "1fr 1fr", "1fr 1fr 1fr"], gap: 3 }}>
        {statCards.map((card) => (
          <Box key={card.label} borderColor="border.default" borderWidth={1} borderStyle="solid" borderRadius={2} sx={{ p: 3 }}>
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <Box>
                <Text as="p" sx={{ fontSize: 1, color: "fg.muted" }}>{card.label}</Text>
                <Text as="p" sx={{ fontSize: 4, fontWeight: "semibold", mt: 1 }}>{card.value}</Text>
              </Box>
              <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", width: 44, height: 44, borderRadius: 2, bg: "accent.subtle", color: "accent.fg" }}>
                <card.icon size={20} />
              </Box>
            </Box>
          </Box>
        ))}
      </Box>

      <Box sx={{ display: "grid", gridTemplateColumns: ["1fr", "1fr", "2fr 1fr"], gap: 3, mt: 3 }}>
        {/* Revenue Chart */}
        <Box borderColor="border.default" borderWidth={1} borderStyle="solid" borderRadius={2} sx={{ p: 3 }}>
          <Heading as="h2" sx={{ fontSize: 2, fontWeight: "semibold", mb: 2 }}>Revenue Overview</Heading>
          {revenueData && Array.isArray(revenueData) && revenueData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={revenueData}>
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip formatter={((value?: number | string) => [`$${Number(value ?? 0).toFixed(2)}`, "Revenue"]) as never} />
                <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <Box sx={{ height: 280, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Text sx={{ color: "fg.muted" }}>No revenue data available</Text>
            </Box>
          )}
        </Box>

        {/* Quick Actions */}
        <Box borderColor="border.default" borderWidth={1} borderStyle="solid" borderRadius={2} sx={{ p: 3 }}>
          <Heading as="h2" sx={{ fontSize: 2, fontWeight: "semibold", mb: 2 }}>Quick Actions</Heading>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {quickActions.map((action) => (
              <Link key={action.label} to={action.href} style={{ textDecoration: "none" }}>
                <Button sx={{ width: "100%", justifyContent: "flex-start", height: "auto", py: 2 }}>
                  <Box as="span" sx={{ display: "flex", alignItems: "center", justifyContent: "center", width: 32, height: 32, borderRadius: 2, bg: "accent.subtle", mr: 2 }}>
                    <action.icon size={16} />
                  </Box>
                  <Box as="span" sx={{ textAlign: "left" }}>
                    <Text as="p" sx={{ fontSize: 1, fontWeight: "semibold" }}>{action.label}</Text>
                    <Text as="p" sx={{ fontSize: 0, color: "fg.muted" }}>{action.description}</Text>
                  </Box>
                </Button>
              </Link>
            ))}
          </Box>
        </Box>
      </Box>

      {/* Recent Appointments */}
      <Box sx={{ mt: 3 }}>
        <Box borderColor="border.default" borderWidth={1} borderStyle="solid" borderRadius={2} sx={{ p: 3 }}>
          <Heading as="h2" sx={{ fontSize: 2, fontWeight: "semibold", mb: 2 }}>Today&apos;s Appointments</Heading>
          {appointments.length === 0 ? (
            <Text sx={{ color: "fg.muted" }}>No appointments today</Text>
          ) : (
            <DataTable
              aria-labelledby="today-appointments"
              data={appointments}
              columns={[
                { header: "ID", field: "customId", rowHeader: true },
                { header: "Pet", field: "petName" },
                { header: "Owner", field: "ownerName" },
                { header: "Time", field: "time" },
                { header: "Type", field: "type" },
                {
                  header: "Status",
                  field: "status",
                  renderCell: (row: { id: string; status: string }) => (
                    <Label variant={statusVariant[row.status] ?? "default"}>{row.status}</Label>
                  ),
                },
              ]}
            />
          )}
        </Box>
      </Box>
    </Box>
  )
}
