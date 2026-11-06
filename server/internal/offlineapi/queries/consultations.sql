-- name: CreateConsultation :one
INSERT INTO consultations (
    id, clinic_id, pet_id, appointment_id, veterinarian_id,
    chief_complaint, symptoms, examination, diagnosis_notes, treatment_plan,
    notes, weight_grams, temperature_celsius, heart_rate_bpm, respiratory_rate_bpm,
    status, started_at, completed_at, created_at, updated_at
) VALUES (
    sqlc.arg(id), sqlc.arg(clinic_id), sqlc.arg(pet_id), sqlc.narg(appointment_id),
    sqlc.narg(veterinarian_id), sqlc.arg(chief_complaint), sqlc.arg(symptoms),
    sqlc.arg(examination), sqlc.arg(diagnosis_notes), sqlc.arg(treatment_plan),
    sqlc.arg(notes), sqlc.narg(weight_grams), sqlc.narg(temperature_celsius),
    sqlc.narg(heart_rate_bpm), sqlc.narg(respiratory_rate_bpm), sqlc.arg(status),
    sqlc.arg(started_at), sqlc.narg(completed_at), sqlc.arg(created_at),
    sqlc.arg(updated_at)
) RETURNING *;

-- name: GetConsultation :one
SELECT * FROM consultations
WHERE clinic_id = sqlc.arg(clinic_id) AND id = sqlc.arg(id);

-- name: ListConsultationsByPet :many
SELECT * FROM consultations
WHERE clinic_id = sqlc.arg(clinic_id) AND pet_id = sqlc.arg(pet_id)
ORDER BY created_at DESC
LIMIT sqlc.arg(limit) OFFSET sqlc.arg(offset);

-- name: UpdateConsultation :one
UPDATE consultations SET
    chief_complaint = sqlc.arg(chief_complaint),
    symptoms = sqlc.arg(symptoms),
    examination = sqlc.arg(examination),
    diagnosis_notes = sqlc.arg(diagnosis_notes),
    treatment_plan = sqlc.arg(treatment_plan),
    notes = sqlc.arg(notes),
    weight_grams = sqlc.narg(weight_grams),
    temperature_celsius = sqlc.narg(temperature_celsius),
    heart_rate_bpm = sqlc.narg(heart_rate_bpm),
    respiratory_rate_bpm = sqlc.narg(respiratory_rate_bpm),
    status = sqlc.arg(status),
    completed_at = sqlc.narg(completed_at),
    updated_at = sqlc.arg(updated_at)
WHERE clinic_id = sqlc.arg(clinic_id) AND id = sqlc.arg(id)
RETURNING *;

-- name: CreateDiagnosis :one
INSERT INTO diagnoses (id, clinic_id, consultation_id, code, description, notes, created_at)
VALUES (
    sqlc.arg(id), sqlc.arg(clinic_id), sqlc.arg(consultation_id),
    sqlc.arg(code), sqlc.arg(description), sqlc.arg(notes), sqlc.arg(created_at)
) RETURNING *;

-- name: ListDiagnoses :many
SELECT * FROM diagnoses
WHERE clinic_id = sqlc.arg(clinic_id) AND consultation_id = sqlc.arg(consultation_id)
ORDER BY created_at;

-- name: DeleteDiagnosesByConsultation :exec
DELETE FROM diagnoses
WHERE clinic_id = sqlc.arg(clinic_id) AND consultation_id = sqlc.arg(consultation_id);

-- name: CreateTreatment :one
INSERT INTO treatments (id, clinic_id, consultation_id, description, notes, created_at)
VALUES (
    sqlc.arg(id), sqlc.arg(clinic_id), sqlc.arg(consultation_id),
    sqlc.arg(description), sqlc.arg(notes), sqlc.arg(created_at)
) RETURNING *;

-- name: ListTreatments :many
SELECT * FROM treatments
WHERE clinic_id = sqlc.arg(clinic_id) AND consultation_id = sqlc.arg(consultation_id)
ORDER BY created_at;

-- name: DeleteTreatmentsByConsultation :exec
DELETE FROM treatments
WHERE clinic_id = sqlc.arg(clinic_id) AND consultation_id = sqlc.arg(consultation_id);
