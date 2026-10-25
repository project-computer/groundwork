use serde_json::json;
use vet_clinic_lib::{clinic, db};

fn open_temp() -> db::Db {
    let dir = tempfile::tempdir().expect("failed to create temp dir");
    let path = dir.path().join("clinic.db");
    std::mem::forget(dir);
    db::open(&path).expect("init failed")
}

fn sample_state() -> serde_json::Value {
    json!({
        "clinic": { "id": "clinic-01", "name": "Baan Sathorn Animal Clinic", "timezone": "Asia/Bangkok", "currency": "THB", "vatRate": 0.07 },
        "users": [ { "id": "u-pim", "name": "Dr. Pim Chaiyasit", "role": "veterinarian" } ],
        "owners": [ { "id": "o-1", "name": "Kanya Thongdee", "phone": "081", "email": "k@example.com", "version": 1 } ],
        "patients": [ { "id": "p-1", "ownerId": "o-1", "name": "Moo Daeng", "species": "Dog", "breed": "Thai Ridgeback", "sex": "Male", "birthDate": "2021-03-12", "version": 1 } ],
        "appointments": [],
        "encounters": [],
        "products": [],
        "stockMovements": [],
        "invoices": [ { "id": "inv-1", "number": "INV-2026-0142", "ownerId": "o-1", "status": "posted", "items": [], "createdAt": "t", "version": 1 } ],
        "payments": [],
        "audit": [],
        "outbox": [],
        "lastSyncedAt": null
    })
}

#[test]
fn load_returns_null_when_empty() {
    let database = open_temp();
    assert!(clinic::state_load(&database).unwrap().is_null());
}

#[test]
fn save_and_load_roundtrip() {
    let database = open_temp();
    let state = sample_state();
    clinic::state_save(&database, &state).unwrap();

    let loaded = clinic::state_load(&database).unwrap();
    assert_eq!(loaded["clinic"]["name"], "Baan Sathorn Animal Clinic");
    assert_eq!(loaded["patients"][0]["name"], "Moo Daeng");
    assert_eq!(loaded["invoices"].as_array().map(Vec::len), Some(1));
}

#[test]
fn save_replaces_previous_document() {
    let database = open_temp();
    clinic::state_save(&database, &sample_state()).unwrap();

    let mut next = sample_state();
    next["patients"].as_array_mut().unwrap().clear();
    clinic::state_save(&database, &next).unwrap();

    let loaded = clinic::state_load(&database).unwrap();
    assert_eq!(loaded["patients"].as_array().map(Vec::len), Some(0), "save must replace, not append");
    assert_eq!(loaded["invoices"].as_array().map(Vec::len), Some(1));
}

#[test]
fn save_rejects_document_missing_collections() {
    let database = open_temp();
    let err = clinic::state_save(
        &database,
        &json!({ "clinic": {}, "patients": [] }),
    );
    assert!(err.is_err(), "state without core collections must be rejected");
    assert!(clinic::state_load(&database).unwrap().is_null(), "rejected writes must not persist");
}

#[test]
fn save_rejects_non_array_collection() {
    let database = open_temp();
    let mut bad = sample_state();
    bad["invoices"] = json!("nope");
    let err = clinic::state_save(&database, &bad);
    assert!(err.is_err(), "non-array collection must be rejected");
}

#[test]
fn migrations_apply_through_version_3() {
    let database = open_temp();
    let conn = database.conn.lock().unwrap();
    assert_eq!(db::applied_versions(&conn).unwrap(), vec![1, 2, 3]);
}

#[test]
fn re_run_is_idempotent() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("clinic.db");
    drop(db::open(&path).unwrap());
    let second = db::open(&path).unwrap();
    let conn = second.conn.lock().unwrap();
    assert_eq!(db::applied_versions(&conn).unwrap(), vec![1, 2, 3]);
}
