-- name: CreatePrescription :one
INSERT INTO prescriptions (
    id, clinic_id, consultation_id, pet_id, veterinarian_id,
    instructions, status, issued_at, created_at, updated_at
) VALUES (
    sqlc.arg(id), sqlc.arg(clinic_id), sqlc.arg(consultation_id), sqlc.arg(pet_id),
    sqlc.narg(veterinarian_id), sqlc.arg(instructions), sqlc.arg(status),
    sqlc.arg(issued_at), sqlc.arg(created_at), sqlc.arg(updated_at)
) RETURNING *;

-- name: GetPrescription :one
SELECT * FROM prescriptions
WHERE clinic_id = sqlc.arg(clinic_id) AND id = sqlc.arg(id);

-- name: ListPrescriptionsByConsultation :many
SELECT * FROM prescriptions
WHERE clinic_id = sqlc.arg(clinic_id) AND consultation_id = sqlc.arg(consultation_id)
ORDER BY created_at;

-- name: ListPrescriptionsByPet :many
SELECT * FROM prescriptions
WHERE clinic_id = sqlc.arg(clinic_id) AND pet_id = sqlc.arg(pet_id)
ORDER BY issued_at DESC
LIMIT sqlc.arg(limit) OFFSET sqlc.arg(offset);

-- name: CreatePrescriptionItem :one
INSERT INTO prescription_items (
    id, clinic_id, prescription_id, medication_id, medication_name, strength,
    dose_amount, dose_unit, route, frequency, duration_days,
    quantity_dispensed, instructions, created_at
) VALUES (
    sqlc.arg(id), sqlc.arg(clinic_id), sqlc.arg(prescription_id),
    sqlc.narg(medication_id), sqlc.arg(medication_name), sqlc.arg(strength),
    sqlc.arg(dose_amount), sqlc.arg(dose_unit), sqlc.arg(route), sqlc.arg(frequency),
    sqlc.narg(duration_days), sqlc.arg(quantity_dispensed), sqlc.arg(instructions),
    sqlc.arg(created_at)
) RETURNING *;

-- name: ListPrescriptionItems :many
SELECT * FROM prescription_items
WHERE clinic_id = sqlc.arg(clinic_id) AND prescription_id = sqlc.arg(prescription_id)
ORDER BY created_at;

-- name: CreateMedication :one
INSERT INTO medications (id, clinic_id, name, strength, form, is_active, created_at, updated_at)
VALUES (
    sqlc.arg(id), sqlc.arg(clinic_id), sqlc.arg(name), sqlc.arg(strength),
    sqlc.arg(form), sqlc.arg(is_active), sqlc.arg(created_at), sqlc.arg(updated_at)
) RETURNING *;

-- name: GetMedication :one
SELECT * FROM medications
WHERE clinic_id = sqlc.arg(clinic_id) AND id = sqlc.arg(id);

-- name: ListMedications :many
SELECT * FROM medications
WHERE clinic_id = sqlc.arg(clinic_id)
  AND (CAST(sqlc.arg(search) AS TEXT) = '' OR name LIKE '%' || sqlc.arg(search) || '%')
ORDER BY name
LIMIT sqlc.arg(limit) OFFSET sqlc.arg(offset);

-- name: UpdateMedication :one
UPDATE medications SET
    name = sqlc.arg(name),
    strength = sqlc.arg(strength),
    form = sqlc.arg(form),
    is_active = sqlc.arg(is_active),
    updated_at = sqlc.arg(updated_at)
WHERE clinic_id = sqlc.arg(clinic_id) AND id = sqlc.arg(id)
RETURNING *;
