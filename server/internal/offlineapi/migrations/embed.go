// Package migrations embeds the normalized SQLite schema so the service
// ships as a single binary.
package migrations

import "embed"

//go:embed *.sql
var FS embed.FS
