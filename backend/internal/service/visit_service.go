package service

import (
	"context"
	"database/sql"
	"encoding/json"
	"time"

	"github.com/vet-clinic/api/internal/models"
	"github.com/vet-clinic/api/internal/repository"
)

type VisitService struct {
	repo *repository.VisitRepository
}

func NewVisitService(repo *repository.VisitRepository) *VisitService {
	return &VisitService{repo: repo}
}

func (s *VisitService) Create(ctx context.Context, clinicID, userID int, req models.CreateVisitRequest) (*models.Visit, error) {
	visit := &models.Visit{
		PetID:     req.PetID,
		PetName:   req.PetName,
		OwnerName: req.OwnerName,
		Type:      req.Type,
		Purpose:   req.Purpose,
		CreatedBy: userID,
	}

	// Set optional fields
	if req.AppointmentID > 0 {
		visit.AppointmentID = sql.NullInt32{Int32: int32(req.AppointmentID), Valid: true}
	}

	if req.AssignedVetID > 0 {
		visit.AssignedVetID = sql.NullInt32{Int32: int32(req.AssignedVetID), Valid: true}
		if req.AssignedVetName != "" {
			visit.AssignedVetName = sql.NullString{String: req.AssignedVetName, Valid: true}
		}
	}

	err := s.repo.Create(ctx, clinicID, visit)
	if err != nil {
		return nil, err
	}

	return visit, nil
}

func (s *VisitService) Get(ctx context.Context, id int) (*models.Visit, error) {
	return s.repo.GetByID(ctx, id)
}

func (s *VisitService) List(ctx context.Context, clinicID int, query models.VisitListQuery) ([]*models.Visit, models.PaginationMeta, error) {
	visits, total, err := s.repo.List(ctx, clinicID, query)
	if err != nil {
		return nil, models.PaginationMeta{}, err
	}

	totalPages := (total + query.Limit - 1) / query.Limit
	meta := models.PaginationMeta{
		Page:       query.Page,
		Limit:      query.Limit,
		TotalItems: total,
		TotalPages: totalPages,
	}

	return visits, meta, nil
}

func (s *VisitService) Update(ctx context.Context, id int, req models.UpdateVisitRequest) error {
	updates := make(map[string]interface{})

	if req.Status != "" {
		updates["status"] = req.Status
	}

	if req.Steps != nil {
		updates["steps"] = json.RawMessage(req.Steps)
	}

	if req.ChiefComplaint != "" {
		updates["chief_complaint"] = sql.NullString{String: req.ChiefComplaint, Valid: true}
	}

	if req.Vitals != nil {
		updates["vitals"] = json.RawMessage(req.Vitals)
	}

	if req.Examination != "" {
		updates["examination"] = sql.NullString{String: req.Examination, Valid: true}
	}

	if req.DifferentialDiagnosis != "" {
		updates["differential_diagnosis"] = sql.NullString{String: req.DifferentialDiagnosis, Valid: true}
	}

	if req.FinalDiagnosis != "" {
		updates["final_diagnosis"] = sql.NullString{String: req.FinalDiagnosis, Valid: true}
	}

	if req.Treatment != "" {
		updates["treatment"] = sql.NullString{String: req.Treatment, Valid: true}
	}

	if req.Advice != "" {
		updates["advice"] = sql.NullString{String: req.Advice, Valid: true}
	}

	if req.FollowUpDate != "" {
		date, err := time.Parse("2006-01-02", req.FollowUpDate)
		if err != nil {
			return err
		}
		updates["follow_up_date"] = sql.NullTime{Time: date, Valid: true}
	}

	if req.Medications != nil {
		updates["medications"] = json.RawMessage(req.Medications)
	}

	if req.HasMedicationEnvelope != nil {
		updates["has_medication_envelope"] = *req.HasMedicationEnvelope
	}

	if req.HistoryNotes != "" {
		updates["history_notes"] = sql.NullString{String: req.HistoryNotes, Valid: true}
	}

	if req.BillingStatus != "" {
		updates["billing_status"] = req.BillingStatus
	}

	return s.repo.Update(ctx, id, updates)
}

func (s *VisitService) Complete(ctx context.Context, id int) error {
	return s.repo.Complete(ctx, id)
}

func (s *VisitService) Duplicate(ctx context.Context, clinicID int, sourceID int) (*models.Visit, error) {
	return s.repo.Duplicate(ctx, clinicID, sourceID)
}
