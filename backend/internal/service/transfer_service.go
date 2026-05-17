package service

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/vet-clinic/api/internal/models"
	"github.com/vet-clinic/api/internal/repository"
)

type TransferService struct {
	transferRepo *repository.TransferRepository
	visitRepo    *repository.VisitRepository
	patientRepo  *repository.PatientRepository
}

func NewTransferService(transferRepo *repository.TransferRepository, visitRepo *repository.VisitRepository, patientRepo *repository.PatientRepository) *TransferService {
	return &TransferService{
		transferRepo: transferRepo,
		visitRepo:    visitRepo,
		patientRepo:  patientRepo,
	}
}

func (s *TransferService) Create(ctx context.Context, clinicID, userID int, req models.CreateTransferRequest) (*models.CaseTransfer, error) {
	sourceVisit, err := s.visitRepo.GetByID(ctx, req.SourceVisitID)
	if err != nil {
		return nil, fmt.Errorf("source visit not found: %w", err)
	}

	pet, err := s.patientRepo.GetByID(ctx, req.PetID)
	if err != nil {
		return nil, fmt.Errorf("pet not found: %w", err)
	}

	var vitals map[string]any
	if len(sourceVisit.Vitals) > 0 {
		json.Unmarshal(sourceVisit.Vitals, &vitals)
	}

	var medications []models.MedicationItem
	if len(sourceVisit.Medications) > 0 {
		json.Unmarshal(sourceVisit.Medications, &medications)
	}

	pastVisits, _, _ := s.visitRepo.List(ctx, clinicID, models.VisitListQuery{
		PetID: req.PetID,
		Limit: 10,
	})

	var history []models.HistoryItem
	for _, v := range pastVisits {
		if v.ID == req.SourceVisitID {
			continue
		}
		var diag string
		if v.FinalDiagnosis.Valid {
			diag = v.FinalDiagnosis.String
		} else if v.DifferentialDiagnosis.Valid {
			diag = v.DifferentialDiagnosis.String
		}
		var treat string
		if v.Treatment.Valid {
			treat = v.Treatment.String
		}
		if diag != "" || treat != "" {
			history = append(history, models.HistoryItem{
				Date:      v.CreatedAt.Format("2006-01-02"),
				Diagnosis: diag,
				Treatment: treat,
				Clinic:    "VetCare Clinic",
			})
		}
	}

	transfer := &models.CaseTransfer{
		PetID:          req.PetID,
		SourceVisitID:  req.SourceVisitID,
		PetName:        pet.Name,
		OwnerName:      pet.OwnerName,
		OwnerPhone:     models.NewNullString(pet.OwnerPhone),
		ReferralClinic: req.ReferralClinic,
		ReferralReason: req.ReferralReason,
		TransferData: models.TransferData{
			PetInfo: models.PetInfoTransfer{
				Name:    pet.Name,
				Species: pet.Species,
				Breed:   pet.Breed.String,
				Age:     pet.Age.Float64,
				Weight:  pet.Weight.Float64,
			},
			VisitInfo: models.VisitInfoTransfer{
				Date:           sourceVisit.CreatedAt.Format("2006-01-02"),
				Type:           sourceVisit.Type,
				Purpose:        sourceVisit.Purpose,
				ChiefComplaint: sourceVisit.ChiefComplaint.String,
				Examination:    sourceVisit.Examination.String,
				AssignedVet:    sourceVisit.AssignedVetName.String,
			},
			Vitals:      vitals,
			Diagnosis:   sourceVisit.FinalDiagnosis.String,
			Treatment:   sourceVisit.Treatment.String,
			Medications: medications,
			History:     history,
		},
	}

	if err := s.transferRepo.Create(ctx, clinicID, userID, transfer); err != nil {
		return nil, err
	}

	return transfer, nil
}

func (s *TransferService) Get(ctx context.Context, id int) (*models.CaseTransfer, error) {
	return s.transferRepo.GetByID(ctx, id)
}

func (s *TransferService) GetByShareToken(ctx context.Context, token string) (*models.CaseTransfer, error) {
	return s.transferRepo.GetByShareToken(ctx, token)
}

func (s *TransferService) List(ctx context.Context, clinicID int, query models.TransferListQuery) ([]*models.CaseTransfer, models.PaginationMeta, error) {
	transfers, total, err := s.transferRepo.List(ctx, clinicID, query)
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

	return transfers, meta, nil
}

func (s *TransferService) MarkSent(ctx context.Context, id int) error {
	return s.transferRepo.UpdateStatus(ctx, id, "sent")
}

func (s *TransferService) MarkReceived(ctx context.Context, id int) error {
	return s.transferRepo.UpdateStatus(ctx, id, "received")
}
