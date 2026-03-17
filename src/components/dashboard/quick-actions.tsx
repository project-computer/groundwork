import { Link } from "react-router-dom"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { PawPrint, CalendarDays, Receipt, Pill, ClipboardPlus, Users, FileHeart } from "lucide-react"

const actions = [
  { label: "Add Patient", href: "/patients", icon: PawPrint, description: "Register a new pet" },
  { label: "New Visit", href: "/visits", icon: ClipboardPlus, description: "Start a new case" },
  { label: "View Queue", href: "/queue", icon: Users, description: "Check patient queue" },
  { label: "Medical Records", href: "/records", icon: FileHeart, description: "Open OPD/IPD history" },
  { label: "New Appointment", href: "/appointments", icon: CalendarDays, description: "Schedule a visit" },
  { label: "Create Bill", href: "/billing", icon: Receipt, description: "Generate an invoice" },
  { label: "New Prescription", href: "/prescriptions", icon: Pill, description: "Write a prescription" },
]

export function QuickActions() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">Quick Actions</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {actions.map((action) => (
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
  )
}
