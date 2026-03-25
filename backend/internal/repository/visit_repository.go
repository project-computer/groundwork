package repository

import (
	"context"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/vet-clinic/api/internal/models"
)

type VisitRepository struct {
	db *pgxpool.Pool
}

func NewVisitRepository(db *pgxpool.Pool) *VisitRepository {
	return &VisitRepository{db: db}
}

func (r *VisitRepository) Create(ctx context.Context, clinicID int, visit *models.Visit) error {
	// Generate custom ID
	var count int
	err := r.db.QueryRow(ctx,
		"SELECT COUNT(*) FROM visits WHERE clinic_id = $1",
		clinicID,
	).Scan(&count)
	if err != nil {
		return fmt.Errorf("failed to count visits: %w", err)
	}

	visit.CustomID = fmt.Sprintf("VIS-%d", count+1)
	visit.ClinicID = clinicID
	visit.Steps = []byte("[]")
	visit.Vitals = []byte("{}")
	visit.Medications = []byte("[]")
	visit.Status = "Draft"
	visit.BillingStatus = "Not Sent"

	query := `
		INSERT INTO visits (
			clinic_id, custom_id, pet_id, appointment_id, pet_name, owner_name,
			type, purpose, status, assigned_vet_id, assigned_vet_name,
			steps, vitals, medications, has_medication_envelope,
			billing_status, created_by
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
		RETURNING id, created_at, updated_at
	`

	return r.db.QueryRow(ctx, query,
		visit.ClinicID, visit.CustomID, visit.PetID, visit.AppointmentID,
		visit.PetName, visit.OwnerName, visit.Type, visit.Purpose,
		visit.Status, visit.AssignedVetID, visit.AssignedVetName,
		visit.Steps, visit.Vitals, visit.Medications,
		visit.HasMedicationEnvelope, visit.BillingStatus, visit.CreatedBy,
	).Scan(&visit.ID, &visit.CreatedAt, &visit.UpdatedAt)
}

func (r *VisitRepository) GetByID(ctx context.Context, id int) (*models.Visit, error) {
	v := &models.Visit{}

	query := `
		SELECT id, clinic_id, custom_id, pet_id, appointment_id, pet_name, owner_name,
		       type, purpose, status, assigned_vet_id, assigned_vet_name,
		       steps, chief_complaint, vitals, examination,
		       differential_diagnosis, final_diagnosis, treatment, advice,
		       follow_up_date, medications, has_medication_envelope,
		       history_notes, billing_status, created_by,
		       created_at, updated_at
		FROM visits
		WHERE id = $1
	`

	err := r.db.QueryRow(ctx, query, id).Scan(
		&v.ID, &v.ClinicID, &v.CustomID, &v.PetID, &v.AppointmentID,
		&v.PetName, &v.OwnerName, &v.Type, &v.Purpose, &v.Status,
		&v.AssignedVetID, &v.AssignedVetName, &v.Steps, &v.ChiefComplaint,
		&v.Vitals, &v.Examination, &v.DifferentialDiagnosis, &v.FinalDiagnosis,
		&v.Treatment, &v.Advice, &v.FollowUpDate, &v.Medications,
		&v.HasMedicationEnvelope, &v.HistoryNotes, &v.BillingStatus,
		&v.CreatedBy, &v.CreatedAt, &v.UpdatedAt,
	)

	if err == pgx.ErrNoRows {
		return nil, fmt.Errorf("visit not found")
	}

	return v, err
}

func (r *VisitRepository) List(ctx context.Context, clinicID int, query models.VisitListQuery) ([]*models.Visit, int, error) {
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

	if query.Status != "" {
		whereClauses = append(whereClauses, fmt.Sprintf("status = $%d", argIdx))
		args = append(args, query.Status)
		argIdx++
	}

	if query.PetID > 0 {
		whereClauses = append(whereClauses, fmt.Sprintf("pet_id = $%d", argIdx))
		args = append(args, query.PetID)
		argIdx++
	}

	if query.Type != "" {
		whereClauses = append(whereClauses, fmt.Sprintf("type = $%d", argIdx))
		args = append(args, query.Type)
		argIdx++
	}

	whereSQL := strings.Join(whereClauses, " AND ")

	// Get total count
	var total int
	countQuery := fmt.Sprintf("SELECT COUNT(*) FROM visits WHERE %s", whereSQL)
	err := r.db.QueryRow(ctx, countQuery, args...).Scan(&total)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to count visits: %w", err)
	}

	// Get visits
	listQuery := fmt.Sprintf(`
		SELECT id, clinic_id, custom_id, pet_id, appointment_id, pet_name, owner_name,
		       type, purpose, status, assigned_vet_id, assigned_vet_name,
		       steps, chief_complaint, vitals, examination,
		       differential_diagnosis, final_diagnosis, treatment, advice,
		       follow_up_date, medications, has_medication_envelope,
		       history_notes, billing_status, created_by,
		       created_at, updated_at
		FROM visits
		WHERE %s
		ORDER BY created_at DESC
		LIMIT $%d OFFSET $%d
	`, whereSQL, argIdx, argIdx+1)
	args = append(args, query.Limit, offset)

	rows, err := r.db.Query(ctx, listQuery, args...)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to query visits: %w", err)
	}
	defer rows.Close()

	var visits []*models.Visit
	for rows.Next() {
		v := &models.Visit{}
		err := rows.Scan(
			&v.ID, &v.ClinicID, &v.CustomID, &v.PetID, &v.AppointmentID,
			&v.PetName, &v.OwnerName, &v.Type, &v.Purpose, &v.Status,
			&v.AssignedVetID, &v.AssignedVetName, &v.Steps, &v.ChiefComplaint,
			&v.Vitals, &v.Examination, &v.DifferentialDiagnosis, &v.FinalDiagnosis,
			&v.Treatment, &v.Advice, &v.FollowUpDate, &v.Medications,
			&v.HasMedicationEnvelope, &v.HistoryNotes, &v.BillingStatus,
			&v.CreatedBy, &v.CreatedAt, &v.UpdatedAt,
		)
		if err != nil {
			return nil, 0, fmt.Errorf("failed to scan visit: %w", err)
		}
		visits = append(visits, v)
	}

	return visits, total, rows.Err()
}

func (r *VisitRepository) Update(ctx context.Context, id int, updates map[string]interface{}) error {
	query := `
		UPDATE visits
		SET status = COALESCE($1, status),
		    steps = COALESCE($2, steps),
		    chief_complaint = COALESCE($3, chief_complaint),
		    vitals = COALESCE($4, vitals),
		    examination = COALESCE($5, examination),
		    differential_diagnosis = COALESCE($6, differential_diagnosis),
		    final_diagnosis = COALESCE($7, final_diagnosis),
		    treatment = COALESCE($8, treatment),
		    advice = COALESCE($9, advice),
		    follow_up_date = COALESCE($10, follow_up_date),
		    medications = COALESCE($11, medications),
		    has_medication_envelope = COALESCE($12, has_medication_envelope),
		    history_notes = COALESCE($13, history_notes),
		    billing_status = COALESCE($14, billing_status),
		    updated_at = NOW()
		WHERE id = $15
	`

	result, err := r.db.Exec(ctx, query,
		updates["status"], updates["steps"], updates["chief_complaint"],
		updates["vitals"], updates["examination"], updates["differential_diagnosis"],
		updates["final_diagnosis"], updates["treatment"], updates["advice"],
		updates["follow_up_date"], updates["medications"], updates["has_medication_envelope"],
		updates["history_notes"], updates["billing_status"],
		id,
	)

	if err != nil {
		return fmt.Errorf("failed to update visit: %w", err)
	}

	if result.RowsAffected() == 0 {
		return fmt.Errorf("visit not found")
	}

	return nil
}

func (r *VisitRepository) Complete(ctx context.Context, id int) error {
	query := `UPDATE visits SET status = 'Done', updated_at = NOW() WHERE id = $1`
	result, err := r.db.Exec(ctx, query, id)

	if err != nil {
		return fmt.Errorf("failed to complete visit: %w", err)
	}

	if result.RowsAffected() == 0 {
		return fmt.Errorf("visit not found")
	}

	return nil
}

func (r *VisitRepository) Duplicate(ctx context.Context, clinicID int, sourceID int) (*models.Visit, error) {
	// Get source visit
	source, err := r.GetByID(ctx, sourceID)
	if err != nil {
		return nil, fmt.Errorf("failed to get source visit: %w", err)
	}

	// Generate new custom ID
	var count int
	err = r.db.QueryRow(ctx,
		"SELECT COUNT(*) FROM visits WHERE clinic_id = $1",
		clinicID,
	).Scan(&count)
	if err != nil {
		return nil, fmt.Errorf("failed to count visits: %w", err)
	}

	newVisit := &models.Visit{
		ClinicID:              clinicID,
		CustomID:              fmt.Sprintf("VIS-%d", count+1),
		PetID:                 source.PetID,
		AppointmentID:         source.AppointmentID,
		PetName:               source.PetName,
		OwnerName:             source.OwnerName,
		Type:                  source.Type,
		Purpose:               source.Purpose,
		Status:                "Draft",
		AssignedVetID:         source.AssignedVetID,
		AssignedVetName:       source.AssignedVetName,
		Steps:                 []byte("[]"),
		Vitals:                []byte("{}"),
		Medications:           []byte("[]"),
		HasMedicationEnvelope: false,
		BillingStatus:         "Not Sent",
		CreatedBy:             source.CreatedBy,
	}

	query := `
		INSERT INTO visits (
			clinic_id, custom_id, pet_id, appointment_id, pet_name, owner_name,
			type, purpose, status, assigned_vet_id, assigned_vet_name,
			steps, vitals, medications, has_medication_envelope,
			billing_status, created_by
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
		RETURNING id, created_at, updated_at
	`

	err = r.db.QueryRow(ctx, query,
		newVisit.ClinicID, newVisit.CustomID, newVisit.PetID, newVisit.AppointmentID,
		newVisit.PetName, newVisit.OwnerName, newVisit.Type, newVisit.Purpose,
		newVisit.Status, newVisit.AssignedVetID, newVisit.AssignedVetName,
		newVisit.Steps, newVisit.Vitals, newVisit.Medications,
		newVisit.HasMedicationEnvelope, newVisit.BillingStatus, newVisit.CreatedBy,
	).Scan(&newVisit.ID, &newVisit.CreatedAt, &newVisit.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("failed to duplicate visit: %w", err)
	}

	return newVisit, nil
}
