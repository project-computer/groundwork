import { PawPrint, CalendarDays, Receipt, DollarSign, ClipboardPlus, Users } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { getDashboardStats, getVisits } from "@/lib/store"

export function DashboardStats() {
  const stats = getDashboardStats()
  const queueCount = getVisits().filter(v => v.status === "Waiting" || v.status === "In Examination").length

  const cards = [
    { label: "Active Patients", value: stats.totalPets, icon: PawPrint, color: "bg-primary/10 text-primary" },
    { label: "Today's Appointments", value: stats.todayAppointments, icon: CalendarDays, color: "bg-chart-2/15 text-chart-2" },
    { label: "Pending Bills", value: stats.pendingBills, icon: Receipt, color: "bg-warning/15 text-warning" },
    { label: "Total Revenue", value: `$${stats.totalRevenue.toFixed(2)}`, icon: DollarSign, color: "bg-success/15 text-success" },
    { label: "Active OPD Cases", value: stats.activeOpd, icon: ClipboardPlus, color: "bg-chart-3/15 text-chart-3" },
    { label: "In Queue", value: queueCount, icon: Users, color: "bg-chart-5/15 text-chart-5" },
  ]

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {cards.map((card) => (
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
  )
}
