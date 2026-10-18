use db::Db;
use serde_json::Value;
use tauri::Manager;

pub mod clinic;
pub mod db;

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let data_dir = app
                .path()
                .app_data_dir()
                .expect("failed to resolve app data dir");
            let database =
                db::open(&data_dir.join("clinic.db")).expect("failed to initialize local database");
            app.manage(database);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            clinic_load_command,
            patient_upsert_command,
            patient_delete_command,
            appointment_upsert_command,
            appointment_delete_command,
            appointment_set_status_command,
            record_upsert_command,
            record_set_paid_command,
            settings_save_command,
            data_replace_command,
            data_merge_command,
            consult_start_command,
            walk_in_start_command,
            visit_finish_command,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[tauri::command]
fn clinic_load_command(db: tauri::State<Db>) -> Result<Value, String> {
    clinic::clinic_load(&db)
}

#[tauri::command]
fn patient_upsert_command(db: tauri::State<Db>, patient: Value) -> Result<(), String> {
    clinic::patient_upsert(&db, &patient)
}

#[tauri::command]
fn patient_delete_command(db: tauri::State<Db>, id: String) -> Result<(), String> {
    clinic::patient_delete(&db, &id)
}

#[tauri::command]
fn appointment_upsert_command(db: tauri::State<Db>, appointment: Value) -> Result<(), String> {
    clinic::appointment_upsert(&db, &appointment)
}

#[tauri::command]
fn appointment_delete_command(db: tauri::State<Db>, id: String) -> Result<(), String> {
    clinic::appointment_delete(&db, &id)
}

#[tauri::command]
fn appointment_set_status_command(
    db: tauri::State<Db>,
    id: String,
    status: String,
) -> Result<(), String> {
    clinic::appointment_set_status(&db, &id, &status)
}

#[tauri::command]
fn record_upsert_command(db: tauri::State<Db>, record: Value) -> Result<(), String> {
    clinic::record_upsert(&db, &record)
}

#[tauri::command]
fn record_set_paid_command(db: tauri::State<Db>, id: String, paid: bool) -> Result<(), String> {
    clinic::record_set_paid(&db, &id, paid)
}

#[tauri::command]
fn settings_save_command(db: tauri::State<Db>, settings: Value) -> Result<(), String> {
    clinic::settings_save(&db, &settings)
}

#[tauri::command]
fn data_replace_command(db: tauri::State<Db>, data: Value) -> Result<(), String> {
    clinic::data_replace(&db, &data)
}

#[tauri::command]
fn data_merge_command(db: tauri::State<Db>, data: Value) -> Result<(), String> {
    clinic::data_merge(&db, &data)
}

#[tauri::command]
fn consult_start_command(db: tauri::State<Db>, appointmentId: String) -> Result<Value, String> {
    clinic::consult_start(&db, &appointmentId)
}

#[tauri::command]
fn walk_in_start_command(
    db: tauri::State<Db>,
    patientId: String,
    reason: String,
    vet: String,
) -> Result<Value, String> {
    clinic::walk_in_start(&db, &patientId, &reason, &vet)
}

#[tauri::command]
fn visit_finish_command(db: tauri::State<Db>, record: Value) -> Result<Value, String> {
    clinic::visit_finish(&db, &record)
}
