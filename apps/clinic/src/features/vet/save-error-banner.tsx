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
    <div className="save-error-banner" role="alert">
      <span className="save-error-icon">
        <AlertTriangle size={16} />
      </span>
      <div>
        <strong><Trans>Changes are not being saved to this computer</Trans></strong>
        <span>
          {session.saveError} — <Trans>check free disk space or the clinic server before continuing.</Trans>
        </span>
      </div>
      <button
        className="icon-button"
        onClick={() => dispatch({ type: 'session', patch: { saveError: undefined } })}
        aria-label={t`Dismiss saving warning`}
      >
        <X size={15} />
      </button>
    </div>
  )
}
