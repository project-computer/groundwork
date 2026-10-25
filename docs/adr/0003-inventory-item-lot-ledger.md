# Inventory modeled as Item + Lot with append-only StockMovement ledger

The requirements doc lists "expiry date" as a single item-level field, but medicines and vaccines are received in **lots**, each with its own expiry and cost. Restocking the same item twice produces two batches with different expiries — a flat model breaks the expiry-alert requirement and prevents lot-level recall tracking (critical for vet vaccines).

We split into:

- `inventory_items` — the SKU: name, category (CHECK enum: medicine/vaccine/equipment/supply), unit, reorder_level, selling_price. Tenant-scoped.
- `inventory_lots` — the batch: lot_number, quantity, expiry_date, supplier_id, cost_per_unit, received_date. Quantity is a cached current value.

All stock changes flow through an append-only `stock_movements` ledger (signed delta + reason: `stock_in`/`stock_out`/`adjustment`/`waste` + optional `ref_type`/`ref_id` for future prescription/vaccination linkage). Current quantity = projection of the ledger, cached on the lot for read performance.

Prescribing or vaccinating does **not** auto-decrement stock in MVP — staff record stock-out as a separate manual movement. The schema leaves the door open (`stock_movements.ref_type` can later be `'prescription'`/`'vaccination'`), but lot selection (FEFO) stays a human decision for now.

## Considered Options

- **Flat item with single expiry** — rejected: breaks expiry alerts on restock; loses lot traceability for recalls.
- **Auto-decrement from prescriptions** — rejected for MVP: requires FEFO logic, requires prescriptions to specify exact quantities (current `medications` JSON blob does not), and presumes real-time stock discipline that clinics rarely have.

## Consequences

- "Most frequently used medicines" dashboard widget sources from `stock_movements WHERE reason='stock_out'` — the ground truth of dispensing.
- Low-stock alert is derived: `SUM(lots.quantity) ≤ item.reorder_level`. No stored alert rows.
- Expiry alert is derived: `lot.expiry_date - today ≤ window_days` (configurable, default 30). No stored alert rows.
- Cost lives on the lot (varies by delivery); selling price lives on the item. Reporting uses weighted-average cost.
