import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function Field({ label, htmlFor, children, className }: { label: string; htmlFor: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={htmlFor} className="text-xs font-medium text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  )
}

export function NativeSelect({ className, ...props }: ComponentProps<'select'>) {
  return (
    <select
      className={cn(
        'h-8 w-full min-w-0 rounded-lg border border-input bg-card px-2.5 text-sm text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}

export function Panel({ title, description, action, children, className }: { title: string; description?: string; action?: ReactNode; children: ReactNode; className?: string }) {
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
  ok: 'bg-primary/20 text-primary border-transparent',
  info: 'bg-accent text-accent-foreground border-transparent',
  warn: 'bg-warning/30 text-warning-foreground border-transparent dark:bg-warning/20 dark:text-warning',
  bad: 'bg-destructive/20 text-destructive border-transparent',
  muted: 'bg-muted text-foreground/80 border-transparent',
}

export function Pill({ tone, children, dot }: { tone: Tone; children: ReactNode; dot?: boolean }) {
  return (
    <span className={cn('inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-xs font-semibold whitespace-nowrap', toneClass[tone])}>
      {dot && <span aria-hidden className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  )
}

export function ReadOnlyNote({ reason }: { reason: string }) {
  return <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">{reason}</p>
}

export function PageHeader({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
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
