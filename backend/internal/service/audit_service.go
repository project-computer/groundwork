package service

import (
	"context"
	"encoding/json"
	"log"
)

// AuditService persists entries in audit_logs for sensitive actions
// (payments, refunds, voids, stock adjustments). Recording is best-effort:
// a failure is logged but never blocks the primary operation.
type AuditService struct {
	repo AuditRepo
}

type AuditRepo interface {
	Insert(ctx context.Context, clinicID, userID int, action, entityType string, entityID int, newValues json.RawMessage) error
}

func NewAuditService(repo AuditRepo) *AuditService {
	return &AuditService{repo: repo}
}

func (s *AuditService) Record(ctx context.Context, clinicID, userID int, action, entityType string, entityID int, newValues map[string]interface{}) {
	if s == nil {
		return
	}
	var payload json.RawMessage
	if newValues != nil {
		raw, err := json.Marshal(newValues)
		if err != nil {
			log.Printf("audit: failed to marshal payload for %s: %v", action, err)
			return
		}
		payload = raw
	}
	if err := s.repo.Insert(ctx, clinicID, userID, action, entityType, entityID, payload); err != nil {
		log.Printf("audit: failed to record %s for %s#%d: %v", action, entityType, entityID, err)
	}
}
