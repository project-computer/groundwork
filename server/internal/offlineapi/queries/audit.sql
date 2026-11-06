-- name: CreateAuditLog :one
INSERT INTO audit_logs (
    id, clinic_id, actor_user_id, action, entity_type, entity_id,
    summary, payload, created_at
) VALUES (
    sqlc.arg(id), sqlc.arg(clinic_id), sqlc.narg(actor_user_id), sqlc.arg(action),
    sqlc.arg(entity_type), sqlc.arg(entity_id), sqlc.arg(summary),
    sqlc.arg(payload), sqlc.arg(created_at)
) RETURNING *;

-- name: ListAuditLogs :many
SELECT * FROM audit_logs
WHERE clinic_id = sqlc.arg(clinic_id)
  AND (CAST(sqlc.arg(entity_type) AS TEXT) = '' OR entity_type = sqlc.arg(entity_type))
  AND (CAST(sqlc.arg(action) AS TEXT) = '' OR action = sqlc.arg(action))
ORDER BY created_at DESC
LIMIT sqlc.arg(limit) OFFSET sqlc.arg(offset);
