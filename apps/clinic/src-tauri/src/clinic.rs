use serde_json::{json, Value};

use crate::db::{self, Db};

fn lock(db: &Db) -> Result<std::sync::MutexGuard<'_, rusqlite::Connection>, String> {
    db.conn.lock().map_err(|e| e.to_string())
}

/// Structural guard mirroring the frontend `isClinicState`: the document must
/// carry the core collections before it is accepted for persistence.
fn validate_state(state: &Value) -> Result<(), String> {
    let obj = state
        .as_object()
        .ok_or_else(|| "state must be a JSON object".to_string())?;
    for key in [
        "clinic",
        "users",
        "owners",
        "patients",
        "appointments",
        "encounters",
        "products",
        "stockMovements",
        "invoices",
        "payments",
        "audit",
        "outbox",
    ] {
        let value = obj
            .get(key)
            .ok_or_else(|| format!("state.{key} is required"))?;
        if key != "clinic" && !value.is_array() {
            return Err(format!("state.{key} must be an array"));
        }
    }
    Ok(())
}

pub fn state_load(db: &Db) -> Result<Value, String> {
    let conn = lock(db)?;
    match conn.query_row(
        "SELECT content FROM clinic_state WHERE id = 1",
        [],
        |row| row.get::<_, String>(0),
    ) {
        Ok(content) => serde_json::from_str(&content).map_err(|e| e.to_string()),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(Value::Null),
        Err(e) => Err(e.to_string()),
    }
}

pub fn state_save(db: &Db, state: &Value) -> Result<(), String> {
    validate_state(state)?;
    let content = serde_json::to_string(state).map_err(|e| e.to_string())?;
    let mut conn = lock(db)?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute(
        "INSERT INTO clinic_state (id, content, updated_at) VALUES (1, ?1, ?2)
         ON CONFLICT(id) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at",
        rusqlite::params![content, db::utc_now()],
    )
    .map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())
}

/// Convenience for tests and tooling: the document as a tagged envelope.
pub fn state_envelope(db: &Db) -> Result<Value, String> {
    let state = state_load(db)?;
    Ok(json!({ "loadedAt": db::utc_now(), "state": state }))
}
