import { useEffect, useMemo, useState } from 'react'
import {
  BarChart3,
  CalendarDays,
  ClipboardList,
  CreditCard,
  LayoutDashboard,
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
import { Field, Panel, PageHeader, Pill } from '@/components/vet/fields'
import { useClinic, usePermission, type View } from '@/lib/vet/store'
import { formatMoney as formatCurrency, formatDate, formatTime, initials, invoiceTotals, roleLabel, statusTone, todayKey } from '@/lib/vet/format'
import { getTheme, setTheme, THEME_CHOICES, watchSystemTheme, type ThemeChoice } from '@/lib/theme'
import { ScheduleView } from './schedule-view'
import { RecordsView, ReportsView, SettingsView, StaffView } from './views'

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

function greeting(now = new Date()) {
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

function ThemeToggle() {
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

export function ClinicApp() {
  const { data, session, user, dispatch } = useClinic()
  const [mobileNav, setMobileNav] = useState(false)
  const [query, setQuery] = useState('')
  const [showOwnerForm, setShowOwnerForm] = useState(false)
  const canWrite = usePermission('records.write').allowed
  const activeView = session.view
  const setView: SetView = (view) => {
    dispatch({ type: 'session', patch: { view } })
    setMobileNav(false)
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
        <div className="clinic-switch">
          <div className="clinic-avatar">{initials(data.clinic.name)}</div>
          <div>
            <strong>{data.clinic.name}</strong>
            <span>Local clinic</span>
          </div>
          <span className="chevron">⌄</span>
        </div>
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
          <div className="profile">
            <div className="avatar">{initials(user.name)}</div>
            <div>
              <strong>{user.name}</strong>
              <span>{roleLabel[user.role]}</span>
            </div>
            <span className="more">•••</span>
          </div>
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
            <div className="connection">
              <span className="pulse" /> <span>{session.lanOnline ? 'Local server' : 'Server offline'}</span>
            </div>
            <button className="avatar top-avatar">{initials(user.name)}</button>
          </div>
        </header>
        <div className="page-wrap">
          {activeView === 'dashboard' && (
            <Dashboard
              onNavigate={setView}
              onStart={(id) => dispatch({ type: 'startEncounter', appointmentId: id })}
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
          {activeView === 'settings' && <SettingsView />}
        </div>
      </main>
    </div>
  )
}

function Dashboard({ onNavigate, onStart }: { onNavigate: SetView; onStart: (id: string) => void }) {
  const { data, user } = useClinic()
  const today = todayKey()
  const firstName = user.name.replace(/^Dr\.\s*/, '').split(' ')[0]
  const todaysAppointments = data.appointments.filter((a) => a.startsAt.startsWith(today))
  const outstanding = data.invoices
    .filter((i) => i.status !== 'paid')
    .reduce((sum, invoice) => sum + invoiceTotals(invoice, data.clinic.vatRate, data.payments).balance, 0)
  return (
    <>
      <PageHeader
        title={`${greeting()}, ${firstName}`}
        description={`${longDate()} · Here’s what’s happening at the clinic today.`}
        action={
          <button className="button primary" onClick={() => onNavigate('owners')}>
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
            <span className="stat-note">{data.invoices.filter((i) => i.status !== 'paid').length} invoices</span>
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
    </>
  )
}

function Owners({
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
}) {
  const { data, dispatch } = useClinic()
  const [ownerName, setOwnerName] = useState('')
  const [petName, setPetName] = useState('')
  const filtered = data.patients.filter((p) =>
    `${p.name} ${data.owners.find((o) => o.id === p.ownerId)?.name}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  )
  return (
    <>
      <PageHeader
        title="Owners & pets"
        description="Find a record quickly or register a new patient."
        action={
          <button className="button primary" onClick={() => setShowForm(true)} disabled={!canWrite}>
            <Plus size={16} /> Register patient
          </button>
        }
      />
      <div className="toolbar">
        <div className="search-field">
          <Search size={17} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by owner or patient"
            aria-label="Search owners or patients"
          />
        </div>
        <button className="filter-button">
          All patients <span>⌄</span>
        </button>
      </div>
      {showForm && (
        <div className="inline-form">
          <div className="form-heading">
            <div>
              <strong>Register owner and patient</strong>
              <span>Both records will be saved in one local transaction.</span>
            </div>
            <button className="icon-button" onClick={() => setShowForm(false)}>
              <X size={17} />
            </button>
          </div>
          <div className="form-grid">
            <Field label="Owner name" htmlFor="owner">
              <input
                id="owner"
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                placeholder="e.g. Anong Srisuk"
              />
            </Field>
            <Field label="Patient name" htmlFor="pet">
              <input
                id="pet"
                value={petName}
                onChange={(e) => setPetName(e.target.value)}
                placeholder="e.g. Milo"
              />
            </Field>
          </div>
          <button
            className="button primary"
            onClick={() => {
              if (!ownerName || !petName) return
              dispatch({
                type: 'registerOwner',
                owner: { name: ownerName, phone: '', email: '', address: '' },
                patient: {
                  name: petName,
                  species: 'Dog',
                  breed: 'Mixed breed',
                  sex: 'Unknown',
                  birthDate: '',
                  weightUnit: 'kg',
                },
              })
              setOwnerName('')
              setPetName('')
              setShowForm(false)
            }}
          >
            Save records
          </button>
        </div>
      )}
      <Panel title={`${filtered.length} patients`} description="Patient identity and owner contact details">
        <div className="records-table">
          <div className="table-head">
            <span>Patient</span>
            <span>Owner</span>
            <span>Species</span>
            <span>Last visit</span>
            <span />
          </div>
          {filtered.map((patient) => {
            const owner = data.owners.find((o) => o.id === patient.ownerId)
            return (
              <div className="table-row" key={patient.id}>
                <div className="patient-cell">
                  <div className="pet-avatar">{patient.name.slice(0, 1)}</div>
                  <div>
                    <strong>{patient.name}</strong>
                    <span>
                      {patient.breed} · {patient.sex}
                    </span>
                  </div>
                </div>
                <span>{owner?.name}</span>
                <span>
                  <Pill tone="muted">{patient.species}</Pill>
                </span>
                <span>{patient.lastVisit ? formatDate(patient.lastVisit) : 'New patient'}</span>
                <button className="row-action">View</button>
              </div>
            )
          })}
        </div>
      </Panel>
    </>
  )
}

function Consultations() {
  const { data, session, dispatch } = useClinic()
  const open =
    data.encounters.find((e) => e.id === session.activeEncounterId) ??
    data.encounters.find((e) => e.status === 'open')
  const patient = open && data.patients.find((p) => p.id === open.patientId)
  const [note, setNote] = useState('')
  if (!open || !patient)
    return (
      <>
        <PageHeader title="Consultation" description="Open an appointment to start a consultation." />
        <Panel title="No active consultation">
          <p className="empty-state">Choose a booked appointment from the calendar to begin.</p>
        </Panel>
      </>
    )
  return (
    <>
      <PageHeader
        title="Consultation"
        description={`Clinical record for ${patient.name} · ${patient.species} · ${patient.breed}`}
        action={
          <Pill tone="ok" dot>
            Saved locally
          </Pill>
        }
      />
      <div className="consult-grid">
        <Panel title="Patient snapshot" description="Current patient details">
          <div className="patient-profile">
            <div className="large-pet-avatar">{patient.name.slice(0, 1)}</div>
            <div>
              <h3>{patient.name}</h3>
              <span>
                {patient.sex} · {patient.breed}
              </span>
              <span>Owner: {data.owners.find((o) => o.id === patient.ownerId)?.name}</span>
            </div>
          </div>
          <div className="vitals">
            <strong>Vitals</strong>
            <div className="vitals-grid">
              {Object.entries(open.vitals).map(([key, value]) => (
                <div key={key}>
                  <small>
                    {key
                      .replace('Kg', ' (kg)')
                      .replace('C', ' (°C)')
                      .replace('Rate', ' rate')}
                  </small>
                  <b>{value || '—'}</b>
                </div>
              ))}
            </div>
          </div>
        </Panel>
        <Panel title="Clinical notes" description="Authored notes are preserved as a revision history">
          <textarea
            className="note-box"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Record the consultation findings, assessment and plan..."
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
              {open.notes.map((n) => (
                <div key={n.id}>
                  <span>{formatDate(n.createdAt)}</span>
                  <p>{n.body}</p>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </>
  )
}

function Billing() {
  const { data, dispatch } = useClinic()
  return (
    <>
      <PageHeader
        title="Billing & payments"
        description="Invoices, payments and adjustments stay traceable."
        action={
          <button className="button primary">
            <Plus size={16} /> New invoice
          </button>
        }
      />
      <Panel
        title="Recent invoices"
        description="Drafts can be reviewed before posting; posted invoices are immutable."
      >
        <div className="records-table">
          <div className="table-head">
            <span>Invoice</span>
            <span>Owner</span>
            <span>Status</span>
            <span>Total</span>
            <span />
          </div>
          {data.invoices.map((invoice) => {
            const owner = data.owners.find((o) => o.id === invoice.ownerId)
            const totals = invoiceTotals(invoice, data.clinic.vatRate, data.payments)
            return (
              <div className="table-row" key={invoice.id}>
                <div>
                  <strong>{invoice.number}</strong>
                  <span>{formatDate(invoice.createdAt)}</span>
                </div>
                <span>{owner?.name}</span>
                <Pill tone={statusTone(invoice.status)} dot>
                  {invoice.status}
                </Pill>
                <strong>{formatCurrency(totals.total)}</strong>
                {invoice.status === 'draft' ? (
                  <button
                    className="small-button"
                    onClick={() => dispatch({ type: 'postInvoice', invoiceId: invoice.id })}
                  >
                    Post invoice
                  </button>
                ) : (
                  <button className="row-action">View</button>
                )}
              </div>
            )
          })}
        </div>
      </Panel>
    </>
  )
}

function Inventory() {
  const { data, dispatch } = useClinic()
  return (
    <>
      <PageHeader
        title="Pharmacy & inventory"
        description="Track stock with append-only movements and clear reorder signals."
        action={
          <button className="button primary">
            <Plus size={16} /> Receive stock
          </button>
        }
      />
      <div className="inventory-grid">
        {data.products
          .filter((p) => p.kind === 'medication')
          .map((product) => {
            const stock = data.stockMovements
              .filter((m) => m.productId === product.id)
              .reduce((sum, m) => sum + m.delta, 0)
            return (
              <Panel key={product.id} title={product.name} description={`${product.sku} · ${product.unit}`}>
                <div className="stock-number">
                  <strong>{stock}</strong>
                  <span>units available</span>
                </div>
                <div className="stock-meter">
                  <span
                    style={{
                      width: `${Math.min(100, (stock / Math.max(product.reorderThreshold, 1)) * 20)}%`,
                    }}
                  />
                </div>
                <div className="panel-footer">
                  <Pill tone={stock <= product.reorderThreshold ? 'warn' : 'ok'} dot>
                    {stock <= product.reorderThreshold ? 'Reorder soon' : 'In stock'}
                  </Pill>
                  <button
                    className="text-button"
                    onClick={() =>
                      dispatch({
                        type: 'receiveStock',
                        productId: product.id,
                        quantity: 10,
                      })
                    }
                  >
                    +10 receive
                  </button>
                </div>
              </Panel>
            )
          })}
      </div>
    </>
  )
}
