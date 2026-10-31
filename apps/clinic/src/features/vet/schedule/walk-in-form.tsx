import { useState } from 'react'
import { Trans, useLingui } from '@lingui/react/macro'
import { X } from 'lucide-react'
import { NativeSelect } from '@/components/patterns/fields'

/** Inline walk-in form under the waiting queue (moved verbatim from index). */
export const WalkInForm = ({
  patients,
  onSubmit,
  onCancel,
  disabled,
}: {
  patients: { id: string; name: string }[]
  onSubmit: (patientId: string, reason: string) => void
  onCancel: () => void
  disabled: boolean
}) => {
  const { t } = useLingui()
  const [patientId, setPatientId] = useState(patients[0]?.id ?? '')
  const [reason, setReason] = useState('')
  return (
    <div className="walkin-form">
      <NativeSelect value={patientId} onChange={(e) => setPatientId(e.target.value)} aria-label={t`Walk-in patient`}>
        {patients.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </NativeSelect>
      <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t`e.g. Nail trim…`} aria-label={t`Walk-in reason`} />
      <button className="button primary" disabled={disabled || !patientId} onClick={() => { onSubmit(patientId, reason); onCancel() }}>
        <Trans>Add</Trans>
      </button>
      <button className="icon-button" onClick={onCancel} aria-label={t`Cancel walk-in`}>
        <X size={15} />
      </button>
    </div>
  )
}
