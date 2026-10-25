// Package migrations embeds the SQLite schema so the sidecar binary is
// self-contained.
package migrations

import "embed"

//go:embed *.sql
var FS embed.FS
