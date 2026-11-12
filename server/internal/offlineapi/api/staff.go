package api

import (
	"net/http"

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
