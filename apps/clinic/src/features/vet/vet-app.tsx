'use client'

import { CalendarDays, LayoutDashboard, PawPrint, RefreshCw, Stethoscope } from 'lucide-react'
import { useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AppHeader } from './app-header'
import { AppointmentsPanel } from './appointments-panel'
import { ConsultPanel } from './consult-panel'
import { Dashboard } from './dashboard'
import { PatientsPanel } from './patients-panel'
import { SyncPanel } from './sync-panel'

const TABS = [
  { value: 'dashboard', label: 'Overview', icon: LayoutDashboard },
  { value: 'patients', label: 'Patients', icon: PawPrint },
  { value: 'appointments', label: 'Schedule', icon: CalendarDays },
  { value: 'consult', label: 'Consult', icon: Stethoscope },
  { value: 'sync', label: 'Sync & Backup', icon: RefreshCw },
] as const

export type TabValue = (typeof TABS)[number]['value']

export function VetApp() {
  const [tab, setTab] = useState<TabValue>('dashboard')

  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader onOpenSync={() => setTab('sync')} />
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 md:px-6">
        <Tabs value={tab} onValueChange={(v) => setTab(v as TabValue)} className="gap-6">
          <TabsList className="w-full sm:w-fit">
            {TABS.map(({ value, label, icon: Icon }) => (
              <TabsTrigger key={value} value={value} className="flex-1 gap-2 sm:flex-none">
                <Icon aria-hidden="true" />
                <span className="sr-only sm:not-sr-only">{label}</span>
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value="dashboard">
            <Dashboard onNavigate={setTab} />
          </TabsContent>
          <TabsContent value="patients">
            <PatientsPanel />
          </TabsContent>
          <TabsContent value="appointments">
            <AppointmentsPanel />
          </TabsContent>
          <TabsContent value="consult">
            <ConsultPanel />
          </TabsContent>
          <TabsContent value="sync">
            <SyncPanel />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  )
}
