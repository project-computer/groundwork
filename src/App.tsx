import { BrowserRouter, Routes, Route } from "react-router-dom"
import { AppSidebar } from "@/components/app-sidebar"
import { MobileNav } from "@/components/mobile-nav"
import Dashboard from "@/pages/Dashboard"
import Patients from "@/pages/Patients"
import Appointments from "@/pages/Appointments"
import Visits from "@/pages/Visits"
import VisitDetail from "@/pages/VisitDetail"
import Queue from "@/pages/Queue"
import Billing from "@/pages/Billing"
import Prescriptions from "@/pages/Prescriptions"
import MedicalRecords from "@/pages/MedicalRecords"

export default function App() {
  return (
    <BrowserRouter>
      <div className="flex h-screen overflow-hidden">
        <AppSidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <MobileNav />
          <main className="flex-1 overflow-y-auto bg-background">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/patients" element={<Patients />} />
              <Route path="/appointments" element={<Appointments />} />
              <Route path="/visits" element={<Visits />} />
              <Route path="/visits/:id" element={<VisitDetail />} />
              <Route path="/queue" element={<Queue />} />
              <Route path="/records" element={<MedicalRecords />} />
              <Route path="/billing" element={<Billing />} />
              <Route path="/prescriptions" element={<Prescriptions />} />
            </Routes>
          </main>
        </div>
      </div>
    </BrowserRouter>
  )
}
