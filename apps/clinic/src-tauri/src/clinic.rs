use serde_json::{json, Value};

use crate::db::{self, Db};

fn lock(db: &Db) -> Result<std::sync::MutexGuard<'_, rusqlite::Connection>, String> {
    db.conn.lock().map_err(|e| e.to_string())
}

fn str_field(v: &Value, key: &str) -> String {
    v.get(key).and_then(Value::as_str).unwrap_or("").to_string()
}

fn opt_str_field(v: &Value, key: &str) -> Option<String> {
    v.get(key).and_then(Value::as_str).map(String::from)
}

fn int_field(v: &Value, key: &str, default: i64) -> i64 {
    v.get(key).and_then(Value::as_i64).unwrap_or(default)
}

fn bool_field(v: &Value, key: &str) -> bool {
    v.get(key).and_then(Value::as_bool).unwrap_or(false)
}

/* ---------- load ---------- */

pub fn clinic_load(db: &Db) -> Result<Value, String> {
    let conn = lock(db)?;

    let mut patients: Vec<Value> = Vec::new();
    {
        let mut stmt = conn
            .prepare("SELECT * FROM patients ORDER BY created_at DESC")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], patient_to_json)
            .map_err(|e| e.to_string())?;
        for row in rows {
            patients.push(row.map_err(|e| e.to_string())?);
        }
    }

    let mut appointments: Vec<Value> = Vec::new();
    {
        let mut stmt = conn
            .prepare("SELECT * FROM appointments ORDER BY date_time")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], appointment_to_json)
            .map_err(|e| e.to_string())?;
        for row in rows {
            appointments.push(row.map_err(|e| e.to_string())?);
        }
    }

    let mut records: Vec<Value> = Vec::new();
    {
        let mut stmt = conn
            .prepare("SELECT content FROM medical_records ORDER BY created_at DESC")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(|e| e.to_string())?;
        for row in rows {
            let content = row.map_err(|e| e.to_string())?;
            records.push(serde_json::from_str(&content).map_err(|e| e.to_string())?);
        }
    }

    let settings: Value = match conn
        .query_row("SELECT content FROM clinic_settings WHERE id = 1", [], |row| {
            row.get::<_, String>(0)
        })
        .map_err(|e| e.to_string())
    {
        Ok(content) => serde_json::from_str(&content).map_err(|e| e.to_string())?,
        Err(_) => json!({}),
    };

    Ok(json!({
        "version": 2,
        "patients": patients,
        "appointments": appointments,
        "records": records,
        "settings": settings,
    }))
}

fn patient_to_json(row: &rusqlite::Row) -> rusqlite::Result<Value> {
    Ok(json!({
        "id": row.get::<_, String>("id")?,
        "name": row.get::<_, String>("name")?,
        "species": row.get::<_, String>("species")?,
        "breed": row.get::<_, String>("breed")?,
        "sex": row.get::<_, String>("sex")?,
        "birthDate": row.get::<_, String>("birth_date")?,
        "weightKg": row.get::<_, String>("weight_kg")?,
        "ownerName": row.get::<_, String>("owner_name")?,
        "ownerPhone": row.get::<_, String>("owner_phone")?,
        "ownerEmail": row.get::<_, String>("owner_email")?,
        "allergies": row.get::<_, String>("allergies")?,
        "notes": row.get::<_, String>("notes")?,
        "createdAt": row.get::<_, String>("created_at")?,
        "updatedAt": row.get::<_, String>("updated_at")?,
    }))
}

fn appointment_to_json(row: &rusqlite::Row) -> rusqlite::Result<Value> {
    Ok(json!({
        "id": row.get::<_, String>("id")?,
        "patientId": row.get::<_, String>("patient_id")?,
        "dateTime": row.get::<_, String>("date_time")?,
        "durationMin": row.get::<_, i64>("duration_min")?,
        "reason": row.get::<_, String>("reason")?,
        "vet": row.get::<_, String>("vet")?,
        "status": row.get::<_, String>("status")?,
        "notes": row.get::<_, String>("notes")?,
        "checkedInAt": row.get::<_, Option<String>>("checked_in_at")?,
        "startedAt": row.get::<_, Option<String>>("started_at")?,
        "completedAt": row.get::<_, Option<String>>("completed_at")?,
        "recordId": row.get::<_, Option<String>>("record_id")?,
        "createdAt": row.get::<_, String>("created_at")?,
        "updatedAt": row.get::<_, String>("updated_at")?,
    }))
}

/* ---------- row writers (shared by single ops and bulk import) ---------- */

fn patient_upsert_row(conn: &rusqlite::Connection, patient: &Value) -> Result<(), String> {
    let id = str_field(patient, "id");
    if id.is_empty() {
        return Err("patient.id is required".into());
    }
    conn.execute(
        "INSERT INTO patients (id, name, species, breed, sex, birth_date, weight_kg,
                               owner_name, owner_phone, owner_email, allergies, notes,
                               created_at, updated_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14)
         ON CONFLICT(id) DO UPDATE SET
           name=excluded.name, species=excluded.species, breed=excluded.breed,
           sex=excluded.sex, birth_date=excluded.birth_date, weight_kg=excluded.weight_kg,
           owner_name=excluded.owner_name, owner_phone=excluded.owner_phone,
           owner_email=excluded.owner_email, allergies=excluded.allergies, notes=excluded.notes,
           updated_at=excluded.updated_at",
        rusqlite::params![
            id,
            str_field(patient, "name"),
            str_field(patient, "species"),
            str_field(patient, "breed"),
            str_field(patient, "sex"),
            str_field(patient, "birthDate"),
            str_field(patient, "weightKg"),
            str_field(patient, "ownerName"),
            str_field(patient, "ownerPhone"),
            str_field(patient, "ownerEmail"),
            str_field(patient, "allergies"),
            str_field(patient, "notes"),
            str_field(patient, "createdAt"),
            str_field(patient, "updatedAt"),
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn appointment_upsert_row(conn: &rusqlite::Connection, appt: &Value) -> Result<(), String> {
    let id = str_field(appt, "id");
    if id.is_empty() {
        return Err("appointment.id is required".into());
    }
    conn.execute(
        "INSERT INTO appointments (id, patient_id, date_time, duration_min, reason, vet,
                                   status, notes, checked_in_at, started_at, completed_at,
                                   record_id, created_at, updated_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14)
         ON CONFLICT(id) DO UPDATE SET
           patient_id=excluded.patient_id, date_time=excluded.date_time,
           duration_min=excluded.duration_min, reason=excluded.reason, vet=excluded.vet,
           status=excluded.status, notes=excluded.notes, checked_in_at=excluded.checked_in_at,
           started_at=excluded.started_at, completed_at=excluded.completed_at,
           record_id=excluded.record_id, updated_at=excluded.updated_at",
        rusqlite::params![
            id,
            str_field(appt, "patientId"),
            str_field(appt, "dateTime"),
            int_field(appt, "durationMin", 30),
            str_field(appt, "reason"),
            str_field(appt, "vet"),
            str_field(appt, "status"),
            str_field(appt, "notes"),
            opt_str_field(appt, "checkedInAt"),
            opt_str_field(appt, "startedAt"),
            opt_str_field(appt, "completedAt"),
            opt_str_field(appt, "recordId"),
            str_field(appt, "createdAt"),
            str_field(appt, "updatedAt"),
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn record_upsert_row(conn: &rusqlite::Connection, record: &Value) -> Result<(), String> {
    let id = str_field(record, "id");
    if id.is_empty() {
        return Err("record.id is required".into());
    }
    let content = serde_json::to_string(record).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO medical_records (id, patient_id, appointment_id, vet, date, paid, status,
                                      content, created_at, updated_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)
         ON CONFLICT(id) DO UPDATE SET
           patient_id=excluded.patient_id, appointment_id=excluded.appointment_id,
           vet=excluded.vet, date=excluded.date, paid=excluded.paid, status=excluded.status,
           content=excluded.content, updated_at=excluded.updated_at",
        rusqlite::params![
            id,
            str_field(record, "patientId"),
            opt_str_field(record, "appointmentId"),
            str_field(record, "vet"),
            str_field(record, "date"),
            bool_field(record, "paid"),
            str_field(record, "status"),
            content,
            str_field(record, "createdAt"),
            str_field(record, "updatedAt"),
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn settings_upsert_row(conn: &rusqlite::Connection, settings: &Value) -> Result<(), String> {
    if settings.as_object().map(|o| o.len()).unwrap_or(0) == 0 {
        return Ok(());
    }
    let content = serde_json::to_string(settings).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO clinic_settings (id, content, updated_at) VALUES (1, ?1, ?2)
         ON CONFLICT(id) DO UPDATE SET content=excluded.content, updated_at=excluded.updated_at",
        rusqlite::params![content, db::utc_now()],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/* ---------- public operations ---------- */

pub fn patient_upsert(db: &Db, patient: &Value) -> Result<(), String> {
    let conn = lock(db)?;
    patient_upsert_row(&conn, patient)
}

pub fn patient_delete(db: &Db, id: &str) -> Result<(), String> {
    let conn = lock(db)?;
    conn.execute("DELETE FROM patients WHERE id = ?1", [id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn appointment_upsert(db: &Db, appt: &Value) -> Result<(), String> {
    let conn = lock(db)?;
    appointment_upsert_row(&conn, appt)
}

pub fn appointment_delete(db: &Db, id: &str) -> Result<(), String> {
    let conn = lock(db)?;
    conn.execute("DELETE FROM appointments WHERE id = ?1", [id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn appointment_set_status(db: &Db, id: &str, status: &str) -> Result<(), String> {
    let conn = lock(db)?;
    let now = db::utc_now();
    conn.execute(
        "UPDATE appointments SET
            status = ?1,
            checked_in_at = CASE WHEN ?1 = 'checked-in' AND checked_in_at IS NULL THEN ?2 ELSE checked_in_at END,
            completed_at = CASE WHEN ?1 = 'completed' AND completed_at IS NULL THEN ?2 ELSE completed_at END,
            updated_at = ?2
         WHERE id = ?3",
        rusqlite::params![status, now, id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn record_upsert(db: &Db, record: &Value) -> Result<(), String> {
    let conn = lock(db)?;
    record_upsert_row(&conn, record)
}

pub fn record_set_paid(db: &Db, id: &str, paid: bool) -> Result<(), String> {
    let conn = lock(db)?;
    conn.execute(
        "UPDATE medical_records SET paid = ?1, updated_at = ?2 WHERE id = ?3",
        rusqlite::params![paid, db::utc_now(), id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn settings_save(db: &Db, settings: &Value) -> Result<(), String> {
    let conn = lock(db)?;
    settings_upsert_row(&conn, settings)
}

pub fn data_replace(db: &Db, data: &Value) -> Result<(), String> {
    let mut conn = lock(db)?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute_batch(
        "DELETE FROM medical_records; DELETE FROM appointments; DELETE FROM patients;",
    )
    .map_err(|e| e.to_string())?;
    if let Some(patients) = data.get("patients").and_then(Value::as_array) {
        for p in patients {
            patient_upsert_row(&tx, p)?;
        }
    }
    if let Some(appts) = data.get("appointments").and_then(Value::as_array) {
        for a in appts {
            appointment_upsert_row(&tx, a)?;
        }
    }
    if let Some(records) = data.get("records").and_then(Value::as_array) {
        for r in records {
            record_upsert_row(&tx, r)?;
        }
    }
    if let Some(settings) = data.get("settings") {
        settings_upsert_row(&tx, settings)?;
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

fn merge_by_updated_at(existing: &[Value], incoming: &[Value]) -> Vec<Value> {
    let mut map: std::collections::HashMap<String, Value> = std::collections::HashMap::new();
    for item in existing {
        if let Some(id) = item.get("id").and_then(Value::as_str) {
            map.insert(id.to_string(), item.clone());
        }
    }
    for item in incoming {
        let Some(id) = item.get("id").and_then(Value::as_str) else {
            continue;
        };
        let newer = match map.get(id) {
            Some(existing) => {
                let a = existing.get("updatedAt").and_then(Value::as_str).unwrap_or("");
                let b = item.get("updatedAt").and_then(Value::as_str).unwrap_or("");
                b > a
            }
            None => true,
        };
        if newer {
            map.insert(id.to_string(), item.clone());
        }
    }
    map.into_values().collect()
}

pub fn data_merge(db: &Db, incoming: &Value) -> Result<(), String> {
    let current = clinic_load(db)?;
    let merged = json!({
        "patients": merge_by_updated_at(
            current.get("patients").and_then(Value::as_array).map(|v| v.as_slice()).unwrap_or(&[]),
            incoming.get("patients").and_then(Value::as_array).map(|v| v.as_slice()).unwrap_or(&[]),
        ),
        "appointments": merge_by_updated_at(
            current.get("appointments").and_then(Value::as_array).map(|v| v.as_slice()).unwrap_or(&[]),
            incoming.get("appointments").and_then(Value::as_array).map(|v| v.as_slice()).unwrap_or(&[]),
        ),
        "records": merge_by_updated_at(
            current.get("records").and_then(Value::as_array).map(|v| v.as_slice()).unwrap_or(&[]),
            incoming.get("records").and_then(Value::as_array).map(|v| v.as_slice()).unwrap_or(&[]),
        ),
    });
    data_replace(db, &merged)?;
    if let Some(settings) = incoming.get("settings") {
        let current_name = current
            .get("settings")
            .and_then(|s| s.get("name"))
            .and_then(Value::as_str)
            .unwrap_or("VetDesk Clinic");
        if current_name == "VetDesk Clinic" {
            settings_save(db, settings)?;
        }
    }
    Ok(())
}

/* ---------- consult workflows (transactional) ---------- */

fn get_settings(conn: &rusqlite::Connection) -> Result<Value, String> {
    match conn
        .query_row("SELECT content FROM clinic_settings WHERE id = 1", [], |row| {
            row.get::<_, String>(0)
        })
        .map_err(|e| e.to_string())
    {
        Ok(content) => serde_json::from_str(&content).map_err(|e| e.to_string()),
        Err(_) => Ok(json!({})),
    }
}

fn get_patient(conn: &rusqlite::Connection, id: &str) -> Result<Value, String> {
    let mut stmt = conn
        .prepare("SELECT * FROM patients WHERE id = ?1")
        .map_err(|e| e.to_string())?;
    let mut rows = stmt.query([id]).map_err(|e| e.to_string())?;
    match rows.next().map_err(|e| e.to_string())? {
        Some(row) => patient_to_json(row).map_err(|e| e.to_string()),
        None => Err(format!("patient {id} not found")),
    }
}

fn get_appointment(conn: &rusqlite::Connection, id: &str) -> Result<Option<Value>, String> {
    let mut stmt = conn
        .prepare("SELECT * FROM appointments WHERE id = ?1")
        .map_err(|e| e.to_string())?;
    let mut rows = stmt.query([id]).map_err(|e| e.to_string())?;
    match rows.next().map_err(|e| e.to_string())? {
        Some(row) => appointment_to_json(row).map(Some).map_err(|e| e.to_string()),
        None => Ok(None),
    }
}

fn local_now() -> String {
    let mut s = db::utc_now();
    s.truncate(16);
    s.replace('Z', "")
}

fn new_record_json(
    conn: &rusqlite::Connection,
    patient_id: &str,
    appointment_id: Option<String>,
    vet: &str,
) -> Result<Value, String> {
    let patient = get_patient(conn, patient_id)?;
    let settings = get_settings(conn)?;
    let default_vet = settings.get("defaultVet").and_then(Value::as_str).unwrap_or("");
    let weight = patient.get("weightKg").and_then(Value::as_str).unwrap_or("");
    let now = db::utc_now();
    Ok(json!({
        "id": uuid::Uuid::new_v4().to_string(),
        "patientId": patient_id,
        "appointmentId": appointment_id,
        "vet": if vet.is_empty() { default_vet } else { vet },
        "date": local_now(),
        "vitals": { "weightKg": weight, "temperatureC": "", "heartRate": "", "respRate": "" },
        "subjective": "",
        "objective": "",
        "assessment": "",
        "plan": "",
        "prescriptions": [],
        "charges": [],
        "followUp": null,
        "followUpAppointmentId": null,
        "paid": false,
        "status": "draft",
        "createdAt": now,
        "updatedAt": now,
    }))
}

pub fn consult_start(db: &Db, appointment_id: &str) -> Result<Value, String> {
    let mut conn = lock(db)?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let appt = get_appointment(&tx, appointment_id)?
        .ok_or_else(|| format!("appointment {appointment_id} not found"))?;
    let patient_id = str_field(&appt, "patientId");
    let vet = str_field(&appt, "vet");
    let record = if let Some(rid) = appt.get("recordId").and_then(Value::as_str) {
        let mut stmt = tx
            .prepare("SELECT content FROM medical_records WHERE id = ?1")
            .map_err(|e| e.to_string())?;
        match stmt
            .query_row([rid], |row| row.get::<_, String>(0))
            .map_err(|e| e.to_string())
        {
            Ok(content) => serde_json::from_str(&content).map_err(|e| e.to_string())?,
            Err(_) => new_record_json(&tx, &patient_id, Some(appointment_id.to_string()), &vet)?,
        }
    } else {
        new_record_json(&tx, &patient_id, Some(appointment_id.to_string()), &vet)?
    };
    record_upsert_row(&tx, &record)?;
    let now = db::utc_now();
    tx.execute(
        "UPDATE appointments SET
            status = CASE WHEN status = 'completed' THEN status ELSE 'in-consult' END,
            checked_in_at = COALESCE(checked_in_at, ?2),
            started_at = COALESCE(started_at, ?2),
            record_id = ?3,
            updated_at = ?2
         WHERE id = ?1",
        rusqlite::params![appointment_id, now, str_field(&record, "id")],
    )
    .map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(record)
}

pub fn walk_in_start(db: &Db, patient_id: &str, reason: &str, vet: &str) -> Result<Value, String> {
    let mut conn = lock(db)?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let settings = get_settings(&tx)?;
    let default_vet = settings.get("defaultVet").and_then(Value::as_str).unwrap_or("");
    let vet = if vet.is_empty() { default_vet } else { vet };
    let record = new_record_json(&tx, patient_id, None, vet)?;
    let now = db::utc_now();
    let appt_id = uuid::Uuid::new_v4().to_string();
    let appt = json!({
        "id": appt_id,
        "patientId": patient_id,
        "dateTime": local_now(),
        "durationMin": settings.get("slotMinutes").and_then(Value::as_i64).unwrap_or(30),
        "reason": if reason.is_empty() { "Walk-in" } else { reason },
        "vet": vet,
        "status": "in-consult",
        "notes": "Walk-in",
        "checkedInAt": now,
        "startedAt": now,
        "recordId": str_field(&record, "id"),
        "createdAt": now,
        "updatedAt": now,
    });
    appointment_upsert_row(&tx, &appt)?;
    record_upsert_row(&tx, &record)?;
    let mut record = record;
    if let Some(obj) = record.as_object_mut() {
        obj.insert("appointmentId".into(), json!(appt_id));
    }
    record_upsert_row(&tx, &record)?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(record)
}

pub fn visit_finish(db: &Db, record: &Value) -> Result<Value, String> {
    let mut conn = lock(db)?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let now = db::utc_now();
    let mut record = record.clone();

    // Follow-up: book or update the linked appointment.
    let follow_up = record.get("followUp").filter(|v| !v.is_null()).cloned().unwrap_or(json!({}));
    let follow_up_at = str_field(&follow_up, "dateTime");
    if !follow_up_at.is_empty() {
        let reason = str_field(&follow_up, "reason");
        let linked = opt_str_field(&record, "followUpAppointmentId");
        let settings = get_settings(&tx)?;
        match linked {
            Some(existing_id) if get_appointment(&tx, &existing_id)?.is_some() => {
                tx.execute(
                    "UPDATE appointments SET date_time = ?1, reason = COALESCE(NULLIF(?2, ''), reason), updated_at = ?3 WHERE id = ?4",
                    rusqlite::params![follow_up_at, reason, now, existing_id],
                )
                .map_err(|e| e.to_string())?;
            }
            _ => {
                let fu_id = uuid::Uuid::new_v4().to_string();
                let fu = json!({
                    "id": fu_id,
                    "patientId": str_field(&record, "patientId"),
                    "dateTime": follow_up_at,
                    "durationMin": settings.get("slotMinutes").and_then(Value::as_i64).unwrap_or(30),
                    "reason": if reason.is_empty() { "Follow-up".to_string() } else { reason },
                    "vet": str_field(&record, "vet"),
                    "status": "scheduled",
                    "notes": "Booked at end of previous visit",
                    "createdAt": now,
                    "updatedAt": now,
                });
                appointment_upsert_row(&tx, &fu)?;
                if let Some(obj) = record.as_object_mut() {
                    obj.insert("followUpAppointmentId".into(), json!(fu_id));
                }
            }
        }
    }
    // Complete the visit appointment.
    if let Some(appt_id) = opt_str_field(&record, "appointmentId") {
        tx.execute(
            "UPDATE appointments SET status = 'completed', completed_at = COALESCE(completed_at, ?2),
                    record_id = ?3, updated_at = ?2 WHERE id = ?1",
            rusqlite::params![appt_id, now, str_field(&record, "id")],
        )
        .map_err(|e| e.to_string())?;
    }

    // Finalize the record.
    if let Some(obj) = record.as_object_mut() {
        obj.insert("status".into(), json!("final"));
        obj.insert("updatedAt".into(), json!(now));
    }
    record_upsert_row(&tx, &record)?;

    // Sync the patient's weight from vitals.
    let weight = record
        .get("vitals")
        .and_then(|v| v.get("weightKg"))
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim()
        .to_string();
    if !weight.is_empty() {
        tx.execute(
            "UPDATE patients SET weight_kg = ?1, updated_at = ?2 WHERE id = ?3",
            rusqlite::params![weight, now, str_field(&record, "patientId")],
        )
        .map_err(|e| e.to_string())?;
    }

    tx.commit().map_err(|e| e.to_string())?;
    Ok(record)
}
