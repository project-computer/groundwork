package api

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"strings"

	"github.com/google/uuid"

	"github.com/project-computer/groundwork/server/internal/offlineapi/db"
)

type auditDTO struct {
	ID          string `json:"id"`
	ActorUserID string `json:"actorUserId"`
	Action      string `json:"action"`
	EntityType  string `json:"entityType"`
	EntityID    string `json:"entityId"`
	Summary     string `json:"summary"`
	Payload     any    `json:"payload"`
	CreatedAt   string `json:"createdAt"`
}

func auditFrom(row db.AuditLog) auditDTO {
	var payload any
	if row.Payload != "" {
		if err := json.Unmarshal([]byte(row.Payload), &payload); err != nil {
			payload = row.Payload
		}
	}
	return auditDTO{
		ID: row.ID, ActorUserID: nullString(row.ActorUserID),
		Action: row.Action, EntityType: row.EntityType, EntityID: row.EntityID,
		Summary: row.Summary, Payload: payload, CreatedAt: row.CreatedAt,
	}
}

// appendAudit writes one audit event. Callers pass the transaction's query set
// so medical and financial changes commit atomically with their audit row
// (plan AUD-02).
func (s *Server) appendAudit(
	ctx context.Context,
	q *db.Queries,
	p *principal,
	action, entityType, entityID, summary string,
	payload any,
) error {
	raw := "{}"
	if payload != nil {
		encoded, err := json.Marshal(payload)
		if err != nil {
			return err
		}
		raw = string(encoded)
	}
	_, err := q.CreateAuditLog(ctx, db.CreateAuditLogParams{
		ID: uuid.NewString(), ClinicID: p.ClinicID,
		ActorUserID: sql.NullString{String: p.UserID, Valid: true},
		Action:      action, EntityType: entityType, EntityID: entityID,
		Summary: summary, Payload: raw, CreatedAt: db.UtcNow(),
	})
	return err
}

func (s *Server) handleListAuditLogs(w http.ResponseWriter, r *http.Request, p *principal) {
	page := pagination(r)
	rows, err := s.q.ListAuditLogs(r.Context(), db.ListAuditLogsParams{
		ClinicID:   p.ClinicID,
		EntityType: strings.TrimSpace(r.URL.Query().Get("entityType")),
		Action:     strings.TrimSpace(r.URL.Query().Get("action")),
		Limit:      page.Limit,
		Offset:     page.Offset,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not list audit logs")
		return
	}
	out := make([]auditDTO, 0, len(rows))
	for _, row := range rows {
		out = append(out, auditFrom(row))
	}
	writeJSON(w, http.StatusOK, map[string]any{"events": out})
}
