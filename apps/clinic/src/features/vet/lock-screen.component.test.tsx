import { beforeEach, expect, it } from 'vitest'
import { render } from 'vitest-browser-react'
import { App } from '@/app/App'
import { hashPin, newPinSalt } from '@/lib/vet/auth'
import { seedState } from '@/lib/vet/seed'

const STORAGE_KEY = 'clinicbook:state:v1'

// The document is restored asynchronously after mount, so assertions that span
// that transition poll the DOM instead of a locator created before it exists.
const bodyText = () => document.body.innerText

beforeEach(() => {
  window.localStorage.clear()
})

/** Persists a document where the default member (Dr. Pim) already has a PIN. */
const persistStateWithPin = async (pin: string) => {
  const pinSalt = newPinSalt()
  const pinHash = await hashPin(pin, pinSalt)
  const users = seedState.users.map((user) => (user.id === 'u-pim' ? { ...user, pinSalt, pinHash } : user))
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...seedState, users }))
}

it('locks on load and unlocks with the correct PIN', async () => {
  await persistStateWithPin('2468')
  const screen = await render(<App />)

  await expect.poll(bodyText).toContain('Clinic locked')

  await screen.getByLabelText(/PIN for Dr\. Pim/).fill('2468')
  await screen.getByRole('button', { name: 'Unlock' }).click()

  await expect.poll(bodyText).not.toContain('Clinic locked')
  await expect.element(screen.getByRole('button', { name: /Medical Records/ })).toBeVisible()
})

it('stays locked and reports a wrong PIN', async () => {
  await persistStateWithPin('2468')
  const screen = await render(<App />)

  await expect.poll(bodyText).toContain('Clinic locked')
  await screen.getByLabelText(/PIN for Dr\. Pim/).fill('1111')
  await screen.getByRole('button', { name: 'Unlock' }).click()

  await expect.poll(() => document.querySelector('[role="alert"]')?.textContent ?? '').toContain('Incorrect PIN')
  expect(bodyText()).toContain('Clinic locked')
})

it('lets a member set their own PIN, lock, and unlock again', async () => {
  const screen = await render(<App />)

  await screen.getByRole('button', { name: /Staff & Permissions/ }).click()
  await screen.getByRole('button', { name: /Set PIN for Dr\. Pim/ }).click()

  await screen.getByLabelText('New PIN (4–8 digits)').fill('1357')
  await screen.getByLabelText('Confirm PIN').fill('1357')
  await screen.getByRole('button', { name: 'Set PIN' }).click()

  await expect.element(screen.getByText(/PIN set/)).toBeVisible()

  await screen.getByRole('button', { name: 'Lock screen' }).click()
  await expect.poll(bodyText).toContain('Clinic locked')

  await screen.getByLabelText(/PIN for Dr\. Pim/).fill('1357')
  await screen.getByRole('button', { name: 'Unlock' }).click()

  await expect.poll(bodyText).not.toContain('Clinic locked')
})

it('opens unlocked when no member has a PIN yet', async () => {
  const screen = await render(<App />)
  await expect.element(screen.getByRole('button', { name: /Dashboard/ })).toBeVisible()
  expect(bodyText()).not.toContain('Clinic locked')
})
