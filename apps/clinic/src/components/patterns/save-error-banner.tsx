import { AlertTriangle, X } from 'lucide-react'
import { Trans, useLingui } from '@lingui/react/macro'
import { useClinic } from '@/lib/vet/store'

/**
 * Shown while the app cannot persist the clinic document. Every change the
 * clinic makes is at risk until a save succeeds again, so the warning stays
 * on top of the workspace and is only dismissed once the operator has seen it.
 */
export const SaveErrorBanner = () => {
  const { session, dispatch } = useClinic()
  const { t } = useLingui()
  if (!session.saveError) return null
  return (
    <div
      className="flex items-start gap-2.5 mt-3 mx-6 px-3.5 py-2.5 border border-red-600 rounded-xl bg-red-50 text-red-700"
      role="alert"
    >
      <span className="inline-flex mt-0.5 text-red-600">
        <AlertTriangle size={16} />
      </span>
      <div>
        <strong className="block text-[13px] font-bold"><Trans>Changes are not being saved to this computer</Trans></strong>
        <span className="text-xs text-foreground/80">
          {session.saveError} — <Trans>check free disk space or the clinic server before continuing.</Trans>
        </span>
      </div>
      <button
        className="icon-button ml-auto"
        onClick={() => dispatch({ type: 'session', patch: { saveError: undefined } })}
        aria-label={t`Dismiss saving warning`}
      >
        <X size={15} />
      </button>
    </div>
  )
}
