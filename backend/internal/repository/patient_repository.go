package repository

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/vet-clinic/api/internal/models"
)

type PatientRepository struct {
	db        *pgxpool.Pool
	ownerRepo *OwnerRepository
}

func NewPatientRepository(db *pgxpool.Pool, ownerRepo *OwnerRepository) *PatientRepository {
	return &PatientRepository{db: db, ownerRepo: ownerRepo}
}

// Create inserts a patient, generating the next MRN per clinic. MRN format per CONTEXT.md:
// PT-YYYY-NNNN, sequence resets per calendar year. The MRN generation runs against
// the patients table; UNIQUE constraint on patients.mrn catches concurrent collisions.
func (r *PatientRepository) Create(ctx context.Context, clinicID int, p *models.Patient) error {
	year := nowYear()
	mrn, err := r.nextMRN(ctx, clinicID, year)
	if err != nil {
		return err
	}
	p.MRN = mrn
	p.ClinicID = clinicID

	owner, err := r.ownerRepo.FindOrCreate(ctx, clinicID,
		p.OwnerName, p.OwnerPhone,
		p.OwnerEmail.String, p.OwnerNationalID.String)
	if err != nil {
		return err
	}
	p.OwnerID = owner.ID

	query := `
		INSERT INTO patients (clinic_id, mrn, name, species, breed, date_of_birth, weight, owner_id, status)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		RETURNING id, created_at, updated_at
	`
	return r.db.QueryRow(ctx, query,
		p.ClinicID, p.MRN, p.Name, p.Species, p.Breed, p.DateOfBirth, p.Weight,
		p.OwnerID, p.Status,
	).Scan(&p.ID, &p.CreatedAt, &p.UpdatedAt)
}

func (r *PatientRepository) GetByID(ctx context.Context, id int) (*models.Patient, error) {
	p := &models.Patient{}
	query := `
		SELECT p.id, p.clinic_id, p.mrn, p.name, p.species, p.breed, p.date_of_birth, p.weight,
		       p.owner_id, o.name, o.phone, o.email, o.national_id, o.notes,
		       p.status, p.last_appointment_date, p.next_appointment_date,
		       p.created_at, p.updated_at
		FROM patients p
		JOIN owners o ON o.id = p.owner_id
		WHERE p.id = $1 AND p.deleted_at IS NULL
	`
	err := r.db.QueryRow(ctx, query, id).Scan(
		&p.ID, &p.ClinicID, &p.MRN, &p.Name, &p.Species, &p.Breed, &p.DateOfBirth, &p.Weight,
		&p.OwnerID, &p.OwnerName, &p.OwnerPhone, &p.OwnerEmail, &p.OwnerNationalID, &p.OwnerNotes,
		&p.Status, &p.LastAppointmentDate, &p.NextAppointmentDate,
		&p.CreatedAt, &p.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return p, nil
}

func (r *PatientRepository) List(ctx context.Context, clinicID int, query models.PatientListQuery) ([]*models.Patient, int, error) {
	if query.Page < 1 {
		query.Page = 1
	}
	if query.Limit < 1 || query.Limit > 100 {
		query.Limit = 20
	}
	offset := (query.Page - 1) * query.Limit

	whereClauses := []string{"p.clinic_id = $1", "p.deleted_at IS NULL"}
	args := []interface{}{clinicID}
	argIdx := 2

	if query.Search != "" {
		whereClauses = append(whereClauses, fmt.Sprintf("(p.name ILIKE $%d OR o.name ILIKE $%d OR o.phone ILIKE $%d OR p.mrn ILIKE $%d)", argIdx, argIdx, argIdx, argIdx))
		args = append(args, "%"+query.Search+"%")
		argIdx++
	}
	if query.Species != "" {
		whereClauses = append(whereClauses, fmt.Sprintf("p.species = $%d", argIdx))
		args = append(args, query.Species)
		argIdx++
	}
	if query.Status != "" {
		whereClauses = append(whereClauses, fmt.Sprintf("p.status = $%d", argIdx))
		args = append(args, query.Status)
		argIdx++
	}
	if query.MRN != "" {
		whereClauses = append(whereClauses, fmt.Sprintf("p.mrn = $%d", argIdx))
		args = append(args, query.MRN)
		argIdx++
	}

	whereSQL := strings.Join(whereClauses, " AND ")

	var total int
	countQuery := fmt.Sprintf(`SELECT COUNT(*) FROM patients p JOIN owners o ON o.id = p.owner_id WHERE %s`, whereSQL)
	if err := r.db.QueryRow(ctx, countQuery, args...).Scan(&total); err != nil {
		return nil, 0, err
	}

	listQuery := fmt.Sprintf(`
		SELECT p.id, p.clinic_id, p.mrn, p.name, p.species, p.breed, p.date_of_birth, p.weight,
		       p.owner_id, o.name, o.phone, o.email, o.national_id, o.notes,
		       p.status, p.last_appointment_date, p.next_appointment_date,
		       p.created_at, p.updated_at
		FROM patients p
		JOIN owners o ON o.id = p.owner_id
		WHERE %s
		ORDER BY p.created_at DESC
		LIMIT $%d OFFSET $%d
	`, whereSQL, argIdx, argIdx+1)
	args = append(args, query.Limit, offset)

	rows, err := r.db.Query(ctx, listQuery, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var patients []*models.Patient
	for rows.Next() {
		p := &models.Patient{}
		err := rows.Scan(
			&p.ID, &p.ClinicID, &p.MRN, &p.Name, &p.Species, &p.Breed, &p.DateOfBirth, &p.Weight,
			&p.OwnerID, &p.OwnerName, &p.OwnerPhone, &p.OwnerEmail, &p.OwnerNationalID, &p.OwnerNotes,
			&p.Status, &p.LastAppointmentDate, &p.NextAppointmentDate,
			&p.CreatedAt, &p.UpdatedAt,
		)
		if err != nil {
			return nil, 0, err
		}
		patients = append(patients, p)
	}
	return patients, total, rows.Err()
}

// UpdatePetColumns kept for backwards-compat with the service layer until slice 0003
// introduces stricter handling. Updates only patient-owned columns; owner-side changes
// route through OwnerRepository.
func (r *PatientRepository) UpdatePetColumns(ctx context.Context, id int, updates map[string]interface{}) error {
	if len(updates) == 0 {
		return nil
	}
	allowed := []string{"name", "species", "breed", "date_of_birth", "weight", "status"}
	setClauses := []string{"updated_at = NOW()"}
	args := []interface{}{}
	idx := 1

	for _, col := range allowed {
		if v, ok := updates[col]; ok {
			setClauses = append(setClauses, fmt.Sprintf("%s = $%d", col, idx))
			args = append(args, v)
			idx++
		}
	}
	args = append(args, id)
	query := fmt.Sprintf(`UPDATE patients SET %s WHERE id = $%d AND deleted_at IS NULL`,
		strings.Join(setClauses, ", "), idx)
	_, err := r.db.Exec(ctx, query, args...)
	return err
}

func (r *PatientRepository) Update(ctx context.Context, id int, updates map[string]interface{}) error {
	return r.UpdatePetColumns(ctx, id, updates)
}

func (r *PatientRepository) Delete(ctx context.Context, id int) error {
	_, err := r.db.Exec(ctx, `UPDATE patients SET deleted_at = NOW() WHERE id = $1`, id)
	return err
}

// PatientSpecies returns the species of a single patient. Used by VaccinationService
// to look up the right vaccine_protocols row when auto-calculating next_due_date.
// Defined here (not in service.PatientLookup) because it's the only consumer-facing
// slice of the repo that needs the species — no point pulling the full Patient row.
func (r *PatientRepository) PatientSpecies(ctx context.Context, clinicID, patientID int) (string, error) {
	var species string
	err := r.db.QueryRow(ctx,
		`SELECT species FROM patients WHERE id = $1 AND clinic_id = $2 AND deleted_at IS NULL`,
		patientID, clinicID,
	).Scan(&species)
	if err != nil {
		return "", err
	}
	return species, nil
}

// nextMRN computes the next sequence number for the given clinic + year. The patients.mrn
// UNIQUE constraint backstops any race; if a duplicate slips through, the caller can
// retry by reading max+1 again. Caller is responsible for retrying on UNIQUE violation.
func (r *PatientRepository) nextMRN(ctx context.Context, clinicID, year int) (string, error) {
	var count int
	prefix := fmt.Sprintf("PT-%04d-", year)
	err := r.db.QueryRow(ctx,
		`SELECT COUNT(*) FROM patients WHERE clinic_id = $1 AND mrn LIKE $2`,
		clinicID, prefix+"%",
	).Scan(&count)
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("%s%04d", prefix, count+1), nil
}

// nowYear is overridden in tests if needed; default delegates to time.Now.
var nowYear = func() int { return time.Now().Year() }
