import { useEffect, useMemo, useRef, useState } from 'react'
import {
  BarChart3,
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
import { Field, NativeSelect, Panel, PageHeader, Pill } from '@/components/vet/fields'
import { useClinic, usePermission, type View } from '@/lib/vet/store'
import { buildCaseBundle, downloadCaseBundle, newShareToken } from '@/lib/vet/case-transfer'
import { formatMoney as formatCurrency, formatDate, formatTime, initials, invoiceTotals, itemOnHand, lotsExpiringWithin, mostUsedItems, roleLabel, statusTone, todayKey, vaccinationsDue } from '@/lib/vet/format'
import { SPECIES, SEXES, type InventoryCategory, type Patient, type Vitals } from '@/lib/vet/types'
import { getTheme, setTheme, THEME_CHOICES, watchSystemTheme, type ThemeChoice } from '@/lib/theme'
import { ReportsView } from './reports-view'
import { ScheduleView } from './schedule-view'
import { RecordsView, SettingsView, StaffView } from './views'

import { LockScreen } from './lock-screen'
import { WorkspaceDialog, type WorkspaceTab } from './workspace-dialog'

const nav = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'schedule', label: 'Appointments & Queue', icon: CalendarDays },
  { id: 'owners', label: 'Owners & Pets', icon: Users },
  { id: 'records', label: 'Medical Records', icon: Stethoscope },
  { id: 'inventory', label: 'Pharmacy & Inventory', icon: Package },
  { id: 'billing', label: 'Billing & Payments', icon: CreditCard },
  { id: 'reports', label: 'Reports', icon: BarChart3 },
  { id: 'staff', label: 'Staff & Permissions', icon: ShieldCheck },
  { id: 'settings', label: 'Settings', icon: Settings2 },
] as const

const greeting = (now = new Date()) => {
  const hour = now.getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

const longDate = (now = new Date()) =>
  now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

type SetView = (view: View) => void

const themeIcon: Record<ThemeChoice, typeof Sun> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
}

const ThemeToggle = () => {
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
      title={`Theme: ${choice} — switch to ${next}`}
      aria-label={`Change theme (current: ${choice}, switches to ${next})`}
    >
      <Icon size={18} />
    </button>
  )
}

export const ClinicApp = () => {
  const { data, session, user, dispatch } = useClinic()
  const [mobileNav, setMobileNav] = useState(false)
  const [query, setQuery] = useState('')
  const [showOwnerForm, setShowOwnerForm] = useState(false)
  const [workspace, setWorkspace] = useState<WorkspaceTab | null>(null)
  const canWrite = usePermission('records.write').allowed
  const activeView = session.view
  const setView: SetView = (view) => {
    dispatch({ type: 'session', patch: { view } })
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
            <span>Clinic workspace</span>
          </div>
          <button className="icon-button mobile-close" onClick={() => setMobileNav(false)} aria-label="Close menu">
            <X size={18} />
          </button>
        </div>
        <button
          type="button"
          className="clinic-switch"
          onClick={() => setWorkspace('clinic')}
          aria-haspopup="dialog"
          aria-label={`Manage ${data.clinic.name} and account`}
          title="Clinic & account"
        >
          <div className="clinic-avatar">{initials(data.clinic.name)}</div>
          <div>
            <strong>{data.clinic.name}</strong>
            <span>Local clinic</span>
          </div>
          <span className="chevron" aria-hidden="true">⌄</span>
        </button>
        <nav className="main-nav" aria-label="Main navigation">
          {nav.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setView(id)} className={activeView === id ? 'nav-item active' : 'nav-item'}>
              <Icon size={18} />
              <span>{label}</span>
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
            aria-label={`Open my account (${user.name})`}
            title="My account"
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
          aria-label="Close navigation"
        />
      )}
      <main className="main-content">
        <header className="topbar">
          <button className="icon-button menu-button" onClick={() => setMobileNav(true)} aria-label="Open menu">
            <Menu size={20} />
          </button>
          <div className="breadcrumbs">
            <span>{data.clinic.name}</span>
            <span>/</span>
            <strong>{activeView === 'consult' ? 'Consultation' : nav.find((item) => item.id === activeView)?.label}</strong>
          </div>
          <div className="top-actions">
            <ThemeToggle />
            <button
              className="icon-button"
              onClick={() => dispatch({ type: 'session', patch: { locked: true } })}
              aria-label="Lock screen"
              title="Lock screen"
            >
              <Lock size={18} />
            </button>
            <div className="connection">
              <span className="pulse" /> <span>{session.lanOnline ? 'Local server' : 'Server offline'}</span>
            </div>
            <button
              className="avatar top-avatar"
              onClick={() => setWorkspace('account')}
              aria-haspopup="dialog"
              aria-label={`Account settings for ${user.name}`}
              title="My account"
            >
              {initials(user.name)}
            </button>
          </div>
        </header>
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
          {activeView === 'consult' && <Consultations />}
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
        title={`${greeting()}, ${firstName}`}
        description={`${longDate()} · Here’s what’s happening at the clinic today.`}
        action={
          <button className="button primary" onClick={onRegisterPatient} disabled={!canRegister}>
            <Plus size={16} /> Register patient
          </button>
        }
      />
      <div className="stat-grid">
        <div className="stat-card">
          <span className="stat-icon teal">
            <CalendarDays size={19} />
          </span>
          <div>
            <small>Today’s appointments</small>
            <strong>{todaysAppointments.length}</strong>
            <span className="stat-note">
              {todaysAppointments.filter((a) => a.status === 'completed').length} completed
            </span>
          </div>
        </div>
        <div className="stat-card">
          <span className="stat-icon violet">
            <ClipboardList size={19} />
          </span>
          <div>
            <small>Open consultations</small>
            <strong>{data.encounters.filter((e) => e.status === 'open').length}</strong>
            <span className="stat-note">Ready for notes</span>
          </div>
        </div>
        <div className="stat-card">
          <span className="stat-icon amber">
            <CreditCard size={19} />
          </span>
          <div>
            <small>Outstanding</small>
            <strong>{formatCurrency(outstanding)}</strong>
            <span className="stat-note">{data.invoices.filter((i) => i.status !== 'paid' && i.status !== 'void').length} invoices</span>
          </div>
        </div>
        <div className="stat-card">
          <span className="stat-icon amber">
            <Stethoscope size={19} />
          </span>
          <div>
            <small>Vaccinations due (30d)</small>
            <strong>{dueVaccinations.length}</strong>
            <span className="stat-note">
              {dueVaccinations.length > 0
                ? `Next: ${data.patients.find((p) => p.id === dueVaccinations[0].patientId)?.name ?? '—'}`
                : 'None upcoming'}
            </span>
          </div>
        </div>
        <div className="stat-card">
          <span className="stat-icon blue">
            <Wifi size={19} />
          </span>
          <div>
            <small>Data status</small>
            <strong>Local</strong>
            <span className="stat-note">All changes saved</span>
          </div>
        </div>
      </div>
      <div className="dashboard-grid">
        <Panel
          title="Today’s schedule"
          description={`Appointments at ${data.clinic.name}`}
          action={
            <button className="text-button" onClick={() => onNavigate('schedule')}>
              Open calendar
            </button>
          }
        >
          <div className="appointment-list">
            {todaysAppointments.length === 0 && (
              <p className="empty-state">No appointments today. Enjoy the quiet — or book one from the calendar.</p>
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
                        {a.reason} · {vet?.name ?? 'Unassigned'}
                      </span>
                    </div>
                    <Pill tone={statusTone(a.status)} dot>
                      {a.status.replace('_', ' ')}
                    </Pill>
                    {a.status === 'booked' && (
                      <button className="small-button" onClick={() => onStart(a.id)}>
                        Start consult
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </Panel>
        <Panel title="Recent activity" description="A traceable history of clinic changes">
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
          title="Low stock"
          description="Items at or below their reorder level"
          action={
            <button className="text-button" onClick={() => onNavigate('inventory')}>
              Open inventory
            </button>
          }
        >
          <div className="activity-list">
            {data.inventoryItems
              .map((item) => ({ item, onHand: itemOnHand(item.id, data.inventoryLots) }))
              .filter(({ item, onHand }) => item.reorderLevel > 0 && onHand <= item.reorderLevel)
              .sort((a, b) => a.onHand - b.onHand)
              .slice(0, 5)
              .map(({ item, onHand }) => (
                <div className="activity-row" key={item.id}>
                  <div className="activity-mark"><Package size={14} /></div>
                  <div>
                    <strong>{item.name}</strong>
                    <span>{onHand} {item.unit} on hand · reorder at {item.reorderLevel}</span>
                  </div>
                  <Pill tone="warn" dot>Low</Pill>
                </div>
              ))}
            {data.inventoryItems.filter((i) => i.reorderLevel > 0 && itemOnHand(i.id, data.inventoryLots) <= i.reorderLevel).length === 0 && (
              <p className="empty-state">Every item is above its reorder level.</p>
            )}
          </div>
        </Panel>
        <Panel title="Expiring soon" description="Active lots expiring within 30 days">
          <div className="activity-list">
            {lotsExpiringWithin(data.inventoryLots, 30).slice(0, 5).map((lot) => {
              const item = data.inventoryItems.find((i) => i.id === lot.itemId)
              return (
                <div className="activity-row" key={lot.id}>
                  <div className="activity-mark"><CalendarDays size={14} /></div>
                  <div>
                    <strong>{item?.name ?? 'Item'} — lot {lot.lotNumber}</strong>
                    <span>{lot.quantity} {item?.unit ?? 'units'} · expires {lot.expiryDate}</span>
                  </div>
                  <Pill tone="warn" dot>{lot.expiryDate}</Pill>
                </div>
              )
            })}
            {lotsExpiringWithin(data.inventoryLots, 30).length === 0 && (
              <p className="empty-state">Nothing expires in the next 30 days.</p>
            )}
          </div>
        </Panel>
        <Panel title="Top used medicines" description="By dispensed quantity over the last 30 days">
          <div className="activity-list">
            {mostUsedItems(data.inventoryItems, data.stockMovements, data.inventoryLots, 30).map(({ item, usedQty }) => (
              <div className="activity-row" key={item.id}>
                <div className="activity-mark"><ClipboardList size={14} /></div>
                <div>
                  <strong>{item.name}</strong>
                  <span>{categoryLabel[item.category] ?? item.category}</span>
                </div>
                <Pill tone="info">{usedQty} used</Pill>
              </div>
            ))}
            {mostUsedItems(data.inventoryItems, data.stockMovements, data.inventoryLots, 30).length === 0 && (
              <p className="empty-state">No dispenses recorded in the last 30 days.</p>
            )}
          </div>
        </Panel>
        <Panel title="Vaccinations due" description="Boosters due or overdue within 30 days">
          <div className="activity-list">
            {vaccinationsDue(data.vaccinations, 30).map((v) => {
              const patient = data.patients.find((p) => p.id === v.patientId)
              const overdue = v.nextDueAt! < today
              return (
                <div className="activity-row" key={v.id}>
                  <div className="activity-mark"><CalendarDays size={14} /></div>
                  <div>
                    <strong>{patient?.name ?? 'Patient'} — {v.vaccineName}</strong>
                    <span>Last given {formatDate(v.administeredAt)}</span>
                  </div>
                  <Pill tone={overdue ? 'bad' : 'warn'} dot>{overdue ? `Overdue ${v.nextDueAt}` : `Due ${v.nextDueAt}`}</Pill>
                </div>
              )
            })}
            {vaccinationsDue(data.vaccinations, 30).length === 0 && (
              <p className="empty-state">No boosters due in the next 30 days.</p>
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
          breed: breed.trim() || 'Mixed breed',
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
          breed: breed.trim() || 'Mixed breed',
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
    setNotice(`${patientName} registered.`)
    setShowForm(false)
  }
  return (
    <>
      <PageHeader
        title="Owners & pets"
        description="Find a record quickly or register a new patient."
        action={
          <button className="button primary" onClick={() => { setNotice(''); setShowForm(true) }} disabled={!canWrite}>
            <Plus size={16} /> Register Patient
          </button>
        }
      />
      <div className="toolbar owners-toolbar">
        <div className="search-field">
          <Search size={17} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by owner, phone, patient, MRN or microchip…"
            aria-label="Search owners or patients"
          />
        </div>
        <button className="filter-button">
          All patients <span aria-hidden="true">⌄</span>
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
              <strong>Register patient</strong>
              <span>Owner and patient records are saved in one local transaction.</span>
            </div>
            <button className="icon-button" onClick={() => setShowForm(false)} aria-label="Close form">
              <X size={17} />
            </button>
          </div>
          <div className="seg" role="tablist" aria-label="Registration mode">
            <button role="tab" aria-selected={formMode === 'new-owner'} className={formMode === 'new-owner' ? 'active' : ''} onClick={() => setFormMode('new-owner')}>
              New owner
            </button>
            <button role="tab" aria-selected={formMode === 'existing-owner'} className={formMode === 'existing-owner' ? 'active' : ''} onClick={() => setFormMode('existing-owner')}>
              Existing owner
            </button>
          </div>
          <div className="form-grid">
            {formMode === 'new-owner' ? (
              <>
                <Field label="Owner name" htmlFor="owner">
                  <input
                    id="owner"
                    name="owner-name"
                    autoComplete="off"
                    ref={ownerInputRef}
                    value={ownerName}
                    onChange={(e) => setOwnerName(e.target.value)}
                    placeholder="e.g. Anong Srisuk…"
                  />
                </Field>
                <Field label="Owner phone" htmlFor="owner-phone">
                  <input
                    id="owner-phone"
                    name="owner-phone"
                    autoComplete="off"
                    inputMode="tel"
                    value={ownerPhone}
                    onChange={(e) => setOwnerPhone(e.target.value)}
                    placeholder="e.g. 081 234 5678…"
                  />
                </Field>
              </>
            ) : (
              <Field label="Owner" htmlFor="owner-select">
                <NativeSelect id="owner-select" value={ownerId || data.owners[0]?.id || ''} onChange={(e) => setOwnerId(e.target.value)}>
                  {data.owners.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name} ({data.patients.filter((p) => p.ownerId === o.id).length} patients)
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            )}
            <Field label="Patient name" htmlFor="pet">
              <input
                id="pet"
                name="patient-name"
                autoComplete="off"
                ref={patientInputRef}
                value={petName}
                onChange={(e) => setPetName(e.target.value)}
                placeholder="e.g. Milo…"
              />
            </Field>
            <Field label="Species" htmlFor="pet-species">
              <NativeSelect id="pet-species" value={species} onChange={(e) => setSpecies(e.target.value as Patient['species'])}>
                {SPECIES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Breed" htmlFor="pet-breed">
              <input id="pet-breed" autoComplete="off" value={breed} onChange={(e) => setBreed(e.target.value)} placeholder="e.g. Golden Retriever…" />
            </Field>
            <Field label="Sex" htmlFor="pet-sex">
              <NativeSelect id="pet-sex" value={sex} onChange={(e) => setSex(e.target.value as Patient['sex'])}>
                {SEXES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Date of birth" htmlFor="pet-dob">
              <input id="pet-dob" type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
            </Field>
            <Field label="Microchip (optional)" htmlFor="microchip">
              <input
                id="microchip"
                name="microchip"
                autoComplete="off"
                inputMode="numeric"
                spellCheck={false}
                value={microchip}
                onChange={(e) => setMicrochip(e.target.value)}
                placeholder="e.g. 985141002341238…"
              />
            </Field>
          </div>
          <div className="form-actions">
            <button
              className="button primary"
              onClick={save}
              disabled={!petName.trim() || (formMode === 'new-owner' && !ownerName.trim()) || (formMode === 'existing-owner' && data.owners.length === 0)}
            >
              Save Records
            </button>
          </div>
        </div>
      )}
      <Panel title={`${filtered.length} patients`} description="Patient identity and owner contact details">
        <div className="records-table patients-table">
          <div className="table-head">
            <span>Patient</span>
            <span>Owner</span>
            <span>Species</span>
            <span>Last visit</span>
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
                      {patient.mrn} · {patient.breed} · {patient.sex}
                    </span>
                    {patient.originClinicName && (
                      <span className="patient-flags">
                        <Pill tone="info">Received from {patient.originClinicName}</Pill>
                      </span>
                    )}
                    {flags.length > 0 && (
                      <span className="patient-flags">
                        {patient.allergies.map((a) => (
                          <Pill key={a} tone="bad">
                            Allergy: {a}
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
                <span data-label="Owner">{owner?.name ?? '—'}</span>
                <span data-label="Species">
                  <Pill tone="info">{patient.species}</Pill>
                </span>
                <span data-label="Last visit">
                  {patient.lastVisit ? formatDate(patient.lastVisit) : 'New patient'}
                </span>
                <div className="row-actions">
                  <button className="row-action" onClick={() => setDetailId(patient.id)}>
                    View
                  </button>
                  {canWrite && (
                    <button
                      className="row-action"
                      title="Export this patient's case bundle for another clinic"
                      onClick={() => {
                        const bundle = buildCaseBundle(data, patient, newShareToken(), new Date().toISOString())
                        downloadCaseBundle(bundle)
                        dispatch({ type: 'exportCaseBundle', bundle })
                      }}
                    >
                      Share
                    </button>
                  )}
                </div>
              </div>
            )
          })}
          {filtered.length === 0 && <p className="empty-state patients-empty">No patients match your search.</p>}
        </div>
      </Panel>
      {detailId && <PatientClinicalDialog patientId={detailId} onClose={() => setDetailId(null)} canWrite={canWrite} />}
    </>
  )
}

const PatientClinicalDialog = ({ patientId, onClose, canWrite }: { patientId: string; onClose: () => void; canWrite: boolean }) => {
  const { data, dispatch } = useClinic()
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
  const splitList = (value: string) =>
    value
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
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
  ].sort((a, b) => b.at.localeCompare(a.at))
  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="modal modal-wide" role="dialog" aria-modal="true" aria-label={`Clinical profile for ${patient.name}`}>
        <div className="form-heading">
          <div>
            <strong>{name || patient.name}</strong>
            <span>
              {patient.mrn} · {ownerName || owner?.name || 'No owner'}{ownerPhone ? ` · ${ownerPhone}` : ''} · {species} · {breed}
            </span>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close dialog">
            <X size={17} />
          </button>
        </div>
        <fieldset className="form-section" disabled={!canWrite}>
          <legend>Owner</legend>
          <div className="form-grid">
            <Field label="Owner name" htmlFor="pt-owner-name">
              <input
                id="pt-owner-name"
                name="owner-name"
                autoComplete="off"
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                placeholder="e.g. Anong Srisuk…"
              />
            </Field>
            <Field label="Phone" htmlFor="pt-owner-phone">
              <input
                id="pt-owner-phone"
                name="owner-phone"
                type="tel"
                autoComplete="off"
                value={ownerPhone}
                onChange={(e) => setOwnerPhone(e.target.value)}
                placeholder="e.g. 081 234 5678…"
              />
            </Field>
            <Field label="Email" htmlFor="pt-owner-email">
              <input
                id="pt-owner-email"
                name="owner-email"
                type="email"
                autoComplete="off"
                value={ownerEmail}
                onChange={(e) => setOwnerEmail(e.target.value)}
                placeholder="e.g. anong@example.com…"
              />
            </Field>
            <Field label="Address" htmlFor="pt-owner-address">
              <input
                id="pt-owner-address"
                name="owner-address"
                autoComplete="off"
                value={ownerAddress}
                onChange={(e) => setOwnerAddress(e.target.value)}
                placeholder="Street, city, postcode…"
              />
            </Field>
          </div>
        </fieldset>

        <fieldset className="form-section" disabled={!canWrite}>
          <legend>Patient</legend>
          <div className="form-grid">
            <Field label="Patient name" htmlFor="pt-name">
              <input
                id="pt-name"
                name="patient-name"
                autoComplete="off"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Milo…"
              />
            </Field>
            <Field label="Species" htmlFor="pt-species">
              <NativeSelect id="pt-species" value={species} onChange={(e) => setSpecies(e.target.value as Patient['species'])}>
                {SPECIES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Breed" htmlFor="pt-breed">
              <input id="pt-breed" autoComplete="off" value={breed} onChange={(e) => setBreed(e.target.value)} placeholder="e.g. Golden Retriever…" />
            </Field>
            <Field label="Sex" htmlFor="pt-sex">
              <NativeSelect id="pt-sex" value={sex} onChange={(e) => setSex(e.target.value as Patient['sex'])}>
                {SEXES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Date of birth" htmlFor="pt-birth">
              <input id="pt-birth" type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
            </Field>
            <Field label="Weight (kg)" htmlFor="pt-weight">
              <input
                id="pt-weight"
                inputMode="decimal"
                autoComplete="off"
                value={weightKg}
                onChange={(e) => setWeightKg(e.target.value)}
                placeholder="e.g. 4.2…"
              />
            </Field>
          </div>
        </fieldset>

        <fieldset className="form-section" disabled={!canWrite}>
          <legend>Clinical</legend>
          <div className="form-grid">
            <Field label="Microchip" htmlFor="pt-microchip">
              <input
                id="pt-microchip"
                name="microchip"
                autoComplete="off"
                inputMode="numeric"
                spellCheck={false}
                value={microchip}
                onChange={(e) => setMicrochip(e.target.value)}
                placeholder="e.g. 985141002341238…"
              />
            </Field>
            <Field label="Allergies (comma-separated)" htmlFor="pt-allergies">
              <input
                id="pt-allergies"
                name="allergies"
                autoComplete="off"
                value={allergies}
                onChange={(e) => setAllergies(e.target.value)}
                placeholder="e.g. Penicillin, Flea topical (pyrethrin)…"
              />
            </Field>
            <Field label="Medical alerts (comma-separated)" htmlFor="pt-alerts">
              <input
                id="pt-alerts"
                name="medical-alerts"
                autoComplete="off"
                value={alerts}
                onChange={(e) => setAlerts(e.target.value)}
                placeholder="e.g. Aggressive during handling — muzzle first…"
              />
            </Field>
          </div>
        </fieldset>

        <div className="panel-footer">
          <button className="button secondary" onClick={onClose}>
            Cancel
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
            Save Profile
          </button>
        </div>
        <div className="timeline" aria-label="Medical timeline">
          <h3>Medical timeline</h3>
          {timeline.length === 0 && <p className="empty-state">No visits or vaccinations recorded yet.</p>}
          {timeline.map((entry) =>
            entry.kind === 'vaccination' ? (
              <div className="timeline-row" key={entry.vaccination.id}>
                <Pill tone="info" dot>Vaccine</Pill>
                <div>
                  <strong>{entry.vaccination.vaccineName}</strong>
                  <span>
                    {formatDate(entry.vaccination.administeredAt)}
                    {entry.vaccination.lotNumber ? ` · lot ${entry.vaccination.lotNumber}` : ''}
                    {entry.vaccination.nextDueAt ? ` · next due ${entry.vaccination.nextDueAt}` : ''}
                  </span>
                </div>
              </div>
            ) : (
              <div className="timeline-row" key={entry.encounter.id}>
                <Pill tone={entry.encounter.status === 'open' ? 'warn' : 'ok'} dot>
                  {entry.encounter.status === 'open' ? 'Open visit' : 'Visit'}
                </Pill>
                <div>
                  <strong>
                    {formatDate(entry.encounter.openedAt)}
                    {entry.encounter.diagnoses.length > 0 && ` — ${entry.encounter.diagnoses.map((d) => d.description).join('; ')}`}
                  </strong>
                  {entry.encounter.prescriptions.length > 0 && (
                    <span>
                      Rx: {entry.encounter.prescriptions.map((rx) => `${rx.medication} (${rx.dose} ${rx.frequency})`).join(', ')}
                    </span>
                  )}
                  <span>
                    {entry.encounter.notes.length} note{entry.encounter.notes.length === 1 ? '' : 's'}
                    {entry.encounter.vitals.weightKg ? ` · weight ${entry.encounter.vitals.weightKg} kg` : ''}
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

const Consultations = () => {
  const { data, session, dispatch } = useClinic()
  const open =
    data.encounters.find((e) => e.id === session.activeEncounterId) ??
    data.encounters.find((e) => e.status === 'open')
  const patient = open && data.patients.find((p) => p.id === open.patientId)
  const appt = open && data.appointments.find((a) => a.id === open.appointmentId)
  const [note, setNote] = useState('')
  const [vitals, setVitals] = useState<Vitals>(open?.vitals ?? { weightKg: '', tempC: '', heartRate: '', respRate: '' })
  const [dxText, setDxText] = useState('')
  const [dxStatus, setDxStatus] = useState<'provisional' | 'confirmed'>('provisional')
  const [rxItemId, setRxItemId] = useState('')
  const [rxDose, setRxDose] = useState('')
  const [rxRoute, setRxRoute] = useState('PO')
  const [rxFrequency, setRxFrequency] = useState('BID')
  const [rxDuration, setRxDuration] = useState('7 days')
  const [rxQuantity, setRxQuantity] = useState('1')
  const [vacName, setVacName] = useState('')
  const [vacLot, setVacLot] = useState('')
  const [vacNextDue, setVacNextDue] = useState('')
  const [followUpDate, setFollowUpDate] = useState('')
  const [followUpTime, setFollowUpTime] = useState('10:00')
  const [amendNoteId, setAmendNoteId] = useState<string | null>(null)
  const [amendBody, setAmendBody] = useState('')
  const [amendReason, setAmendReason] = useState('')
  useEffect(() => {
    if (open) setVitals(open.vitals)
  }, [open?.id]) // eslint-disable-line react-hooks/exhaustive-deps
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
  const allergyHit = patient && selectedRx ? patient.allergies.find((a) => a && selectedRx.name.toLowerCase().includes(a.toLowerCase())) : undefined
  if (!open || !patient)
    return (
      <>
        <PageHeader title="Consultation" description="Open an appointment to start a consultation." />
        <Panel title="No active consultation">
          <p className="empty-state">Choose a booked appointment from the calendar to begin.</p>
        </Panel>
      </>
    )
  if (open.status === 'closed') {
    const invoice = data.invoices.find((i) => i.encounterId === open.id)
    return (
      <>
        <PageHeader
          title="Consultation closed"
          description={`The clinical record for ${patient.name} is archived — notes, diagnoses and prescriptions are preserved.`}
        />
        <Panel title="Visit complete">
          <p className="empty-state">
            {invoice ? `Draft invoice ${invoice.number} was created and is ready to post in Billing.` : 'No invoice was created for this visit.'}
          </p>
          <div className="panel-footer">
            <button
              className="button primary"
              onClick={() => dispatch({ type: 'session', patch: { view: 'billing', activeEncounterId: undefined } })}
            >
              Go to billing
            </button>
          </div>
        </Panel>
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
        administeredAt: new Date().toISOString(),
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
        reason: `Follow-up${appt ? `: ${appt.reason}` : ''}`,
        vetId: open.attendingId,
      },
    })
    setFollowUpDate('')
  }
  return (
    <>
      <PageHeader
        title="Consultation"
        description={`Clinical record for ${patient.name} · ${patient.species} · ${patient.breed}${appt ? ` · ${appt.reason}` : ''}`}
        action={
          <Pill tone="ok" dot>
            Saved locally
          </Pill>
        }
      />
      <div className="consult-grid">
        <div className="side-stack">
          <Panel title="Patient snapshot" description="Current patient details">
            <div className="patient-profile">
              <div className="large-pet-avatar">{patient.name.slice(0, 1)}</div>
              <div>
                <h3>{patient.name}</h3>
                <span>
                  {patient.mrn} · {patient.sex} · {patient.breed}
                </span>
                <span>Owner: {data.owners.find((o) => o.id === patient.ownerId)?.name}</span>
              </div>
            </div>
            {(patient.allergies.length > 0 || patient.medicalAlerts.length > 0) && (
              <div className="patient-flags consult-flags" role="alert">
                {patient.allergies.map((a) => (
                  <Pill key={a} tone="bad" dot>
                    Allergy: {a}
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
          <Panel title="Vitals" description="Weight, temperature, pulse and respiration">
            <div className="form-grid">
              <Field label="Weight (kg)" htmlFor="vt-weight">
                <input id="vt-weight" inputMode="decimal" value={vitals.weightKg} onChange={(e) => setVitals({ ...vitals, weightKg: e.target.value })} placeholder="e.g. 28.6" />
              </Field>
              <Field label="Temperature (°C)" htmlFor="vt-temp">
                <input id="vt-temp" inputMode="decimal" value={vitals.tempC} onChange={(e) => setVitals({ ...vitals, tempC: e.target.value })} placeholder="e.g. 38.6" />
              </Field>
              <Field label="Heart rate (bpm)" htmlFor="vt-hr">
                <input id="vt-hr" inputMode="numeric" value={vitals.heartRate} onChange={(e) => setVitals({ ...vitals, heartRate: e.target.value })} placeholder="e.g. 96" />
              </Field>
              <Field label="Respiratory rate" htmlFor="vt-rr">
                <input id="vt-rr" inputMode="numeric" value={vitals.respRate} onChange={(e) => setVitals({ ...vitals, respRate: e.target.value })} placeholder="e.g. 22" />
              </Field>
            </div>
            <div className="panel-footer">
              <button
                className="button secondary"
                onClick={() => dispatch({ type: 'updateVitals', encounterId: open.id, vitals })}
              >
                Record vitals
              </button>
            </div>
          </Panel>
          <Panel title="Vaccinations" description="Recorded during this visit and prior history">
            <div className="inline-form nested">
              <div className="form-grid">
                <Field label="Vaccine" htmlFor="vac-name">
                  <input id="vac-name" list="vac-options" value={vacName} onChange={(e) => setVacName(e.target.value)} placeholder="e.g. Rabies vaccine…" />
                  <datalist id="vac-options">
                    {data.inventoryItems.filter((i) => i.category === 'vaccine').map((i) => (
                      <option key={i.id} value={i.name} />
                    ))}
                  </datalist>
                </Field>
                <Field label="Lot number" htmlFor="vac-lot">
                  <input id="vac-lot" value={vacLot} onChange={(e) => setVacLot(e.target.value)} placeholder="e.g. RAB-2610B…" />
                </Field>
                <Field label="Next due" htmlFor="vac-next">
                  <input id="vac-next" type="date" value={vacNextDue} onChange={(e) => setVacNextDue(e.target.value)} />
                </Field>
              </div>
              <button className="button secondary" onClick={recordVac} disabled={!vacName.trim()}>
                Record vaccination
              </button>
            </div>
            <div className="activity-list">
              {patientVaccinations.length === 0 && <p className="empty-state">No vaccinations recorded for this patient.</p>}
              {patientVaccinations.map((v) => (
                <div className="activity-row" key={v.id}>
                  <div className="activity-mark"><CalendarDays size={14} /></div>
                  <div>
                    <strong>{v.vaccineName}</strong>
                    <span>
                      {formatDate(v.administeredAt)}
                      {v.lotNumber ? ` · lot ${v.lotNumber}` : ''}
                      {v.nextDueAt ? ` · next due ${v.nextDueAt}` : ''}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </div>
        <div className="side-stack">
          <Panel title="Diagnoses" description="Provisional working diagnoses and confirmed findings">
            <div className="inline-form nested">
              <div className="form-grid">
                <Field label="Diagnosis" htmlFor="dx-text">
                  <input id="dx-text" value={dxText} onChange={(e) => setDxText(e.target.value)} placeholder="e.g. Soft tissue strain, right stifle…" />
                </Field>
                <Field label="Status" htmlFor="dx-status">
                  <NativeSelect id="dx-status" value={dxStatus} onChange={(e) => setDxStatus(e.target.value as 'provisional' | 'confirmed')}>
                    <option value="provisional">Provisional</option>
                    <option value="confirmed">Confirmed</option>
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
                Add diagnosis
              </button>
            </div>
            <div className="rx-list">
              {open.diagnoses.length === 0 && <p className="empty-state">No diagnoses recorded yet.</p>}
              {open.diagnoses.map((d) => (
                <div className="rx-row" key={d.id}>
                  <div>
                    <strong>{d.description}</strong>
                    <span>{d.status}</span>
                  </div>
                  {d.status === 'provisional' ? (
                    <button
                      className="small-button"
                      onClick={() => dispatch({ type: 'confirmDiagnosis', encounterId: open.id, diagnosisId: d.id })}
                      aria-label={`Confirm diagnosis ${d.description}`}
                    >
                      Confirm
                    </button>
                  ) : (
                    <Pill tone="ok" dot>{d.status}</Pill>
                  )}
                </div>
              ))}
            </div>
          </Panel>
          <Panel title="Prescriptions" description="Dispensed from pharmacy stock when the visit closes">
            <div className="inline-form nested">
              <div className="form-grid">
                <Field label="Medication" htmlFor="rx-item">
                  <NativeSelect id="rx-item" value={rxItemId} onChange={(e) => setRxItemId(e.target.value)}>
                    <option value="">— select medication —</option>
                    {catalog.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </NativeSelect>
                </Field>
                <Field label="Dose" htmlFor="rx-dose">
                  <input id="rx-dose" value={rxDose} onChange={(e) => setRxDose(e.target.value)} placeholder="e.g. 0.1 mg/kg" />
                </Field>
                <Field label="Route" htmlFor="rx-route">
                  <input id="rx-route" value={rxRoute} onChange={(e) => setRxRoute(e.target.value)} placeholder="PO / SC / IM" />
                </Field>
                <Field label="Frequency" htmlFor="rx-freq">
                  <input id="rx-freq" value={rxFrequency} onChange={(e) => setRxFrequency(e.target.value)} placeholder="SID / BID / TID" />
                </Field>
                <Field label="Duration" htmlFor="rx-duration">
                  <input id="rx-duration" value={rxDuration} onChange={(e) => setRxDuration(e.target.value)} placeholder="e.g. 7 days" />
                </Field>
                <Field label="Quantity" htmlFor="rx-qty">
                  <input id="rx-qty" type="number" min="1" value={rxQuantity} onChange={(e) => setRxQuantity(e.target.value)} />
                </Field>
              </div>
              {allergyHit && (
                <p className="allergy-warning" role="alert">
                  <Pill tone="bad" dot>Allergy warning</Pill>
                  {patient.name} is allergic to “{allergyHit}” — check this prescription before dispensing.
                </p>
              )}
              <button className="button secondary" onClick={addRx} disabled={!selectedRx || !rxDose.trim()}>
                Add prescription
              </button>
            </div>
            <div className="rx-list">
              {open.prescriptions.length === 0 && <p className="empty-state">No prescriptions on this visit.</p>}
              {open.prescriptions.map((rx) => (
                <div className="rx-row" key={rx.id}>
                  <div>
                    <strong>{rx.medication}</strong>
                    <span>
                      {rx.dose} · {rx.route} · {rx.frequency} · {rx.duration} · qty {rx.quantity}
                    </span>
                  </div>
                  <button className="text-button" onClick={() => dispatch({ type: 'removePrescription', encounterId: open.id, prescriptionId: rx.id })}>
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </Panel>
          <Panel title="Clinical notes" description="Authored notes are preserved as a revision history">
            <textarea
              className="note-box"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              aria-label="Clinical notes"
              placeholder="Record the consultation findings, assessment and plan…"
            />
            <div className="panel-footer">
              <span className="save-hint">
                <span className="pulse" /> Draft is saved locally
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
                Add note
              </button>
              <button
                className="button primary"
                onClick={() => dispatch({ type: 'closeEncounter', encounterId: open.id })}
              >
                Close consultation
              </button>
            </div>
            {open.notes.length > 0 && (
              <div className="note-history">
                {open.notes.map((n) => {
                  const author = data.users.find((u) => u.id === n.authorId)
                  const amends = n.amends ? open.notes.find((x) => x.id === n.amends) : undefined
                  return (
                    <div key={n.id} className={n.amends ? 'note-entry amended' : 'note-entry'}>
                      <span>
                        {formatDate(n.createdAt)}
                        {author ? ` · ${author.name}` : ''}
                        {n.amends && (
                          <>
                            {' · '}
                            <Pill tone="warn" dot>
                              Amendment
                            </Pill>
                          </>
                        )}
                      </span>
                      <p>{n.body}</p>
                      {n.amends && (
                        <span className="note-amend-meta">
                          Reason: {n.amendReason || 'not recorded'}
                          {amends ? ' · supersedes an earlier note' : ' · original note no longer on file'}
                        </span>
                      )}
                      {amendNoteId === n.id ? (
                        <div className="note-amend-form">
                          <Field label="Reason for amendment" htmlFor="note-amend-reason">
                            <input
                              id="note-amend-reason"
                              value={amendReason}
                              onChange={(e) => setAmendReason(e.target.value)}
                              placeholder="e.g. Corrected the recorded dose…"
                            />
                          </Field>
                          <textarea
                            className="note-box"
                            aria-label="Amended note"
                            value={amendBody}
                            onChange={(e) => setAmendBody(e.target.value)}
                          />
                          <div className="panel-footer">
                            <button className="small-button" onClick={cancelAmend}>
                              Cancel
                            </button>
                            <button className="button primary" onClick={saveAmend} disabled={!amendBody.trim() || !amendReason.trim()}>
                              Save amendment
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button className="text-button" onClick={() => startAmend(n.id, n.body)}>
                          Amend
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </Panel>
          <Panel title="Follow-up" description="Book the next visit before closing">
            <div className="inline-form nested">
              <div className="form-grid">
                <Field label="Follow-up date" htmlFor="fu-date">
                  <input id="fu-date" type="date" value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)} />
                </Field>
                <Field label="Time" htmlFor="fu-time">
                  <input id="fu-time" type="time" value={followUpTime} onChange={(e) => setFollowUpTime(e.target.value)} />
                </Field>
              </div>
              <button className="button secondary" onClick={bookFollowUp} disabled={!followUpDate}>
                Book follow-up
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
    { label: 'Outstanding balance', value: formatCurrency(outstanding), note: `${openInvoices.length} open invoices`, icon: CreditCard, tone: 'teal' },
    { label: 'Collected today', value: formatCurrency(collectedToday), note: `${data.payments.filter((p) => p.receivedAt.startsWith(today)).length} payments`, icon: Plus, tone: 'violet' },
    { label: 'Draft invoices', value: String(drafts.length), note: 'Ready to post', icon: ClipboardList, tone: 'amber' },
    { label: 'Billed all time', value: formatCurrency(billedTotal), note: `${data.invoices.length} invoices`, icon: BarChart3, tone: 'teal' },
  ]

  const sortedInvoices = [...data.invoices].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const paymentInvoice = data.invoices.find((i) => i.id === paymentInvoiceId)
  const paymentBalance = paymentInvoice ? invoiceTotals(paymentInvoice, data.clinic.vatRate, data.payments).balance : 0

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

  return (
    <>
      <PageHeader
        title="Billing & payments"
        description="Invoices, payments and adjustments stay traceable."
        action={
          <button className="button primary" onClick={() => setNewInvoiceOpen(true)} disabled={!billing.allowed} title={billing.reason || undefined}>
            <Plus size={16} /> New invoice
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
              <strong>New invoice</strong>
              <span>Draft invoices can be edited and posted when settled at the desk.</span>
            </div>
            <button className="icon-button" onClick={() => setNewInvoiceOpen(false)} aria-label="Close form">
              <X size={17} />
            </button>
          </div>
          <div className="form-grid">
            <Field label="Owner" htmlFor="ni-owner">
              <NativeSelect id="ni-owner" value={niOwnerId || data.owners[0]?.id || ''} onChange={(e) => setNiOwnerId(e.target.value)}>
                {data.owners.map((o) => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Line item" htmlFor="ni-item">
              <NativeSelect id="ni-item" value={niCatalogId} onChange={(e) => setNiCatalogId(e.target.value)}>
                <option value="">— select item —</option>
                {catalog.map((c) => (
                  <option key={c.id} value={c.id}>{c.name} — {formatCurrency(c.unitPrice)}</option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Quantity" htmlFor="ni-qty">
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
              Create draft invoice
            </button>
          </div>
        </div>
      )}
      <Panel
        title="Invoices"
        description="Drafts can be reviewed before posting; posted invoices are immutable."
      >
        <div className="records-table table-wide billing-table">
          <div className="table-head">
            <span>Invoice</span>
            <span>Owner</span>
            <span>Items</span>
            <span>Status</span>
            <span>Total</span>
            <span>Balance</span>
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
                    {invoice.items.length} item{invoice.items.length === 1 ? '' : 's'}
                  </span>
                  <span>
                    <Pill tone={statusTone(invoice.status)} dot>
                      {invoice.status}
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
                          Add item
                        </button>
                        <button
                          className="small-button"
                          onClick={() => dispatch({ type: 'postInvoice', invoiceId: invoice.id })}
                        >
                          Post invoice
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
                        Record payment
                      </button>
                    )}
                    {invoice.status === 'posted' && totals.paid === 0 && (
                      <button
                        className="row-action"
                        disabled={!billing.allowed}
                        title={billing.reason || undefined}
                        onClick={() => {
                          if (confirm(`Void ${invoice.number}? This cannot be undone.`)) {
                            dispatch({ type: 'voidInvoice', invoiceId: invoice.id })
                          }
                        }}
                      >
                        Void
                      </button>
                    )}
                    {(invoice.status !== 'draft' || totals.balance === 0) && (
                      <button className="row-action" onClick={() => setReceiptInvoiceId(invoice.id)}>
                        Receipt
                      </button>
                    )}
                  </div>
                </div>
                {addItemInvoiceId === invoice.id && (
                  <div className="inline-form nested">
                    <div className="form-grid">
                      <Field label="Item" htmlFor={`ai-item-${invoice.id}`}>
                        <NativeSelect id={`ai-item-${invoice.id}`} value={addItemCatalogId} onChange={(e) => setAddItemCatalogId(e.target.value)}>
                          <option value="">— select item —</option>
                          {catalog.map((c) => (
                            <option key={c.id} value={c.id}>{c.name} — {formatCurrency(c.unitPrice)}</option>
                          ))}
                        </NativeSelect>
                      </Field>
                      <Field label="Quantity" htmlFor={`ai-qty-${invoice.id}`}>
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
                      Add to invoice
                    </button>
                  </div>
                )}
              </div>
            )
          })}
          {sortedInvoices.length === 0 && <p className="empty-state">No invoices yet.</p>}
        </div>
      </Panel>
      <Panel title="Recent payments" description="Every payment is appended to an immutable ledger.">
        <div className="activity-list">
          {[...data.payments]
            .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))
            .slice(0, 10)
            .map((payment) => {
              const invoice = data.invoices.find((i) => i.id === payment.invoiceId)
              return (
                <div className="activity-row" key={payment.id}>
                  <div className="activity-mark">
                    <CreditCard size={14} />
                  </div>
                  <div>
                    <strong>
                      {formatCurrency(payment.amount)} · {invoice?.number ?? 'Unassigned'}
                    </strong>
                    <span>
                      {payment.method} · {formatDate(payment.receivedAt)} · {formatTime(payment.receivedAt)}
                    </span>
                  </div>
                  <Pill tone="muted">{payment.method}</Pill>
                </div>
              )
            })}
          {data.payments.length === 0 && <p className="empty-state">No payments recorded yet.</p>}
        </div>
      </Panel>

      {paymentInvoice && (
        <div
          className="modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setPaymentInvoiceId(null)
          }}
        >
          <div className="modal" role="dialog" aria-modal="true" aria-label={`Record payment for ${paymentInvoice.number}`}>
            <div className="form-heading">
              <div>
                <strong>Record payment — {paymentInvoice.number}</strong>
                <span>
                  Balance due {formatCurrency(paymentBalance)} · partial payments are supported
                </span>
              </div>
              <button className="icon-button" onClick={() => setPaymentInvoiceId(null)} aria-label="Close dialog">
                <X size={17} />
              </button>
            </div>
            <div className="form-grid">
              <Field label="Amount (THB)" htmlFor="pay-amount">
                <input id="pay-amount" type="number" min="0" step="0.01" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} />
              </Field>
              <Field label="Method" htmlFor="pay-method">
                <NativeSelect id="pay-method" value={payMethod} onChange={(e) => setPayMethod(e.target.value as typeof payMethod)}>
                  <option value="cash">Cash</option>
                  <option value="card">Card</option>
                  <option value="promptpay">PromptPay</option>
                  <option value="transfer">Bank transfer</option>
                </NativeSelect>
              </Field>
            </div>
            <div className="panel-footer">
              <button className="button secondary" onClick={() => setPaymentInvoiceId(null)}>
                Cancel
              </button>
              <button
                className="button primary"
                onClick={submitPayment}
                disabled={!(Number(payAmount) > 0) || Math.round(Number(payAmount) * 100) > paymentBalance}
              >
                Record payment
              </button>
            </div>
          </div>
        </div>
      )}
      {receiptInvoiceId && (
        <ReceiptDialog invoiceId={receiptInvoiceId} onClose={() => setReceiptInvoiceId(null)} />
      )}
    </>
  )
}

const ReceiptDialog = ({ invoiceId, onClose }: { invoiceId: string; onClose: () => void }) => {
  const { data } = useClinic()
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
      <div className="modal" role="dialog" aria-modal="true" aria-label={`Receipt for ${invoice.number}`}>
        <div className="print-area receipt">
          <header>
            <h2>{data.clinic.name}</h2>
            <span>Invoice / Receipt</span>
          </header>
          <div className="receipt-meta">
            <span>{invoice.number}</span>
            <span>{formatDate(invoice.createdAt)}</span>
            <span>{owner?.name}</span>
          </div>
          <div className="receipt-items">
            <div className="receipt-line receipt-head">
              <span>Item</span>
              <span>Qty</span>
              <span>Price</span>
              <span>Amount</span>
            </div>
            {invoice.items.map((item) => (
              <div className="receipt-line" key={item.id}>
                <span>{item.description}</span>
                <span>{item.quantity}</span>
                <span>{formatCurrency(item.unitPrice)}</span>
                <span>{formatCurrency(item.quantity * item.unitPrice)}</span>
              </div>
            ))}
          </div>
          <div className="receipt-totals">
            <div><span>Subtotal</span><strong>{formatCurrency(totals.subtotal)}</strong></div>
            <div><span>VAT ({Math.round(data.clinic.vatRate * 100)}%)</span><strong>{formatCurrency(totals.tax)}</strong></div>
            <div className="receipt-grand"><span>Total</span><strong>{formatCurrency(totals.total)}</strong></div>
            {invoicePayments.length > 0 && (
              <>
                {invoicePayments.map((p) => (
                  <div key={p.id}><span>Paid — {p.method}</span><strong>{formatCurrency(p.amount)}</strong></div>
                ))}
                <div className="receipt-grand"><span>Balance due</span><strong>{formatCurrency(totals.balance)}</strong></div>
              </>
            )}
          </div>
          <footer>Thank you — {data.clinic.name} · {data.clinic.timezone}</footer>
        </div>
        <div className="panel-footer no-print">
          <button className="button secondary" onClick={onClose}>
            Close
          </button>
          <button className="button primary" onClick={() => window.print()}>
            Print receipt
          </button>
        </div>
      </div>
    </div>
  )
}

const categoryLabel: Record<string, string> = {
  medicine: 'Medicine',
  vaccine: 'Vaccine',
  equipment: 'Equipment',
  supply: 'Supply',
}

const Inventory = () => {
  const { data, dispatch } = useClinic()
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
        title="Pharmacy & inventory"
        description="Items, batch lots and an append-only stock ledger with clear reorder signals."
        action={
          <button className="button primary" onClick={() => setShowItemForm((v) => !v)} disabled={!inventory.allowed}>
            <Plus size={16} /> Add item
          </button>
        }
      />
      {!inventory.allowed && <p className="empty-state">{inventory.reason}. Inventory changes require admin or pharmacist access.</p>}
      {showItemForm && (
        <div className="inline-form">
          <div className="form-heading">
            <div>
              <strong>Add inventory item</strong>
              <span>Define the stock-keeping unit; lots are received against it.</span>
            </div>
            <button className="icon-button" onClick={() => setShowItemForm(false)} aria-label="Close form">
              <X size={17} />
            </button>
          </div>
          <div className="form-grid">
            <Field label="Name" htmlFor="inv-name">
              <input id="inv-name" value={itemName} onChange={(e) => setItemName(e.target.value)} placeholder="e.g. Amoxicillin 250 mg…" />
            </Field>
            <Field label="Category" htmlFor="inv-cat">
              <select id="inv-cat" value={itemCategory} onChange={(e) => setItemCategory(e.target.value as InventoryCategory)}>
                {Object.entries(categoryLabel).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </Field>
            <Field label="Unit" htmlFor="inv-unit">
              <input id="inv-unit" value={itemUnit} onChange={(e) => setItemUnit(e.target.value)} placeholder="tablet / dose / bottle…" />
            </Field>
            <Field label="Reorder level" htmlFor="inv-reorder">
              <input id="inv-reorder" type="number" min="0" value={itemReorder} onChange={(e) => setItemReorder(e.target.value)} />
            </Field>
            <Field label="Selling price (THB)" htmlFor="inv-price">
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
            Save item
          </button>
        </div>
      )}
      {showSupplierForm && (
        <div className="inline-form">
          <div className="form-heading">
            <div>
              <strong>Add supplier</strong>
              <span>Lots can be tagged with the vendor they were purchased from.</span>
            </div>
            <button className="icon-button" onClick={() => setShowSupplierForm(false)} aria-label="Close form">
              <X size={17} />
            </button>
          </div>
          <div className="form-grid">
            <Field label="Supplier name" htmlFor="sup-name">
              <input id="sup-name" value={supplierName} onChange={(e) => setSupplierName(e.target.value)} placeholder="e.g. Thai Vet Pharma Co.…" />
            </Field>
            <Field label="Phone" htmlFor="sup-phone">
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
            Save supplier
          </button>
        </div>
      )}
      <div className="toolbar">
        <div className="filter-group" role="tablist" aria-label="Inventory category filter">
          {(['all', 'medicine', 'vaccine', 'equipment', 'supply'] as const).map((c) => (
            <button key={c} className={`filter-chip ${category === c ? 'active' : ''}`} onClick={() => setCategory(c)}>
              {c === 'all' ? 'All' : categoryLabel[c]}
            </button>
          ))}
        </div>
        <button className="filter-button" onClick={() => setShowSupplierForm((v) => !v)}>
          Suppliers ({data.suppliers.length}) <span>⌄</span>
        </button>
      </div>
      <Panel title={`${items.length} items`} description="Quantity-on-hand is derived from lot quantities">
        <div className="records-table table-wide">
          <div className="table-head">
            <span>Item</span>
            <span>Category</span>
            <span>On hand</span>
            <span>Stock</span>
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
                  <span><Pill tone="info">{categoryLabel[item.category]}</Pill></span>
                  <strong>{onHand}</strong>
                  <span>
                    <Pill tone={low ? 'warn' : 'ok'} dot>{low ? `Low — reorder at ${item.reorderLevel}` : 'In stock'}</Pill>
                  </span>
                  <div className="row-actions">
                    <button className="row-action" onClick={() => setExpandedItemId(expandedItemId === item.id ? null : item.id)}>
                      {expandedItemId === item.id ? 'Hide lots' : `Lots (${lots.length})`}
                    </button>
                    <button className="small-button" onClick={() => setReceivingItemId(receivingItemId === item.id ? null : item.id)} disabled={!inventory.allowed}>
                      Receive stock
                    </button>
                  </div>
                </div>
                {receivingItemId === item.id && (
                  <div className="inline-form nested">
                    <div className="form-grid">
                      <Field label="Lot number" htmlFor={`lot-num-${item.id}`}>
                        <input id={`lot-num-${item.id}`} value={lotNumber} onChange={(e) => setLotNumber(e.target.value)} placeholder="e.g. AMX-2611C…" />
                      </Field>
                      <Field label="Quantity" htmlFor={`lot-qty-${item.id}`}>
                        <input id={`lot-qty-${item.id}`} type="number" min="1" value={lotQuantity} onChange={(e) => setLotQuantity(e.target.value)} />
                      </Field>
                      <Field label="Expiry date" htmlFor={`lot-exp-${item.id}`}>
                        <input id={`lot-exp-${item.id}`} type="date" value={lotExpiry} onChange={(e) => setLotExpiry(e.target.value)} />
                      </Field>
                      <Field label="Supplier" htmlFor={`lot-sup-${item.id}`}>
                        <select id={`lot-sup-${item.id}`} value={lotSupplier} onChange={(e) => setLotSupplier(e.target.value)}>
                          <option value="">— none —</option>
                          {data.suppliers.map((s) => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Cost/unit (THB)" htmlFor={`lot-cost-${item.id}`}>
                        <input id={`lot-cost-${item.id}`} type="number" min="0" step="0.01" value={lotCost} onChange={(e) => setLotCost(e.target.value)} />
                      </Field>
                    </div>
                    <button className="button primary" onClick={() => receiveLot(item.id)}>Record receipt</button>
                  </div>
                )}
                {expandedItemId === item.id && (
                  <div className="lot-breakdown">
                    {lots.length === 0 && <p className="empty-state">No lots received yet.</p>}
                    {lots.map((lot) => {
                      const supplier = data.suppliers.find((s) => s.id === lot.supplierId)
                      const movements = data.stockMovements.filter((m) => m.lotId === lot.id)
                      return (
                        <div className="lot-row" key={lot.id}>
                          <div className="lot-main">
                            <strong>Lot {lot.lotNumber}</strong>
                            <span>
                              {lot.quantity} {item.unit}
                              {lot.expiryDate ? ` · exp ${lot.expiryDate}` : ''}
                              {supplier ? ` · ${supplier.name}` : ''}
                            </span>
                          </div>
                          <span className="lot-ledger">{movements.length} ledger entries</span>
                          <div className="row-actions">
                            <button
                              className="row-action"
                              disabled={!inventory.allowed || lot.quantity <= 0}
                              onClick={() => dispatch({ type: 'recordStockMovement', lotId: lot.id, delta: -1, reason: 'stock_out', notes: 'manual dispense' })}
                            >
                              Dispense 1
                            </button>
                            <button
                              className="row-action"
                              disabled={!inventory.allowed}
                              onClick={() => dispatch({ type: 'recordStockMovement', lotId: lot.id, delta: -1, reason: 'waste', notes: 'write-off' })}
                            >
                              Waste 1
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
          {items.length === 0 && <p className="empty-state">No items in this category yet.</p>}
        </div>
      </Panel>
      <Panel title="Suppliers" description="Vendors lots are purchased from">
        <div className="activity-list">
          {data.suppliers.map((s) => (
            <div className="activity-row" key={s.id}>
              <div className="activity-mark"><Package size={14} /></div>
              <div>
                <strong>{s.name}</strong>
                <span>{[s.phone, s.email].filter(Boolean).join(' · ') || 'No contact details'}</span>
              </div>
              <Pill tone="muted">{data.inventoryLots.filter((l) => l.supplierId === s.id).length} lots</Pill>
            </div>
          ))}
          {data.suppliers.length === 0 && <p className="empty-state">No suppliers recorded yet.</p>}
        </div>
      </Panel>
    </>
  )
}
