import { useDashboardStats, useRevenue, useTodayAppointments, useVisits } from "@/hooks/use-queries"
import { useAuth } from "@/lib/auth"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
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
    { label: "Active Patients", value: stats?.activePatients ?? 0, icon: PawPrint, color: "bg-primary/10 text-primary" },
    { label: "Today's Appointments", value: stats?.todayAppointments ?? 0, icon: CalendarDays, color: "bg-chart-2/15 text-chart-2" },
    { label: "Pending Bills", value: stats?.pendingVisits ?? 0, icon: Receipt, color: "bg-warning/15 text-warning" },
    { label: "Month Revenue", value: `$${(stats?.monthRevenue ?? 0).toFixed(2)}`, icon: DollarSign, color: "bg-success/15 text-success" },
    { label: "Week Revenue", value: `$${(stats?.weekRevenue ?? 0).toFixed(2)}`, icon: ClipboardPlus, color: "bg-chart-3/15 text-chart-3" },
    { label: "In Queue", value: queueCount, icon: Users, color: "bg-chart-5/15 text-chart-5" },
  ]

  const appointments = Array.isArray(todayApts) ? todayApts : todayApts?.data ?? []

  const statusColors: Record<string, string> = {
    Scheduled: "bg-primary/10 text-primary border-primary/20",
    "In Progress": "bg-warning/10 text-warning border-warning/20",
    Completed: "bg-success/10 text-success border-success/20",
    Cancelled: "bg-destructive/10 text-destructive border-destructive/20",
  }

  return (
    <div className="p-4 lg:p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground text-balance">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Welcome back, {user?.name || "Doctor"}. Here is your clinic overview for today.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {statCards.map((card) => (
          <Card key={card.label}>
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{card.label}</p>
                  <p className="text-2xl font-semibold text-foreground mt-1">{card.value}</p>
                </div>
                <div className={`flex items-center justify-center w-11 h-11 rounded-xl ${card.color}`}>
                  <card.icon className="w-5 h-5" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
        {/* Revenue Chart */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">Revenue Overview</CardTitle>
            </CardHeader>
            <CardContent>
              {revenueData && Array.isArray(revenueData) && revenueData.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={revenueData}>
                    <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip formatter={(value: number) => [`$${value.toFixed(2)}`, "Revenue"]} />
                    <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[280px] flex items-center justify-center text-muted-foreground">
                  No revenue data available
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {quickActions.map((action) => (
              <Link key={action.label} to={action.href}>
                <Button variant="outline" className="w-full justify-start gap-3 h-auto py-3 text-foreground hover:bg-accent">
                  <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10">
                    <action.icon className="w-4 h-4 text-primary" />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-medium">{action.label}</p>
                    <p className="text-xs text-muted-foreground">{action.description}</p>
                  </div>
                </Button>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Recent Appointments */}
      <div className="mt-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Today's Appointments</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead>ID</TableHead>
                  <TableHead>Pet</TableHead>
                  <TableHead className="hidden sm:table-cell">Owner</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead className="hidden md:table-cell">Type</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {appointments.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      No appointments today
                    </TableCell>
                  </TableRow>
                ) : (
                  appointments.slice(0, 10).map((apt: Record<string, string>) => (
                    <TableRow key={apt.id || apt.customId}>
                      <TableCell className="font-mono text-xs text-muted-foreground">{apt.customId}</TableCell>
                      <TableCell className="font-medium">{apt.petName}</TableCell>
                      <TableCell className="hidden sm:table-cell">{apt.ownerName}</TableCell>
                      <TableCell>{apt.time}</TableCell>
                      <TableCell className="hidden md:table-cell">{apt.type}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={statusColors[apt.status] || ""}>{apt.status}</Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
