package api

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

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
	return New(conn, testSecret, nil)
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
