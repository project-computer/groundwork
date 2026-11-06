package service

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/project-computer/groundwork/server/internal/repository"
)

// ClinicSettingsService reads and merges the clinic configuration document
// (opening hours, services, pricing, invoice numbering, tax settings).
// The document is schema-flexible JSONB; only object-ness is enforced here.
type ClinicSettingsService struct {
	repo *repository.ClinicRepository
}

func NewClinicSettingsService(repo *repository.ClinicRepository) *ClinicSettingsService {
	return &ClinicSettingsService{repo: repo}
}

func (s *ClinicSettingsService) Get(ctx context.Context, clinicID int) (json.RawMessage, error) {
	settings, err := s.repo.GetSettings(ctx, clinicID)
	if err != nil {
		return nil, err
	}
	if len(settings) == 0 {
		return json.RawMessage("{}"), nil
	}
	return settings, nil
}

func (s *ClinicSettingsService) Update(ctx context.Context, clinicID int, patch json.RawMessage) (json.RawMessage, error) {
	if !json.Valid(patch) {
		return nil, fmt.Errorf("settings must be valid JSON")
	}
	var probe interface{}
	if err := json.Unmarshal(patch, &probe); err != nil {
		return nil, fmt.Errorf("settings must be valid JSON")
	}
	if _, ok := probe.(map[string]interface{}); !ok {
		return nil, fmt.Errorf("settings must be a JSON object")
	}
	return s.repo.UpdateSettings(ctx, clinicID, patch)
}
