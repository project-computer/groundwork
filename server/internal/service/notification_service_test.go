package service

import (
	"context"
	"errors"
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/vet-clinic/api/internal/models"
	"github.com/vet-clinic/api/internal/notifications"
)

type fakeOwnerLookup struct {
	owner *models.Owner
	err   error
}

func (f *fakeOwnerLookup) GetByID(_ context.Context, _, _ int) (*models.Owner, error) {
	return f.owner, f.err
}

type fakeNotificationLogRepo struct {
	rows        map[int]*models.NotificationLog
	next        int
	markSentErr error
}

func newFakeNotificationLogRepo() *fakeNotificationLogRepo {
	return &fakeNotificationLogRepo{rows: map[int]*models.NotificationLog{}, next: 500}
}

func (f *fakeNotificationLogRepo) Create(_ context.Context, clinicID int, n *models.NotificationLog) error {
	f.next++
	n.ID = f.next
	n.ClinicID = clinicID
	f.rows[n.ID] = n
	return nil
}

func (f *fakeNotificationLogRepo) MarkSent(_ context.Context, id int, externalID string) error {
	if f.markSentErr != nil {
		return f.markSentErr
	}
	f.rows[id].Status = "sent"
	f.rows[id].ExternalID = models.NewNullString(externalID)
	return nil
}

func (f *fakeNotificationLogRepo) MarkFailed(_ context.Context, id int, sendErr string) error {
	f.rows[id].Status = "failed"
	f.rows[id].Error = models.NewNullString(sendErr)
	return nil
}

func (f *fakeNotificationLogRepo) GetByID(_ context.Context, _, id int) (*models.NotificationLog, error) {
	if n, ok := f.rows[id]; ok {
		return n, nil
	}
	return nil, errors.New("not found")
}

func (f *fakeNotificationLogRepo) ListByOwner(_ context.Context, _, ownerID, _ int) ([]*models.NotificationLog, error) {
	var out []*models.NotificationLog
	for _, n := range f.rows {
		if n.RecipientOwnerID.Valid && int(n.RecipientOwnerID.Int32) == ownerID {
			out = append(out, n)
		}
	}
	return out, nil
}

type fakePrefsRepo struct{}

func (fakePrefsRepo) UpdateOwnerNotificationPrefs(_ context.Context, _, _ int, req *models.UpdateOwnerNotificationPrefsRequest) (*models.Owner, error) {
	return &models.Owner{ID: 1, NotifyOptOut: req.NotifyOptOut != nil && *req.NotifyOptOut}, nil
}

type stubNotifier struct {
	channel    string
	ok         bool
	sendErr    error
	gotContact string
	gotMessage string
}

func (s *stubNotifier) Channel() string  { return s.channel }
func (s *stubNotifier) Configured() bool { return s.ok }
func (s *stubNotifier) Send(_ context.Context, recipient, message string) (string, error) {
	s.gotContact = recipient
	s.gotMessage = message
	if s.sendErr != nil {
		return "", s.sendErr
	}
	return s.channel + "-ext-123", nil
}

func ownerFor(channel string) *models.Owner {
	o := &models.Owner{ID: 1, Name: "Somchai", Phone: "0812345678"}
	if channel == "line" {
		o.LineUserID = models.NewNullString("U123abc")
		o.PreferredChannel = models.NewNullString("line")
	}
	if channel == "email" {
		o.Email = models.NewNullString("somchai@example.com")
	}
	if channel == "sms" {
		o.PreferredChannel = models.NewNullString("sms")
	}
	return o
}

func adaptersFor(channels ...string) []notifications.Notifier {
	out := []notifications.Notifier{}
	for _, ch := range channels {
		out = append(out, &stubNotifier{channel: ch, ok: true})
	}
	return out
}

func TestResolveChannelPreferredWithFallback(t *testing.T) {
	// preferred=line, line present → line
	ch, contact, err := ResolveChannel(ownerFor("line"), map[string]bool{"line": true, "sms": true, "email": true})
	assert.NoError(t, err)
	assert.Equal(t, "line", ch)
	assert.Equal(t, "U123abc", contact)

	// preferred=line but no line_user_id → falls back to sms (phone present)
	o := ownerFor("line")
	o.LineUserID = models.NullString{}
	ch, contact, err = ResolveChannel(o, map[string]bool{"sms": true, "email": true})
	assert.NoError(t, err)
	assert.Equal(t, "sms", ch)
	assert.Equal(t, "0812345678", contact)

	// nothing reachable
	o = &models.Owner{ID: 1}
	_, _, err = ResolveChannel(o, map[string]bool{})
	assert.Error(t, err)
}

func TestResolveChannelOptOutSkipped(t *testing.T) {
	o := ownerFor("sms")
	o.NotifyOptOut = true
	_, _, err := ResolveChannel(o, map[string]bool{"sms": true})
	assert.Error(t, err)
}

func TestSendToOwnerWritesQueuedThenSentLog(t *testing.T) {
	logs := newFakeNotificationLogRepo()
	svc := NewNotificationService(logs, &fakeOwnerLookup{owner: ownerFor("sms")}, fakePrefsRepo{}, adaptersFor("sms"))

	n, err := svc.SendToOwner(context.Background(), 1, 1, "vaccination", 42, "due soon")
	assert.NoError(t, err)
	assert.Equal(t, "sent", n.Status)
	assert.Equal(t, "vaccination", n.RefType)
	assert.Equal(t, 42, n.RefID)
	assert.Equal(t, "sms-ext-123", n.ExternalID.String)
}

func TestSendToOwnerFailureIsLogged(t *testing.T) {
	logs := newFakeNotificationLogRepo()
	failing := &stubNotifier{channel: "sms", ok: true, sendErr: errors.New("provider down")}
	svc := NewNotificationService(logs, &fakeOwnerLookup{owner: ownerFor("sms")}, fakePrefsRepo{}, []notifications.Notifier{failing})

	n, err := svc.SendToOwner(context.Background(), 1, 1, "test", 1, "hi")
	assert.NoError(t, err) // failure is captured in the log, not propagated
	assert.Equal(t, "failed", n.Status)
	assert.Equal(t, "provider down", n.Error.String)
}

func TestSendToOwnerOptOutReturnsErrorNoLogRow(t *testing.T) {
	logs := newFakeNotificationLogRepo()
	o := ownerFor("sms")
	o.NotifyOptOut = true
	svc := NewNotificationService(logs, &fakeOwnerLookup{owner: o}, fakePrefsRepo{}, adaptersFor("sms"))

	_, err := svc.SendToOwner(context.Background(), 1, 1, "test", 1, "hi")
	assert.Error(t, err)
	assert.Empty(t, logs.rows) // documented choice: no log row for opted-out owners
}
