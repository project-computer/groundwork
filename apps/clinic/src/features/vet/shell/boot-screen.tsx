import { PawPrint } from 'lucide-react'
import { Trans } from '@lingui/react/macro'

/**
 * First-paint gate: shown until the persisted clinic document replaces the
 * in-memory seed. Without it every cold start briefly renders the demo clinic
 * — and on Android, where there is no sidecar to probe, that window used to
 * last several seconds.
 */
export const BootScreen = () => {
  return (
    <div className="boot-screen" role="status" aria-live="polite">
      <div className="brand-mark">
        <PawPrint size={20} />
      </div>
      <span><Trans>Opening clinic…</Trans></span>
    </div>
  )
}
