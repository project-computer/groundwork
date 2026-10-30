import { ShieldAlert, X } from 'lucide-react'
import { useClinic } from '@/lib/vet/store'

/**
 * Explains the last dispatch the reducer refused (ADR-0015): stock floors,
 * payment rules, RBAC. The reducer clears it on the next successful commit,
 * so the banner disappears as soon as the clinic does something that works.
 */
export const RejectionBanner = () => {
  const { session, dispatch } = useClinic()
  if (!session.lastRejection) return null
  return (
    <div
      className="flex items-start gap-2.5 mt-3 mx-6 px-3.5 py-2.5 border border-amber-500 rounded-xl bg-amber-50 text-amber-800"
      role="alert"
    >
      <span className="inline-flex mt-0.5 text-amber-600">
        <ShieldAlert size={16} />
      </span>
      <span className="text-[13px]">{session.lastRejection.message}</span>
      <button
        className="icon-button ml-auto"
        onClick={() => dispatch({ type: 'session', patch: { lastRejection: undefined } })}
        aria-label="Dismiss"
      >
        <X size={15} />
      </button>
    </div>
  )
}
