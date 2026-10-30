package service

import (
	"context"
	"fmt"
	"time"

	"github.com/vet-clinic/api/internal/models"
)

// ReminderRepo is the persistent surface the ReminderService needs
// (slices 0011 + 0012). Implemented by repository.NotificationRepository.
type ReminderRepo interface {
	GetClinicReminderWindow(ctx context.Context, clinicID int) ([]int, error)
	SetClinicReminderWindow(ctx context.Context, clinicID int, window []int) error
	GetDueVaccinations(ctx context.Context, clinicID, offsetDays int) ([]*models.ReminderDueVaccination, error)
	ReminderDedupExists(ctx context.Context, clinicID, vaccinationID, offsetDays int, sendDate string) (bool, error)
}

// VaccinationReminderSender is what the scheduler uses to dispatch one reminder.
// Implemented by *NotificationService; faked in tests.
type VaccinationReminderSender interface {
	SendVaccinationReminder(ctx context.Context, clinicID int, v *models.ReminderDueVaccination, offsetDays int, sendDate, message string) (*models.NotificationLog, error)
}

// ReminderService scans vaccinations due within the clinic's cadence window and
// dispatches one reminder per (vaccination, offset, day). Idempotent via the dedup
// key, so calling RunOnce twice on the same day produces no duplicates (slice 0011).
type ReminderService struct {
	repo   ReminderRepo
	sender VaccinationReminderSender
	now    func() time.Time
}

func NewReminderService(repo ReminderRepo, sender VaccinationReminderSender) *ReminderService {
	return &ReminderService{repo: repo, sender: sender, now: time.Now}
}

// ReminderMessage composes the owner-facing text per slice 0011.
func ReminderMessage(patientName, vaccineName string, due time.Time) string {
	return fmt.Sprintf("Your pet %s is due for %s on %s. Please contact the clinic to book a visit.",
		patientName, vaccineName, due.Format("2006-01-02"))
}

// Window returns the clinic's configured cadence (admin UI, slice 0012).
func (s *ReminderService) Window(ctx context.Context, clinicID int) ([]int, error) {
	return s.repo.GetClinicReminderWindow(ctx, clinicID)
}

// SetWindow writes the clinic's cadence (slice 0012). Default stays [7, 0, -7].
func (s *ReminderService) SetWindow(ctx context.Context, clinicID int, window []int) error {
	if len(window) == 0 {
		window = []int{7, 0, -7}
	}
	return s.repo.SetClinicReminderWindow(ctx, clinicID, window)
}

// RunOnce scans each cadence offset and dispatches due reminders. Returns the
// number dispatched. Individual send failures are logged by the
// NotificationService and do not abort the batch.
func (s *ReminderService) RunOnce(ctx context.Context, clinicID int) (int, error) {
	window, err := s.repo.GetClinicReminderWindow(ctx, clinicID)
	if err != nil {
		return 0, err
	}
	today := s.now().Format("2006-01-02")
	dispatched := 0

	for _, offset := range window {
		due, err := s.repo.GetDueVaccinations(ctx, clinicID, offset)
		if err != nil {
			return dispatched, err
		}
		for _, v := range due {
			exists, err := s.repo.ReminderDedupExists(ctx, clinicID, v.VaccinationID, offset, today)
			if err != nil {
				return dispatched, err
			}
			if exists {
				continue // idempotent: already reminded for this touch + day
			}
			_, err = s.sender.SendVaccinationReminder(ctx, clinicID, v, offset, today, ReminderMessage(v.PatientName, v.VaccineName, v.NextDueDate))
			if err != nil {
				continue // opted-out / unreachable owner: skip, no log row by design
			}
			dispatched++
		}
	}
	return dispatched, nil
}
