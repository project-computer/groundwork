import { describe, expect, test } from 'vitest'
import { detectPlatform, PLATFORMS, primaryFile, RELEASE_VERSION, releaseUrl } from './downloads'

describe('detectPlatform', () => {
  test('detects Windows', () => {
    expect(
      detectPlatform(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      ),
    ).toBe('windows')
  })

  test('detects macOS and iOS as macos', () => {
    expect(
      detectPlatform(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
      ),
    ).toBe('macos')
    expect(
      detectPlatform(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
      ),
    ).toBe('macos')
  })

  test('detects Linux, treating Android as unknown', () => {
    expect(
      detectPlatform(
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      ),
    ).toBe('linux')
    expect(
      detectPlatform(
        'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
      ),
    ).toBe('windows')
  })

  test('falls back to Windows on unknown agents', () => {
    expect(detectPlatform('curl/8.5.0')).toBe('windows')
    expect(detectPlatform('')).toBe('windows')
  })
})

describe('release manifest', () => {
  test('covers each platform exactly once', () => {
    expect(PLATFORMS.map((platform) => platform.id)).toEqual(['windows', 'macos', 'linux'])
  })

  test('every platform exposes files stamped with the release version', () => {
    for (const platform of PLATFORMS) {
      expect(platform.files.length).toBeGreaterThan(0)
      for (const file of platform.files) {
        expect(file.name).toContain(RELEASE_VERSION)
      }
    }
  })

  test('file ids are unique within each platform', () => {
    for (const platform of PLATFORMS) {
      expect(new Set(platform.files.map((file) => file.id)).size).toBe(platform.files.length)
    }
  })

  test('release URLs escape spaces and point at the versioned release', () => {
    const windows = PLATFORMS.find((platform) => platform.id === 'windows')!
    const url = releaseUrl(primaryFile(windows))
    expect(url).not.toContain(' ')
    expect(url).toContain(`v${RELEASE_VERSION}/`)
    expect(url.endsWith(`/${encodeURIComponent(windows.files[0].name)}`)).toBe(true)
  })
})
