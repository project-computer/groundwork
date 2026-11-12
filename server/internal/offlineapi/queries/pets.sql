-- name: CreatePet :one
INSERT INTO pets (
    id, clinic_id, owner_id, mrn, name, species, breed, sex,
    date_of_birth, color, microchip_number, notes, created_at, updated_at
) VALUES (
    sqlc.arg(id), sqlc.arg(clinic_id), sqlc.arg(owner_id), sqlc.arg(mrn),
    sqlc.arg(name), sqlc.arg(species), sqlc.arg(breed), sqlc.arg(sex),
    sqlc.arg(date_of_birth), sqlc.arg(color), sqlc.arg(microchip_number),
    sqlc.arg(notes), sqlc.arg(created_at), sqlc.arg(updated_at)
) RETURNING *;

-- name: GetPet :one
SELECT p.*, o.name AS owner_name, o.phone AS owner_phone
FROM pets p
JOIN owners o ON o.id = p.owner_id
WHERE p.clinic_id = sqlc.arg(clinic_id) AND p.id = sqlc.arg(id);

-- name: ListPets :many
SELECT p.*, o.name AS owner_name, o.phone AS owner_phone
FROM pets p
JOIN owners o ON o.id = p.owner_id
WHERE p.clinic_id = sqlc.arg(clinic_id)
  AND (
    CAST(sqlc.arg(search) AS TEXT) = ''
    OR p.name LIKE '%' || CAST(sqlc.arg(search) AS TEXT) || '%'
    OR p.microchip_number LIKE '%' || CAST(sqlc.arg(search) AS TEXT) || '%'
    OR o.name LIKE '%' || CAST(sqlc.arg(search) AS TEXT) || '%'
    OR o.phone LIKE '%' || CAST(sqlc.arg(search) AS TEXT) || '%'
  )
ORDER BY p.name
LIMIT sqlc.arg(limit) OFFSET sqlc.arg(offset);

-- name: UpdatePet :one
UPDATE pets SET
    owner_id = sqlc.arg(owner_id),
    name = sqlc.arg(name),
    species = sqlc.arg(species),
    breed = sqlc.arg(breed),
    sex = sqlc.arg(sex),
    date_of_birth = sqlc.arg(date_of_birth),
    color = sqlc.arg(color),
    microchip_number = sqlc.arg(microchip_number),
    notes = sqlc.arg(notes),
    updated_at = sqlc.arg(updated_at)
WHERE clinic_id = sqlc.arg(clinic_id) AND id = sqlc.arg(id)
RETURNING *;

-- name: CountPets :one
SELECT COUNT(*) FROM pets WHERE clinic_id = sqlc.arg(clinic_id);

-- name: CreatePetWeight :one
INSERT INTO pet_weights (
    id, clinic_id, pet_id, weight_grams, measured_at, recorded_by, created_at
) VALUES (
    sqlc.arg(id), sqlc.arg(clinic_id), sqlc.arg(pet_id), sqlc.arg(weight_grams),
    sqlc.arg(measured_at), sqlc.narg(recorded_by), sqlc.arg(created_at)
) RETURNING *;

-- name: ListPetWeights :many
SELECT * FROM pet_weights
WHERE clinic_id = sqlc.arg(clinic_id) AND pet_id = sqlc.arg(pet_id)
ORDER BY measured_at DESC;

-- name: LatestPetWeight :one
SELECT * FROM pet_weights
WHERE clinic_id = sqlc.arg(clinic_id) AND pet_id = sqlc.arg(pet_id)
ORDER BY measured_at DESC
LIMIT 1;
