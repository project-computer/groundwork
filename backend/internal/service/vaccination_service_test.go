package service

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"

	"github.com/vet-clinic/api/internal/models"
)

type fakeVaccinationRepo struct {
	got []*models.Vaccination
	err error

	// Persists the most recently Create'd row so GetByID after Create returns it.
	created *models.Vaccination
}

func (f *fakeVaccinationRepo) Create(_ context.Context, clinicID int, v *models.Vaccination) error {
	if f.err != nil {
		return f.err
	}
	v.ID = 42
	v.CreatedAt = time.Now()
	v.UpdatedAt = v.CreatedAt
	v.ClinicID = clinicID
	f.created = v
	return nil
}

func (f *fakeVaccinationRepo) GetByID(_ context.Context, id int) (*models.Vaccination, error) {
	if f.err != nil {
		return nil, f.err
	}
	if f.created != nil {
		return f.created, nil
	}
	return &models.Vaccination{ID: id, ClinicID: 1, PatientID: 7, VaccineName: "Rabies"}, nil
}

func (f *fakeVaccinationRepo) List(_ context.Context, _ int, _ models.VaccinationListQuery) ([]*models.Vaccination, int, error) {
	return f.got, len(f.got), nil
}

func (f *fakeVaccinationRepo) Delete(_ context.Context, _ int) error {
	return f.err
}

type fakeVaccineProtocolRepo struct {
	byName map[string]*models.VaccineProtocol // key = name+"::"+species
}

func (f *fakeVaccineProtocolRepo) GetByName(_ context.Context, name, species string) (*models.VaccineProtocol, error) {
	p, ok := f.byName[name+"::"+species]
	if !ok {
		return nil, errors.New("not found")
	}
	return p, nil
}

func (f *fakeVaccineProtocolRepo) List(_ context.Context) ([]models.VaccineProtocol, error) {
	out := make([]models.VaccineProtocol, 0, len(f.byName))
	for _, p := range f.byName {
		out = append(out, *p)
	}
	return out, nil
}

type fakePatientLookup struct {
	species string
	err     error
}

func (f *fakePatientLookup) PatientSpecies(_ context.Context, _, _ int) (string, error) {
	return f.species, f.err
}

func TestVaccinationService_AutoFillsNextDueForKnownProtocol(t *testing.T) {
	protocols := &fakeVaccineProtocolRepo{
		byName: map[string]*models.VaccineProtocol{
			"Rabies::dog": {ID: 1, Name: "Rabies", Species: "dog", DefaultIntervalDays: 365},
		},
	}
	patients := &fakePatientLookup{species: "dog"}
	repo := &fakeVaccinationRepo{}
	svc := NewVaccinationService(repo, protocols, patients)

	out, err := svc.Create(context.Background(), 1, models.CreateVaccinationRequest{
		PatientID:        7,
		VaccineName:      "Rabies",
		AdministeredDate: "2026-01-15",
		// NextDueDate intentionally empty — service must auto-fill
	}, 0)
	assert.NoError(t, err)
	assert.True(t, out.NextDueDate.Valid, "next_due_date should be populated from the protocol")
	assert.Equal(t, 2027, out.NextDueDate.Time.Year(), "365-day interval from 2026-01-15 should land in 2027")
	assert.Equal(t, time.January, out.NextDueDate.Time.Month())
	assert.Equal(t, 15, out.NextDueDate.Time.Day())
}

func TestVaccinationService_NextDueNullForUnknownVaccine(t *testing.T) {
	protocols := &fakeVaccineProtocolRepo{byName: map[string]*models.VaccineProtocol{}}
	patients := &fakePatientLookup{species: "dog"}
	repo := &fakeVaccinationRepo{}
	svc := NewVaccinationService(repo, protocols, patients)

	out, err := svc.Create(context.Background(), 1, models.CreateVaccinationRequest{
		PatientID:        7,
		VaccineName:      "Made-Up Vaccine",
		AdministeredDate: "2026-01-15",
	}, 0)
	assert.NoError(t, err)
	assert.False(t, out.NextDueDate.Valid, "unknown vaccine should leave next_due_date null (override-only path)")
}

func TestVaccinationService_ExplicitNextDueOverridesProtocol(t *testing.T) {
	protocols := &fakeVaccineProtocolRepo{
		byName: map[string]*models.VaccineProtocol{
			"Rabies::dog": {ID: 1, Name: "Rabies", Species: "dog", DefaultIntervalDays: 365},
		},
	}
	patients := &fakePatientLookup{species: "dog"}
	repo := &fakeVaccinationRepo{}
	svc := NewVaccinationService(repo, protocols, patients)

	out, err := svc.Create(context.Background(), 1, models.CreateVaccinationRequest{
		PatientID:        7,
		VaccineName:      "Rabies",
		AdministeredDate: "2026-01-15",
		NextDueDate:      "2026-09-01", // user override
	}, 0)
	assert.NoError(t, err)
	assert.True(t, out.NextDueDate.Valid)
	assert.Equal(t, 2026, out.NextDueDate.Time.Year())
	assert.Equal(t, time.September, out.NextDueDate.Time.Month())
}

func TestVaccinationService_RejectsMissingFields(t *testing.T) {
	protocols := &fakeVaccineProtocolRepo{byName: map[string]*models.VaccineProtocol{}}
	patients := &fakePatientLookup{species: "dog"}
	repo := &fakeVaccinationRepo{}
	svc := NewVaccinationService(repo, protocols, patients)

	_, err := svc.Create(context.Background(), 1, models.CreateVaccinationRequest{
		PatientID:        0,
		VaccineName:      "Rabies",
		AdministeredDate: "2026-01-15",
	}, 0)
	assert.Error(t, err)

	_, err = svc.Create(context.Background(), 1, models.CreateVaccinationRequest{
		PatientID:        7,
		VaccineName:      "",
		AdministeredDate: "2026-01-15",
	}, 0)
	assert.Error(t, err)

	_, err = svc.Create(context.Background(), 1, models.CreateVaccinationRequest{
		PatientID:        7,
		VaccineName:      "Rabies",
		AdministeredDate: "garbage",
	}, 0)
	assert.Error(t, err)
}

func TestVaccinationService_RejectsUnknownPatient(t *testing.T) {
	protocols := &fakeVaccineProtocolRepo{byName: map[string]*models.VaccineProtocol{}}
	patients := &fakePatientLookup{err: errors.New("no such patient")}
	repo := &fakeVaccinationRepo{}
	svc := NewVaccinationService(repo, protocols, patients)

	_, err := svc.Create(context.Background(), 1, models.CreateVaccinationRequest{
		PatientID:        999,
		VaccineName:      "Rabies",
		AdministeredDate: "2026-01-15",
	}, 0)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "patient not found")
}
