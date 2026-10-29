package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/vet-clinic/sidecar/internal/db"
	"github.com/vet-clinic/sidecar/internal/store"
	"github.com/vet-clinic/sidecar/internal/sync"
)

func newTestServer(t *testing.T) *httptest.Server {
	t.Helper()
	database, err := db.OpenInMemory()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { database.Close() })
	st := store.New(database)
	server := httptest.NewServer(New(st, sync.NewEngine(st, nil)).Handler())
	t.Cleanup(server.Close)
	return server
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
	server := newTestServer(t)

	resp, err := http.Get(server.URL + "/state")
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
	resp, err = http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("save failed: %d", resp.StatusCode)
	}

	resp, err = http.Get(server.URL + "/state")
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
	server := newTestServer(t)
	req, _ := http.NewRequest(http.MethodPut, server.URL+"/state", bytes.NewReader([]byte(`{"clinic":{}}`)))
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", resp.StatusCode)
	}
}

func TestSyncRunWithoutCloudIsUnavailable(t *testing.T) {
	server := newTestServer(t)
	req, _ := http.NewRequest(http.MethodPost, server.URL+"/sync/run", bytes.NewReader(validState()))
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusServiceUnavailable {
		t.Fatalf("expected 503, got %d", resp.StatusCode)
	}
}

func TestCORSPreflight(t *testing.T) {
	server := newTestServer(t)
	req, _ := http.NewRequest(http.MethodOptions, server.URL+"/state", nil)
	req.Header.Set("Origin", "http://localhost:1420")
	resp, err := http.DefaultClient.Do(req)
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
}
