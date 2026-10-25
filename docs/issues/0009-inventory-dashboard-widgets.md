# Inventory dashboard widgets — low stock, expiring lots, most-used medicines

## What to build

Backend: extend `repository.DashboardRepository`:

- `GetLowStockItems(ctx, clinicID)` — items where `SUM(lots.quantity) <= reorder_level` AND `reorder_level > 0`. Returns name, category, on_hand, reorder_level.
- `GetExpiringLots(ctx, clinicID, withinDays int)` (default 30) — lots where `expiry_date BETWEEN today AND today + withinDays`. Returns item name, lot number, expiry_date, quantity.
- `GetMostUsedMedicines(ctx, clinicID, sinceDays int)` (default 30) — `SELECT item_id, SUM(ABS(delta)) AS used_qty FROM stock_movements WHERE reason = 'stock_out' AND created_at >= now() - interval '30 days' GROUP BY item_id ORDER BY used_qty DESC LIMIT 5`. Joins item for display name.

Service layer composes these; handler exposes as new dashboard fields without breaking existing ones.

Frontend: dashboard cards for each — "Low Stock", "Expiring Soon", "Top Used Medicines (30d)". Each row links to the relevant item/lot. Empty-state copy.

## Acceptance criteria

- [ ] Dashboard endpoint returns the three new arrays alongside the existing fields.
- [ ] Cards render; links navigate to the correct item/lot pages.
- [ ] Top-used medicines source is provably `stock_movements` (not from `prescriptions.medications` JSON).
- [ ] "Most-used" excludes equipment and supply categories (medicine + vaccine only).

## Blocked by

- Slice 0004 (dashboard repo refactor — new methods live in the repo)
- Slice 0008 (lots + movements — the widget data sources)
