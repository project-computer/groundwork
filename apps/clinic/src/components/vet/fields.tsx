import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@/lib/utils'

export const Field = ({ label, htmlFor, children, className }: { label: string; htmlFor: string; children: ReactNode; className?: string }) => {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={htmlFor} className="text-xs font-medium text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  )
}

export const NativeSelect = ({ className, ...props }: ComponentProps<'select'>) => {
  return (
    <select
      className={cn(
        'w-full min-w-0 text-sm text-foreground outline-none transition-colors disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}

export const Panel = ({ title, description, action, children, className }: { title: string; description?: string; action?: ReactNode; children: ReactNode; className?: string }) => {
  return (
    <section className={cn('flex flex-col rounded-xl border bg-card', className)}>
      <header className="flex flex-wrap items-start justify-between gap-2 border-b px-4 py-3">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-sm font-semibold">{title}</h2>
          {description && <p className="text-xs leading-relaxed text-muted-foreground text-pretty">{description}</p>}
        </div>
        {action}
      </header>
      <div className="flex flex-col p-4">{children}</div>
    </section>
  )
}

export type Tone = 'ok' | 'warn' | 'bad' | 'muted' | 'info'

const toneClass: Record<Tone, string> = {
  ok: 'border-primary/30 bg-primary/10 text-primary',
  info: 'border-foreground/10 bg-accent text-accent-foreground',
  warn: 'border-warning/40 bg-warning/20 text-warning-foreground',
  bad: 'border-destructive/30 bg-destructive/10 text-destructive dark:bg-destructive/15',
  muted: 'border-border bg-muted text-foreground',
}

export const Pill = ({ tone, children, dot }: { tone: Tone; children: ReactNode; dot?: boolean }) => {
  return (
    <span className={cn('pill', 'inline-flex h-5 shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap', toneClass[tone])}>
      {dot && <span aria-hidden className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  )
}

export const ReadOnlyNote = ({ reason }: { reason: string }) => {
  return <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">{reason}</p>
}

export const PageHeader = ({ title, description, action }: { title: string; description: string; action?: ReactNode }) => {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight text-balance">{title}</h1>
        <p className="text-sm leading-relaxed text-muted-foreground text-pretty">{description}</p>
      </div>
      {action}
    </div>
  )
}
