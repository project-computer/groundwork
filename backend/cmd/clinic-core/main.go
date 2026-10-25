package main

import (
	"bufio"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"os"

	"github.com/vet-clinic/api/internal/local"
)

type request struct {
	ID     uint64          `json:"id"`
	Method string          `json:"method"`
	Params json.RawMessage `json:"params"`
}

type response struct {
	ID     uint64 `json:"id"`
	Result any    `json:"result,omitempty"`
	Error  string `json:"error,omitempty"`
}

func main() {
	dbPath := flag.String("db", "", "path to clinic.db")
	flag.Parse()
	if *dbPath == "" {
		fmt.Fprintln(os.Stderr, "clinic-core: --db is required")
		os.Exit(2)
	}

	db, err := local.Open(*dbPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "clinic-core: failed to open database: %v\n", err)
		os.Exit(1)
	}
	defer db.Close()

	run(os.Stdin, os.Stdout, db)
}

func run(stdin io.Reader, stdout io.Writer, db *local.DB) {	w := bufio.NewWriter(stdout)
	enc := json.NewEncoder(w)
	sc := bufio.NewScanner(stdin)
	sc.Buffer(make([]byte, 0, 1024*1024), 64*1024*1024)

	for sc.Scan() {
		trimmed := sc.Bytes()
		if len(trimmed) == 0 {
			continue
		}
		var req request
		if err := json.Unmarshal(trimmed, &req); err != nil {
			continue
		}
		resp := response{ID: req.ID}
		result, err := dispatch(db, req.Method, req.Params)
		if err != nil {
			resp.Error = err.Error()
		} else {
			resp.Result = result
		}
		if err := enc.Encode(resp); err != nil {
			log.Printf("encode: %v", err)
			return
		}
		if err := w.Flush(); err != nil {
			log.Printf("write: %v", err)
			return
		}
	}
}

func dispatch(db *local.DB, method string, params json.RawMessage) (any, error) {
	pm := map[string]any{}
	if len(params) > 0 {
		if err := json.Unmarshal(params, &pm); err != nil {
			return nil, err
		}
	}
	switch method {
	case "clinic_load":
		return db.ClinicLoad()
	case "patient_upsert":
		return nil, db.PatientUpsert(pm["patient"])
	case "patient_delete":
		return nil, db.PatientDelete(reqString(pm["id"]))
	case "appointment_upsert":
		return nil, db.AppointmentUpsert(pm["appointment"])
	case "appointment_delete":
		return nil, db.AppointmentDelete(reqString(pm["id"]))
	case "appointment_set_status":
		return nil, db.AppointmentSetStatus(reqString(pm["id"]), reqString(pm["status"]))
	case "record_upsert":
		return nil, db.RecordUpsert(pm["record"])
	case "record_set_paid":
		paid, _ := pm["paid"].(bool)
		return nil, db.RecordSetPaid(reqString(pm["id"]), paid)
	case "settings_save":
		return nil, db.SettingsSave(pm["settings"])
	case "data_replace":
		return nil, db.DataReplace(pm["data"])
	case "data_merge":
		return nil, db.DataMerge(pm["data"])
	case "consult_start":
		return db.ConsultStart(reqString(pm["appointmentId"]))
	case "walk_in_start":
		return db.WalkInStart(reqString(pm["patientId"]), optString(pm["reason"]), optString(pm["vet"]))
	case "visit_finish":
		return db.VisitFinish(pm["record"])
	default:
		return nil, fmt.Errorf("unknown method %q", method)
	}
}

func reqString(v any) string {
	if s, ok := v.(string); ok && s != "" {
		return s
	}
	return ""
}

func optString(v any) string {
	if s, ok := v.(string); ok {
		return s
	}
	return ""
}
