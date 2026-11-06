use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use chrono::Utc;
use db::Db;
use serde_json::Value;
use tauri::Manager;
use uuid::Uuid;

pub mod clinic;
pub mod db;

/// Owns the clinic-core sidecar process, the loopback URL it announced and
/// the per-launch secret shared with it (ADR 0020).
pub struct Sidecar {
    pub base_url: Arc<Mutex<Option<String>>>,
    /// Freshly generated for every launch and handed to the sidecar through
    /// the environment. `None` only on the degraded in-process fallback path.
    pub secret: Option<String>,
    child: Mutex<Option<Child>>,
}

impl Drop for Sidecar {
    fn drop(&mut self) {
        if let Ok(mut guard) = self.child.lock() {
            if let Some(mut child) = guard.take() {
                let _ = child.kill();
                let _ = child.wait();
            }
        }
    }
}

/// The per-launch loopback secret (ADR 0020): two UUIDv4s ≈ 244 bits of OS
/// randomness, hex-encoded. Well above the 128-bit floor.
fn generate_secret() -> String {
    format!(
        "{}{}",
        Uuid::new_v4().simple(),
        Uuid::new_v4().simple()
    )
}

fn sidecar_binary() -> Option<PathBuf> {
    if let Ok(path) = std::env::var("VET_SIDECAR_BIN") {
        let path = PathBuf::from(path);
        if path.exists() {
            return Some(path);
        }
    }

    // Production: Tauri copies external binaries next to the app executable.
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            let candidate = dir
                .join("clinic-core")
                .with_extension(std::env::consts::EXE_SUFFIX);
            if candidate.exists() {
                return Some(candidate);
            }
        }
    }

    // Development: use the build produced by desktop/scripts/build-sidecar.sh.
    let dev =
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../../apps/sidecar/bin/clinic-core");
    if dev.exists() {
        return Some(dev);
    }

    None
}

/// Best-effort append to <data dir>/logs/shell.log with a simple size cap
/// (issue 0017). Logging must never break the shell: all errors are ignored.
fn append_shell_log(data_dir: &Path, message: &str) {
    let logs_dir = data_dir.join("logs");
    if std::fs::create_dir_all(&logs_dir).is_err() {
        return;
    }
    let path = logs_dir.join("shell.log");
    const MAX_BYTES: u64 = 5 * 1024 * 1024;
    if let Ok(meta) = std::fs::metadata(&path) {
        if meta.len() > MAX_BYTES {
            let _ = std::fs::rename(&path, logs_dir.join("shell.log.1"));
        }
    }
    let stamp = Utc::now().format("%Y-%m-%dT%H:%M:%SZ");
    if let Ok(mut file) = std::fs::OpenOptions::new().create(true).append(true).open(&path) {
        let _ = writeln!(file, "{stamp} {message}");
    }
}

fn spawn_sidecar(app: &tauri::AppHandle) -> Option<Sidecar> {
    let binary = sidecar_binary()?;
    let data_dir = app.path().app_data_dir().ok()?;
    let db_path = data_dir.join("clinic.db");
    let secret = generate_secret();

    let mut command = Command::new(&binary);
    command
        .env("VET_DB", &db_path)
        .env("VET_PORT", "0")
        .env("VETCARE_LOOPBACK_SECRET", &secret)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut child = match command.spawn() {
        Ok(child) => child,
        Err(error) => {
            eprintln!("failed to spawn clinic-core sidecar: {error}");
            append_shell_log(&data_dir, &format!("spawn failed: {error}"));
            return None;
        }
    };
    append_shell_log(&data_dir, "spawned clinic-core sidecar");

    // Sidecar stderr goes to the shell log (and stderr) so support has a
    // persistent trail even when the webview never opens.
    if let Some(stderr) = child.stderr.take() {
        let log_dir = data_dir.clone();
        std::thread::spawn(move || {
            let reader = BufReader::new(stderr);
            for line in reader.lines().map_while(Result::ok) {
                eprintln!("clinic-core: {line}");
                append_shell_log(&log_dir, &format!("clinic-core: {line}"));
            }
        });
    }

    let stdout = child.stdout.take()?;
    let base_url = Arc::new(Mutex::new(None));
    let (tx, rx) = mpsc::channel::<String>();
    let shared = Arc::clone(&base_url);
    let announce_dir = data_dir.clone();

    std::thread::spawn(move || {
        let reader = BufReader::new(stdout);
        for line in reader.lines().map_while(Result::ok) {
            if let Some(addr) = line.strip_prefix("LISTENING ") {
                let url = addr.trim().to_string();
                if let Ok(mut guard) = shared.lock() {
                    *guard = Some(url.clone());
                }
                append_shell_log(&announce_dir, &format!("sidecar listening at {url}"));
                let _ = tx.send(url);
            } else if !line.trim().is_empty() {
                eprintln!("clinic-core: {line}");
            }
        }
    });

    match rx.recv_timeout(Duration::from_secs(10)) {
        Ok(url) => println!("clinic-core listening at {url}"),
        Err(_) => {
            eprintln!("clinic-core did not report a listening address");
            append_shell_log(&data_dir, "sidecar did not report a listening address");
        }
    }

    Some(Sidecar {
        base_url,
        secret: Some(secret),
        child: Mutex::new(Some(child)),
    })
}

#[tauri::command]
fn backend_url(sidecar: tauri::State<Sidecar>) -> Option<String> {
    sidecar.base_url.lock().ok().and_then(|guard| guard.clone())
}

/// The per-launch secret paired with `backend_url` (ADR 0020). `None` sends
/// the webview down the existing degraded-adapter path.
#[tauri::command]
fn backend_secret(sidecar: tauri::State<Sidecar>) -> Option<String> {
    sidecar.secret.clone()
}

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

            match spawn_sidecar(app.handle()) {
                Some(sidecar) => {
                    app.manage(sidecar);
                }
                None => {
                    eprintln!(
                        "clinic-core unavailable; falling back to in-process SQLite commands"
                    );
                    append_shell_log(&data_dir, "falling back to in-process SQLite commands");
                    app.manage(Sidecar {
                        base_url: Arc::new(Mutex::new(None)),
                        secret: None,
                        child: Mutex::new(None),
                    });
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            state_load_command,
            state_save_command,
            backend_url,
            backend_secret,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[tauri::command]
fn state_load_command(db: tauri::State<Db>) -> Result<Value, String> {
    clinic::state_load(&db)
}

#[tauri::command]
fn state_save_command(db: tauri::State<Db>, state: Value) -> Result<(), String> {
    clinic::state_save(&db, &state)
}

#[cfg(test)]
mod tests {
    use super::generate_secret;

    #[test]
    fn secret_is_long_hex_and_unique() {
        let a = generate_secret();
        let b = generate_secret();
        assert_eq!(a.len(), 64, "two simple UUIDs are 64 hex chars");
        assert!(a.chars().all(|c| c.is_ascii_hexdigit()));
        assert_ne!(a, b, "each launch must receive a fresh secret");
    }
}
