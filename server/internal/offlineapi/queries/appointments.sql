-- name: CreateAppointment :one
INSERT INTO appointments (
    id, clinic_id, pet_id, veterinarian_id, scheduled_at, duration_minutes,
    reason, status, cancellation_reason, checked_in_at, started_at, completed_at,
    notes, created_at, updated_at
) VALUES (
    sqlc.arg(id), sqlc.arg(clinic_id), sqlc.arg(pet_id), sqlc.narg(veterinarian_id),
    sqlc.arg(scheduled_at), sqlc.arg(duration_minutes), sqlc.arg(reason),
    sqlc.arg(status), sqlc.arg(cancellation_reason), sqlc.narg(checked_in_at),
    sqlc.narg(started_at), sqlc.narg(completed_at), sqlc.arg(notes),
    sqlc.arg(created_at), sqlc.arg(updated_at)
) RETURNING *;

-- name: GetAppointment :one
SELECT a.*, p.name AS pet_name, p.mrn AS pet_mrn,
       o.id AS owner_id, o.name AS owner_name, o.phone AS owner_phone
FROM appointments a
JOIN pets p ON p.id = a.pet_id
JOIN owners o ON o.id = p.owner_id
WHERE a.clinic_id = sqlc.arg(clinic_id) AND a.id = sqlc.arg(id);

-- name: ListAppointments :many
SELECT a.*, p.name AS pet_name, p.mrn AS pet_mrn,
       o.id AS owner_id, o.name AS owner_name, o.phone AS owner_phone
FROM appointments a
JOIN pets p ON p.id = a.pet_id
JOIN owners o ON o.id = p.owner_id
WHERE a.clinic_id = sqlc.arg(clinic_id)
  AND (CAST(sqlc.arg(from_at) AS TEXT) = '' OR a.scheduled_at >= sqlc.arg(from_at))
  AND (CAST(sqlc.arg(to_at) AS TEXT) = '' OR a.scheduled_at <= sqlc.arg(to_at))
  AND (CAST(sqlc.arg(status) AS TEXT) = '' OR a.status = sqlc.arg(status))
  AND (CAST(sqlc.arg(pet_id) AS TEXT) = '' OR a.pet_id = sqlc.arg(pet_id))
ORDER BY a.scheduled_at
LIMIT sqlc.arg(limit) OFFSET sqlc.arg(offset);

-- name: UpdateAppointment :one
UPDATE appointments SET
    pet_id = sqlc.arg(pet_id),
    veterinarian_id = sqlc.narg(veterinarian_id),
    scheduled_at = sqlc.arg(scheduled_at),
    duration_minutes = sqlc.arg(duration_minutes),
    reason = sqlc.arg(reason),
    status = sqlc.arg(status),
    cancellation_reason = sqlc.arg(cancellation_reason),
    checked_in_at = sqlc.narg(checked_in_at),
    started_at = sqlc.narg(started_at),
    completed_at = sqlc.narg(completed_at),
    notes = sqlc.arg(notes),
    updated_at = sqlc.arg(updated_at)
WHERE clinic_id = sqlc.arg(clinic_id) AND id = sqlc.arg(id)
RETURNING *;

-- name: SetAppointmentStatus :exec
UPDATE appointments SET status = sqlc.arg(status), updated_at = sqlc.arg(updated_at)
WHERE clinic_id = sqlc.arg(clinic_id) AND id = sqlc.arg(id);
