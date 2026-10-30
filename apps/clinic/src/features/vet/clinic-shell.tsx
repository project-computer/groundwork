import { useEffect, useMemo, useRef, useState } from 'react'
import {
  BarChart3,
  Bell,
  CalendarDays,
  ClipboardList,
  CreditCard,
  LayoutDashboard,
  Lock,
  Menu,
  Monitor,
  Moon,
  Package,
  PawPrint,
  Plus,
  ShieldCheck,
  Stethoscope,
  Sun,
  Settings2,
  Users,
  Wifi,
  X,
} from 'lucide-react'
import { msg } from '@lingui/core/macro'
import type { MessageDescriptor } from '@lingui/core'
import { Trans, Plural, useLingui } from '@lingui/react/macro'
import { Panel, PageHeader, Pill } from '@/components/vet/fields'
import { useClinic, usePermission, type View } from '@/lib/vet/store'
import { formatMoney as formatCurrency, formatDate, formatTime, initials, invoiceTotals, itemOnHand, lotsExpiringWithin, mostUsedItems, roleLabel, statusLabel, statusTone, todayKey, vaccinationsDue } from '@/lib/vet/format'
import { getTheme, setTheme, THEME_CHOICES, watchSystemTheme, type ThemeChoice } from '@/lib/theme'
import { ReportsView } from './reports-view'
import { ScheduleView } from './schedule-view'
import { Owners } from './owners'
import { Consultations } from './consultations'
import { Billing } from './billing'
import { categoryLabel, Inventory } from './inventory'
import { RecordsView, SettingsView, StaffView } from './views'

import { LockScreen } from './lock-screen'
import { LanguageToggle } from './language-toggle'
import { SaveErrorBanner } from './save-error-banner'
import { WorkspaceDialog, type WorkspaceTab } from './workspace-dialog'

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

const greeting = (now = new Date()) => {
  const hour = now.getHours()
  if (hour < 12) return msg`Good morning`
  if (hour < 18) return msg`Good afternoon`
  return msg`Good evening`
}

const longDate = (now = new Date()) =>
  now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

type SetView = (view: View) => void

const themeIcon: Record<ThemeChoice, typeof Sun> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
}

/** One actionable item in the notification center worklist. */
interface Reminder {
  id: string
  tone: 'bad' | 'warn' | 'info'
  title: string
  detail: string
  view: View
}

const NotificationCenter = ({ setView }: { setView: SetView }) => {
  const { data } = useClinic()
  const { t, i18n } = useLingui()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  const reminders = useMemo<Reminder[]>(() => {
    const today = todayKey()
    const items: Reminder[] = []

    // Overdue vaccinations: a patient's latest next-due date in the past.
    const latestDue = new Map<string, string>()
    for (const v of data.vaccinations) {
      if (!v.nextDueAt) continue
      const current = latestDue.get(v.patientId)
      if (!current || v.nextDueAt > current) latestDue.set(v.patientId, v.nextDueAt)
    }
    for (const [patientId, due] of latestDue) {
      const dueKey = due.slice(0, 10)
      if (dueKey < today) {
        const patient = data.patients.find((p) => p.id === patientId)
        items.push({
          id: `vax-overdue-${patientId}`,
          tone: 'bad',
          title: t`Vaccination overdue — ${patient?.name ?? t`Unknown patient`}`,
          detail: t`Was due ${formatDate(due)}`,
          view: 'records',
        })
      }
    }

    // Due within 30 days.
    for (const v of vaccinationsDue(data.vaccinations, 30, today)) {
      const patient = data.patients.find((p) => p.id === v.patientId)
      items.push({
        id: `vax-due-${v.id}`,
        tone: 'warn',
        title: t`Vaccination due — ${patient?.name ?? t`Unknown`}`,
        detail: t`${v.vaccineName} · due ${formatDate(v.nextDueAt!)}`,
        view: 'records',
      })
    }

    // Low stock: on-hand at or below a non-zero reorder level.
    for (const item of data.inventoryItems) {
      if (item.reorderLevel <= 0) continue
      const onHand = itemOnHand(item.id, data.inventoryLots)
      if (onHand <= item.reorderLevel) {
        items.push({
          id: `stock-low-${item.id}`,
          tone: 'warn',
          title: t`Low stock — ${item.name}`,
          detail: t`${onHand} ${item.unit} left (reorder at ${item.reorderLevel})`,
          view: 'inventory',
        })
      }
    }

    // Lots expiring within 30 days.
    for (const lot of lotsExpiringWithin(data.inventoryLots, 30, today)) {
      const item = data.inventoryItems.find((i) => i.id === lot.itemId)
      items.push({
        id: `stock-expiry-${lot.id}`,
        tone: 'info',
        title: t`Expiring soon — ${item?.name ?? t`Item`} (${lot.lotNumber})`,
        detail: t`${lot.quantity} ${item?.unit ?? t`units`} expire ${formatDate(lot.expiryDate!)}`,
        view: 'inventory',
      })
    }

    return items.toSorted((a, b) => a.tone.localeCompare(b.tone) || a.title.localeCompare(b.title))
    // Reminder titles are translated in this memo, so a language switch is
    // intentionally a rebuild trigger even though `locale` is never read here.
    // oxlint-disable-next-line react-hooks/exhaustive-deps, react/memo-dependencies
  }, [data, t, i18n.locale])

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const badge = reminders.length > 9 ? '9+' : String(reminders.length)

  return (
    <div className="relative" ref={rootRef}>
      <button
        className="icon-button relative"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={reminders.length ? t`Notifications (${reminders.length} pending)` : t`Notifications`}
        title={t`Notifications`}
      >
        <Bell size={18} />
        {reminders.length > 0 && (
          <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-red-600 text-white text-[10px] font-bold leading-4 text-center">
            {badge}
          </span>
        )}
      </button>
      {open && (
        <div
          className="absolute right-0 top-[calc(100%+8px)] w-[min(360px,calc(100vw-32px))] max-h-[70vh] overflow-auto bg-card border border-border rounded-xl shadow-[0_12px_32px_rgb(0_0_0/0.14)] z-[60]"
          role="dialog"
          aria-label={t`Notifications`}
        >
          <div className="form-heading">
            <div>
              <strong><Trans>Notifications</Trans></strong>
              <span>
                {reminders.length === 0 ? (
                  <Trans>Nothing needs attention.</Trans>
                ) : (
                  <Plural value={reminders.length} one="# item needs attention" other="# items need attention" />
                )}
              </span>
            </div>
            <button className="icon-button" onClick={() => setOpen(false)} aria-label={t`Close notifications`}>
              <X size={16} />
            </button>
          </div>
          <div className="flex flex-col">
            {reminders.length === 0 && <p className="empty-state"><Trans>All clear — no overdue work, stock or expiry warnings.</Trans></p>}
            {reminders.map((r) => (
              <button
                key={r.id}
                className="flex items-start gap-2.5 w-full py-2.5 px-3.5 border-0 border-t border-border bg-transparent text-left cursor-pointer first:border-t-0 hover:bg-black/[0.04]"
                onClick={() => {
                  setView(r.view)
                  setOpen(false)
                }}
              >
                <Pill tone={r.tone} dot>
                  {r.tone === 'bad' ? t`overdue` : r.tone === 'warn' ? t`due soon` : t`expiring`}
                </Pill>
                <span className="flex flex-col gap-0.5 min-w-0">
                  <strong className="text-[13px]">{r.title}</strong>
                  <span className="text-xs text-muted-foreground">{r.detail}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

const themeName = {
  light: msg`light`,
  dark: msg`dark`,
  system: msg`system`,
} as const

const ThemeToggle = () => {
  const { t, i18n } = useLingui()
  const [choice, setChoice] = useState<ThemeChoice>(() => getTheme())
  useEffect(() => watchSystemTheme(), [])
  const next = THEME_CHOICES[(THEME_CHOICES.indexOf(choice) + 1) % THEME_CHOICES.length]
  const Icon = themeIcon[choice]
  return (
    <button
      className="icon-button"
      onClick={() => {
        setTheme(next)
        setChoice(next)
      }}
      title={t`Theme: ${i18n._(themeName[choice])} — switch to ${i18n._(themeName[next])}`}
      aria-label={t`Change theme (current: ${i18n._(themeName[choice])}, switches to ${i18n._(themeName[next])})`}
    >
      <Icon size={18} />
    </button>
  )
}

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

const Dashboard = ({
  onNavigate,
  onStart,
  onRegisterPatient,
  canRegister,
}: {
  onNavigate: SetView
  onStart: (id: string) => void
  onRegisterPatient: () => void
  canRegister: boolean
}) => {
  const { data, user } = useClinic()
  const { t, i18n } = useLingui()
  const today = todayKey()
  const firstName = user.name.replace(/^Dr\.\s*/, '').split(' ')[0]
  const todaysAppointments = data.appointments.filter((a) => a.startsAt.startsWith(today))
  const outstanding = data.invoices
    .filter((i) => i.status !== 'paid' && i.status !== 'void')
    .reduce((sum, invoice) => sum + invoiceTotals(invoice, data.clinic.vatRate, data.payments).balance, 0)
  const dueVaccinations = vaccinationsDue(data.vaccinations)
  return (
    <>
      <PageHeader
        title={t`${i18n._(greeting())}, ${firstName}`}
        description={t`${longDate()} · Here’s what’s happening at the clinic today.`}
        action={
          <button className="button primary" onClick={onRegisterPatient} disabled={!canRegister}>
            <Plus size={16} /> <Trans>Register patient</Trans>
          </button>
        }
      />
      <div className="stat-grid">
        <div className="stat-card">
          <span className="stat-icon teal">
            <CalendarDays size={19} />
          </span>
          <div>
            <small><Trans>Today’s appointments</Trans></small>
            <strong>{todaysAppointments.length}</strong>
            <span className="stat-note">
              <Trans>{todaysAppointments.filter((a) => a.status === 'completed').length} completed</Trans>
            </span>
          </div>
        </div>
        <div className="stat-card">
          <span className="stat-icon violet">
            <ClipboardList size={19} />
          </span>
          <div>
            <small><Trans>Open consultations</Trans></small>
            <strong>{data.encounters.filter((e) => e.status === 'open').length}</strong>
            <span className="stat-note"><Trans>Ready for notes</Trans></span>
          </div>
        </div>
        <div className="stat-card">
          <span className="stat-icon amber">
            <CreditCard size={19} />
          </span>
          <div>
            <small><Trans>Outstanding</Trans></small>
            <strong>{formatCurrency(outstanding)}</strong>
            <span className="stat-note">
              <Plural
                value={data.invoices.filter((i) => i.status !== 'paid' && i.status !== 'void').length}
                one="# invoice"
                other="# invoices"
              />
            </span>
          </div>
        </div>
        <div className="stat-card">
          <span className="stat-icon amber">
            <Stethoscope size={19} />
          </span>
          <div>
            <small><Trans>Vaccinations due (30d)</Trans></small>
            <strong>{dueVaccinations.length}</strong>
            <span className="stat-note">
              {dueVaccinations.length > 0
                ? <Trans>Next: {data.patients.find((p) => p.id === dueVaccinations[0].patientId)?.name ?? '—'}</Trans>
                : <Trans>None upcoming</Trans>}
            </span>
          </div>
        </div>
        <div className="stat-card">
          <span className="stat-icon blue">
            <Wifi size={19} />
          </span>
          <div>
            <small><Trans>Data status</Trans></small>
            <strong><Trans>Local</Trans></strong>
            <span className="stat-note"><Trans>All changes saved</Trans></span>
          </div>
        </div>
      </div>
      <div className="dashboard-grid">
        <Panel
          title={t`Today’s schedule`}
          description={t`Appointments at ${data.clinic.name}`}
          action={
            <button className="text-button" onClick={() => onNavigate('schedule')}>
              <Trans>Open calendar</Trans>
            </button>
          }
        >
          <div className="appointment-list">
            {todaysAppointments.length === 0 && (
              <p className="empty-state"><Trans>No appointments today. Enjoy the quiet — or book one from the calendar.</Trans></p>
            )}
            {todaysAppointments.map((a) => {
              const patient = data.patients.find((p) => p.id === a.patientId)
              const vet = data.users.find((u) => u.id === a.vetId)
              return (
                <div className="appointment-row" key={a.id}>
                  <time>{formatTime(a.startsAt)}</time>
                  <div className="appointment-bar">
                    <div className="pet-mini">{patient?.name.slice(0, 1)}</div>
                    <div className="appointment-main">
                      <strong>{patient?.name}</strong>
                      <span>
                        {a.reason} · {vet?.name ?? t`Unassigned`}
                      </span>
                    </div>
                    <Pill tone={statusTone(a.status)} dot>
                      {statusLabel(a.status)}
                    </Pill>
                    {a.status === 'booked' && (
                      <button className="small-button" onClick={() => onStart(a.id)}>
                        <Trans>Start consult</Trans>
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </Panel>
        <Panel title={t`Recent activity`} description={t`A traceable history of clinic changes`}>
          <div className="activity-list">
            {data.audit.slice(0, 5).map((item) => (
              <div className="activity-row" key={item.id}>
                <div className="activity-mark">
                  <ShieldCheck size={14} />
                </div>
                <div>
                  <strong>{item.summary}</strong>
                  <span>
                    {formatDate(item.occurredAt)} · {item.action}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>
      <div className="dashboard-grid">
        <Panel
          title={t`Low stock`}
          description={t`Items at or below their reorder level`}
          action={
            <button className="text-button" onClick={() => onNavigate('inventory')}>
              <Trans>Open inventory</Trans>
            </button>
          }
        >
          <div className="activity-list">
            {data.inventoryItems
              .map((item) => ({ item, onHand: itemOnHand(item.id, data.inventoryLots) }))
              .filter(({ item, onHand }) => item.reorderLevel > 0 && onHand <= item.reorderLevel)
              .toSorted((a, b) => a.onHand - b.onHand)
              .slice(0, 5)
              .map(({ item, onHand }) => (
                <div className="activity-row" key={item.id}>
                  <div className="activity-mark"><Package size={14} /></div>
                  <div>
                    <strong>{item.name}</strong>
                    <span><Trans>{onHand} {item.unit} on hand · reorder at {item.reorderLevel}</Trans></span>
                  </div>
                  <Pill tone="warn" dot><Trans>Low</Trans></Pill>
                </div>
              ))}
            {data.inventoryItems.filter((i) => i.reorderLevel > 0 && itemOnHand(i.id, data.inventoryLots) <= i.reorderLevel).length === 0 && (
              <p className="empty-state"><Trans>Every item is above its reorder level.</Trans></p>
            )}
          </div>
        </Panel>
        <Panel title={t`Expiring soon`} description={t`Active lots expiring within 30 days`}>
          <div className="activity-list">
            {lotsExpiringWithin(data.inventoryLots, 30).slice(0, 5).map((lot) => {
              const item = data.inventoryItems.find((i) => i.id === lot.itemId)
              const itemName = item?.name ?? t`Item`
              const unit = item?.unit ?? t`units`
              return (
                <div className="activity-row" key={lot.id}>
                  <div className="activity-mark"><CalendarDays size={14} /></div>
                  <div>
                    <strong><Trans>{itemName} — lot {lot.lotNumber}</Trans></strong>
                    <span><Trans>{lot.quantity} {unit} · expires {lot.expiryDate}</Trans></span>
                  </div>
                  <Pill tone="warn" dot>{lot.expiryDate}</Pill>
                </div>
              )
            })}
            {lotsExpiringWithin(data.inventoryLots, 30).length === 0 && (
              <p className="empty-state"><Trans>Nothing expires in the next 30 days.</Trans></p>
            )}
          </div>
        </Panel>
        <Panel title={t`Top used medicines`} description={t`By dispensed quantity over the last 30 days`}>
          <div className="activity-list">
            {mostUsedItems(data.inventoryItems, data.stockMovements, data.inventoryLots, 30).map(({ item, usedQty }) => (
              <div className="activity-row" key={item.id}>
                <div className="activity-mark"><ClipboardList size={14} /></div>
                <div>
                  <strong>{item.name}</strong>
                  <span>{categoryLabel[item.category] ? i18n._(categoryLabel[item.category]) : item.category}</span>
                </div>
                <Pill tone="info"><Trans>{usedQty} used</Trans></Pill>
              </div>
            ))}
            {mostUsedItems(data.inventoryItems, data.stockMovements, data.inventoryLots, 30).length === 0 && (
              <p className="empty-state"><Trans>No dispenses recorded in the last 30 days.</Trans></p>
            )}
          </div>
        </Panel>
        <Panel title={t`Vaccinations due`} description={t`Boosters due or overdue within 30 days`}>
          <div className="activity-list">
            {vaccinationsDue(data.vaccinations, 30).map((v) => {
              const patient = data.patients.find((p) => p.id === v.patientId)
              const overdue = v.nextDueAt! < today
              const patientName = patient?.name ?? t`Patient`
              return (
                <div className="activity-row" key={v.id}>
                  <div className="activity-mark"><CalendarDays size={14} /></div>
                  <div>
                    <strong><Trans>{patientName} — {v.vaccineName}</Trans></strong>
                    <span><Trans>Last given {formatDate(v.administeredAt)}</Trans></span>
                  </div>
                  <Pill tone={overdue ? 'bad' : 'warn'} dot>{overdue ? t`Overdue ${v.nextDueAt}` : t`Due ${v.nextDueAt}`}</Pill>
                </div>
              )
            })}
            {vaccinationsDue(data.vaccinations, 30).length === 0 && (
              <p className="empty-state"><Trans>No boosters due in the next 30 days.</Trans></p>
            )}
          </div>
        </Panel>
      </div>
    </>
  )
}
