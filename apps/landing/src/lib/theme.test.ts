// @vitest-environment jsdom
import { afterEach, describe, expect, test } from 'vitest'
import { applyTheme, getTheme, setTheme, THEME_CHOICES, watchSystemTheme } from './theme'

afterEach(() => {
  window.localStorage.clear()
  document.documentElement.classList.remove('dark', 'light')
})

describe('getTheme', () => {
  test('defaults to system when nothing is stored', () => {
    expect(getTheme()).toBe('system')
  })

  test('round-trips a stored choice', () => {
    setTheme('dark')
    expect(getTheme()).toBe('dark')
  })

  test('ignores values outside the choice union', () => {
    window.localStorage.setItem('clinicbook:theme', 'sepia')
    expect(getTheme()).toBe('system')
  })
})

describe('applyTheme', () => {
  test('reflects dark on <html>', () => {
    applyTheme('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(document.documentElement.classList.contains('light')).toBe(false)
  })

  test('reflects light on <html>', () => {
    applyTheme('light')
    expect(document.documentElement.classList.contains('light')).toBe(true)
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })
})

describe('theme surface', () => {
  test('offers exactly light, dark and system', () => {
    expect(THEME_CHOICES).toEqual(['light', 'dark', 'system'])
  })

  test('watchSystemTheme returns an unsubscribe', () => {
    const stop = watchSystemTheme()
    expect(typeof stop).toBe('function')
    stop()
  })
})
