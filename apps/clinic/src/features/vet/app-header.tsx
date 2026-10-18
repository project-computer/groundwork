'use client'

import { CloudOff, HardDrive, PawPrint } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useClinicData, usePlan } from '@/lib/store'
import { formatRelative } from './format'

export function AppHeader({ onOpenSync }: { onOpenSync: () => void }) {
  const { data } = useClinicData()
  const plan = usePlan()

  return (
    <header className="sticky top-0 z-20 border-b bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-3 px-4 md:px-6">
        <div className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <PawPrint className="size-4" aria-hidden="true" />
          </span>
          <span className="font-semibold tracking-tight">VetDesk</span>
          <Badge variant={plan === 'pro' ? 'default' : 'secondary'} className="ml-1">
            {plan === 'pro' ? 'Pro' : 'Free'}
          </Badge>
        </div>
        <Button variant="ghost" size="sm" onClick={onOpenSync} className="gap-2 text-muted-foreground">
          <HardDrive className="text-primary" aria-hidden="true" />
          <span className="hidden sm:inline">
            Saved locally{data.updatedAt ? ` · ${formatRelative(data.updatedAt)}` : ''}
          </span>
          <span className="sm:hidden">Local</span>
          <CloudOff className="hidden sm:block" aria-label="Cloud sync off" />
        </Button>
      </div>
    </header>
  )
}
