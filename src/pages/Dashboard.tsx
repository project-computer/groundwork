import { DashboardStats } from "@/components/dashboard/dashboard-stats"
import { RecentAppointments } from "@/components/dashboard/recent-appointments"
import { RevenueOverview } from "@/components/dashboard/revenue-overview"
import { QuickActions } from "@/components/dashboard/quick-actions"

export default function DashboardPage() {
  return (
    <div className="p-4 lg:p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground text-balance">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Welcome back, Dr. Williams. Here is your clinic overview for today.
        </p>
      </div>
      <DashboardStats />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
        <div className="lg:col-span-2">
          <RevenueOverview />
        </div>
        <div>
          <QuickActions />
        </div>
      </div>
      <div className="mt-6">
        <RecentAppointments />
      </div>
    </div>
  )
}
