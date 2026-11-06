package api

import (
	"context"
	"database/sql"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/project-computer/groundwork/server/internal/offlineapi/db"
)

var appointmentStatuses = map[string]bool{
	"scheduled": true, "arrived": true, "in_progress": true,
	"completed": true, "cancelled": true, "no_show": true,
}

// appointmentTransitions is the status flow from plan APT-08. Same-state
// updates are allowed; closed states are terminal.
var appointmentTransitions = map[string]map[string]bool{
	"scheduled":   {"arrived": true, "cancelled": true, "no_show": true, "completed": true},
	"arrived":     {"in_progress": true, "cancelled": true, "completed": true},
	"in_progress": {"completed": true, "cancelled": true},
}

type createAppointmentRequest struct {
	PetID           string `json:"petId"`
	VeterinarianID  string `json:"veterinarianId"`
	ScheduledAt     string `json:"scheduledAt"`
	DurationMinutes int64  `json:"durationMinutes"`
	Reason          string `json:"reason"`
	Notes           string `json:"notes"`
	WalkIn          bool   `json:"walkIn"`
}

type updateAppointmentRequest struct {
	PetID              *string `json:"petId"`
	VeterinarianID     *string `json:"veterinarianId"`
	ScheduledAt        *string `json:"scheduledAt"`
	DurationMinutes    *int64  `json:"durationMinutes"`
	Reason             *string `json:"reason"`
	Notes              *string `json:"notes"`
	Status             *string `json:"status"`
	CancellationReason *string `json:"cancellationReason"`
}

func (s *Server) handleListAppointments(w http.ResponseWriter, r *http.Request, p *principal) {
	page := pagination(r)
	from, err := normalizeRangeBound(r.URL.Query().Get("from"), false)
	if err != nil {
		writeError(w, http.StatusBadRequest, "validation_error", "from must be a date or RFC3339 timestamp")
		return
	}
	to, err := normalizeRangeBound(r.URL.Query().Get("to"), true)
	if err != nil {
		writeError(w, http.StatusBadRequest, "validation_error", "to must be a date or RFC3339 timestamp")
		return
	}
	status := strings.TrimSpace(r.URL.Query().Get("status"))
	if status != "" && !appointmentStatuses[status] {
		writeError(w, http.StatusBadRequest, "validation_error", "unknown appointment status")
		return
	}
	rows, err := s.q.ListAppointments(r.Context(), db.ListAppointmentsParams{
		ClinicID: p.ClinicID, FromAt: from, ToAt: to, Status: status,
		PetID: strings.TrimSpace(r.URL.Query().Get("petId")),
		Limit: page.Limit, Offset: page.Offset,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not list appointments")
		return
	}
	out := make([]appointmentDTO, 0, len(rows))
	for _, row := range rows {
		out = append(out, appointmentFromList(row))
	}
	writeJSON(w, http.StatusOK, map[string]any{"appointments": out})
}

func (s *Server) handleCreateAppointment(w http.ResponseWriter, r *http.Request, p *principal) {
	var req createAppointmentRequest
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
	vet, err := s.optionalVet(r.Context(), p.ClinicID, req.VeterinarianID)
	if err != nil {
		writeError(w, http.StatusBadRequest, "validation_error", err.Error())
		return
	}
	scheduledAt := req.ScheduledAt
	if scheduledAt == "" {
		scheduledAt = db.UtcNow()
	} else if _, err := time.Parse(time.RFC3339, scheduledAt); err != nil {
		writeError(w, http.StatusBadRequest, "validation_error", "scheduledAt must be an RFC3339 timestamp")
		return
	}
	duration := req.DurationMinutes
	if duration <= 0 {
		duration = 30
	}
	status := "scheduled"
	var checkedIn sql.NullString
	if req.WalkIn {
		status = "arrived"
		checkedIn = sql.NullString{String: db.UtcNow(), Valid: true}
	}
	now := db.UtcNow()
	created, err := s.q.CreateAppointment(r.Context(), db.CreateAppointmentParams{
		ID: uuid.NewString(), ClinicID: p.ClinicID, PetID: req.PetID,
		VeterinarianID: vet, ScheduledAt: scheduledAt, DurationMinutes: duration,
		Reason: req.Reason, Status: status, CancellationReason: "",
		CheckedInAt: checkedIn, Notes: req.Notes, CreatedAt: now, UpdatedAt: now,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not create appointment")
		return
	}
	s.writeAppointment(w, r, p, http.StatusCreated, created.ID)
}

func (s *Server) handleUpdateAppointment(w http.ResponseWriter, r *http.Request, p *principal) {
	var req updateAppointmentRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_body", err.Error())
		return
	}
	row, err := s.q.GetAppointment(r.Context(), db.GetAppointmentParams{
		ClinicID: p.ClinicID, ID: r.PathValue("id"),
	})
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusNotFound, "not_found", "appointment not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "internal", "could not load appointment")
		return
	}
	current := appointmentFields(row)
	petID := valueOr(req.PetID, current.PetID)
	if petID != current.PetID {
		if _, err := s.q.GetPet(r.Context(), db.GetPetParams{ClinicID: p.ClinicID, ID: petID}); err != nil {
			writeError(w, http.StatusBadRequest, "validation_error", "petId does not reference a patient")
			return
		}
	}
	vetID := nullString(current.VeterinarianID)
	if req.VeterinarianID != nil {
		vetID = *req.VeterinarianID
	}
	vet, err := s.optionalVet(r.Context(), p.ClinicID, vetID)
	if err != nil {
		writeError(w, http.StatusBadRequest, "validation_error", err.Error())
		return
	}
	scheduledAt := valueOr(req.ScheduledAt, current.ScheduledAt)
	if _, err := time.Parse(time.RFC3339, scheduledAt); err != nil {
		writeError(w, http.StatusBadRequest, "validation_error", "scheduledAt must be an RFC3339 timestamp")
		return
	}
	status := current.Status
	if req.Status != nil {
		status = *req.Status
	}
	if !appointmentStatuses[status] {
		writeError(w, http.StatusBadRequest, "validation_error", "unknown appointment status")
		return
	}
	if status != current.Status && !appointmentTransitions[current.Status][status] {
		writeError(w, http.StatusBadRequest, "invalid_transition", "appointment cannot move from "+current.Status+" to "+status)
		return
	}
	cancellationReason := valueOr(req.CancellationReason, current.CancellationReason)
	if status == "cancelled" && strings.TrimSpace(cancellationReason) == "" {
		writeError(w, http.StatusBadRequest, "validation_error", "cancellationReason is required when cancelling")
		return
	}
	checkedInAt := current.CheckedInAt
	startedAt := current.StartedAt
	completedAt := current.CompletedAt
	now := db.UtcNow()
	if status != current.Status {
		switch status {
		case "arrived":
			if !checkedInAt.Valid {
				checkedInAt = sql.NullString{String: now, Valid: true}
			}
		case "in_progress":
			if !startedAt.Valid {
				startedAt = sql.NullString{String: now, Valid: true}
			}
		case "completed":
			if !completedAt.Valid {
				completedAt = sql.NullString{String: now, Valid: true}
			}
		}
	}
	duration := current.DurationMinutes
	if req.DurationMinutes != nil && *req.DurationMinutes > 0 {
		duration = *req.DurationMinutes
	}
	if _, err := s.q.UpdateAppointment(r.Context(), db.UpdateAppointmentParams{
		PetID: petID, VeterinarianID: vet, ScheduledAt: scheduledAt,
		DurationMinutes: duration, Reason: valueOr(req.Reason, current.Reason),
		Status: status, CancellationReason: cancellationReason,
		CheckedInAt: checkedInAt, StartedAt: startedAt, CompletedAt: completedAt,
		Notes: valueOr(req.Notes, current.Notes), UpdatedAt: now,
		ClinicID: p.ClinicID, ID: r.PathValue("id"),
	}); err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not update appointment")
		return
	}
	s.writeAppointment(w, r, p, http.StatusOK, r.PathValue("id"))
}

func (s *Server) writeAppointment(w http.ResponseWriter, r *http.Request, p *principal, status int, id string) {
	row, err := s.q.GetAppointment(r.Context(), db.GetAppointmentParams{ClinicID: p.ClinicID, ID: id})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not reload appointment")
		return
	}
	writeJSON(w, status, appointmentFromGet(row))
}

// optionalVet validates an optional veterinarian reference.
func (s *Server) optionalVet(ctx context.Context, clinicID, userID string) (sql.NullString, error) {
	if strings.TrimSpace(userID) == "" {
		return sql.NullString{}, nil
	}
	user, err := s.q.GetUserByID(ctx, userID)
	if err != nil || user.ClinicID != clinicID {
		return sql.NullString{}, errors.New("veterinarianId does not reference a user in this clinic")
	}
	return sql.NullString{String: user.ID, Valid: true}, nil
}

func normalizeRangeBound(raw string, endOfDay bool) (string, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return "", nil
	}
	if parsed, err := time.Parse(time.RFC3339, raw); err == nil {
		return parsed.UTC().Format("2006-01-02T15:04:05.000Z07:00"), nil
	}
	if parsed, err := time.Parse("2006-01-02", raw); err == nil {
		if endOfDay {
			parsed = parsed.Add(24*time.Hour - time.Millisecond)
		}
		return parsed.UTC().Format("2006-01-02T15:04:05.000Z07:00"), nil
	}
	return "", errors.New("invalid date")
}
