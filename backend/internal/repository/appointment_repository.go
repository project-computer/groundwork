package repository

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/vet-clinic/api/internal/models"
)

type AppointmentRepository struct {
	db *pgxpool.Pool
}

func NewAppointmentRepository(db *pgxpool.Pool) *AppointmentRepository {
	return &AppointmentRepository{db: db}
}

func (r *AppointmentRepository) Create(ctx context.Context, clinicID int, apt *models.Appointment) error {
	// Generate custom ID
	var count int
	err := r.db.QueryRow(ctx,
		"SELECT COUNT(*) FROM appointments WHERE clinic_id = $1",
		clinicID,
	).Scan(&count)
	if err != nil {
		return fmt.Errorf("failed to count appointments: %w", err)
	}

	apt.CustomID = fmt.Sprintf("APT-%d", count+1)
	apt.ClinicID = clinicID

	query := `
		INSERT INTO appointments (
			clinic_id, custom_id, pet_id, pet_name, owner_name,
			date, time, type, status, notes,
			veterinarian_id, veterinarian_name, created_by
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
		RETURNING id, created_at, updated_at
	`

	return r.db.QueryRow(ctx, query,
		apt.ClinicID, apt.CustomID, apt.PetID, apt.PetName, apt.OwnerName,
		apt.Date, apt.Time, apt.Type, apt.Status, apt.Notes,
		apt.VeterinarianID, apt.VeterinarianName, apt.CreatedBy,
	).Scan(&apt.ID, &apt.CreatedAt, &apt.UpdatedAt)
}

func (r *AppointmentRepository) GetByID(ctx context.Context, id int) (*models.Appointment, error) {
	apt := &models.Appointment{}

	query := `
		SELECT id, clinic_id, custom_id, pet_id, pet_name, owner_name,
		       date, time, type, status, notes,
		       veterinarian_id, veterinarian_name, created_by,
		       created_at, updated_at
		FROM appointments
		WHERE id = $1
	`

	err := r.db.QueryRow(ctx, query, id).Scan(
		&apt.ID, &apt.ClinicID, &apt.CustomID, &apt.PetID, &apt.PetName, &apt.OwnerName,
		&apt.Date, &apt.Time, &apt.Type, &apt.Status, &apt.Notes,
		&apt.VeterinarianID, &apt.VeterinarianName, &apt.CreatedBy,
		&apt.CreatedAt, &apt.UpdatedAt,
	)

	if err == pgx.ErrNoRows {
		return nil, fmt.Errorf("appointment not found")
	}

	return apt, err
}

func (r *AppointmentRepository) List(ctx context.Context, clinicID int, query models.AppointmentListQuery) ([]*models.Appointment, int, error) {
	// Set defaults
	if query.Page < 1 {
		query.Page = 1
	}
	if query.Limit < 1 || query.Limit > 100 {
		query.Limit = 20
	}
	offset := (query.Page - 1) * query.Limit

	// Build WHERE clause
	whereClauses := []string{"clinic_id = $1"}
	args := []interface{}{clinicID}
	argIdx := 2

	if query.Date != "" {
		whereClauses = append(whereClauses, fmt.Sprintf("date = $%d", argIdx))
		args = append(args, query.Date)
		argIdx++
	}

	if query.Status != "" {
		whereClauses = append(whereClauses, fmt.Sprintf("status = $%d", argIdx))
		args = append(args, query.Status)
		argIdx++
	}

	if query.VeterinarianID > 0 {
		whereClauses = append(whereClauses, fmt.Sprintf("veterinarian_id = $%d", argIdx))
		args = append(args, query.VeterinarianID)
		argIdx++
	}

	whereSQL := strings.Join(whereClauses, " AND ")

	// Get total count
	var total int
	countQuery := fmt.Sprintf("SELECT COUNT(*) FROM appointments WHERE %s", whereSQL)
	err := r.db.QueryRow(ctx, countQuery, args...).Scan(&total)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to count appointments: %w", err)
	}

	// Get appointments
	listQuery := fmt.Sprintf(`
		SELECT id, clinic_id, custom_id, pet_id, pet_name, owner_name,
		       date, time, type, status, notes,
		       veterinarian_id, veterinarian_name, created_by,
		       created_at, updated_at
		FROM appointments
		WHERE %s
		ORDER BY date DESC, time DESC
		LIMIT $%d OFFSET $%d
	`, whereSQL, argIdx, argIdx+1)
	args = append(args, query.Limit, offset)

	rows, err := r.db.Query(ctx, listQuery, args...)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to query appointments: %w", err)
	}
	defer rows.Close()

	var appointments []*models.Appointment
	for rows.Next() {
		apt := &models.Appointment{}
		err := rows.Scan(
			&apt.ID, &apt.ClinicID, &apt.CustomID, &apt.PetID, &apt.PetName, &apt.OwnerName,
			&apt.Date, &apt.Time, &apt.Type, &apt.Status, &apt.Notes,
			&apt.VeterinarianID, &apt.VeterinarianName, &apt.CreatedBy,
			&apt.CreatedAt, &apt.UpdatedAt,
		)
		if err != nil {
			return nil, 0, fmt.Errorf("failed to scan appointment: %w", err)
		}
		appointments = append(appointments, apt)
	}

	return appointments, total, rows.Err()
}

func (r *AppointmentRepository) Update(ctx context.Context, id int, updates map[string]interface{}) error {
	query := `
		UPDATE appointments
		SET date = COALESCE($1, date),
		    time = COALESCE($2, time),
		    type = COALESCE($3, type),
		    status = COALESCE($4, status),
		    notes = COALESCE($5, notes),
		    veterinarian_id = COALESCE($6, veterinarian_id),
		    veterinarian_name = COALESCE($7, veterinarian_name),
		    updated_at = NOW()
		WHERE id = $8
	`

	result, err := r.db.Exec(ctx, query,
		updates["date"], updates["time"], updates["type"], updates["status"],
		updates["notes"], updates["veterinarian_id"], updates["veterinarian_name"],
		id,
	)

	if err != nil {
		return fmt.Errorf("failed to update appointment: %w", err)
	}

	if result.RowsAffected() == 0 {
		return fmt.Errorf("appointment not found")
	}

	return nil
}

func (r *AppointmentRepository) Delete(ctx context.Context, id int) error {
	query := `DELETE FROM appointments WHERE id = $1`
	result, err := r.db.Exec(ctx, query, id)

	if err != nil {
		return fmt.Errorf("failed to delete appointment: %w", err)
	}

	if result.RowsAffected() == 0 {
		return fmt.Errorf("appointment not found")
	}

	return nil
}

func (r *AppointmentRepository) GetByDate(ctx context.Context, clinicID int, date time.Time) ([]*models.Appointment, error) {
	query := `
		SELECT id, clinic_id, custom_id, pet_id, pet_name, owner_name,
		       date, time, type, status, notes,
		       veterinarian_id, veterinarian_name, created_by,
		       created_at, updated_at
		FROM appointments
		WHERE clinic_id = $1 AND date = $2
		ORDER BY time ASC
	`

	rows, err := r.db.Query(ctx, query, clinicID, date)
	if err != nil {
		return nil, fmt.Errorf("failed to query appointments by date: %w", err)
	}
	defer rows.Close()

	var appointments []*models.Appointment
	for rows.Next() {
		apt := &models.Appointment{}
		err := rows.Scan(
			&apt.ID, &apt.ClinicID, &apt.CustomID, &apt.PetID, &apt.PetName, &apt.OwnerName,
			&apt.Date, &apt.Time, &apt.Type, &apt.Status, &apt.Notes,
			&apt.VeterinarianID, &apt.VeterinarianName, &apt.CreatedBy,
			&apt.CreatedAt, &apt.UpdatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan appointment: %w", err)
		}
		appointments = append(appointments, apt)
	}

	return appointments, rows.Err()
}

func (r *AppointmentRepository) UpdateStatus(ctx context.Context, id int, status string) error {
	query := `UPDATE appointments SET status = $1, updated_at = NOW() WHERE id = $2`
	result, err := r.db.Exec(ctx, query, status, id)

	if err != nil {
		return fmt.Errorf("failed to update appointment status: %w", err)
	}

	if result.RowsAffected() == 0 {
		return fmt.Errorf("appointment not found")
	}

	return nil
}
