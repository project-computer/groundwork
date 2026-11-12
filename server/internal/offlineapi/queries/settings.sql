-- name: UpdateClinicProfile :one
UPDATE clinics SET
    name = sqlc.arg(name),
    address = sqlc.arg(address),
    phone = sqlc.arg(phone),
    email = sqlc.arg(email),
    currency = sqlc.arg(currency),
    locale = sqlc.arg(locale),
    timezone = sqlc.arg(timezone),
    updated_at = sqlc.arg(updated_at)
WHERE id = sqlc.arg(id)
RETURNING *;

-- name: ListSettings :many
SELECT * FROM application_settings
WHERE clinic_id = sqlc.arg(clinic_id)
ORDER BY key;

-- name: UpsertSetting :exec
INSERT INTO application_settings (clinic_id, key, value, updated_at)
VALUES (sqlc.arg(clinic_id), sqlc.arg(key), sqlc.arg(value), sqlc.arg(updated_at))
ON CONFLICT (clinic_id, key) DO UPDATE SET
    value = excluded.value,
    updated_at = excluded.updated_at;
