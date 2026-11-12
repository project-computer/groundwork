package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/project-computer/groundwork/sidecar/internal/db"
	"github.com/project-computer/groundwork/sidecar/internal/store"
	"github.com/project-computer/groundwork/sidecar/internal/sync"
)

const testSecret = "test-launch-secret"

func newTestServer(t *testing.T) (*httptest.Server, *http.Client) {
	t.Helper()
	database, err := db.OpenInMemory()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { database.Close() })
	st := store.New(database)
	server := httptest.NewServer(New(st, sync.NewEngine(st, nil), Options{
		Secret:     testSecret,
		BackupsDir: t.TempDir(),
	}).Handler())
	t.Cleanup(server.Close)
	// Every business request carries the per-launch secret (ADR 0020).
	return server, &http.Client{Transport: &secretTransport{secret: testSecret}}
}

// secretTransport injects the loopback secret header, the way backend.ts does.
type secretTransport struct{ secret string }

func (t *secretTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	req = req.Clone(req.Context())
	req.Header.Set(LoopbackSecretHeader, t.secret)
	return http.DefaultTransport.RoundTrip(req)
}

func validState() []byte {
	return []byte(`{
		"clinic": {"id": "clinic-01", "name": "Baan Sathorn", "timezone": "Asia/Bangkok", "currency": "THB", "vatRate": 0.07},
		"users": [], "owners": [], "patients": [], "appointments": [],
		"encounters": [], "products": [], "stockMovements": [], "suppliers": [],
		"inventoryItems": [], "inventoryLots": [], "invoices": [],
		"payments": [], "vaccinations": [], "caseTransfers": [], "audit": [], "outbox": []
	}`)
}

func TestStateRoundTrip(t *testing.T) {
	server, client := newTestServer(t)

	resp, err := client.Get(server.URL + "/state")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	var empty map[string]any
	json.NewDecoder(resp.Body).Decode(&empty)
	if empty["state"] != nil {
		t.Fatalf("expected null state on first load, got %v", empty["state"])
	}

	req, _ := http.NewRequest(http.MethodPut, server.URL+"/state", bytes.NewReader(validState()))
	req.Header.Set("Content-Type", "application/json")
	resp, err = client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("save failed: %d", resp.StatusCode)
	}

	resp, err = client.Get(server.URL + "/state")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	var saved struct {
		State struct {
			Clinic struct{ Name string } `json:"clinic"`
		} `json:"state"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&saved); err != nil {
		t.Fatal(err)
	}
	if saved.State.Clinic.Name != "Baan Sathorn" {
		t.Fatalf("unexpected clinic name %q", saved.State.Clinic.Name)
	}
}

func TestStateRejectsInvalidDocument(t *testing.T) {
	server, client := newTestServer(t)
	req, _ := http.NewRequest(http.MethodPut, server.URL+"/state", bytes.NewReader([]byte(`{"clinic":{}}`)))
	req.Header.Set("Content-Type", "application/json")
	resp, err := client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", resp.StatusCode)
	}
}

func TestSyncRunWithoutCloudIsUnavailable(t *testing.T) {
	server, client := newTestServer(t)
	req, _ := http.NewRequest(http.MethodPost, server.URL+"/sync/run", bytes.NewReader(validState()))
	resp, err := client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusServiceUnavailable {
		t.Fatalf("expected 503, got %d", resp.StatusCode)
	}
}

func TestCORSPreflight(t *testing.T) {
	server, client := newTestServer(t)
	req, _ := http.NewRequest(http.MethodOptions, server.URL+"/state", nil)
	req.Header.Set("Origin", "http://localhost:1420")
	resp, err := client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusNoContent {
		t.Fatalf("expected 204, got %d", resp.StatusCode)
	}
	if got := resp.Header.Get("Access-Control-Allow-Origin"); got != "http://localhost:1420" {
		t.Fatalf("unexpected allow-origin %q", got)
	}
	// The webview must be allowed to send the secret header on real requests.
	if allowed := resp.Header.Get("Access-Control-Allow-Headers"); !strings.Contains(allowed, LoopbackSecretHeader) {
		t.Fatalf("secret header not allowed by CORS: %q", allowed)
	}
}

// --- ADR 0020: the per-launch loopback secret ---

func TestRequestsWithoutSecretAreUnauthorized(t *testing.T) {
	server, _ := newTestServer(t)

	cases := []struct {
		name   string
		header string
		want   int
	}{
		{"missing header", "", http.StatusUnauthorized},
		{"wrong secret", "not-the-secret", http.StatusUnauthorized},
		{"correct secret", testSecret, http.StatusOK},
	}
	for _, tc := range cases {
		req, _ := http.NewRequest(http.MethodGet, server.URL+"/state", nil)
		if tc.header != "" {
			req.Header.Set(LoopbackSecretHeader, tc.header)
		}
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		resp.Body.Close()
		if resp.StatusCode != tc.want {
			t.Fatalf("%s: expected %d, got %d", tc.name, tc.want, resp.StatusCode)
		}
	}
}

func TestHealthStaysUnauthenticated(t *testing.T) {
	server, _ := newTestServer(t)
	resp, err := http.Get(server.URL + "/healthz")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("healthz must stay open for the readiness probe, got %d", resp.StatusCode)
	}
}

func TestEmptySecretFailsClosed(t *testing.T) {
	database, err := db.OpenInMemory()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { database.Close() })
	st := store.New(database)
	server := httptest.NewServer(New(st, sync.NewEngine(st, nil), Options{BackupsDir: t.TempDir()}).Handler())
	t.Cleanup(server.Close)

	resp, err := http.Get(server.URL + "/state")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("an unconfigured secret must reject everything, got %d", resp.StatusCode)
	}
}
