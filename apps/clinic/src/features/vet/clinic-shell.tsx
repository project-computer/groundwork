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
import { formatMoney as formatCurrency, formatDate, formatTime, initials, invoiceTotals, itemOnHand, lotsExpiringWithin, mostUsedItems, roleLabel, statusTone, todayKey } from '@/lib/vet/format'
import type { InventoryCategory } from '@/lib/vet/types'
import { getTheme, setTheme, THEME_CHOICES, watchSystemTheme, type ThemeChoice } from '@/lib/theme'
import { ReportsView } from './reports-view'
import { ScheduleView } from './schedule-view'
import { RecordsView, SettingsView, StaffView } from './views'

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
          <span className="chevron" aria-hidden="true">⌄</span>
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
            <span className="more" aria-hidden="true">•••</span>
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
            <button className="avatar top-avatar" aria-label={`Account settings for ${user.name}`}>{initials(user.name)}</button>
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
  const [microchip, setMicrochip] = useState('')
  const [detailId, setDetailId] = useState<string | null>(null)
  const filtered = data.patients.filter((p) => {
    const owner = data.owners.find((o) => o.id === p.ownerId)?.name ?? ''
    return `${p.name} ${owner} ${p.mrn} ${p.microchip ?? ''}`.toLowerCase().includes(query.toLowerCase())
  })
  return (
    <>
      <PageHeader
        title="Owners & pets"
        description="Find a record quickly or register a new patient."
        action={
          <button className="button primary" onClick={() => setShowForm(true)} disabled={!canWrite}>
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
            placeholder="Search by owner, patient, MRN or microchip…"
            aria-label="Search owners or patients"
          />
        </div>
        <button className="filter-button">
          All patients <span aria-hidden="true">⌄</span>
        </button>
      </div>
      {showForm && (
        <div className="inline-form">
          <div className="form-heading">
            <div>
              <strong>Register owner and patient</strong>
              <span>Both records will be saved in one local transaction.</span>
            </div>
            <button className="icon-button" onClick={() => setShowForm(false)} aria-label="Close form">
              <X size={17} />
            </button>
          </div>
          <div className="form-grid">
            <Field label="Owner name" htmlFor="owner">
              <input
                id="owner"
                name="owner-name"
                autoComplete="off"
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                placeholder="e.g. Anong Srisuk…"
              />
            </Field>
            <Field label="Patient name" htmlFor="pet">
              <input
                id="pet"
                name="patient-name"
                autoComplete="off"
                value={petName}
                onChange={(e) => setPetName(e.target.value)}
                placeholder="e.g. Milo…"
              />
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
                  microchip: microchip.trim() || undefined,
                  allergies: [],
                  medicalAlerts: [],
                  weightUnit: 'kg',
                },
              })
              setOwnerName('')
              setPetName('')
              setMicrochip('')
              setShowForm(false)
            }}
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
                <button className="row-action" onClick={() => setDetailId(patient.id)}>
                  View
                </button>
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

function PatientClinicalDialog({ patientId, onClose, canWrite }: { patientId: string; onClose: () => void; canWrite: boolean }) {
  const { data, dispatch } = useClinic()
  const patient = data.patients.find((p) => p.id === patientId)
  const [microchip, setMicrochip] = useState(patient?.microchip ?? '')
  const [allergies, setAllergies] = useState(patient?.allergies.join(', ') ?? '')
  const [alerts, setAlerts] = useState(patient?.medicalAlerts.join(', ') ?? '')
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])
  if (!patient) return null
  const owner = data.owners.find((o) => o.id === patient.ownerId)
  const splitList = (value: string) =>
    value
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-label={`Clinical profile for ${patient.name}`}>
        <div className="form-heading">
          <div>
            <strong>{patient.name}</strong>
            <span>
              {patient.mrn} · {owner?.name ?? 'No owner'} · {patient.species} · {patient.breed}
            </span>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close dialog">
            <X size={17} />
          </button>
        </div>
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
              disabled={!canWrite}
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
              disabled={!canWrite}
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
              disabled={!canWrite}
            />
          </Field>
        </div>
        <div className="panel-footer">
          <button className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="button primary"
            disabled={!canWrite}
            onClick={() => {
              dispatch({
                type: 'updatePatient',
                id: patient.id,
                patch: {
                  microchip: microchip.trim() || undefined,
                  allergies: splitList(allergies),
                  medicalAlerts: splitList(alerts),
                },
              })
              onClose()
            }}
          >
            Save Profile
          </button>
        </div>
      </div>
    </div>
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
  const today = todayKey()

  const openInvoices = data.invoices.filter((i) => i.status !== 'paid')
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
      <Panel
        title="Invoices"
        description="Drafts can be reviewed before posting; posted invoices are immutable."
      >
        <div className="records-table table-wide">
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
            return (
              <div className="table-row" key={invoice.id}>
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
                {invoice.status === 'draft' ? (
                  <button
                    className="small-button"
                    onClick={() => dispatch({ type: 'postInvoice', invoiceId: invoice.id })}
                  >
                    Post invoice
                  </button>
                ) : totals.balance > 0 ? (
                  <button className="row-action">Record payment</button>
                ) : (
                  <button className="row-action">View</button>
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
    </>
  )
}

const categoryLabel: Record<string, string> = {
  medicine: 'Medicine',
  vaccine: 'Vaccine',
  equipment: 'Equipment',
  supply: 'Supply',
}

function Inventory() {
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
