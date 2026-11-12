import { useEffect, useRef, useState } from 'react'
import { plural } from '@lingui/core/macro'
import { Plural, Trans, useLingui } from '@lingui/react/macro'
import { Activity, AlertTriangle, Database, History, RotateCcw, ShieldCheck } from 'lucide-react'
import { Panel, PageHeader, Pill } from '@/components/patterns/fields'
import { Modal } from '@/components/patterns/modal'
import { useClinic, usePermission, useSyncState } from '@/lib/vet/store'
import { formatBytes, formatDate, statusLabel, todayKey } from '@/lib/vet/format'
import {
  buildBackup,
  downloadBackup,
  loadBackupHistory,
  parseBackup,
  restoreNeedsManualSafetyCopy,
  readBackupFromHistory,
  snapshotForRestore,
  summarizeBackup,
  type BackupFileEntry,
  type BackupSummary,
  type ClinicBackup,
} from '@/lib/vet/backup'
import { medicalRecordsExport, ownersPatientsCsv, recordsExportFileName, registerFileName } from '@/lib/vet/exports'

/** Downloads a Blob through a transient anchor — the one download path. */
const downloadBlob = (blob: Blob, name: string) => {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

/** Settings View: local data, sync & plan, portability & recovery. */
export const SettingsView = ({ onManageClinic }: { onManageClinic?: () => void }) => {
  const { data, session, dispatch } = useClinic()
  const { t } = useLingui()
  const sync = useSyncState()
  const dataExport = usePermission('data.export')
  const clinicManage = usePermission('clinic.manage')
  const restoreInput = useRef<HTMLInputElement>(null)
  const [restorePreview, setRestorePreview] = useState<{ backup: ClinicBackup; summary: BackupSummary } | null>(null)
  const [restoreError, setRestoreError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [backupFiles, setBackupFiles] = useState<BackupFileEntry[] | null>(null)
  const [manualSafetyCopy, setManualSafetyCopy] = useState(false)
  const [safetyCopied, setSafetyCopied] = useState(false)
  const [restoring, setRestoring] = useState(false)

  // Backup history comes from the desktop sidecar; in a browser the list
  // stays empty and the panel shows the download-based flow only.
  useEffect(() => {
    let alive = true
    void loadBackupHistory().then((files) => {
      if (alive) setBackupFiles(files)
    })
    return () => {
      alive = false
    }
  }, [])

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

const exportRegister = () => {
    downloadBlob(new Blob([ownersPatientsCsv(data)], { type: 'text/csv;charset=utf-8' }), registerFileName(data.clinic.name))
    dispatch({
      type: 'recordAudit',
      action: 'data.export',
      entityType: 'clinic',
      entityId: data.clinic.id,
      summary: t`Exported the owner & patient register — ${plural(data.owners.length, { one: '# owner', other: '# owners' })}, ${plural(data.patients.length, { one: '# patient', other: '# patients' })}`,
    })
    setNotice(t`Register exported (${plural(data.owners.length, { one: '# owner', other: '# owners' })}, ${plural(data.patients.length, { one: '# patient', other: '# patients' })}).`)
  }

  const exportMedicalRecords = () => {
    const records = medicalRecordsExport(data)
    downloadBlob(new Blob([JSON.stringify(records, null, 2)], { type: 'application/json' }), recordsExportFileName(data.clinic.name))
    dispatch({
      type: 'recordAudit',
      action: 'data.export',
      entityType: 'clinic',
      entityId: data.clinic.id,
      summary: t`Exported medical records — ${plural(data.patients.length, { one: '# patient', other: '# patients' })}, ${plural(data.encounters.length, { one: '# visit', other: '# visits' })}`,
    })
    setNotice(t`Medical records exported (${plural(data.patients.length, { one: '# patient', other: '# patients' })}, ${plural(data.encounters.length, { one: '# visit', other: '# visits' })}).`)
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
    setSafetyCopied(false)
    if (!file) return
    const result = parseBackup(await file.text())
    if (!result.ok) {
      setRestoreError(result.error)
      return
    }
    setManualSafetyCopy(await restoreNeedsManualSafetyCopy())
    setRestorePreview({ backup: result.backup, summary: summarizeBackup(result.backup) })
  }

  const openHistoryBackup = async (entry: BackupFileEntry) => {
    setRestoreError(null)
    setNotice(null)
    setSafetyCopied(false)
    const raw = await readBackupFromHistory(entry.file)
    if (!raw) {
      setRestoreError(t`That backup file could not be read from disk.`)
      return
    }
    const result = parseBackup(JSON.stringify(raw))
    if (!result.ok) {
      setRestoreError(result.error)
      return
    }
    setManualSafetyCopy(await restoreNeedsManualSafetyCopy())
    setRestorePreview({ backup: result.backup, summary: summarizeBackup(result.backup) })
  }

  const downloadSafetyCopy = () => {
    downloadBackup(buildBackup(data, new Date().toISOString(), 'manual'))
    setSafetyCopied(true)
  }

  /**
   * Restore (ADR 0021, fail closed): on the desktop the current document is
   * snapshotted through the sidecar first — a failed snapshot aborts the
   * restore. On the web there is no sidecar, so the user must download the
   * safety copy explicitly before the destructive write is allowed.
   */
  const restoreBackup = async () => {
    if (!restorePreview || restoring) return
    if (manualSafetyCopy && !safetyCopied) return
    setRestoring(true)
    let snapshotNote = ''
    if (!manualSafetyCopy) {
      const snapshot = await snapshotForRestore(data)
      if (!snapshot.ok) {
        setRestoring(false)
        setRestoreError(t`The safety copy of the current data could not be saved (${snapshot.reason}). Restore cancelled — nothing was changed.`)
        return
      }
      snapshotNote = t` A safety copy was saved as ${snapshot.file}.`
      dispatch({
        type: 'recordAudit',
        action: 'backup.pre_restore',
        entityType: 'clinic',
        entityId: data.clinic.id,
        summary: `Pre-restore safety snapshot saved as ${snapshot.file}`,
      })
    }
    const summary = summarizeBackup(restorePreview.backup)
    dispatch({ type: 'restoreBackup', backup: restorePreview.backup })
    setRestoring(false)
    setRestorePreview(null)
    if (restoreInput.current) restoreInput.current.value = ''
    setNotice(
      t`Restored ${plural(summary.patients, { one: '# patient', other: '# patients' })} and ${plural(summary.encounters, { one: '# encounter', other: '# encounters' })} from the backup.${snapshotNote}`,
    )
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
              <Database size={20} />
            </div>
            <div>
              <strong><Trans>Owner & patient register</Trans></strong>
              <span><Trans>One CSV row per patient — the clinic's contactable roster for external systems.</Trans></span>
            </div>
            <button className="button secondary" onClick={exportRegister} disabled={!dataExport.allowed} title={dataExport.reason || undefined}>
              <Trans>Export CSV</Trans>
            </button>
          </div>
          <div className="export-card">
            <div className="export-icon">
              <Database size={20} />
            </div>
            <div>
              <strong><Trans>Medical records</Trans></strong>
              <span><Trans>Visits with vitals, diagnoses, prescriptions and notes, plus vaccinations — one readable JSON.</Trans></span>
            </div>
            <button className="button secondary" onClick={exportMedicalRecords} disabled={!dataExport.allowed} title={dataExport.reason || undefined}>
              <Trans>Export records</Trans>
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
              <History size={20} />
            </div>
            <div>
              <strong><Trans>Daily automatic backup</Trans></strong>
              <span><Trans>Keeps the last 14 daily copies on this computer, next to the clinic database.</Trans></span>
            </div>
            <label className="auto-backup-toggle">
              <input
                type="checkbox"
                checked={data.clinic.autoBackup !== false}
                disabled={!clinicManage.allowed}
                title={clinicManage.reason || undefined}
                onChange={(e) => dispatch({ type: 'updateClinic', patch: { autoBackup: e.target.checked } })}
              />
              <span>{data.clinic.autoBackup !== false ? <Trans>On</Trans> : <Trans>Off</Trans>}</span>
            </label>
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
          {backupFiles && backupFiles.length > 0 && (
            <div className="backup-history">
              <strong><Trans>Backups on this computer</Trans></strong>
              <div className="status-stack">
                {backupFiles.map((entry) => (
                  <div className="status-line" key={entry.file}>
                    <span className="status-icon">
                      <Database size={17} />
                    </span>
                    <div>
                      <strong>{formatDate(entry.createdAt)}</strong>
                      <span>
                        {formatBytes(entry.sizeBytes)} ·{' '}
                        {entry.trigger === 'auto' ? (
                          <Trans>daily</Trans>
                        ) : entry.trigger === 'pre-restore' ? (
                          <Trans>safety copy</Trans>
                        ) : (
                          <Trans>manual</Trans>
                        )}
                      </span>
                    </div>
                    <button className="button secondary" onClick={() => void openHistoryBackup(entry)} disabled={!dataExport.allowed}>
                      <Trans>Preview</Trans>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
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
          {manualSafetyCopy ? (
            <p className="form-hint">
              {safetyCopied ? (
                <Trans>Safety copy downloaded. Restoring will replace everything currently on this device.</Trans>
              ) : (
                <Trans>This device cannot hold a safety copy automatically — download one first; restoring is disabled until you do.</Trans>
              )}
            </p>
          ) : (
            <p className="form-hint">
              <Trans>A safety copy of the current data will be saved on this computer first. Restoring never discards it without a trace.</Trans>
            </p>
          )}
          <div className="panel-footer">
            <button className="button secondary" onClick={() => setRestorePreview(null)}>
              <Trans>Cancel</Trans>
            </button>
            {manualSafetyCopy && !safetyCopied && (
              <button className="button secondary" onClick={downloadSafetyCopy} disabled={!dataExport.allowed}>
                <Trans>Download safety copy</Trans>
              </button>
            )}
            <button
              className="button primary"
              onClick={() => void restoreBackup()}
              disabled={restoring || (manualSafetyCopy && !safetyCopied)}
            >
              <Trans>Restore backup</Trans>
            </button>
          </div>
        </Modal>
      )}
    </>
  )
}

