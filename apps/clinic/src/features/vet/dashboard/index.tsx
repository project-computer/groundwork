import { msg } from '@lingui/core/macro'
import { Plural, Trans, useLingui } from '@lingui/react/macro'
import { CalendarDays, ClipboardList, CreditCard, Package, Plus, ShieldCheck, Stethoscope, Wifi } from 'lucide-react'
import { Panel, PageHeader, Pill } from '@/components/vet/fields'
import { useClinic, type View } from '@/lib/vet/store'
import { formatMoney as formatCurrency, formatDate, formatTime, invoiceTotals, itemOnHand, lotsExpiringWithin, mostUsedItems, statusLabel, statusTone, todayKey, vaccinationsDue } from '@/lib/vet/format'
import { categoryLabel } from '../inventory'

const greeting = (now = new Date()) => {
  const hour = now.getHours()
  if (hour < 12) return msg`Good morning`
  if (hour < 18) return msg`Good afternoon`
  return msg`Good evening`
}

type SetView = (view: View) => void

const longDate = (now = new Date()) =>
  now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

/** Dashboard View: the day's stat cards and worklist panels. */
export const Dashboard = ({
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

