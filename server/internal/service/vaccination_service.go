package service

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/project-computer/groundwork/server/internal/models"
)

// VaccineProtocolRepo is the read-only surface for the global vaccine_protocols table.
type VaccineProtocolRepo interface {
	List(ctx context.Context) ([]models.VaccineProtocol, error)
	GetByName(ctx context.Context, name, species string) (*models.VaccineProtocol, error)
}

// VaccinationRepo is the persistent surface for vaccination records.
type VaccinationRepo interface {
	Create(ctx context.Context, clinicID int, v *models.Vaccination) error
	GetByID(ctx context.Context, id int) (*models.Vaccination, error)
	List(ctx context.Context, clinicID int, q models.VaccinationListQuery) ([]*models.Vaccination, int, error)
	Delete(ctx context.Context, id int) error
}

// PatientLookup is the minimal surface needed to confirm a patient exists before
// attaching a vaccination to them. Implemented by repository.PatientRepository in
// main.go, or by an in-memory fake in tests.
type PatientLookup interface {
	PatientSpecies(ctx context.Context, clinicID, patientID int) (string, error)
}

type VaccinationService struct {
	repo      VaccinationRepo
	protocols VaccineProtocolRepo
	patients  PatientLookup
}

func NewVaccinationService(repo VaccinationRepo, protocols VaccineProtocolRepo, patients PatientLookup) *VaccinationService {
	return &VaccinationService{repo: repo, protocols: protocols, patients: patients}
}

// Create applies the auto-calc next_due_date rule per slice 0005 acceptance: a known
// protocol name fills the date; an unknown name leaves it null (override-only path).
func (s *VaccinationService) Create(ctx context.Context, clinicID int, req models.CreateVaccinationRequest, userID int) (*models.Vaccination, error) {
	if req.PatientID == 0 {
		return nil, errors.New("patientId is required")
	}
	if strings.TrimSpace(req.VaccineName) == "" {
		return nil, errors.New("vaccineName is required")
	}

	administered, err := time.Parse("2006-01-02", req.AdministeredDate)
	if err != nil {
		return nil, errors.New("administeredDate must be YYYY-MM-DD")
	}

	species, err := s.patients.PatientSpecies(ctx, clinicID, req.PatientID)
	if err != nil {
		return nil, errors.New("patient not found")
	}

	v := &models.Vaccination{
		PatientID:        req.PatientID,
		VaccineName:      strings.TrimSpace(req.VaccineName),
		AdministeredDate: administered,
	}

	if req.VisitID > 0 {
		v.VisitID = models.NewNullInt32(int32(req.VisitID))
	}
	if req.AdministeredByVetID > 0 {
		v.AdministeredByVetID = models.NewNullInt32(int32(req.AdministeredByVetID))
	} else if userID > 0 {
		v.AdministeredByVetID = models.NewNullInt32(int32(userID))
	}
	if req.Manufacturer != "" {
		v.Manufacturer = models.NewNullString(req.Manufacturer)
	}
	if req.LotNumber != "" {
		v.LotNumber = models.NewNullString(req.LotNumber)
	}
	if req.Notes != "" {
		v.Notes = models.NewNullString(req.Notes)
	}

	// Auto-calc next_due_date from protocol if user didn't provide one.
	if strings.TrimSpace(req.NextDueDate) == "" {
		proto, err := s.protocols.GetByName(ctx, req.VaccineName, species)
		if err == nil {
			next := administered.AddDate(0, 0, proto.DefaultIntervalDays)
			v.NextDueDate.Time = next
			v.NextDueDate.Valid = true
		}
	} else {
		parsed, perr := time.Parse("2006-01-02", req.NextDueDate)
		if perr != nil {
			return nil, errors.New("nextDueDate must be YYYY-MM-DD when provided")
		}
		v.NextDueDate.Time = parsed
		v.NextDueDate.Valid = true
	}

	if err := s.repo.Create(ctx, clinicID, v); err != nil {
		return nil, err
	}
	return s.repo.GetByID(ctx, v.ID)
}

// ListByPatient returns vaccinations for one patient, newest first.
func (s *VaccinationService) ListByPatient(ctx context.Context, clinicID, patientID int) ([]*models.Vaccination, error) {
	out, _, err := s.repo.List(ctx, clinicID, models.VaccinationListQuery{PatientID: patientID, Limit: 200})
	return out, err
}

func (s *VaccinationService) List(ctx context.Context, clinicID int, q models.VaccinationListQuery) ([]*models.Vaccination, int, error) {
	return s.repo.List(ctx, clinicID, q)
}

func (s *VaccinationService) Get(ctx context.Context, id int) (*models.Vaccination, error) {
	return s.repo.GetByID(ctx, id)
}

func (s *VaccinationService) Delete(ctx context.Context, id int) error {
	return s.repo.Delete(ctx, id)
}

func (s *VaccinationService) ListProtocols(ctx context.Context) ([]models.VaccineProtocol, error) {
	return s.protocols.List(ctx)
}
