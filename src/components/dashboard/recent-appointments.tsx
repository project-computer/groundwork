import { Link } from "react-router-dom"
import { getAppointments } from "@/lib/store"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Clock, ArrowRight } from "lucide-react"

const statusColors: Record<string, string> = {
  Scheduled: "bg-primary/10 text-primary border-primary/20",
  "In Progress": "bg-warning/10 text-warning border-warning/20",
  Completed: "bg-success/10 text-success border-success/20",
  Cancelled: "bg-destructive/10 text-destructive border-destructive/20",
}

export function RecentAppointments() {
  const appointments = getAppointments()
    .sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`))
    .slice(0, 5)

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base font-semibold">Recent Appointments</CardTitle>
        <Link to="/appointments">
          <Button variant="ghost" size="sm" className="text-primary hover:text-primary">
            View all <ArrowRight className="w-4 h-4 ml-1" />
          </Button>
        </Link>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y divide-border">
          {appointments.map((apt) => (
            <div key={apt.id} className="flex items-center justify-between px-6 py-3">
              <div className="flex items-center gap-4">
                <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-muted">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">{apt.petName}</p>
                  <p className="text-xs text-muted-foreground">{apt.ownerName} &middot; {apt.type}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <p className="text-sm text-foreground">{apt.time}</p>
                  <p className="text-xs text-muted-foreground">{apt.date}</p>
                </div>
                <Badge variant="outline" className={statusColors[apt.status] || ""}>{apt.status}</Badge>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
