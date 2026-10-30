package service

import (
	"context"
	"errors"

	"github.com/vet-clinic/api/internal/models"
	"github.com/vet-clinic/api/internal/repository"
)

// HistoryService assembles a patient's medical timeline (visits,
// prescriptions, bills and vaccinations). Every sub-list is clinic-scoped by
// its own repository, and the patient row itself is verified against the
// caller's clinic before anything is returned.
type HistoryService struct {
	patients      *repository.PatientRepository
	visits        *repository.VisitRepository
	prescriptions *repository.PrescriptionRepository
	bills         *repository.BillRepository
	vaccinations  *repository.VaccinationRepository
}

func NewHistoryService(
	patients *repository.PatientRepository,
	visits *repository.VisitRepository,
	prescriptions *repository.PrescriptionRepository,
	bills *repository.BillRepository,
	vaccinations *repository.VaccinationRepository,
) *HistoryService {
	return &HistoryService{
		patients:      patients,
		visits:        visits,
		prescriptions: prescriptions,
		bills:         bills,
		vaccinations:  vaccinations,
	}
}

const historyPageSize = 100

func (s *HistoryService) Get(ctx context.Context, clinicID, patientID int) (*models.PatientHistory, error) {
	patient, err := s.patients.GetByID(ctx, patientID)
	if err != nil {
		return nil, err
	}
	if patient.ClinicID != clinicID {
		return nil, errors.New("patient not found")
	}

	history := &models.PatientHistory{Patient: patient}

	visits, _, err := s.visits.List(ctx, clinicID, models.VisitListQuery{Page: 1, Limit: historyPageSize, PetID: patientID})
	if err != nil {
		return nil, err
	}
	history.Visits = visits

	prescriptions, _, err := s.prescriptions.List(ctx, clinicID, models.PrescriptionListQuery{Page: 1, Limit: historyPageSize, PetID: patientID})
	if err != nil {
		return nil, err
	}
	history.Prescriptions = prescriptions

	bills, _, err := s.bills.List(ctx, clinicID, models.BillListQuery{Page: 1, Limit: historyPageSize, PetID: patientID})
	if err != nil {
		return nil, err
	}
	history.Bills = bills

	vaccinations, _, err := s.vaccinations.List(ctx, clinicID, models.VaccinationListQuery{Page: 1, Limit: historyPageSize, PatientID: patientID})
	if err != nil {
		return nil, err
	}
	history.Vaccinations = vaccinations

	return history, nil
}
