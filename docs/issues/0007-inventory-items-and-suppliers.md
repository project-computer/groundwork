# Inventory items + suppliers — schema, CRUD, list/detail/create pages

## What to build

Migration `000006_inventory.up.sql`:

- `suppliers (id SERIAL PK, clinic_id INT NOT NULL REFERENCES clinics(id), name VARCHAR(255) NOT NULL, phone, email, address, created_at, updated_at, deleted_at)`.
- `inventory_items (id SERIAL PK, clinic_id INT NOT NULL REFERENCES clinics(id), name VARCHAR(255) NOT NULL, category VARCHAR(20) NOT NULL CHECK (category IN ('medicine', 'vaccine', 'equipment', 'supply')), unit VARCHAR(50) NOT NULL, reorder_level INT NOT NULL DEFAULT 0, selling_price NUMERIC(12,2) NOT NULL, notes TEXT, created_at, updated_at, deleted_at)`.

Backend: `models.Supplier`, `models.InventoryItem` + repo + service + handler. RBAC: admin/pharmacist write, veterinarian read, others no access.

Frontend: `pages/Suppliers.tsx` (list + create + edit), `pages/Inventory.tsx` (list items, filter by category), `pages/InventoryDetail.tsx` (item detail; lots page placeholder for slice 0008).

## Acceptance criteria

- [ ] Migrations apply cleanly; CHECK constraint rejects invalid categories at the DB level.
- [ ] Item list renders; category filter works.
- [ ] Supplier list renders; create works.
- [ ] A vet user can GET but cannot POST/PUT/DELETE on these endpoints.
- [ ] RBAC matrix is referenced in code comments per slice 0001.

## Blocked by

- Slice 0000 (test infrastructure)
- Slice 0001 (ClinicContext — every repo now uses `GetClinicID(c)`)
