package local

import (
	"database/sql"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
)

// ApplyMigrations applies pending SQL migrations from dir (files named
// NNNN_description.sql, applied in ascending order), tracked in
// schema_migrations just like the Rust shell does.
func (d *DB) ApplyMigrations(dir string) error {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return err
	}
	var files []string
	for _, e := range entries {
		if !e.IsDir() && strings.HasSuffix(e.Name(), ".sql") {
			files = append(files, e.Name())
		}
	}
	sort.Strings(files)

	var applied []int64
	err = d.once(func(c *sql.DB) error {
		if _, err := c.Exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
			version INTEGER PRIMARY KEY,
			applied_at TEXT NOT NULL)`); err != nil {
			return err
		}
		rows, err := c.Query("SELECT version FROM schema_migrations ORDER BY version")
		if err != nil {
			return err
		}
		defer rows.Close()
		for rows.Next() {
			var v int64
			if err := rows.Scan(&v); err != nil {
				return err
			}
			applied = append(applied, v)
		}
		return rows.Err()
	})
	if err != nil {
		return err
	}
	done := map[int64]bool{}
	for _, v := range applied {
		done[v] = true
	}

	for _, name := range files {
		prefix := strings.SplitN(name, "_", 2)[0]
		version, err := strconv.ParseInt(prefix, 10, 64)
		if err != nil {
			continue
		}
		if done[version] {
			continue
		}
		sqlBytes, err := os.ReadFile(filepath.Join(dir, name))
		if err != nil {
			return err
		}
		if err := d.tx(func(c *sql.Tx) error {
			if _, err := c.Exec(string(sqlBytes)); err != nil {
				return err
			}
			_, err := c.Exec("INSERT INTO schema_migrations (version, applied_at) VALUES (?1, ?2)", version, UtcNow())
			return err
		}); err != nil {
			return err
		}
	}
	return nil
}
