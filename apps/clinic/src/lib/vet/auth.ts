import type { StaffUser } from './types'

/**
 * Staff PIN credentials.
 *
 * PINs are never stored in plain text: each staff member carries a random salt
 * and a PBKDF2-SHA-256 hash. Verification re-derives the hash and compares it
 * in constant time. This keeps the local-first store safe to export or back up
 * — the PIN itself cannot be recovered from the document.
 */

export const PIN_MAX_LENGTH = 8

/** A PIN is 4–8 digits. Letters are rejected so the keypad stays usable. */
export const isPinFormat = (pin: string): boolean => /^\d{4,8}$/.test(pin)

const ITERATIONS = 120_000
const SALT_BYTES = 16

const toHex = (bytes: ArrayBuffer): string =>
  [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('')

const fromHex = (hex: string): Uint8Array<ArrayBuffer> => {
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i += 1) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return out
}

export const newPinSalt = (): string => toHex(crypto.getRandomValues(new Uint8Array(SALT_BYTES)).buffer)

export const hashPin = async (pin: string, saltHex: string): Promise<string> => {
  const keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, [
    'deriveBits',
  ])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: fromHex(saltHex), iterations: ITERATIONS },
    keyMaterial,
    256,
  )
  return toHex(bits)
}

const constantTimeEqual = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/** True when the member has a PIN on file. */
export const hasPin = (user: StaffUser): boolean => !!user.pinHash && !!user.pinSalt

/**
 * Verifies a PIN against a member's stored hash. Members without a PIN always
 * fail — callers must treat "no PIN configured" as "no credential to check",
 * not as "any PIN is correct".
 */
export const verifyPin = async (user: StaffUser, pin: string): Promise<boolean> => {
  if (!user.pinHash || !user.pinSalt || !isPinFormat(pin)) return false
  const candidate = await hashPin(pin, user.pinSalt)
  return constantTimeEqual(candidate, user.pinHash)
}

/** Builds the credential fields to persist for a new PIN. */
export const createPinCredential = async (pin: string): Promise<{ pinHash: string; pinSalt: string }> => {
  const pinSalt = newPinSalt()
  return { pinHash: await hashPin(pin, pinSalt), pinSalt }
}
