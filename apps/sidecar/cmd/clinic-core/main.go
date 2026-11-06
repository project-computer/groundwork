// Command clinic-core is the local sidecar for the Vet Clinic desktop app.
// It owns the SQLite clinic document and performs cloud sync, exposing a
// loopback-only HTTP API to the Tauri webview.
package main

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"github.com/project-computer/groundwork/sidecar/internal/api"
	"github.com/project-computer/groundwork/sidecar/internal/db"
	"github.com/project-computer/groundwork/sidecar/internal/logging"
	"github.com/project-computer/groundwork/sidecar/internal/store"
	"github.com/project-computer/groundwork/sidecar/internal/sync"
)

func main() {
	dbPath := os.Getenv("VET_DB")
	if dbPath == "" {
		configDir, err := os.UserConfigDir()
		if err != nil {
			log.Fatalf("resolve config dir: %v", err)
		}
		dbPath = filepath.Join(configDir, "vet-clinic", "clinic.db")
	}
	dataDir := filepath.Dir(dbPath)

	// Persistent rotating logs (issue 0017), best-effort: stderr always keeps
	// flowing, and a broken log directory must not prevent startup.
	logger := newLogger(dataDir)
	// The per-launch loopback secret (ADR 0020) is mandatory: without it the
	// sidecar refuses to serve, and the shell treats that as its unavailable
	// case. A random port alone is not a defence on a shared machine.
	secret := os.Getenv("VETCARE_LOOPBACK_SECRET")
	if secret == "" {
		logger.Fatalf("VETCARE_LOOPBACK_SECRET is required; refusing to serve without a per-launch secret")
	}

	database, err := db.Open(dbPath)
	if err != nil {
		logger.Fatalf("open database: %v", err)
	}
	defer database.Close()

	st := store.New(database)

	var engine *sync.Engine
	if cloudURL := os.Getenv("VET_CLOUD_URL"); cloudURL != "" {
		client := sync.NewClient(cloudURL, os.Getenv("VET_DEVICE_TOKEN"))
		client.ClinicID = os.Getenv("VET_CLINIC_ID")
		engine = sync.NewEngine(st, client)
		logger.Printf("cloud sync enabled: %s", cloudURL)
	} else {
		logger.Printf("cloud sync disabled (VET_CLOUD_URL unset)")
	}

	port := os.Getenv("VET_PORT")
	if port == "" {
		port = "0"
	}
	listener, err := net.Listen("tcp", "127.0.0.1:"+port)
	if err != nil {
		logger.Fatalf("listen: %v", err)
	}

	server := &http.Server{
		Handler:           api.New(st, engine, api.Options{Secret: secret, BackupsDir: backupDir(dataDir), Logger: logger}).Handler(),
		ReadHeaderTimeout: 10 * time.Second,
	}

	// The Tauri shell parses this line to learn which random port was bound.
	fmt.Printf("LISTENING http://%s\n", listener.Addr().String())
	os.Stdout.Sync()

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	go func() {
		if err := server.Serve(listener); err != nil && !errors.Is(err, http.ErrServerClosed) {
			logger.Fatalf("serve: %v", err)
		}
	}()

	<-ctx.Done()
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = server.Shutdown(shutdownCtx)
	logger.Printf("stopped")
}

// newLogger tees stderr with a rotating file in <data dir>/logs (issue 0017).
// The writer lives for the process lifetime — logging is best-effort and its
// close is left to process exit.
func newLogger(dataDir string) *log.Logger {
	out := io.Writer(os.Stderr)
	if writer, err := logging.Open(filepath.Join(dataDir, "logs", "clinic-core.log"), logging.DefaultMaxBytes, logging.DefaultKeep); err == nil {
		out = io.MultiWriter(os.Stderr, writer)
	}
	return log.New(out, "clinic-core: ", log.LstdFlags)
}

// backupDir resolves where restorable backups are written (ADR 0021), next to
// the database file unless overridden.
func backupDir(dataDir string) string {
	if dir := os.Getenv("VET_BACKUP_DIR"); dir != "" {
		return dir
	}
	return filepath.Join(dataDir, "backups")
}
