package service

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/vet-clinic/api/internal/models"
	"github.com/vet-clinic/api/internal/notifications"
)

// ContactLookup resolves an owner's notification prefs + contact fields.
// Implemented by repository.OwnerRepository in main.go (GetByID) or fakes in tests.
type ContactLookup interface {
	GetByID(ctx context.Context, clinicID, id int) (*models.Owner, error)
}

// NotificationLogRepo is the persistent surface for NotificationLog rows.
type NotificationLogRepo interface {
	Create(ctx context.Context, clinicID int, n *models.NotificationLog) error
	MarkSent(ctx context.Context, id int, externalID string) error
	MarkFailed(ctx context.Context, id int, sendErr string) error
	GetByID(ctx context.Context, clinicID, id int) (*models.NotificationLog, error)
	ListByOwner(ctx context.Context, clinicID, ownerID int, limit int) ([]*models.NotificationLog, error)
}

// PrefsRepo updates owner notification prefs (slice 0010).
type PrefsRepo interface {
	UpdateOwnerNotificationPrefs(ctx context.Context, clinicID, ownerID int, req *models.UpdateOwnerNotificationPrefsRequest) (*models.Owner, error)
}

// Design note (slice 0010 acceptance): owners with notify_opt_out=true are skipped
// entirely and NO log row is written. Documented choice — absence of a log row IS
// the opt-out signal; logging a "skipped" row was rejected as noise.
type NotificationService struct {
	logs     NotificationLogRepo
	owners   ContactLookup
	prefs    PrefsRepo
	adapters []notifications.Notifier
}

func NewNotificationService(logs NotificationLogRepo, owners ContactLookup, prefs PrefsRepo, adapters []notifications.Notifier) *NotificationService {
	if adapters == nil {
		adapters = notifications.Adapters()
	}
	return &NotificationService{logs: logs, owners: owners, prefs: prefs, adapters: adapters}
}

// ResolveChannel picks the recipient contact starting from owner.preferred_channel,
// falling back line → sms → email, skipping any channel whose contact field is null.
// Returns the chosen channel + contact, or an error when nothing is reachable.
func ResolveChannel(o *models.Owner, cfg map[string]bool) (string, string, error) {
	if o.NotifyOptOut {
		return "", "", errors.New("owner has opted out of notifications")
	}
	order := []string{"line", "sms", "email"}
	preferred := ""
	if o.PreferredChannel.Valid {
		preferred = o.PreferredChannel.String
	}
	// Preferred channel first, then the canonical fallback order.
	ordered := []string{}
	if preferred != "" {
		ordered = append(ordered, preferred)
	}
	for _, ch := range order {
		if ch != preferred {
			ordered = append(ordered, ch)
		}
	}

	for _, ch := range ordered {
		if preferred != "" && ch != preferred && !cfg[ch] {
			continue // fallback channels must be configured to be usable
		}
		switch ch {
		case "line":
			if o.LineUserID.Valid && o.LineUserID.String != "" {
				return "line", o.LineUserID.String, nil
			}
		case "sms":
			if strings.TrimSpace(o.Phone) != "" {
				return "sms", o.Phone, nil
			}
		case "email":
			if o.Email.Valid && strings.TrimSpace(o.Email.String) != "" {
				return "email", o.Email.String, nil
			}
		}
	}
	return "", "", errors.New("no reachable notification channel for owner")
}

func (s *NotificationService) adapter(channel string) notifications.Notifier {
	for _, a := range s.adapters {
		if a.Channel() == channel {
			return a
		}
	}
	return nil
}

// SendToOwner composes, sends, and logs one notification attempt. The log row is
// always written first as 'queued' then transitioned to sent/failed — so failed
// attempts are auditable, never silently dropped.
func (s *NotificationService) SendToOwner(ctx context.Context, clinicID, ownerID int, refType string, refID int, message string) (*models.NotificationLog, error) {
	owner, err := s.owners.GetByID(ctx, clinicID, ownerID)
	if err != nil {
		return nil, errors.New("owner not found")
	}

	cfg := map[string]bool{}
	for _, a := range s.adapters {
		cfg[a.Channel()] = a.Configured()
	}

	channel, contact, err := ResolveChannel(owner, cfg)
	if err != nil {
		return nil, err
	}

	logRow := &models.NotificationLog{
		Channel:          channel,
		RecipientOwnerID: models.NewNullInt32(int32(ownerID)),
		RefType:          refType,
		RefID:            refID,
		Status:           "queued",
	}
	if err := s.logs.Create(ctx, clinicID, logRow); err != nil {
		return nil, err
	}
	// deliver failure is captured in the log row; return the row, not the error
	_ = s.deliver(ctx, clinicID, logRow, contact, message)
	return s.logs.GetByID(ctx, clinicID, logRow.ID)
}

// errOptedOut signals the documented no-log opt-out skip.
var errOptedOut = errors.New("owner has opted out of notifications")

// SendVaccinationReminder is the scheduler's entry point (slices 0011/0012): it
// stamps the log row with the cadence touch offset and the send-date dedup bucket.
func (s *NotificationService) SendVaccinationReminder(ctx context.Context, clinicID int, v *models.ReminderDueVaccination, offsetDays int, sendDate, message string) (*models.NotificationLog, error) {
	if v == nil {
		return nil, errors.New("nil vaccination")
	}
	owner, err := s.owners.GetByID(ctx, clinicID, v.OwnerID)
	if err != nil {
		return nil, errors.New("owner not found")
	}
	if owner.NotifyOptOut {
		// Documented slice-0010 choice: opted-out owners produce no log row.
		return nil, errors.New("owner has opted out of notifications")
	}

	cfg := map[string]bool{}
	for _, a := range s.adapters {
		cfg[a.Channel()] = a.Configured()
	}
	channel, contact, err := ResolveChannel(owner, cfg)
	if err != nil {
		return nil, err
	}

	logRow := &models.NotificationLog{
		Channel:          channel,
		RecipientOwnerID: models.NewNullInt32(int32(v.OwnerID)),
		RefType:          "vaccination",
		RefID:            v.VaccinationID,
		Status:           "queued",
		TouchOffsetDays:  models.NewNullInt32(int32(offsetDays)),
		SendDate:         models.NewNullTime(mustParseDate(sendDate)),
	}
	if err := s.logs.Create(ctx, clinicID, logRow); err != nil {
		return nil, err
	}
	if err := s.deliver(ctx, clinicID, logRow, contact, message); err != nil {
		return nil, err
	}
	return s.logs.GetByID(ctx, clinicID, logRow.ID)
}

func mustParseDate(s string) time.Time {
	t, _ := time.Parse("2006-01-02", s)
	return t
}

// deliver transitions a queued log row through the adapter.
func (s *NotificationService) deliver(ctx context.Context, clinicID int, logRow *models.NotificationLog, contact, message string) error {
	adapter := s.adapter(logRow.Channel)
	if adapter == nil {
		_ = s.logs.MarkFailed(ctx, logRow.ID, "no adapter for channel "+logRow.Channel)
		return errors.New("no adapter for channel " + logRow.Channel)
	}
	externalID, sendErr := adapter.Send(ctx, contact, message)
	if sendErr != nil {
		_ = s.logs.MarkFailed(ctx, logRow.ID, sendErr.Error())
		return sendErr
	}
	_ = s.logs.MarkSent(ctx, logRow.ID, externalID)
	return nil
}

// SendTest sends a sample message to an owner (admin-only endpoint per slice 0010).
func (s *NotificationService) SendTest(ctx context.Context, clinicID int, req models.SendTestNotificationRequest) (*models.NotificationLog, error) {
	msg := req.Message
	if strings.TrimSpace(msg) == "" {
		msg = "VetClinic: this is a test notification. If you received this, your contact preferences are working."
	}
	return s.SendToOwner(ctx, clinicID, req.OwnerID, "test", req.OwnerID, msg)
}

func (s *NotificationService) UpdateOwnerPrefs(ctx context.Context, clinicID, ownerID int, req models.UpdateOwnerNotificationPrefsRequest) (*models.Owner, error) {
	return s.prefs.UpdateOwnerNotificationPrefs(ctx, clinicID, ownerID, &req)
}

func (s *NotificationService) ListByOwner(ctx context.Context, clinicID, ownerID int) ([]*models.NotificationLog, error) {
	return s.logs.ListByOwner(ctx, clinicID, ownerID, 50)
}
