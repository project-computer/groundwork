package api

import (
	"database/sql"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/project-computer/groundwork/server/internal/offlineapi/db"
)

type createPetRequest struct {
	OwnerID         string `json:"ownerId"`
	Name            string `json:"name"`
	Species         string `json:"species"`
	Breed           string `json:"breed"`
	Sex             string `json:"sex"`
	DateOfBirth     string `json:"dateOfBirth"`
	Color           string `json:"color"`
	MicrochipNumber string `json:"microchipNumber"`
	Notes           string `json:"notes"`
}

type updatePetRequest struct {
	OwnerID         *string `json:"ownerId"`
	Name            *string `json:"name"`
	Species         *string `json:"species"`
	Breed           *string `json:"breed"`
	Sex             *string `json:"sex"`
	DateOfBirth     *string `json:"dateOfBirth"`
	Color           *string `json:"color"`
	MicrochipNumber *string `json:"microchipNumber"`
	Notes           *string `json:"notes"`
}

type createWeightRequest struct {
	WeightGrams int64  `json:"weightGrams"`
	MeasuredAt  string `json:"measuredAt"`
}

func (s *Server) handleListPets(w http.ResponseWriter, r *http.Request, p *principal) {
	page := pagination(r)
	rows, err := s.q.ListPets(r.Context(), db.ListPetsParams{
		ClinicID: p.ClinicID,
		Search:   searchTerm(r),
		Limit:    page.Limit,
		Offset:   page.Offset,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not list pets")
		return
	}
	out := make([]petDTO, 0, len(rows))
	for _, row := range rows {
		out = append(out, petFrom(db.Pet{
			ID: row.ID, ClinicID: row.ClinicID, OwnerID: row.OwnerID,
			Mrn: row.Mrn, Name: row.Name, Species: row.Species, Breed: row.Breed,
			Sex: row.Sex, DateOfBirth: row.DateOfBirth, Color: row.Color,
			MicrochipNumber: row.MicrochipNumber, Notes: row.Notes,
			CreatedAt: row.CreatedAt, UpdatedAt: row.UpdatedAt,
		}, row.OwnerName, row.OwnerPhone))
	}
	writeJSON(w, http.StatusOK, map[string]any{"pets": out})
}

func (s *Server) handleCreatePet(w http.ResponseWriter, r *http.Request, p *principal) {
	var req createPetRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_body", err.Error())
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	req.Species = strings.TrimSpace(req.Species)
	for _, check := range []struct {
		value string
		field string
	}{
		{req.OwnerID, "ownerId"},
		{req.Name, "name"},
		{req.Species, "species"},
	} {
		if msg := required(check.value, check.field); msg != "" {
			writeError(w, http.StatusBadRequest, "validation_error", msg)
			return
		}
	}
	if !validSex(req.Sex) {
		writeError(w, http.StatusBadRequest, "validation_error", "sex must be male, female or unknown")
		return
	}

	if _, err := s.q.GetOwner(r.Context(), db.GetOwnerParams{
		ClinicID: p.ClinicID, ID: req.OwnerID,
	}); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusBadRequest, "validation_error", "ownerId does not reference an owner")
			return
		}
		writeError(w, http.StatusInternalServerError, "internal", "could not verify owner")
		return
	}

	count, err := s.q.CountPets(r.Context(), p.ClinicID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not allocate MRN")
		return
	}
	mrn := fmt.Sprintf("PT-%s-%04d", time.Now().UTC().Format("2006"), count+1)
	now := db.UtcNow()
	row, err := s.q.CreatePet(r.Context(), db.CreatePetParams{
		ID: uuid.NewString(), ClinicID: p.ClinicID, OwnerID: req.OwnerID,
		Mrn: mrn, Name: req.Name, Species: req.Species, Breed: req.Breed,
		Sex: defaultSex(req.Sex), DateOfBirth: req.DateOfBirth, Color: req.Color,
		MicrochipNumber: req.MicrochipNumber, Notes: req.Notes,
		CreatedAt: now, UpdatedAt: now,
	})
	if err != nil {
		if strings.Contains(err.Error(), "UNIQUE constraint failed") {
			writeError(w, http.StatusConflict, "conflict", "a patient with that MRN or microchip already exists")
			return
		}
		writeError(w, http.StatusInternalServerError, "internal", "could not create patient")
		return
	}
	writeJSON(w, http.StatusCreated, petFrom(row, "", ""))
}

func (s *Server) handleGetPet(w http.ResponseWriter, r *http.Request, p *principal) {
	row, err := s.q.GetPet(r.Context(), db.GetPetParams{
		ClinicID: p.ClinicID, ID: r.PathValue("id"),
	})
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusNotFound, "not_found", "patient not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "internal", "could not load patient")
		return
	}
	writeJSON(w, http.StatusOK, petFrom(GetPetRowToPet(row), row.OwnerName, row.OwnerPhone))
}

func (s *Server) handleUpdatePet(w http.ResponseWriter, r *http.Request, p *principal) {
	var req updatePetRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_body", err.Error())
		return
	}
	current, err := s.q.GetPet(r.Context(), db.GetPetParams{
		ClinicID: p.ClinicID, ID: r.PathValue("id"),
	})
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusNotFound, "not_found", "patient not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "internal", "could not load patient")
		return
	}
	ownerID := valueOr(req.OwnerID, current.OwnerID)
	if _, err := s.q.GetOwner(r.Context(), db.GetOwnerParams{
		ClinicID: p.ClinicID, ID: ownerID,
	}); err != nil {
		writeError(w, http.StatusBadRequest, "validation_error", "ownerId does not reference an owner")
		return
	}
	sex := valueOr(req.Sex, current.Sex)
	if !validSex(sex) {
		writeError(w, http.StatusBadRequest, "validation_error", "sex must be male, female or unknown")
		return
	}
	name := strings.TrimSpace(valueOr(req.Name, current.Name))
	species := strings.TrimSpace(valueOr(req.Species, current.Species))
	if name == "" || species == "" {
		writeError(w, http.StatusBadRequest, "validation_error", "name and species cannot be empty")
		return
	}
	row, err := s.q.UpdatePet(r.Context(), db.UpdatePetParams{
		OwnerID: ownerID, Name: name, Species: species,
		Breed:           valueOr(req.Breed, current.Breed),
		Sex:             sex,
		DateOfBirth:     valueOr(req.DateOfBirth, current.DateOfBirth),
		Color:           valueOr(req.Color, current.Color),
		MicrochipNumber: valueOr(req.MicrochipNumber, current.MicrochipNumber),
		Notes:           valueOr(req.Notes, current.Notes),
		UpdatedAt:       db.UtcNow(),
		ClinicID:        p.ClinicID,
		ID:              r.PathValue("id"),
	})
	if err != nil {
		if strings.Contains(err.Error(), "UNIQUE constraint failed") {
			writeError(w, http.StatusConflict, "conflict", "that microchip is already registered")
			return
		}
		writeError(w, http.StatusInternalServerError, "internal", "could not update patient")
		return
	}
	writeJSON(w, http.StatusOK, petFrom(row, "", ""))
}

func (s *Server) handleListWeights(w http.ResponseWriter, r *http.Request, p *principal) {
	rows, err := s.q.ListPetWeights(r.Context(), db.ListPetWeightsParams{
		ClinicID: p.ClinicID, PetID: r.PathValue("id"),
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not list weights")
		return
	}
	out := make([]weightDTO, 0, len(rows))
	for _, row := range rows {
		out = append(out, weightFrom(row))
	}
	writeJSON(w, http.StatusOK, map[string]any{"weights": out})
}

func (s *Server) handleCreateWeight(w http.ResponseWriter, r *http.Request, p *principal) {
	var req createWeightRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_body", err.Error())
		return
	}
	if req.WeightGrams <= 0 {
		writeError(w, http.StatusBadRequest, "validation_error", "weightGrams must be greater than zero")
		return
	}
	petID := r.PathValue("id")
	if _, err := s.q.GetPet(r.Context(), db.GetPetParams{
		ClinicID: p.ClinicID, ID: petID,
	}); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusNotFound, "not_found", "patient not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "internal", "could not load patient")
		return
	}
	measuredAt := req.MeasuredAt
	if measuredAt == "" {
		measuredAt = db.UtcNow()
	}
	row, err := s.q.CreatePetWeight(r.Context(), db.CreatePetWeightParams{
		ID: uuid.NewString(), ClinicID: p.ClinicID, PetID: petID,
		WeightGrams: req.WeightGrams, MeasuredAt: measuredAt,
		RecordedBy: sql.NullString{String: p.UserID, Valid: true},
		CreatedAt:  db.UtcNow(),
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not record weight")
		return
	}
	writeJSON(w, http.StatusCreated, weightFrom(row))
}

func validSex(sex string) bool {
	switch sex {
	case "", "male", "female", "unknown":
		return true
	default:
		return false
	}
}

func defaultSex(sex string) string {
	if sex == "" {
		return "unknown"
	}
	return sex
}

// GetPetRowToPet narrows the join row to the base patient fields.
func GetPetRowToPet(row db.GetPetRow) db.Pet {
	return db.Pet{
		ID: row.ID, ClinicID: row.ClinicID, OwnerID: row.OwnerID,
		Mrn: row.Mrn, Name: row.Name, Species: row.Species, Breed: row.Breed,
		Sex: row.Sex, DateOfBirth: row.DateOfBirth, Color: row.Color,
		MicrochipNumber: row.MicrochipNumber, Notes: row.Notes,
		CreatedAt: row.CreatedAt, UpdatedAt: row.UpdatedAt,
	}
}
