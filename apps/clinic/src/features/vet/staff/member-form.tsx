import { useState } from 'react'
import { useClinic } from '@/lib/vet/store'
import { hasPin } from '@/lib/vet/auth'
import type { Role, StaffUser } from '@/lib/vet/types'

/**
 * Shared staff/ member logic (2026-10-30 plan, phase B): the add-member form
 * state and the PIN-aware account switch — one implementation behind the
 * Staff & Permissions view and the workspace team panel. The reducer trims
 * and normalises (`email: ''` ≙ absent), so both surfaces dispatch
 * identically; markup stays per surface.
 */

/** Name/role/email fields plus the `addStaff` dispatch and reset. */
export const useMemberForm = () => {
  const { dispatch } = useClinic()
  const [name, setName] = useState('')
  const [role, setRole] = useState<Role>('reception')
  const [email, setEmail] = useState('')

  const canSubmit = name.trim().length > 0

  const submit = () => {
    if (!canSubmit) return
    dispatch({ type: 'addStaff', name: name.trim(), role, email: email.trim() })
    setName('')
    setEmail('')
    setRole('reception')
  }

  return { name, setName, role, setRole, email, setEmail, canSubmit, submit }
}

/**
 * Switching accounts is instant until a member sets a PIN; after that the
 * app locks on that member so the PIN is verified on the lock screen.
 */
export const useSwitchAccount = (onSwitched?: () => void) => {
  const { dispatch } = useClinic()
  return (member: StaffUser) => {
    if (!hasPin(member)) {
      dispatch({ type: 'signIn', userId: member.id })
      onSwitched?.()
      return
    }
    dispatch({ type: 'session', patch: { locked: true, currentUserId: member.id } })
  }
}
