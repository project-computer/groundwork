import { useEffect, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { useLingui } from '@lingui/react/macro'
import { cn } from '@/lib/utils'

/**
 * The one dialog shell (2026-10-29 refactor, phase 4). Ten hand-rolled dialogs
 * each repeated the backdrop, the Escape listener, the heading and the close
 * button; this owns that behaviour so dialogs only describe their content.
 *
 * Focus management (2026-10-30 plan, phase A): the box takes focus on open,
 * Tab/Shift+Tab wrap inside the dialog, and focus returns to the opener on
 * close. While dialogs are nested (PIN inside workspace) only the top one
 * traps, so the inner dialog owns both Tab and Escape.
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

/** Focusables in DOM order — the ends of the dialog's Tab range. */
const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

/** Open dialogs in mount order — the last one owns the Tab order. */
const dialogStack: HTMLDivElement[] = []

export const Modal = ({ label, title, subtitle, onClose, wide, className, closeLabel, closeOnEscape = true, children }: ModalProps) => {
  const { t } = useLingui()
  const boxRef = useRef<HTMLDivElement>(null)

  // Focus enters the dialog with it and returns to the opener when it leaves.
  useEffect(() => {
    const box = boxRef.current
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    if (!box) return
    dialogStack.push(box)
    box.focus()
    return () => {
      dialogStack.splice(dialogStack.indexOf(box), 1)
      if (opener && document.contains(opener)) opener.focus()
    }
  }, [])

  // Tab wraps inside the dialog; the top of the stack owns the key while
  // dialogs are nested, so an inner dialog never leaks focus to the outer one.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return
      const box = boxRef.current
      if (!box || dialogStack[dialogStack.length - 1] !== box) return
      const focusable = [...box.querySelectorAll<HTMLElement>(FOCUSABLE)]
      if (focusable.length === 0) {
        event.preventDefault()
        box.focus()
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement
      const inside = active instanceof Node && box.contains(active)
      const wraps = event.shiftKey
        ? !inside || active === box || active === first
        : !inside || active === box || active === last
      if (wraps) {
        event.preventDefault()
        ;(event.shiftKey ? last : first).focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

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
      <div
        ref={boxRef}
        className={cn('modal', wide && 'modal-wide', className)}
        role="dialog"
        aria-modal="true"
        aria-label={accessibleName}
        tabIndex={-1}
      >
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
