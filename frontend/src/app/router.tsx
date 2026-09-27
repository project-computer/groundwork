import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
import { PageLayout, Spinner } from "@primer/react"
import { Blankslate } from "@primer/react/experimental"
import { useAuth } from "@/features/auth/AuthContext"
import { AppSidebar } from "@/app/layout/app-sidebar"
import { MobileNav } from "@/app/layout/mobile-nav"
import LoginPage from "@/pages/LoginPage"
import DashboardPage from "@/pages/DashboardPage"
import PatientsPage from "@/pages/PatientsPage"
import AppointmentsPage from "@/pages/AppointmentsPage"
import VisitsPage from "@/pages/VisitsPage"
import VisitDetailPage from "@/pages/VisitDetailPage"
import QueuePage from "@/pages/QueuePage"
import BillingPage from "@/pages/BillingPage"
import PrescriptionsPage from "@/pages/PrescriptionsPage"
import MedicalRecordsPage from "@/pages/MedicalRecordsPage"

function ProtectedLayout() {
  const { isAuthenticated, loading } = useAuth()

  if (loading) {
    return (
      <Blankslate>
        <Blankslate.Visual>
          <Spinner size="large" />
        </Blankslate.Visual>
        <Blankslate.Heading>Loading…</Blankslate.Heading>
      </Blankslate>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <AppSidebar />
      <div style={{ display: "flex", flex: 1, flexDirection: "column", minWidth: 0 }}>
        <MobileNav />
        <PageLayout containerWidth="full" padding="normal">
          <PageLayout.Content>
            <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/patients" element={<PatientsPage />} />
            <Route path="/appointments" element={<AppointmentsPage />} />
            <Route path="/visits" element={<VisitsPage />} />
            <Route path="/visits/:id" element={<VisitDetailPage />} />
            <Route path="/queue" element={<QueuePage />} />
            <Route path="/records" element={<MedicalRecordsPage />} />
            <Route path="/billing" element={<BillingPage />} />
            <Route path="/prescriptions" element={<PrescriptionsPage />} />
            </Routes>
          </PageLayout.Content>
        </PageLayout>
      </div>
    </div>
  )
}

export default function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/*" element={<ProtectedLayout />} />
      </Routes>
    </BrowserRouter>
  )
}
