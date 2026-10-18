'use client'

import { Check, Minus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

const FEATURES: { label: string; free: boolean; pro: boolean }[] = [
  { label: 'Patients & appointments', free: true, pro: true },
  { label: 'Local sync across tabs', free: true, pro: true },
  { label: 'JSON & CSV export / import', free: true, pro: true },
  { label: 'Multi-device cloud sync', free: false, pro: true },
  { label: 'Automatic cloud backups', free: false, pro: true },
  { label: 'Staff accounts', free: false, pro: true },
]

export function UpgradeDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Upgrade to VetDesk Pro</DialogTitle>
          <DialogDescription>Cloud sync for your whole clinic. Your local data comes with you.</DialogDescription>
        </DialogHeader>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-muted-foreground">
              <th scope="col" className="pb-2 text-left font-medium">
                Feature
              </th>
              <th scope="col" className="w-16 pb-2 font-medium">
                Free
              </th>
              <th scope="col" className="w-16 pb-2 font-medium text-primary">
                Pro
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {FEATURES.map((f) => (
              <tr key={f.label}>
                <th scope="row" className="py-2 text-left font-normal">
                  {f.label}
                </th>
                <td className="py-2">
                  <Mark on={f.free} />
                </td>
                <td className="py-2">
                  <Mark on={f.pro} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex items-baseline gap-1 rounded-lg bg-accent p-3 text-accent-foreground">
          <span className="text-2xl font-semibold">$29</span>
          <span className="text-sm">per clinic / month</span>
        </div>
        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button disabled className="w-full">
            Checkout coming soon
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            Online payments haven&apos;t been connected yet. Keep using local sync and export in the meantime.
          </p>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Mark({ on }: { on: boolean }) {
  return on ? (
    <Check className="mx-auto size-4 text-primary" aria-label="Included" />
  ) : (
    <Minus className="mx-auto size-4 text-muted-foreground" aria-label="Not included" />
  )
}
