use vet_clinic_lib::{clinic, db};

fn open_temp() -> db::Db {
    let dir = tempfile::tempdir().expect("failed to create temp dir");
    let path = dir.path().join("clinic.db");
    std::mem::forget(dir);
    db::open(&path).expect("init failed")
}

#[test]
fn migrations_apply_through_version_2() {
    let database = open_temp();
    let conn = database.conn.lock().unwrap();
    assert_eq!(db::applied_versions(&conn).unwrap(), vec![1, 2]);
    let tables: Vec<String> = conn
        .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        .unwrap()
        .query_map([], |r| r.get(0))
        .unwrap()
        .collect::<rusqlite::Result<_>>()
        .unwrap();
    for expected in ["patients", "appointments", "medical_records", "clinic_settings"] {
        assert!(tables.iter().any(|t| t == expected), "missing table {expected}");
    }
}

#[test]
fn re_run_is_idempotent() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("clinic.db");
    drop(db::open(&path).unwrap());
    let second = db::open(&path).unwrap();
    let conn = second.conn.lock().unwrap();
    assert_eq!(db::applied_versions(&conn).unwrap(), vec![1, 2]);
}

#[test]
fn appointment_requires_valid_patient() {
    let database = open_temp();
    let err = clinic::appointment_upsert(
        &database,
        &serde_json::json!({
            "id": "a1", "patientId": "ghost", "dateTime": "2026-10-17T09:00",
            "status": "scheduled", "createdAt": "t", "updatedAt": "t"
        }),
    );
    assert!(err.is_err(), "appointment with unknown patient must fail");
}

#[test]
fn invalid_appointment_status_is_rejected() {
    let database = open_temp();
    clinic::patient_upsert(
        &database,
        &serde_json::json!({
            "id": "p1", "name": "Momo", "species": "Cat",
            "createdAt": "t", "updatedAt": "t"
        }),
    )
    .unwrap();
    let err = clinic::appointment_upsert(
        &database,
        &serde_json::json!({
            "id": "a1", "patientId": "p1", "dateTime": "2026-10-17T09:00",
            "status": "teleported", "createdAt": "t", "updatedAt": "t"
        }),
    );
    assert!(err.is_err(), "invalid status must be rejected by CHECK");
}

#[test]
fn patient_delete_cascades() {
    let database = open_temp();
    clinic::patient_upsert(
        &database,
        &serde_json::json!({
            "id": "p1", "name": "Momo", "species": "Cat",
            "createdAt": "t", "updatedAt": "t"
        }),
    )
    .unwrap();
    clinic::appointment_upsert(
        &database,
        &serde_json::json!({
            "id": "a1", "patientId": "p1", "dateTime": "2026-10-17T09:00",
            "status": "scheduled", "createdAt": "t", "updatedAt": "t"
        }),
    )
    .unwrap();
    clinic::patient_delete(&database, "p1").unwrap();
    let data = clinic::clinic_load(&database).unwrap();
    assert_eq!(
        data["appointments"].as_array().map(Vec::len),
        Some(0),
        "appointments must cascade on patient delete"
    );
}

#[test]
fn load_roundtrip_and_status_stamp() {
    let database = open_temp();
    clinic::patient_upsert(
        &database,
        &serde_json::json!({
            "id": "p1", "name": "Momo", "species": "Cat", "ownerName": "Somchai",
            "createdAt": "t", "updatedAt": "t"
        }),
    )
    .unwrap();
    clinic::appointment_upsert(
        &database,
        &serde_json::json!({
            "id": "a1", "patientId": "p1", "dateTime": "2026-10-17T09:00",
            "status": "scheduled", "createdAt": "t", "updatedAt": "t"
        }),
    )
    .unwrap();
    clinic::appointment_set_status(&database, "a1", "checked-in").unwrap();

    let data = clinic::clinic_load(&database).unwrap();
    assert_eq!(data["patients"][0]["ownerName"], "Somchai");
    let appt = &data["appointments"][0];
    assert_eq!(appt["status"], "checked-in");
    assert!(appt["checkedInAt"].as_str().is_some(), "checked_in_at must be stamped");
}

#[test]
fn data_replace_and_merge() {
    let database = open_temp();
    clinic::data_replace(
        &database,
        &serde_json::json!({
            "patients": [
                { "id": "p1", "name": "Momo", "species": "Cat", "updatedAt": "2026-01-01T00:00:00Z", "createdAt": "t" },
                { "id": "p2", "name": "Rex", "species": "Dog", "updatedAt": "2026-01-01T00:00:00Z", "createdAt": "t" }
            ]
        }),
    )
    .unwrap();
    clinic::data_merge(
        &database,
        &serde_json::json!({
            "patients": [
                { "id": "p2", "name": "Rex II", "species": "Dog", "updatedAt": "2026-02-01T00:00:00Z", "createdAt": "t" },
                { "id": "p3", "name": "Luna", "species": "Bird", "updatedAt": "2026-02-01T00:00:00Z", "createdAt": "t" }
            ]
        }),
    )
    .unwrap();
    let data = clinic::clinic_load(&database).unwrap();
    let patients = data["patients"].as_array().unwrap();
    assert_eq!(patients.len(), 3);
    let rex = patients.iter().find(|p| p["id"] == "p2").unwrap();
    assert_eq!(rex["name"], "Rex II", "newer updatedAt must win");
}
