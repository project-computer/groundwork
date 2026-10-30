import type { ComponentType } from 'react'
import { msg } from '@lingui/core/macro'
import type { MessageDescriptor } from '@lingui/core'
import { Trans, useLingui } from '@lingui/react/macro'
import { CloudIcon, PawPrintIcon, PlusIcon, SmartphoneIcon, type IconProps } from './icons'

export type ProductStatus = 'available' | 'coming-soon' | 'in-development'

export type ProductId = 'clinic' | 'hospital' | 'mobile' | 'cloud'

export interface Product {
  id: ProductId
  /** Product name — proper noun, intentionally untranslated. */
  name: string
  status: ProductStatus
  body: MessageDescriptor
}

const productIcon: Record<ProductId, ComponentType<IconProps>> = {
  clinic: PawPrintIcon,
  hospital: PlusIcon,
  mobile: SmartphoneIcon,
  cloud: CloudIcon,
}

const statusMsg: Record<ProductStatus, MessageDescriptor> = {
  available: msg`Available now`,
  'coming-soon': msg`Coming soon`,
  'in-development': msg`In development`,
}

// Product lines of the Vettera suite — grounded in the repo roadmap: the
// desktop clinic app ships today, the backend/ sync API and the multi-branch
// schema exist, and mobile rides the same Tauri codebase later.
export const PRODUCTS: readonly Product[] = [
  {
    id: 'clinic',
    name: 'Vettera Clinic',
    status: 'available',
    body: msg`The local-first clinic workspace — medical records, appointments, pharmacy and billing on your desktop.`,
  },
  {
    id: 'hospital',
    name: 'Vettera Hospital',
    status: 'coming-soon',
    body: msg`Hospital management for larger teams — wards and IPD, departments and multi-branch, on the same records core.`,
  },
  {
    id: 'mobile',
    name: 'Vettera Mobile',
    status: 'coming-soon',
    body: msg`Vettera in your pocket — rounds, schedules and vaccination reminders via LINE and SMS.`,
  },
  {
    id: 'cloud',
    name: 'Vettera Cloud',
    status: 'in-development',
    body: msg`Optional multi-branch sync and CaseTransfer between clinics, with encrypted backups.`,
  },
]

export const ProductCard = ({ product }: { product: Product }) => {
  const { i18n } = useLingui()
  const Icon = productIcon[product.id]
  return (
    <article className="product-card">
      <div className="product-head">
        <span className={`card-tile ${product.id}`}>
          <Icon size={18} />
        </span>
        <strong>{product.name}</strong>
        <span className={`status-chip ${product.status}`}>{i18n._(statusMsg[product.status])}</span>
      </div>
      <p>{i18n._(product.body)}</p>
      {product.id === 'clinic' && (
        <a className="button small" href="#downloads">
          <Trans>Download</Trans>
        </a>
      )}
    </article>
  )
}
