import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * The shared table shell (2026-10-29 refactor, phase 4). Six surfaces repeated
 * the same wrapper/header/empty-state markup, with the column layout carried by
 * per-table CSS classes. This centralises the markup and leaves the row cells
 * (which differ per surface) to the caller.
 *
 * `className` carries the layout hooks — e.g. `patients-table` — because the
 * grid templates live in the stylesheets next to the rest of the table styles.
 */
export interface DataTableProps {
  className?: string
  /** Header cells, positionally matched to the row cells. `null` = blank. */
  columns: Array<ReactNode | null>
  /** True when there is nothing to list; renders `empty` instead of a message. */
  isEmpty?: boolean
  empty?: ReactNode
  /** Extra classes for the empty message (some surfaces tweak its span). */
  emptyClassName?: string
  children: ReactNode
}

export const DataTable = ({ className, columns, isEmpty = false, empty, emptyClassName, children }: DataTableProps) => (
  <div className={cn('records-table', className)}>
    <div className="table-head">
      {columns.map((label, index) => (
        // Columns are positional by construction: the grid template follows order.
        // oxlint-disable-next-line no-array-index-key
        <span key={index}>{label}</span>
      ))}
    </div>
    {children}
    {isEmpty && empty !== undefined && <p className={cn('empty-state', emptyClassName)}>{empty}</p>}
  </div>
)

/** The stat tile used by Dashboard, Billing and Reports. */
export const StatCard = ({
  label,
  value,
  note,
  icon,
  tone,
}: {
  label: ReactNode
  value: ReactNode
  note?: ReactNode
  icon: ReactNode
  tone: 'teal' | 'blue' | 'violet' | 'amber' | 'red'
}) => (
  <div className="stat-card">
    <span className={`stat-icon ${tone}`}>{icon}</span>
    <div>
      <small>{label}</small>
      <strong>{value}</strong>
      {note !== undefined && <span className="stat-note">{note}</span>}
    </div>
  </div>
)
