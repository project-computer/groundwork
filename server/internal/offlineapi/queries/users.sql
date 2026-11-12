-- name: CountClinics :one
SELECT COUNT(*) FROM clinics;

-- name: CreateClinic :one
INSERT INTO clinics (
    id, name, address, phone, email, currency, locale, timezone,
    created_at, updated_at
) VALUES (
    sqlc.arg(id), sqlc.arg(name), sqlc.arg(address), sqlc.arg(phone),
    sqlc.arg(email), sqlc.arg(currency), sqlc.arg(locale), sqlc.arg(timezone),
    sqlc.arg(created_at), sqlc.arg(updated_at)
) RETURNING *;

-- name: GetClinic :one
SELECT * FROM clinics WHERE id = sqlc.arg(id);

-- name: CreateUser :one
INSERT INTO users (
    id, clinic_id, name, username, pin_hash, active, created_at, updated_at
) VALUES (
    sqlc.arg(id), sqlc.arg(clinic_id), sqlc.arg(name), sqlc.arg(username),
    sqlc.arg(pin_hash), sqlc.arg(active), sqlc.arg(created_at), sqlc.arg(updated_at)
) RETURNING *;

-- name: GetUserByUsername :one
SELECT * FROM users
WHERE clinic_id = sqlc.arg(clinic_id) AND username = sqlc.arg(username) AND active = 1;

-- name: GetActiveUserByUsername :one
SELECT * FROM users WHERE username = sqlc.arg(username) AND active = 1;

-- name: GetUserByID :one
SELECT * FROM users WHERE id = sqlc.arg(id);

-- name: ListUsers :many
SELECT * FROM users WHERE clinic_id = sqlc.arg(clinic_id) ORDER BY name;

-- name: SetUserActive :exec
UPDATE users
SET active = sqlc.arg(active), updated_at = sqlc.arg(updated_at)
WHERE clinic_id = sqlc.arg(clinic_id) AND id = sqlc.arg(id);

-- name: AssignRole :exec
INSERT OR IGNORE INTO user_roles (user_id, role_id)
VALUES (sqlc.arg(user_id), sqlc.arg(role_id));

-- name: ListUserRoles :many
SELECT r.name
FROM user_roles ur
JOIN roles r ON r.id = ur.role_id
WHERE ur.user_id = sqlc.arg(user_id)
ORDER BY r.name;

-- name: CreateSession :exec
INSERT INTO sessions (token_hash, user_id, clinic_id, created_at, expires_at)
VALUES (
    sqlc.arg(token_hash), sqlc.arg(user_id), sqlc.arg(clinic_id),
    sqlc.arg(created_at), sqlc.arg(expires_at)
);

-- name: GetSession :one
SELECT * FROM sessions
WHERE token_hash = sqlc.arg(token_hash) AND expires_at > sqlc.arg(now);

-- name: GetSessionUser :one
SELECT u.id, u.clinic_id, u.name, u.username, u.active
FROM sessions s
JOIN users u ON u.id = s.user_id
WHERE s.token_hash = sqlc.arg(token_hash)
  AND s.expires_at > sqlc.arg(now)
  AND u.active = 1;

-- name: DeleteSession :exec
DELETE FROM sessions WHERE token_hash = sqlc.arg(token_hash);

-- name: DeleteExpiredSessions :exec
DELETE FROM sessions WHERE expires_at <= sqlc.arg(now);

-- name: ListAllStaff :many
-- Pre-auth staff directory for the lock screen (staff.go). The database
-- serves exactly one clinic (ADR 0019); when multi-tenancy lands this gains
-- a clinic parameter. Never select pin_hash here.
SELECT id, username, name, active FROM users ORDER BY name;
