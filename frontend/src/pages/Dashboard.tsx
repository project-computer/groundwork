import { useVisits, useUpdateVisit, useCompleteVisit, useTodayAppointments, useDashboardStats } from "@/hooks/use-queries"
import { useAuth } from "@/lib/auth"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Link, useNavigate } from "react-router-dom"
import {
  PawPrint, CalendarDays, ClipboardPlus, Users,
  Pill, FileHeart, Play, Eye, Check, Clock, Send,
} from "lucide-react"

const quickActions = [
  { label: "New Visit", href: "/visits", icon: ClipboardPlus, description: "Start a new case" },
  { label: "Add Patient", href: "/patients", icon: PawPrint, description: "Register a new pet" },
  { label: "New Prescription", href: "/prescriptions", icon: Pill, description: "Write a prescription" },
  { label: "Medical Records", href: "/records", icon: FileHeart, description: "Open OPD/IPD history" },
  { label: "New Appointment", href: "/appointments", icon: CalendarDays, description: "Schedule a visit" },
  { label: "Send Transfer", href: "/transfers", icon: Send, description: "Transfer a case" },
]

const statusColors: Record<string, string> = {
  Scheduled: "bg-primary/10 text-primary border-primary/20",
  "In Progress": "bg-warning/10 text-warning border-warning/20",
  Completed: "bg-success/10 text-success border-success/20",
  Cancelled: "bg-destructive/10 text-destructive border-destructive/20",
}

export default function DashboardPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { data: stats } = useDashboardStats()
  const { data: todayApts } = useTodayAppointments()
  const { data: visitsData } = useVisits({ limit: 200 })
  const updateMutation = useUpdateVisit()
  const completeMutation = useCompleteVisit()

  const visits = visitsData?.data ?? []
  const today = new Date().toISOString().slice(0, 10)

  const waiting = visits.filter((v: Record<string, string>) => v.status === "Waiting")
  const inExam = visits.filter((v: Record<string, string>) => v.status === "In Examination")
  const doneToday = visits.filter((v: Record<string, string>) => v.status === "Done" && (v.updatedAt || "").slice(0, 10) === today)

  const appointments = Array.isArray(todayApts) ? todayApts : todayApts?.data ?? []

  const statCards = [
    { label: "Waiting", value: waiting.length, icon: Clock, color: "bg-warning/15 text-warning" },
    { label: "In Examination", value: inExam.length, icon: Users, color: "bg-primary/10 text-primary" },
    { label: "Today's Appointments", value: stats?.todayAppointments ?? 0, icon: CalendarDays, color: "bg-chart-2/15 text-chart-2" },
    { label: "Completed Today", value: doneToday.length, icon: Check, color: "bg-success/15 text-success" },
  ]

  return (
    <div className="p-4 lg:p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground text-balance">
          Welcome back, {user?.name || "Doctor"}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
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

      {/* Queue + Schedule */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 mt-6">
        {/* Active Queue */}
        <div className="lg:col-span-3">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold">Active Queue</CardTitle>
                <Link to="/queue">
                  <Button variant="outline" size="sm">View Full Queue</Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Waiting Column */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-2 h-2 rounded-full bg-warning" />
                    <span className="text-sm font-medium text-muted-foreground">Waiting ({waiting.length})</span>
                  </div>
                  <div className="flex flex-col gap-2">
                    {waiting.length === 0 ? (
                      <div className="border border-dashed border-border rounded-lg p-4 text-center">
                        <p className="text-xs text-muted-foreground">No patients waiting</p>
                      </div>
                    ) : waiting.slice(0, 5).map((v: Record<string, unknown>) => (
                      <div key={v.id as number} className="border border-border rounded-lg p-3 hover:bg-muted/30 transition-colors">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-mono text-[10px] text-muted-foreground">{v.customId as string}</span>
                          <Badge variant="outline" className="text-[10px]">{v.purpose as string}</Badge>
                        </div>
                        <p className="text-sm font-medium text-foreground">{v.petName as string}</p>
                        <p className="text-xs text-muted-foreground">{v.ownerName as string}</p>
                        <Button
                          size="sm"
                          className="w-full mt-2 bg-primary text-primary-foreground hover:bg-primary/90 h-7 text-xs"
                          onClick={() => updateMutation.mutate({ id: v.id as number, data: { status: "In Examination" } })}
                          disabled={updateMutation.isPending}
                        >
                          <Play className="w-3 h-3 mr-1" /> Start Exam
                        </Button>
                      </div>
                    ))}
                    {waiting.length > 5 && (
                      <Link to="/queue">
                        <Button variant="ghost" size="sm" className="w-full text-xs text-muted-foreground">
                          +{waiting.length - 5} more in queue
                        </Button>
                      </Link>
                    )}
                  </div>
                </div>

                {/* In Exam Column */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-2 h-2 rounded-full bg-primary" />
                    <span className="text-sm font-medium text-muted-foreground">In Examination ({inExam.length})</span>
                  </div>
                  <div className="flex flex-col gap-2">
                    {inExam.length === 0 ? (
                      <div className="border border-dashed border-border rounded-lg p-4 text-center">
                        <p className="text-xs text-muted-foreground">No patients in exam</p>
                      </div>
                    ) : inExam.map((v: Record<string, unknown>) => (
                      <div key={v.id as number} className="border border-primary/30 rounded-lg p-3 bg-primary/5">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-mono text-[10px] text-muted-foreground">{v.customId as string}</span>
                          <Badge variant="outline" className="text-[10px]">{v.purpose as string}</Badge>
                        </div>
                        <p className="text-sm font-medium text-foreground">{v.petName as string}</p>
                        <p className="text-xs text-muted-foreground">{v.ownerName as string}</p>
                        <div className="flex gap-2 mt-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1 h-7 text-xs"
                            onClick={() => navigate(`/visits/${v.id}`)}
                          >
                            <Eye className="w-3 h-3 mr-1" /> Open
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1 h-7 text-xs"
                            onClick={() => completeMutation.mutate(v.id as number)}
                            disabled={completeMutation.isPending}
                          >
                            <Check className="w-3 h-3 mr-1" /> Done
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Today's Schedule */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">Today's Schedule</CardTitle>
            </CardHeader>
            <CardContent>
              {appointments.length === 0 ? (
                <div className="border border-dashed border-border rounded-lg p-6 text-center">
                  <CalendarDays className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No appointments today</p>
                </div>
              ) : (
                <div className="flex flex-col gap-0.5 max-h-[420px] overflow-y-auto">
                  {appointments.slice(0, 10).map((apt: Record<string, string>) => (
                    <div
                      key={apt.id || apt.customId}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <div className="text-center min-w-[44px]">
                        <p className="text-sm font-semibold text-foreground">{apt.time}</p>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{apt.petName}</p>
                        <p className="text-xs text-muted-foreground truncate">{apt.ownerName}</p>
                      </div>
                      <Badge variant="outline" className={`text-[10px] shrink-0 ${statusColors[apt.status] || ""}`}>
                        {apt.status}
                      </Badge>
                    </div>
                  ))}
                  {appointments.length > 10 && (
                    <Link to="/appointments">
                      <Button variant="ghost" size="sm" className="w-full text-xs text-muted-foreground mt-1">
                        View all {appointments.length} appointments
                      </Button>
                    </Link>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="mt-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {quickActions.map((action) => (
                <Link key={action.label} to={action.href}>
                  <Button variant="outline" className="w-full justify-center gap-2 h-auto py-3 text-foreground hover:bg-accent flex-col">
                    <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-primary/10">
                      <action.icon className="w-4 h-4 text-primary" />
                    </div>
                    <div className="text-center">
                      <p className="text-xs font-medium">{action.label}</p>
                    </div>
                  </Button>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
