package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"
)

// Backup file persistence (ADR 0021). The sidecar writes restorable
// whole-clinic documents into the backups directory with bounded retention.
// Filenames are derived server-side from the envelope — clients never name
// files — and the trigger is validated so the folder stays machine-parseable.

const (
	backupFormatID = "vetcare-clinic-backup"

	// Files kept after rotation; deletion happens only after a successful
	// write of the new backup, never before.
	backupKeepCount = 14

	backupTimestampLayout = "20060102-150405"
)

// Triggers mirror the envelope field the frontend writes (lib/vet/backup.ts).
var backupTriggers = map[string]bool{
	"auto":        true,
	"manual":      true,
	"pre-restore": true,
}

type backupEnvelope struct {
	Format    string `json:"format"`
	Version   int    `json:"version"`
	CreatedAt string `json:"createdAt"`
	Trigger   string `json:"trigger"`
	State     struct {
		Clinic struct {
			ID string `json:"id"`
		} `json:"clinic"`
	} `json:"state"`
}

type backupInfo struct {
	File      string `json:"file"`
	CreatedAt string `json:"createdAt"`
	SizeBytes int64  `json:"sizeBytes"`
	Trigger   string `json:"trigger"`
}

func (s *Server) handleBackupSave(w http.ResponseWriter, r *http.Request) {
	body, err := readBody(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	var envelope backupEnvelope
	if err := json.Unmarshal(body, &envelope); err != nil {
		writeError(w, http.StatusBadRequest, "body is not a JSON backup envelope")
		return
	}
	if envelope.Format != backupFormatID || envelope.CreatedAt == "" || envelope.State.Clinic.ID == "" {
		writeError(w, http.StatusBadRequest, "body is not a clinic backup envelope")
		return
	}
	trigger := envelope.Trigger
	if !backupTriggers[trigger] {
		// Unknown or absent trigger defaults to manual; the envelope itself is
		// preserved byte-for-byte.
		trigger = "manual"
	}
	name, err := s.writeBackupFile(body, trigger)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"saved": true, "file": name})
}

func (s *Server) handleBackupList(w http.ResponseWriter, r *http.Request) {
	entries, err := os.ReadDir(s.backupsDir)
	if err != nil {
		if os.IsNotExist(err) {
			writeJSON(w, http.StatusOK, map[string]any{"backups": []backupInfo{}})
			return
		}
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	backups := make([]backupInfo, 0, len(entries))
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".json") {
			continue
		}
		info, err := entry.Info()
		if err != nil {
			continue
		}
		backups = append(backups, backupInfo{
			File:      entry.Name(),
			CreatedAt: backupFileTimestamp(entry.Name(), info.ModTime()),
			SizeBytes: info.Size(),
			Trigger:   backupFileTrigger(entry.Name()),
		})
	}
	// Filenames are timestamp-prefixed, so a descending sort is newest first.
	sort.Slice(backups, func(i, j int) bool { return backups[i].File > backups[j].File })
	writeJSON(w, http.StatusOK, map[string]any{"backups": backups})
}

func (s *Server) handleBackupGet(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("file")
	// Only ever serve files the sidecar itself named: a timestamp-prefixed
	// JSON file directly in the backups directory.
	if !backupFileNameRe.MatchString(name) {
		writeError(w, http.StatusBadRequest, "invalid backup file name")
		return
	}
	content, err := os.ReadFile(filepath.Join(s.backupsDir, filepath.FromSlash(name)))
	if err != nil {
		status := http.StatusInternalServerError
		if os.IsNotExist(err) {
			status = http.StatusNotFound
		}
		writeError(w, status, "backup not found")
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	w.Write(content)
}

var backupFileNameRe = regexp.MustCompile(`^[0-9]{8}-[0-9]{6}-[a-z0-9-]+\.json$`)

// writeBackupFile persists the envelope under a server-derived name and then
// rotates the folder down to backupKeepCount files.
func (s *Server) writeBackupFile(body []byte, trigger string) (string, error) {
	if err := os.MkdirAll(s.backupsDir, 0o700); err != nil {
		return "", err
	}
	base := time.Now().UTC().Format(backupTimestampLayout) + "-" + trigger + ".json"
	name := base
	for i := 2; ; i++ {
		if _, err := os.Stat(filepath.Join(s.backupsDir, name)); os.IsNotExist(err) {
			break
		}
		name = fmt.Sprintf("%s-%d.json", strings.TrimSuffix(base, ".json"), i)
	}
	if err := os.WriteFile(filepath.Join(s.backupsDir, name), body, 0o600); err != nil {
		return "", err
	}
	s.rotateBackups()
	return name, nil
}

func (s *Server) rotateBackups() {
	entries, err := os.ReadDir(s.backupsDir)
	if err != nil {
		return
	}
	var files []string
	for _, entry := range entries {
		if !entry.IsDir() && strings.HasSuffix(entry.Name(), ".json") {
			files = append(files, entry.Name())
		}
	}
	sort.Sort(sort.Reverse(sort.StringSlice(files)))
	for i := backupKeepCount; i < len(files); i++ {
		_ = os.Remove(filepath.Join(s.backupsDir, files[i]))
	}
}

// backupFileTimestamp parses the timestamp prefix of a server-derived
// filename; files that do not match fall back to the modification time.
func backupFileTimestamp(name string, modTime time.Time) string {
	if len(name) >= len(backupTimestampLayout) {
		if ts, err := time.Parse(backupTimestampLayout, name[:len(backupTimestampLayout)]); err == nil {
			return ts.UTC().Format(time.RFC3339)
		}
	}
	return modTime.UTC().Format(time.RFC3339)
}

func backupFileTrigger(name string) string {
	parts := strings.Split(strings.TrimSuffix(name, ".json"), "-")
	// <date>-<time>-<trigger…>: the trigger is everything after the two
	// timestamp segments (it may itself contain hyphens).
	if len(parts) >= 3 {
		trigger := strings.Join(parts[2:], "-")
		if backupTriggers[trigger] {
			return trigger
		}
	}
	return "manual"
}
