use serde_json::json;
use vet_clinic_lib::{clinic, db};

fn open_temp() -> db::Db {
    let dir = tempfile::tempdir().expect("failed to create temp dir");
    let path = dir.path().join("clinic.db");
    std::mem::forget(dir);
    db::open(&path).expect("init failed")
}

fn seed_patient(database: &db::Db, id: &str, name: &str) {
    clinic::patient_upsert(
        database,
        &json!({ "id": id, "name": name, "species": "Dog", "weightKg": "12.5", "createdAt": "t", "updatedAt": "t" }),
    )
    .unwrap();
}

fn seed_appointment(database: &db::Db, id: &str, patient_id: &str) {
    clinic::appointment_upsert(
        database,
        &json!({
            "id": id, "patientId": patient_id, "dateTime": "2026-10-18T09:00",
            "status": "checked-in", "vet": "Dr. Rivera", "createdAt": "t", "updatedAt": "t"
        }),
    )
    .unwrap();
}

#[test]
fn consult_start_creates_record_and_marks_in_consult() {
    let database = open_temp();
    seed_patient(&database, "p1", "Momo");
    seed_appointment(&database, "a1", "p1");

    let record = clinic::consult_start(&database, "a1").unwrap();
    assert_eq!(record["patientId"], "p1");
    assert_eq!(record["status"], "draft");
    assert_eq!(record["vitals"]["weightKg"], "12.5", "weight prefilled from patient");

    let data = clinic::clinic_load(&database).unwrap();
    assert_eq!(data["appointments"][0]["status"], "in-consult");
    assert!(data["appointments"][0]["recordId"].as_str().is_some());
    assert_eq!(data["records"].as_array().map(Vec::len), Some(1));

    // Starting again reuses the same draft (idempotent).
    let again = clinic::consult_start(&database, "a1").unwrap();
    assert_eq!(again["id"], record["id"]);
    let data = clinic::clinic_load(&database).unwrap();
    assert_eq!(data["records"].as_array().map(Vec::len), Some(1));
}

#[test]
fn walk_in_creates_appointment_and_record() {
    let database = open_temp();
    seed_patient(&database, "p1", "Momo");

    let record = clinic::walk_in_start(&database, "p1", "Vaccination", "Dr. Blue").unwrap();
    assert_eq!(record["appointmentId"].as_str().is_some(), true);

    let data = clinic::clinic_load(&database).unwrap();
    let appts = data["appointments"].as_array().unwrap();
    assert_eq!(appts.len(), 1);
    assert_eq!(appts[0]["status"], "in-consult");
    assert_eq!(appts[0]["reason"], "Vaccination");
    assert_eq!(appts[0]["recordId"], record["id"]);
}

#[test]
fn visit_finish_finalizes_books_followup_and_updates_weight() {
    let database = open_temp();
    seed_patient(&database, "p1", "Momo");
    seed_appointment(&database, "a1", "p1");
    let mut record = clinic::consult_start(&database, "a1").unwrap();

    record["vitals"]["weightKg"] = json!("13.2");
    record["assessment"] = json!("Healthy");
    record["followUp"] = json!({ "dateTime": "2026-11-01T10:00", "reason": "Recheck" });

    let final_record = clinic::visit_finish(&database, &record).unwrap();
    assert_eq!(final_record["status"], "final");

    let data = clinic::clinic_load(&database).unwrap();
    let appts = data["appointments"].as_array().unwrap();
    assert_eq!(appts.len(), 2, "follow-up appointment must be booked");
    let completed = appts.iter().find(|a| a["id"] == "a1").unwrap();
    assert_eq!(completed["status"], "completed");
    assert!(completed["completedAt"].as_str().is_some());
    let follow_up = appts.iter().find(|a| a["id"] != "a1").unwrap();
    assert_eq!(follow_up["status"], "scheduled");
    assert_eq!(follow_up["reason"], "Recheck");
    assert_eq!(
        final_record["followUpAppointmentId"], follow_up["id"],
        "record must link to the follow-up appointment"
    );
    let patient = &data["patients"][0];
    assert_eq!(patient["weightKg"], "13.2", "patient weight must sync from vitals");
}

#[test]
fn visit_finish_without_followup_skips_booking() {
    let database = open_temp();
    seed_patient(&database, "p1", "Momo");
    seed_appointment(&database, "a1", "p1");
    let record = clinic::consult_start(&database, "a1").unwrap();
    let final_record = clinic::visit_finish(&database, &record).unwrap();
    assert_eq!(final_record["status"], "final");
    let data = clinic::clinic_load(&database).unwrap();
    assert_eq!(data["appointments"].as_array().map(Vec::len), Some(1));
}
