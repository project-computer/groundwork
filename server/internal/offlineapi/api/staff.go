package api

import (
	"database/sql"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/google/uuid"

	"github.com/project-computer/groundwork/server/internal/offlineapi/auth"
	"github.com/project-computer/groundwork/server/internal/offlineapi/db"
)

// Staff directory (pre-auth). The lock screen must map a member to a
// username before it can call /api/v1/auth/login, so this route sits behind
// the loopback secret only — like backups, it carries no bearer requirement.
// PIN material never appears here: no hashes, no salts. The database serves
// exactly one clinic (ADR 0019), so the query carries no clinic parameter.

type staffDTO struct {
	ID       string `json:"id"`
	Username string `json:"username"`
	Name     string `json:"name"`
	Active   bool   `json:"active"`
}

func staffFrom(row db.ListAllStaffRow) staffDTO {
	return staffDTO{
		ID: row.ID, Username: row.Username, Name: row.Name, Active: row.Active == 1,
	}
}

func (s *Server) handleListStaff(w http.ResponseWriter, r *http.Request) {
	rows, err := s.q.ListAllStaff(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not list staff")
		return
	}
	out := make([]staffDTO, 0, len(rows))
	for _, row := range rows {
		out = append(out, staffFrom(row))
	}
	writeJSON(w, http.StatusOK, map[string]any{"users": out})
}

// --- staff management (issue 0019) -------------------------------------------
// Admin-gated mutations, each committing with its audit event. Deactivation
// and PIN resets also delete the member's sessions, so a changed credential
// takes effect immediately.

type createStaffRequest struct {
	Name     string `json:"name"`
	Username string `json:"username"`
	Role     string `json:"role"`
	Active   *bool  `json:"active"`
	PIN      string `json:"pin"`
}

type updateStaffRequest struct {
	Name   *string `json:"name"`
	Role   *string `json:"role"`
	Active *bool   `json:"active"`
}

type setStaffPINRequest struct {
	PIN string `json:"pin"`
}

func (s *Server) handleGetStaff(w http.ResponseWriter, r *http.Request, p *principal) {
	user, err := s.q.GetUserByID(r.Context(), r.PathValue("id"))
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusNotFound, "not_found", "staff member not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "internal", "could not load staff member")
		return
	}
	roles, err := s.q.ListUserRoles(r.Context(), user.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not load roles")
		return
	}
	writeJSON(w, http.StatusOK, userFrom(user, roles))
}

func (s *Server) handleCreateStaff(w http.ResponseWriter, r *http.Request, p *principal) {
	var req createStaffRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_body", err.Error())
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	req.Username = strings.TrimSpace(req.Username)
	if msg := required(req.Name, "name"); msg != "" {
		writeError(w, http.StatusBadRequest, "validation_error", msg)
		return
	}
	if msg := required(req.Username, "username"); msg != "" {
		writeError(w, http.StatusBadRequest, "validation_error", msg)
		return
	}
	if !auth.IsKnownRole(req.Role) {
		writeError(w, http.StatusBadRequest, "validation_error", "role must be admin, veterinarian, receptionist or pharmacist")
		return
	}
	pinHash := ""
	if req.PIN != "" {
		if !auth.ValidPIN(req.PIN) {
			writeError(w, http.StatusBadRequest, "validation_error", "pin must be 4-8 digits")
			return
		}
		hash, err := auth.HashPIN(req.PIN)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "internal", "could not hash PIN")
			return
		}
		pinHash = hash
	}
	active := int64(1)
	if req.Active != nil && !*req.Active {
		active = 0
	}

	now := db.UtcNow()
	tx, err := s.sqlDB.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not start creation")
		return
	}
	defer tx.Rollback()
	qtx := db.New(tx)
	user, err := qtx.CreateUser(r.Context(), db.CreateUserParams{
		ID: uuid.NewString(), ClinicID: p.ClinicID, Name: req.Name,
		Username: req.Username, PinHash: pinHash, Active: active,
		CreatedAt: now, UpdatedAt: now,
	})
	if err != nil {
		if strings.Contains(err.Error(), "UNIQUE constraint failed") {
			writeError(w, http.StatusConflict, "conflict", "that username is already taken")
			return
		}
		writeError(w, http.StatusInternalServerError, "internal", "could not create staff member")
		return
	}
	if err := qtx.AssignRole(r.Context(), db.AssignRoleParams{
		UserID: user.ID, RoleID: "role-" + req.Role,
	}); err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not assign role")
		return
	}
	if err := s.appendAudit(r.Context(), qtx, p, "staff.created", "user",
		user.ID, fmt.Sprintf("created %s (%s)", user.Name, req.Role),
		map[string]any{"username": user.Username, "role": req.Role},
	); err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not audit creation")
		return
	}
	if err := tx.Commit(); err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not commit creation")
		return
	}
	roles, err := s.q.ListUserRoles(r.Context(), user.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not load roles")
		return
	}
	writeJSON(w, http.StatusCreated, userFrom(user, roles))
}

func (s *Server) handleUpdateStaff(w http.ResponseWriter, r *http.Request, p *principal) {
	var req updateStaffRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_body", err.Error())
		return
	}
	current, err := s.q.GetUserByID(r.Context(), r.PathValue("id"))
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusNotFound, "not_found", "staff member not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "internal", "could not load staff member")
		return
	}
	changed := map[string]any{}

	now := db.UtcNow()
	tx, err := s.sqlDB.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not start update")
		return
	}
	defer tx.Rollback()
	qtx := db.New(tx)

	if req.Name != nil {
		name := strings.TrimSpace(*req.Name)
		if name == "" {
			writeError(w, http.StatusBadRequest, "validation_error", "name cannot be empty")
			return
		}
		if _, err := qtx.UpdateUser(r.Context(), db.UpdateUserParams{
			Name: name, UpdatedAt: now, ClinicID: p.ClinicID, ID: current.ID,
		}); err != nil {
			writeError(w, http.StatusInternalServerError, "internal", "could not rename staff member")
			return
		}
		current.Name = name
		changed["name"] = name
	}
	if req.Active != nil {
		active := int64(0)
		if *req.Active {
			active = 1
		}
		if err := qtx.SetUserActive(r.Context(), db.SetUserActiveParams{
			Active: active, UpdatedAt: now, ClinicID: p.ClinicID, ID: current.ID,
		}); err != nil {
			writeError(w, http.StatusInternalServerError, "internal", "could not change activation")
			return
		}
		// A deactivated member's sessions die immediately: the next call is a
		// fresh login attempt (issue acceptance: blocked at next login).
		if err := qtx.DeleteSessionsByUser(r.Context(), current.ID); err != nil {
			writeError(w, http.StatusInternalServerError, "internal", "could not end sessions")
			return
		}
		current.Active = active
		changed["active"] = *req.Active
	}
	if req.Role != nil {
		if !auth.IsKnownRole(*req.Role) {
			writeError(w, http.StatusBadRequest, "validation_error", "role must be admin, veterinarian, receptionist or pharmacist")
			return
		}
		if err := qtx.ClearUserRoles(r.Context(), current.ID); err != nil {
			writeError(w, http.StatusInternalServerError, "internal", "could not clear roles")
			return
		}
		if err := qtx.AssignRole(r.Context(), db.AssignRoleParams{
			UserID: current.ID, RoleID: "role-" + *req.Role,
		}); err != nil {
			writeError(w, http.StatusInternalServerError, "internal", "could not assign role")
			return
		}
		changed["role"] = *req.Role
	}
	if len(changed) == 0 {
		writeError(w, http.StatusBadRequest, "validation_error", "nothing to update")
		return
	}
	if err := s.appendAudit(r.Context(), qtx, p, "staff.updated", "user",
		current.ID, fmt.Sprintf("updated %s", current.Name), changed,
	); err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not audit update")
		return
	}
	if err := tx.Commit(); err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not commit update")
		return
	}
	roles, err := s.q.ListUserRoles(r.Context(), current.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not load roles")
		return
	}
	writeJSON(w, http.StatusOK, userFrom(current, roles))
}

func (s *Server) handleSetStaffPIN(w http.ResponseWriter, r *http.Request, p *principal) {
	var req setStaffPINRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_body", err.Error())
		return
	}
	target := r.PathValue("id")
	// Self-service is allowed (members change their own PIN); anything else is
	// admin-only, mirroring the UI's staff.manage gate.
	if target != p.UserID && !auth.HasAnyRole(p.Roles, auth.RoleAdmin) {
		writeError(w, http.StatusForbidden, "forbidden", "only an admin can reset another member's PIN")
		return
	}
	if !auth.ValidPIN(req.PIN) {
		writeError(w, http.StatusBadRequest, "validation_error", "pin must be 4-8 digits")
		return
	}
	hash, err := auth.HashPIN(req.PIN)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not hash PIN")
		return
	}

	now := db.UtcNow()
	tx, err := s.sqlDB.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not start PIN reset")
		return
	}
	defer tx.Rollback()
	qtx := db.New(tx)
	if _, err := qtx.GetUserByID(r.Context(), target); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusNotFound, "not_found", "staff member not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "internal", "could not load staff member")
		return
	}
	if err := qtx.UpdateUserPIN(r.Context(), db.UpdateUserPINParams{
		PinHash: hash, UpdatedAt: now, ClinicID: p.ClinicID, ID: target,
	}); err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not reset PIN")
		return
	}
	// A reset invalidates the member's sessions: the new PIN is the next
	// credential, the old token is not.
	if err := qtx.DeleteSessionsByUser(r.Context(), target); err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not end sessions")
		return
	}
	if err := s.appendAudit(r.Context(), qtx, p, "staff.pin_reset", "user",
		target, fmt.Sprintf("reset PIN for %s", target),
		map[string]any{"self": target == p.UserID},
	); err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not audit PIN reset")
		return
	}
	if err := tx.Commit(); err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not commit PIN reset")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"reset": true})
}
