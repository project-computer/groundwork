package repository

import (
	"context"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/vet-clinic/api/internal/models"
)

type PatientRepository struct {
	db *pgxpool.Pool
}

func NewPatientRepository(db *pgxpool.Pool) *PatientRepository {
	return &PatientRepository{db: db}
}

func (r *PatientRepository) Create(ctx context.Context, clinicID int, pet *models.Pet) error {
	// Generate custom ID
	var count int
	err := r.db.QueryRow(ctx, "SELECT COUNT(*) FROM pets WHERE clinic_id = $1", clinicID).Scan(&count)
	if err != nil {
		return err
	}
	pet.CustomID = fmt.Sprintf("C-%d", count+1)
	pet.ClinicID = clinicID

	query := `
		INSERT INTO pets (
			clinic_id, custom_id, name, species, breed, age, weight,
			owner_name, owner_phone, owner_email, owner_national_id, owner_notes, owner_label, status
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
		RETURNING id, created_at, updated_at
	`
	return r.db.QueryRow(ctx, query,
		pet.ClinicID, pet.CustomID, pet.Name, pet.Species, pet.Breed, pet.Age, pet.Weight,
		pet.OwnerName, pet.OwnerPhone, pet.OwnerEmail, pet.OwnerNationalID,
		pet.OwnerNotes, pet.OwnerLabel, pet.Status,
	).Scan(&pet.ID, &pet.CreatedAt, &pet.UpdatedAt)
}

func (r *PatientRepository) GetByID(ctx context.Context, id int) (*models.Pet, error) {
	pet := &models.Pet{}
	query := `
		SELECT id, clinic_id, custom_id, name, species, breed, age, weight,
		       owner_name, owner_phone, owner_email, owner_national_id, owner_notes, owner_label,
		       status, last_appointment_date, next_appointment_date, created_at, updated_at
		FROM pets
		WHERE id = $1 AND deleted_at IS NULL
	`
	err := r.db.QueryRow(ctx, query, id).Scan(
		&pet.ID, &pet.ClinicID, &pet.CustomID, &pet.Name, &pet.Species, &pet.Breed, &pet.Age, &pet.Weight,
		&pet.OwnerName, &pet.OwnerPhone, &pet.OwnerEmail, &pet.OwnerNationalID,
		&pet.OwnerNotes, &pet.OwnerLabel, &pet.Status,
		&pet.LastAppointmentDate, &pet.NextAppointmentDate, &pet.CreatedAt, &pet.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return pet, nil
}

func (r *PatientRepository) List(ctx context.Context, clinicID int, query models.PetListQuery) ([]*models.Pet, int, error) {
	if query.Page < 1 {
		query.Page = 1
	}
	if query.Limit < 1 || query.Limit > 100 {
		query.Limit = 20
	}
	offset := (query.Page - 1) * query.Limit

	// Build WHERE clause
	whereClauses := []string{"clinic_id = $1", "deleted_at IS NULL"}
	args := []interface{}{clinicID}
	argIdx := 2

	if query.Search != "" {
		whereClauses = append(whereClauses, fmt.Sprintf("(name ILIKE $%d OR owner_name ILIKE $%d OR owner_phone ILIKE $%d)", argIdx, argIdx, argIdx))
		args = append(args, "%"+query.Search+"%")
		argIdx++
	}
	if query.Species != "" {
		whereClauses = append(whereClauses, fmt.Sprintf("species = $%d", argIdx))
		args = append(args, query.Species)
		argIdx++
	}
	if query.Status != "" {
		whereClauses = append(whereClauses, fmt.Sprintf("status = $%d", argIdx))
		args = append(args, query.Status)
		argIdx++
	}
	if query.OwnerPhone != "" {
		whereClauses = append(whereClauses, fmt.Sprintf("owner_phone = $%d", argIdx))
		args = append(args, query.OwnerPhone)
		argIdx++
	}

	whereSQL := strings.Join(whereClauses, " AND ")

	// Get total count
	var total int
	countQuery := fmt.Sprintf("SELECT COUNT(*) FROM pets WHERE %s", whereSQL)
	err := r.db.QueryRow(ctx, countQuery, args...).Scan(&total)
	if err != nil {
		return nil, 0, err
	}

	// Get pets
	listQuery := fmt.Sprintf(`
		SELECT id, clinic_id, custom_id, name, species, breed, age, weight,
		       owner_name, owner_phone, owner_email, owner_national_id, owner_notes, owner_label,
		       status, last_appointment_date, next_appointment_date, created_at, updated_at
		FROM pets
		WHERE %s
		ORDER BY created_at DESC
		LIMIT $%d OFFSET $%d
	`, whereSQL, argIdx, argIdx+1)
	args = append(args, query.Limit, offset)

	rows, err := r.db.Query(ctx, listQuery, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var pets []*models.Pet
	for rows.Next() {
		pet := &models.Pet{}
		err := rows.Scan(
			&pet.ID, &pet.ClinicID, &pet.CustomID, &pet.Name, &pet.Species, &pet.Breed, &pet.Age, &pet.Weight,
			&pet.OwnerName, &pet.OwnerPhone, &pet.OwnerEmail, &pet.OwnerNationalID,
			&pet.OwnerNotes, &pet.OwnerLabel, &pet.Status,
			&pet.LastAppointmentDate, &pet.NextAppointmentDate, &pet.CreatedAt, &pet.UpdatedAt,
		)
		if err != nil {
			return nil, 0, err
		}
		pets = append(pets, pet)
	}

	return pets, total, rows.Err()
}

func (r *PatientRepository) Update(ctx context.Context, id int, updates map[string]interface{}) error {
	query := `
		UPDATE pets
		SET name = COALESCE($1, name),
		    species = COALESCE($2, species),
		    breed = COALESCE($3, breed),
		    age = COALESCE($4, age),
		    weight = COALESCE($5, weight),
		    owner_name = COALESCE($6, owner_name),
		    owner_phone = COALESCE($7, owner_phone),
		    owner_email = COALESCE($8, owner_email),
		    owner_national_id = COALESCE($9, owner_national_id),
		    owner_notes = COALESCE($10, owner_notes),
		    owner_label = COALESCE($11, owner_label),
		    status = COALESCE($12, status),
		    updated_at = NOW()
		WHERE id = $13 AND deleted_at IS NULL
	`
	_, err := r.db.Exec(ctx, query,
		updates["name"], updates["species"], updates["breed"], updates["age"], updates["weight"],
		updates["owner_name"], updates["owner_phone"], updates["owner_email"],
		updates["owner_national_id"], updates["owner_notes"], updates["owner_label"], updates["status"], id,
	)
	return err
}

func (r *PatientRepository) Delete(ctx context.Context, id int) error {
	query := `UPDATE pets SET deleted_at = NOW() WHERE id = $1`
	_, err := r.db.Exec(ctx, query, id)
	return err
}
