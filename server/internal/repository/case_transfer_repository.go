package repository

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/project-computer/groundwork/server/internal/models"
)

var (
	ErrTransferNotFound   = errors.New("case transfer not found")
	ErrTransferNotPending = errors.New("case transfer is not pending")
)

type CaseTransferRepository struct {
	db *pgxpool.Pool
}

func NewCaseTransferRepository(db *pgxpool.Pool) *CaseTransferRepository {
	return &CaseTransferRepository{db: db}
}

func (r *CaseTransferRepository) Create(ctx context.Context, t *models.CaseTransfer) error {
	visitIDs := make([]int64, len(t.VisitIDs))
	for i, id := range t.VisitIDs {
		visitIDs[i] = int64(id)
	}

	query := `
		INSERT INTO case_transfers (from_clinic_id, to_clinic_id, patient_id, visit_ids, token, status, note, created_by, expires_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		RETURNING id, created_at, updated_at
	`
	return r.db.QueryRow(ctx, query,
		t.FromClinicID, t.ToClinicID, t.PatientID, visitIDs, t.Token, t.Status, t.Note, t.CreatedBy, t.ExpiresAt,
	).Scan(&t.ID, &t.CreatedAt, &t.UpdatedAt)
}

func (r *CaseTransferRepository) GetByID(ctx context.Context, clinicID, id int) (*models.CaseTransfer, error) {
	t, err := r.scanOne(r.db.QueryRow(ctx, transferSelect+"WHERE ct.id = $1 AND (ct.from_clinic_id = $2 OR ct.to_clinic_id = $2)", id, clinicID))
	if err != nil {
		return nil, err
	}
	return t, r.enrich(ctx, t)
}

func (r *CaseTransferRepository) List(ctx context.Context, clinicID int) ([]*models.CaseTransfer, error) {
	rows, err := r.db.Query(ctx, transferSelect+"WHERE ct.from_clinic_id = $1 OR ct.to_clinic_id = $1 ORDER BY ct.created_at DESC", clinicID)
	if err != nil {
		return nil, fmt.Errorf("failed to query case transfers: %w", err)
	}
	defer rows.Close()

	var out []*models.CaseTransfer
	for rows.Next() {
		t, err := scanTransfer(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	for _, t := range out {
		if err := r.enrich(ctx, t); err != nil {
			return nil, err
		}
	}
	return out, nil
}

// GetByToken is the token-protected lookup behind the shareable link. It does
// not scope by clinic — possession of the unguessable token IS the authorizer.
func (r *CaseTransferRepository) GetByToken(ctx context.Context, token string) (*models.CaseTransfer, error) {
	t, err := r.scanOne(r.db.QueryRow(ctx, transferSelect+"WHERE ct.token = $1", token))
	if err != nil {
		return nil, err
	}
	return t, r.enrich(ctx, t)
}

func (r *CaseTransferRepository) MarkAccepted(ctx context.Context, id, toClinicID, acceptedBy int) error {
	query := `
		UPDATE case_transfers
		SET status = 'accepted', to_clinic_id = $2, accepted_by = $3, accepted_at = NOW(), updated_at = NOW()
		WHERE id = $1 AND status = 'pending'
	`
	result, err := r.db.Exec(ctx, query, id, toClinicID, acceptedBy)
	if err != nil {
		return fmt.Errorf("failed to accept case transfer: %w", err)
	}
	if result.RowsAffected() == 0 {
		return ErrTransferNotPending
	}
	return nil
}

func (r *CaseTransferRepository) MarkRevoked(ctx context.Context, id, fromClinicID int) error {
	query := `
		UPDATE case_transfers
		SET status = 'revoked', updated_at = NOW()
		WHERE id = $1 AND from_clinic_id = $2 AND status = 'pending'
	`
	result, err := r.db.Exec(ctx, query, id, fromClinicID)
	if err != nil {
		return fmt.Errorf("failed to revoke case transfer: %w", err)
	}
	if result.RowsAffected() == 0 {
		return ErrTransferNotPending
	}
	return nil
}

// SourcePatient loads the sending clinic's patient + owner for the bundle.
func (r *CaseTransferRepository) SourcePatient(ctx context.Context, clinicID, patientID int) (*models.Patient, error) {
	query := `
		SELECT p.id, p.clinic_id, p.mrn, p.name, p.species, p.breed, p.date_of_birth, p.weight,
		       p.owner_id, o.name, o.phone, o.email, o.national_id, o.notes,
		       p.status, p.last_appointment_date, p.next_appointment_date, p.created_at, p.updated_at
		FROM patients p
		JOIN owners o ON o.id = p.owner_id
		WHERE p.id = $1 AND p.clinic_id = $2 AND p.deleted_at IS NULL
	`
	p := &models.Patient{}
	var breed, email, nationalID, notes *string
	var lastAppt, nextAppt, dob *time.Time
	var weight *float64
	err := r.db.QueryRow(ctx, query, patientID, clinicID).Scan(
		&p.ID, &p.ClinicID, &p.MRN, &p.Name, &p.Species, &breed, &dob, &weight,
		&p.OwnerID, &p.OwnerName, &p.OwnerPhone, &email, &nationalID, &notes,
		&p.Status, &lastAppt, &nextAppt, &p.CreatedAt, &p.UpdatedAt,
	)
	if err == pgx.ErrNoRows {
		return nil, fmt.Errorf("patient not found")
	}
	if err != nil {
		return nil, fmt.Errorf("failed to fetch source patient: %w", err)
	}
	p.Breed = nullFromString(breed)
	p.DateOfBirth = nullFromTime(dob)
	p.Weight = nullFromFloat(weight)
	p.OwnerEmail = nullFromString(email)
	p.OwnerNationalID = nullFromString(nationalID)
	p.OwnerNotes = nullFromString(notes)
	return p, nil
}

// SourceVisits loads the selected visits, verifying they all belong to the
// patient at the sending clinic.
func (r *CaseTransferRepository) SourceVisits(ctx context.Context, clinicID, patientID int, visitIDs []int) ([]*models.Visit, error) {
	ids := make([]int64, len(visitIDs))
	for i, id := range visitIDs {
		ids[i] = int64(id)
	}
	query := `
		SELECT id, clinic_id, custom_id, patient_id, appointment_id, pet_name, owner_name,
		       type, purpose, status, assigned_vet_id, assigned_vet_name,
		       steps, chief_complaint, vitals, examination, differential_diagnosis, final_diagnosis,
		       treatment, advice, follow_up_date, medications, has_medication_envelope,
		       history_notes, billing_status, created_by, created_at, updated_at
		FROM visits
		WHERE clinic_id = $1 AND patient_id = $2 AND id = ANY($3)
		ORDER BY created_at ASC
	`
	rows, err := r.db.Query(ctx, query, clinicID, patientID, ids)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch source visits: %w", err)
	}
	defer rows.Close()

	var visits []*models.Visit
	for rows.Next() {
		v := &models.Visit{}
		// Every column that is nullable in the schema scans through a pointer;
		// v1 columns like status/steps/vitals carried DEFAULTs, not NOT NULLs.
		var appointmentID, assignedVetID, createdBy *int32
		var assignedVetName, chiefComplaint, examination, diffDiag, finalDiag, treatment, advice, historyNotes *string
		var followUp *time.Time
		var steps, vitals, medications []byte
		var status, billingStatus *string
		if err := rows.Scan(
			&v.ID, &v.ClinicID, &v.CustomID, &v.PetID, &appointmentID, &v.PetName, &v.OwnerName,
			&v.Type, &v.Purpose, &status, &assignedVetID, &assignedVetName,
			&steps, &chiefComplaint, &vitals, &examination, &diffDiag, &finalDiag,
			&treatment, &advice, &followUp, &medications, &v.HasMedicationEnvelope,
			&historyNotes, &billingStatus, &createdBy, &v.CreatedAt, &v.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("failed to scan source visit: %w", err)
		}
		v.AppointmentID = nullFromInt(appointmentID)
		v.AssignedVetID = nullFromInt(assignedVetID)
		v.AssignedVetName = nullFromString(assignedVetName)
		v.Status = deref(status)
		v.BillingStatus = deref(billingStatus)
		v.Steps = nullJSON(steps, []byte("[]"))
		v.Vitals = nullJSON(vitals, []byte("{}"))
		v.Medications = nullJSON(medications, []byte("[]"))
		v.ChiefComplaint = nullFromString(chiefComplaint)
		v.Examination = nullFromString(examination)
		v.DifferentialDiagnosis = nullFromString(diffDiag)
		v.FinalDiagnosis = nullFromString(finalDiag)
		v.Treatment = nullFromString(treatment)
		v.Advice = nullFromString(advice)
		v.FollowUpDate = nullFromTime(followUp)
		v.HistoryNotes = nullFromString(historyNotes)
		if createdBy != nil {
			v.CreatedBy = int(*createdBy)
		}
		visits = append(visits, v)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if len(visits) != len(visitIDs) {
		return nil, fmt.Errorf("some visits were not found for this patient")
	}
	return visits, nil
}

// CopyPatient creates the receiving clinic's own Patient row, stamped with
// provenance. MRN is generated per receiving-clinic sequence. The owner is
// resolved beforehand (find-or-create by phone) and linked via ownerID.
func (r *CaseTransferRepository) CopyPatient(ctx context.Context, clinicID, ownerID int, src *models.Patient) (*models.Patient, error) {
	// MRNs are globally unique (single UNIQUE index across clinics), so probe
	// forward from the clinic's sequence until an unused number is found.
	mrn, err := r.nextFreeMRN(ctx, clinicID)
	if err != nil {
		return nil, fmt.Errorf("failed to generate MRN: %w", err)
	}

	dst := &models.Patient{
		ClinicID: clinicID, MRN: mrn,
		Name: src.Name, Species: src.Species, Breed: src.Breed,
		DateOfBirth: src.DateOfBirth, Weight: src.Weight,
		Status: src.Status,
	}
	query := `
		INSERT INTO patients (clinic_id, mrn, name, species, breed, date_of_birth, weight, owner_id, status, original_clinic_id, original_patient_id)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
		RETURNING id
	`
	err = r.db.QueryRow(ctx, query,
		dst.ClinicID, dst.MRN, dst.Name, dst.Species, dst.Breed, dst.DateOfBirth, dst.Weight,
		ownerID, dst.Status, src.ClinicID, src.ID,
	).Scan(&dst.ID)
	if err != nil {
		return nil, fmt.Errorf("failed to copy patient: %w", err)
	}
	return dst, nil
}

func (r *CaseTransferRepository) nextFreeVisitID(ctx context.Context, clinicID int) (string, error) {
	var count int
	if err := r.db.QueryRow(ctx,
		"SELECT COUNT(*) FROM visits WHERE clinic_id = $1", clinicID,
	).Scan(&count); err != nil {
		return "", err
	}
	for i := count + 1; ; i++ {
		candidate := fmt.Sprintf("VIS-%d", i)
		var taken bool
		if err := r.db.QueryRow(ctx,
			"SELECT EXISTS(SELECT 1 FROM visits WHERE custom_id = $1)", candidate,
		).Scan(&taken); err != nil {
			return "", err
		}
		if !taken {
			return candidate, nil
		}
	}
}

// nextFreeMRN generates PT-YYYY-NNNN, skipping numbers already taken by ANY
// clinic (patients.mrn is globally unique).
func (r *CaseTransferRepository) nextFreeMRN(ctx context.Context, clinicID int) (string, error) {
	var count int
	prefix := fmt.Sprintf("PT-%04d-", time.Now().Year())
	if err := r.db.QueryRow(ctx,
		"SELECT COUNT(*) FROM patients WHERE clinic_id = $1 AND mrn LIKE $2",
		clinicID, prefix+"%",
	).Scan(&count); err != nil {
		return "", err
	}
	for i := count + 1; ; i++ {
		candidate := fmt.Sprintf("%s%04d", prefix, i)
		var taken bool
		if err := r.db.QueryRow(ctx,
			"SELECT EXISTS(SELECT 1 FROM patients WHERE mrn = $1)", candidate,
		).Scan(&taken); err != nil {
			return "", err
		}
		if !taken {
			return candidate, nil
		}
	}
}

// CopyVisit creates the receiving clinic's own Visit row with the full clinical
// content of the source visit, stamped with provenance. Billing state does not
// cross clinics — the receiving clinic starts clean.
func (r *CaseTransferRepository) CopyVisit(ctx context.Context, clinicID, patientID int, ownerName string, createdBy int, src *models.Visit) (*models.Visit, error) {
	// custom_id is globally unique across clinics; probe for a free number.
	customID, err := r.nextFreeVisitID(ctx, clinicID)
	if err != nil {
		return nil, fmt.Errorf("failed to generate visit ID: %w", err)
	}

	dst := &models.Visit{
		ClinicID: clinicID, CustomID: customID,
		PetID: patientID, PetName: src.PetName, OwnerName: ownerName,
		Type: src.Type, Purpose: src.Purpose, Status: src.Status,
		AssignedVetID: src.AssignedVetID, AssignedVetName: src.AssignedVetName,
		Steps: src.Steps, ChiefComplaint: src.ChiefComplaint,
		Vitals: src.Vitals, Examination: src.Examination,
		DifferentialDiagnosis: src.DifferentialDiagnosis, FinalDiagnosis: src.FinalDiagnosis,
		Treatment: src.Treatment, Advice: src.Advice, FollowUpDate: src.FollowUpDate,
		Medications: src.Medications, HasMedicationEnvelope: false,
		HistoryNotes: src.HistoryNotes, BillingStatus: "Not Sent", CreatedBy: createdBy,
	}

	query := `
		INSERT INTO visits (
			clinic_id, custom_id, patient_id, pet_name, owner_name,
			type, purpose, status, assigned_vet_id, assigned_vet_name,
			steps, chief_complaint, vitals, examination, differential_diagnosis, final_diagnosis,
			treatment, advice, follow_up_date, medications, has_medication_envelope,
			history_notes, billing_status, created_by, original_clinic_id, original_visit_id
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26)
		RETURNING id, created_at
	`
	err = r.db.QueryRow(ctx, query,
		dst.ClinicID, dst.CustomID, dst.PetID, dst.PetName, dst.OwnerName,
		dst.Type, dst.Purpose, dst.Status, dst.AssignedVetID, dst.AssignedVetName,
		dst.Steps, dst.ChiefComplaint, dst.Vitals, dst.Examination, dst.DifferentialDiagnosis, dst.FinalDiagnosis,
		dst.Treatment, dst.Advice, dst.FollowUpDate, dst.Medications, dst.HasMedicationEnvelope,
		dst.HistoryNotes, dst.BillingStatus, dst.CreatedBy, src.ClinicID, src.ID,
	).Scan(&dst.ID, &dst.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("failed to copy visit: %w", err)
	}
	return dst, nil
}

const transferSelect = `
	SELECT ct.id, ct.from_clinic_id, ct.to_clinic_id, ct.patient_id, ct.visit_ids, ct.token,
	       ct.status, ct.note, ct.created_by, ct.accepted_by, ct.accepted_at, ct.expires_at,
	       ct.created_at, ct.updated_at
	FROM case_transfers ct
`

func (r *CaseTransferRepository) scanOne(row pgx.Row) (*models.CaseTransfer, error) {
	t, err := scanTransfer(row)
	if err == pgx.ErrNoRows {
		return nil, ErrTransferNotFound
	}
	return t, err
}

type row interface{ Scan(dest ...any) error }

func scanTransfer(sc row) (*models.CaseTransfer, error) {
	t := &models.CaseTransfer{}
	var visitIDs []int64
	var toClinicID, acceptedBy *int32
	var note *string
	var acceptedAt *time.Time
	if err := sc.Scan(
		&t.ID, &t.FromClinicID, &toClinicID, &t.PatientID, &visitIDs, &t.Token,
		&t.Status, &note, &t.CreatedBy, &acceptedBy, &acceptedAt, &t.ExpiresAt,
		&t.CreatedAt, &t.UpdatedAt,
	); err != nil {
		return nil, err
	}
	t.ToClinicID = nullFromInt(toClinicID)
	t.AcceptedBy = nullFromInt(acceptedBy)
	t.AcceptedAt = nullFromTime(acceptedAt)
	t.Note = nullFromString(note)
	t.VisitIDs = make([]int, len(visitIDs))
	for i, id := range visitIDs {
		t.VisitIDs[i] = int(id)
	}
	return t, nil
}

func (r *CaseTransferRepository) enrich(ctx context.Context, t *models.CaseTransfer) error {
	t.VisitCount = len(t.VisitIDs)
	query := `
		SELECT c.name FROM clinics c WHERE c.id = $1
	`
	if err := r.db.QueryRow(ctx, query, t.FromClinicID).Scan(&t.FromClinicName); err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return err
	}
	if t.ToClinicID.Valid {
		if err := r.db.QueryRow(ctx, query, int(t.ToClinicID.Int32)).Scan(&t.ToClinicName); err != nil && !errors.Is(err, pgx.ErrNoRows) {
			return err
		}
	}
	patientQuery := "SELECT name, species FROM patients WHERE id = $1 AND clinic_id = $2"
	if err := r.db.QueryRow(ctx, patientQuery, t.PatientID, t.FromClinicID).Scan(&t.PatientName, &t.Species); err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return err
	}
	ownerQuery := `
		SELECT o.name FROM owners o
		JOIN patients p ON p.owner_id = o.id
		WHERE p.id = $1 AND p.clinic_id = $2
	`
	if err := r.db.QueryRow(ctx, ownerQuery, t.PatientID, t.FromClinicID).Scan(&t.OwnerName); err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return err
	}
	return nil
}

func nullFromString(s *string) models.NullString {
	if s == nil {
		return models.NullString{}
	}
	return models.NewNullString(*s)
}

func nullFromTime(t *time.Time) models.NullTime {
	if t == nil {
		return models.NullTime{}
	}
	return models.NewNullTime(*t)
}

func nullFromFloat(f *float64) models.NullFloat64 {
	if f == nil {
		return models.NullFloat64{}
	}
	return models.NewNullFloat64(*f)
}

func nullFromInt(i *int32) models.NullInt32 {
	if i == nil {
		return models.NullInt32{}
	}
	return models.NewNullInt32(*i)
}

func deref(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

// nullJSON substitutes a default when a nullable JSONB column scans back NULL.
func nullJSON(raw []byte, fallback []byte) json.RawMessage {
	if raw == nil {
		return json.RawMessage(fallback)
	}
	return json.RawMessage(raw)
}
