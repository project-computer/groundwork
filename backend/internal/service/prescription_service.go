package service

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/vet-clinic/api/internal/models"
	"github.com/vet-clinic/api/internal/repository"
)

type PrescriptionService struct {
	repo *repository.PrescriptionRepository
}

func NewPrescriptionService(repo *repository.PrescriptionRepository) *PrescriptionService {
	return &PrescriptionService{repo: repo}
}

func (s *PrescriptionService) Create(ctx context.Context, clinicID int, req models.CreatePrescriptionRequest) (*models.Prescription, error) {
	// Parse date
	date, err := time.Parse("2006-01-02", req.Date)
	if err != nil {
		return nil, errors.New("invalid date format, use YYYY-MM-DD")
	}

	// Marshal medicines to JSON
	medicinesJSON, err := json.Marshal(req.Medicines)
	if err != nil {
		return nil, errors.New("failed to marshal medicines")
	}

	rx := &models.Prescription{
		PetID:     req.PetID,
		PetName:   req.PetName,
		OwnerName: req.OwnerName,
		Date:      date,
		Medicines: medicinesJSON,
	}

	// Set optional fields
	if req.VisitID > 0 {
		rx.VisitID = models.NewNullInt32(int32(req.VisitID))
	}

	if req.VeterinarianID > 0 {
		rx.VeterinarianID = models.NewNullInt32(int32(req.VeterinarianID))
		if req.VeterinarianName != "" {
			rx.VeterinarianName = models.NewNullString(req.VeterinarianName)
		}
	}

	if req.Diagnosis != "" {
		rx.Diagnosis = models.NewNullString(req.Diagnosis)
	}

	if req.Notes != "" {
		rx.Notes = models.NewNullString(req.Notes)
	}

	err = s.repo.Create(ctx, clinicID, rx)
	if err != nil {
		return nil, err
	}

	return rx, nil
}

func (s *PrescriptionService) Get(ctx context.Context, id int) (*models.Prescription, error) {
	return s.repo.GetByID(ctx, id)
}

func (s *PrescriptionService) List(ctx context.Context, clinicID int, query models.PrescriptionListQuery) ([]*models.Prescription, models.PaginationMeta, error) {
	prescriptions, total, err := s.repo.List(ctx, clinicID, query)
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

	return prescriptions, meta, nil
}
