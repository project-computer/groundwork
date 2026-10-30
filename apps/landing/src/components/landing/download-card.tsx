import type { ComponentType } from 'react'
import { msg } from '@lingui/core/macro'
import type { MessageDescriptor } from '@lingui/core'
import { Trans, useLingui } from '@lingui/react/macro'
import { releaseUrl, type FileId, type PlatformDownloads, type PlatformId } from '@/lib/downloads'
import { CommandIcon, DownloadIcon, TerminalIcon, WindowsIcon, type IconProps } from './icons'

const platformIcon: Record<PlatformId, ComponentType<IconProps>> = {
  windows: WindowsIcon,
  macos: CommandIcon,
  linux: TerminalIcon,
}

// The view owns every sentence (repo convention) — the manifest stays
// translation-free and these are the single display source.
const requirementMsg: Record<PlatformId, MessageDescriptor> = {
  windows: msg`Windows 10 or later · 64-bit`,
  macos: msg`macOS 12 or later`,
  linux: msg`Ubuntu 22.04 / glibc 2.31+ · 64-bit`,
}

const fileLabelMsg: Record<FileId, MessageDescriptor> = {
  installer: msg`Installer`,
  msi: msg`MSI package`,
  'apple-silicon': msg`Apple silicon`,
  intel: msg`Intel`,
  appimage: msg`AppImage`,
  deb: msg`Debian package`,
}

interface DownloadCardProps {
  platform: PlatformDownloads
  /** Marks the visitor's own platform and gets the primary styling. */
  detected: boolean
}

export const DownloadCard = ({ platform, detected }: DownloadCardProps) => {
  const { i18n } = useLingui()
  const Icon = platformIcon[platform.id]
  return (
    <article className={`download-card${detected ? ' detected' : ''}`}>
      <div className="card-head">
        <span className={`card-tile ${platform.id}`}>
          <Icon size={20} />
        </span>
        <div>
          <strong>{platform.name}</strong>
          <span className="platform-note">{i18n._(requirementMsg[platform.id])}</span>
        </div>
        {detected && (
          <span className="detected-chip">
            <Trans>This device</Trans>
          </span>
        )}
      </div>
      <ul className="file-list">
        {platform.files.map((file) => (
          <li key={file.id} className="file-row">
            <div className="file-meta">
              <strong>{i18n._(fileLabelMsg[file.id])}</strong>
              <span className="file-name">{file.name}</span>
            </div>
            <a className="button small" href={releaseUrl(file)} download>
              <DownloadIcon size={14} />
              <Trans>Download</Trans>
            </a>
          </li>
        ))}
      </ul>
    </article>
  )
}
