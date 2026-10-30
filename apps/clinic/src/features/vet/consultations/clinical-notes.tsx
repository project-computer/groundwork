import { useState } from 'react'
import { Trans, useLingui } from '@lingui/react/macro'
import { Field, Panel, Pill } from '@/components/vet/fields'
import { useClinic } from '@/lib/vet/store'
import { formatDate } from '@/lib/vet/format'
import type { Encounter } from '@/lib/vet/types'

/**
 * Clinical notes panel for the live consultation (2026-10-30 plan, phase C):
 * the note draft, the amendment flow and the preserved revision history,
 * extracted verbatim from the Consultations body. Owns the note and
 * amendment state; the close-consultation dispatch lives in its footer.
 */
export const ClinicalNotes = ({ encounter }: { encounter: Encounter }) => {
  const { t } = useLingui()
  const { data, dispatch } = useClinic()
  const [note, setNote] = useState('')
  const [amendNoteId, setAmendNoteId] = useState<string | null>(null)
  const [amendBody, setAmendBody] = useState('')
  const [amendReason, setAmendReason] = useState('')

  const startAmend = (noteId: string, body: string) => {
    setAmendNoteId(noteId)
    setAmendBody(body)
    setAmendReason('')
  }
  const cancelAmend = () => {
    setAmendNoteId(null)
    setAmendBody('')
    setAmendReason('')
  }
  const saveAmend = () => {
    if (!amendNoteId || !amendBody.trim() || !amendReason.trim()) return
    dispatch({ type: 'amendNote', encounterId: encounter.id, noteId: amendNoteId, body: amendBody, reason: amendReason })
    cancelAmend()
  }

  return (
    <Panel title={t`Clinical notes`} description={t`Authored notes are preserved as a revision history`}>
      <textarea
        className="note-box"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        aria-label={t`Clinical notes`}
        placeholder={t`Record the consultation findings, assessment and plan…`}
      />
      <div className="panel-footer">
        <span className="save-hint">
          <span className="pulse" /> <Trans>Draft is saved locally</Trans>
        </span>
        <button
          className="button secondary"
          onClick={() => {
            if (note.trim()) {
              dispatch({
                type: 'addNote',
                encounterId: encounter.id,
                body: note,
              })
              setNote('')
            }
          }}
        >
          <Trans>Add note</Trans>
        </button>
        <button
          className="button primary"
          onClick={() => dispatch({ type: 'closeEncounter', encounterId: encounter.id })}
        >
          <Trans>Close consultation</Trans>
        </button>
      </div>
      {encounter.notes.length > 0 && (
        <div className="note-history">
          {encounter.notes.map((n) => {
            const author = data.users.find((u) => u.id === n.authorId)
            const amends = n.amends ? encounter.notes.find((x) => x.id === n.amends) : undefined
            const amendmentReason = n.amendReason || t`not recorded`
            return (
              <div key={n.id} className={n.amends ? 'note-entry amended' : 'note-entry'}>
                <span>
                  {formatDate(n.createdAt)}
                  {author ? ` · ${author.name}` : ''}
                  {n.amends && (
                    <>
                      {' · '}
                      <Pill tone="warn" dot>
                        <Trans>Amendment</Trans>
                      </Pill>
                    </>
                  )}
                </span>
                <p>{n.body}</p>
                {n.amends && (
                  <span className="note-amend-meta">
                    <Trans>Reason: {amendmentReason}</Trans>
                    {amends ? <> · <Trans>supersedes an earlier note</Trans></> : <> · <Trans>original note no longer on file</Trans></>}
                  </span>
                )}
                {amendNoteId === n.id ? (
                  <div className="note-amend-form">
                    <Field label={t`Reason for amendment`} htmlFor="note-amend-reason">
                      <input
                        id="note-amend-reason"
                        value={amendReason}
                        onChange={(e) => setAmendReason(e.target.value)}
                        placeholder={t`e.g. Corrected the recorded dose…`}
                      />
                    </Field>
                    <textarea
                      className="note-box"
                      aria-label={t`Amended note`}
                      value={amendBody}
                      onChange={(e) => setAmendBody(e.target.value)}
                    />
                    <div className="panel-footer">
                      <button className="small-button" onClick={cancelAmend}>
                        <Trans>Cancel</Trans>
                      </button>
                      <button className="button primary" onClick={saveAmend} disabled={!amendBody.trim() || !amendReason.trim()}>
                        <Trans>Save amendment</Trans>
                      </button>
                    </div>
                  </div>
                ) : (
                  <button className="text-button" onClick={() => startAmend(n.id, n.body)}>
                    <Trans>Amend</Trans>
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </Panel>
  )
}
