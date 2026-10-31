import { i18n } from '@lingui/core'
import { beforeEach, expect, it } from 'vitest'
import { initI18n } from '../i18n'

/**
 * Regression test (Cloudflare deploy bug, 2026-10-31): production strips the
 * macro `message` fallbacks, so English lookups go by the compiled hash id —
 * e.g. `9k9saT` is the workspace title. initI18n must therefore load the
 * *compiled* en catalog (locales/en/messages.mjs), not seed an empty one;
 * otherwise every English string renders as its raw id (`9k9saT`).
 */
describe('initI18n with the English source locale', () => {
  beforeEach(() => {
    window.localStorage.setItem('vet.locale', 'en')
  })

  it('resolves compiled message ids to English strings', async () => {
    await initI18n()
    expect(i18n.locale).toBe('en')
    // The id observed rendering raw on the Cloudflare deploy.
    expect(i18n._('9k9saT')).toBe('Clinic workspace')
  })

  it('switching th -> en restores English strings', async () => {
    window.localStorage.setItem('vet.locale', 'th')
    await initI18n()
    window.localStorage.setItem('vet.locale', 'en')
    await initI18n()
    expect(i18n._('9k9saT')).toBe('Clinic workspace')
  })
})
