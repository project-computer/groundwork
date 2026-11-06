// Package api is the loopback REST surface the desktop webview talks to.
package api

import (
	"context"
	"database/sql"
	"errors"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/project-computer/groundwork/server/internal/offlineapi/auth"
	"github.com/project-computer/groundwork/server/internal/offlineapi/db"
)

// LoopbackSecretHeader carries the per-launch secret (ADR 0020).
const LoopbackSecretHeader = "X-VetCare-Loopback-Secret"

const maxBodyBytes = 2 << 20

// Server owns the HTTP handlers and the shared query set.
type Server struct {
	sqlDB  *sql.DB
	q      *db.Queries
	secret string
	logger *log.Logger
}

// New builds a Server. An empty secret fails closed: every business request
// is rejected.
func New(sqlDB *sql.DB, secret string, logger *log.Logger) *Server {
	return &Server{
		sqlDB:  sqlDB,
		q:      db.New(sqlDB),
		secret: secret,
		logger: logger,
	}
}

// Handler returns the fully wrapped router.
func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", s.handleHealth)
	mux.HandleFunc("POST /api/v1/setup", s.handleSetup)
	mux.HandleFunc("POST /api/v1/auth/login", s.handleLogin)
	mux.HandleFunc("POST /api/v1/auth/logout", s.authed(nil, s.handleLogout))
	mux.HandleFunc("GET /api/v1/auth/me", s.authed(nil, s.handleMe))

	mux.HandleFunc("GET /api/v1/owners", s.authed(nil, s.handleListOwners))
	mux.HandleFunc("POST /api/v1/owners", s.authed(ownedBy(auth.RoleAdmin, auth.RoleReceptionist, auth.RoleVeterinarian), s.handleCreateOwner))
	mux.HandleFunc("GET /api/v1/owners/{id}", s.authed(nil, s.handleGetOwner))
	mux.HandleFunc("PATCH /api/v1/owners/{id}", s.authed(ownedBy(auth.RoleAdmin, auth.RoleReceptionist), s.handleUpdateOwner))

	mux.HandleFunc("GET /api/v1/pets", s.authed(nil, s.handleListPets))
	mux.HandleFunc("POST /api/v1/pets", s.authed(ownedBy(auth.RoleAdmin, auth.RoleReceptionist, auth.RoleVeterinarian), s.handleCreatePet))
	mux.HandleFunc("GET /api/v1/pets/{id}", s.authed(nil, s.handleGetPet))
	mux.HandleFunc("PATCH /api/v1/pets/{id}", s.authed(ownedBy(auth.RoleAdmin, auth.RoleReceptionist, auth.RoleVeterinarian), s.handleUpdatePet))
	mux.HandleFunc("GET /api/v1/pets/{id}/weights", s.authed(nil, s.handleListWeights))
	mux.HandleFunc("POST /api/v1/pets/{id}/weights", s.authed(ownedBy(auth.RoleAdmin, auth.RoleVeterinarian, auth.RoleReceptionist), s.handleCreateWeight))
	mux.HandleFunc("GET /api/v1/pets/{id}/consultations", s.authed(nil, s.handleListConsultations))
	mux.HandleFunc("GET /api/v1/pets/{id}/prescriptions", s.authed(nil, s.handleListPrescriptions))

	clinicWriters := ownedBy(auth.RoleAdmin, auth.RoleReceptionist, auth.RoleVeterinarian)
	clinicalWriters := ownedBy(auth.RoleAdmin, auth.RoleVeterinarian)

	mux.HandleFunc("GET /api/v1/appointments", s.authed(nil, s.handleListAppointments))
	mux.HandleFunc("POST /api/v1/appointments", s.authed(clinicWriters, s.handleCreateAppointment))
	mux.HandleFunc("PATCH /api/v1/appointments/{id}", s.authed(clinicWriters, s.handleUpdateAppointment))

	mux.HandleFunc("POST /api/v1/consultations", s.authed(clinicalWriters, s.handleCreateConsultation))
	mux.HandleFunc("GET /api/v1/consultations/{id}", s.authed(nil, s.handleGetConsultation))
	mux.HandleFunc("PATCH /api/v1/consultations/{id}", s.authed(clinicalWriters, s.handleUpdateConsultation))

	mux.HandleFunc("POST /api/v1/prescriptions", s.authed(clinicalWriters, s.handleCreatePrescription))
	mux.HandleFunc("GET /api/v1/prescriptions/{id}", s.authed(nil, s.handleGetPrescription))

	mux.HandleFunc("GET /api/v1/medications", s.authed(nil, s.handleListMedications))
	mux.HandleFunc("POST /api/v1/medications", s.authed(clinicalWriters, s.handleCreateMedication))
	mux.HandleFunc("PATCH /api/v1/medications/{id}", s.authed(clinicalWriters, s.handleUpdateMedication))

	// Billing (plan BILL-01…10). Catalog edits stay with the front desk and
	// clinical staff; financial corrections are admin-only.
	mux.HandleFunc("GET /api/v1/services", s.authed(nil, s.handleListServices))
	mux.HandleFunc("POST /api/v1/services", s.authed(clinicWriters, s.handleCreateService))
	mux.HandleFunc("PATCH /api/v1/services/{id}", s.authed(clinicWriters, s.handleUpdateService))

	mux.HandleFunc("GET /api/v1/invoices", s.authed(nil, s.handleListInvoices))
	mux.HandleFunc("POST /api/v1/invoices", s.authed(clinicWriters, s.handleCreateInvoice))
	mux.HandleFunc("GET /api/v1/invoices/{id}", s.authed(nil, s.handleGetInvoice))
	mux.HandleFunc("POST /api/v1/invoices/{id}/void", s.authed(ownedBy(auth.RoleAdmin), s.handleVoidInvoice))

	mux.HandleFunc("POST /api/v1/payments", s.authed(clinicWriters, s.handleCreatePayment))
	mux.HandleFunc("POST /api/v1/payments/{id}/void", s.authed(ownedBy(auth.RoleAdmin), s.handleVoidPayment))

	mux.HandleFunc("GET /api/v1/settings", s.authed(nil, s.handleGetSettings))
	mux.HandleFunc("PATCH /api/v1/settings", s.authed(ownedBy(auth.RoleAdmin), s.handleUpdateSettings))

	mux.HandleFunc("GET /api/v1/audit", s.authed(nil, s.handleListAuditLogs))

	return cors(requireSecret(mux, s.secret, s.logger))
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"status":  "ok",
		"service": "vetcare-api",
	})
}

func requireSecret(next http.Handler, secret string, logger *log.Logger) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/healthz" {
			got := r.Header.Get(LoopbackSecretHeader)
			if secret == "" || !auth.ConstantTimeEquals(got, secret) {
				if logger != nil {
					logger.Printf("rejected unauthorized request to %s", r.URL.Path)
				}
				writeError(w, http.StatusUnauthorized, "unauthorized", "missing or invalid loopback secret")
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}

func cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if origin := r.Header.Get("Origin"); allowedOrigin(origin) {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Vary", "Origin")
		}
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, "+LoopbackSecretHeader)
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func allowedOrigin(origin string) bool {
	switch {
	case origin == "tauri://localhost",
		origin == "https://tauri.localhost",
		strings.HasPrefix(origin, "http://127.0.0.1"),
		strings.HasPrefix(origin, "http://localhost"):
		return true
	default:
		return false
	}
}

// principal is the authenticated caller.
type principal struct {
	UserID    string
	ClinicID  string
	Name      string
	Username  string
	Roles     []string
	TokenHash string
}

type ctxKey int

const principalKey ctxKey = iota

type authedHandler func(http.ResponseWriter, *http.Request, *principal)

func ownedBy(roles ...string) []string { return roles }

// authed requires a valid bearer session. When roles is non-empty the caller
// must hold at least one of them; the backend, not the UI, enforces this.
func (s *Server) authed(roles []string, next authedHandler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		token, ok := bearerToken(r)
		if !ok {
			writeError(w, http.StatusUnauthorized, "unauthorized", "missing bearer token")
			return
		}
		tokenHash := auth.HashToken(token)
		row, err := s.q.GetSessionUser(r.Context(), db.GetSessionUserParams{
			TokenHash: tokenHash,
			Now:       db.UtcNow(),
		})
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				writeError(w, http.StatusUnauthorized, "unauthorized", "session is invalid or expired")
				return
			}
			writeError(w, http.StatusInternalServerError, "internal", "could not load session")
			return
		}
		userRoles, err := s.q.ListUserRoles(r.Context(), row.ID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "internal", "could not load roles")
			return
		}
		if len(roles) > 0 && !auth.HasAnyRole(userRoles, roles...) {
			writeError(w, http.StatusForbidden, "forbidden", "your role cannot perform this action")
			return
		}
		p := &principal{
			UserID:    row.ID,
			ClinicID:  row.ClinicID,
			Name:      row.Name,
			Username:  row.Username,
			Roles:     userRoles,
			TokenHash: tokenHash,
		}
		next(w, r.WithContext(context.WithValue(r.Context(), principalKey, p)), p)
	}
}

func bearerToken(r *http.Request) (string, bool) {
	header := r.Header.Get("Authorization")
	if header == "" {
		return "", false
	}
	const prefix = "Bearer "
	if !strings.HasPrefix(header, prefix) {
		return "", false
	}
	token := strings.TrimSpace(strings.TrimPrefix(header, prefix))
	return token, token != ""
}

func (s *Server) issueSession(ctx context.Context, q *db.Queries, user db.User) (string, string, error) {
	token, tokenHash, err := auth.NewSessionToken()
	if err != nil {
		return "", "", err
	}
	now := time.Now().UTC()
	createdAt := now.Format("2006-01-02T15:04:05.000Z07:00")
	expiresAt := now.Add(auth.SessionTTL).Format("2006-01-02T15:04:05.000Z07:00")
	err = q.CreateSession(ctx, db.CreateSessionParams{
		TokenHash: tokenHash,
		UserID:    user.ID,
		ClinicID:  user.ClinicID,
		CreatedAt: createdAt,
		ExpiresAt: expiresAt,
	})
	if err != nil {
		return "", "", err
	}
	return token, expiresAt, nil
}

func (s *Server) requireSetupOpen(ctx context.Context) (bool, error) {
	count, err := s.q.CountClinics(ctx)
	if err != nil {
		return false, err
	}
	return count == 0, nil
}
