// Command clinic-core is the local sidecar for the Vet Clinic desktop app.
// It owns the SQLite clinic document and performs cloud sync, exposing a
// loopback-only HTTP API to the Tauri webview.
package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"github.com/vet-clinic/sidecar/internal/api"
	"github.com/vet-clinic/sidecar/internal/db"
	"github.com/vet-clinic/sidecar/internal/store"
	"github.com/vet-clinic/sidecar/internal/sync"
)

func main() {
	logger := log.New(os.Stderr, "clinic-core: ", log.LstdFlags)

	dbPath := os.Getenv("VET_DB")
	if dbPath == "" {
		configDir, err := os.UserConfigDir()
		if err != nil {
			logger.Fatalf("resolve config dir: %v", err)
		}
		dbPath = filepath.Join(configDir, "vet-clinic", "clinic.db")
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
		Handler:           api.New(st, engine).Handler(),
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
