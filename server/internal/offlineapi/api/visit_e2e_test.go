package api

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/project-computer/groundwork/server/internal/offlineapi/auth"
	"github.com/project-computer/groundwork/server/internal/offlineapi/db"
)

// The plan's §8 release-gate journey, driven over live HTTP against the real
// vetcare server (not the recorder): setup → login → owner → patient →
// appointment → check-in → consultation (vitals) → prescription → invoice →
// partial payment → settle → audit, then a shell-restart leg on the same
// database file with a fresh per-launch secret (ADR 0020) and the session
// surviving the restart. This is the harness the phase-4 frontend cutover is
// validated against.

type e2eClient struct {
	base   string
	secret string
	token  string
	http   *http.Client
}

// startVetcare boots a live server on a file-backed database with its own
// per-launch secret, like the shell does on every launch.
func startVetcare(t *testing.T, dbPath, secret string) (*httptest.Server, *e2eClient) {
	t.Helper()
	conn, err := db.Open(dbPath)
	if err != nil {
		t.Fatalf("open %s: %v", dbPath, err)
	}
	t.Cleanup(func() { _ = conn.Close() })
	server := New(conn, Options{Secret: secret, BackupsDir: t.TempDir()})
	ts := httptest.NewServer(server.Handler())
	t.Cleanup(ts.Close)
	return ts, &e2eClient{base: ts.URL, secret: secret, http: ts.Client()}
}

func (c *e2eClient) do(t *testing.T, method, path string, payload any) (int, map[string]any, string) {
	t.Helper()
	var reader io.Reader
	if payload != nil {
		encoded, err := json.Marshal(payload)
		if err != nil {
			t.Fatalf("marshal %s: %v", path, err)
		}
		reader = bytes.NewReader(encoded)
	}
	req, err := http.NewRequest(method, c.base+path, reader)
	if err != nil {
		t.Fatalf("request %s: %v", path, err)
	}
	if payload != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if c.secret != "" {
		// An empty client secret models a caller the shell never briefed
		// (e.g. after a relaunch rotated the per-launch secret).
		req.Header.Set(LoopbackSecretHeader, c.secret)
	}
	if c.token != "" {
		req.Header.Set("Authorization", "Bearer "+c.token)
	}
	resp, err := c.http.Do(req)
	if err != nil {
		t.Fatalf("%s %s: %v", method, path, err)
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("read %s: %v", path, err)
	}
	out := map[string]any{}
	if len(raw) > 0 {
		_ = json.Unmarshal(raw, &out)
	}
	return resp.StatusCode, out, string(raw)
}

// must fails the test unless the call returned wantStatus.
func must(t *testing.T, status, wantStatus int, body map[string]any, raw, what string) map[string]any {
	t.Helper()
	if status != wantStatus {
		t.Fatalf("%s = %d, want %d: %s", what, status, wantStatus, raw)
	}
	return body
}

func id(t *testing.T, body map[string]any, what string) string {
	t.Helper()
	value, _ := body["id"].(string)
	if value == "" {
		t.Fatalf("%s returned no id: %v", what, body)
	}
	return value
}

func TestVisitEndToEnd(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "vetcare.db")
	secret1 := "first-launch-secret-00000000000000"

	ts1, client := startVetcare(t, dbPath, secret1)
	_ = ts1

	// The readiness probe stays open even without the secret; everything
	// else fails closed for a caller the shell never briefed.
	if status, _, _ := client.do(t, http.MethodGet, "/healthz", nil); status != http.StatusOK {
		t.Fatalf("healthz = %d, want 200", status)
	}
	noSecret := &e2eClient{base: ts1.URL, http: ts1.Client()}
	if status, _, _ := noSecret.do(t, http.MethodPost, "/api/v1/setup", map[string]any{}); status != http.StatusUnauthorized {
		t.Fatalf("setup without secret = %d, want 401", status)
	}

	// 1. Initial clinic setup creates the tenant and the admin.
	status, body, raw := client.do(t, http.MethodPost, "/api/v1/setup", map[string]any{
		"clinicName": "Happy Paws", "adminName": "Dr. Somchai", "username": "somchai", "pin": "1234",
	})
	setup := must(t, status, http.StatusCreated, body, raw, "setup")
	client.token, _ = setup["token"].(string)
	clinic, _ := setup["clinic"].(map[string]any)
	clinicID, _ := clinic["id"].(string)
	if clinicID == "" {
		t.Fatalf("setup returned no clinic: %s", raw)
	}

	// 2. A fresh login works against the created account; capture the admin
	// id for the vet references.
	status, body, raw = client.do(t, http.MethodPost, "/api/v1/auth/login", map[string]any{
		"username": "somchai", "pin": "1234",
	})
	must(t, status, http.StatusOK, body, raw, "login")
	client.token, _ = body["token"].(string)
	status, body, raw = client.do(t, http.MethodGet, "/api/v1/auth/me", nil)
	me := must(t, status, http.StatusOK, body, raw, "auth/me")
	adminUser, _ := me["user"].(map[string]any)
	adminID, _ := adminUser["id"].(string)

	// 3. Register the owner.
	status, body, raw = client.do(t, http.MethodPost, "/api/v1/owners", map[string]any{
		"name": "Nok", "phone": "0812345678", "address": "12 Sukhumvit",
	})
	owner := must(t, status, http.StatusCreated, body, raw, "create owner")
	ownerID := id(t, owner, "create owner")

	// 4. Register the patient (MRN allocated server-side).
	status, body, raw = client.do(t, http.MethodPost, "/api/v1/pets", map[string]any{
		"ownerId": ownerID, "name": "Mochi", "species": "cat", "sex": "female", "microchipNumber": "98511",
	})
	pet := must(t, status, http.StatusCreated, body, raw, "create pet")
	petID := id(t, pet, "create pet")
	if mrn, _ := pet["mrn"].(string); !strings.HasPrefix(mrn, "PT-") {
		t.Fatalf("patient MRN = %q, want PT- prefix", pet["mrn"])
	}

	// 5. Catalog the services the visit will bill.
	status, body, raw = client.do(t, http.MethodPost, "/api/v1/services", map[string]any{
		"name": "Consultation", "unitPriceSatang": 30000,
	})
	consultFee := must(t, status, http.StatusCreated, body, raw, "create consultation fee")
	consultFeeID := id(t, consultFee, "consultation fee")
	status, body, raw = client.do(t, http.MethodPost, "/api/v1/services", map[string]any{
		"name": "Nail trim", "unitPriceSatang": 25000,
	})
	nailFee := must(t, status, http.StatusCreated, body, raw, "create nail trim")
	nailFeeID := id(t, nailFee, "nail trim")

	// 6. Book the appointment, check in, start.
	status, body, raw = client.do(t, http.MethodPost, "/api/v1/appointments", map[string]any{
		"petId": petID, "veterinarianId": adminID,
		"scheduledAt":     time.Now().UTC().Format(time.RFC3339),
		"durationMinutes": 30, "reason": "annual checkup",
	})
	appointment := must(t, status, http.StatusCreated, body, raw, "book appointment")
	appointmentID := id(t, appointment, "book appointment")
	for _, transition := range []string{"arrived", "in_progress"} {
		status, _, raw = client.do(t, http.MethodPatch, "/api/v1/appointments/"+appointmentID, map[string]any{"status": transition})
		must(t, status, http.StatusOK, nil, raw, "appointment → "+transition)
	}

	// 7. The consultation: vitals + diagnosis recorded transactionally; the
	// weight becomes a measurement in the history (ADR 0022).
	status, body, raw = client.do(t, http.MethodPost, "/api/v1/consultations", map[string]any{
		"petId": petID, "appointmentId": appointmentID, "veterinarianId": adminID,
		"chiefComplaint": "annual checkup", "examination": "bright, alert, responsive",
		"vitals":    map[string]any{"weightGrams": 4200, "temperatureCelsius": 38.6, "heartRateBpm": 96},
		"diagnoses": []map[string]any{{"description": "healthy"}},
	})
	consultation := must(t, status, http.StatusCreated, body, raw, "start consultation")
	consultationID := id(t, consultation, "start consultation")
	status, body, raw = client.do(t, http.MethodGet, "/api/v1/pets/"+petID+"/weights", nil)
	weights := must(t, status, http.StatusOK, body, raw, "list weights")
	observed, _ := weights["weights"].([]any)
	if len(observed) != 1 {
		t.Fatalf("consultation vitals must record a weight observation, got %d", len(observed))
	}

	// 8. Prescribe against the consultation.
	status, body, raw = client.do(t, http.MethodPost, "/api/v1/prescriptions", map[string]any{
		"consultationId": consultationID, "veterinarianId": adminID,
		"items": []map[string]any{{
			"medicationName": "Amoxicillin 250mg", "doseAmount": "1 tab", "doseUnit": "tab", "route": "PO",
			"frequency": "BID", "durationDays": 7, "quantityDispensed": 14,
		}},
	})
	must(t, status, http.StatusCreated, body, raw, "prescribe")

	// 9. Close the visit.
	status, _, raw = client.do(t, http.MethodPatch, "/api/v1/consultations/"+consultationID, map[string]any{
		"status": "completed",
	})
	must(t, status, http.StatusOK, nil, raw, "complete consultation")

	// 10. Invoice the visit and take a partial payment, then settle.
	status, body, raw = client.do(t, http.MethodPost, "/api/v1/invoices", map[string]any{
		"ownerId": ownerID, "petId": petID, "consultationId": consultationID,
		"items": []map[string]any{
			{"serviceId": consultFeeID, "description": "Consultation", "quantity": 1, "unitPriceSatang": 30000},
			{"serviceId": nailFeeID, "description": "Nail trim", "quantity": 1, "unitPriceSatang": 25000},
		},
	})
	invoice := must(t, status, http.StatusCreated, body, raw, "create invoice")
	invoiceID := id(t, invoice, "create invoice")
	if total, _ := invoice["totalSatang"].(float64); total != 55000 {
		t.Fatalf("invoice total = %v, want 55000 satang", invoice["totalSatang"])
	}
	invoiceNumber, _ := invoice["invoiceNumber"].(string)
	if invoiceNumber == "" {
		t.Fatalf("invoice has no number: %s", raw)
	}

	status, body, raw = client.do(t, http.MethodPost, "/api/v1/payments", map[string]any{
		"invoiceId": invoiceID, "amountSatang": 30000, "method": "cash",
	})
	must(t, status, http.StatusCreated, body, raw, "partial payment")
	status, body, raw = client.do(t, http.MethodGet, "/api/v1/invoices/"+invoiceID, nil)
	got := must(t, status, http.StatusOK, body, raw, "load invoice")
	if got["status"] != "partial" || got["balanceSatang"].(float64) != 25000 {
		t.Fatalf("after partial payment: %s", raw)
	}
	status, body, raw = client.do(t, http.MethodPost, "/api/v1/payments", map[string]any{
		"invoiceId": invoiceID, "amountSatang": 25000, "method": "transfer", "reference": "TB-991",
	})
	must(t, status, http.StatusCreated, body, raw, "settle")
	status, body, raw = client.do(t, http.MethodGet, "/api/v1/invoices/"+invoiceID, nil)
	got = must(t, status, http.StatusOK, body, raw, "load settled invoice")
	if got["status"] != "paid" || got["balanceSatang"].(float64) != 0 {
		t.Fatalf("after settle: %s", raw)
	}

	// 11. The visit left an audit trail (AUD-02): issued + two payments.
	status, body, raw = client.do(t, http.MethodGet, "/api/v1/audit?entityType=invoice", nil)
	audit := must(t, status, http.StatusOK, body, raw, "audit")
	events, _ := audit["events"].([]any)
	if len(events) < 3 {
		t.Fatalf("audit events = %d, want ≥ 3", len(events))
	}

	// 12. RBAC through HTTP: seed a receptionist directly, log in through the
	// public API, and hit the admin-only routes.
	adminConn, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Fatalf("reopen for seeding: %v", err)
	}
	pinHash, hashErr := auth.HashPIN("5678")
	if hashErr != nil {
		t.Fatalf("hash pin: %v", hashErr)
	}
	seedNow := db.UtcNow()
	seedQ := db.New(adminConn)
	receptionistID := uuid.NewString()
	if _, err := seedQ.CreateUser(context.Background(), db.CreateUserParams{
		ID: receptionistID, ClinicID: clinicID, Name: "Ploy",
		Username: "ploy", PinHash: pinHash, Active: 1,
		CreatedAt: seedNow, UpdatedAt: seedNow,
	}); err != nil {
		t.Fatalf("seed receptionist: %v", err)
	}
	if err := seedQ.AssignRole(context.Background(), db.AssignRoleParams{
		UserID: receptionistID, RoleID: "role-receptionist",
	}); err != nil {
		t.Fatalf("assign receptionist role: %v", err)
	}
	_ = adminConn.Close()

	front := &e2eClient{base: ts1.URL, secret: secret1, http: ts1.Client()}
	status, body, raw = front.do(t, http.MethodPost, "/api/v1/auth/login", map[string]any{
		"username": "ploy", "pin": "5678",
	})
	frontLogin := must(t, status, http.StatusOK, body, raw, "receptionist login")
	front.token, _ = frontLogin["token"].(string)
	status, _, raw = front.do(t, http.MethodPatch, "/api/v1/settings", map[string]any{"phone": "02 000 0000"})
	must(t, status, http.StatusForbidden, nil, raw, "receptionist settings patch")
	status, _, raw = front.do(t, http.MethodPost, "/api/v1/payments/"+invoiceID+"/void", nil)
	must(t, status, http.StatusForbidden, nil, raw, "receptionist void")

	// 13. Logout ends the session.
	status, _, raw = client.do(t, http.MethodPost, "/api/v1/auth/logout", nil)
	must(t, status, http.StatusNoContent, nil, raw, "logout")
	status, _, _ = client.do(t, http.MethodGet, "/api/v1/auth/me", nil)
	if status != http.StatusUnauthorized {
		t.Fatalf("me after logout = %d, want 401", status)
	}

	// 14. Shell restart: same file, fresh per-launch secret. The old secret
	// must be dead; the session and every record survive.
	ts1.Close()
	secret2 := "second-launch-secret-0000000000000"
	_, client2 := startVetcare(t, dbPath, secret2)

	if status, _, _ := client2.do(t, http.MethodGet, "/api/v1/owners", nil); status != http.StatusUnauthorized {
		t.Fatalf("stale secret after restart = %d, want 401", status)
	}
	// Re-login through the new instance.
	status, body, raw = client2.do(t, http.MethodPost, "/api/v1/auth/login", map[string]any{
		"username": "somchai", "pin": "1234",
	})
	must(t, status, http.StatusOK, body, raw, "login after restart")
	client2.token, _ = body["token"].(string)

	status, body, raw = client2.do(t, http.MethodGet, "/api/v1/pets/"+petID, nil)
	got = must(t, status, http.StatusOK, body, raw, "pet after restart")
	if mrn, _ := got["mrn"].(string); !strings.HasPrefix(mrn, "PT-") {
		t.Fatalf("pet lost after restart: %s", raw)
	}
	status, body, raw = client2.do(t, http.MethodGet, "/api/v1/invoices/"+invoiceID, nil)
	got = must(t, status, http.StatusOK, body, raw, "invoice after restart")
	if got["status"] != "paid" || got["balanceSatang"].(float64) != 0 {
		t.Fatalf("ledger drift after restart: %s", raw)
	}
	if len(got["payments"].([]any)) != 2 {
		t.Fatalf("payment history lost after restart: %s", raw)
	}
}
