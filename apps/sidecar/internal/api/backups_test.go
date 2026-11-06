package api

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/project-computer/groundwork/sidecar/internal/db"
	"github.com/project-computer/groundwork/sidecar/internal/store"
	"github.com/project-computer/groundwork/sidecar/internal/sync"
)

func newBackupServer(t *testing.T) (*httptest.Server, *http.Client, string) {
	t.Helper()
	database, err := db.OpenInMemory()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { database.Close() })
	st := store.New(database)
	dir := t.TempDir()
	server := httptest.NewServer(New(st, sync.NewEngine(st, nil), Options{
		Secret:     testSecret,
		BackupsDir: dir,
	}).Handler())
	t.Cleanup(server.Close)
	return server, &http.Client{Transport: &secretTransport{secret: testSecret}}, dir
}

// backupEnvelopeBody builds a minimal envelope the sidecar's save endpoint
// accepts. Full envelope validation lives client-side (parseBackup).
func backupEnvelopeBody(trigger string) []byte {
	return []byte(fmt.Sprintf(`{
		"format": "vetcare-clinic-backup",
		"version": 1,
		"createdAt": "2026-11-06T09:00:00Z",
		"trigger": %q,
		"state": {"clinic": {"id": "clinic-01", "name": "Baan Sathorn"}, "patients": [], "audit": []}
	}`, trigger))
}

func TestBackupSaveListGetRoundTrip(t *testing.T) {
	server, client, dir := newBackupServer(t)
	req, _ := http.NewRequest(http.MethodPost, server.URL+"/backups", strings.NewReader(string(backupEnvelopeBody("auto"))))
	resp, err := client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	body, _ := io.ReadAll(resp.Body)
	resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("save failed: %d: %s", resp.StatusCode, body)
	}
	var saved struct {
		File string `json:"file"`
	}
	json.Unmarshal(body, &saved)
	if !strings.HasSuffix(saved.File, "-auto.json") {
		t.Fatalf("server-derived name must carry the trigger, got %q", saved.File)
	}

	// The file exists on disk with the exact posted bytes.
	onDisk, err := os.ReadFile(filepath.Join(dir, saved.File))
	if err != nil {
		t.Fatalf("backup not written to the configured dir: %v", err)
	}
	if string(onDisk) != string(backupEnvelopeBody("auto")) {
		t.Fatal("backup bytes were altered by save")
	}

	// List shows it with parsed timestamp + trigger.
	resp, err = client.Get(server.URL + "/backups")
	if err != nil {
		t.Fatal(err)
	}
	var list struct {
		Backups []backupInfo `json:"backups"`
	}
	json.NewDecoder(resp.Body).Decode(&list)
	resp.Body.Close()
	if len(list.Backups) != 1 {
		t.Fatalf("expected 1 backup, got %d", len(list.Backups))
	}
	if list.Backups[0].Trigger != "auto" || list.Backups[0].CreatedAt == "" || list.Backups[0].SizeBytes == 0 {
		t.Fatalf("unexpected list entry: %+v", list.Backups[0])
	}

	// Get serves the envelope back.
	resp, err = client.Get(server.URL + "/backups/" + saved.File)
	if err != nil {
		t.Fatal(err)
	}
	got, _ := io.ReadAll(resp.Body)
	resp.Body.Close()
	if resp.StatusCode != http.StatusOK || string(got) != string(backupEnvelopeBody("auto")) {
		t.Fatalf("get failed: %d", resp.StatusCode)
	}
}

func TestBackupSaveDefaultsUnknownTrigger(t *testing.T) {
	server, client := newTestServer(t)
	req, _ := http.NewRequest(http.MethodPost, server.URL+"/backups", strings.NewReader(string(backupEnvelopeBody("hacker"))))
	resp, err := client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	var saved struct {
		File string `json:"file"`
	}
	json.NewDecoder(resp.Body).Decode(&saved)
	resp.Body.Close()
	if !strings.HasSuffix(saved.File, "-manual.json") {
		t.Fatalf("unknown trigger must default to manual, got %q", saved.File)
	}
}

func TestBackupSaveRejectsForeignBodies(t *testing.T) {
	server, client := newTestServer(t)
	cases := []string{
		`{"format": "something-else", "state": {"clinic": {"id": "x"}}}`,
		`{"format": "vetcare-clinic-backup", "state": {"clinic": {"id": "x"}}}`, // no createdAt
		`{"format": "vetcare-clinic-backup", "createdAt": "x", "state": {}}`,    // no clinic id
		`not json`,
	}
	for _, body := range cases {
		req, _ := http.NewRequest(http.MethodPost, server.URL+"/backups", strings.NewReader(body))
		resp, err := client.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		resp.Body.Close()
		if resp.StatusCode != http.StatusBadRequest {
			t.Fatalf("body %q: expected 400, got %d", body, resp.StatusCode)
		}
	}
}

func TestBackupRotationKeepsNewest14(t *testing.T) {
	server, client := newTestServer(t)
	for i := 0; i < 16; i++ {
		req, _ := http.NewRequest(http.MethodPost, server.URL+"/backups", strings.NewReader(string(backupEnvelopeBody("auto"))))
		resp, err := client.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("save %d failed: %d", i, resp.StatusCode)
		}
	}
	resp, err := client.Get(server.URL + "/backups")
	if err != nil {
		t.Fatal(err)
	}
	var list struct {
		Backups []backupInfo `json:"backups"`
	}
	json.NewDecoder(resp.Body).Decode(&list)
	resp.Body.Close()
	if len(list.Backups) != 14 {
		t.Fatalf("rotation must keep 14 files, got %d", len(list.Backups))
	}
	// Filenames share a same-second timestamp, so also assert list is
	// newest-first by name.
	for i := 1; i < len(list.Backups); i++ {
		if list.Backups[i-1].File < list.Backups[i].File {
			t.Fatalf("list must be newest first: %q before %q", list.Backups[i-1].File, list.Backups[i].File)
		}
	}
}

func TestBackupGetRejectsPathTraversal(t *testing.T) {
	server, client := newTestServer(t)
	for _, name := range []string{"..%2F..%2Fclinic.db", "sub%2Fdir.json", "20261106-090000-auto.txt"} {
		resp, err := client.Get(server.URL + "/backups/" + name)
		if err != nil {
			t.Fatal(err)
		}
		resp.Body.Close()
		if resp.StatusCode != http.StatusBadRequest {
			t.Fatalf("name %q: expected 400, got %d", name, resp.StatusCode)
		}
	}
}

func TestBackupGetMissingIsNotFound(t *testing.T) {
	server, client := newTestServer(t)
	resp, err := client.Get(server.URL + "/backups/20261106-090000-auto.json")
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", resp.StatusCode)
	}
}

func TestBackupRoutesRequireSecret(t *testing.T) {
	server, _, _ := newBackupServer(t)
	routes := []struct {
		method string
		path   string
	}{
		{http.MethodGet, "/backups"},
		{http.MethodPost, "/backups"},
		{http.MethodGet, "/backups/20261106-090000-auto.json"},
	}
	for _, tc := range routes {
		req, _ := http.NewRequest(tc.method, server.URL+tc.path, nil)
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		resp.Body.Close()
		if resp.StatusCode != http.StatusUnauthorized {
			t.Fatalf("%s %s without secret: expected 401, got %d", tc.method, tc.path, resp.StatusCode)
		}
	}
}
