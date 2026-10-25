package models

import (
	"fmt"
	"time"
)

// NotificationLog is a persisted record of one attempt to send a notification.
// Per CONTEXT.md glossary — never called "message" or "alert".
type NotificationLog struct {
	ID               int        `json:"id"`
	ClinicID         int        `json:"clinicId"`
	Channel          string     `json:"channel"` // line | sms | email
	RecipientOwnerID NullInt32  `json:"recipientOwnerId,omitempty"`
	RecipientUserID  NullInt32  `json:"recipientUserId,omitempty"`
	RefType          string     `json:"refType"`
	RefID            int        `json:"refId"`
	Status           string     `json:"status"` // queued | sent | delivered | failed
	Error            NullString `json:"error,omitempty"`
	ExternalID       NullString `json:"externalId,omitempty"`
	AttemptCount     int        `json:"attemptCount"`
	QueuedAt         time.Time  `json:"queuedAt"`
	SentAt           NullTime   `json:"sentAt,omitempty"`
	DeliveredAt      NullTime   `json:"deliveredAt,omitempty"`
	// TouchOffsetDays identifies the cadence position: positive = before due date,
	// 0 = on the day, negative = after (slice 0012). NULL for non-scheduled sends.
	TouchOffsetDays NullInt32 `json:"touchOffsetDays,omitempty"`
	// SendDate is the intended day bucket for dedup (slice 0012).
	SendDate NullTime `json:"sendDate,omitempty"`
}

// ReminderDueVaccination is one vaccination due within the reminder window.
type ReminderDueVaccination struct {
	VaccinationID int
	PatientID     int
	PatientName   string
	VaccineName   string
	NextDueDate   time.Time
	OwnerID       int
	Offset        int // the cadence offset that matched (slice 0012)
}

// ReminderDedupKey is the idempotency key for scheduled reminders:
// (vaccination, touch offset, send-date bucket) — slices 0011/0012.
func ReminderDedupKey(vaccinationID, offsetDays int, sendDate string) string {
	return fmt.Sprintf("vaccination:%d:%d:%s", vaccinationID, offsetDays, sendDate)
}

type SendTestNotificationRequest struct {
	OwnerID int    `json:"ownerId" validate:"required"`
	Message string `json:"message,omitempty"`
}

// OwnerNotificationPrefs are the owner-facing contact fields added in slice 0010.
type OwnerNotificationPrefs struct {
	PreferredChannel NullString `json:"preferredChannel,omitempty"` // line | sms | email
	NotifyOptOut     bool       `json:"notifyOptOut"`
	LineUserID       NullString `json:"lineUserId,omitempty"`
}

type UpdateOwnerNotificationPrefsRequest struct {
	PreferredChannel string `json:"preferredChannel,omitempty" validate:"omitempty,oneof=line sms email"`
	NotifyOptOut     *bool  `json:"notifyOptOut,omitempty"`
	LineUserID       string `json:"lineUserId,omitempty"`
}

type UpdateClinicReminderWindowRequest struct {
	Window []int `json:"window" validate:"required,min=1,max=8"`
}
