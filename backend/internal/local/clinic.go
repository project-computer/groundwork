package local

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
)

// getTimeout etc helpers -----------------------------------------------------

func strField(v map[string]any, key string) string {
	if s, ok := v[key].(string); ok {
		return s
	}
	return ""
}

func optStrField(v map[string]any, key string) any {
	if s, ok := v[key].(string); ok && s != "" {
		return s
	}
	return nil
}

func intField(v map[string]any, key string, def int64) int64 {
	switch x := v[key].(type) {
	case float64:
		return int64(x)
	case int64:
		return x
	case int:
		return int64(x)
	case string:
		var n int64
		if _, err := fmt.Sscanf(x, "%d", &n); err == nil {
			return n
		}
	}
	return def
}

func boolField(v map[string]any, key string) bool {
	if b, ok := v[key].(bool); ok {
		return b
	}
	return false
}

func obj(v any) (map[string]any, error) {
	m, ok := v.(map[string]any)
	if !ok {
		// tolerate JSON strings
		if s, isStr := v.(string); isStr {
			err := json.Unmarshal([]byte(s), &m)
			if err != nil {
				return nil, err
			}
			return m, nil
		}
		return nil, errors.New("expected JSON object")
	}
	return m, nil
}

type DBX interface {
	Exec(query string, args ...any) (sql.Result, error)
	Query(query string, args ...any) (*sql.Rows, error)
	QueryRow(query string, args ...any) *sql.Row
}

func requireID(v map[string]any, kind string) (string, error) {
	id := strField(v, "id")
	if id == "" {
		return "", fmt.Errorf("%s.id is required", kind)
	}
	return id, nil
}

/* ---------- load ---------- */

func (d *DB) ClinicLoad() (map[string]any, error) {
	var out map[string]any
	err := d.once(func(c *sql.DB) error {
		var err error
		out, err = clinicLoad(c)
		return err
	})
	return out, err
}

func clinicLoad(c DBX) (map[string]any, error) {
	patients, err := queryPatientRows(c, "SELECT id, name, species, breed, sex, birth_date, weight_kg, owner_name, owner_phone, owner_email, allergies, notes, created_at, updated_at FROM patients ORDER BY created_at DESC")
	if err != nil {
		return nil, err
	}
	appointments, err := queryAppointmentRows(c, `SELECT id, patient_id, date_time, duration_min, reason, vet, status, notes, checked_in_at, started_at, completed_at, record_id, created_at, updated_at FROM appointments ORDER BY date_time`)
	if err != nil {
		return nil, err
	}
	records, err := queryRecordContents(c, "SELECT content FROM medical_records ORDER BY created_at DESC")
	if err != nil {
		return nil, err
	}
	settings := map[string]any{}
	row := c.QueryRow("SELECT content FROM clinic_settings WHERE id = 1")
	var raw string
	if rowErr := row.Scan(&raw); rowErr == nil {
		if jsonErr := json.Unmarshal([]byte(raw), &settings); jsonErr != nil {
			return nil, jsonErr
		}
	}
	return map[string]any{
		"version":      2,
		"patients":     patients,
		"appointments": appointments,
		"records":      records,
		"settings":     settings,
	}, nil
}

func queryPatientRows(c DBX, q string, args ...any) ([]map[string]any, error) {
	rows, err := c.Query(q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id, name, species, breed, sex, birthDate, weightKg, ownerName, ownerPhone, ownerEmail, allergies, notes, createdAt, updatedAt string
		if err := rows.Scan(&id, &name, &species, &breed, &sex, &birthDate, &weightKg, &ownerName, &ownerPhone, &ownerEmail, &allergies, &notes, &createdAt, &updatedAt); err != nil {
			return nil, err
		}
		out = append(out, map[string]any{
			"id": id, "name": name, "species": species, "breed": breed, "sex": sex,
			"birthDate": birthDate, "weightKg": weightKg,
			"ownerName": ownerName, "ownerPhone": ownerPhone, "ownerEmail": ownerEmail,
			"allergies": allergies, "notes": notes,
			"createdAt": createdAt, "updatedAt": updatedAt,
		})
	}
	return out, rows.Err()
}

func queryAppointmentRows(c DBX, q string, args ...any) ([]map[string]any, error) {
	rows, err := c.Query(q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id, patientID, dateTime, reason, vet, status, notes, createdAt, updatedAt string
		var durationMin int64
		var checkedInAt, startedAt, completedAt, recordID sql.NullString
		if err := rows.Scan(&id, &patientID, &dateTime, &durationMin, &reason, &vet, &status, &notes, &checkedInAt, &startedAt, &completedAt, &recordID, &createdAt, &updatedAt); err != nil {
			return nil, err
		}
		out = append(out, map[string]any{
			"id": id, "patientId": patientID, "dateTime": dateTime,
			"durationMin": durationMin, "reason": reason, "vet": vet,
			"status": status, "notes": notes,
			"checkedInAt": nullToAny(checkedInAt), "startedAt": nullToAny(startedAt),
			"completedAt": nullToAny(completedAt), "recordId": nullToAny(recordID),
			"createdAt": createdAt, "updatedAt": updatedAt,
		})
	}
	return out, rows.Err()
}

func nullToAny(n sql.NullString) any {
	if n.Valid {
		return n.String
	}
	return nil
}

func queryRecordContents(c DBX, q string, args ...any) ([]map[string]any, error) {
	rows, err := c.Query(q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var raw string
		if err := rows.Scan(&raw); err != nil {
			return nil, err
		}
		var rec map[string]any
		if err := json.Unmarshal([]byte(raw), &rec); err != nil {
			return nil, err
		}
		out = append(out, rec)
	}
	return out, rows.Err()
}

/* ---------- row writers (shared by single ops and bulk import) ---------- */

func patientUpsertRow(c DBX, patient map[string]any) error {
	id, err := requireID(patient, "patient")
	if err != nil {
		return err
	}
	_, err = c.Exec(`INSERT INTO patients (id, name, species, breed, sex, birth_date, weight_kg,
	                          owner_name, owner_phone, owner_email, allergies, notes,
	                          created_at, updated_at)
		VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14)
		ON CONFLICT(id) DO UPDATE SET
		  name=excluded.name, species=excluded.species, breed=excluded.breed,
		  sex=excluded.sex, birth_date=excluded.birth_date, weight_kg=excluded.weight_kg,
		  owner_name=excluded.owner_name, owner_phone=excluded.owner_phone,
		  owner_email=excluded.owner_email, allergies=excluded.allergies, notes=excluded.notes,
		  updated_at=excluded.updated_at`,
		id, strField(patient, "name"), strField(patient, "species"), strField(patient, "breed"),
		strField(patient, "sex"), strField(patient, "birthDate"), strField(patient, "weightKg"),
		strField(patient, "ownerName"), strField(patient, "ownerPhone"), strField(patient, "ownerEmail"),
		strField(patient, "allergies"), strField(patient, "notes"), strField(patient, "createdAt"),
		strField(patient, "updatedAt"))
	return err
}

func appointmentUpsertRow(c DBX, appt map[string]any) error {
	id, err := requireID(appt, "appointment")
	if err != nil {
		return err
	}
	_, err = c.Exec(`INSERT INTO appointments (id, patient_id, date_time, duration_min, reason, vet,
	                                 status, notes, checked_in_at, started_at, completed_at,
	                                 record_id, created_at, updated_at)
		VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14)
		ON CONFLICT(id) DO UPDATE SET
		  patient_id=excluded.patient_id, date_time=excluded.date_time,
		  duration_min=excluded.duration_min, reason=excluded.reason, vet=excluded.vet,
		  status=excluded.status, notes=excluded.notes, checked_in_at=excluded.checked_in_at,
		  started_at=excluded.started_at, completed_at=excluded.completed_at,
		  record_id=excluded.record_id, updated_at=excluded.updated_at`,
		id, strField(appt, "patientId"), strField(appt, "dateTime"),
		intField(appt, "durationMin", 30), strField(appt, "reason"), strField(appt, "vet"),
		strField(appt, "status"), strField(appt, "notes"),
		optStrField(appt, "checkedInAt"), optStrField(appt, "startedAt"),
		optStrField(appt, "completedAt"), optStrField(appt, "recordId"),
		strField(appt, "createdAt"), strField(appt, "updatedAt"))
	return err
}

// recordUpsertRow will return an error if the record has no id.
func recordUpsertRow(c DBX, record map[string]any) error {
	id, err := requireID(record, "record")
	if err != nil {
		return err
	}
	content, err := json.Marshal(record)
	if err != nil {
		return err
	}
	_, err = c.Exec(`INSERT INTO medical_records (id, patient_id, appointment_id, vet, date, paid, status,
	                                    content, created_at, updated_at)
		VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)
		ON CONFLICT(id) DO UPDATE SET
		  patient_id=excluded.patient_id, appointment_id=excluded.appointment_id,
		  vet=excluded.vet, date=excluded.date, paid=excluded.paid, status=excluded.status,
		  content=excluded.content, updated_at=excluded.updated_at`,
		id, strField(record, "patientId"), optStrField(record, "appointmentId"),
		strField(record, "vet"), strField(record, "date"), boolField(record, "paid"),
		strField(record, "status"), string(content), strField(record, "createdAt"),
		strField(record, "updatedAt"))
	return err
}

func settingsUpsertRow(c DBX, settings map[string]any) error {
	if len(settings) == 0 {
		return nil
	}
	content, err := json.Marshal(settings)
	if err != nil {
		return err
	}
	_, err = c.Exec(`INSERT INTO clinic_settings (id, content, updated_at) VALUES (1,?1,?2)
		ON CONFLICT(id) DO UPDATE SET content=excluded.content, updated_at=excluded.updated_at`,
		string(content), UtcNow())
	return err
}

/* ---------- public operations ---------- */

func (d *DB) PatientUpsert(patient any) error {
	p, err := obj(patient)
	if err != nil {
		return err
	}
	return d.once(func(c *sql.DB) error { return patientUpsertRow(c, p) })
}

func (d *DB) PatientDelete(id string) error {
	return d.once(func(c *sql.DB) error {
		_, err := c.Exec("DELETE FROM patients WHERE id = ?1", id)
		return err
	})
}

func (d *DB) AppointmentUpsert(appt any) error {
	a, err := obj(appt)
	if err != nil {
		return err
	}
	return d.once(func(c *sql.DB) error { return appointmentUpsertRow(c, a) })
}

func (d *DB) AppointmentDelete(id string) error {
	return d.once(func(c *sql.DB) error {
		_, err := c.Exec("DELETE FROM appointments WHERE id = ?1", id)
		return err
	})
}

func (d *DB) AppointmentSetStatus(id, status string) error {
	return d.once(func(c *sql.DB) error {
		now := UtcNow()
		_, err := c.Exec(`UPDATE appointments SET
			status = ?1,
			checked_in_at = CASE WHEN ?1 = 'checked-in' AND checked_in_at IS NULL THEN ?2 ELSE checked_in_at END,
			completed_at = CASE WHEN ?1 = 'completed' AND completed_at IS NULL THEN ?2 ELSE completed_at END,
			updated_at = ?2
			WHERE id = ?3`, status, now, id)
		return err
	})
}

func (d *DB) RecordUpsert(record any) error {
	r, err := obj(record)
	if err != nil {
		return err
	}
	return d.once(func(c *sql.DB) error { return recordUpsertRow(c, r) })
}

func (d *DB) RecordSetPaid(id string, paid bool) error {
	return d.once(func(c *sql.DB) error {
		_, err := c.Exec("UPDATE medical_records SET paid = ?1, updated_at = ?2 WHERE id = ?3", paid, UtcNow(), id)
		return err
	})
}

func (d *DB) SettingsSave(settings any) error {
	s, err := obj(settings)
	if err != nil {
		return err
	}
	return d.once(func(c *sql.DB) error { return settingsUpsertRow(c, s) })
}

func (d *DB) DataReplace(data any) error {
	dd, err := obj(data)
	if err != nil {
		return err
	}
	return d.tx(func(tx *sql.Tx) error {
		if _, err := tx.Exec("DELETE FROM medical_records; DELETE FROM appointments; DELETE FROM patients"); err != nil {
			return err
		}
		for _, each := range rangeOne(dd, "patients") {
			if err := patientUpsertRow(tx, each); err != nil {
				return err
			}
		}
		for _, each := range rangeOne(dd, "appointments") {
			if err := appointmentUpsertRow(tx, each); err != nil {
				return err
			}
		}
		for _, each := range rangeOne(dd, "records") {
			if err := recordUpsertRow(tx, each); err != nil {
				return err
			}
		}
		if rawSettings, ok := dd["settings"]; ok && rawSettings != nil {
			s, err := obj(rawSettings)
			if err != nil {
				return err
			}
			if err := settingsUpsertRow(tx, s); err != nil {
				return err
			}
		}
		return nil
	})
}

func rangeOne(data map[string]any, key string) []map[string]any {
	rawList, ok := data[key].([]any)
	if !ok {
		return nil
	}
	out := make([]map[string]any, 0, len(rawList))
	for _, raw := range rawList {
		if m, ok := raw.(map[string]any); ok {
			out = append(out, m)
		}
	}
	return out
}

func mergeByUpdatedAt(existing, incoming []map[string]any) []map[string]any {
	m := map[string]map[string]any{}
	for _, item := range existing {
		if id := strField(item, "id"); id != "" {
			m[id] = item
		}
	}
	for _, item := range incoming {
		id := strField(item, "id")
		if id == "" {
			continue
		}
		if got, ok := m[id]; !ok || strField(item, "updatedAt") > strField(got, "updatedAt") {
			m[id] = item
		}
	}
	out := make([]map[string]any, 0, len(m))
	for _, v := range m {
		out = append(out, v)
	}
	return out
}

func (d *DB) DataMerge(incoming any) error {
	in, err := obj(incoming)
	if err != nil {
		return err
	}
	var current map[string]any
	err = d.once(func(c *sql.DB) error {
		var err error
		current, err = clinicLoad(c)
		return err
	})
	if err != nil {
		return err
	}
	existingOf := func(key string) []map[string]any {
		curRawList := rangeOne(current, key)
		inRawList := rangeOne(in, key)
		return mergeByUpdatedAt(curRawList, inRawList)
	}
	merged := map[string]any{
		"patients":     existingOf("patients"),
		"appointments": existingOf("appointments"),
		"records":      existingOf("records"),
	}
	if err := d.DataReplace(merged); err != nil {
		return err
	}
	if rawSettings, ok := in["settings"]; ok && rawSettings != nil {
		name := ""
		if s, sok := current["settings"].(map[string]any); sok {
			name = strField(s, "name")
		}
		if name == "" || name == "VetDesk Clinic" {
			s, err := obj(rawSettings)
			if err != nil {
				return err
			}
			return d.SettingsSave(s)
		}
	}
	return nil
}

/* ---------- consult workflows (transactional) ---------- */

func getSettings(c DBX) (map[string]any, error) {
	var raw string
	err := c.QueryRow("SELECT content FROM clinic_settings WHERE id = 1").Scan(&raw)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return map[string]any{}, nil
		}
		return nil, err
	}
	out := map[string]any{}
	if err := json.Unmarshal([]byte(raw), &out); err != nil {
		return nil, err
	}
	return out, nil
}

func getPatient(c DBX, id string) (map[string]any, error) {
	rows, err := queryPatientRows(c, "SELECT id, name, species, breed, sex, birth_date, weight_kg, owner_name, owner_phone, owner_email, allergies, notes, created_at, updated_at FROM patients WHERE id = ?", id)
	if err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, fmt.Errorf("patient %s not found", id)
	}
	return rows[0], nil
}

func getAppointment(c DBX, id string) (map[string]any, bool, error) {
	rows, err := queryAppointmentRows(c, `SELECT id, patient_id, date_time, duration_min, reason, vet, status, notes, checked_in_at, started_at, completed_at, record_id, created_at, updated_at FROM appointments WHERE id = ?`, id)
	if err != nil {
		return nil, false, err
	}
	if len(rows) == 0 {
		return nil, false, nil
	}
	return rows[0], true, nil
}

// localNow truncates the timestamp like the previous Rust code (minutes).
func localNow() string {
	return strings.TrimSuffix(UtcNow(), "Z")[:16]
}

func newRecordJSON(c DBX, patientID string, appointmentID any, vet string) (map[string]any, error) {
	patient, err := getPatient(c, patientID)
	if err != nil {
		return nil, err
	}
	settings, err := getSettings(c)
	if err != nil {
		return nil, err
	}
	defaultVet := strField(settings, "defaultVet")
	weight := strField(patient, "weightKg")
	now := UtcNow()
	return map[string]any{
		"id":            NewUUID(),
		"patientId":     patientID,
		"appointmentId": appointmentID,
		"vet":           defaultIfEmpty(vet, defaultVet),
		"date":          localNow(),
		"vitals":        map[string]any{"weightKg": weight, "temperatureC": "", "heartRate": "", "respRate": ""},
		"subjective":    "",
		"objective":     "",
		"assessment":    "",
		"plan":          "",
		"prescriptions": []any{},
		"charges":       []any{},
		"followUp":      nil,
		"followUpAppointmentId": nil,
		"paid":          false,
		"status":        "draft",
		"createdAt":     now,
		"updatedAt":     now,
	}, nil
}

func defaultIfEmpty(v, def string) string {
	if v == "" {
		return def
	}
	return v
}

func (d *DB) ConsultStart(appointmentID string) (map[string]any, error) {
	var record map[string]any
	err := d.tx(func(tx *sql.Tx) error {
		appt, ok, err := getAppointment(tx, appointmentID)
		if err != nil {
			return err
		}
		if !ok {
			return fmt.Errorf("appointment %s not found", appointmentID)
		}
		patientID := strField(appt, "patientId")
		vet := strField(appt, "vet")
		if rid := strField(appt, "recordId"); rid != "" {
			rows, qErr := queryRecordContents(tx, "SELECT content FROM medical_records WHERE id = ?", rid)
			if qErr != nil {
				return qErr
			}
			if len(rows) > 0 {
				record = rows[0]
			}
		}
		if record == nil {
			record, err = newRecordJSON(tx, patientID, appointmentID, vet)
			if err != nil {
				return err
			}
		}
		if err := recordUpsertRow(tx, record); err != nil {
			return err
		}
		now := UtcNow()
		_, err = tx.Exec(`UPDATE appointments SET
			status = CASE WHEN status = 'completed' THEN status ELSE 'in-consult' END,
			checked_in_at = COALESCE(checked_in_at, ?2),
			started_at = COALESCE(started_at, ?2),
			record_id = ?3,
			updated_at = ?2
			WHERE id = ?1`, appointmentID, now, strField(record, "id"))
		return err
	})
	return record, err
}

func (d *DB) WalkInStart(patientID, reason, vet string) (map[string]any, error) {
	var record map[string]any
	err := d.tx(func(tx *sql.Tx) error {
		settings, err := getSettings(tx)
		if err != nil {
			return err
		}
		vet = defaultIfEmpty(vet, strField(settings, "defaultVet"))
		record, err = newRecordJSON(tx, patientID, nil, vet)
		if err != nil {
			return err
		}
		now := UtcNow()
		apptID := NewUUID()
		appt := map[string]any{
			"id": apptID, "patientId": patientID, "dateTime": localNow(),
			"durationMin": int64(intField(settings, "slotMinutes", 30)),
			"reason":      defaultIfEmpty(reason, "Walk-in"), "vet": vet,
			"status": "in-consult", "notes": "Walk-in",
			"checkedInAt": now, "startedAt": now,
			"recordId": strField(record, "id"),
			"createdAt": now, "updatedAt": now,
		}
		if err := appointmentUpsertRow(tx, appt); err != nil {
			return err
		}
		if err := recordUpsertRow(tx, record); err != nil {
			return err
		}
		record["appointmentId"] = apptID
		return recordUpsertRow(tx, record)
	})
	return record, err
}

func (d *DB) VisitFinish(record any) (map[string]any, error) {
	var out map[string]any
	err := d.tx(func(tx *sql.Tx) error {
		rec, err := obj(record)
		if err != nil {
			return err
		}
		now := UtcNow()

		// Follow-up: book or update the linked appointment.
		followUp := map[string]any{}
		if rawFU, ok := rec["followUp"].(map[string]any); ok {
			followUp = rawFU
		}
		followUpAt := strField(followUp, "dateTime")
		if followUpAt != "" {
			reason := strField(followUp, "reason")
			linked := optStrField(rec, "followUpAppointmentId")
			settings, sErr := getSettings(tx)
			if sErr != nil {
				return sErr
			}
			if linkedID, _ := linked.(string); linkedID != "" {
				if _, ok, gErr := getAppointment(tx, linkedID); gErr != nil {
					return gErr
				} else if ok {
					if _, uErr := tx.Exec(`UPDATE appointments SET date_time = ?1, reason = COALESCE(NULLIF(?2, ''), reason), updated_at = ?3 WHERE id = ?4`, followUpAt, reason, now, linkedID); uErr != nil {
						return uErr
					}
				} else {
					if err = bookFollowUp(tx, rec, followUpAt, reason, now, settings); err != nil {
						return err
					}
				}
			} else {
				if err = bookFollowUp(tx, rec, followUpAt, reason, now, settings); err != nil {
					return err
				}
			}
		}

		// Complete the visit appointment.
		if apptID := strField(rec, "appointmentId"); apptID != "" {
			if _, err := tx.Exec(`UPDATE appointments SET status = 'completed', completed_at = COALESCE(completed_at, ?2),
				record_id = ?3, updated_at = ?2 WHERE id = ?1`, apptID, now, strField(rec, "id")); err != nil {
				return err
			}
		}

		// Finalize the record.
		rec["status"] = "final"
		rec["updatedAt"] = now
		if err := recordUpsertRow(tx, rec); err != nil {
			return err
		}

		// Sync the patient's weight from vitals.
		weight := ""
		if vitals, ok := rec["vitals"].(map[string]any); ok {
			weight = strings.TrimSpace(strField(vitals, "weightKg"))
		}
		if weight != "" {
			if _, err := tx.Exec("UPDATE patients SET weight_kg = ?1, updated_at = ?2 WHERE id = ?3", weight, now, strField(rec, "patientId")); err != nil {
				return err
			}
		}
		out = rec
		return nil
	})
	return out, err
}

func bookFollowUp(tx *sql.Tx, rec map[string]any, followUpAt, reason, now string, settings map[string]any) error {
	fuID := NewUUID()
	fu := map[string]any{
		"id": fuID, "patientId": strField(rec, "patientId"), "dateTime": followUpAt,
		"durationMin": int64(intField(settings, "slotMinutes", 30)),
		"reason":      defaultIfEmpty(reason, "Follow-up"), "vet": strField(rec, "vet"),
		"status": "scheduled", "notes": "Booked at end of previous visit",
		"createdAt": now, "updatedAt": now,
	}
	if err := appointmentUpsertRow(tx, fu); err != nil {
		return err
	}
	rec["followUpAppointmentId"] = fuID
	return nil
}
