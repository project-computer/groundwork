import { useRef, useState } from 'react'
import { plural } from '@lingui/core/macro'
import { Plural, Trans, useLingui } from '@lingui/react/macro'
import { Activity, AlertTriangle, Database, RotateCcw, ShieldCheck } from 'lucide-react'
import { Panel, PageHeader, Pill } from '@/components/vet/fields'
import { Modal } from '@/components/vet/modal'
import { useClinic, usePermission, useSyncState } from '@/lib/vet/store'
import { formatDate, statusLabel, todayKey } from '@/lib/vet/format'
import { buildBackup, downloadBackup, parseBackup, summarizeBackup, type BackupSummary, type ClinicBackup } from '@/lib/vet/backup'

/** Settings View: local data, sync & plan, portability & recovery. */
export const SettingsView = ({ onManageClinic }: { onManageClinic?: () => void }) => {
  const { data, session, dispatch } = useClinic()
  const { t } = useLingui()
  const sync = useSyncState()
  const dataExport = usePermission('data.export')
  const restoreInput = useRef<HTMLInputElement>(null)
  const [restorePreview, setRestorePreview] = useState<{ backup: ClinicBackup; summary: BackupSummary } | null>(null)
  const [restoreError, setRestoreError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const exportData = () => {
    const exportedAt = new Date().toISOString()
    const blob = new Blob([JSON.stringify({ exportedAt, clinic: data.clinic, data }, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `clinicbook-export-${todayKey()}.json`
    anchor.click()
    URL.revokeObjectURL(url)
    dispatch({
      type: 'recordAudit',
      action: 'data.export',
      entityType: 'clinic',
      entityId: data.clinic.id,
      summary: t`Exported the clinic archive — ${plural(data.patients.length, { one: '# patient', other: '# patients' })}, ${plural(data.invoices.length, { one: '# invoice', other: '# invoices' })}`,
    })
    setNotice(t`Clinic archive exported (${plural(data.patients.length, { one: '# patient', other: '# patients' })}, ${plural(data.invoices.length, { one: '# invoice', other: '# invoices' })}).`)
  }

  const createBackup = () => {
    const backup = buildBackup(data, new Date().toISOString())
    downloadBackup(backup)
    dispatch({
      type: 'recordAudit',
      action: 'backup.create',
      entityType: 'clinic',
      entityId: data.clinic.id,
      summary: t`Created a clinic backup — ${plural(data.patients.length, { one: '# patient', other: '# patients' })}, ${plural(data.encounters.length, { one: '# encounter', other: '# encounters' })}`,
    })
    setNotice(t`Backup downloaded. Keep it somewhere outside this computer.`)
  }

  const chooseBackup = async (file: File | undefined) => {
    setRestoreError(null)
    setNotice(null)
    if (!file) return
    const result = parseBackup(await file.text())
    if (!result.ok) {
      setRestoreError(result.error)
      return
    }
    setRestorePreview({ backup: result.backup, summary: summarizeBackup(result.backup) })
  }

  const restoreBackup = () => {
    if (!restorePreview) return
    const summary = summarizeBackup(restorePreview.backup)
    dispatch({ type: 'restoreBackup', backup: restorePreview.backup })
    setRestorePreview(null)
    if (restoreInput.current) restoreInput.current.value = ''
    setNotice(t`Restored ${plural(summary.patients, { one: '# patient', other: '# patients' })} and ${plural(summary.encounters, { one: '# encounter', other: '# encounters' })} from the backup.`)
  }

  return (
    <>
      <PageHeader
        title={t`Settings`}
        description={t`Clinic identity, data portability and plan.`}
        action={
          <Pill tone={session.plan === 'cloud' ? 'ok' : 'info'} dot>
            {session.plan === 'cloud' ? <Trans>Cloud plan</Trans> : <Trans>Local plan</Trans>}
          </Pill>
        }
      />
      <div className="data-grid">
        <Panel title={t`Clinic`} description={t`Shown across the workspace and on printed documents.`}>
          <div className="status-stack">
            <div className="status-line">
              <span className="status-icon">
                <Activity size={17} />
              </span>
              <div>
                <strong>{data.clinic.name}</strong>
                <span>
                  {data.clinic.timezone} · <Trans>currency {data.clinic.currency}</Trans> · <Trans>VAT {Math.round(data.clinic.vatRate * 100)}%</Trans>
                </span>
              </div>
              <Pill tone="muted"><Trans>Local</Trans></Pill>
            </div>
            <div className="status-line">
              <span className="status-icon">
                <Database size={17} />
              </span>
              <div>
                <strong><Trans>Connection</Trans></strong>
                <span>
                  {session.lanOnline ? (
                    <Trans>Clinic server connected · writes are enabled</Trans>
                  ) : (
                    <Trans>Offline · read-only mode</Trans>
                  )}
                </span>
              </div>
              <Pill tone={session.lanOnline ? 'ok' : 'bad'}>
                {session.lanOnline ? <Trans>Connected</Trans> : <Trans>Offline</Trans>}
              </Pill>
            </div>
            <div className="status-line">
              <span className="status-icon">
                <Database size={17} />
              </span>
              <div>
                <strong><Trans>Cloud synchronization</Trans></strong>
                <span>
                  {session.plan === 'local' ? (
                    <Trans>Available on Cloud plan</Trans>
                  ) : sync.state === 'cloud_offline' ? (
                    <Trans>Internet unavailable</Trans>
                  ) : (
                    plural(sync.pending, { one: '# change waiting', other: '# changes waiting' })
                  )}
                </span>
              </div>
              <Pill tone={session.plan === 'local' ? 'muted' : sync.state === 'synced' ? 'ok' : 'warn'}>
                {session.plan === 'local' ? <Trans>Local only</Trans> : statusLabel(sync.state)}
              </Pill>
            </div>
            {session.lastSyncError && (
              <div className="status-line">
                <span className="status-icon">
                  <AlertTriangle size={17} />
                </span>
                <div>
                  <strong><Trans>Last sync attempt failed</Trans></strong>
                  <span>{session.lastSyncError}</span>
                </div>
                <Pill tone="bad"><Trans>Sync error</Trans></Pill>
              </div>
            )}
          </div>
          <div className="data-actions">
            <button className="button primary" onClick={onManageClinic} disabled={!onManageClinic}>
              <Trans>Manage clinic & account</Trans>
            </button>
            {import.meta.env.DEV && (
              <>
                <button className="button secondary" onClick={() => dispatch({ type: 'session', patch: { lanOnline: !session.lanOnline } })}>
                  {session.lanOnline ? <Trans>Simulate server offline</Trans> : <Trans>Reconnect server</Trans>}
                </button>
                <button
                  className="button secondary"
                  onClick={() => dispatch({ type: 'session', patch: { plan: session.plan === 'local' ? 'cloud' : 'local' } })}
                >
                  {session.plan === 'local' ? <Trans>Preview Cloud plan</Trans> : <Trans>Switch to Local plan</Trans>}
                </button>
              </>
            )}
          </div>
        </Panel>
        <Panel title={t`Portability & recovery`} description={t`Export and manual backup are included in the free Local plan.`}>
          {notice && (
            <p className="form-hint" role="status">
              {notice}
            </p>
          )}
          <div className="export-card">
            <div className="export-icon">
              <Database size={20} />
            </div>
            <div>
              <strong><Trans>Clinic export archive</Trans></strong>
              <span><Trans>Versioned JSON snapshot of every clinic record, for reporting and hand-off.</Trans></span>
            </div>
            <button className="button primary" onClick={exportData} disabled={!dataExport.allowed} title={dataExport.reason || undefined}>
              <Trans>Export data</Trans>
            </button>
          </div>
          <div className="export-card">
            <div className="export-icon">
              <ShieldCheck size={20} />
            </div>
            <div>
              <strong><Trans>Clinic backup file</Trans></strong>
              <span><Trans>A restorable copy of this installation — patients, visits, billing and settings.</Trans></span>
            </div>
            <button className="button secondary" onClick={createBackup} disabled={!dataExport.allowed} title={dataExport.reason || undefined}>
              <Trans>Create backup</Trans>
            </button>
          </div>
          <div className="export-card">
            <div className="export-icon">
              <RotateCcw size={20} />
            </div>
            <div>
              <strong><Trans>Restore from backup</Trans></strong>
              <span><Trans>Replaces this installation's records with the backup after a preview.</Trans></span>
            </div>
            <input
              ref={restoreInput}
              type="file"
              accept="application/json,.json"
              className="sr-only"
              aria-label={t`Choose a backup file`}
              onChange={(e) => void chooseBackup(e.target.files?.[0])}
            />
            <button
              className="button secondary"
              onClick={() => restoreInput.current?.click()}
              disabled={!dataExport.allowed}
              title={dataExport.reason || undefined}
            >
              <Trans>Choose backup…</Trans>
            </button>
          </div>
          {restoreError && (
            <p className="form-hint is-bad" role="alert">
              {restoreError}
            </p>
          )}
          {!dataExport.allowed && <p className="form-hint">{dataExport.reason}</p>}
        </Panel>
      </div>
      {restorePreview && (
        <Modal
          label={t`Restore clinic backup`}
          title={<Trans>Restore clinic backup</Trans>}
          subtitle={
            <>
              {restorePreview.summary.clinicName} · <Trans>created {formatDate(restorePreview.backup.createdAt)}</Trans>
            </>
          }
          onClose={() => setRestorePreview(null)}
        >
          <div className="status-stack">
            <div className="status-line">
              <span className="status-icon">
                <Database size={17} />
              </span>
              <div>
                <strong>
                  <Plural value={restorePreview.summary.patients} one="# patient" other="# patients" /> ·{' '}
                  <Plural value={restorePreview.summary.owners} one="# owner" other="# owners" />
                </strong>
                <span>
                  <Plural value={restorePreview.summary.encounters} one="# encounter" other="# encounters" /> ·{' '}
                  <Plural value={restorePreview.summary.appointments} one="# appointment" other="# appointments" /> ·{' '}
                  <Plural value={restorePreview.summary.invoices} one="# invoice" other="# invoices" />
                </span>
              </div>
            </div>
            <div className="status-line">
              <span className="status-icon">
                <ShieldCheck size={17} />
              </span>
              <div>
                <strong>
                  <Plural value={restorePreview.summary.staff} one="# staff account" other="# staff accounts" />
                </strong>
                <span><Trans>Includes roles and PIN credentials as they were when the backup was taken.</Trans></span>
              </div>
            </div>
          </div>
          {restorePreview.backup.state.clinic.id !== data.clinic.id && (
            <p className="form-hint is-bad">
              <Trans>
                This backup belongs to a different clinic ({restorePreview.backup.state.clinic.name}). Restoring it will replace
                this clinic's records.
              </Trans>
            </p>
          )}
          <p className="form-hint">
            <Trans>Everything currently on this computer will be replaced. Export a fresh archive first if you are unsure.</Trans>
          </p>
          <div className="panel-footer">
            <button className="button secondary" onClick={() => setRestorePreview(null)}>
              <Trans>Cancel</Trans>
            </button>
            <button className="button primary" onClick={restoreBackup}>
              <Trans>Restore backup</Trans>
            </button>
          </div>
        </Modal>
      )}
    </>
  )
}

