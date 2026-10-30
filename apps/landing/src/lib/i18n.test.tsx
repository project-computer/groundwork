// @vitest-environment jsdom
import { afterEach, describe, expect, test } from 'vitest'
import { i18n } from '@lingui/core'
import { initI18n, LOCALES, localeLabel } from './i18n'

afterEach(() => {
  window.localStorage.clear()
})

describe('i18n surface', () => {
  test('supports English and Thai', () => {
    expect(LOCALES).toEqual(['en', 'th'])
    expect(localeLabel.en).toBe('English')
    expect(localeLabel.th).toBe('ไทย')
  })

  test('initI18n activates the stored locale', async () => {
    // Pin English so the test never pulls the Thai catalog dynamically.
    window.localStorage.setItem('vet.locale', 'en')
    await initI18n()
    expect(i18n.locale).toBe('en')
  })
})
