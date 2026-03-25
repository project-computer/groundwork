package repository

import (
	"context"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/vet-clinic/api/internal/models"
)

type PrescriptionRepository struct {
	db *pgxpool.Pool
}

func NewPrescriptionRepository(db *pgxpool.Pool) *PrescriptionRepository {
	return &PrescriptionRepository{db: db}
}

func (r *PrescriptionRepository) Create(ctx context.Context, clinicID int, rx *models.Prescription) error {
	// Generate custom ID
	var count int
	err := r.db.QueryRow(ctx,
		"SELECT COUNT(*) FROM prescriptions WHERE clinic_id = $1",
		clinicID,
	).Scan(&count)
	if err != nil {
		return fmt.Errorf("failed to count prescriptions: %w", err)
	}

	rx.CustomID = fmt.Sprintf("RX-%d", count+1)
	rx.ClinicID = clinicID

	query := `
		INSERT INTO prescriptions (
			clinic_id, custom_id, visit_id, pet_id, pet_name, owner_name,
			date, veterinarian_id, veterinarian_name, diagnosis,
			medicines, notes
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
		RETURNING id, created_at
	`

	return r.db.QueryRow(ctx, query,
		rx.ClinicID, rx.CustomID, rx.VisitID, rx.PetID, rx.PetName, rx.OwnerName,
		rx.Date, rx.VeterinarianID, rx.VeterinarianName, rx.Diagnosis,
		rx.Medicines, rx.Notes,
	).Scan(&rx.ID, &rx.CreatedAt)
}

func (r *PrescriptionRepository) GetByID(ctx context.Context, id int) (*models.Prescription, error) {
	rx := &models.Prescription{}

	query := `
		SELECT id, clinic_id, custom_id, visit_id, pet_id, pet_name, owner_name,
		       date, veterinarian_id, veterinarian_name, diagnosis,
		       medicines, notes, created_at
		FROM prescriptions
		WHERE id = $1
	`

	err := r.db.QueryRow(ctx, query, id).Scan(
		&rx.ID, &rx.ClinicID, &rx.CustomID, &rx.VisitID, &rx.PetID, &rx.PetName, &rx.OwnerName,
		&rx.Date, &rx.VeterinarianID, &rx.VeterinarianName, &rx.Diagnosis,
		&rx.Medicines, &rx.Notes, &rx.CreatedAt,
	)

	if err == pgx.ErrNoRows {
		return nil, fmt.Errorf("prescription not found")
	}

	return rx, err
}

func (r *PrescriptionRepository) List(ctx context.Context, clinicID int, query models.PrescriptionListQuery) ([]*models.Prescription, int, error) {
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

	if query.PetID > 0 {
		whereClauses = append(whereClauses, fmt.Sprintf("pet_id = $%d", argIdx))
		args = append(args, query.PetID)
		argIdx++
	}

	if query.VetID > 0 {
		whereClauses = append(whereClauses, fmt.Sprintf("veterinarian_id = $%d", argIdx))
		args = append(args, query.VetID)
		argIdx++
	}

	if query.StartDate != "" {
		whereClauses = append(whereClauses, fmt.Sprintf("date >= $%d", argIdx))
		args = append(args, query.StartDate)
		argIdx++
	}

	if query.EndDate != "" {
		whereClauses = append(whereClauses, fmt.Sprintf("date <= $%d", argIdx))
		args = append(args, query.EndDate)
		argIdx++
	}

	whereSQL := strings.Join(whereClauses, " AND ")

	// Get total count
	var total int
	countQuery := fmt.Sprintf("SELECT COUNT(*) FROM prescriptions WHERE %s", whereSQL)
	err := r.db.QueryRow(ctx, countQuery, args...).Scan(&total)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to count prescriptions: %w", err)
	}

	// Get prescriptions
	listQuery := fmt.Sprintf(`
		SELECT id, clinic_id, custom_id, visit_id, pet_id, pet_name, owner_name,
		       date, veterinarian_id, veterinarian_name, diagnosis,
		       medicines, notes, created_at
		FROM prescriptions
		WHERE %s
		ORDER BY date DESC, created_at DESC
		LIMIT $%d OFFSET $%d
	`, whereSQL, argIdx, argIdx+1)
	args = append(args, query.Limit, offset)

	rows, err := r.db.Query(ctx, listQuery, args...)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to query prescriptions: %w", err)
	}
	defer rows.Close()

	var prescriptions []*models.Prescription
	for rows.Next() {
		rx := &models.Prescription{}
		err := rows.Scan(
			&rx.ID, &rx.ClinicID, &rx.CustomID, &rx.VisitID, &rx.PetID, &rx.PetName, &rx.OwnerName,
			&rx.Date, &rx.VeterinarianID, &rx.VeterinarianName, &rx.Diagnosis,
			&rx.Medicines, &rx.Notes, &rx.CreatedAt,
		)
		if err != nil {
			return nil, 0, fmt.Errorf("failed to scan prescription: %w", err)
		}
		prescriptions = append(prescriptions, rx)
	}

	return prescriptions, total, rows.Err()
}
