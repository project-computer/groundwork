package service

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"

	"github.com/vet-clinic/api/internal/models"
)

type fakeReminderRepo struct {
	window    []int
	due       map[int][]*models.ReminderDueVaccination // offset → rows
	dedup     map[string]bool                          // "vid:offset:sendDate"
	windowSet [][]int
}

func newFakeReminderRepo() *fakeReminderRepo {
	return &fakeReminderRepo{
		window: []int{7, 0, -7},
		due:    map[int][]*models.ReminderDueVaccination{},
		dedup:  map[string]bool{},
	}
}

func (f *fakeReminderRepo) GetClinicReminderWindow(_ context.Context, _ int) ([]int, error) {
	return f.window, nil
}

func (f *fakeReminderRepo) SetClinicReminderWindow(_ context.Context, _ int, w []int) error {
	f.window = w
	f.windowSet = append(f.windowSet, w)
	return nil
}

func (f *fakeReminderRepo) GetDueVaccinations(_ context.Context, _ int, offset int) ([]*models.ReminderDueVaccination, error) {
	return f.due[offset], nil
}

func (f *fakeReminderRepo) ReminderDedupExists(_ context.Context, _, vid, offset int, sendDate string) (bool, error) {
	return f.dedup[key(vid, offset, sendDate)], nil
}

func key(vid, offset int, day string) string {
	return models.ReminderDedupKey(vid, offset, day)
}

type recordingSender struct {
	due            []*models.ReminderDueVaccination
	optOutOwnerIDs map[int]bool
	dedup          map[string]bool
}

func (r *recordingSender) SendVaccinationReminder(_ context.Context, _ int, v *models.ReminderDueVaccination, offsetDays int, sendDate, _ string) (*models.NotificationLog, error) {
	if r.optOutOwnerIDs[v.OwnerID] {
		return nil, errOptedOut
	}
	r.due = append(r.due, v)
	if r.dedup != nil {
		// Mirror production: the NotificationLog row written here IS the dedup source.
		r.dedup[models.ReminderDedupKey(v.VaccinationID, offsetDays, sendDate)] = true
	}
	return &models.NotificationLog{RefID: v.VaccinationID}, nil
}

func TestRunOnceDispatchesDueReminder(t *testing.T) {
	repo := newFakeReminderRepo()
	repo.due[0] = []*models.ReminderDueVaccination{{
		VaccinationID: 11, PatientName: "Mochi", VaccineName: "Rabies",
		NextDueDate: time.Now(), OwnerID: 3, Offset: 0,
	}}
	sender := &recordingSender{dedup: repo.dedup}
	svc := NewReminderService(repo, sender)

	n, err := svc.RunOnce(context.Background(), 1)
	assert.NoError(t, err)
	assert.Equal(t, 1, n)
	assert.Len(t, sender.due, 1)
	assert.Equal(t, "Mochi", sender.due[0].PatientName)
}

func TestRunOnceIsIdempotentPerDay(t *testing.T) {
	repo := newFakeReminderRepo()
	repo.due[0] = []*models.ReminderDueVaccination{{
		VaccinationID: 11, PatientName: "Mochi", VaccineName: "Rabies",
		NextDueDate: time.Now(), OwnerID: 3,
	}}
	sender := &recordingSender{dedup: repo.dedup}
	svc := NewReminderService(repo, sender)

	// First run dispatches and marks the dedup key.
	n, err := svc.RunOnce(context.Background(), 1)
	assert.NoError(t, err)
	assert.Equal(t, 1, n)
	for _, v := range repo.due[0] {
		repo.dedup[key(v.VaccinationID, v.Offset, svc.now().Format("2006-01-02"))] = true
	}

	// Second run same day: no duplicates (slice 0011 acceptance).
	n, err = svc.RunOnce(context.Background(), 1)
	assert.NoError(t, err)
	assert.Equal(t, 0, n)
	assert.Len(t, sender.due, 1)
}

func TestRunOnceSkipsOptedOutOwners(t *testing.T) {
	repo := newFakeReminderRepo()
	repo.due[0] = []*models.ReminderDueVaccination{{
		VaccinationID: 12, PatientName: "Luna", VaccineName: "FVRCP",
		NextDueDate: time.Now(), OwnerID: 9,
	}}
	sender := &recordingSender{optOutOwnerIDs: map[int]bool{9: true}}
	svc := NewReminderService(repo, sender)

	n, err := svc.RunOnce(context.Background(), 1)
	assert.NoError(t, err)
	assert.Equal(t, 0, n)
	assert.Empty(t, sender.due) // no log row for opted-out owners
}

func TestRunOnceMultiTouchCadence(t *testing.T) {
	repo := newFakeReminderRepo()
	// Slice 0012 acceptance: window [14, 7, 0, 7] → 4 touches accrue across days.
	repo.window = []int{14, 7, 0, 7}
	repo.due[14] = []*models.ReminderDueVaccination{{VaccinationID: 21, OwnerID: 1, PatientName: "A", VaccineName: "X"}}
	repo.due[7] = []*models.ReminderDueVaccination{{VaccinationID: 22, OwnerID: 1, PatientName: "B", VaccineName: "X"}}
	repo.due[0] = []*models.ReminderDueVaccination{{VaccinationID: 23, OwnerID: 1, PatientName: "C", VaccineName: "X"}}

	sender := &recordingSender{dedup: repo.dedup}
	svc := NewReminderService(repo, sender)

	n, err := svc.RunOnce(context.Background(), 1)
	assert.NoError(t, err)
	assert.Equal(t, 3, n) // one per present touch (vid 21@+14, 22@+7, 23@0)
	assert.Len(t, sender.due, 3)
}

func TestReminderMessage(t *testing.T) {
	due := time.Date(2026, 11, 2, 0, 0, 0, 0, time.UTC)
	msg := ReminderMessage("Mochi", "Rabies", due)
	assert.Contains(t, msg, "Mochi")
	assert.Contains(t, msg, "Rabies")
	assert.Contains(t, msg, "2026-11-02")
}
