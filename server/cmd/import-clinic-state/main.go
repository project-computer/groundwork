// Command import-clinic-state converts a clinic_state document (the ADR-0012
// model exported by the legacy document app) into the offline-MVP normalized
// database (ADR 0023). The target must be a fresh vetcare.db — a non-empty
// one is refused, never merged.
//
// Usage:
//
//	import-clinic-state -from clinic-document.json [-to vetcare.db]
//
// `-to` defaults to $VET_DB or <config dir>/vet-clinic/vetcare.db, matching
// the vetcare service's resolution. On success it prints a per-collection
// report plus warnings; on any failure nothing is committed.
package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"path/filepath"

	"github.com/project-computer/groundwork/server/internal/offlineapi/clinicimport"
	"github.com/project-computer/groundwork/server/internal/offlineapi/db"
)

func main() {
	from := flag.String("from", "", "path to the clinic_state document (JSON)")
	to := flag.String("to", os.Getenv("VET_DB"), "target vetcare.db path")
	flag.Parse()

	if *from == "" {
		fmt.Fprintln(os.Stderr, "usage: import-clinic-state -from clinic-document.json [-to vetcare.db]")
		os.Exit(2)
	}
	if *to == "" {
		configDir, err := os.UserConfigDir()
		if err != nil {
			fatal("resolve config dir: %v", err)
		}
		*to = filepath.Join(configDir, "vet-clinic", "vetcare.db")
	}

	raw, err := os.ReadFile(*from)
	if err != nil {
		fatal("read %s: %v", *from, err)
	}
	doc, err := clinicimport.Parse(raw)
	if err != nil {
		fatal("invalid document: %v", err)
	}

	conn, err := db.Open(*to)
	if err != nil {
		fatal("open %s: %v", *to, err)
	}
	defer conn.Close()

	// Safety: import into a fresh database only. A non-empty target would
	// mean ids and invoice numbers collide — never merge.
	var clinicCount int64
	if err := conn.QueryRow("SELECT COUNT(*) FROM clinics").Scan(&clinicCount); err != nil {
		fatal("inspect target: %v", err)
	}
	if clinicCount > 0 {
		fatal("%s already contains a clinic; import targets a fresh database only", *to)
	}

	report, err := importDocument(context.Background(), conn, doc)
	if err != nil {
		fatal("import failed (nothing committed): %v", err)
	}

	encoded, err := json.MarshalIndent(report, "", "  ")
	if err != nil {
		fatal("encode report: %v", err)
	}
	fmt.Println(string(encoded))
	fmt.Printf("imported %s into %s\n", doc.Clinic.Name, *to)
}

func importDocument(ctx context.Context, conn *sql.DB, doc *clinicimport.Document) (*clinicimport.Report, error) {
	tx, err := conn.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	report, err := clinicimport.Run(ctx, db.New(tx), doc)
	if err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return report, nil
}

func fatal(format string, args ...any) {
	fmt.Fprintf(os.Stderr, "import-clinic-state: "+format+"\n", args...)
	os.Exit(1)
}
