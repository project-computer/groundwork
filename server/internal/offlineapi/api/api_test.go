package api

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/google/uuid"

	"github.com/project-computer/groundwork/server/internal/offlineapi/auth"
	"github.com/project-computer/groundwork/server/internal/offlineapi/db"
)

const testSecret = "0123456789abcdef0123456789abcdef"

func newTestServer(t *testing.T) *Server {
	t.Helper()
	conn, err := db.Open(":memory:")
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	t.Cleanup(func() { _ = conn.Close() })
	return New(conn, Options{Secret: testSecret, BackupsDir: t.TempDir()})
}

type response struct {
	status int
	body   map[string]any
	raw    []byte
}

func call(t *testing.T, s *Server, method, path, secret, token string, payload any) response {
	t.Helper()
	var body io.Reader
	if payload != nil {
		encoded, err := json.Marshal(payload)
		if err != nil {
			t.Fatalf("marshal: %v", err)
		}
		body = bytes.NewReader(encoded)
	}
	req := httptest.NewRequest(method, path, body)
	if payload != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if secret != "" {
		req.Header.Set(LoopbackSecretHeader, secret)
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	rec := httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	out := response{status: rec.Code, raw: rec.Body.Bytes()}
	if len(out.raw) > 0 {
		_ = json.Unmarshal(out.raw, &out.body)
	}
	return out
}

func setupClinic(t *testing.T, s *Server) string {
	t.Helper()
	res := call(t, s, http.MethodPost, "/api/v1/setup", testSecret, "", map[string]any{
		"clinicName": "Happy Paws",
		"adminName":  "Dr. Somchai",
		"username":   "admin",
		"pin":        "1234",
	})
	if res.status != http.StatusCreated {
		t.Fatalf("setup status = %d, body = %s", res.status, res.raw)
	}
	token, _ := res.body["token"].(string)
	if token == "" {
		t.Fatalf("setup returned no token: %s", res.raw)
	}
	return token
}

func TestHealthNeedsNoSecret(t *testing.T) {
	s := newTestServer(t)
	res := call(t, s, http.MethodGet, "/healthz", "", "", nil)
	if res.status != http.StatusOK {
		t.Fatalf("health status = %d", res.status)
	}
	if res.body["status"] != "ok" {
		t.Fatalf("health body = %s", res.raw)
	}
}

func TestLoopbackSecretRequired(t *testing.T) {
	s := newTestServer(t)
	res := call(t, s, http.MethodGet, "/api/v1/owners", "", "", nil)
	if res.status != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", res.status)
	}
	wrong := call(t, s, http.MethodGet, "/api/v1/owners", "wrong", "", nil)
	if wrong.status != http.StatusUnauthorized {
		t.Fatalf("wrong secret status = %d, want 401", wrong.status)
	}
}

func TestSetupLoginAndSession(t *testing.T) {
	s := newTestServer(t)
	token := setupClinic(t, s)

	me := call(t, s, http.MethodGet, "/api/v1/auth/me", testSecret, token, nil)
	if me.status != http.StatusOK {
		t.Fatalf("me status = %d, body = %s", me.status, me.raw)
	}

	again := call(t, s, http.MethodPost, "/api/v1/setup", testSecret, "", map[string]any{
		"clinicName": "Second", "adminName": "X", "username": "x", "pin": "4321",
	})
	if again.status != http.StatusConflict {
		t.Fatalf("second setup status = %d, want 409", again.status)
	}

	login := call(t, s, http.MethodPost, "/api/v1/auth/login", testSecret, "", map[string]any{
		"username": "admin", "pin": "1234",
	})
	if login.status != http.StatusOK {
		t.Fatalf("login status = %d, body = %s", login.status, login.raw)
	}
	loginToken, _ := login.body["token"].(string)
	if loginToken == "" {
		t.Fatalf("login returned no token: %s", login.raw)
	}

	bad := call(t, s, http.MethodPost, "/api/v1/auth/login", testSecret, "", map[string]any{
		"username": "admin", "pin": "9999",
	})
	if bad.status != http.StatusUnauthorized {
		t.Fatalf("bad login status = %d, want 401", bad.status)
	}

	logout := call(t, s, http.MethodPost, "/api/v1/auth/logout", testSecret, loginToken, nil)
	if logout.status != http.StatusNoContent {
		t.Fatalf("logout status = %d", logout.status)
	}
	after := call(t, s, http.MethodGet, "/api/v1/auth/me", testSecret, loginToken, nil)
	if after.status != http.StatusUnauthorized {
		t.Fatalf("me after logout = %d, want 401", after.status)
	}
}

func TestOwnersPetsWeightsFlow(t *testing.T) {
	s := newTestServer(t)
	token := setupClinic(t, s)

	owner := call(t, s, http.MethodPost, "/api/v1/owners", testSecret, token, map[string]any{
		"name": "Nok", "phone": "0812345678", "secondaryContactName": "Ann",
	})
	if owner.status != http.StatusCreated {
		t.Fatalf("create owner status = %d, body = %s", owner.status, owner.raw)
	}
	ownerID, _ := owner.body["id"].(string)

	missing := call(t, s, http.MethodPost, "/api/v1/owners", testSecret, token, map[string]any{
		"name": "No Phone",
	})
	if missing.status != http.StatusBadRequest {
		t.Fatalf("owner without phone = %d, want 400", missing.status)
	}

	list := call(t, s, http.MethodGet, "/api/v1/owners?search=Nok", testSecret, token, nil)
	if list.status != http.StatusOK {
		t.Fatalf("list owners status = %d", list.status)
	}
	owners, _ := list.body["owners"].([]any)
	if len(owners) != 1 {
		t.Fatalf("owners = %d, want 1 (%s)", len(owners), list.raw)
	}

	patched := call(t, s, http.MethodPatch, "/api/v1/owners/"+ownerID, testSecret, token, map[string]any{
		"notes": "prefers morning visits",
	})
	if patched.status != http.StatusOK {
		t.Fatalf("patch owner status = %d, body = %s", patched.status, patched.raw)
	}
	if patched.body["notes"] != "prefers morning visits" {
		t.Fatalf("patch owner did not persist notes: %s", patched.raw)
	}

	pet := call(t, s, http.MethodPost, "/api/v1/pets", testSecret, token, map[string]any{
		"ownerId": ownerID, "name": "Mochi", "species": "cat",
		"sex": "female", "microchipNumber": "985112345678901",
	})
	if pet.status != http.StatusCreated {
		t.Fatalf("create pet status = %d, body = %s", pet.status, pet.raw)
	}
	petID, _ := pet.body["id"].(string)
	mrn, _ := pet.body["mrn"].(string)
	if mrn == "" {
		t.Fatalf("pet has no MRN: %s", pet.raw)
	}

	pets := call(t, s, http.MethodGet, "/api/v1/pets?search=Mochi", testSecret, token, nil)
	if pets.status != http.StatusOK {
		t.Fatalf("list pets status = %d", pets.status)
	}
	gotPets, _ := pets.body["pets"].([]any)
	if len(gotPets) != 1 {
		t.Fatalf("pets = %d, want 1 (%s)", len(gotPets), pets.raw)
	}

	weight := call(t, s, http.MethodPost, "/api/v1/pets/"+petID+"/weights", testSecret, token, map[string]any{
		"weightGrams": 4200,
	})
	if weight.status != http.StatusCreated {
		t.Fatalf("create weight status = %d, body = %s", weight.status, weight.raw)
	}
	weights := call(t, s, http.MethodGet, "/api/v1/pets/"+petID+"/weights", testSecret, token, nil)
	if weights.status != http.StatusOK {
		t.Fatalf("list weights status = %d", weights.status)
	}
	gotWeights, _ := weights.body["weights"].([]any)
	if len(gotWeights) != 1 {
		t.Fatalf("weights = %d, want 1 (%s)", len(gotWeights), weights.raw)
	}
}

func TestMissingBearerIsUnauthorized(t *testing.T) {
	s := newTestServer(t)
	setupClinic(t, s)
	res := call(t, s, http.MethodGet, "/api/v1/owners", testSecret, "", nil)
	if res.status != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", res.status)
	}
}

func createOwnerAndPet(t *testing.T, s *Server, token string) (string, string) {
	t.Helper()
	owner := call(t, s, http.MethodPost, "/api/v1/owners", testSecret, token, map[string]any{
		"name": "Nok", "phone": "0812345678",
	})
	if owner.status != http.StatusCreated {
		t.Fatalf("create owner = %d: %s", owner.status, owner.raw)
	}
	ownerID, _ := owner.body["id"].(string)
	pet := call(t, s, http.MethodPost, "/api/v1/pets", testSecret, token, map[string]any{
		"ownerId": ownerID, "name": "Mochi", "species": "cat",
	})
	if pet.status != http.StatusCreated {
		t.Fatalf("create pet = %d: %s", pet.status, pet.raw)
	}
	petID, _ := pet.body["id"].(string)
	return ownerID, petID
}

func TestAppointmentLifecycle(t *testing.T) {
	s := newTestServer(t)
	token := setupClinic(t, s)
	_, petID := createOwnerAndPet(t, s, token)

	created := call(t, s, http.MethodPost, "/api/v1/appointments", testSecret, token, map[string]any{
		"petId": petID, "reason": "vaccination", "scheduledAt": "2026-11-06T10:00:00Z",
	})
	if created.status != http.StatusCreated {
		t.Fatalf("create appointment = %d: %s", created.status, created.raw)
	}
	appointmentID, _ := created.body["id"].(string)
	if created.body["status"] != "scheduled" {
		t.Fatalf("new appointment status = %v", created.body["status"])
	}
	if created.body["petName"] != "Mochi" {
		t.Fatalf("appointment is not enriched with pet: %s", created.raw)
	}

	listed := call(t, s, http.MethodGet, "/api/v1/appointments?from=2026-11-06&to=2026-11-06", testSecret, token, nil)
	if listed.status != http.StatusOK {
		t.Fatalf("list appointments = %d", listed.status)
	}
	if got, _ := listed.body["appointments"].([]any); len(got) != 1 {
		t.Fatalf("appointments = %d, want 1: %s", len(got), listed.raw)
	}

	for _, status := range []string{"arrived", "in_progress", "completed"} {
		res := call(t, s, http.MethodPatch, "/api/v1/appointments/"+appointmentID, testSecret, token, map[string]any{
			"status": status,
		})
		if res.status != http.StatusOK || res.body["status"] != status {
			t.Fatalf("move to %s = %d: %s", status, res.status, res.raw)
		}
	}

	back := call(t, s, http.MethodPatch, "/api/v1/appointments/"+appointmentID, testSecret, token, map[string]any{
		"status": "cancelled",
	})
	if back.status != http.StatusBadRequest {
		t.Fatalf("completed -> cancelled = %d, want 400", back.status)
	}

	walkIn := call(t, s, http.MethodPost, "/api/v1/appointments", testSecret, token, map[string]any{
		"petId": petID, "walkIn": true,
	})
	if walkIn.status != http.StatusCreated || walkIn.body["status"] != "arrived" {
		t.Fatalf("walk-in = %d: %s", walkIn.status, walkIn.raw)
	}
}

func TestConsultationAndPrescription(t *testing.T) {
	s := newTestServer(t)
	token := setupClinic(t, s)
	_, petID := createOwnerAndPet(t, s, token)

	consultation := call(t, s, http.MethodPost, "/api/v1/consultations", testSecret, token, map[string]any{
		"petId":          petID,
		"chiefComplaint": "not eating",
		"symptoms":       "lethargy",
		"examination":    "fever",
		"diagnosisNotes": "possible infection",
		"vitals": map[string]any{
			"weightGrams": 4200, "temperatureCelsius": 39.4, "heartRateBpm": 180,
		},
		"diagnoses": []map[string]any{
			{"code": "FVR", "description": "feline viral rhinotracheitis"},
		},
		"treatments": []map[string]any{
			{"description": "IV fluids"},
		},
	})
	if consultation.status != http.StatusCreated {
		t.Fatalf("create consultation = %d: %s", consultation.status, consultation.raw)
	}
	consultationID, _ := consultation.body["id"].(string)
	if got, _ := consultation.body["diagnoses"].([]any); len(got) != 1 {
		t.Fatalf("diagnoses = %d, want 1: %s", len(got), consultation.raw)
	}

	completed := call(t, s, http.MethodPatch, "/api/v1/consultations/"+consultationID, testSecret, token, map[string]any{
		"status": "completed", "notes": "recheck in 3 days",
	})
	if completed.status != http.StatusOK || completed.body["status"] != "completed" {
		t.Fatalf("complete consultation = %d: %s", completed.status, completed.raw)
	}
	if completed.body["completedAt"] == "" {
		t.Fatalf("completedAt not set: %s", completed.raw)
	}

	vitals, _ := completed.body["vitals"].(map[string]any)
	if vitals["weightGrams"] != float64(4200) {
		t.Fatalf("weight not persisted: %v", vitals)
	}

	medication := call(t, s, http.MethodPost, "/api/v1/medications", testSecret, token, map[string]any{
		"name": "Amoxicillin", "strength": "250mg", "form": "tablet",
	})
	if medication.status != http.StatusCreated {
		t.Fatalf("create medication = %d: %s", medication.status, medication.raw)
	}
	medicationID, _ := medication.body["id"].(string)

	prescription := call(t, s, http.MethodPost, "/api/v1/prescriptions", testSecret, token, map[string]any{
		"consultationId": consultationID,
		"instructions":   "give with food",
		"items": []map[string]any{{
			"medicationId": medicationID, "medicationName": "Amoxicillin",
			"strength": "250mg", "doseAmount": "1", "doseUnit": "tablet",
			"route": "oral", "frequency": "BID", "durationDays": 5,
			"quantityDispensed": 10,
		}},
	})
	if prescription.status != http.StatusCreated {
		t.Fatalf("create prescription = %d: %s", prescription.status, prescription.raw)
	}
	prescriptionID, _ := prescription.body["id"].(string)
	if items, _ := prescription.body["items"].([]any); len(items) != 1 {
		t.Fatalf("prescription items = %d, want 1: %s", len(items), prescription.raw)
	}

	got := call(t, s, http.MethodGet, "/api/v1/prescriptions/"+prescriptionID, testSecret, token, nil)
	if got.status != http.StatusOK {
		t.Fatalf("get prescription = %d: %s", got.status, got.raw)
	}
	list := call(t, s, http.MethodGet, "/api/v1/pets/"+petID+"/prescriptions", testSecret, token, nil)
	if list.status != http.StatusOK {
		t.Fatalf("list prescriptions = %d: %s", list.status, list.raw)
	}
	if got, _ := list.body["prescriptions"].([]any); len(got) != 1 {
		t.Fatalf("prescriptions = %d, want 1: %s", len(got), list.raw)
	}
}

// createService seeds one catalog entry for billing tests.
func createService(t *testing.T, s *Server, token, name string, priceSatang int64) string {
	t.Helper()
	res := call(t, s, http.MethodPost, "/api/v1/services", testSecret, token, map[string]any{
		"name": name, "unitPriceSatang": priceSatang,
	})
	if res.status != http.StatusCreated {
		t.Fatalf("create service %s = %d: %s", name, res.status, res.raw)
	}
	id, _ := res.body["id"].(string)
	return id
}

func TestBillingFlow(t *testing.T) {
	s := newTestServer(t)
	token := setupClinic(t, s)
	ownerID, petID := createOwnerAndPet(t, s, token)

	consultID := createService(t, s, token, "Consultation", 30000)
	vaccineID := createService(t, s, token, "Vaccine", 45000)

	services := call(t, s, http.MethodGet, "/api/v1/services?search=vac", testSecret, token, nil)
	if got, _ := services.body["services"].([]any); len(got) != 1 {
		t.Fatalf("service search = %d results, want 1: %s", len(got), services.raw)
	}

	invoice := call(t, s, http.MethodPost, "/api/v1/invoices", testSecret, token, map[string]any{
		"ownerId": ownerID, "petId": petID, "discountSatang": 2000,
		"items": []map[string]any{
			{"serviceId": consultID, "description": "Consultation", "quantity": 1, "unitPriceSatang": 30000},
			{"serviceId": vaccineID, "description": "Vaccine", "quantity": 1, "unitPriceSatang": 45000},
		},
	})
	if invoice.status != http.StatusCreated {
		t.Fatalf("create invoice = %d: %s", invoice.status, invoice.raw)
	}
	invoiceID, _ := invoice.body["id"].(string)
	if number, _ := invoice.body["invoiceNumber"].(string); number == "" {
		t.Fatalf("invoice has no number: %s", invoice.raw)
	}
	if invoice.body["subtotalSatang"].(float64) != 75000 ||
		invoice.body["totalSatang"].(float64) != 73000 {
		t.Fatalf("invoice totals wrong: %s", invoice.raw)
	}
	if invoice.body["status"] != "unpaid" {
		t.Fatalf("new invoice status = %v, want unpaid: %s", invoice.body["status"], invoice.raw)
	}

	// Line discount exceeding the line total is rejected before anything is
	// written.
	bad := call(t, s, http.MethodPost, "/api/v1/invoices", testSecret, token, map[string]any{
		"ownerId": ownerID,
		"items": []map[string]any{
			{"description": "X", "quantity": 1, "unitPriceSatang": 100, "discountSatang": 200},
		},
	})
	if bad.status != http.StatusBadRequest {
		t.Fatalf("bad line discount = %d, want 400", bad.status)
	}

	// Partial payment: status flips to partial, balance is exact.
	partial := call(t, s, http.MethodPost, "/api/v1/payments", testSecret, token, map[string]any{
		"invoiceId": invoiceID, "amountSatang": 23000, "method": "cash",
	})
	if partial.status != http.StatusCreated {
		t.Fatalf("partial payment = %d: %s", partial.status, partial.raw)
	}
	got := call(t, s, http.MethodGet, "/api/v1/invoices/"+invoiceID, testSecret, token, nil)
	if got.body["status"] != "partial" || got.body["paidSatang"].(float64) != 23000 ||
		got.body["balanceSatang"].(float64) != 50000 {
		t.Fatalf("after partial: %s", got.raw)
	}

	// Overpayment is refused — no silently absorbed overpays.
	over := call(t, s, http.MethodPost, "/api/v1/payments", testSecret, token, map[string]any{
		"invoiceId": invoiceID, "amountSatang": 60000,
	})
	if over.status != http.StatusConflict {
		t.Fatalf("overpay = %d, want 409: %s", over.status, over.raw)
	}

	// Settling the rest flips the invoice to paid.
	rest := call(t, s, http.MethodPost, "/api/v1/payments", testSecret, token, map[string]any{
		"invoiceId": invoiceID, "amountSatang": 50000, "method": "transfer", "reference": "TB-991",
	})
	if rest.status != http.StatusCreated {
		t.Fatalf("settling payment = %d: %s", rest.status, rest.raw)
	}
	final := call(t, s, http.MethodGet, "/api/v1/invoices/"+invoiceID, testSecret, token, nil)
	if final.body["status"] != "paid" || final.body["balanceSatang"].(float64) != 0 {
		t.Fatalf("after settle: %s", final.raw)
	}

	// Voiding one payment (authorized correction) recomputes to partial and
	// leaves the audit trail intact.
	payments, _ := final.body["payments"].([]any)
	first, _ := payments[0].(map[string]any)
	firstID, _ := first["id"].(string)
	voided := call(t, s, http.MethodPost, "/api/v1/payments/"+firstID+"/void", testSecret, token, nil)
	if voided.status != http.StatusOK || voided.body["status"] != "void" {
		t.Fatalf("void payment = %d: %s", voided.status, voided.raw)
	}
	after := call(t, s, http.MethodGet, "/api/v1/invoices/"+invoiceID, testSecret, token, nil)
	if after.body["status"] != "partial" {
		t.Fatalf("invoice after void = %v, want partial: %s", after.body["status"], after.raw)
	}

	audit := call(t, s, http.MethodGet, "/api/v1/audit?entityType=invoice", testSecret, token, nil)
	if audit.status != http.StatusOK {
		t.Fatalf("audit list = %d: %s", audit.status, audit.raw)
	}
	events, _ := audit.body["events"].([]any)
	actions := map[string]bool{}
	for _, raw := range events {
		event, _ := raw.(map[string]any)
		action, _ := event["action"].(string)
		actions[action] = true
	}
	for _, want := range []string{"invoice.issued", "payment.recorded", "payment.voided"} {
		if !actions[want] {
			t.Fatalf("audit missing %s, got %v: %s", want, actions, audit.raw)
		}
	}

	// An invoice with collected money cannot be voided — correct the
	// payments first (plan BILL-10).
	voidInvoice := call(t, s, http.MethodPost, "/api/v1/invoices/"+invoiceID+"/void", testSecret, token, nil)
	if voidInvoice.status != http.StatusConflict {
		t.Fatalf("void paid invoice = %d, want 409", voidInvoice.status)
	}

	// A clean invoice voids, and a void invoice refuses new payments.
	clean := call(t, s, http.MethodPost, "/api/v1/invoices", testSecret, token, map[string]any{
		"ownerId": ownerID,
		"items":   []map[string]any{{"description": "Nail trim", "quantity": 1, "unitPriceSatang": 25000}},
	})
	if clean.status != http.StatusCreated {
		t.Fatalf("clean invoice = %d: %s", clean.status, clean.raw)
	}
	cleanID, _ := clean.body["id"].(string)
	if v := call(t, s, http.MethodPost, "/api/v1/invoices/"+cleanID+"/void", testSecret, token, nil); v.status != http.StatusOK {
		t.Fatalf("void clean invoice = %d: %s", v.status, v.raw)
	}
	if p := call(t, s, http.MethodPost, "/api/v1/payments", testSecret, token, map[string]any{
		"invoiceId": cleanID, "amountSatang": 1000,
	}); p.status != http.StatusConflict {
		t.Fatalf("pay void invoice = %d, want 409", p.status)
	}
}

func TestSettingsAccess(t *testing.T) {
	s := newTestServer(t)
	token := setupClinic(t, s)

	got := call(t, s, http.MethodGet, "/api/v1/settings", testSecret, token, nil)
	if got.status != http.StatusOK || got.body["clinic"] == nil {
		t.Fatalf("get settings = %d: %s", got.status, got.raw)
	}

	updated := call(t, s, http.MethodPatch, "/api/v1/settings", testSecret, token, map[string]any{
		"phone": "02 999 8888",
		"settings": map[string]string{
			"receipt.footer": "thank you",
		},
	})
	if updated.status != http.StatusOK {
		t.Fatalf("patch settings = %d: %s", updated.status, updated.raw)
	}
	if clinic, _ := updated.body["clinic"].(map[string]any); clinic["phone"] != "02 999 8888" {
		t.Fatalf("profile phone not updated: %s", updated.raw)
	}
	if values, _ := updated.body["settings"].(map[string]any); values["receipt.footer"] != "thank you" {
		t.Fatalf("setting not saved: %s", updated.raw)
	}

	// A receptionist is refused the admin-only patch. Seed the account
	// directly, then log in through the public API.
	me := call(t, s, http.MethodGet, "/api/v1/auth/me", testSecret, token, nil)
	adminUser, _ := me.body["user"].(map[string]any)
	clinicID, _ := adminUser["clinicId"].(string)

	pinHash, err := auth.HashPIN("5678")
	if err != nil {
		t.Fatalf("hash pin: %v", err)
	}
	now := db.UtcNow()
	q := db.New(s.sqlDB)
	receptionist, err := q.CreateUser(context.Background(), db.CreateUserParams{
		ID: uuid.NewString(), ClinicID: clinicID, Name: "Ploy",
		Username: "ploy", PinHash: pinHash, Active: 1,
		CreatedAt: now, UpdatedAt: now,
	})
	if err != nil {
		t.Fatalf("seed receptionist: %v", err)
	}
	if err := q.AssignRole(context.Background(), db.AssignRoleParams{
		UserID: receptionist.ID, RoleID: "role-" + auth.RoleReceptionist,
	}); err != nil {
		t.Fatalf("assign role: %v", err)
	}
	login := call(t, s, http.MethodPost, "/api/v1/auth/login", testSecret, "", map[string]any{
		"username": "ploy", "pin": "5678",
	})
	if login.status != http.StatusOK {
		t.Fatalf("receptionist login = %d: %s", login.status, login.raw)
	}
	receptionToken, _ := login.body["token"].(string)

	if read := call(t, s, http.MethodGet, "/api/v1/settings", testSecret, receptionToken, nil); read.status != http.StatusOK {
		t.Fatalf("receptionist read settings = %d, want 200", read.status)
	}
	if denied := call(t, s, http.MethodPatch, "/api/v1/settings", testSecret, receptionToken, map[string]any{
		"phone": "02 000 0000",
	}); denied.status != http.StatusForbidden {
		t.Fatalf("receptionist patch settings = %d, want 403", denied.status)
	}

	// The backend enforces financial corrections too: voiding a payment is
	// admin-only (plan BILL-10 / AUTH-06).
	if denied := call(t, s, http.MethodPost, "/api/v1/payments/no-such/void", testSecret, receptionToken, nil); denied.status != http.StatusForbidden {
		t.Fatalf("receptionist void payment = %d, want 403", denied.status)
	}
	if denied := call(t, s, http.MethodPost, "/api/v1/invoices/no-such/void", testSecret, receptionToken, nil); denied.status != http.StatusForbidden {
		t.Fatalf("receptionist void invoice = %d, want 403", denied.status)
	}
}

const backupEnvelopeJSON = `{"format":"vetcare-clinic-backup","version":1,"createdAt":"2026-11-06T10:00:00Z","trigger":"auto","state":{"clinic":{"id":"clinic-01"}}}`

// newTestServerWithBackups exposes the backup directory for on-disk asserts.
func newTestServerWithBackups(t *testing.T) (*Server, string) {
	t.Helper()
	conn, err := db.Open(":memory:")
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	t.Cleanup(func() { _ = conn.Close() })
	dir := t.TempDir()
	return New(conn, Options{Secret: testSecret, BackupsDir: dir}), dir
}

func TestBackupRoutesRequireAuth(t *testing.T) {
	s := newTestServer(t)
	if res := call(t, s, http.MethodGet, "/api/v1/backups", testSecret, "", nil); res.status != http.StatusUnauthorized {
		t.Fatalf("unauthenticated list = %d, want 401", res.status)
	}
	if res := call(t, s, http.MethodPost, "/api/v1/backups", testSecret, "", nil); res.status != http.StatusUnauthorized {
		t.Fatalf("unauthenticated save = %d, want 401", res.status)
	}
}

func TestBackupRoundTrip(t *testing.T) {
	s, dir := newTestServerWithBackups(t)
	token := setupClinic(t, s)

	saved := call(t, s, http.MethodPost, "/api/v1/backups", testSecret, token, nil)
	if saved.status != http.StatusBadRequest {
		t.Fatalf("empty body = %d, want 400", saved.status)
	}

	envelope := callRaw(t, s, http.MethodPost, "/api/v1/backups", token, backupEnvelopeJSON)
	if envelope.status != http.StatusOK {
		t.Fatalf("save = %d: %s", envelope.status, envelope.raw)
	}
	file, _ := envelope.body["file"].(string)
	if !strings.HasSuffix(file, "-auto.json") {
		t.Fatalf("server-derived name must carry the trigger, got %q", file)
	}

	// The file exists on disk with the exact posted bytes.
	onDisk, err := os.ReadFile(filepath.Join(dir, file))
	if err != nil {
		t.Fatalf("backup not written to the configured dir: %v", err)
	}
	if string(onDisk) != backupEnvelopeJSON {
		t.Fatal("backup bytes were altered by save")
	}

	list := call(t, s, http.MethodGet, "/api/v1/backups", testSecret, token, nil)
	if list.status != http.StatusOK {
		t.Fatalf("list = %d: %s", list.status, list.raw)
	}
	entries, _ := list.body["backups"].([]any)
	if len(entries) != 1 {
		t.Fatalf("backups = %d, want 1: %s", len(entries), list.raw)
	}
	entry, _ := entries[0].(map[string]any)
	if entry["trigger"] != "auto" || entry["createdAt"] == "" || entry["sizeBytes"].(float64) == 0 {
		t.Fatalf("unexpected list entry: %s", list.raw)
	}

	got := callRaw(t, s, http.MethodGet, "/api/v1/backups/"+file, token, "")
	if got.status != http.StatusOK || string(got.raw) != backupEnvelopeJSON {
		t.Fatalf("get = %d: %s", got.status, got.raw)
	}
}

func TestBackupSaveDefaultsUnknownTrigger(t *testing.T) {
	s := newTestServer(t)
	token := setupClinic(t, s)
	body := strings.Replace(backupEnvelopeJSON, `"trigger":"auto"`, `"trigger":"hacker"`, 1)
	saved := callRaw(t, s, http.MethodPost, "/api/v1/backups", token, body)
	if saved.status != http.StatusOK {
		t.Fatalf("save = %d: %s", saved.status, saved.raw)
	}
	if file, _ := saved.body["file"].(string); !strings.HasSuffix(file, "-manual.json") {
		t.Fatalf("unknown trigger must default to manual, got %q", file)
	}
}

func TestBackupSaveRejectsForeignBodies(t *testing.T) {
	s := newTestServer(t)
	token := setupClinic(t, s)
	cases := []string{
		`{"format": "something-else", "state": {"clinic": {"id": "x"}}}`,
		`{"format": "vetcare-clinic-backup", "state": {"clinic": {"id": "x"}}}`, // no createdAt
		`{"format": "vetcare-clinic-backup", "createdAt": "x", "state": {}}`,    // no clinic id
		`not json`,
	}
	for _, body := range cases {
		if res := callRaw(t, s, http.MethodPost, "/api/v1/backups", token, body); res.status != http.StatusBadRequest {
			t.Fatalf("body %q: expected 400, got %d", body, res.status)
		}
	}
}

func TestBackupRotationKeepsNewest14(t *testing.T) {
	s := newTestServer(t)
	token := setupClinic(t, s)
	for i := 0; i < 16; i++ {
		if res := callRaw(t, s, http.MethodPost, "/api/v1/backups", token, backupEnvelopeJSON); res.status != http.StatusOK {
			t.Fatalf("save %d failed: %d", i, res.status)
		}
	}
	list := call(t, s, http.MethodGet, "/api/v1/backups", testSecret, token, nil)
	entries, _ := list.body["backups"].([]any)
	if len(entries) != 14 {
		t.Fatalf("rotation must keep 14 files, got %d", len(entries))
	}
	// Filenames share a same-second timestamp, so also assert the list is
	// newest-first by name.
	prev := ""
	for _, raw := range entries {
		entry, _ := raw.(map[string]any)
		name, _ := entry["file"].(string)
		if prev != "" && prev < name {
			t.Fatalf("list must be newest first: %q before %q", prev, name)
		}
		prev = name
	}
}

func TestBackupGetRejectsPathTraversal(t *testing.T) {
	s := newTestServer(t)
	token := setupClinic(t, s)
	for _, name := range []string{"..%2F..%2Fvetcare.db", "sub%2Fdir.json", "20261106-090000-auto.txt"} {
		if res := callRaw(t, s, http.MethodGet, "/api/v1/backups/"+name, token, ""); res.status != http.StatusBadRequest {
			t.Fatalf("name %q: expected 400, got %d", name, res.status)
		}
	}
}

func TestBackupGetMissingIsNotFound(t *testing.T) {
	s := newTestServer(t)
	token := setupClinic(t, s)
	if res := callRaw(t, s, http.MethodGet, "/api/v1/backups/20261106-090000-auto.json", token, ""); res.status != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", res.status)
	}
}

// callRaw posts/gets a raw string body (backup envelopes must survive
// byte-for-byte) and returns the raw response text.
func callRaw(t *testing.T, s *Server, method, path, token, body string) response {
	t.Helper()
	var reader io.Reader
	if body != "" {
		reader = strings.NewReader(body)
	}
	req := httptest.NewRequest(method, path, reader)
	if body != "" {
		req.Header.Set("Content-Type", "application/json")
	}
	req.Header.Set(LoopbackSecretHeader, testSecret)
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	rec := httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	out := response{status: rec.Code, raw: rec.Body.Bytes()}
	if len(out.raw) > 0 && rec.Header().Get("Content-Type") == "application/json" {
		_ = json.Unmarshal(out.raw, &out.body)
	}
	return out
}
