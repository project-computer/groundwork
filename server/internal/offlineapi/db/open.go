package db

import (
	"database/sql"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	_ "modernc.org/sqlite"

	"github.com/project-computer/groundwork/server/internal/offlineapi/migrations"
)

// UtcNow is the one timestamp format the service writes: UTC ISO-8601 with
// millisecond precision, matching ADR 0005.
func UtcNow() string {
	return time.Now().UTC().Format("2006-01-02T15:04:05.000Z07:00")
}

type migration struct {
	version int64
	name    string
	sql     string
}

func loadMigrations() ([]migration, error) {
	entries, err := fs.ReadDir(migrations.FS, ".")
	if err != nil {
		return nil, err
	}
	var out []migration
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".sql") {
			continue
		}
		prefix, _, ok := strings.Cut(entry.Name(), "_")
		if !ok {
			continue
		}
		version, err := strconv.ParseInt(prefix, 10, 64)
		if err != nil {
			continue
		}
		content, err := fs.ReadFile(migrations.FS, entry.Name())
		if err != nil {
			return nil, err
		}
		out = append(out, migration{version: version, name: entry.Name(), sql: string(content)})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].version < out[j].version })
	return out, nil
}

func migrate(conn *sql.DB) error {
	if _, err := conn.Exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
		version INTEGER PRIMARY KEY,
		applied_at TEXT NOT NULL
	)`); err != nil {
		return err
	}

	applied := map[int64]bool{}
	rows, err := conn.Query("SELECT version FROM schema_migrations")
	if err != nil {
		return err
	}
	for rows.Next() {
		var version int64
		if err := rows.Scan(&version); err != nil {
			rows.Close()
			return err
		}
		applied[version] = true
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}

	all, err := loadMigrations()
	if err != nil {
		return err
	}
	for _, m := range all {
		if applied[m.version] {
			continue
		}
		tx, err := conn.Begin()
		if err != nil {
			return err
		}
		if _, err := tx.Exec(m.sql); err != nil {
			tx.Rollback()
			return fmt.Errorf("migration %s failed: %w", m.name, err)
		}
		if _, err := tx.Exec(
			"INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)",
			m.version, UtcNow(),
		); err != nil {
			tx.Rollback()
			return err
		}
		if err := tx.Commit(); err != nil {
			return err
		}
	}
	return nil
}

// Open opens (creating if needed) the normalized SQLite database at path,
// enables the pragmatic pragmas (foreign keys, WAL, busy timeout) and applies
// pending migrations.
func Open(path string) (*sql.DB, error) {
	if path != ":memory:" {
		if parent := filepath.Dir(path); parent != "" && parent != "." {
			if err := os.MkdirAll(parent, 0o755); err != nil {
				return nil, err
			}
		}
	}
	conn, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, err
	}
	conn.SetMaxOpenConns(1)
	if _, err := conn.Exec("PRAGMA foreign_keys = ON"); err != nil {
		conn.Close()
		return nil, err
	}
	if _, err := conn.Exec("PRAGMA busy_timeout = 5000"); err != nil {
		conn.Close()
		return nil, err
	}
	if path != ":memory:" {
		if _, err := conn.Exec("PRAGMA journal_mode = WAL"); err != nil {
			conn.Close()
			return nil, err
		}
	}
	if err := migrate(conn); err != nil {
		conn.Close()
		return nil, err
	}
	return conn, nil
}
