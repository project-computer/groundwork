package service

import (
	"context"
	"database/sql"

	"github.com/project-computer/groundwork/server/internal/models"
	"github.com/project-computer/groundwork/server/internal/repository"
)

type OwnerService struct {
	repo *repository.OwnerRepository
}

func NewOwnerService(repo *repository.OwnerRepository) *OwnerService {
	return &OwnerService{repo: repo}
}

func (s *OwnerService) Create(ctx context.Context, clinicID int, req models.CreateOwnerRequest) (*models.Owner, error) {
	o := &models.Owner{
		ClinicID:         clinicID,
		Name:             req.Name,
		Phone:            req.Phone,
		SecondaryContact: req.SecondaryContact,
	}
	if req.Email != "" {
		o.Email.String = req.Email
		o.Email.Valid = true
	}
	if req.NationalID != "" {
		o.NationalID.String = req.NationalID
		o.NationalID.Valid = true
	}
	if req.Notes != "" {
		o.Notes.String = req.Notes
		o.Notes.Valid = true
	}

	if err := s.repo.Create(ctx, clinicID, o); err != nil {
		return nil, err
	}
	return o, nil
}

func (s *OwnerService) Get(ctx context.Context, clinicID, id int) (*models.Owner, error) {
	return s.repo.GetByID(ctx, clinicID, id)
}

func (s *OwnerService) List(ctx context.Context, clinicID int, query models.OwnerListQuery) ([]*models.Owner, models.PaginationMeta, error) {
	owners, total, err := s.repo.List(ctx, clinicID, query)
	if err != nil {
		return nil, models.PaginationMeta{}, err
	}
	totalPages := (total + query.Limit - 1) / query.Limit
	return owners, models.PaginationMeta{
		Page:       query.Page,
		Limit:      query.Limit,
		TotalItems: total,
		TotalPages: totalPages,
	}, nil
}

func (s *OwnerService) Update(ctx context.Context, clinicID, id int, req models.UpdateOwnerRequest) error {
	updates := map[string]interface{}{}
	if req.Name != "" {
		updates["name"] = req.Name
	}
	if req.Phone != "" {
		updates["phone"] = req.Phone
	}
	if req.Email != "" {
		updates["email"] = sql.NullString{String: req.Email, Valid: true}
	}
	if req.NationalID != "" {
		updates["national_id"] = sql.NullString{String: req.NationalID, Valid: true}
	}
	if req.Notes != "" {
		updates["notes"] = sql.NullString{String: req.Notes, Valid: true}
	}
	if req.SecondaryContact != nil {
		updates["secondary_contact"] = req.SecondaryContact
	}
	if len(updates) == 0 {
		return nil
	}
	return s.repo.Update(ctx, clinicID, id, updates)
}

func (s *OwnerService) Delete(ctx context.Context, clinicID, id int) error {
	return s.repo.Delete(ctx, clinicID, id)
}

func (s *OwnerService) ListPatientIDs(ctx context.Context, clinicID, ownerID int) ([]int, error) {
	return s.repo.ListPatientIDs(ctx, clinicID, ownerID)
}
