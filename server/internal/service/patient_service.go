package service

import (
	"context"
	"fmt"
	"time"

	"github.com/project-computer/groundwork/server/internal/models"
)

type PatientService struct {
	repo PatientRepo
}

// PatientRepo is the minimal repo surface PatientService needs. Defining it here (not in
// repository/) keeps PatientService free of an import cycle when we eventually introduce
// an interface for handler-level testing in slices beyond 0002.
type PatientRepo interface {
	Create(ctx context.Context, clinicID int, p *models.Patient) error
	GetByID(ctx context.Context, id int) (*models.Patient, error)
	List(ctx context.Context, clinicID int, query models.PatientListQuery) ([]*models.Patient, int, error)
	Update(ctx context.Context, id int, updates map[string]interface{}) error
	Delete(ctx context.Context, id int) error
}

func NewPatientService(repo PatientRepo) *PatientService {
	return &PatientService{repo: repo}
}

func (s *PatientService) Create(ctx context.Context, clinicID int, req models.CreatePatientRequest) (*models.Patient, error) {
	p := &models.Patient{
		Name:       req.Name,
		Species:    req.Species,
		OwnerName:  req.OwnerName,
		OwnerPhone: req.OwnerPhone,
		Status:     "Active",
	}

	if req.Breed != "" {
		p.Breed.String = req.Breed
		p.Breed.Valid = true
	}
	if req.DateOfBirth != "" {
		if t, err := time.Parse("2006-01-02", req.DateOfBirth); err == nil {
			p.DateOfBirth.Time = t
			p.DateOfBirth.Valid = true
		}
	}
	if req.Weight > 0 {
		p.Weight.Float64 = req.Weight
		p.Weight.Valid = true
	}
	if req.OwnerEmail != "" {
		p.OwnerEmail.String = req.OwnerEmail
		p.OwnerEmail.Valid = true
	}
	if req.OwnerNationalID != "" {
		p.OwnerNationalID.String = req.OwnerNationalID
		p.OwnerNationalID.Valid = true
	}
	if req.OwnerNotes != "" {
		p.OwnerNotes.String = req.OwnerNotes
		p.OwnerNotes.Valid = true
	}

	if err := s.repo.Create(ctx, clinicID, p); err != nil {
		return nil, err
	}
	return p, nil
}

func (s *PatientService) Get(ctx context.Context, id int) (*models.Patient, error) {
	return s.repo.GetByID(ctx, id)
}

func (s *PatientService) List(ctx context.Context, clinicID int, query models.PatientListQuery) ([]*models.Patient, models.PaginationMeta, error) {
	patients, total, err := s.repo.List(ctx, clinicID, query)
	if err != nil {
		return nil, models.PaginationMeta{}, err
	}

	if query.Limit < 1 {
		query.Limit = 20
	}
	totalPages := (total + query.Limit - 1) / query.Limit
	meta := models.PaginationMeta{
		Page:       query.Page,
		Limit:      query.Limit,
		TotalItems: total,
		TotalPages: totalPages,
	}

	return patients, meta, nil
}

func (s *PatientService) Update(ctx context.Context, clinicID, id int, req models.UpdatePatientRequest) error {
	_ = clinicID
	updates := make(map[string]interface{})

	if req.Name != "" {
		updates["name"] = req.Name
	}
	if req.Species != "" {
		updates["species"] = req.Species
	}
	if req.Breed != "" {
		updates["breed"] = req.Breed
	}
	if req.DateOfBirth != "" {
		updates["date_of_birth"] = req.DateOfBirth
	}
	if req.Weight > 0 {
		updates["weight"] = req.Weight
	}
	if req.Status != "" {
		updates["status"] = req.Status
	}

	return s.repo.Update(ctx, id, updates)
}

func (s *PatientService) Delete(ctx context.Context, id int) error {
	return s.repo.Delete(ctx, id)
}

// GenerateMRN is a documented helper used by the repo's INSERT path; the controller layer
// shouldn't need to call it directly. Format: PT-YYYY-NNNN per CONTEXT.md.
// Kept here as a service-layer constant so the format has a single source of truth.
//
//nolint:unused // used via _ = GenerateMRN
func GenerateMRN(year int, seq int) string {
	return fmt.Sprintf("PT-%04d-%04d", year, seq)
}

var _ = GenerateMRN // silence unused for non-referrers
