import { useState } from 'react'
import { msg } from '@lingui/core/macro'
import type { MessageDescriptor } from '@lingui/core'
import { Trans, useLingui } from '@lingui/react/macro'
import { DownloadCard } from '@/components/landing/download-card'
import { CheckIcon, DownloadIcon, PawPrintIcon } from '@/components/landing/icons'
import { LanguageToggle } from '@/components/landing/language-toggle'
import { ProductCard, PRODUCTS } from '@/components/landing/product-card'
import { ThemeToggle } from '@/components/landing/theme-toggle'
import {
  detectPlatform,
  PLATFORMS,
  primaryFile,
  RELEASE_VERSION,
  releaseUrl,
  type PlatformId,
} from '@/lib/downloads'
import { LocaleProvider } from '@/lib/i18n'

const PLATFORM_NAME: Record<PlatformId, string> = {
  windows: 'Windows',
  macos: 'macOS',
  linux: 'Linux',
}

// Descriptors, not sentences — the JSX below owns when and how they render.
const FEATURES: ReadonlyArray<{ title: MessageDescriptor; body: MessageDescriptor }> = [
  {
    title: msg`Medical records`,
    body: msg`One medical timeline per patient — visits, vaccinations and vitals in order.`,
  },
  {
    title: msg`Appointments`,
    body: msg`Day and week calendar with walk-ins, conflict checks and reminders.`,
  },
  {
    title: msg`Pharmacy & inventory`,
    body: msg`Lot-level stock with expiry dates, reorder alerts and a full movement ledger.`,
  },
  {
    title: msg`Billing & payments`,
    body: msg`Ledger-accurate invoices, receipts, refunds and outstanding balances.`,
  },
]

const Page = () => {
  const { i18n } = useLingui()
  const [platform] = useState<PlatformId>(() => detectPlatform(navigator.userAgent))
  const detected = PLATFORMS.find((candidate) => candidate.id === platform) ?? PLATFORMS[0]
  const file = primaryFile(detected)

  return (
    <div className="landing">
      <header className="site-header">
        <div className="header-inner">
          <div className="brand">
            <div className="brand-mark">
              <PawPrintIcon size={19} />
            </div>
            <div>
              <strong>Vettera</strong>
              <span>
                <Trans>Hospital &amp; clinic management</Trans>
              </span>
            </div>
          </div>
          <div className="header-actions">
            <span className="version-chip">v{RELEASE_VERSION}</span>
            <LanguageToggle />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main>
        <section className="hero">
          <span className="version-chip">
            <Trans>Offline-first · local SQLite · sync optional</Trans>
          </span>
          <h1>
            <Trans>One platform for clinics and hospitals.</Trans>
          </h1>
          <p className="lede">
            <Trans>
              Vettera keeps patient records, appointments, pharmacy and billing in one
              local-first workspace — no account, no server setup. One suite for clinics and
              hospitals, from desktop to cloud.
            </Trans>
          </p>
          <div className="cta-row">
            <a className="button primary large" href={releaseUrl(file)} download>
              <DownloadIcon size={16} />
              <Trans>Download for {PLATFORM_NAME[platform]}</Trans>
            </a>
            <a className="button secondary large" href="#downloads">
              <Trans>All platforms</Trans>
            </a>
          </div>
          <p className="hero-note">
            <Trans>
              Windows 10+ · macOS 12+ · Ubuntu 22.04+ — SHA-256 checksums ship with every
              release
            </Trans>
          </p>
        </section>

        <section className="section" aria-labelledby="products-heading">
          <h2 id="products-heading">
            <Trans>Products</Trans>
          </h2>
          <p className="section-lede">
            <Trans>
              Start with the clinic workspace today — every product shares the same records
              core, so your data grows with you.
            </Trans>
          </p>
          <div className="product-grid">
            {PRODUCTS.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </section>

        <section id="downloads" className="section" aria-labelledby="downloads-heading">
          <h2 id="downloads-heading">
            <Trans>Download Vettera Clinic</Trans>
          </h2>
          <p className="section-lede">
            <Trans>
              Pick your platform. The installer bundles Vettera Clinic and its local
              database engine — first launch walks you through workspace setup.
            </Trans>
          </p>
          <div className="download-grid">
            {PLATFORMS.map((candidate) => (
              <DownloadCard
                key={candidate.id}
                platform={candidate}
                detected={candidate.id === platform}
              />
            ))}
          </div>
        </section>

        <section className="section" aria-labelledby="features-heading">
          <h2 id="features-heading">
            <Trans>What&rsquo;s inside</Trans>
          </h2>
          <div className="feature-grid">
            {FEATURES.map((feature) => (
              <article key={feature.title.id} className="feature-card">
                <span className="feature-tile">
                  <CheckIcon size={15} />
                </span>
                <div>
                  <strong>{i18n._(feature.title)}</strong>
                  <p>{i18n._(feature.body)}</p>
                </div>
              </article>
            ))}
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="footer-inner">
          <span>
            <Trans>© 2026 Vettera — local-first clinic management</Trans>
          </span>
          <span>
            <Trans>
              Your clinic data stays in a local SQLite file on your machine; cloud sync is
              always optional.
            </Trans>
          </span>
        </div>
      </footer>
    </div>
  )
}

export const App = () => (
  <LocaleProvider>
    <Page />
  </LocaleProvider>
)
