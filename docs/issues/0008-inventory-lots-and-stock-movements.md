# Inventory lots + append-only stock_movements ledger + stock operations

## What to build

Migration `000006b_inventory_lots.up.sql` (or appended to slice 0007's migration file):

- `inventory_lots (id SERIAL PK, clinic_id INT NOT NULL REFERENCES clinics(id), item_id INT NOT NULL REFERENCES inventory_items(id), lot_number VARCHAR(120) NOT NULL, quantity INT NOT NULL CHECK (quantity >= 0), expiry_date DATE, supplier_id INT REFERENCES suppliers(id), cost_per_unit NUMERIC(12,2), received_date DATE NOT NULL DEFAULT CURRENT_DATE, created_at, updated_at, deleted_at, UNIQUE(item_id, lot_number))`.
- `stock_movements (id SERIAL PK, clinic_id INT NOT NULL REFERENCES clinics(id), lot_id INT NOT NULL REFERENCES inventory_lots(id), delta INT NOT NULL, reason VARCHAR(20) NOT NULL CHECK (reason IN ('stock_in', 'stock_out', 'adjustment', 'waste')), ref_type VARCHAR(30), ref_id INT, user_id INT NOT NULL REFERENCES users(id), notes TEXT, created_at TIMESTAMP DEFAULT NOW())` — append-only; no UPDATE or DELETE endpoint.

Backend: lot CRUD nested under `inventory_items`; stock operation endpoint `POST /inventory/lots/:id/movements` accepts `{reason, delta, ref_type?, ref_id?, notes?}` and writes the movement + updates `inventory_lots.quantity` in a single transaction (so the ledger and the cached value stay consistent).

Quantity-on-hand for an item is `SUM(active lots.quantity)` — surfaced as a derived field on item list/detail. No batch merge logic needed for MVP (clinic staff add new lots, do not split/combine).

## Acceptance criteria

- [ ] Stock-in increments `inventory_lots.quantity` by `delta` and inserts a movement row.
- [ ] Stock-out decrements; the `CHECK (quantity >= 0)` constraint surfaces a clear error to the caller if the lot goes negative.
- [ ] Adjustments and waste work with the same flow.
- [ ] No endpoint exists for editing or deleting a movement.
- [ ] Item detail page shows derived total quantity and a per-lot breakdown.

## Blocked by

- Slice 0007 (Inventory items + suppliers — lots hang off items)
