package service

import (
	"context"
	"database/sql"

	"github.com/vet-clinic/api/internal/models"
	"github.com/vet-clinic/api/internal/repository"
)

type PatientService struct {
	repo *repository.PatientRepository
}

func NewPatientService(repo *repository.PatientRepository) *PatientService {
	return &PatientService{repo: repo}
}

func (s *PatientService) Create(ctx context.Context, clinicID int, req models.CreatePetRequest) (*models.Pet, error) {
	pet := &models.Pet{
		Name:       req.Name,
		Species:    req.Species,
		OwnerName:  req.OwnerName,
		OwnerPhone: req.OwnerPhone,
		Status:     "Active",
	}

	if req.Breed != "" {
		pet.Breed.String = req.Breed
		pet.Breed.Valid = true
	}
	if req.Age > 0 {
		pet.Age.Float64 = req.Age
		pet.Age.Valid = true
	}
	if req.Weight > 0 {
		pet.Weight.Float64 = req.Weight
		pet.Weight.Valid = true
	}
	if req.OwnerEmail != "" {
		pet.OwnerEmail.String = req.OwnerEmail
		pet.OwnerEmail.Valid = true
	}
	if req.OwnerNationalID != "" {
		pet.OwnerNationalID.String = req.OwnerNationalID
		pet.OwnerNationalID.Valid = true
	}
	if req.OwnerNotes != "" {
		pet.OwnerNotes.String = req.OwnerNotes
		pet.OwnerNotes.Valid = true
	}
	if req.OwnerLabel != "" {
		pet.OwnerLabel.String = req.OwnerLabel
		pet.OwnerLabel.Valid = true
	}

	if err := s.repo.Create(ctx, clinicID, pet); err != nil {
		return nil, err
	}

	return pet, nil
}

func (s *PatientService) Get(ctx context.Context, id int) (*models.Pet, error) {
	return s.repo.GetByID(ctx, id)
}

func (s *PatientService) List(ctx context.Context, clinicID int, query models.PetListQuery) ([]*models.Pet, models.PaginationMeta, error) {
	pets, total, err := s.repo.List(ctx, clinicID, query)
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

	return pets, meta, nil
}

func (s *PatientService) Update(ctx context.Context, id int, req models.UpdatePetRequest) error {
	updates := make(map[string]interface{})

	if req.Name != "" {
		updates["name"] = req.Name
	}
	if req.Species != "" {
		updates["species"] = req.Species
	}
	if req.Breed != "" {
		updates["breed"] = sql.NullString{String: req.Breed, Valid: true}
	}
	if req.Age > 0 {
		updates["age"] = sql.NullFloat64{Float64: req.Age, Valid: true}
	}
	if req.Weight > 0 {
		updates["weight"] = sql.NullFloat64{Float64: req.Weight, Valid: true}
	}
	if req.OwnerName != "" {
		updates["owner_name"] = req.OwnerName
	}
	if req.OwnerPhone != "" {
		updates["owner_phone"] = req.OwnerPhone
	}
	if req.OwnerEmail != "" {
		updates["owner_email"] = sql.NullString{String: req.OwnerEmail, Valid: true}
	}
	if req.OwnerNationalID != "" {
		updates["owner_national_id"] = sql.NullString{String: req.OwnerNationalID, Valid: true}
	}
	if req.OwnerNotes != "" {
		updates["owner_notes"] = sql.NullString{String: req.OwnerNotes, Valid: true}
	}
	if req.OwnerLabel != "" {
		updates["owner_label"] = sql.NullString{String: req.OwnerLabel, Valid: true}
	}
	if req.Status != "" {
		updates["status"] = req.Status
	}

	return s.repo.Update(ctx, id, updates)
}

func (s *PatientService) Delete(ctx context.Context, id int) error {
	return s.repo.Delete(ctx, id)
}
