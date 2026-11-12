import { afterEach, describe, expect, it, vi } from 'vitest'
import { isMobilePlatform, isTauri } from '../platform'

/**
 * The mobile flag decides whether adapters probe for a Go sidecar. Getting it
 * wrong either hides the desktop sidecar or makes every Android launch wait on
 * a loopback port that cannot exist — both are hydration bugs, so pin it here.
 */

const setUserAgent = (userAgent: string) => {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(userAgent)
}

afterEach(() => {
  delete window.__TAURI_INTERNALS__
  vi.restoreAllMocks()
})

describe('isMobilePlatform', () => {
  it('is false in a browser even with a phone user agent', () => {
    setUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36')
    expect(isTauri()).toBe(false)
    expect(isMobilePlatform()).toBe(false)
  })

  it('detects the Android WebView inside the Tauri shell', () => {
    window.__TAURI_INTERNALS__ = {}
    setUserAgent('Mozilla/5.0 (Linux; Android 14; sdk_gphone64_x86_64 Build/UE1A; wv) AppleWebKit/537.36')
    expect(isMobilePlatform()).toBe(true)
  })

  it('detects an iPhone WebView inside the Tauri shell', () => {
    window.__TAURI_INTERNALS__ = {}
    setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15')
    expect(isMobilePlatform()).toBe(true)
  })

  it('is false on the desktop shell', () => {
    window.__TAURI_INTERNALS__ = {}
    setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/605.1.15')
    expect(isTauri()).toBe(true)
    expect(isMobilePlatform()).toBe(false)
  })
})
