-- name: CreateOwner :one
INSERT INTO owners (
    id, clinic_id, name, phone, email, address,
    secondary_contact_name, secondary_contact_phone, notes,
    created_at, updated_at
) VALUES (
    sqlc.arg(id), sqlc.arg(clinic_id), sqlc.arg(name), sqlc.arg(phone),
    sqlc.arg(email), sqlc.arg(address), sqlc.arg(secondary_contact_name),
    sqlc.arg(secondary_contact_phone), sqlc.arg(notes),
    sqlc.arg(created_at), sqlc.arg(updated_at)
) RETURNING *;

-- name: GetOwner :one
SELECT * FROM owners
WHERE clinic_id = sqlc.arg(clinic_id) AND id = sqlc.arg(id);

-- name: ListOwners :many
SELECT * FROM owners
WHERE clinic_id = sqlc.arg(clinic_id)
  AND (
    CAST(sqlc.arg(search) AS TEXT) = ''
    OR name LIKE '%' || CAST(sqlc.arg(search) AS TEXT) || '%'
    OR phone LIKE '%' || CAST(sqlc.arg(search) AS TEXT) || '%'
  )
ORDER BY name
LIMIT sqlc.arg(limit) OFFSET sqlc.arg(offset);

-- name: UpdateOwner :one
UPDATE owners SET
    name = sqlc.arg(name),
    phone = sqlc.arg(phone),
    email = sqlc.arg(email),
    address = sqlc.arg(address),
    secondary_contact_name = sqlc.arg(secondary_contact_name),
    secondary_contact_phone = sqlc.arg(secondary_contact_phone),
    notes = sqlc.arg(notes),
    updated_at = sqlc.arg(updated_at)
WHERE clinic_id = sqlc.arg(clinic_id) AND id = sqlc.arg(id)
RETURNING *;

-- name: CountOwners :one
SELECT COUNT(*) FROM owners WHERE clinic_id = sqlc.arg(clinic_id);
