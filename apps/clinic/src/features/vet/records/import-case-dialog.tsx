import { useState } from 'react'
import { plural } from '@lingui/core/macro'
import { X } from 'lucide-react'
import { Trans, useLingui } from '@lingui/react/macro'
import { Field } from '@/components/vet/fields'
import { useClinic } from '@/lib/vet/store'
import { isCaseBundle, type CaseBundle } from '@/lib/vet/types'

/** Modal import flow for a received CaseBundle (JSON paste or file). */
type ImportOutcome =
  | { state: 'error'; message: string }
  | { state: 'done'; message: string }

export const ImportCaseDialog = ({ onClose }: { onClose: () => void }) => {
  const { session, dispatch } = useClinic()
  const { t } = useLingui()
  const [paste, setPaste] = useState('')
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null)

  // Refusals live in the reducer (duplicate tokens, bad formats) and arrive
  // via session.lastRejection (ADR-0015). Derived during render: a rejection
  // always outranks the local outcome, and a successful import clears it.
  const shown: ImportOutcome | null = session.lastRejection
    ? { state: 'error', message: session.lastRejection.message }
    : outcome

  const receive = (raw: string) => {
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      setOutcome({ state: 'error', message: t`That is not valid JSON — paste the case bundle file contents or choose a .json file.` })
      return
    }
    if (!isCaseBundle(parsed)) {
      setOutcome({ state: 'error', message: t`This file is not a VetCare case bundle.` })
      return
    }
    const bundle = parsed as CaseBundle
    dispatch({ type: 'importCaseBundle', bundle })
    setOutcome({
      state: 'done',
      message: t`Received ${bundle.patient.name} from ${bundle.fromClinic.name}: ${plural(bundle.encounters.length, { one: '# visit', other: '# visits' })} and ${plural(bundle.vaccinations.length, { one: '# vaccination', other: '# vaccinations' })} copied into this clinic with a new MRN.`,
    })
  }

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-label={t`Import a case bundle`}>
        <div className="form-heading">
          <div>
            <strong><Trans>Import case bundle</Trans></strong>
            <span><Trans>Receives a shared case from another clinic. Copies are stamped with the source clinic — nothing is shared in place.</Trans></span>
          </div>
          <button className="icon-button" onClick={onClose} aria-label={t`Close dialog`}>
            <X size={17} />
          </button>
        </div>
        <Field label={t`Bundle file (.json)`} htmlFor="import-file">
          <input
            id="import-file"
            type="file"
            accept="application/json,.json"
            onChange={async (e) => {
              const file = e.target.files?.[0]
              if (file) receive(await file.text())
            }}
          />
        </Field>
        <Field label={t`…or paste bundle JSON`} htmlFor="import-paste">
          <textarea
            id="import-paste"
            rows={6}
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            placeholder='{"format":"vetcare-case-bundle","version":1,…}'
            spellCheck={false}
          />
        </Field>
        {shown && (
          <p className={shown.state === 'error' ? 'text-[13px] text-red-700' : 'text-[13px] text-green-700'} role="status">
            {shown.message}
          </p>
        )}
        <div className="form-actions">
          <button className="button secondary" onClick={() => receive(paste)} disabled={!paste.trim()}>
            <Trans>Import pasted bundle</Trans>
          </button>
          <button className="button primary" onClick={onClose}>
            <Trans>Done</Trans>
          </button>
        </div>
      </div>
    </div>
  )
}

/* ---------- Vaccinations ---------- */

