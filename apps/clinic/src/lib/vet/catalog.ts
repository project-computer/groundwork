import type { ClinicState } from './types'

/**
 * Catalog read models (2026-10-29 refactor, phase 3). Two views over the
 * same products + inventory items — previously re-merged inline in Billing
 * and Consultations with drifting shapes.
 */

/** A billable entry, priced in minor units (products and inventory items). */
export interface BillableEntry {
  id: string
  name: string
  unit: string
  unitPrice: number
  /** True when the entry is a live InventoryItem (stock-tracked). */
  stocked?: boolean
}

/** A prescribable entry: name + unit, no price (prescriptions are free-form). */
export interface DispensableEntry {
  id: string
  name: string
  unit: string
  /** True when the entry is a live InventoryItem (stock-tracked). */
  stocked?: boolean
}

/** Billable catalog: legacy products (services & medications) plus every
 * inventory item at its selling price. Drives invoice line items. */
export const billableCatalog = (data: Pick<ClinicState, 'products' | 'inventoryItems'>): BillableEntry[] => [
  ...data.products.map((p) => ({ id: p.id, name: p.name, unit: p.unit, unitPrice: p.unitPrice })),
  ...data.inventoryItems.map((i) => ({ id: i.id, name: i.name, unit: i.unit, unitPrice: i.sellingPrice, stocked: true })),
]

/** Dispensable catalog: live medicine/vaccine inventory items plus legacy
 * medication products, so historical prescriptions still resolve. */
export const dispensableCatalog = (data: Pick<ClinicState, 'products' | 'inventoryItems'>): DispensableEntry[] => [
  ...data.inventoryItems
    .filter((i) => i.category === 'medicine' || i.category === 'vaccine')
    .map((i) => ({ id: i.id, name: i.name, unit: i.unit, stocked: true })),
  ...data.products.filter((p) => p.kind === 'medication').map((p) => ({ id: p.id, name: p.name, unit: p.unit })),
]
