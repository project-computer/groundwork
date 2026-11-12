-- name: CreateService :one
INSERT INTO services (
    id, clinic_id, name, category, unit, unit_price_satang, is_active,
    created_at, updated_at
) VALUES (
    sqlc.arg(id), sqlc.arg(clinic_id), sqlc.arg(name), sqlc.arg(category),
    sqlc.arg(unit), sqlc.arg(unit_price_satang), sqlc.arg(is_active),
    sqlc.arg(created_at), sqlc.arg(updated_at)
) RETURNING *;

-- name: GetService :one
SELECT * FROM services
WHERE clinic_id = sqlc.arg(clinic_id) AND id = sqlc.arg(id);

-- name: ListServices :many
SELECT * FROM services
WHERE clinic_id = sqlc.arg(clinic_id)
  AND (CAST(sqlc.arg(search) AS TEXT) = '' OR name LIKE '%' || sqlc.arg(search) || '%')
  AND (CAST(sqlc.arg(category) AS TEXT) = '' OR category = sqlc.arg(category))
ORDER BY name
LIMIT sqlc.arg(limit) OFFSET sqlc.arg(offset);

-- name: UpdateService :one
UPDATE services SET
    name = sqlc.arg(name),
    category = sqlc.arg(category),
    unit = sqlc.arg(unit),
    unit_price_satang = sqlc.arg(unit_price_satang),
    is_active = sqlc.arg(is_active),
    updated_at = sqlc.arg(updated_at)
WHERE clinic_id = sqlc.arg(clinic_id) AND id = sqlc.arg(id)
RETURNING *;

-- name: CreateInvoice :one
INSERT INTO invoices (
    id, clinic_id, owner_id, pet_id, consultation_id, invoice_number, status,
    subtotal_satang, discount_satang, tax_satang, total_satang, notes,
    issued_at, created_at, updated_at
) VALUES (
    sqlc.arg(id), sqlc.arg(clinic_id), sqlc.arg(owner_id), sqlc.narg(pet_id),
    sqlc.narg(consultation_id), sqlc.arg(invoice_number), sqlc.arg(status),
    sqlc.arg(subtotal_satang), sqlc.arg(discount_satang), sqlc.arg(tax_satang),
    sqlc.arg(total_satang), sqlc.arg(notes), sqlc.arg(issued_at),
    sqlc.arg(created_at), sqlc.arg(updated_at)
) RETURNING *;

-- name: GetInvoice :one
SELECT * FROM invoices
WHERE clinic_id = sqlc.arg(clinic_id) AND id = sqlc.arg(id);

-- name: ListInvoices :many
SELECT * FROM invoices
WHERE clinic_id = sqlc.arg(clinic_id)
  AND (CAST(sqlc.arg(owner_id) AS TEXT) = '' OR owner_id = sqlc.arg(owner_id))
  AND (CAST(sqlc.arg(pet_id) AS TEXT) = '' OR pet_id = sqlc.arg(pet_id))
  AND (CAST(sqlc.arg(status) AS TEXT) = '' OR status = sqlc.arg(status))
  AND (CAST(sqlc.arg(from_at) AS TEXT) = '' OR issued_at >= sqlc.arg(from_at))
  AND (CAST(sqlc.arg(to_at) AS TEXT) = '' OR issued_at <= sqlc.arg(to_at))
ORDER BY issued_at DESC
LIMIT sqlc.arg(limit) OFFSET sqlc.arg(offset);

-- name: CountInvoicesWithPrefix :one
SELECT COUNT(*) FROM invoices
WHERE clinic_id = sqlc.arg(clinic_id) AND invoice_number LIKE sqlc.arg(prefix) || '%';

-- name: UpdateInvoiceStatus :exec
UPDATE invoices SET status = sqlc.arg(status), updated_at = sqlc.arg(updated_at)
WHERE clinic_id = sqlc.arg(clinic_id) AND id = sqlc.arg(id);

-- name: CreateInvoiceItem :one
INSERT INTO invoice_items (
    id, clinic_id, invoice_id, service_id, description, quantity,
    unit_price_satang, discount_satang, line_total_satang, created_at
) VALUES (
    sqlc.arg(id), sqlc.arg(clinic_id), sqlc.arg(invoice_id), sqlc.narg(service_id),
    sqlc.arg(description), sqlc.arg(quantity), sqlc.arg(unit_price_satang),
    sqlc.arg(discount_satang), sqlc.arg(line_total_satang), sqlc.arg(created_at)
) RETURNING *;

-- name: ListInvoiceItems :many
SELECT * FROM invoice_items
WHERE clinic_id = sqlc.arg(clinic_id) AND invoice_id = sqlc.arg(invoice_id)
ORDER BY created_at;

-- name: CreatePayment :one
INSERT INTO payments (
    id, clinic_id, invoice_id, amount_satang, method, reference, status,
    received_at, created_at
) VALUES (
    sqlc.arg(id), sqlc.arg(clinic_id), sqlc.arg(invoice_id), sqlc.arg(amount_satang),
    sqlc.arg(method), sqlc.arg(reference), sqlc.arg(status), sqlc.arg(received_at),
    sqlc.arg(created_at)
) RETURNING *;

-- name: GetPayment :one
SELECT * FROM payments
WHERE clinic_id = sqlc.arg(clinic_id) AND id = sqlc.arg(id);

-- name: CreatePaymentAllocation :one
INSERT INTO payment_allocations (
    id, clinic_id, payment_id, invoice_id, amount_satang, created_at
) VALUES (
    sqlc.arg(id), sqlc.arg(clinic_id), sqlc.arg(payment_id), sqlc.arg(invoice_id),
    sqlc.arg(amount_satang), sqlc.arg(created_at)
) RETURNING *;

-- name: ListPaymentsByInvoice :many
SELECT * FROM payments
WHERE clinic_id = sqlc.arg(clinic_id) AND invoice_id = sqlc.arg(invoice_id)
ORDER BY received_at;

-- name: SumPaidByInvoice :one
SELECT CAST(COALESCE(SUM(amount_satang), 0) AS INTEGER) FROM payments
WHERE clinic_id = sqlc.arg(clinic_id) AND invoice_id = sqlc.arg(invoice_id)
  AND status = 'paid';

-- name: VoidPayment :exec
UPDATE payments SET status = sqlc.arg(status)
WHERE clinic_id = sqlc.arg(clinic_id) AND id = sqlc.arg(id);
