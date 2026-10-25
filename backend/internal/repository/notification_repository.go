package repository

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/vet-clinic/api/internal/models"
)

type NotificationRepository struct {
	db *pgxpool.Pool
}

func NewNotificationRepository(db *pgxpool.Pool) *NotificationRepository {
	return &NotificationRepository{db: db}
}

const notificationCols = `id, clinic_id, channel, recipient_owner_id, recipient_user_id,
	ref_type, ref_id, status, error, external_id, attempt_count, queued_at, sent_at, delivered_at`

func scanNotification(row interface{ Scan(...interface{}) error }) (*models.NotificationLog, error) {
	n := &models.NotificationLog{}
	err := row.Scan(&n.ID, &n.ClinicID, &n.Channel, &n.RecipientOwnerID, &n.RecipientUserID,
		&n.RefType, &n.RefID, &n.Status, &n.Error, &n.ExternalID, &n.AttemptCount,
		&n.QueuedAt, &n.SentAt, &n.DeliveredAt)
	if err != nil {
		return nil, err
	}
	return n, nil
}

// Create inserts a log row. Status defaults to 'queued' at the DB level.
func (r *NotificationRepository) Create(ctx context.Context, clinicID int, n *models.NotificationLog) error {
	n.ClinicID = clinicID
	return r.db.QueryRow(ctx, `
		INSERT INTO notification_log
			(clinic_id, channel, recipient_owner_id, recipient_user_id, ref_type, ref_id, status, error, external_id, attempt_count, touch_offset_days, send_date)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
		RETURNING id, queued_at`,
		n.ClinicID, n.Channel, n.RecipientOwnerID, n.RecipientUserID,
		n.RefType, n.RefID, n.Status, n.Error, n.ExternalID, n.AttemptCount,
		n.TouchOffsetDays, n.SendDate,
	).Scan(&n.ID, &n.QueuedAt)
}

// MarkSent stamps the row after the adapter reports success. The log is mutable
// only through this state-transition method — the delivery state machine.
func (r *NotificationRepository) MarkSent(ctx context.Context, id int, externalID string) error {
	_, err := r.db.Exec(ctx, `
		UPDATE notification_log
		   SET status = 'sent', external_id = $2, sent_at = NOW(), attempt_count = attempt_count + 1
		 WHERE id = $1`, id, externalID)
	return err
}

func (r *NotificationRepository) MarkFailed(ctx context.Context, id int, sendErr string) error {
	_, err := r.db.Exec(ctx, `
		UPDATE notification_log
		   SET status = 'failed', error = $2, attempt_count = attempt_count + 1
		 WHERE id = $1`, id, sendErr)
	return err
}

func (r *NotificationRepository) GetByID(ctx context.Context, clinicID, id int) (*models.NotificationLog, error) {
	return scanNotification(r.db.QueryRow(ctx,
		`SELECT `+notificationCols+` FROM notification_log WHERE id = $1 AND clinic_id = $2`,
		id, clinicID))
}

func (r *NotificationRepository) ListByOwner(ctx context.Context, clinicID, ownerID int, limit int) ([]*models.NotificationLog, error) {
	if limit < 1 || limit > 200 {
		limit = 50
	}
	rows, err := r.db.Query(ctx,
		`SELECT `+notificationCols+` FROM notification_log
		  WHERE clinic_id = $1 AND recipient_owner_id = $2
		  ORDER BY queued_at DESC LIMIT $3`, clinicID, ownerID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []*models.NotificationLog
	for rows.Next() {
		n, err := scanNotification(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, n)
	}
	return out, rows.Err()
}

// ReminderDedupExists reports whether a log row for (vaccination, offset, day)
// already exists — the slice 0011/0012 idempotency key.
func (r *NotificationRepository) ReminderDedupExists(ctx context.Context, clinicID, vaccinationID, offsetDays int, sendDate string) (bool, error) {
	var exists bool
	err := r.db.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM notification_log
			 WHERE clinic_id = $1
			   AND ref_type = 'vaccination'
			   AND ref_id = $2
			   AND touch_offset_days = $3
			   AND send_date = $4
		)`, clinicID, vaccinationID, offsetDays, sendDate).Scan(&exists)
	return exists, err
}

// GetClinicReminderWindow reads clinics.reminder_window_days (default [7,0,-7]).
func (r *NotificationRepository) GetClinicReminderWindow(ctx context.Context, clinicID int) ([]int, error) {
	var window []int
	err := r.db.QueryRow(ctx,
		`SELECT reminder_window_days FROM clinics WHERE id = $1`, clinicID).Scan(&window)
	if err != nil {
		return nil, err
	}
	if window == nil {
		window = []int{7, 0, -7}
	}
	return window, nil
}

// SetClinicReminderWindow writes the per-clinic cadence (slice 0012, admin only).
func (r *NotificationRepository) SetClinicReminderWindow(ctx context.Context, clinicID int, window []int) error {
	_, err := r.db.Exec(ctx,
		`UPDATE clinics SET reminder_window_days = $1 WHERE id = $2`, window, clinicID)
	return err
}

// GetDueVaccinations returns vaccinations whose next_due_date + offset falls inside
// the [today-1, today] recompute window for the given cadence offset (slice 0012).
func (r *NotificationRepository) GetDueVaccinations(ctx context.Context, clinicID, offsetDays int) ([]*models.ReminderDueVaccination, error) {
	rows, err := r.db.Query(ctx, `
		SELECT v.id, v.patient_id, p.name, v.vaccine_name, v.next_due_date, p.owner_id
		  FROM vaccinations v
		  JOIN patients p ON p.id = v.patient_id
		 WHERE v.clinic_id = $1
		   AND v.next_due_date IS NOT NULL
		   AND v.next_due_date + ($2 || ' days')::interval BETWEEN (CURRENT_DATE - 1) AND CURRENT_DATE
		   AND p.deleted_at IS NULL
		 ORDER BY v.next_due_date ASC
		 LIMIT 500
	`, clinicID, offsetDays)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []*models.ReminderDueVaccination
	for rows.Next() {
		v := &models.ReminderDueVaccination{Offset: offsetDays}
		if err := rows.Scan(&v.VaccinationID, &v.PatientID, &v.PatientName, &v.VaccineName, &v.NextDueDate, &v.OwnerID); err != nil {
			return nil, err
		}
		out = append(out, v)
	}
	return out, rows.Err()
}

// UpdateOwnerNotificationPrefs writes the slice-0010 owner contact fields.
func (r *NotificationRepository) UpdateOwnerNotificationPrefs(ctx context.Context, clinicID, ownerID int, req *models.UpdateOwnerNotificationPrefsRequest) (*models.Owner, error) {
	if req.PreferredChannel != "" {
		if _, err := r.db.Exec(ctx,
			`UPDATE owners SET preferred_channel = NULLIF($1, ''), updated_at = NOW()
			  WHERE id = $2 AND clinic_id = $3`, req.PreferredChannel, ownerID, clinicID); err != nil {
			return nil, err
		}
	}
	if req.NotifyOptOut != nil {
		if _, err := r.db.Exec(ctx,
			`UPDATE owners SET notify_opt_out = $1, updated_at = NOW() WHERE id = $2 AND clinic_id = $3`,
			*req.NotifyOptOut, ownerID, clinicID); err != nil {
			return nil, err
		}
	}
	if req.LineUserID != "" {
		if _, err := r.db.Exec(ctx,
			`UPDATE owners SET line_user_id = $1, updated_at = NOW() WHERE id = $2 AND clinic_id = $3`,
			req.LineUserID, ownerID, clinicID); err != nil {
			return nil, err
		}
	}
	o := &models.Owner{}
	var secContact []byte
	err := r.db.QueryRow(ctx,
		`SELECT id, clinic_id, name, phone, email, national_id, notes,
		        secondary_contact, preferred_channel, notify_opt_out, line_user_id,
		        created_at, updated_at
		   FROM owners WHERE id = $1 AND clinic_id = $2`, ownerID, clinicID,
	).Scan(&o.ID, &o.ClinicID, &o.Name, &o.Phone, &o.Email, &o.NationalID, &o.Notes,
		&secContact, &o.PreferredChannel, &o.NotifyOptOut, &o.LineUserID,
		&o.CreatedAt, &o.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return o, nil
}
