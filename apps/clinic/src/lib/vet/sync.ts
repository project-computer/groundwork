import { useCallback, useEffect, useRef, type RefObject } from 'react'
import { isClinicState } from './persistence'
import { runSync } from './backend'
import type { Action } from './store'
import type { ClinicState } from './types'

/**
 * Sync orchestration (2026-10-29 refactor, phase 5). The seam between the
 * store and the transport: debounced push, periodic pull, connectivity
 * resets and the in-flight mutation lock live HERE — the ClinicProvider
 * only consumes this hook, and transports are reached through backend.ts,
 * never from the store directly.
 */

export interface SyncWorkerOptions {
  plan: 'local' | 'cloud'
  internetOnline: boolean
  lanOnline: boolean
  /** True while a sync pass runs — reset when connectivity drops mid-push. */
  syncing: boolean
  /** Outbox length — drives the debounced push. */
  pending: number
  /** Latest document without making it a dependency of the sync effects. */
  dataRef: RefObject<ClinicState>
  dispatch: (action: Action) => void
}

export const useSyncWorker = ({ plan, internetOnline, lanOnline, syncing, pending, dataRef, dispatch }: SyncWorkerOptions) => {
  // Business mutations are refused while a sync pass is in flight; otherwise
  // a syncResult could overwrite an edit made after the sync snapshot.
  const inFlight = useRef(false)

  const guardedDispatch = useCallback(
    (action: Action) => {
      if (inFlight.current && action.type !== 'session' && action.type !== 'syncResult' && action.type !== 'syncComplete' && action.type !== 'restore') {
        return
      }
      dispatch(action)
    },
    [dispatch],
  )

  const syncNow = useCallback(async () => {
    if (inFlight.current) return
    inFlight.current = true
    dispatch({ type: 'session', patch: { syncing: true } })
    try {
      const result = await runSync(dataRef.current!)
      if (result && isClinicState(result.state)) {
        if (result.pushed > 0 || result.pulled > 0 || result.ackedChangeIds.length > 0) {
          dispatch({ type: 'syncResult', data: result.state })
        } else {
          dispatch({ type: 'session', patch: { syncing: false, lastSyncError: undefined } })
        }
        return
      }
      // No cloud configured (browser demo): acknowledge a bounded batch so the
      // pending indicator behaves as before.
      const batch = dataRef.current!.outbox.slice(0, 25).map((c) => c.changeId)
      if (batch.length > 0) dispatch({ type: 'syncComplete', changeIds: batch })
      else dispatch({ type: 'session', patch: { syncing: false } })
    } catch (error) {
      dispatch({
        type: 'session',
        patch: { syncing: false, lastSyncError: error instanceof Error ? error.message : String(error) },
      })
    } finally {
      inFlight.current = false
    }
  }, [dataRef, dispatch])

  // Debounced push whenever the outbox gains changes.
  useEffect(() => {
    if (plan !== 'cloud' || !internetOnline || !lanOnline) return
    if (pending === 0) return
    const timer = setTimeout(() => {
      void syncNow()
    }, 300)
    return () => clearTimeout(timer)
  }, [plan, internetOnline, lanOnline, pending, syncNow])

  // Periodic pull so remote edits arrive even when there is nothing to push.
  useEffect(() => {
    if (plan !== 'cloud' || !internetOnline || !lanOnline) return
    const timer = setInterval(() => {
      void syncNow()
    }, 60_000)
    return () => clearInterval(timer)
  }, [plan, internetOnline, lanOnline, syncNow])

  // If connectivity drops mid-push, the batch was never acknowledged and stays queued.
  useEffect(() => {
    if (syncing && (!internetOnline || plan !== 'cloud' || !lanOnline)) {
      dispatch({ type: 'session', patch: { syncing: false } })
    }
  }, [syncing, internetOnline, plan, lanOnline, dispatch])

  return { guardedDispatch, syncNow }
}
