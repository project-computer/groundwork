package api

import (
	"net/http"
	"strings"

	"github.com/project-computer/groundwork/server/internal/offlineapi/auth"
	"github.com/project-computer/groundwork/server/internal/offlineapi/db"
)

// Clinic settings (plan SET-01/02): the clinic profile plus a key/value
// settings map. Reads are open to any signed-in member; changes are
// admin-only and audited.

type updateSettingsRequest struct {
	Name     *string           `json:"name"`
	Address  *string           `json:"address"`
	Phone    *string           `json:"phone"`
	Email    *string           `json:"email"`
	Currency *string           `json:"currency"`
	Locale   *string           `json:"locale"`
	Timezone *string           `json:"timezone"`
	Settings map[string]string `json:"settings"`
}

type settingsDTO struct {
	Clinic   clinicDTO         `json:"clinic"`
	Settings map[string]string `json:"settings"`
}

func (s *Server) handleGetSettings(w http.ResponseWriter, r *http.Request, p *principal) {
	clinic, err := s.q.GetClinic(r.Context(), p.ClinicID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not load clinic")
		return
	}
	rows, err := s.q.ListSettings(r.Context(), p.ClinicID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not load settings")
		return
	}
	values := make(map[string]string, len(rows))
	for _, row := range rows {
		values[row.Key] = row.Value
	}
	writeJSON(w, http.StatusOK, settingsDTO{Clinic: clinicFrom(clinic), Settings: values})
}

func (s *Server) handleUpdateSettings(w http.ResponseWriter, r *http.Request, p *principal) {
	if !auth.HasAnyRole(p.Roles, auth.RoleAdmin) {
		writeError(w, http.StatusForbidden, "forbidden", "only an admin can change clinic settings")
		return
	}
	var req updateSettingsRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_body", err.Error())
		return
	}
	for key := range req.Settings {
		if strings.TrimSpace(key) == "" {
			writeError(w, http.StatusBadRequest, "validation_error", "setting keys cannot be empty")
			return
		}
	}

	clinic, err := s.q.GetClinic(r.Context(), p.ClinicID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not load clinic")
		return
	}
	name := strings.TrimSpace(valueOr(req.Name, clinic.Name))
	if name == "" {
		writeError(w, http.StatusBadRequest, "validation_error", "name cannot be empty")
		return
	}
	updated, err := s.q.UpdateClinicProfile(r.Context(), db.UpdateClinicProfileParams{
		Name: name, Address: valueOr(req.Address, clinic.Address),
		Phone: valueOr(req.Phone, clinic.Phone), Email: valueOr(req.Email, clinic.Email),
		Currency:  valueOr(req.Currency, clinic.Currency),
		Locale:    valueOr(req.Locale, clinic.Locale),
		Timezone:  valueOr(req.Timezone, clinic.Timezone),
		UpdatedAt: db.UtcNow(), ID: clinic.ID,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not update clinic profile")
		return
	}
	for key, value := range req.Settings {
		if err := s.q.UpsertSetting(r.Context(), db.UpsertSettingParams{
			ClinicID: p.ClinicID, Key: strings.TrimSpace(key),
			Value: value, UpdatedAt: db.UtcNow(),
		}); err != nil {
			writeError(w, http.StatusInternalServerError, "internal", "could not save setting")
			return
		}
	}
	if err := s.appendAudit(r.Context(), s.q, p, "settings.updated", "clinic",
		clinic.ID, "updated clinic settings",
		map[string]any{"keys": settingKeysTouched(req)},
	); err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not audit settings change")
		return
	}
	rows, err := s.q.ListSettings(r.Context(), p.ClinicID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not load settings")
		return
	}
	values := make(map[string]string, len(rows))
	for _, row := range rows {
		values[row.Key] = row.Value
	}
	writeJSON(w, http.StatusOK, settingsDTO{Clinic: clinicFrom(updated), Settings: values})
}

// settingKeysTouched lists what changed for the audit payload: profile fields
// plus any settings keys.
func settingKeysTouched(req updateSettingsRequest) []string {
	keys := make([]string, 0, len(req.Settings)+7)
	if req.Name != nil {
		keys = append(keys, "name")
	}
	if req.Address != nil {
		keys = append(keys, "address")
	}
	if req.Phone != nil {
		keys = append(keys, "phone")
	}
	if req.Email != nil {
		keys = append(keys, "email")
	}
	if req.Currency != nil {
		keys = append(keys, "currency")
	}
	if req.Locale != nil {
		keys = append(keys, "locale")
	}
	if req.Timezone != nil {
		keys = append(keys, "timezone")
	}
	for key := range req.Settings {
		keys = append(keys, key)
	}
	return keys
}
