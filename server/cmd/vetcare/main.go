// Command vetcare is the local REST backend for the VetCare desktop app.
// It owns the normalized SQLite database and serves /api/v1 over loopback.
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

	"github.com/project-computer/groundwork/server/internal/offlineapi/api"
	"github.com/project-computer/groundwork/server/internal/offlineapi/db"
	"github.com/project-computer/groundwork/server/internal/offlineapi/logging"
)

func main() {
	dbPath := os.Getenv("VET_DB")
	if dbPath == "" {
		configDir, err := os.UserConfigDir()
		if err != nil {
			log.Fatalf("resolve config dir: %v", err)
		}
		// A distinct file from the legacy document database so the two can
		// coexist until the phase-4 importer runs.
		dbPath = filepath.Join(configDir, "vet-clinic", "vetcare.db")
	}
	dataDir := filepath.Dir(dbPath)
	logger := newLogger(dataDir)

	secret := os.Getenv("VETCARE_LOOPBACK_SECRET")
	if secret == "" {
		logger.Fatal("VETCARE_LOOPBACK_SECRET is required; refusing to serve without a per-launch secret")
	}

	conn, err := db.Open(dbPath)
	if err != nil {
		logger.Fatalf("open database: %v", err)
	}
	defer conn.Close()

	port := os.Getenv("VET_PORT")
	if port == "" {
		port = "0"
	}
	listener, err := net.Listen("tcp", "127.0.0.1:"+port)
	if err != nil {
		logger.Fatalf("listen: %v", err)
	}

	server := &http.Server{
		Handler:           api.New(conn, secret, logger).Handler(),
		ReadHeaderTimeout: 10 * time.Second,
	}

	// The Tauri shell parses this line to learn which random port was bound.
	fmt.Printf("LISTENING http://%s\n", listener.Addr().String())
	_ = os.Stdout.Sync()

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

func newLogger(dataDir string) *log.Logger {
	out := io.Writer(os.Stderr)
	if writer, err := logging.Open(filepath.Join(dataDir, "logs", "vetcare-api.log"), logging.DefaultMaxBytes, logging.DefaultKeep); err == nil {
		out = io.MultiWriter(os.Stderr, writer)
	}
	return log.New(out, "vetcare-api: ", log.LstdFlags)
}
