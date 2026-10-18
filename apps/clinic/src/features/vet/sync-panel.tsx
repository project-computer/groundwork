'use client'

import { Check, Cloud, Download, FileJson, FileSpreadsheet, HardDrive, Lock, MonitorSmartphone, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { exportCsv, exportJson } from '@/lib/export'
import { isClinicData, mergeData, replaceAllData, useClinicData, usePlan } from '@/lib/store'
import { formatRelative } from './format'
import { UpgradeDialog } from './upgrade-dialog'

export function SyncPanel() {
  const { data } = useClinicData()
  const plan = usePlan()
  const fileRef = useRef<HTMLInputElement>(null)
  const [mode, setMode] = useState<'merge' | 'replace'>('merge')
  const [upgradeOpen, setUpgradeOpen] = useState(false)

  async function onImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const parsed = JSON.parse(await file.text())
      if (!isClinicData(parsed)) throw new Error('invalid')
      if (mode === 'replace') {
        if (!window.confirm('Replace all local records with this backup?')) return
        replaceAllData(parsed)
      } else {
        mergeData(parsed)
      }
      toast.success(`Imported ${parsed.patients.length} patients, ${parsed.appointments.length} appointments`)
    } catch {
      toast.error('That file is not a valid VetDesk backup')
    }
  }

  function triggerImport(next: 'merge' | 'replace') {
    setMode(next)
    fileRef.current?.click()
  }

  return (
    <section className="flex flex-col gap-4" aria-labelledby="sync-heading">
      <h2 id="sync-heading" className="text-lg font-semibold">
        Sync &amp; Backup
      </h2>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2">
                <HardDrive className="size-4 text-primary" aria-hidden="true" />
                Local sync
              </CardTitle>
              <Badge variant="secondary" className="gap-1">
                <span className="size-1.5 rounded-full bg-primary" aria-hidden="true" />
                Active
              </Badge>
            </div>
            <CardDescription>
              Records are saved in this browser and stay in sync across every open tab on this device. Works offline.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <dl className="grid grid-cols-3 gap-2 rounded-lg bg-muted p-3 text-center">
              <Stat label="Patients" value={data.patients.length} />
              <Stat label="Visits" value={data.appointments.length} />
              <Stat label="Last save" value={data.updatedAt ? formatRelative(data.updatedAt) : '—'} small />
            </dl>
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium">Export</p>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" className="gap-2" onClick={() => exportJson(data)}>
                  <FileJson aria-hidden="true" />
                  JSON backup
                </Button>
                <Button
                  variant="outline"
                  className="gap-2"
                  disabled={data.patients.length === 0}
                  onClick={() => exportCsv(data)}
                >
                  <FileSpreadsheet aria-hidden="true" />
                  CSV files
                </Button>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium">Import backup</p>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" className="gap-2" onClick={() => triggerImport('merge')}>
                  <Upload aria-hidden="true" />
                  Merge
                </Button>
                <Button variant="outline" className="gap-2" onClick={() => triggerImport('replace')}>
                  <Download aria-hidden="true" />
                  Replace
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Merge keeps the newest version of each record. Use it to move data between devices.
              </p>
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                className="sr-only"
                tabIndex={-1}
                aria-hidden="true"
                onChange={onImport}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden">
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2">
                <Cloud className="size-4 text-primary" aria-hidden="true" />
                Cloud sync
              </CardTitle>
              <Badge variant="outline" className="gap-1">
                <Lock className="size-3" aria-hidden="true" />
                Pro
              </Badge>
            </div>
            <CardDescription>
              Keep every front desk, exam room, and laptop on the same records in real time.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-3 text-sm">
              {[
                { icon: MonitorSmartphone, text: 'Sync across unlimited devices and staff' },
                { icon: Cloud, text: 'Automatic encrypted cloud backups' },
                { icon: Check, text: 'Restore any day from version history' },
                { icon: Check, text: 'Offline edits merge when you reconnect' },
              ].map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-center gap-2">
                  <Icon className="size-4 shrink-0 text-primary" aria-hidden="true" />
                  {text}
                </li>
              ))}
            </ul>
          </CardContent>
          <CardFooter className="flex flex-col items-stretch gap-2">
            <Button onClick={() => setUpgradeOpen(true)} disabled={plan === 'pro'}>
              {plan === 'pro' ? 'Cloud sync enabled' : 'Upgrade to Pro'}
            </Button>
            <p className="text-center text-xs text-muted-foreground">Free plan includes local sync and export forever.</p>
          </CardFooter>
        </Card>
      </div>

      <UpgradeDialog open={upgradeOpen} onOpenChange={setUpgradeOpen} />
    </section>
  )
}

function Stat({ label, value, small }: { label: string; value: string | number; small?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={small ? 'truncate text-sm font-medium' : 'text-lg font-semibold tabular-nums'}>{value}</dd>
    </div>
  )
}
