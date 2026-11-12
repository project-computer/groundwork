export type PlatformId = 'windows' | 'macos' | 'linux'

export type FileId = 'installer' | 'msi' | 'apple-silicon' | 'intel' | 'appimage' | 'deb'

export interface DownloadFile {
  readonly id: FileId
  /** File name exactly as the Tauri bundler produces and the release uploads it. */
  readonly name: string
}

export interface PlatformDownloads {
  readonly id: PlatformId
  /** Proper noun — intentionally untranslated. */
  readonly name: string
  readonly files: readonly DownloadFile[]
}

/** Must match `version` in apps/clinic/src-tauri/tauri.conf.json — bump both together. */
export const RELEASE_VERSION = '0.1.0'

/**
 * Release asset base URL. Update when the release channel moves; the file
 * names below must match the uploaded asset names exactly. Labels and
 * requirements live in the view (download-card.tsx) — this manifest stays
 * translation-free.
 */
export const RELEASES_BASE_URL = 'https://github.com/project-computer/groundwork/releases/download'

export const PLATFORMS: readonly PlatformDownloads[] = [
  {
    id: 'windows',
    name: 'Windows',
    files: [
      { id: 'installer', name: 'Vet.Clinic_0.1.0_x64-setup.exe' },
      { id: 'msi', name: 'Vet.Clinic_0.1.0_x64_en-US.msi' },
    ],
  },
  {
    id: 'macos',
    name: 'macOS',
    // The release workflow builds on an Apple Silicon runner only, so the
    // Intel .dmg is not produced — do not list it until the matrix adds an
    // x86_64-apple-darwin build.
    files: [
      { id: 'apple-silicon', name: 'Vet.Clinic_0.1.0_aarch64.dmg' },
    ],
  },
  {
    id: 'linux',
    name: 'Linux',
    files: [
      { id: 'appimage', name: 'Vet.Clinic_0.1.0_amd64.AppImage' },
      { id: 'deb', name: 'Vet.Clinic_0.1.0_amd64.deb' },
    ],
  },
]

export const primaryFile = (platform: PlatformDownloads): DownloadFile => platform.files[0]

export const releaseUrl = (file: DownloadFile): string =>
  `${RELEASES_BASE_URL}/v${RELEASE_VERSION}/${encodeURIComponent(file.name)}`

/** Maps a user-agent string to a platform; unknown agents fall back to Windows. */
export const detectPlatform = (userAgent: string): PlatformId => {
  if (/windows|wow64|win32/i.test(userAgent)) return 'windows'
  if (/macintosh|mac os x|iphone|ipad/i.test(userAgent)) return 'macos'
  if (/linux|x11/i.test(userAgent) && !/android/i.test(userAgent)) return 'linux'
  return 'windows'
}
