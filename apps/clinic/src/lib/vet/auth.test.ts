import { beforeAll, describe, expect, it } from 'vitest'
import { webcrypto } from 'node:crypto'
import { createPinCredential, hasPin, hashPin, isPinFormat, newPinSalt, verifyPin } from './auth'
import type { StaffUser } from './types'

// jsdom does not implement WebCrypto; the app runs in a webview/browser where
// `crypto.subtle` is always present, so borrow Node's implementation here.
beforeAll(() => {
  if (!globalThis.crypto?.subtle) {
    Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true })
  }
})

const member = (credential?: { pinHash: string; pinSalt: string }): StaffUser => ({
  id: 'u-1',
  name: 'Dr. Pim',
  role: 'veterinarian',
  active: true,
  ...credential,
})

describe('PIN format', () => {
  it('accepts 4–8 digits only', () => {
    expect(isPinFormat('1234')).toBe(true)
    expect(isPinFormat('12345678')).toBe(true)
    expect(isPinFormat('123')).toBe(false)
    expect(isPinFormat('123456789')).toBe(false)
    expect(isPinFormat('12a4')).toBe(false)
    expect(isPinFormat('')).toBe(false)
  })
})

describe('PIN credentials', () => {
  it('verifies the PIN it was created from', async () => {
    const credential = await createPinCredential('2468')
    expect(await verifyPin(member(credential), '2468')).toBe(true)
  })

  it('rejects a wrong PIN', async () => {
    const credential = await createPinCredential('2468')
    expect(await verifyPin(member(credential), '1357')).toBe(false)
  })

  it('never stores the PIN in plain text', async () => {
    const credential = await createPinCredential('2468')
    expect(JSON.stringify(credential)).not.toContain('2468')
  })

  it('salts every credential, so equal PINs hash differently', async () => {
    const a = await createPinCredential('2468')
    const b = await createPinCredential('2468')
    expect(a.pinSalt).not.toBe(b.pinSalt)
    expect(a.pinHash).not.toBe(b.pinHash)
  })

  it('derives the same hash for the same salt', async () => {
    const salt = newPinSalt()
    expect(await hashPin('2468', salt)).toBe(await hashPin('2468', salt))
  })

  it('treats members without a credential as having no PIN', async () => {
    expect(hasPin(member())).toBe(false)
    expect(await verifyPin(member(), '2468')).toBe(false)
  })

  it('rejects malformed PINs without deriving a hash', async () => {
    const credential = await createPinCredential('2468')
    expect(await verifyPin(member(credential), '12')).toBe(false)
    expect(await verifyPin(member(credential), 'abcd')).toBe(false)
  })
})
