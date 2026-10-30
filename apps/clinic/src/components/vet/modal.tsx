import { useEffect, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { useLingui } from '@lingui/react/macro'
import { cn } from '@/lib/utils'

/**
 * The one dialog shell (2026-10-29 refactor, phase 4). Ten hand-rolled dialogs
 * each repeated the backdrop, the Escape listener, the heading and the close
 * button; this owns that behaviour so dialogs only describe their content.
 *
 * Keeps the existing `.modal-backdrop` / `.modal` / `.form-heading` hooks —
 * the stylesheet and tests still target them.
 */
export interface ModalProps {
  /** Accessible name. Falls back to `title` when that is a string. */
  label?: string
  /** Heading. Omit for surfaces that provide their own (e.g. a receipt). */
  title?: ReactNode
  subtitle?: ReactNode
  onClose: () => void
  /** Wider layout for editing surfaces (clinic profile, clinical record). */
  wide?: boolean
  /** Extra classes on the modal box (e.g. a surface-specific width). */
  className?: string
  /** Override when "Close dialog" is not specific enough for the surface. */
  closeLabel?: string
  /** Set false when a nested dialog owns Escape (it closes this one first). */
  closeOnEscape?: boolean
  children: ReactNode
}

export const Modal = ({ label, title, subtitle, onClose, wide, className, closeLabel, closeOnEscape = true, children }: ModalProps) => {
  const { t } = useLingui()

  useEffect(() => {
    if (!closeOnEscape) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [closeOnEscape, onClose])

  const accessibleName = label ?? (typeof title === 'string' ? title : undefined)

  return (
    <div
      className="modal-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className={cn('modal', wide && 'modal-wide', className)} role="dialog" aria-modal="true" aria-label={accessibleName}>
        {title !== undefined && (
          <div className="form-heading">
            <div>
              <strong>{title}</strong>
              {subtitle !== undefined && <span>{subtitle}</span>}
            </div>
            <button className="icon-button" onClick={onClose} aria-label={closeLabel ?? t`Close dialog`}>
              <X size={17} />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  )
}
