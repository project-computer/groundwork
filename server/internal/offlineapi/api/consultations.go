package api

import (
	"context"
	"database/sql"
	"errors"
	"net/http"
	"strings"

	"github.com/google/uuid"

	"github.com/project-computer/groundwork/server/internal/offlineapi/db"
)

var consultationTransitions = map[string]map[string]bool{
	"open": {"completed": true, "cancelled": true},
}

type vitalsRequest struct {
	WeightGrams        *int64   `json:"weightGrams"`
	TemperatureCelsius *float64 `json:"temperatureCelsius"`
	HeartRateBpm       *int64   `json:"heartRateBpm"`
	RespiratoryRateBpm *int64   `json:"respiratoryRateBpm"`
}

type diagnosisRequest struct {
	Code        string `json:"code"`
	Description string `json:"description"`
	Notes       string `json:"notes"`
}

type treatmentRequest struct {
	Description string `json:"description"`
	Notes       string `json:"notes"`
}

type createConsultationRequest struct {
	PetID          string             `json:"petId"`
	AppointmentID  string             `json:"appointmentId"`
	VeterinarianID string             `json:"veterinarianId"`
	ChiefComplaint string             `json:"chiefComplaint"`
	Symptoms       string             `json:"symptoms"`
	Examination    string             `json:"examination"`
	DiagnosisNotes string             `json:"diagnosisNotes"`
	TreatmentPlan  string             `json:"treatmentPlan"`
	Notes          string             `json:"notes"`
	Vitals         vitalsRequest      `json:"vitals"`
	Diagnoses      []diagnosisRequest `json:"diagnoses"`
	Treatments     []treatmentRequest `json:"treatments"`
}

type updateConsultationRequest struct {
	ChiefComplaint *string             `json:"chiefComplaint"`
	Symptoms       *string             `json:"symptoms"`
	Examination    *string             `json:"examination"`
	DiagnosisNotes *string             `json:"diagnosisNotes"`
	TreatmentPlan  *string             `json:"treatmentPlan"`
	Notes          *string             `json:"notes"`
	Vitals         *vitalsRequest      `json:"vitals"`
	Diagnoses      *[]diagnosisRequest `json:"diagnoses"`
	Treatments     *[]treatmentRequest `json:"treatments"`
	Status         *string             `json:"status"`
}

func (s *Server) handleCreateConsultation(w http.ResponseWriter, r *http.Request, p *principal) {
	var req createConsultationRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_body", err.Error())
		return
	}
	req.PetID = strings.TrimSpace(req.PetID)
	if msg := required(req.PetID, "petId"); msg != "" {
		writeError(w, http.StatusBadRequest, "validation_error", msg)
		return
	}
	if _, err := s.q.GetPet(r.Context(), db.GetPetParams{ClinicID: p.ClinicID, ID: req.PetID}); err != nil {
		writeError(w, http.StatusBadRequest, "validation_error", "petId does not reference a patient")
		return
	}
	var appointmentID sql.NullString
	if strings.TrimSpace(req.AppointmentID) != "" {
		appointment, err := s.q.GetAppointment(r.Context(), db.GetAppointmentParams{
			ClinicID: p.ClinicID, ID: req.AppointmentID,
		})
		if err != nil {
			writeError(w, http.StatusBadRequest, "validation_error", "appointmentId does not reference an appointment")
			return
		}
		if appointment.PetID != req.PetID {
			writeError(w, http.StatusBadRequest, "validation_error", "appointment does not belong to that patient")
			return
		}
		appointmentID = sql.NullString{String: appointment.ID, Valid: true}
	}
	vetID := strings.TrimSpace(req.VeterinarianID)
	if vetID == "" {
		vetID = p.UserID
	}
	vet, err := s.optionalVet(r.Context(), p.ClinicID, vetID)
	if err != nil {
		writeError(w, http.StatusBadRequest, "validation_error", err.Error())
		return
	}
	if msg := validateEntries(req.Diagnoses, req.Treatments); msg != "" {
		writeError(w, http.StatusBadRequest, "validation_error", msg)
		return
	}

	weight, temperature, heartRate, respiratoryRate := vitalsParams(req.Vitals)
	now := db.UtcNow()
	tx, err := s.sqlDB.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not start consultation")
		return
	}
	defer tx.Rollback()
	qtx := db.New(tx)

	consultation, err := qtx.CreateConsultation(r.Context(), db.CreateConsultationParams{
		ID: uuid.NewString(), ClinicID: p.ClinicID, PetID: req.PetID,
		AppointmentID: appointmentID, VeterinarianID: vet,
		ChiefComplaint: req.ChiefComplaint, Symptoms: req.Symptoms,
		Examination: req.Examination, DiagnosisNotes: req.DiagnosisNotes,
		TreatmentPlan: req.TreatmentPlan, Notes: req.Notes,
		WeightGrams: weight, TemperatureCelsius: temperature,
		HeartRateBpm: heartRate, RespiratoryRateBpm: respiratoryRate,
		Status: "open", StartedAt: now, CompletedAt: sql.NullString{},
		CreatedAt: now, UpdatedAt: now,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not create consultation")
		return
	}
	if msg := insertEntries(r.Context(), qtx, p.ClinicID, consultation.ID, req.Diagnoses, req.Treatments); msg != "" {
		writeError(w, http.StatusInternalServerError, "internal", msg)
		return
	}
	// ADR 0022: a recorded weight is a measurement in the patient's history,
	// not just a column on the encounter. Same transaction, so the vitals
	// snapshot and the history row commit together.
	if weight.Valid {
		if _, err := qtx.CreatePetWeight(r.Context(), db.CreatePetWeightParams{
			ID: uuid.NewString(), ClinicID: p.ClinicID, PetID: req.PetID,
			WeightGrams: weight.Int64, MeasuredAt: now,
			RecordedBy: vet, CreatedAt: now,
		}); err != nil {
			writeError(w, http.StatusInternalServerError, "internal", "could not record weight history")
			return
		}
	}
	if err := tx.Commit(); err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not commit consultation")
		return
	}
	s.writeConsultation(w, r, p, http.StatusCreated, consultation.ID)
}

func (s *Server) handleGetConsultation(w http.ResponseWriter, r *http.Request, p *principal) {
	s.writeConsultation(w, r, p, http.StatusOK, r.PathValue("id"))
}

func (s *Server) handleListConsultations(w http.ResponseWriter, r *http.Request, p *principal) {
	petID := r.PathValue("id")
	if _, err := s.q.GetPet(r.Context(), db.GetPetParams{ClinicID: p.ClinicID, ID: petID}); err != nil {
		writeError(w, http.StatusNotFound, "not_found", "patient not found")
		return
	}
	page := pagination(r)
	rows, err := s.q.ListConsultationsByPet(r.Context(), db.ListConsultationsByPetParams{
		ClinicID: p.ClinicID, PetID: petID, Limit: page.Limit, Offset: page.Offset,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not list consultations")
		return
	}
	out := make([]consultationDTO, 0, len(rows))
	for _, row := range rows {
		diagnoses, _ := s.q.ListDiagnoses(r.Context(), db.ListDiagnosesParams{
			ClinicID: p.ClinicID, ConsultationID: row.ID,
		})
		treatments, _ := s.q.ListTreatments(r.Context(), db.ListTreatmentsParams{
			ClinicID: p.ClinicID, ConsultationID: row.ID,
		})
		out = append(out, consultationFrom(row, diagnoses, treatments))
	}
	writeJSON(w, http.StatusOK, map[string]any{"consultations": out})
}

func (s *Server) handleUpdateConsultation(w http.ResponseWriter, r *http.Request, p *principal) {
	var req updateConsultationRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_body", err.Error())
		return
	}
	current, err := s.q.GetConsultation(r.Context(), db.GetConsultationParams{
		ClinicID: p.ClinicID, ID: r.PathValue("id"),
	})
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusNotFound, "not_found", "consultation not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "internal", "could not load consultation")
		return
	}
	status := current.Status
	if req.Status != nil {
		status = *req.Status
	}
	switch status {
	case "open", "completed", "cancelled":
	default:
		writeError(w, http.StatusBadRequest, "validation_error", "unknown consultation status")
		return
	}
	if status != current.Status && !consultationTransitions[current.Status][status] {
		writeError(w, http.StatusBadRequest, "invalid_transition", "consultation cannot move from "+current.Status+" to "+status)
		return
	}
	if req.Diagnoses != nil {
		if msg := validateEntries(*req.Diagnoses, nil); msg != "" {
			writeError(w, http.StatusBadRequest, "validation_error", msg)
			return
		}
	}
	if req.Treatments != nil {
		if msg := validateEntries(nil, *req.Treatments); msg != "" {
			writeError(w, http.StatusBadRequest, "validation_error", msg)
			return
		}
	}

	vitals := vitalsRequest{
		WeightGrams:        nullInt64(current.WeightGrams),
		TemperatureCelsius: nullFloat64(current.TemperatureCelsius),
		HeartRateBpm:       nullInt64(current.HeartRateBpm),
		RespiratoryRateBpm: nullInt64(current.RespiratoryRateBpm),
	}
	if req.Vitals != nil {
		vitals = *req.Vitals
	}
	weight, temperature, heartRate, respiratoryRate := vitalsParams(vitals)
	completedAt := current.CompletedAt
	if status == "completed" && !completedAt.Valid {
		completedAt = sql.NullString{String: db.UtcNow(), Valid: true}
	}

	tx, err := s.sqlDB.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not start update")
		return
	}
	defer tx.Rollback()
	qtx := db.New(tx)

	if _, err := qtx.UpdateConsultation(r.Context(), db.UpdateConsultationParams{
		ChiefComplaint: valueOr(req.ChiefComplaint, current.ChiefComplaint),
		Symptoms:       valueOr(req.Symptoms, current.Symptoms),
		Examination:    valueOr(req.Examination, current.Examination),
		DiagnosisNotes: valueOr(req.DiagnosisNotes, current.DiagnosisNotes),
		TreatmentPlan:  valueOr(req.TreatmentPlan, current.TreatmentPlan),
		Notes:          valueOr(req.Notes, current.Notes),
		WeightGrams:    weight, TemperatureCelsius: temperature,
		HeartRateBpm: heartRate, RespiratoryRateBpm: respiratoryRate,
		Status: status, CompletedAt: completedAt, UpdatedAt: db.UtcNow(),
		ClinicID: p.ClinicID, ID: r.PathValue("id"),
	}); err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not update consultation")
		return
	}
	if req.Diagnoses != nil {
		if err := qtx.DeleteDiagnosesByConsultation(r.Context(), db.DeleteDiagnosesByConsultationParams{
			ClinicID: p.ClinicID, ConsultationID: current.ID,
		}); err != nil {
			writeError(w, http.StatusInternalServerError, "internal", "could not replace diagnoses")
			return
		}
		if msg := insertEntries(r.Context(), qtx, p.ClinicID, current.ID, *req.Diagnoses, nil); msg != "" {
			writeError(w, http.StatusInternalServerError, "internal", msg)
			return
		}
	}
	if req.Treatments != nil {
		if err := qtx.DeleteTreatmentsByConsultation(r.Context(), db.DeleteTreatmentsByConsultationParams{
			ClinicID: p.ClinicID, ConsultationID: current.ID,
		}); err != nil {
			writeError(w, http.StatusInternalServerError, "internal", "could not replace treatments")
			return
		}
		if msg := insertEntries(r.Context(), qtx, p.ClinicID, current.ID, nil, *req.Treatments); msg != "" {
			writeError(w, http.StatusInternalServerError, "internal", msg)
			return
		}
	}
	// ADR 0022: an updated weight is a new measurement, appended to the
	// patient's history when it changed (same transaction as the update).
	if weight.Valid && (!current.WeightGrams.Valid || current.WeightGrams.Int64 != weight.Int64) {
		measuredAt := db.UtcNow()
		if _, err := qtx.CreatePetWeight(r.Context(), db.CreatePetWeightParams{
			ID: uuid.NewString(), ClinicID: p.ClinicID, PetID: current.PetID,
			WeightGrams: weight.Int64, MeasuredAt: measuredAt,
			RecordedBy: sql.NullString{String: p.UserID, Valid: true}, CreatedAt: measuredAt,
		}); err != nil {
			writeError(w, http.StatusInternalServerError, "internal", "could not record weight history")
			return
		}
	}
	if err := tx.Commit(); err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not commit consultation")
		return
	}
	s.writeConsultation(w, r, p, http.StatusOK, current.ID)
}

func (s *Server) writeConsultation(w http.ResponseWriter, r *http.Request, p *principal, status int, id string) {
	row, err := s.q.GetConsultation(r.Context(), db.GetConsultationParams{ClinicID: p.ClinicID, ID: id})
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusNotFound, "not_found", "consultation not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "internal", "could not load consultation")
		return
	}
	diagnoses, err := s.q.ListDiagnoses(r.Context(), db.ListDiagnosesParams{
		ClinicID: p.ClinicID, ConsultationID: row.ID,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not load diagnoses")
		return
	}
	treatments, err := s.q.ListTreatments(r.Context(), db.ListTreatmentsParams{
		ClinicID: p.ClinicID, ConsultationID: row.ID,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not load treatments")
		return
	}
	writeJSON(w, status, consultationFrom(row, diagnoses, treatments))
}

func vitalsParams(v vitalsRequest) (sql.NullInt64, sql.NullFloat64, sql.NullInt64, sql.NullInt64) {
	weight := sql.NullInt64{}
	if v.WeightGrams != nil {
		weight = sql.NullInt64{Int64: *v.WeightGrams, Valid: true}
	}
	temperature := sql.NullFloat64{}
	if v.TemperatureCelsius != nil {
		temperature = sql.NullFloat64{Float64: *v.TemperatureCelsius, Valid: true}
	}
	heart := sql.NullInt64{}
	if v.HeartRateBpm != nil {
		heart = sql.NullInt64{Int64: *v.HeartRateBpm, Valid: true}
	}
	respiratory := sql.NullInt64{}
	if v.RespiratoryRateBpm != nil {
		respiratory = sql.NullInt64{Int64: *v.RespiratoryRateBpm, Valid: true}
	}
	return weight, temperature, heart, respiratory
}

func validateEntries(diagnoses []diagnosisRequest, treatments []treatmentRequest) string {
	for _, diagnosis := range diagnoses {
		if strings.TrimSpace(diagnosis.Description) == "" {
			return "diagnosis description is required"
		}
	}
	for _, treatment := range treatments {
		if strings.TrimSpace(treatment.Description) == "" {
			return "treatment description is required"
		}
	}
	return ""
}

func insertEntries(ctx context.Context, qtx *db.Queries, clinicID, consultationID string, diagnoses []diagnosisRequest, treatments []treatmentRequest) string {
	now := db.UtcNow()
	for _, diagnosis := range diagnoses {
		diagnosis.Description = strings.TrimSpace(diagnosis.Description)
		if _, err := qtx.CreateDiagnosis(ctx, db.CreateDiagnosisParams{
			ID: uuid.NewString(), ClinicID: clinicID, ConsultationID: consultationID,
			Code: diagnosis.Code, Description: diagnosis.Description,
			Notes: diagnosis.Notes, CreatedAt: now,
		}); err != nil {
			return "could not save diagnosis"
		}
	}
	for _, treatment := range treatments {
		treatment.Description = strings.TrimSpace(treatment.Description)
		if _, err := qtx.CreateTreatment(ctx, db.CreateTreatmentParams{
			ID: uuid.NewString(), ClinicID: clinicID, ConsultationID: consultationID,
			Description: treatment.Description, Notes: treatment.Notes, CreatedAt: now,
		}); err != nil {
			return "could not save treatment"
		}
	}
	return ""
}
