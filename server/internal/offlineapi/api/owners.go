package api

import (
	"database/sql"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/google/uuid"

	"github.com/project-computer/groundwork/server/internal/offlineapi/db"
)

type createOwnerRequest struct {
	// Optional client-minted id (ADR 0025): the offline-first client owns
	// identity so the document and the normalized store never diverge. Must
	// be a UUID when present; absent means the server mints one.
	ID                    string `json:"id"`
	Name                  string `json:"name"`
	Phone                 string `json:"phone"`
	Email                 string `json:"email"`
	Address               string `json:"address"`
	SecondaryContactName  string `json:"secondaryContactName"`
	SecondaryContactPhone string `json:"secondaryContactPhone"`
	Notes                 string `json:"notes"`
}

// requestID validates an optional client-minted id: empty means mint one.
func requestID(raw string) (string, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return uuid.NewString(), nil
	}
	parsed, err := uuid.Parse(raw)
	if err != nil {
		return "", fmt.Errorf("id must be a UUID")
	}
	return parsed.String(), nil
}

type updateOwnerRequest struct {
	Name                  *string `json:"name"`
	Phone                 *string `json:"phone"`
	Email                 *string `json:"email"`
	Address               *string `json:"address"`
	SecondaryContactName  *string `json:"secondaryContactName"`
	SecondaryContactPhone *string `json:"secondaryContactPhone"`
	Notes                 *string `json:"notes"`
}

func (s *Server) handleListOwners(w http.ResponseWriter, r *http.Request, p *principal) {
	page := pagination(r)
	rows, err := s.q.ListOwners(r.Context(), db.ListOwnersParams{
		ClinicID: p.ClinicID,
		Search:   searchTerm(r),
		Limit:    page.Limit,
		Offset:   page.Offset,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not list owners")
		return
	}
	out := make([]ownerDTO, 0, len(rows))
	for _, row := range rows {
		out = append(out, ownerFrom(row))
	}
	writeJSON(w, http.StatusOK, map[string]any{"owners": out})
}

func (s *Server) handleCreateOwner(w http.ResponseWriter, r *http.Request, p *principal) {
	var req createOwnerRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_body", err.Error())
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	req.Phone = strings.TrimSpace(req.Phone)
	if msg := required(req.Name, "name"); msg != "" {
		writeError(w, http.StatusBadRequest, "validation_error", msg)
		return
	}
	if msg := required(req.Phone, "phone"); msg != "" {
		writeError(w, http.StatusBadRequest, "validation_error", msg)
		return
	}
	now := db.UtcNow()
	clientID, idErr := requestID(req.ID)
	if idErr != nil {
		writeError(w, http.StatusBadRequest, "validation_error", idErr.Error())
		return
	}
	row, err := s.q.CreateOwner(r.Context(), db.CreateOwnerParams{
		ID: clientID, ClinicID: p.ClinicID, Name: req.Name,
		Phone: req.Phone, Email: req.Email, Address: req.Address,
		SecondaryContactName:  req.SecondaryContactName,
		SecondaryContactPhone: req.SecondaryContactPhone,
		Notes:                 req.Notes,
		CreatedAt:             now, UpdatedAt: now,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not create owner")
		return
	}
	writeJSON(w, http.StatusCreated, ownerFrom(row))
}

func (s *Server) handleGetOwner(w http.ResponseWriter, r *http.Request, p *principal) {
	row, err := s.q.GetOwner(r.Context(), db.GetOwnerParams{
		ClinicID: p.ClinicID, ID: r.PathValue("id"),
	})
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusNotFound, "not_found", "owner not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "internal", "could not load owner")
		return
	}
	writeJSON(w, http.StatusOK, ownerFrom(row))
}

func (s *Server) handleUpdateOwner(w http.ResponseWriter, r *http.Request, p *principal) {
	var req updateOwnerRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_body", err.Error())
		return
	}
	current, err := s.q.GetOwner(r.Context(), db.GetOwnerParams{
		ClinicID: p.ClinicID, ID: r.PathValue("id"),
	})
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusNotFound, "not_found", "owner not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "internal", "could not load owner")
		return
	}
	name := valueOr(req.Name, current.Name)
	phone := valueOr(req.Phone, current.Phone)
	if strings.TrimSpace(name) == "" || strings.TrimSpace(phone) == "" {
		writeError(w, http.StatusBadRequest, "validation_error", "name and phone cannot be empty")
		return
	}
	row, err := s.q.UpdateOwner(r.Context(), db.UpdateOwnerParams{
		Name: name, Phone: phone,
		Email:                 valueOr(req.Email, current.Email),
		Address:               valueOr(req.Address, current.Address),
		SecondaryContactName:  valueOr(req.SecondaryContactName, current.SecondaryContactName),
		SecondaryContactPhone: valueOr(req.SecondaryContactPhone, current.SecondaryContactPhone),
		Notes:                 valueOr(req.Notes, current.Notes),
		UpdatedAt:             db.UtcNow(),
		ClinicID:              p.ClinicID,
		ID:                    r.PathValue("id"),
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not update owner")
		return
	}
	writeJSON(w, http.StatusOK, ownerFrom(row))
}

func valueOr(value *string, fallback string) string {
	if value == nil {
		return fallback
	}
	return *value
}
