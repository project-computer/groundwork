package local

import (
	"crypto/rand"
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"time"
)

func UtcNow() string {
	return time.Now().UTC().Format("2006-01-02T15:04:05.000Z07:00")
}

func NewUUID() string {
	var b [16]byte
	_, _ = rand.Read(b[:])
	b[6] = (b[6] & 0x0f) | 0x40
	b[8] = (b[8] & 0x3f) | 0x80
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:16])
}

// DB owns the SQLite connection. Every exported operation takes the mutex,
// mirroring the single-connection model the app used under Rust.
type DB struct {
	SQL *sql.DB

	mu chan struct{}
}

// Open opens (creating if needed) the clinic database at path. The caller is
// responsible for migrations being applied (the Rust shell does this before
// launching the sidecar). LocalNow truncates timestamps the way the Rust
// implementation did.
func Open(path string) (*DB, error) {
	if parent := filepath.Dir(path); parent != "" && parent != "." {
		if err := os.MkdirAll(parent, 0o755); err != nil {
			return nil, err
		}
	}
	dsn := "file:" + path + "?_pragma=foreign_keys(1)&_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)"
	sdb, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, err
	}
	pingErr := sdb.Ping()
	if pingErr != nil {
		sdb.Close()
		return nil, pingErr
	}
	return &DB{SQL: sdb, mu: make(chan struct{}, 1)}, nil
}

func (d *DB) Close() error { return d.SQL.Close() }

// tx runs fn inside a BEGIN/COMMIT pair (rollback on error).
func (d *DB) tx(fn func(tx *sql.Tx) error) error {
	d.mu <- struct{}{}
	defer func() { <-d.mu }()
	tx, err := d.SQL.Begin()
	if err != nil {
		return err
	}
	if err = fn(tx); err != nil {
		_ = tx.Rollback()
		return err
	}
	return tx.Commit()
}

// once runs fn while holding the serialization token.
func (d *DB) once(fn func(*sql.DB) error) error {
	d.mu <- struct{}{}
	defer func() { <-d.mu }()
	return fn(d.SQL)
}
