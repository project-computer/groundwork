import { Badge } from '@/components/ui/badge'
import type { AppointmentStatus } from '@/lib/types'

const CONFIG: Record<AppointmentStatus, { label: string; className: string }> = {
  scheduled: { label: 'Scheduled', className: 'border-border bg-transparent text-foreground' },
  'checked-in': { label: 'Waiting', className: 'border-transparent bg-accent text-accent-foreground' },
  'in-consult': { label: 'In consult', className: 'border-transparent bg-primary text-primary-foreground' },
  completed: { label: 'Completed', className: 'border-transparent bg-secondary text-secondary-foreground' },
  cancelled: { label: 'Cancelled', className: 'border-border bg-transparent text-muted-foreground line-through' },
  'no-show': { label: 'No-show', className: 'border-transparent bg-destructive/10 text-destructive' },
}

export function StatusBadge({ status }: { status: AppointmentStatus }) {
  const cfg = CONFIG[status] ?? CONFIG.scheduled
  return (
    <Badge variant="outline" className={cfg.className}>
      {cfg.label}
    </Badge>
  )
}
