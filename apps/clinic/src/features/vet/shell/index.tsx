import { useMemo, useState } from 'react'
import {
  BarChart3,
  CalendarDays,
  ClipboardList,
  CreditCard,
  LayoutDashboard,
  Lock,
  Menu,
  Package,
  PawPrint,
  ShieldCheck,
  Stethoscope,
  Settings2,
  Users,
  X,
} from 'lucide-react'
import { msg } from '@lingui/core/macro'
import type { MessageDescriptor } from '@lingui/core'
import { Trans, useLingui } from '@lingui/react/macro'
import { useClinic, usePermission, type View } from '@/lib/vet/store'
import { initials, roleLabel, todayKey } from '@/lib/vet/format'
import { NotificationCenter } from './notification-center'
import { ThemeToggle } from './theme-toggle'
import { ReportsView } from '../reports-view'
import { ScheduleView } from '../schedule-view'
import { Dashboard } from '../dashboard'
import { Owners } from '../owners'
import { Consultations } from '../consultations'
import { Billing } from '../billing'
import { Inventory } from '../inventory'
import { RecordsView } from '../records'
import { SettingsView } from '../settings'
import { StaffView } from '../staff'

import { LockScreen } from '../lock-screen'
import { LanguageToggle } from '../language-toggle'
import { SaveErrorBanner } from '../save-error-banner'
import { WorkspaceDialog, type WorkspaceTab } from '../workspace'

interface NavEntry {
  id: View
  label: MessageDescriptor
  icon: typeof LayoutDashboard
  /** Rendered as a sub-item beneath the preceding top-level entry. */
  nested?: boolean
}

const nav: readonly NavEntry[] = [
  { id: 'dashboard', label: msg`Dashboard`, icon: LayoutDashboard },
  { id: 'schedule', label: msg`Appointments & Queue`, icon: CalendarDays },
  { id: 'owners', label: msg`Owners & Patients`, icon: Users },
  { id: 'records', label: msg`Medical Records`, icon: Stethoscope },
  { id: 'consult', label: msg`Consultation`, icon: ClipboardList, nested: true },
  { id: 'inventory', label: msg`Pharmacy & Inventory`, icon: Package },
  { id: 'billing', label: msg`Billing & Payments`, icon: CreditCard },
  { id: 'reports', label: msg`Reports`, icon: BarChart3 },
  { id: 'staff', label: msg`Staff & Permissions`, icon: ShieldCheck },
  { id: 'settings', label: msg`Settings`, icon: Settings2 },
]

type SetView = (view: View) => void

export const ClinicApp = () => {
  const { data, session, user, dispatch } = useClinic()
  const { t, i18n } = useLingui()
  const [mobileNav, setMobileNav] = useState(false)
  const [query, setQuery] = useState('')
  const [showOwnerForm, setShowOwnerForm] = useState(false)
  const [workspace, setWorkspace] = useState<WorkspaceTab | null>(null)
  const canWrite = usePermission('records.write').allowed
  const activeView = session.view
  const setView: SetView = (view) => {
    // Entering Consultation from the sidebar starts from the current open visit
    // (or the picker) rather than reopening whichever encounter was last viewed.
    const patch: { view: View; activeEncounterId?: string } = { view }
    if (view === 'consult') patch.activeEncounterId = undefined
    dispatch({ type: 'session', patch })
    setShowOwnerForm(false)
    setMobileNav(false)
  }
  const openRegistration = () => {
    setView('owners')
    if (canWrite) setShowOwnerForm(true)
  }
  const openConsult = (encounterId: string) => {
    dispatch({ type: 'session', patch: { view: 'consult', activeEncounterId: encounterId } })
    setMobileNav(false)
  }
  const today = todayKey()
  const counts = useMemo(
    () => ({
      today: data.appointments.filter((a) => a.startsAt.startsWith(today)).length,
      pending: data.outbox.length,
    }),
    [data, today],
  )

  // A locked session never renders clinic data — the gate is the only screen.
  if (session.locked) return <LockScreen />

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}>
        <div className="brand">
          <div className="brand-mark">
            <PawPrint size={19} />
          </div>
          <div>
            <strong>Vettera</strong>
            <span><Trans>Clinic workspace</Trans></span>
          </div>
          <button className="icon-button mobile-close" onClick={() => setMobileNav(false)} aria-label={t`Close menu`}>
            <X size={18} />
          </button>
        </div>
        <button
          type="button"
          className="clinic-switch"
          onClick={() => setWorkspace('clinic')}
          aria-haspopup="dialog"
          aria-label={t`Manage ${data.clinic.name} and account`}
          title={t`Clinic & account`}
        >
          <div className="clinic-avatar">{initials(data.clinic.name)}</div>
          <div>
            <strong>{data.clinic.name}</strong>
            <span><Trans>Local clinic</Trans></span>
          </div>
          <span className="chevron" aria-hidden="true">⌄</span>
        </button>
        <nav className="main-nav" aria-label={t`Main navigation`}>
          {nav.map(({ id, label, icon: Icon, nested }) => (
            <button
              key={id}
              onClick={() => setView(id)}
              className={`nav-item${activeView === id ? ' active' : ''}${nested ? ' nav-item-nested' : ''}`}
            >
              <Icon size={nested ? 15 : 18} />
              <span>{i18n._(label)}</span>
              {id === 'dashboard' && <em>{counts.today}</em>}
              {id === 'settings' && counts.pending > 0 && <em className="nav-dot">{counts.pending}</em>}
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <button
            type="button"
            className="profile profile-button"
            onClick={() => setWorkspace('account')}
            aria-haspopup="dialog"
            aria-label={t`Open my account (${user.name})`}
            title={t`My account`}
          >
            <div className="avatar">{initials(user.name)}</div>
            <div>
              <strong>{user.name}</strong>
              <span>{roleLabel[user.role]}</span>
            </div>
            <span className="more" aria-hidden="true">•••</span>
          </button>
        </div>
      </aside>
      {mobileNav && (
        <button
          className="sidebar-backdrop"
          onClick={() => setMobileNav(false)}
          aria-label={t`Close navigation`}
        />
      )}
      <main className="main-content">
        <header className="topbar">
          <button className="icon-button menu-button" onClick={() => setMobileNav(true)} aria-label={t`Open menu`}>
            <Menu size={20} />
          </button>
          <div className="breadcrumbs">
            <span>{data.clinic.name}</span>
            <span>/</span>
            <strong>{activeView === 'consult' ? t`Consultation` : i18n._(nav.find((item) => item.id === activeView)?.label ?? msg`Dashboard`)}</strong>
          </div>
          <div className="top-actions">
            <NotificationCenter setView={setView} />
            <LanguageToggle />
            <ThemeToggle />
            <button
              className="icon-button"
              onClick={() => dispatch({ type: 'session', patch: { locked: true } })}
              aria-label={t`Lock screen`}
              title={t`Lock screen`}
            >
              <Lock size={18} />
            </button>
            <div className="connection">
              <span className="pulse" /> <span>{session.lanOnline ? t`Local server` : t`Server offline`}</span>
            </div>
            <button
              className="avatar top-avatar"
              onClick={() => setWorkspace('account')}
              aria-haspopup="dialog"
              aria-label={t`Account settings for ${user.name}`}
              title={t`My account`}
            >
              {initials(user.name)}
            </button>
          </div>
        </header>
        <SaveErrorBanner />
        <div className="page-wrap">
          {activeView === 'dashboard' && (
            <Dashboard
              onNavigate={setView}
              onStart={(id) => dispatch({ type: 'startEncounter', appointmentId: id })}
              onRegisterPatient={openRegistration}
              canRegister={canWrite}
            />
          )}
          {activeView === 'schedule' && <ScheduleView />}
          {activeView === 'owners' && (
            <Owners
              query={query}
              setQuery={setQuery}
              showForm={showOwnerForm}
              setShowForm={setShowOwnerForm}
              canWrite={canWrite}
            />
          )}
          {activeView === 'records' && <RecordsView onOpenConsult={openConsult} />}
          {activeView === 'consult' && <Consultations onOpen={openConsult} />}
          {activeView === 'inventory' && <Inventory />}
          {activeView === 'billing' && <Billing />}
          {activeView === 'reports' && <ReportsView />}
          {activeView === 'staff' && <StaffView />}
          {activeView === 'settings' && <SettingsView onManageClinic={() => setWorkspace('clinic')} />}
        </div>
      </main>
      {workspace && (
        <WorkspaceDialog
          initialTab={workspace}
          onClose={() => setWorkspace(null)}
          onNavigate={(view) => {
            setWorkspace(null)
            setView(view)
          }}
        />
      )}
    </div>
  )
}

