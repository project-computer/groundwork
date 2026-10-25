package service

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/vet-clinic/api/internal/models"
	"github.com/vet-clinic/api/internal/repository"
)

type AppointmentService struct {
	repo        *repository.AppointmentRepository
	visitRepo   *repository.VisitRepository
}

func NewAppointmentService(repo *repository.AppointmentRepository, visitRepo *repository.VisitRepository) *AppointmentService {
	return &AppointmentService{repo: repo, visitRepo: visitRepo}
}

func (s *AppointmentService) Create(ctx context.Context, clinicID, userID int, req models.CreateAppointmentRequest) (*models.Appointment, error) {
	// Parse date
	date, err := time.Parse("2006-01-02", req.Date)
	if err != nil {
		return nil, errors.New("invalid date format, use YYYY-MM-DD")
	}

	// Validate time format
	_, err = time.Parse("15:04:05", req.Time)
	if err != nil {
		return nil, errors.New("invalid time format, use HH:MM:SS")
	}

	// Check if date is not in the past
	if date.Before(time.Now().Truncate(24 * time.Hour)) {
		return nil, errors.New("cannot create appointment in the past")
	}

	apt := &models.Appointment{
		PatientID:   req.PatientID,
		PatientName: req.PatientName,
		OwnerName:   req.OwnerName,
		Date:        date,
		Time:        req.Time,
		Type:        req.Type,
		Status:      "Scheduled",
		CreatedBy:   userID,
	}

	// Set optional fields
	if req.Notes != "" {
		apt.Notes = models.NewNullString(req.Notes)
	}

	if req.VeterinarianID > 0 {
		apt.VeterinarianID = models.NewNullInt32(int32(req.VeterinarianID))
		if req.VeterinarianName != "" {
			apt.VeterinarianName = models.NewNullString(req.VeterinarianName)
		}
	}

	err = s.repo.Create(ctx, clinicID, apt)
	if err != nil {
		return nil, err
	}

	return apt, nil
}

func (s *AppointmentService) Get(ctx context.Context, id int) (*models.Appointment, error) {
	return s.repo.GetByID(ctx, id)
}

func (s *AppointmentService) List(ctx context.Context, clinicID int, query models.AppointmentListQuery) ([]*models.Appointment, models.PaginationMeta, error) {
	appointments, total, err := s.repo.List(ctx, clinicID, query)
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

	return appointments, meta, nil
}

func (s *AppointmentService) Update(ctx context.Context, id int, req models.UpdateAppointmentRequest) error {
	updates := make(map[string]interface{})

	if req.Date != "" {
		date, err := time.Parse("2006-01-02", req.Date)
		if err != nil {
			return errors.New("invalid date format, use YYYY-MM-DD")
		}
		updates["date"] = date
	}

	if req.Time != "" {
		_, err := time.Parse("15:04:05", req.Time)
		if err != nil {
			return errors.New("invalid time format, use HH:MM:SS")
		}
		updates["time"] = req.Time
	}

	if req.Type != "" {
		updates["type"] = req.Type
	}

	if req.Status != "" {
		// Validate status
		validStatuses := []string{"Scheduled", "Confirmed", "Checked-In", "Completed", "Cancelled", "No-Show"}
		valid := false
		for _, status := range validStatuses {
			if req.Status == status {
				valid = true
				break
			}
		}
		if !valid {
			return errors.New("invalid status")
		}
		updates["status"] = req.Status
	}

	if req.Notes != "" {
		updates["notes"] = models.NewNullString(req.Notes)
	}

	if req.VeterinarianID > 0 {
		updates["veterinarian_id"] = models.NewNullInt32(int32(req.VeterinarianID))
		if req.VeterinarianName != "" {
			updates["veterinarian_name"] = models.NewNullString(req.VeterinarianName)
		}
	}

	return s.repo.Update(ctx, id, updates)
}

func (s *AppointmentService) Delete(ctx context.Context, id int) error {
	// Check if appointment exists
	apt, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return err
	}

	// Don't allow deleting checked-in or completed appointments
	if apt.Status == "Checked-In" || apt.Status == "Completed" {
		return errors.New("cannot delete checked-in or completed appointments")
	}

	return s.repo.Delete(ctx, id)
}

func (s *AppointmentService) GetByDate(ctx context.Context, clinicID int, date time.Time) ([]*models.Appointment, error) {
	return s.repo.GetByDate(ctx, clinicID, date)
}

func (s *AppointmentService) GetTodayAppointments(ctx context.Context, clinicID int) ([]*models.Appointment, error) {
	today := time.Now().Truncate(24 * time.Hour)
	return s.repo.GetByDate(ctx, clinicID, today)
}

func (s *AppointmentService) CheckIn(ctx context.Context, id int) error {
	apt, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return err
	}

	err = s.repo.UpdateStatus(ctx, id, "Checked-In")
	if err != nil {
		return err
	}

	visit := &models.Visit{
		PetID:        apt.PatientID,
		PetName:      apt.PatientName,
		OwnerName:    apt.OwnerName,
		Type:         "OPD",
		Purpose:      "Appointment Only",
		Steps:        []byte("[]"),
		Vitals:       []byte("{}"),
		Medications:  []byte("[]"),
	}
	if apt.VeterinarianID.Valid {
		visit.AssignedVetID = apt.VeterinarianID
		visit.AssignedVetName = apt.VeterinarianName
	}
	visit.AppointmentID = models.NewNullInt32(int32(apt.ID))

	err = s.visitRepo.Create(ctx, apt.ClinicID, visit)
	if err != nil {
		return fmt.Errorf("failed to create visit from appointment: %w", err)
	}

	return nil
}

func (s *AppointmentService) Cancel(ctx context.Context, id int) error {
	return s.repo.UpdateStatus(ctx, id, "Cancelled")
}

func (s *AppointmentService) Complete(ctx context.Context, id int) error {
	return s.repo.UpdateStatus(ctx, id, "Completed")
}
