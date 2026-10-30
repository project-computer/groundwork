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
  Search,
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
import { DatePicker } from '@/components/vet/date-picker'
import { Field, NativeSelect, Panel, PageHeader, Pill } from '@/components/vet/fields'
import { useClinic, usePermission, type View } from '@/lib/vet/store'
import { buildCaseBundle, downloadCaseBundle, newShareToken } from '@/lib/vet/case-transfer'
import { formatMoney as formatCurrency, formatDate, formatTime, compareTime, initials, invoiceTotals, itemOnHand, lotsExpiringWithin, mostUsedItems, roleLabel, sexLabel, speciesLabel, statusLabel, statusTone, todayKey, vaccinationsDue } from '@/lib/vet/format'
import { SPECIES, SEXES, type InventoryCategory, type Patient, type Vitals } from '@/lib/vet/types'
import { getTheme, setTheme, THEME_CHOICES, watchSystemTheme, type ThemeChoice } from '@/lib/theme'
import { ReportsView } from './reports-view'
import { ScheduleView } from './schedule-view'
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
  { id: 'owners', label: msg`Owners & Pets`, icon: Users },
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

const splitList = (value: string) =>
  value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)

const nowIso = () => new Date().toISOString()

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

const Owners = ({
  query,
  setQuery,
  showForm,
  setShowForm,
  canWrite,
}: {
  query: string
  setQuery: (q: string) => void
  showForm: boolean
  setShowForm: (b: boolean) => void
  canWrite: boolean
}) => {
  const { data, dispatch } = useClinic()
  const { t } = useLingui()
  const [formMode, setFormMode] = useState<'new-owner' | 'existing-owner'>('new-owner')
  const [ownerId, setOwnerId] = useState('')
  const [ownerName, setOwnerName] = useState('')
  const [ownerPhone, setOwnerPhone] = useState('')
  const [petName, setPetName] = useState('')
  const [species, setSpecies] = useState<Patient['species']>('Dog')
  const [breed, setBreed] = useState('')
  const [sex, setSex] = useState<Patient['sex']>('Unknown')
  const [birthDate, setBirthDate] = useState('')
  const [microchip, setMicrochip] = useState('')
  const [detailId, setDetailId] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const ownerInputRef = useRef<HTMLInputElement>(null)
  const patientInputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (!showForm) return
    const target = formMode === 'new-owner' ? ownerInputRef.current : patientInputRef.current
    target?.focus()
  }, [showForm, formMode])
  const filtered = data.patients.filter((p) => {
    const owner = data.owners.find((o) => o.id === p.ownerId)
    return `${p.name} ${owner?.name ?? ''} ${owner?.phone ?? ''} ${owner?.email ?? ''} ${p.mrn} ${p.microchip ?? ''}`
      .toLowerCase()
      .includes(query.toLowerCase())
  })
  const resetForm = () => {
    setPetName('')
    setBreed('')
    setBirthDate('')
    setMicrochip('')
    setSex('Unknown')
  }
  const save = () => {
    const patientName = petName.trim()
    if (!patientName) return
    if (formMode === 'new-owner') {
      if (!ownerName.trim()) return
      dispatch({
        type: 'registerOwner',
        owner: { name: ownerName.trim(), phone: ownerPhone.trim(), email: '', address: '' },
        patient: {
          name: petName.trim(),
          species,
          breed: breed.trim() || t`Mixed breed`,
          sex,
          birthDate,
          weightKg: undefined,
          microchip: microchip.trim() || undefined,
          allergies: [],
          medicalAlerts: [],
          weightUnit: 'kg',
        },
      })
      setOwnerName('')
      setOwnerPhone('')
    } else {
      const owner = data.owners.find((o) => o.id === ownerId) ?? data.owners[0]
      if (!owner) return
      dispatch({
        type: 'addPatient',
        patient: {
          ownerId: owner.id,
          name: petName.trim(),
          species,
          breed: breed.trim() || t`Mixed breed`,
          sex,
          birthDate,
          weightKg: undefined,
          microchip: microchip.trim() || undefined,
          allergies: [],
          medicalAlerts: [],
          weightUnit: 'kg',
        },
      })
    }
    resetForm()
    setQuery('')
    setNotice(t`${patientName} registered.`)
    setShowForm(false)
  }
  return (
    <>
      <PageHeader
        title={t`Owners & pets`}
        description={t`Find a record quickly or register a new patient.`}
        action={
          <button className="button primary" onClick={() => { setNotice(''); setShowForm(true) }} disabled={!canWrite}>
            <Plus size={16} /> <Trans>Register Patient</Trans>
          </button>
        }
      />
      <div className="toolbar owners-toolbar">
        <div className="search-field">
          <Search size={17} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t`Search by owner, phone, patient, MRN or microchip…`}
            aria-label={t`Search owners or patients`}
          />
        </div>
        <button className="filter-button">
          <Trans>All patients</Trans> <span aria-hidden="true">⌄</span>
        </button>
      </div>
      {notice && (
        <p className="form-notice" role="status">
          {notice}
        </p>
      )}
      {showForm && (
        <div className="inline-form">
          <div className="form-heading">
            <div>
              <strong><Trans>Register patient</Trans></strong>
              <span><Trans>Owner and patient records are saved in one local transaction.</Trans></span>
            </div>
            <button className="icon-button" onClick={() => setShowForm(false)} aria-label={t`Close form`}>
              <X size={17} />
            </button>
          </div>
          <div className="seg" role="tablist" aria-label={t`Registration mode`}>
            <button role="tab" aria-selected={formMode === 'new-owner'} className={formMode === 'new-owner' ? 'active' : ''} onClick={() => setFormMode('new-owner')}>
              <Trans>New owner</Trans>
            </button>
            <button role="tab" aria-selected={formMode === 'existing-owner'} className={formMode === 'existing-owner' ? 'active' : ''} onClick={() => setFormMode('existing-owner')}>
              <Trans>Existing owner</Trans>
            </button>
          </div>
          <div className="form-grid">
            {formMode === 'new-owner' ? (
              <>
                <Field label={t`Owner name`} htmlFor="owner">
                  <input
                    id="owner"
                    name="owner-name"
                    autoComplete="off"
                    ref={ownerInputRef}
                    value={ownerName}
                    onChange={(e) => setOwnerName(e.target.value)}
                    placeholder={t`e.g. Anong Srisuk…`}
                  />
                </Field>
                <Field label={t`Owner phone`} htmlFor="owner-phone">
                  <input
                    id="owner-phone"
                    name="owner-phone"
                    autoComplete="off"
                    inputMode="tel"
                    value={ownerPhone}
                    onChange={(e) => setOwnerPhone(e.target.value)}
                    placeholder={t`e.g. 081 234 5678…`}
                  />
                </Field>
              </>
            ) : (
              <Field label={t`Owner`} htmlFor="owner-select">
                <NativeSelect id="owner-select" value={ownerId || data.owners[0]?.id || ''} onChange={(e) => setOwnerId(e.target.value)}>
                  {data.owners.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name} (<Plural value={data.patients.filter((p) => p.ownerId === o.id).length} one="# patient" other="# patients" />)
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            )}
            <Field label={t`Patient name`} htmlFor="pet">
              <input
                id="pet"
                name="patient-name"
                autoComplete="off"
                ref={patientInputRef}
                value={petName}
                onChange={(e) => setPetName(e.target.value)}
                placeholder={t`e.g. Milo…`}
              />
            </Field>
            <Field label={t`Species`} htmlFor="pet-species">
              <NativeSelect id="pet-species" value={species} onChange={(e) => setSpecies(e.target.value as Patient['species'])}>
                {SPECIES.map((s) => (
                  <option key={s} value={s}>{speciesLabel[s]}</option>
                ))}
              </NativeSelect>
            </Field>
            <Field label={t`Breed`} htmlFor="pet-breed">
              <input id="pet-breed" autoComplete="off" value={breed} onChange={(e) => setBreed(e.target.value)} placeholder={t`e.g. Golden Retriever…`} />
            </Field>
            <Field label={t`Sex`} htmlFor="pet-sex">
              <NativeSelect id="pet-sex" value={sex} onChange={(e) => setSex(e.target.value as Patient['sex'])}>
                {SEXES.map((s) => (
                  <option key={s} value={s}>{sexLabel[s]}</option>
                ))}
              </NativeSelect>
            </Field>
            <Field label={t`Date of birth`} htmlFor="pet-dob">
              <DatePicker id="pet-dob" label={t`Date of birth`} value={birthDate} onChange={setBirthDate} />
            </Field>
            <Field label={t`Microchip (optional)`} htmlFor="microchip">
              <input
                id="microchip"
                name="microchip"
                autoComplete="off"
                inputMode="numeric"
                spellCheck={false}
                value={microchip}
                onChange={(e) => setMicrochip(e.target.value)}
                placeholder={t`e.g. 985141002341238…`}
              />
            </Field>
          </div>
          <div className="form-actions">
            <button
              className="button primary"
              onClick={save}
              disabled={!petName.trim() || (formMode === 'new-owner' && !ownerName.trim()) || (formMode === 'existing-owner' && data.owners.length === 0)}
            >
              <Trans>Save Records</Trans>
            </button>
          </div>
        </div>
      )}
      <Panel
        title={filtered.length === 1 ? t`1 patient` : t`${filtered.length} patients`}
        description={t`Patient identity and owner contact details`}
      >
        <div className="records-table patients-table">
          <div className="table-head">
            <span><Trans>Patient</Trans></span>
            <span><Trans>Owner</Trans></span>
            <span><Trans>Species</Trans></span>
            <span><Trans>Last visit</Trans></span>
            <span />
          </div>
          {filtered.map((patient) => {
            const owner = data.owners.find((o) => o.id === patient.ownerId)
            const flags = [...patient.medicalAlerts, ...patient.allergies]
            return (
              <div className="table-row" key={patient.id}>
                <div className="patient-cell">
                  <div className="pet-avatar">{patient.name.slice(0, 1)}</div>
                  <div>
                    <strong>{patient.name}</strong>
                    <span>
                      {patient.mrn} · {patient.breed} · {sexLabel[patient.sex]}
                    </span>
                    {patient.originClinicName && (
                      <span className="patient-flags">
                        <Pill tone="info"><Trans>Received from {patient.originClinicName}</Trans></Pill>
                      </span>
                    )}
                    {flags.length > 0 && (
                      <span className="patient-flags">
                        {patient.allergies.map((a) => (
                          <Pill key={a} tone="bad">
                            <Trans>Allergy: {a}</Trans>
                          </Pill>
                        ))}
                        {patient.medicalAlerts.map((a) => (
                          <Pill key={a} tone="warn">
                            {a}
                          </Pill>
                        ))}
                      </span>
                    )}
                  </div>
                </div>
                <span data-label={t`Owner`}>{owner?.name ?? '—'}</span>
                <span data-label={t`Species`}>
                  <Pill tone="info">{speciesLabel[patient.species]}</Pill>
                </span>
                <span data-label={t`Last visit`}>
                  {patient.lastVisit ? formatDate(patient.lastVisit) : t`New patient`}
                </span>
                <div className="row-actions">
                  <button className="row-action" onClick={() => setDetailId(patient.id)}>
                    <Trans>View</Trans>
                  </button>
                  {canWrite && (
                    <button
                      className="row-action"
                      title={t`Export this patient's case bundle for another clinic`}
                      onClick={() => {
                        const bundle = buildCaseBundle(data, patient, newShareToken(), new Date().toISOString())
                        downloadCaseBundle(bundle)
                        dispatch({ type: 'exportCaseBundle', bundle })
                      }}
                    >
                      <Trans>Share</Trans>
                    </button>
                  )}
                </div>
              </div>
            )
          })}
          {filtered.length === 0 && <p className="empty-state patients-empty"><Trans>No patients match your search.</Trans></p>}
        </div>
      </Panel>
      {detailId && <PatientClinicalDialog patientId={detailId} onClose={() => setDetailId(null)} canWrite={canWrite} />}
    </>
  )
}

const PatientClinicalDialog = ({ patientId, onClose, canWrite }: { patientId: string; onClose: () => void; canWrite: boolean }) => {
  const { data, dispatch } = useClinic()
  const { t } = useLingui()
  const patient = data.patients.find((p) => p.id === patientId)
  const owner = data.owners.find((o) => o.id === patient?.ownerId)
  const [name, setName] = useState(patient?.name ?? '')
  const [species, setSpecies] = useState<Patient['species']>(patient?.species ?? 'Dog')
  const [breed, setBreed] = useState(patient?.breed ?? '')
  const [sex, setSex] = useState<Patient['sex']>(patient?.sex ?? 'Unknown')
  const [birthDate, setBirthDate] = useState(patient?.birthDate ?? '')
  const [weightKg, setWeightKg] = useState(patient?.weightKg ?? '')
  const [microchip, setMicrochip] = useState(patient?.microchip ?? '')
  const [allergies, setAllergies] = useState(patient?.allergies.join(', ') ?? '')
  const [alerts, setAlerts] = useState(patient?.medicalAlerts.join(', ') ?? '')
  const [ownerName, setOwnerName] = useState(owner?.name ?? '')
  const [ownerPhone, setOwnerPhone] = useState(owner?.phone ?? '')
  const [ownerEmail, setOwnerEmail] = useState(owner?.email ?? '')
  const [ownerAddress, setOwnerAddress] = useState(owner?.address ?? '')
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])
  if (!patient) return null
  const timeline = [
    ...data.encounters
      .filter((e) => e.patientId === patient.id)
      .map((e) => ({
        kind: 'visit' as const,
        at: e.openedAt,
        encounter: e,
      })),
    ...data.vaccinations
      .filter((v) => v.patientId === patient.id)
      .map((v) => ({
        kind: 'vaccination' as const,
        at: v.administeredAt,
        vaccination: v,
      })),
  ].toSorted((a, b) => compareTime(b.at, a.at))
  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="modal modal-wide" role="dialog" aria-modal="true" aria-label={t`Clinical profile for ${patient.name}`}>
        <div className="form-heading">
          <div>
            <strong>{name || patient.name}</strong>
            <span>
              {patient.mrn} · {ownerName || owner?.name || t`No owner`}{ownerPhone ? ` · ${ownerPhone}` : ''} · {speciesLabel[species]} · {breed}
            </span>
          </div>
          <button className="icon-button" onClick={onClose} aria-label={t`Close dialog`}>
            <X size={17} />
          </button>
        </div>
        <fieldset className="form-section" disabled={!canWrite}>
          <legend><Trans>Owner</Trans></legend>
          <div className="form-grid">
            <Field label={t`Owner name`} htmlFor="pt-owner-name">
              <input
                id="pt-owner-name"
                name="owner-name"
                autoComplete="off"
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                placeholder={t`e.g. Anong Srisuk…`}
              />
            </Field>
            <Field label={t`Phone`} htmlFor="pt-owner-phone">
              <input
                id="pt-owner-phone"
                name="owner-phone"
                type="tel"
                autoComplete="off"
                value={ownerPhone}
                onChange={(e) => setOwnerPhone(e.target.value)}
                placeholder={t`e.g. 081 234 5678…`}
              />
            </Field>
            <Field label={t`Email`} htmlFor="pt-owner-email">
              <input
                id="pt-owner-email"
                name="owner-email"
                type="email"
                autoComplete="off"
                value={ownerEmail}
                onChange={(e) => setOwnerEmail(e.target.value)}
                placeholder={t`e.g. anong@example.com…`}
              />
            </Field>
            <Field label={t`Address`} htmlFor="pt-owner-address">
              <input
                id="pt-owner-address"
                name="owner-address"
                autoComplete="off"
                value={ownerAddress}
                onChange={(e) => setOwnerAddress(e.target.value)}
                placeholder={t`Street, city, postcode…`}
              />
            </Field>
          </div>
        </fieldset>

        <fieldset className="form-section" disabled={!canWrite}>
          <legend><Trans>Patient</Trans></legend>
          <div className="form-grid">
            <Field label={t`Patient name`} htmlFor="pt-name">
              <input
                id="pt-name"
                name="patient-name"
                autoComplete="off"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t`e.g. Milo…`}
              />
            </Field>
            <Field label={t`Species`} htmlFor="pt-species">
              <NativeSelect id="pt-species" value={species} onChange={(e) => setSpecies(e.target.value as Patient['species'])}>
                {SPECIES.map((s) => (
                  <option key={s} value={s}>{speciesLabel[s]}</option>
                ))}
              </NativeSelect>
            </Field>
            <Field label={t`Breed`} htmlFor="pt-breed">
              <input id="pt-breed" autoComplete="off" value={breed} onChange={(e) => setBreed(e.target.value)} placeholder={t`e.g. Golden Retriever…`} />
            </Field>
            <Field label={t`Sex`} htmlFor="pt-sex">
              <NativeSelect id="pt-sex" value={sex} onChange={(e) => setSex(e.target.value as Patient['sex'])}>
                {SEXES.map((s) => (
                  <option key={s} value={s}>{sexLabel[s]}</option>
                ))}
              </NativeSelect>
            </Field>
            <Field label={t`Date of birth`} htmlFor="pt-birth">
              <DatePicker id="pt-birth" label={t`Date of birth`} value={birthDate} onChange={setBirthDate} />
            </Field>
            <Field label={t`Weight (kg)`} htmlFor="pt-weight">
              <input
                id="pt-weight"
                inputMode="decimal"
                autoComplete="off"
                value={weightKg}
                onChange={(e) => setWeightKg(e.target.value)}
                placeholder={t`e.g. 4.2…`}
              />
            </Field>
          </div>
        </fieldset>

        <fieldset className="form-section" disabled={!canWrite}>
          <legend><Trans>Clinical</Trans></legend>
          <div className="form-grid">
            <Field label={t`Microchip`} htmlFor="pt-microchip">
              <input
                id="pt-microchip"
                name="microchip"
                autoComplete="off"
                inputMode="numeric"
                spellCheck={false}
                value={microchip}
                onChange={(e) => setMicrochip(e.target.value)}
                placeholder={t`e.g. 985141002341238…`}
              />
            </Field>
            <Field label={t`Allergies (comma-separated)`} htmlFor="pt-allergies">
              <input
                id="pt-allergies"
                name="allergies"
                autoComplete="off"
                value={allergies}
                onChange={(e) => setAllergies(e.target.value)}
                placeholder={t`e.g. Penicillin, Flea topical (pyrethrin)…`}
              />
            </Field>
            <Field label={t`Medical alerts (comma-separated)`} htmlFor="pt-alerts">
              <input
                id="pt-alerts"
                name="medical-alerts"
                autoComplete="off"
                value={alerts}
                onChange={(e) => setAlerts(e.target.value)}
                placeholder={t`e.g. Aggressive during handling — muzzle first…`}
              />
            </Field>
          </div>
        </fieldset>

        <div className="panel-footer">
          <button className="button secondary" onClick={onClose}>
            <Trans>Cancel</Trans>
          </button>
          <button
            className="button primary"
            disabled={!canWrite || !name.trim() || (!!owner && !ownerName.trim())}
            onClick={() => {
              dispatch({
                type: 'updatePatient',
                id: patient.id,
                patch: {
                  name: name.trim(),
                  species,
                  breed: breed.trim(),
                  sex,
                  birthDate,
                  weightKg: weightKg.trim() || undefined,
                  microchip: microchip.trim() || undefined,
                  allergies: splitList(allergies),
                  medicalAlerts: splitList(alerts),
                },
              })
              if (owner) {
                dispatch({
                  type: 'updateOwner',
                  id: owner.id,
                  patch: {
                    name: ownerName.trim(),
                    phone: ownerPhone.trim(),
                    email: ownerEmail.trim(),
                    address: ownerAddress.trim() || undefined,
                  },
                })
              }
              onClose()
            }}
          >
            <Trans>Save Profile</Trans>
          </button>
        </div>
        <div className="timeline" aria-label={t`Medical timeline`}>
          <h3><Trans>Medical timeline</Trans></h3>
          {timeline.length === 0 && <p className="empty-state"><Trans>No visits or vaccinations recorded yet.</Trans></p>}
          {timeline.map((entry) =>
            entry.kind === 'vaccination' ? (
              <div className="timeline-row" key={entry.vaccination.id}>
                <Pill tone="info" dot><Trans>Vaccine</Trans></Pill>
                <div>
                  <strong>{entry.vaccination.vaccineName}</strong>
                  <span>
                    {formatDate(entry.vaccination.administeredAt)}
                    {entry.vaccination.lotNumber ? <> · <Trans>lot {entry.vaccination.lotNumber}</Trans></> : ''}
                    {entry.vaccination.nextDueAt ? <> · <Trans>next due {entry.vaccination.nextDueAt}</Trans></> : ''}
                  </span>
                </div>
              </div>
            ) : (
              <div className="timeline-row" key={entry.encounter.id}>
                <Pill tone={entry.encounter.status === 'open' ? 'warn' : 'ok'} dot>
                  {entry.encounter.status === 'open' ? t`Open visit` : t`Visit`}
                </Pill>
                <div>
                  <strong>
                    {formatDate(entry.encounter.openedAt)}
                    {entry.encounter.diagnoses.length > 0 && ` — ${entry.encounter.diagnoses.map((d) => d.description).join('; ')}`}
                  </strong>
                  {entry.encounter.prescriptions.length > 0 && (
                    <span>
                      <Trans>Rx: {entry.encounter.prescriptions.map((rx) => `${rx.medication} (${rx.dose} ${rx.frequency})`).join(', ')}</Trans>
                    </span>
                  )}
                  <span>
                    <Plural value={entry.encounter.notes.length} one="# note" other="# notes" />
                    {entry.encounter.vitals.weightKg ? <> · <Trans>weight {entry.encounter.vitals.weightKg} kg</Trans></> : ''}
                  </span>
                </div>
              </div>
            ),
          )}
        </div>
      </div>
    </div>
  )
}

const Consultations = ({ onOpen }: { onOpen: (encounterId: string) => void }) => {
  const { data, session, dispatch } = useClinic()
  const { t } = useLingui()
  const open =
    data.encounters.find((e) => e.id === session.activeEncounterId) ??
    data.encounters.find((e) => e.status === 'open')
  const patient = open && data.patients.find((p) => p.id === open.patientId)
  const appt = open && data.appointments.find((a) => a.id === open.appointmentId)
  const recentEncounters = data.encounters.toSorted((a, b) => compareTime(b.openedAt, a.openedAt)).slice(0, 8)
  const [note, setNote] = useState('')
  const [vitals, setVitals] = useState<Vitals>(open?.vitals ?? { weightKg: '', tempC: '', heartRate: '', respRate: '' })
  const [dxText, setDxText] = useState('')
  const [dxStatus, setDxStatus] = useState<'provisional' | 'confirmed'>('provisional')
  const [rxItemId, setRxItemId] = useState('')
  const [rxDose, setRxDose] = useState('')
  const [rxRoute, setRxRoute] = useState('PO')
  const [rxFrequency, setRxFrequency] = useState('BID')
  const [rxDuration, setRxDuration] = useState(t`7 days`)
  const [rxQuantity, setRxQuantity] = useState('1')
  const [vacName, setVacName] = useState('')
  const [vacLot, setVacLot] = useState('')
  const [vacNextDue, setVacNextDue] = useState('')
  const [followUpDate, setFollowUpDate] = useState('')
  const [followUpTime, setFollowUpTime] = useState('10:00')
  const [amendNoteId, setAmendNoteId] = useState<string | null>(null)
  const [amendBody, setAmendBody] = useState('')
  const [amendReason, setAmendReason] = useState('')
  // Reset the vitals draft when a different encounter opens. Adjusting state
  // during render keeps the reset in the same pass — no effect, no stale deps.
  const [vitalsEncounterId, setVitalsEncounterId] = useState(open?.id)
  if (open && open.id !== vitalsEncounterId) {
    setVitalsEncounterId(open.id)
    setVitals(open.vitals)
  }
  // Dispensable catalog: live inventory items (medicine/vaccine) plus legacy
  // medication products so historical prescriptions still resolve.
  const catalog = useMemo(
    () => [
      ...data.inventoryItems
        .filter((i) => i.category === 'medicine' || i.category === 'vaccine')
        .map((i) => ({ id: i.id, name: i.name, unit: i.unit })),
      ...data.products.filter((p) => p.kind === 'medication').map((p) => ({ id: p.id, name: p.name, unit: p.unit })),
    ],
    [data.inventoryItems, data.products],
  )
  const selectedRx = catalog.find((c) => c.id === rxItemId)
  /** Units left for an inventory item after what this visit already prescribed. */
  const stockLeft = (itemId: string) => {
    const already = open ? open.prescriptions.filter((rx) => rx.productId === itemId).reduce((sum, rx) => sum + rx.quantity, 0) : 0
    return itemOnHand(itemId, data.inventoryLots) - already
  }
  const selectedStock = selectedRx && data.inventoryItems.some((i) => i.id === selectedRx.id) ? stockLeft(selectedRx.id) : undefined
  const requestedQty = Math.max(1, Number(rxQuantity) || 1)
  const stockShortage = selectedStock !== undefined && requestedQty > selectedStock
  const allergyHit = patient && selectedRx ? patient.allergies.find((a) => a && selectedRx.name.toLowerCase().includes(a.toLowerCase())) : undefined
  if (!open || !patient)
    return (
      <>
        <PageHeader title={t`Consultation`} description={t`Open an appointment to start a consultation.`} />
        <Panel title={t`No active consultation`}>
          <p className="empty-state">
            <Trans>Choose a booked appointment from the calendar to begin, or open a past visit below.</Trans>
          </p>
          {recentEncounters.length > 0 && (
            <div className="activity-list">
              {recentEncounters.map((encounter) => {
                const encounterPatient = data.patients.find((p) => p.id === encounter.patientId)
                return (
                  <div className="activity-row" key={encounter.id}>
                    <div className="activity-mark"><Stethoscope size={14} /></div>
                    <div>
                      <strong>{encounterPatient?.name ?? t`Unknown patient`}</strong>
                      <span>
                        {formatDate(encounter.openedAt)} ·{' '}
                        {encounter.status === 'open' ? <Trans>Consultation in progress</Trans> : <Trans>Archived visit</Trans>}
                      </span>
                    </div>
                    <button className="small-button" onClick={() => onOpen(encounter.id)}>
                      {encounter.status === 'open' ? <Trans>Continue</Trans> : <Trans>View</Trans>}
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </Panel>
      </>
    )
  if (open.status === 'closed') {
    const invoice = data.invoices.find((i) => i.encounterId === open.id)
    const owner = data.owners.find((o) => o.id === patient.ownerId)
    const attending = data.users.find((u) => u.id === open.attendingId)
    const vitalsRows = [
      { label: t`Weight (kg)`, value: open.vitals.weightKg },
      { label: t`Temperature (°C)`, value: open.vitals.tempC },
      { label: t`Heart rate (bpm)`, value: open.vitals.heartRate },
      { label: t`Respiratory rate`, value: open.vitals.respRate },
    ]
    return (
      <>
        <PageHeader
          title={t`Consultation closed`}
          description={t`The clinical record for ${patient.name} is archived — notes, diagnoses and prescriptions are preserved.`}
          action={<Pill tone="muted" dot><Trans>Archived</Trans></Pill>}
        />
        <div className="consult-grid">
          <div className="side-stack">
            <Panel title={t`Patient snapshot`} description={t`Current patient details`}>
              <div className="patient-profile">
                <div className="large-pet-avatar">{patient.name.slice(0, 1)}</div>
                <div>
                  <h3>{patient.name}</h3>
                  <span>{patient.mrn} · {sexLabel[patient.sex]} · {patient.breed}</span>
                  <span><Trans>Owner: {owner?.name}</Trans></span>
                  <span>
                    {formatDate(open.openedAt)}
                    {open.closedAt ? <> · <Trans>Closed {formatDate(open.closedAt)}</Trans></> : null}
                    {attending ? <> · {attending.name}</> : null}
                  </span>
                </div>
              </div>
            </Panel>
            <Panel title={t`Vitals`} description={t`Weight, temperature, pulse and respiration`}>
              <div className="activity-list">
                {vitalsRows.map(({ label, value }) => (
                  <div className="activity-row" key={label}>
                    <div>
                      <strong>{label}</strong>
                      <span>{value || '—'}</span>
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
          </div>
          <div className="side-stack">
            <Panel title={t`Diagnoses`} description={t`Provisional working diagnoses and confirmed findings`}>
              <div className="rx-list">
                {open.diagnoses.length === 0 && <p className="empty-state"><Trans>No diagnoses recorded yet.</Trans></p>}
                {open.diagnoses.map((diagnosis) => (
                  <div className="rx-row" key={diagnosis.id}>
                    <div>
                      <strong>{diagnosis.description}</strong>
                      <span>{statusLabel(diagnosis.status)}</span>
                    </div>
                    <Pill tone={diagnosis.status === 'confirmed' ? 'ok' : 'warn'} dot>
                      {statusLabel(diagnosis.status)}
                    </Pill>
                  </div>
                ))}
              </div>
            </Panel>
            <Panel title={t`Prescriptions`} description={t`Dispensed from pharmacy stock when the visit closes`}>
              <div className="rx-list">
                {open.prescriptions.length === 0 && <p className="empty-state"><Trans>No prescriptions on this visit.</Trans></p>}
                {open.prescriptions.map((rx) => (
                  <div className="rx-row" key={rx.id}>
                    <div>
                      <strong>{rx.medication}</strong>
                      <span>
                        {rx.dose} · {rx.route} · {rx.frequency} · {rx.duration} · <Trans>qty {rx.quantity}</Trans>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
            <Panel title={t`Clinical notes`} description={t`Authored notes are preserved as a revision history`}>
              {open.notes.length === 0 && <p className="empty-state"><Trans>No notes were recorded for this visit.</Trans></p>}
              {open.notes.length > 0 && (
                <div className="note-history">
                  {open.notes.map((clinicalNote) => {
                    const author = data.users.find((u) => u.id === clinicalNote.authorId)
                    const amendmentReason = clinicalNote.amendReason || t`not recorded`
                    return (
                      <div key={clinicalNote.id} className={clinicalNote.amends ? 'note-entry amended' : 'note-entry'}>
                        <span>
                          {formatDate(clinicalNote.createdAt)}
                          {author ? ` · ${author.name}` : ''}
                          {clinicalNote.amends && (
                            <>
                              {' · '}
                              <Pill tone="warn" dot>
                                <Trans>Amendment</Trans>
                              </Pill>
                            </>
                          )}
                        </span>
                        <p>{clinicalNote.body}</p>
                        {clinicalNote.amends && (
                          <span className="note-amend-meta">
                            <Trans>Reason: {amendmentReason}</Trans>
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </Panel>
            <Panel title={t`Visit complete`}>
              <p className="empty-state">
                {invoice ? t`Draft invoice ${invoice.number} was created and is ready to post in Billing.` : t`No invoice was created for this visit.`}
              </p>
              <div className="panel-footer">
                <button
                  className="button primary"
                  onClick={() => dispatch({ type: 'session', patch: { view: 'billing', activeEncounterId: undefined } })}
                >
                  <Trans>Go to billing</Trans>
                </button>
              </div>
            </Panel>
          </div>
        </div>
      </>
    )
  }
  const patientVaccinations = data.vaccinations.filter((v) => v.patientId === patient.id)
  const startAmend = (noteId: string, body: string) => {
    setAmendNoteId(noteId)
    setAmendBody(body)
    setAmendReason('')
  }
  const cancelAmend = () => {
    setAmendNoteId(null)
    setAmendBody('')
    setAmendReason('')
  }
  const saveAmend = () => {
    if (!amendNoteId || !amendBody.trim() || !amendReason.trim()) return
    dispatch({ type: 'amendNote', encounterId: open.id, noteId: amendNoteId, body: amendBody, reason: amendReason })
    cancelAmend()
  }
  const addRx = () => {
    if (!selectedRx || !rxDose.trim()) return
    dispatch({
      type: 'addPrescription',
      encounterId: open.id,
      prescription: {
        productId: selectedRx.id,
        medication: selectedRx.name,
        dose: rxDose.trim(),
        route: rxRoute.trim(),
        frequency: rxFrequency.trim(),
        duration: rxDuration.trim(),
        quantity: Math.max(1, Number(rxQuantity) || 1),
      },
    })
    setRxItemId('')
    setRxDose('')
    setRxQuantity('1')
  }
  const recordVac = () => {
    if (!vacName.trim()) return
    dispatch({
      type: 'recordVaccination',
      patientId: patient.id,
      vaccination: {
        vaccineName: vacName.trim(),
        lotNumber: vacLot.trim() || undefined,
        administeredAt: nowIso(),
        nextDueAt: vacNextDue || undefined,
        encounterId: open.id,
      },
    })
    setVacName('')
    setVacLot('')
    setVacNextDue('')
  }
  const bookFollowUp = () => {
    if (!followUpDate) return
    dispatch({
      type: 'bookAppointment',
      appointment: {
        patientId: patient.id,
        startsAt: `${followUpDate}T${followUpTime || '10:00'}:00+07:00`,
        durationMin: 30,
        reason: appt ? t`Follow-up: ${appt.reason}` : t`Follow-up`,
        vetId: open.attendingId,
      },
    })
    setFollowUpDate('')
  }
  const apptSuffix = appt ? ` · ${appt.reason}` : ''
  return (
    <>
      <PageHeader
        title={t`Consultation`}
        description={t`Clinical record for ${patient.name} · ${speciesLabel[patient.species]} · ${patient.breed}${apptSuffix}`}
        action={
          <Pill tone="ok" dot>
            <Trans>Saved locally</Trans>
          </Pill>
        }
      />
      <div className="consult-grid">
        <div className="side-stack">
          <Panel title={t`Patient snapshot`} description={t`Current patient details`}>
            <div className="patient-profile">
              <div className="large-pet-avatar">{patient.name.slice(0, 1)}</div>
              <div>
                <h3>{patient.name}</h3>
                <span>
                  {patient.mrn} · {sexLabel[patient.sex]} · {patient.breed}
                </span>
                <span><Trans>Owner: {data.owners.find((o) => o.id === patient.ownerId)?.name}</Trans></span>
              </div>
            </div>
            {(patient.allergies.length > 0 || patient.medicalAlerts.length > 0) && (
              <div className="patient-flags consult-flags" role="alert">
                {patient.allergies.map((a) => (
                  <Pill key={a} tone="bad" dot>
                    <Trans>Allergy: {a}</Trans>
                  </Pill>
                ))}
                {patient.medicalAlerts.map((a) => (
                  <Pill key={a} tone="warn" dot>
                    {a}
                  </Pill>
                ))}
              </div>
            )}
          </Panel>
          <Panel title={t`Vitals`} description={t`Weight, temperature, pulse and respiration`}>
            <div className="form-grid">
              <Field label={t`Weight (kg)`} htmlFor="vt-weight">
                <input id="vt-weight" inputMode="decimal" value={vitals.weightKg} onChange={(e) => setVitals({ ...vitals, weightKg: e.target.value })} placeholder={t`e.g. 28.6`} />
              </Field>
              <Field label={t`Temperature (°C)`} htmlFor="vt-temp">
                <input id="vt-temp" inputMode="decimal" value={vitals.tempC} onChange={(e) => setVitals({ ...vitals, tempC: e.target.value })} placeholder={t`e.g. 38.6`} />
              </Field>
              <Field label={t`Heart rate (bpm)`} htmlFor="vt-hr">
                <input id="vt-hr" inputMode="numeric" value={vitals.heartRate} onChange={(e) => setVitals({ ...vitals, heartRate: e.target.value })} placeholder={t`e.g. 96`} />
              </Field>
              <Field label={t`Respiratory rate`} htmlFor="vt-rr">
                <input id="vt-rr" inputMode="numeric" value={vitals.respRate} onChange={(e) => setVitals({ ...vitals, respRate: e.target.value })} placeholder={t`e.g. 22`} />
              </Field>
            </div>
            <div className="panel-footer">
              <button
                className="button secondary"
                onClick={() => dispatch({ type: 'updateVitals', encounterId: open.id, vitals })}
              >
                <Trans>Record vitals</Trans>
              </button>
            </div>
          </Panel>
          <Panel title={t`Vaccinations`} description={t`Recorded during this visit and prior history`}>
            <div className="inline-form nested">
              <div className="form-grid">
                <Field label={t`Vaccine`} htmlFor="vac-name">
                  <input id="vac-name" list="vac-options" value={vacName} onChange={(e) => setVacName(e.target.value)} placeholder={t`e.g. Rabies vaccine…`} />
                  <datalist id="vac-options">
                    {data.inventoryItems.filter((i) => i.category === 'vaccine').map((i) => (
                      <option key={i.id} value={i.name} />
                    ))}
                  </datalist>
                </Field>
                <Field label={t`Lot number`} htmlFor="vac-lot">
                  <input id="vac-lot" value={vacLot} onChange={(e) => setVacLot(e.target.value)} placeholder={t`e.g. RAB-2610B…`} />
                </Field>
                <Field label={t`Next due`} htmlFor="vac-next">
                  <DatePicker id="vac-next" label={t`Next due`} value={vacNextDue} onChange={setVacNextDue} />
                </Field>
              </div>
              <button className="button secondary" onClick={recordVac} disabled={!vacName.trim()}>
                <Trans>Record vaccination</Trans>
              </button>
            </div>
            <div className="activity-list">
              {patientVaccinations.length === 0 && <p className="empty-state"><Trans>No vaccinations recorded for this patient.</Trans></p>}
              {patientVaccinations.map((v) => (
                <div className="activity-row" key={v.id}>
                  <div className="activity-mark"><CalendarDays size={14} /></div>
                  <div>
                    <strong>{v.vaccineName}</strong>
                    <span>
                      {formatDate(v.administeredAt)}
                      {v.lotNumber ? <> · <Trans>lot {v.lotNumber}</Trans></> : ''}
                      {v.nextDueAt ? <> · <Trans>next due {v.nextDueAt}</Trans></> : ''}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </div>
        <div className="side-stack">
          <Panel title={t`Diagnoses`} description={t`Provisional working diagnoses and confirmed findings`}>
            <div className="inline-form nested">
              <div className="form-grid">
                <Field label={t`Diagnosis`} htmlFor="dx-text">
                  <input id="dx-text" value={dxText} onChange={(e) => setDxText(e.target.value)} placeholder={t`e.g. Soft tissue strain, right stifle…`} />
                </Field>
                <Field label={t`Status`} htmlFor="dx-status">
                  <NativeSelect id="dx-status" value={dxStatus} onChange={(e) => setDxStatus(e.target.value as 'provisional' | 'confirmed')}>
                    <option value="provisional">{t`Provisional`}</option>
                    <option value="confirmed">{t`Confirmed`}</option>
                  </NativeSelect>
                </Field>
              </div>
              <button
                className="button secondary"
                disabled={!dxText.trim()}
                onClick={() => {
                  dispatch({ type: 'addDiagnosis', encounterId: open.id, diagnosis: { description: dxText.trim(), status: dxStatus } })
                  setDxText('')
                }}
              >
                <Trans>Add diagnosis</Trans>
              </button>
            </div>
            <div className="rx-list">
              {open.diagnoses.length === 0 && <p className="empty-state"><Trans>No diagnoses recorded yet.</Trans></p>}
              {open.diagnoses.map((d) => (
                <div className="rx-row" key={d.id}>
                  <div>
                    <strong>{d.description}</strong>
                    <span>{statusLabel(d.status)}</span>
                  </div>
                  {d.status === 'provisional' ? (
                    <button
                      className="small-button"
                      onClick={() => dispatch({ type: 'confirmDiagnosis', encounterId: open.id, diagnosisId: d.id })}
                      aria-label={t`Confirm diagnosis ${d.description}`}
                    >
                      <Trans>Confirm</Trans>
                    </button>
                  ) : (
                    <Pill tone="ok" dot>{statusLabel(d.status)}</Pill>
                  )}
                </div>
              ))}
            </div>
          </Panel>
          <Panel title={t`Prescriptions`} description={t`Dispensed from pharmacy stock when the visit closes`}>
            <div className="inline-form nested">
              <div className="form-grid">
                <Field label={t`Medication`} htmlFor="rx-item">
                  <NativeSelect id="rx-item" value={rxItemId} onChange={(e) => setRxItemId(e.target.value)}>
                    <option value="">{t`— select medication —`}</option>
                    {catalog.map((c) => {
                      const stock = data.inventoryItems.some((i) => i.id === c.id) ? stockLeft(c.id) : undefined
                      return (
                        <option key={c.id} value={c.id}>
                          {c.name}
                          {stock !== undefined ? <> — <Trans>{stock} {c.unit} in stock</Trans></> : ''}
                        </option>
                      )
                    })}
                  </NativeSelect>
                </Field>
                <Field label={t`Dose`} htmlFor="rx-dose">
                  <input id="rx-dose" value={rxDose} onChange={(e) => setRxDose(e.target.value)} placeholder={t`e.g. 0.1 mg/kg`} />
                </Field>
                <Field label={t`Route`} htmlFor="rx-route">
                  <input id="rx-route" value={rxRoute} onChange={(e) => setRxRoute(e.target.value)} placeholder={t`PO / SC / IM`} />
                </Field>
                <Field label={t`Frequency`} htmlFor="rx-freq">
                  <input id="rx-freq" value={rxFrequency} onChange={(e) => setRxFrequency(e.target.value)} placeholder={t`SID / BID / TID`} />
                </Field>
                <Field label={t`Duration`} htmlFor="rx-duration">
                  <input id="rx-duration" value={rxDuration} onChange={(e) => setRxDuration(e.target.value)} placeholder={t`e.g. 7 days`} />
                </Field>
                <Field label={t`Quantity`} htmlFor="rx-qty">
                  <input id="rx-qty" type="number" min="1" value={rxQuantity} onChange={(e) => setRxQuantity(e.target.value)} />
                </Field>
              </div>
              {allergyHit && (
                <p className="allergy-warning" role="alert">
                  <Pill tone="bad" dot><Trans>Allergy warning</Trans></Pill>
                  <Trans>{patient.name} is allergic to “{allergyHit}” — check this prescription before dispensing.</Trans>
                </p>
              )}
              {selectedRx && selectedStock !== undefined && (
                <p className={stockShortage ? 'form-hint is-bad' : 'form-hint'} role={stockShortage ? 'alert' : undefined}>
                  {stockShortage
                    ? t`Only ${Math.max(0, selectedStock)} ${selectedRx.unit} left in stock — reduce the quantity or receive a delivery first.`
                    : t`${selectedStock} ${selectedRx.unit} available in stock.`}
                </p>
              )}
              <button className="button secondary" onClick={addRx} disabled={!selectedRx || !rxDose.trim() || stockShortage}>
                <Trans>Add prescription</Trans>
              </button>
            </div>
            <div className="rx-list">
              {open.prescriptions.length === 0 && <p className="empty-state"><Trans>No prescriptions on this visit.</Trans></p>}
              {open.prescriptions.map((rx) => (
                <div className="rx-row" key={rx.id}>
                  <div>
                    <strong>{rx.medication}</strong>
                    <span>
                      {rx.dose} · {rx.route} · {rx.frequency} · {rx.duration} · <Trans>qty {rx.quantity}</Trans>
                    </span>
                  </div>
                  <button className="text-button" onClick={() => dispatch({ type: 'removePrescription', encounterId: open.id, prescriptionId: rx.id })}>
                    <Trans>Remove</Trans>
                  </button>
                </div>
              ))}
            </div>
          </Panel>
          <Panel title={t`Clinical notes`} description={t`Authored notes are preserved as a revision history`}>
            <textarea
              className="note-box"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              aria-label={t`Clinical notes`}
              placeholder={t`Record the consultation findings, assessment and plan…`}
            />
            <div className="panel-footer">
              <span className="save-hint">
                <span className="pulse" /> <Trans>Draft is saved locally</Trans>
              </span>
              <button
                className="button secondary"
                onClick={() => {
                  if (note.trim()) {
                    dispatch({
                      type: 'addNote',
                      encounterId: open.id,
                      body: note,
                    })
                    setNote('')
                  }
                }}
              >
                <Trans>Add note</Trans>
              </button>
              <button
                className="button primary"
                onClick={() => dispatch({ type: 'closeEncounter', encounterId: open.id })}
              >
                <Trans>Close consultation</Trans>
              </button>
            </div>
            {open.notes.length > 0 && (
              <div className="note-history">
                {open.notes.map((n) => {
                  const author = data.users.find((u) => u.id === n.authorId)
                  const amends = n.amends ? open.notes.find((x) => x.id === n.amends) : undefined
                  const amendmentReason = n.amendReason || t`not recorded`
                  return (
                    <div key={n.id} className={n.amends ? 'note-entry amended' : 'note-entry'}>
                      <span>
                        {formatDate(n.createdAt)}
                        {author ? ` · ${author.name}` : ''}
                        {n.amends && (
                          <>
                            {' · '}
                            <Pill tone="warn" dot>
                              <Trans>Amendment</Trans>
                            </Pill>
                          </>
                        )}
                      </span>
                      <p>{n.body}</p>
                      {n.amends && (
                        <span className="note-amend-meta">
                          <Trans>Reason: {amendmentReason}</Trans>
                          {amends ? <> · <Trans>supersedes an earlier note</Trans></> : <> · <Trans>original note no longer on file</Trans></>}
                        </span>
                      )}
                      {amendNoteId === n.id ? (
                        <div className="note-amend-form">
                          <Field label={t`Reason for amendment`} htmlFor="note-amend-reason">
                            <input
                              id="note-amend-reason"
                              value={amendReason}
                              onChange={(e) => setAmendReason(e.target.value)}
                              placeholder={t`e.g. Corrected the recorded dose…`}
                            />
                          </Field>
                          <textarea
                            className="note-box"
                            aria-label={t`Amended note`}
                            value={amendBody}
                            onChange={(e) => setAmendBody(e.target.value)}
                          />
                          <div className="panel-footer">
                            <button className="small-button" onClick={cancelAmend}>
                              <Trans>Cancel</Trans>
                            </button>
                            <button className="button primary" onClick={saveAmend} disabled={!amendBody.trim() || !amendReason.trim()}>
                              <Trans>Save amendment</Trans>
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button className="text-button" onClick={() => startAmend(n.id, n.body)}>
                          <Trans>Amend</Trans>
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </Panel>
          <Panel title={t`Follow-up`} description={t`Book the next visit before closing`}>
            <div className="inline-form nested">
              <div className="form-grid">
                <Field label={t`Follow-up date`} htmlFor="fu-date">
                  <DatePicker id="fu-date" label={t`Follow-up date`} value={followUpDate} onChange={setFollowUpDate} />
                </Field>
                <Field label={t`Time`} htmlFor="fu-time">
                  <input id="fu-time" type="time" value={followUpTime} onChange={(e) => setFollowUpTime(e.target.value)} />
                </Field>
              </div>
              <button className="button secondary" onClick={bookFollowUp} disabled={!followUpDate}>
                <Trans>Book follow-up</Trans>
              </button>
            </div>
          </Panel>
        </div>
      </div>
    </>
  )
}

const Billing = () => {
  const { data, dispatch } = useClinic()
  const { t } = useLingui()
  const billing = usePermission('billing.write')
  const today = todayKey()
  const [newInvoiceOpen, setNewInvoiceOpen] = useState(false)
  const [niOwnerId, setNiOwnerId] = useState('')
  const [niCatalogId, setNiCatalogId] = useState('')
  const [niQuantity, setNiQuantity] = useState('1')
  const [addItemInvoiceId, setAddItemInvoiceId] = useState<string | null>(null)
  const [addItemCatalogId, setAddItemCatalogId] = useState('')
  const [addItemQuantity, setAddItemQuantity] = useState('1')
  const [paymentInvoiceId, setPaymentInvoiceId] = useState<string | null>(null)
  const [payAmount, setPayAmount] = useState('')
  const [payMethod, setPayMethod] = useState<'cash' | 'card' | 'promptpay' | 'transfer'>('cash')
  const [receiptInvoiceId, setReceiptInvoiceId] = useState<string | null>(null)
  const [refundPaymentId, setRefundPaymentId] = useState<string | null>(null)
  const [refundAmount, setRefundAmount] = useState('')
  const [refundNote, setRefundNote] = useState('')

  // Billable catalog: legacy products (services & medications) plus live inventory items.
  const catalog = useMemo(
    () => [
      ...data.products.map((p) => ({ id: p.id, name: p.name, unitPrice: p.unitPrice, unit: p.unit })),
      ...data.inventoryItems.map((i) => ({ id: i.id, name: i.name, unitPrice: i.sellingPrice, unit: i.unit })),
    ],
    [data.products, data.inventoryItems],
  )

  const openInvoices = data.invoices.filter((i) => i.status !== 'paid' && i.status !== 'void')
  const outstanding = openInvoices.reduce(
    (sum, invoice) => sum + invoiceTotals(invoice, data.clinic.vatRate, data.payments).balance,
    0,
  )
  const collectedToday = data.payments
    .filter((p) => p.receivedAt.startsWith(today))
    .reduce((sum, p) => sum + p.amount, 0)
  const drafts = data.invoices.filter((i) => i.status === 'draft')
  const billedTotal = data.invoices.reduce(
    (sum, invoice) => sum + invoiceTotals(invoice, data.clinic.vatRate, data.payments).total,
    0,
  )

  const stats = [
    { label: t`Outstanding balance`, value: formatCurrency(outstanding), note: t`${openInvoices.length} open invoices`, icon: CreditCard, tone: 'teal' },
    { label: t`Collected today`, value: formatCurrency(collectedToday), note: t`${data.payments.filter((p) => p.receivedAt.startsWith(today)).length} payments`, icon: Plus, tone: 'violet' },
    { label: t`Draft invoices`, value: String(drafts.length), note: t`Ready to post`, icon: ClipboardList, tone: 'amber' },
    { label: t`Billed all time`, value: formatCurrency(billedTotal), note: t`${data.invoices.length} invoices`, icon: BarChart3, tone: 'teal' },
  ]

  const sortedInvoices = data.invoices.toSorted((a, b) => compareTime(b.createdAt, a.createdAt))
  const paymentInvoice = data.invoices.find((i) => i.id === paymentInvoiceId)
  const paymentBalance = paymentInvoice ? invoiceTotals(paymentInvoice, data.clinic.vatRate, data.payments).balance : 0
  const refundPayment = data.payments.find((p) => p.id === refundPaymentId)
  const refundedSoFar = refundPayment
    ? data.payments.filter((p) => p.refundOf === refundPayment.id).reduce((sum, p) => sum + Math.abs(p.amount), 0)
    : 0
  const refundable = refundPayment ? refundPayment.amount - refundedSoFar : 0

  const submitPayment = () => {
    const amount = Math.round(Number(payAmount) * 100)
    if (!paymentInvoice || !Number.isFinite(amount) || amount <= 0 || amount > paymentBalance) return
    dispatch({
      type: 'recordPayment',
      payment: { invoiceId: paymentInvoice.id, amount, method: payMethod },
      settles: amount >= paymentBalance,
    })
    setPaymentInvoiceId(null)
    setPayAmount('')
  }

  const submitRefund = () => {
    const amount = Math.round(Number(refundAmount) * 100)
    if (!refundPayment || !Number.isFinite(amount) || amount <= 0 || amount > refundable || !refundNote.trim()) return
    dispatch({
      type: 'refundPayment',
      invoiceId: refundPayment.invoiceId,
      paymentId: refundPayment.id,
      amount,
      note: refundNote,
    })
    setRefundPaymentId(null)
    setRefundAmount('')
    setRefundNote('')
  }

  return (
    <>
      <PageHeader
        title={t`Billing & payments`}
        description={t`Invoices, payments and adjustments stay traceable.`}
        action={
          <button className="button primary" onClick={() => setNewInvoiceOpen(true)} disabled={!billing.allowed} title={billing.reason || undefined}>
            <Plus size={16} /> <Trans>New invoice</Trans>
          </button>
        }
      />
      <div className="stat-grid">
        {stats.map((s) => (
          <div className="stat-card" key={s.label}>
            <span className={`stat-icon ${s.tone}`}>
              <s.icon size={19} />
            </span>
            <div>
              <small>{s.label}</small>
              <strong>{s.value}</strong>
              <span className="stat-note">{s.note}</span>
            </div>
          </div>
        ))}
      </div>
      {newInvoiceOpen && (
        <div className="inline-form">
          <div className="form-heading">
            <div>
              <strong><Trans>New invoice</Trans></strong>
              <span><Trans>Draft invoices can be edited and posted when settled at the desk.</Trans></span>
            </div>
            <button className="icon-button" onClick={() => setNewInvoiceOpen(false)} aria-label={t`Close form`}>
              <X size={17} />
            </button>
          </div>
          <div className="form-grid">
            <Field label={t`Owner`} htmlFor="ni-owner">
              <NativeSelect id="ni-owner" value={niOwnerId || data.owners[0]?.id || ''} onChange={(e) => setNiOwnerId(e.target.value)}>
                {data.owners.map((o) => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </NativeSelect>
            </Field>
            <Field label={t`Line item`} htmlFor="ni-item">
              <NativeSelect id="ni-item" value={niCatalogId} onChange={(e) => setNiCatalogId(e.target.value)}>
                <option value="">{t`— select item —`}</option>
                {catalog.map((c) => (
                  <option key={c.id} value={c.id}>{c.name} — {formatCurrency(c.unitPrice)}</option>
                ))}
              </NativeSelect>
            </Field>
            <Field label={t`Quantity`} htmlFor="ni-qty">
              <input id="ni-qty" type="number" min="1" value={niQuantity} onChange={(e) => setNiQuantity(e.target.value)} />
            </Field>
          </div>
          <div className="form-actions">
            <button
              className="button primary"
              disabled={!niCatalogId}
              onClick={() => {
                const entry = catalog.find((c) => c.id === niCatalogId)
                const owner = data.owners.find((o) => o.id === (niOwnerId || data.owners[0]?.id))
                if (!entry || !owner) return
                dispatch({
                  type: 'createInvoice',
                  ownerId: owner.id,
                  items: [{ description: entry.name, quantity: Math.max(1, Number(niQuantity) || 1), unitPrice: entry.unitPrice, productId: entry.id }],
                })
                setNiCatalogId('')
                setNiQuantity('1')
                setNewInvoiceOpen(false)
              }}
            >
              <Trans>Create draft invoice</Trans>
            </button>
          </div>
        </div>
      )}
      <Panel
        title={t`Invoices`}
        description={t`Drafts can be reviewed before posting; posted invoices are immutable.`}
      >
        <div className="records-table table-wide billing-table">
          <div className="table-head">
            <span><Trans>Invoice</Trans></span>
            <span><Trans>Owner</Trans></span>
            <span><Trans>Items</Trans></span>
            <span><Trans>Status</Trans></span>
            <span><Trans>Total</Trans></span>
            <span><Trans>Balance</Trans></span>
            <span />
          </div>
          {sortedInvoices.map((invoice) => {
            const owner = data.owners.find((o) => o.id === invoice.ownerId)
            const totals = invoiceTotals(invoice, data.clinic.vatRate, data.payments)
            const addEntry = addItemCatalogId ? catalog.find((c) => c.id === addItemCatalogId) : undefined
            return (
              <div key={invoice.id}>
                <div className="table-row">
                  <div>
                    <strong>{invoice.number}</strong>
                    <span>{formatDate(invoice.createdAt)}</span>
                  </div>
                  <span>{owner?.name}</span>
                  <span>
                    <Plural value={invoice.items.length} one="# item" other="# items" />
                  </span>
                  <span>
                    <Pill tone={statusTone(invoice.status)} dot>
                      {statusLabel(invoice.status)}
                    </Pill>
                  </span>
                  <strong>{formatCurrency(totals.total)}</strong>
                  <strong className={totals.balance > 0 ? 'balance-due' : undefined}>
                    {totals.balance > 0 ? formatCurrency(totals.balance) : '—'}
                  </strong>
                  <div className="row-actions">
                    {invoice.status === 'draft' && (
                      <>
                        <button className="row-action" onClick={() => setAddItemInvoiceId(addItemInvoiceId === invoice.id ? null : invoice.id)}>
                          <Trans>Add item</Trans>
                        </button>
                        <button
                          className="small-button"
                          onClick={() => dispatch({ type: 'postInvoice', invoiceId: invoice.id })}
                        >
                          <Trans>Post invoice</Trans>
                        </button>
                      </>
                    )}
                    {invoice.status === 'posted' && totals.balance > 0 && (
                      <button
                        className="small-button"
                        disabled={!billing.allowed}
                        title={billing.reason || undefined}
                        onClick={() => {
                          setPaymentInvoiceId(invoice.id)
                          setPayAmount((totals.balance / 100).toFixed(2))
                        }}
                      >
                        <Trans>Record payment</Trans>
                      </button>
                    )}
                    {invoice.status === 'posted' && totals.paid === 0 && (
                      <button
                        className="row-action"
                        disabled={!billing.allowed}
                        title={billing.reason || undefined}
                        onClick={() => {
                          if (confirm(t`Void ${invoice.number}? This cannot be undone.`)) {
                            dispatch({ type: 'voidInvoice', invoiceId: invoice.id })
                          }
                        }}
                      >
                        <Trans>Void</Trans>
                      </button>
                    )}
                    {(invoice.status !== 'draft' || totals.balance === 0) && (
                      <button className="row-action" onClick={() => setReceiptInvoiceId(invoice.id)}>
                        <Trans>Receipt</Trans>
                      </button>
                    )}
                  </div>
                </div>
                {addItemInvoiceId === invoice.id && (
                  <div className="inline-form nested">
                    <div className="form-grid">
                      <Field label={t`Item`} htmlFor={`ai-item-${invoice.id}`}>
                        <NativeSelect id={`ai-item-${invoice.id}`} value={addItemCatalogId} onChange={(e) => setAddItemCatalogId(e.target.value)}>
                          <option value="">{t`— select item —`}</option>
                          {catalog.map((c) => (
                            <option key={c.id} value={c.id}>{c.name} — {formatCurrency(c.unitPrice)}</option>
                          ))}
                        </NativeSelect>
                      </Field>
                      <Field label={t`Quantity`} htmlFor={`ai-qty-${invoice.id}`}>
                        <input id={`ai-qty-${invoice.id}`} type="number" min="1" value={addItemQuantity} onChange={(e) => setAddItemQuantity(e.target.value)} />
                      </Field>
                    </div>
                    <button
                      className="button secondary"
                      disabled={!addEntry}
                      onClick={() => {
                        dispatch({
                          type: 'addInvoiceItem',
                          invoiceId: invoice.id,
                          item: { description: addEntry!.name, quantity: Math.max(1, Number(addItemQuantity) || 1), unitPrice: addEntry!.unitPrice, productId: addEntry!.id },
                        })
                        setAddItemCatalogId('')
                        setAddItemQuantity('1')
                        setAddItemInvoiceId(null)
                      }}
                    >
                      <Trans>Add to invoice</Trans>
                    </button>
                  </div>
                )}
              </div>
            )
          })}
          {sortedInvoices.length === 0 && <p className="empty-state"><Trans>No invoices yet.</Trans></p>}
        </div>
      </Panel>
      <Panel title={t`Recent payments`} description={t`Every payment is appended to an immutable ledger.`}>
        <div className="activity-list">
          {data.payments
            .toSorted((a, b) => compareTime(b.receivedAt, a.receivedAt))
            .slice(0, 10)
            .map((payment) => {
              const invoice = data.invoices.find((i) => i.id === payment.invoiceId)
              const isRefund = payment.kind === 'refund'
              const refunded = data.payments.filter((p) => p.refundOf === payment.id).reduce((sum, p) => sum + Math.abs(p.amount), 0)
              const canRefund =
                billing.allowed &&
                !isRefund &&
                !!invoice &&
                invoice.status !== 'draft' &&
                invoice.status !== 'void' &&
                payment.amount - refunded > 0
              return (
                <div className="activity-row" key={payment.id}>
                  <div className="activity-mark">
                    <CreditCard size={14} />
                  </div>
                  <div>
                    <strong>
                      {formatCurrency(payment.amount)} · {invoice?.number ?? t`Unassigned`}
                    </strong>
                    <span>
                      {isRefund ? t`Refund — ${payment.note ?? t`no reason`}` : payment.method} · {formatDate(payment.receivedAt)} ·{' '}
                      {formatTime(payment.receivedAt)}
                    </span>
                  </div>
                  {canRefund && (
                    <button
                      className="small-button"
                      onClick={() => {
                        setRefundPaymentId(payment.id)
                        setRefundAmount(((payment.amount - refunded) / 100).toFixed(2))
                        setRefundNote('')
                      }}
                    >
                      <Trans>Refund</Trans>
                    </button>
                  )}
                  <Pill tone={isRefund ? 'bad' : 'muted'}>{isRefund ? t`refund` : payment.method}</Pill>
                </div>
              )
            })}
          {data.payments.length === 0 && <p className="empty-state"><Trans>No payments recorded yet.</Trans></p>}
        </div>
      </Panel>

      {paymentInvoice && (
        <div
          className="modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setPaymentInvoiceId(null)
          }}
        >
          <div className="modal" role="dialog" aria-modal="true" aria-label={t`Record payment for ${paymentInvoice.number}`}>
            <div className="form-heading">
              <div>
                <strong><Trans>Record payment — {paymentInvoice.number}</Trans></strong>
                <span>
                  <Trans>Balance due {formatCurrency(paymentBalance)} · partial payments are supported</Trans>
                </span>
              </div>
              <button className="icon-button" onClick={() => setPaymentInvoiceId(null)} aria-label={t`Close dialog`}>
                <X size={17} />
              </button>
            </div>
            <div className="form-grid">
              <Field label={t`Amount (THB)`} htmlFor="pay-amount">
                <input id="pay-amount" type="number" min="0" step="0.01" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} />
              </Field>
              <Field label={t`Method`} htmlFor="pay-method">
                <NativeSelect id="pay-method" value={payMethod} onChange={(e) => setPayMethod(e.target.value as typeof payMethod)}>
                  <option value="cash">{t`Cash`}</option>
                  <option value="card">{t`Card`}</option>
                  <option value="promptpay">{t`PromptPay`}</option>
                  <option value="transfer">{t`Bank transfer`}</option>
                </NativeSelect>
              </Field>
            </div>
            <div className="panel-footer">
              <button className="button secondary" onClick={() => setPaymentInvoiceId(null)}>
                <Trans>Cancel</Trans>
              </button>
              <button
                className="button primary"
                onClick={submitPayment}
                disabled={!(Number(payAmount) > 0) || Math.round(Number(payAmount) * 100) > paymentBalance}
              >
                <Trans>Record payment</Trans>
              </button>
            </div>
          </div>
        </div>
      )}
      {receiptInvoiceId && (
        <ReceiptDialog invoiceId={receiptInvoiceId} onClose={() => setReceiptInvoiceId(null)} />
      )}
      {refundPayment && (
        <div
          className="modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setRefundPaymentId(null)
          }}
        >
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label={t`Refund payment on ${data.invoices.find((i) => i.id === refundPayment.invoiceId)?.number ?? t`invoice`}`}
          >
            <div className="form-heading">
              <div>
                <strong><Trans>Refund payment</Trans></strong>
                <span>
                  <Trans>{formatCurrency(refundPayment.amount)} recorded on {formatDate(refundPayment.receivedAt)} · up to{' '}
                  {formatCurrency(refundable)} refundable</Trans>
                </span>
              </div>
              <button className="icon-button" onClick={() => setRefundPaymentId(null)} aria-label={t`Close dialog`}>
                <X size={17} />
              </button>
            </div>
            <div className="form-grid">
              <Field label={t`Refund amount (THB)`} htmlFor="refund-amount">
                <input
                  id="refund-amount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={refundAmount}
                  onChange={(e) => setRefundAmount(e.target.value)}
                />
              </Field>
              <Field label={t`Reason (recorded on the receipt)`} htmlFor="refund-note">
                <input
                  id="refund-note"
                  value={refundNote}
                  onChange={(e) => setRefundNote(e.target.value)}
                  placeholder={t`e.g. Dispensed the wrong strength…`}
                />
              </Field>
            </div>
            <p className="form-hint">
              <Trans>Refunds are appended to the payment ledger; the original payment and the receipt stay unchanged.</Trans>
            </p>
            <div className="panel-footer">
              <button className="button secondary" onClick={() => setRefundPaymentId(null)}>
                <Trans>Cancel</Trans>
              </button>
              <button
                className="button primary"
                onClick={submitRefund}
                disabled={!(Number(refundAmount) > 0) || Math.round(Number(refundAmount) * 100) > refundable || !refundNote.trim()}
              >
                <Trans>Record refund</Trans>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

const ReceiptDialog = ({ invoiceId, onClose }: { invoiceId: string; onClose: () => void }) => {
  const { data } = useClinic()
  const { t } = useLingui()
  const invoice = data.invoices.find((i) => i.id === invoiceId)
  if (!invoice) return null
  const owner = data.owners.find((o) => o.id === invoice.ownerId)
  const totals = invoiceTotals(invoice, data.clinic.vatRate, data.payments)
  const invoicePayments = data.payments.filter((p) => p.invoiceId === invoice.id)
  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-label={t`Receipt for ${invoice.number}`}>
        <div className="print-area flex flex-col gap-3 tabular-nums print:visible print:absolute print:left-0 print:top-0 print:w-full print:p-6">
          <header className="flex flex-col gap-0.5 text-center border-b border-dashed border-border pb-2.5">
            <h2 className="m-0 text-base">{data.clinic.name}</h2>
            <span className="text-xs text-muted-foreground"><Trans>Invoice / Receipt</Trans></span>
          </header>
          <div className="flex flex-wrap gap-3 text-[12.5px]">
            <span>{invoice.number}</span>
            <span>{formatDate(invoice.createdAt)}</span>
            <span>{owner?.name}</span>
          </div>
          <div className="flex flex-col gap-1">
            <div className="grid grid-cols-[minmax(0,1fr)_40px_90px_90px] gap-2 text-[11.5px] font-semibold uppercase tracking-[0.04em] text-muted-foreground border-b border-border pb-1">
              <span className="truncate"><Trans>Item</Trans></span>
              <span className="truncate text-right"><Trans>Qty</Trans></span>
              <span className="truncate text-right"><Trans>Price</Trans></span>
              <span className="truncate text-right"><Trans>Amount</Trans></span>
            </div>
            {invoice.items.map((item) => (
              <div className="grid grid-cols-[minmax(0,1fr)_40px_90px_90px] gap-2 text-[12.5px]" key={item.id}>
                <span className="truncate">{item.description}</span>
                <span className="truncate text-right">{item.quantity}</span>
                <span className="truncate text-right">{formatCurrency(item.unitPrice)}</span>
                <span className="truncate text-right">{formatCurrency(item.quantity * item.unitPrice)}</span>
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-1 border-t border-border pt-2">
            <div className="flex justify-between text-[12.5px]"><span><Trans>Subtotal</Trans></span><strong>{formatCurrency(totals.subtotal)}</strong></div>
            <div className="flex justify-between text-[12.5px]"><span><Trans>VAT ({Math.round(data.clinic.vatRate * 100)}%)</Trans></span><strong>{formatCurrency(totals.tax)}</strong></div>
            <div className="flex justify-between border-t border-dashed border-border pt-1 font-bold text-[13.5px]"><span><Trans>Total</Trans></span><strong>{formatCurrency(totals.total)}</strong></div>
            {invoicePayments.length > 0 && (
              <>
                {invoicePayments.map((p) => (
                  <div className="flex justify-between text-[12.5px]" key={p.id}>
                    <span>
                      {p.kind === 'refund' ? t`Refund` : t`Paid`} — {p.method}
                      {p.note ? ` · ${p.note}` : ''}
                    </span>
                    <strong>{formatCurrency(p.amount)}</strong>
                  </div>
                ))}
                <div className="flex justify-between border-t border-dashed border-border pt-1 font-bold text-[13.5px]"><span><Trans>Balance due</Trans></span><strong>{formatCurrency(totals.balance)}</strong></div>
              </>
            )}
          </div>
          <footer className="text-center text-xs text-muted-foreground border-t border-dashed border-border pt-2.5"><Trans>Thank you — {data.clinic.name} · {data.clinic.timezone}</Trans></footer>
        </div>
        <div className="panel-footer print:hidden">
          <button className="button secondary" onClick={onClose}>
            <Trans>Close</Trans>
          </button>
          <button className="button primary" onClick={() => window.print()}>
            <Trans>Print receipt</Trans>
          </button>
        </div>
      </div>
    </div>
  )
}

const categoryLabel: Record<string, MessageDescriptor> = {
  medicine: msg`Medicine`,
  vaccine: msg`Vaccine`,
  equipment: msg`Equipment`,
  supply: msg`Supply`,
}

const Inventory = () => {
  const { data, dispatch } = useClinic()
  const { t, i18n } = useLingui()
  const inventory = usePermission('inventory.write')
  const [category, setCategory] = useState<'all' | 'medicine' | 'vaccine' | 'equipment' | 'supply'>('all')
  const [showItemForm, setShowItemForm] = useState(false)
  const [showSupplierForm, setShowSupplierForm] = useState(false)
  const [receivingItemId, setReceivingItemId] = useState<string | null>(null)
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null)

  const [itemName, setItemName] = useState('')
  const [itemCategory, setItemCategory] = useState<InventoryCategory>('medicine')
  const [itemUnit, setItemUnit] = useState('')
  const [itemReorder, setItemReorder] = useState('0')
  const [itemPrice, setItemPrice] = useState('')

  const [supplierName, setSupplierName] = useState('')
  const [supplierPhone, setSupplierPhone] = useState('')

  const [lotNumber, setLotNumber] = useState('')
  const [lotQuantity, setLotQuantity] = useState('10')
  const [lotExpiry, setLotExpiry] = useState('')
  const [lotSupplier, setLotSupplier] = useState('')
  const [lotCost, setLotCost] = useState('')

  const items = data.inventoryItems.filter((i) => category === 'all' || i.category === category)

  const receiveLot = (itemId: string) => {
    const qty = Number(lotQuantity)
    if (!lotNumber.trim() || !Number.isFinite(qty) || qty <= 0) return
    dispatch({
      type: 'receiveLot',
      lot: {
        itemId,
        lotNumber,
        expiryDate: lotExpiry || undefined,
        supplierId: lotSupplier || undefined,
        costPerUnit: lotCost ? Math.round(Number(lotCost) * 100) : undefined,
        receivedDate: todayKey(),
      },
      quantity: qty,
    })
    setReceivingItemId(null)
    setLotNumber('')
    setLotQuantity('10')
    setLotExpiry('')
    setLotCost('')
  }

  return (
    <>
      <PageHeader
        title={t`Pharmacy & inventory`}
        description={t`Items, batch lots and an append-only stock ledger with clear reorder signals.`}
        action={
          <button className="button primary" onClick={() => setShowItemForm((v) => !v)} disabled={!inventory.allowed}>
            <Plus size={16} /> <Trans>Add item</Trans>
          </button>
        }
      />
      {!inventory.allowed && <p className="empty-state">{inventory.reason}. <Trans>Inventory changes require admin or pharmacist access.</Trans></p>}
      {showItemForm && (
        <div className="inline-form">
          <div className="form-heading">
            <div>
              <strong><Trans>Add inventory item</Trans></strong>
              <span><Trans>Define the stock-keeping unit; lots are received against it.</Trans></span>
            </div>
            <button className="icon-button" onClick={() => setShowItemForm(false)} aria-label={t`Close form`}>
              <X size={17} />
            </button>
          </div>
          <div className="form-grid">
            <Field label={t`Name`} htmlFor="inv-name">
              <input id="inv-name" value={itemName} onChange={(e) => setItemName(e.target.value)} placeholder={t`e.g. Amoxicillin 250 mg…`} />
            </Field>
            <Field label={t`Category`} htmlFor="inv-cat">
              <select id="inv-cat" value={itemCategory} onChange={(e) => setItemCategory(e.target.value as InventoryCategory)}>
                {Object.entries(categoryLabel).map(([value, label]) => (
                  <option key={value} value={value}>{i18n._(label)}</option>
                ))}
              </select>
            </Field>
            <Field label={t`Unit`} htmlFor="inv-unit">
              <input id="inv-unit" value={itemUnit} onChange={(e) => setItemUnit(e.target.value)} placeholder={t`tablet / dose / bottle…`} />
            </Field>
            <Field label={t`Reorder level`} htmlFor="inv-reorder">
              <input id="inv-reorder" type="number" min="0" value={itemReorder} onChange={(e) => setItemReorder(e.target.value)} />
            </Field>
            <Field label={t`Selling price (THB)`} htmlFor="inv-price">
              <input id="inv-price" type="number" min="0" step="0.01" value={itemPrice} onChange={(e) => setItemPrice(e.target.value)} />
            </Field>
          </div>
          <button
            className="button primary"
            onClick={() => {
              if (!itemName.trim() || !itemUnit.trim()) return
              dispatch({
                type: 'addInventoryItem',
                item: {
                  name: itemName,
                  category: itemCategory,
                  unit: itemUnit,
                  reorderLevel: Math.max(0, Number(itemReorder) || 0),
                  sellingPrice: Math.round((Number(itemPrice) || 0) * 100),
                },
              })
              setItemName('')
              setItemUnit('')
              setItemPrice('')
              setShowItemForm(false)
            }}
          >
            <Trans>Save item</Trans>
          </button>
        </div>
      )}
      {showSupplierForm && (
        <div className="inline-form">
          <div className="form-heading">
            <div>
              <strong><Trans>Add supplier</Trans></strong>
              <span><Trans>Lots can be tagged with the vendor they were purchased from.</Trans></span>
            </div>
            <button className="icon-button" onClick={() => setShowSupplierForm(false)} aria-label={t`Close form`}>
              <X size={17} />
            </button>
          </div>
          <div className="form-grid">
            <Field label={t`Supplier name`} htmlFor="sup-name">
              <input id="sup-name" value={supplierName} onChange={(e) => setSupplierName(e.target.value)} placeholder={t`e.g. Thai Vet Pharma Co.…`} />
            </Field>
            <Field label={t`Phone`} htmlFor="sup-phone">
              <input id="sup-phone" value={supplierPhone} onChange={(e) => setSupplierPhone(e.target.value)} />
            </Field>
          </div>
          <button
            className="button primary"
            onClick={() => {
              if (!supplierName.trim()) return
              dispatch({ type: 'addSupplier', supplier: { name: supplierName, phone: supplierPhone } })
              setSupplierName('')
              setSupplierPhone('')
              setShowSupplierForm(false)
            }}
          >
            <Trans>Save supplier</Trans>
          </button>
        </div>
      )}
      <div className="toolbar">
        <div className="filter-group" role="tablist" aria-label={t`Inventory category filter`}>
          {(['all', 'medicine', 'vaccine', 'equipment', 'supply'] as const).map((c) => (
            <button key={c} className={`filter-chip ${category === c ? 'active' : ''}`} onClick={() => setCategory(c)}>
              {c === 'all' ? t`All` : i18n._(categoryLabel[c])}
            </button>
          ))}
        </div>
        <button className="filter-button" onClick={() => setShowSupplierForm((v) => !v)}>
          <Trans>Suppliers ({data.suppliers.length})</Trans> <span>⌄</span>
        </button>
      </div>
      <Panel
        title={items.length === 1 ? t`1 item` : t`${items.length} items`}
        description={t`Quantity-on-hand is derived from lot quantities`}
      >
        <div className="records-table table-wide">
          <div className="table-head">
            <span><Trans>Item</Trans></span>
            <span><Trans>Category</Trans></span>
            <span><Trans>On hand</Trans></span>
            <span><Trans>Stock</Trans></span>
            <span />
          </div>
          {items.map((item) => {
            const onHand = itemOnHand(item.id, data.inventoryLots)
            const low = onHand <= item.reorderLevel
            const lots = data.inventoryLots.filter((l) => l.itemId === item.id)
            return (
              <div key={item.id}>
                <div className="table-row">
                  <div>
                    <strong>{item.name}</strong>
                    <span>{item.unit} · {formatCurrency(item.sellingPrice)}</span>
                  </div>
                  <span><Pill tone="info">{i18n._(categoryLabel[item.category])}</Pill></span>
                  <strong>{onHand}</strong>
                  <span>
                    <Pill tone={low ? 'warn' : 'ok'} dot>{low ? t`Low — reorder at ${item.reorderLevel}` : t`In stock`}</Pill>
                  </span>
                  <div className="row-actions">
                    <button className="row-action" onClick={() => setExpandedItemId(expandedItemId === item.id ? null : item.id)}>
                      {expandedItemId === item.id ? t`Hide lots` : t`Lots (${lots.length})`}
                    </button>
                    <button className="small-button" onClick={() => setReceivingItemId(receivingItemId === item.id ? null : item.id)} disabled={!inventory.allowed}>
                      <Trans>Receive stock</Trans>
                    </button>
                  </div>
                </div>
                {receivingItemId === item.id && (
                  <div className="inline-form nested">
                    <div className="form-grid">
                      <Field label={t`Lot number`} htmlFor={`lot-num-${item.id}`}>
                        <input id={`lot-num-${item.id}`} value={lotNumber} onChange={(e) => setLotNumber(e.target.value)} placeholder={t`e.g. AMX-2611C…`} />
                      </Field>
                      <Field label={t`Quantity`} htmlFor={`lot-qty-${item.id}`}>
                        <input id={`lot-qty-${item.id}`} type="number" min="1" value={lotQuantity} onChange={(e) => setLotQuantity(e.target.value)} />
                      </Field>
                      <Field label={t`Expiry date`} htmlFor={`lot-exp-${item.id}`}>
                        <DatePicker id={`lot-exp-${item.id}`} label={t`Expiry date`} value={lotExpiry} onChange={setLotExpiry} />
                      </Field>
                      <Field label={t`Supplier`} htmlFor={`lot-sup-${item.id}`}>
                        <select id={`lot-sup-${item.id}`} value={lotSupplier} onChange={(e) => setLotSupplier(e.target.value)}>
                          <option value="">{t`— none —`}</option>
                          {data.suppliers.map((s) => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </select>
                      </Field>
                      <Field label={t`Cost/unit (THB)`} htmlFor={`lot-cost-${item.id}`}>
                        <input id={`lot-cost-${item.id}`} type="number" min="0" step="0.01" value={lotCost} onChange={(e) => setLotCost(e.target.value)} />
                      </Field>
                    </div>
                    <button className="button primary" onClick={() => receiveLot(item.id)}><Trans>Record receipt</Trans></button>
                  </div>
                )}
                {expandedItemId === item.id && (
                  <div className="lot-breakdown">
                    {lots.length === 0 && <p className="empty-state"><Trans>No lots received yet.</Trans></p>}
                    {lots.map((lot) => {
                      const supplier = data.suppliers.find((s) => s.id === lot.supplierId)
                      const movements = data.stockMovements.filter((m) => m.lotId === lot.id)
                      return (
                        <div className="lot-row" key={lot.id}>
                          <div className="lot-main">
                            <strong><Trans>Lot {lot.lotNumber}</Trans></strong>
                            <span>
                              {lot.quantity} {item.unit}
                              {lot.expiryDate ? <> · <Trans>exp {lot.expiryDate}</Trans></> : ''}
                              {supplier ? ` · ${supplier.name}` : ''}
                            </span>
                          </div>
                          <span className="lot-ledger"><Plural value={movements.length} one="# ledger entry" other="# ledger entries" /></span>
                          <div className="row-actions">
                            <button
                              className="row-action"
                              disabled={!inventory.allowed || lot.quantity <= 0}
                              onClick={() => dispatch({ type: 'recordStockMovement', lotId: lot.id, delta: -1, reason: 'stock_out', notes: 'manual dispense' })}
                            >
                              <Trans>Dispense 1</Trans>
                            </button>
                            <button
                              className="row-action"
                              disabled={!inventory.allowed}
                              onClick={() => dispatch({ type: 'recordStockMovement', lotId: lot.id, delta: -1, reason: 'waste', notes: 'write-off' })}
                            >
                              <Trans>Waste 1</Trans>
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
          {items.length === 0 && <p className="empty-state"><Trans>No items in this category yet.</Trans></p>}
        </div>
      </Panel>
      <Panel title={t`Suppliers`} description={t`Vendors lots are purchased from`}>
        <div className="activity-list">
          {data.suppliers.map((s) => (
            <div className="activity-row" key={s.id}>
              <div className="activity-mark"><Package size={14} /></div>
              <div>
                <strong>{s.name}</strong>
                <span>{[s.phone, s.email].filter(Boolean).join(' · ') || t`No contact details`}</span>
              </div>
              <Pill tone="muted"><Plural value={data.inventoryLots.filter((l) => l.supplierId === s.id).length} one="# lot" other="# lots" /></Pill>
            </div>
          ))}
          {data.suppliers.length === 0 && <p className="empty-state"><Trans>No suppliers recorded yet.</Trans></p>}
        </div>
      </Panel>
    </>
  )
}
