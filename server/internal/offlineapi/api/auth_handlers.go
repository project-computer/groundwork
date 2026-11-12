package api

import (
	"database/sql"
	"errors"
	"net/http"
	"strings"

	"github.com/google/uuid"

	"github.com/project-computer/groundwork/server/internal/offlineapi/auth"
	"github.com/project-computer/groundwork/server/internal/offlineapi/db"
)

type setupRequest struct {
	ClinicName string `json:"clinicName"`
	AdminName  string `json:"adminName"`
	Username   string `json:"username"`
	PIN        string `json:"pin"`
	Address    string `json:"address"`
	Phone      string `json:"phone"`
	Email      string `json:"email"`
	Currency   string `json:"currency"`
	Locale     string `json:"locale"`
	Timezone   string `json:"timezone"`
}

type sessionResponse struct {
	Token     string    `json:"token"`
	ExpiresAt string    `json:"expiresAt"`
	User      userDTO   `json:"user"`
	Clinic    clinicDTO `json:"clinic"`
}

func (s *Server) handleSetup(w http.ResponseWriter, r *http.Request) {
	var req setupRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_body", err.Error())
		return
	}
	req.ClinicName = strings.TrimSpace(req.ClinicName)
	req.AdminName = strings.TrimSpace(req.AdminName)
	req.Username = strings.TrimSpace(req.Username)
	for _, check := range []struct {
		value string
		field string
	}{
		{req.ClinicName, "clinicName"},
		{req.AdminName, "adminName"},
		{req.Username, "username"},
	} {
		if msg := required(check.value, check.field); msg != "" {
			writeError(w, http.StatusBadRequest, "validation_error", msg)
			return
		}
	}
	if !auth.ValidPIN(req.PIN) {
		writeError(w, http.StatusBadRequest, "validation_error", "pin must be 4-8 digits")
		return
	}
	if req.Currency == "" {
		req.Currency = "THB"
	}
	if req.Locale == "" {
		req.Locale = "th"
	}
	if req.Timezone == "" {
		req.Timezone = "Asia/Bangkok"
	}

	open, err := s.requireSetupOpen(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not read clinic state")
		return
	}
	if !open {
		writeError(w, http.StatusConflict, "already_initialized", "this clinic has already been set up")
		return
	}

	pinHash, err := auth.HashPIN(req.PIN)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not hash PIN")
		return
	}

	tx, err := s.sqlDB.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not start setup")
		return
	}
	defer tx.Rollback()
	qtx := db.New(tx)

	now := db.UtcNow()
	clinic, err := qtx.CreateClinic(r.Context(), db.CreateClinicParams{
		ID: uuid.NewString(), Name: req.ClinicName, Address: req.Address,
		Phone: req.Phone, Email: req.Email, Currency: req.Currency,
		Locale: req.Locale, Timezone: req.Timezone,
		CreatedAt: now, UpdatedAt: now,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not create clinic")
		return
	}
	user, err := qtx.CreateUser(r.Context(), db.CreateUserParams{
		ID: uuid.NewString(), ClinicID: clinic.ID, Name: req.AdminName,
		Username: req.Username, PinHash: pinHash, Active: 1,
		CreatedAt: now, UpdatedAt: now,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not create admin user")
		return
	}
	if err := qtx.AssignRole(r.Context(), db.AssignRoleParams{
		UserID: user.ID, RoleID: "role-" + auth.RoleAdmin,
	}); err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not assign admin role")
		return
	}
	token, expiresAt, err := s.issueSession(r.Context(), qtx, user)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not create session")
		return
	}
	if err := tx.Commit(); err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not commit setup")
		return
	}

	writeJSON(w, http.StatusCreated, sessionResponse{
		Token: token, ExpiresAt: expiresAt,
		User:   userFrom(user, []string{auth.RoleAdmin}),
		Clinic: clinicFrom(clinic),
	})
}

type loginRequest struct {
	Username string `json:"username"`
	PIN      string `json:"pin"`
}

func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	var req loginRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_body", err.Error())
		return
	}
	req.Username = strings.TrimSpace(req.Username)
	if req.Username == "" || req.PIN == "" {
		writeError(w, http.StatusBadRequest, "validation_error", "username and pin are required")
		return
	}

	user, err := s.q.GetActiveUserByUsername(r.Context(), req.Username)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusUnauthorized, "invalid_credentials", "username or PIN is incorrect")
			return
		}
		writeError(w, http.StatusInternalServerError, "internal", "could not load user")
		return
	}
	if !auth.VerifyPIN(user.PinHash, req.PIN) {
		writeError(w, http.StatusUnauthorized, "invalid_credentials", "username or PIN is incorrect")
		return
	}
	roles, err := s.q.ListUserRoles(r.Context(), user.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not load roles")
		return
	}
	clinic, err := s.q.GetClinic(r.Context(), user.ClinicID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not load clinic")
		return
	}
	token, expiresAt, err := s.issueSession(r.Context(), s.q, user)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not create session")
		return
	}
	writeJSON(w, http.StatusOK, sessionResponse{
		Token: token, ExpiresAt: expiresAt,
		User:   userFrom(user, roles),
		Clinic: clinicFrom(clinic),
	})
}

func (s *Server) handleLogout(w http.ResponseWriter, r *http.Request, p *principal) {
	if err := s.q.DeleteSession(r.Context(), p.TokenHash); err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not end session")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleMe(w http.ResponseWriter, r *http.Request, p *principal) {
	user, err := s.q.GetUserByID(r.Context(), p.UserID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not load user")
		return
	}
	clinic, err := s.q.GetClinic(r.Context(), p.ClinicID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not load clinic")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"user":   userFrom(user, p.Roles),
		"clinic": clinicFrom(clinic),
	})
}
