package repository

import (
	"context"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/project-computer/groundwork/server/internal/models"
)

type VaccinationRepository struct {
	db *pgxpool.Pool
}

func NewVaccinationRepository(db *pgxpool.Pool) *VaccinationRepository {
	return &VaccinationRepository{db: db}
}

// VaccineProtocolRepo handles the global, non-tenant-scoped vaccine_protocols table.
type VaccineProtocolRepository struct {
	db *pgxpool.Pool
}

func NewVaccineProtocolRepository(db *pgxpool.Pool) *VaccineProtocolRepository {
	return &VaccineProtocolRepository{db: db}
}

func (r *VaccineProtocolRepository) List(ctx context.Context) ([]models.VaccineProtocol, error) {
	rows, err := r.db.Query(ctx,
		`SELECT id, name, species, default_interval_days, created_at
		   FROM vaccine_protocols ORDER BY species, name`,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []models.VaccineProtocol
	for rows.Next() {
		p := models.VaccineProtocol{}
		if err := rows.Scan(&p.ID, &p.Name, &p.Species, &p.DefaultIntervalDays, &p.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

func (r *VaccineProtocolRepository) GetByName(ctx context.Context, name, species string) (*models.VaccineProtocol, error) {
	p := &models.VaccineProtocol{}
	err := r.db.QueryRow(ctx,
		`SELECT id, name, species, default_interval_days, created_at
		   FROM vaccine_protocols
		  WHERE LOWER(name) = LOWER($1) AND LOWER(species) = LOWER($2)
		  LIMIT 1`,
		name, species,
	).Scan(&p.ID, &p.Name, &p.Species, &p.DefaultIntervalDays, &p.CreatedAt)
	if err != nil {
		return nil, err
	}
	return p, nil
}

// Create inserts a vaccination. Returns the populated row including DB-assigned id/timestamps.
func (r *VaccinationRepository) Create(ctx context.Context, clinicID int, v *models.Vaccination) error {
	v.ClinicID = clinicID
	query := `
		INSERT INTO vaccinations (
			clinic_id, patient_id, visit_id, administered_by_vet_id,
			vaccine_name, manufacturer, lot_number, inventory_lot_id,
			administered_date, next_due_date, notes
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
		RETURNING id, created_at, updated_at
	`
	return r.db.QueryRow(ctx, query,
		v.ClinicID, v.PatientID, v.VisitID, v.AdministeredByVetID,
		v.VaccineName, v.Manufacturer, v.LotNumber, v.InventoryLotID,
		v.AdministeredDate, v.NextDueDate, v.Notes,
	).Scan(&v.ID, &v.CreatedAt, &v.UpdatedAt)
}

func (r *VaccinationRepository) GetByID(ctx context.Context, id int) (*models.Vaccination, error) {
	v := &models.Vaccination{}
	query := `
		SELECT v.id, v.clinic_id, v.patient_id, p.name,
		       v.visit_id, v.administered_by_vet_id, u.name,
		       v.vaccine_name, v.manufacturer, v.lot_number, v.inventory_lot_id,
		       v.administered_date, v.next_due_date, v.notes,
		       v.created_at, v.updated_at
		  FROM vaccinations v
		  JOIN patients p ON p.id = v.patient_id
		  LEFT JOIN users u ON u.id = v.administered_by_vet_id
		 WHERE v.id = $1
	`
	err := r.db.QueryRow(ctx, query, id).Scan(
		&v.ID, &v.ClinicID, &v.PatientID, &v.PatientName,
		&v.VisitID, &v.AdministeredByVetID, &v.AdministeredByVetName,
		&v.VaccineName, &v.Manufacturer, &v.LotNumber, &v.InventoryLotID,
		&v.AdministeredDate, &v.NextDueDate, &v.Notes,
		&v.CreatedAt, &v.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return v, nil
}

func (r *VaccinationRepository) List(ctx context.Context, clinicID int, q models.VaccinationListQuery) ([]*models.Vaccination, int, error) {
	if q.Page < 1 {
		q.Page = 1
	}
	if q.Limit < 1 || q.Limit > 200 {
		q.Limit = 20
	}
	offset := (q.Page - 1) * q.Limit

	where := []string{"v.clinic_id = $1"}
	args := []interface{}{clinicID}
	idx := 2

	if q.PatientID > 0 {
		where = append(where, fmt.Sprintf("v.patient_id = $%d", idx))
		args = append(args, q.PatientID)
		idx++
	}
	if q.VaccineName != "" {
		where = append(where, fmt.Sprintf("v.vaccine_name ILIKE $%d", idx))
		args = append(args, q.VaccineName)
		idx++
	}
	if q.OverdueOnly {
		where = append(where, "v.next_due_date IS NOT NULL AND v.next_due_date < CURRENT_DATE")
	}
	whereSQL := strings.Join(where, " AND ")

	var total int
	if err := r.db.QueryRow(ctx, fmt.Sprintf(
		`SELECT COUNT(*) FROM vaccinations v WHERE %s`, whereSQL,
	), args...).Scan(&total); err != nil {
		return nil, 0, err
	}

	listSQL := fmt.Sprintf(`
		SELECT v.id, v.clinic_id, v.patient_id, p.name,
		       v.visit_id, v.administered_by_vet_id, u.name,
		       v.vaccine_name, v.manufacturer, v.lot_number, v.inventory_lot_id,
		       v.administered_date, v.next_due_date, v.notes,
		       v.created_at, v.updated_at
		  FROM vaccinations v
		  JOIN patients p ON p.id = v.patient_id
		  LEFT JOIN users u ON u.id = v.administered_by_vet_id
		 WHERE %s
		 ORDER BY v.administered_date DESC
		 LIMIT $%d OFFSET $%d
	`, whereSQL, idx, idx+1)
	args = append(args, q.Limit, offset)

	rows, err := r.db.Query(ctx, listSQL, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var out []*models.Vaccination
	for rows.Next() {
		v := &models.Vaccination{}
		err := rows.Scan(
			&v.ID, &v.ClinicID, &v.PatientID, &v.PatientName,
			&v.VisitID, &v.AdministeredByVetID, &v.AdministeredByVetName,
			&v.VaccineName, &v.Manufacturer, &v.LotNumber, &v.InventoryLotID,
			&v.AdministeredDate, &v.NextDueDate, &v.Notes,
			&v.CreatedAt, &v.UpdatedAt,
		)
		if err != nil {
			return nil, 0, err
		}
		out = append(out, v)
	}
	return out, total, rows.Err()
}

func (r *VaccinationRepository) Delete(ctx context.Context, id int) error {
	_, err := r.db.Exec(ctx, `DELETE FROM vaccinations WHERE id = $1`, id)
	return err
}
