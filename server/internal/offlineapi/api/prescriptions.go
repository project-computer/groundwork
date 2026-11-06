package api

import (
	"database/sql"
	"errors"
	"net/http"
	"strings"

	"github.com/google/uuid"

	"github.com/project-computer/groundwork/server/internal/offlineapi/db"
)

type prescriptionItemRequest struct {
	MedicationID      string `json:"medicationId"`
	MedicationName    string `json:"medicationName"`
	Strength          string `json:"strength"`
	DoseAmount        string `json:"doseAmount"`
	DoseUnit          string `json:"doseUnit"`
	Route             string `json:"route"`
	Frequency         string `json:"frequency"`
	DurationDays      *int64 `json:"durationDays"`
	QuantityDispensed int64  `json:"quantityDispensed"`
	Instructions      string `json:"instructions"`
}

type createPrescriptionRequest struct {
	ConsultationID string                    `json:"consultationId"`
	VeterinarianID string                    `json:"veterinarianId"`
	Instructions   string                    `json:"instructions"`
	Items          []prescriptionItemRequest `json:"items"`
}

type createMedicationRequest struct {
	Name     string `json:"name"`
	Strength string `json:"strength"`
	Form     string `json:"form"`
}

type updateMedicationRequest struct {
	Name     *string `json:"name"`
	Strength *string `json:"strength"`
	Form     *string `json:"form"`
	Active   *bool   `json:"active"`
}

func (s *Server) handleCreatePrescription(w http.ResponseWriter, r *http.Request, p *principal) {
	var req createPrescriptionRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_body", err.Error())
		return
	}
	req.ConsultationID = strings.TrimSpace(req.ConsultationID)
	if msg := required(req.ConsultationID, "consultationId"); msg != "" {
		writeError(w, http.StatusBadRequest, "validation_error", msg)
		return
	}
	consultation, err := s.q.GetConsultation(r.Context(), db.GetConsultationParams{
		ClinicID: p.ClinicID, ID: req.ConsultationID,
	})
	if err != nil {
		writeError(w, http.StatusBadRequest, "validation_error", "consultationId does not reference a consultation")
		return
	}
	if consultation.Status == "cancelled" {
		writeError(w, http.StatusConflict, "conflict", "cannot prescribe for a cancelled consultation")
		return
	}
	if len(req.Items) == 0 {
		writeError(w, http.StatusBadRequest, "validation_error", "at least one prescription item is required")
		return
	}
	for _, item := range req.Items {
		if strings.TrimSpace(item.MedicationName) == "" {
			writeError(w, http.StatusBadRequest, "validation_error", "each item needs a medicationName")
			return
		}
		if item.QuantityDispensed < 0 {
			writeError(w, http.StatusBadRequest, "validation_error", "quantityDispensed cannot be negative")
			return
		}
		if item.DurationDays != nil && *item.DurationDays <= 0 {
			writeError(w, http.StatusBadRequest, "validation_error", "durationDays must be greater than zero")
			return
		}
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

	now := db.UtcNow()
	tx, err := s.sqlDB.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not start prescription")
		return
	}
	defer tx.Rollback()
	qtx := db.New(tx)

	prescription, err := qtx.CreatePrescription(r.Context(), db.CreatePrescriptionParams{
		ID: uuid.NewString(), ClinicID: p.ClinicID, ConsultationID: consultation.ID,
		PetID: consultation.PetID, VeterinarianID: vet,
		Instructions: req.Instructions, Status: "issued",
		IssuedAt: now, CreatedAt: now, UpdatedAt: now,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not create prescription")
		return
	}
	for _, item := range req.Items {
		var medicationID sql.NullString
		if strings.TrimSpace(item.MedicationID) != "" {
			if _, err := qtx.GetMedication(r.Context(), db.GetMedicationParams{
				ClinicID: p.ClinicID, ID: item.MedicationID,
			}); err != nil {
				writeError(w, http.StatusBadRequest, "validation_error", "medicationId does not reference a medication")
				return
			}
			medicationID = sql.NullString{String: item.MedicationID, Valid: true}
		}
		var duration sql.NullInt64
		if item.DurationDays != nil {
			duration = sql.NullInt64{Int64: *item.DurationDays, Valid: true}
		}
		if _, err := qtx.CreatePrescriptionItem(r.Context(), db.CreatePrescriptionItemParams{
			ID: uuid.NewString(), ClinicID: p.ClinicID, PrescriptionID: prescription.ID,
			MedicationID: medicationID, MedicationName: strings.TrimSpace(item.MedicationName),
			Strength: item.Strength, DoseAmount: item.DoseAmount, DoseUnit: item.DoseUnit,
			Route: item.Route, Frequency: item.Frequency, DurationDays: duration,
			QuantityDispensed: item.QuantityDispensed, Instructions: item.Instructions,
			CreatedAt: now,
		}); err != nil {
			writeError(w, http.StatusInternalServerError, "internal", "could not save prescription item")
			return
		}
	}
	if err := tx.Commit(); err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not commit prescription")
		return
	}
	s.writePrescription(w, r, p, http.StatusCreated, prescription.ID)
}

func (s *Server) handleGetPrescription(w http.ResponseWriter, r *http.Request, p *principal) {
	s.writePrescription(w, r, p, http.StatusOK, r.PathValue("id"))
}

func (s *Server) handleListPrescriptions(w http.ResponseWriter, r *http.Request, p *principal) {
	petID := r.PathValue("id")
	if _, err := s.q.GetPet(r.Context(), db.GetPetParams{ClinicID: p.ClinicID, ID: petID}); err != nil {
		writeError(w, http.StatusNotFound, "not_found", "patient not found")
		return
	}
	page := pagination(r)
	rows, err := s.q.ListPrescriptionsByPet(r.Context(), db.ListPrescriptionsByPetParams{
		ClinicID: p.ClinicID, PetID: petID, Limit: page.Limit, Offset: page.Offset,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not list prescriptions")
		return
	}
	out := make([]prescriptionDTO, 0, len(rows))
	for _, row := range rows {
		items, _ := s.q.ListPrescriptionItems(r.Context(), db.ListPrescriptionItemsParams{
			ClinicID: p.ClinicID, PrescriptionID: row.ID,
		})
		out = append(out, prescriptionFrom(row, items))
	}
	writeJSON(w, http.StatusOK, map[string]any{"prescriptions": out})
}

func (s *Server) writePrescription(w http.ResponseWriter, r *http.Request, p *principal, status int, id string) {
	row, err := s.q.GetPrescription(r.Context(), db.GetPrescriptionParams{ClinicID: p.ClinicID, ID: id})
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusNotFound, "not_found", "prescription not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "internal", "could not load prescription")
		return
	}
	items, err := s.q.ListPrescriptionItems(r.Context(), db.ListPrescriptionItemsParams{
		ClinicID: p.ClinicID, PrescriptionID: row.ID,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not load prescription items")
		return
	}
	writeJSON(w, status, prescriptionFrom(row, items))
}

func (s *Server) handleListMedications(w http.ResponseWriter, r *http.Request, p *principal) {
	page := pagination(r)
	rows, err := s.q.ListMedications(r.Context(), db.ListMedicationsParams{
		ClinicID: p.ClinicID, Search: searchTerm(r),
		Limit: page.Limit, Offset: page.Offset,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not list medications")
		return
	}
	out := make([]medicationDTO, 0, len(rows))
	for _, row := range rows {
		out = append(out, medicationFrom(row))
	}
	writeJSON(w, http.StatusOK, map[string]any{"medications": out})
}

func (s *Server) handleCreateMedication(w http.ResponseWriter, r *http.Request, p *principal) {
	var req createMedicationRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_body", err.Error())
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	if msg := required(req.Name, "name"); msg != "" {
		writeError(w, http.StatusBadRequest, "validation_error", msg)
		return
	}
	now := db.UtcNow()
	row, err := s.q.CreateMedication(r.Context(), db.CreateMedicationParams{
		ID: uuid.NewString(), ClinicID: p.ClinicID, Name: req.Name,
		Strength: req.Strength, Form: req.Form, IsActive: 1,
		CreatedAt: now, UpdatedAt: now,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not create medication")
		return
	}
	writeJSON(w, http.StatusCreated, medicationFrom(row))
}

func (s *Server) handleUpdateMedication(w http.ResponseWriter, r *http.Request, p *principal) {
	var req updateMedicationRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_body", err.Error())
		return
	}
	current, err := s.q.GetMedication(r.Context(), db.GetMedicationParams{
		ClinicID: p.ClinicID, ID: r.PathValue("id"),
	})
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusNotFound, "not_found", "medication not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "internal", "could not load medication")
		return
	}
	name := strings.TrimSpace(valueOr(req.Name, current.Name))
	if name == "" {
		writeError(w, http.StatusBadRequest, "validation_error", "name cannot be empty")
		return
	}
	active := current.IsActive
	if req.Active != nil {
		if *req.Active {
			active = 1
		} else {
			active = 0
		}
	}
	row, err := s.q.UpdateMedication(r.Context(), db.UpdateMedicationParams{
		Name: name, Strength: valueOr(req.Strength, current.Strength),
		Form: valueOr(req.Form, current.Form), IsActive: active,
		UpdatedAt: db.UtcNow(), ClinicID: p.ClinicID, ID: r.PathValue("id"),
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not update medication")
		return
	}
	writeJSON(w, http.StatusOK, medicationFrom(row))
}
