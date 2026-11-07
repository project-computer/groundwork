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

/// Owns a spawned loopback service: the loopback URL it announced and the
/// per-launch secret shared with it (ADR 0020). Two of these run side by
/// side — `Sidecar` (clinic-core, the document store) and `Vetcare`
/// (vetcare, the normalized REST backend) — each as its own Tauri-managed
/// type, because Tauri resolves state by type.
struct ManagedProcess {
    base_url: Arc<Mutex<Option<String>>>,
    /// Freshly generated for every launch and handed to the service through
    /// the environment. `None` only when the service is unavailable.
    secret: Option<String>,
    child: Mutex<Option<Child>>,
}

impl Drop for ManagedProcess {
    fn drop(&mut self) {
        if let Ok(mut guard) = self.child.lock() {
            if let Some(mut child) = guard.take() {
                let _ = child.kill();
                let _ = child.wait();
            }
        }
    }
}

/// Owns the clinic-core sidecar process (document store + sync, ADR 0012).
pub struct Sidecar(ManagedProcess);

/// Owns the vetcare REST backend process (normalized schema, ADR 0023).
/// Absent on machines where the binary was not bundled — the webview then
/// stays on the document path.
pub struct Vetcare(ManagedProcess);

/// What spawn_service needs to launch one loopback binary.
struct ServiceSpec {
    /// Human name for logs ("clinic-core" / "vetcare").
    name: &'static str,
    /// SQLite file under the app data dir ("clinic.db" / "vetcare.db").
    db_file: &'static str,
    /// Environment variable overriding the binary path (dev/staging).
    env_bin: &'static str,
    /// Binary name looked up next to the running executable in production.
    prod_bin: &'static str,
    /// Development fallback path, relative to the repo root.
    dev_bin: &'static str,
}

const CLINIC_CORE: ServiceSpec = ServiceSpec {
    name: "clinic-core",
    db_file: "clinic.db",
    env_bin: "VET_SIDECAR_BIN",
    prod_bin: "clinic-core",
    dev_bin: "apps/sidecar/bin/clinic-core",
};

const VETCARE: ServiceSpec = ServiceSpec {
    name: "vetcare",
    db_file: "vetcare.db",
    env_bin: "VETCARE_BIN",
    prod_bin: "vetcare",
    dev_bin: "server/bin/vetcare",
};

/// The per-launch loopback secret (ADR 0020): two UUIDv4s ≈ 244 bits of OS
/// randomness, hex-encoded. Well above the 128-bit floor.
fn generate_secret() -> String {
    format!("{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple())
}

/// Parses the stdout announcement every Go service makes when its listener
/// is bound ("LISTENING http://127.0.0.1:port").
fn parse_announcement(line: &str) -> Option<String> {
    let addr = line.strip_prefix("LISTENING ")?.trim();
    if addr.is_empty() {
        None
    } else {
        Some(addr.to_string())
    }
}

fn resolve_binary(spec: &ServiceSpec) -> Option<PathBuf> {
    if let Ok(path) = std::env::var(spec.env_bin) {
        let path = PathBuf::from(path);
        if path.exists() {
            return Some(path);
        }
    }

    // Production: Tauri copies external binaries next to the app executable.
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            let candidate = dir
                .join(spec.prod_bin)
                .with_extension(std::env::consts::EXE_SUFFIX);
            if candidate.exists() {
                return Some(candidate);
            }
        }
    }

    // Development: the build produced by the Makefile.
    let dev = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../../")
        .join(spec.dev_bin);
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
    if let Ok(mut file) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
    {
        let _ = writeln!(file, "{stamp} {message}");
    }
}

fn spawn_service(app: &tauri::AppHandle, spec: &ServiceSpec) -> Option<ManagedProcess> {
    let binary = resolve_binary(spec)?;
    let data_dir = app.path().app_data_dir().ok()?;
    let db_path = data_dir.join(spec.db_file);
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
            eprintln!("failed to spawn {}: {error}", spec.name);
            append_shell_log(&data_dir, &format!("{} spawn failed: {error}", spec.name));
            return None;
        }
    };
    append_shell_log(&data_dir, &format!("spawned {}", spec.name));

    // Service stderr goes to the shell log (and stderr) so support has a
    // persistent trail even when the webview never opens.
    if let Some(stderr) = child.stderr.take() {
        let log_dir = data_dir.clone();
        let name = spec.name.to_string();
        std::thread::spawn(move || {
            let reader = BufReader::new(stderr);
            for line in reader.lines().map_while(Result::ok) {
                eprintln!("{name}: {line}");
                append_shell_log(&log_dir, &format!("{name}: {line}"));
            }
        });
    }

    let stdout = child.stdout.take()?;
    let base_url = Arc::new(Mutex::new(None));
    let (tx, rx) = mpsc::channel::<String>();
    let shared = Arc::clone(&base_url);
    let announce_dir = data_dir.clone();
    let stdout_name = spec.name;

    std::thread::spawn(move || {
        let reader = BufReader::new(stdout);
        for line in reader.lines().map_while(Result::ok) {
            if let Some(url) = parse_announcement(&line) {
                if let Ok(mut guard) = shared.lock() {
                    *guard = Some(url.clone());
                }
                append_shell_log(&announce_dir, &format!("sidecar listening at {url}"));
                let _ = tx.send(url);
            } else if !line.trim().is_empty() {
                eprintln!("{}: {line}", stdout_name);
            }
        }
    });

    match rx.recv_timeout(Duration::from_secs(10)) {
        Ok(url) => println!("{} listening at {url}", spec.name),
        Err(_) => {
            eprintln!("{} did not report a listening address", spec.name);
            append_shell_log(
                &data_dir,
                &format!("{} did not report a listening address", spec.name),
            );
        }
    }

    Some(ManagedProcess {
        base_url,
        secret: Some(secret),
        child: Mutex::new(Some(child)),
    })
}

#[tauri::command]
fn backend_url(sidecar: tauri::State<Sidecar>) -> Option<String> {
    sidecar
        .0
        .base_url
        .lock()
        .ok()
        .and_then(|guard| guard.clone())
}

/// The per-launch secret paired with `backend_url` (ADR 0020). `None` sends
/// the webview down the existing degraded-adapter path.
#[tauri::command]
fn backend_secret(sidecar: tauri::State<Sidecar>) -> Option<String> {
    sidecar.0.secret.clone()
}

/// The vetcare REST backend's loopback URL (ADR 0023). `None` when the
/// binary is not bundled — the webview then stays on the document path.
#[tauri::command]
fn vetcare_url(vetcare: tauri::State<Vetcare>) -> Option<String> {
    vetcare
        .0
        .base_url
        .lock()
        .ok()
        .and_then(|guard| guard.clone())
}

/// The per-launch secret paired with `vetcare_url` (ADR 0020).
#[tauri::command]
fn vetcare_secret(vetcare: tauri::State<Vetcare>) -> Option<String> {
    vetcare.0.secret.clone()
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

            match spawn_service(app.handle(), &CLINIC_CORE) {
                Some(process) => {
                    app.manage(Sidecar(process));
                }
                None => {
                    eprintln!(
                        "clinic-core unavailable; falling back to in-process SQLite commands"
                    );
                    append_shell_log(&data_dir, "falling back to in-process SQLite commands");
                    app.manage(Sidecar(ManagedProcess {
                        base_url: Arc::new(Mutex::new(None)),
                        secret: None,
                        child: Mutex::new(None),
                    }));
                }
            }

            // The REST backend is optional: without its binary the app keeps
            // running on the document path and the webview simply never
            // configures the REST client.
            match spawn_service(app.handle(), &VETCARE) {
                Some(process) => {
                    append_shell_log(&data_dir, "vetcare REST backend available");
                    app.manage(Vetcare(process));
                }
                None => {
                    eprintln!("vetcare unavailable; REST API not configured this launch");
                    append_shell_log(&data_dir, "vetcare unavailable; REST API not configured");
                    app.manage(Vetcare(ManagedProcess {
                        base_url: Arc::new(Mutex::new(None)),
                        secret: None,
                        child: Mutex::new(None),
                    }));
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            state_load_command,
            state_save_command,
            backend_url,
            backend_secret,
            vetcare_url,
            vetcare_secret,
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
    use super::{generate_secret, parse_announcement, ServiceSpec, CLINIC_CORE, VETCARE};

    #[test]
    fn secret_is_long_hex_and_unique() {
        let a = generate_secret();
        let b = generate_secret();
        assert_eq!(a.len(), 64, "two simple UUIDs are 64 hex chars");
        assert!(a.chars().all(|c| c.is_ascii_hexdigit()));
        assert_ne!(a, b, "each launch must receive a fresh secret");
    }

    #[test]
    fn announcement_parses_the_listening_contract() {
        assert_eq!(
            parse_announcement("LISTENING http://127.0.0.1:51731"),
            Some("http://127.0.0.1:51731".to_string())
        );
        // Both services announce the same contract; whitespace after the
        // address is trimmed.
        assert_eq!(
            parse_announcement("LISTENING http://127.0.0.1:9 \n"),
            Some("http://127.0.0.1:9".to_string())
        );
        assert_eq!(parse_announcement("clinic-core: stopped"), None);
        assert_eq!(parse_announcement("LISTENING "), None, "empty address");
        assert_eq!(parse_announcement(""), None);
    }

    #[test]
    fn service_specs_target_distinct_databases() {
        // Coexistence by design (ADR 0023): the document store and the REST
        // backend never share a SQLite file.
        assert_ne!(CLINIC_CORE.db_file, VETCARE.db_file);
        assert_ne!(CLINIC_CORE.env_bin, VETCARE.env_bin);
        let check = |spec: &ServiceSpec| {
            assert!(!spec.name.is_empty());
            assert!(spec.db_file.ends_with(".db"));
            assert!(spec.env_bin.starts_with("VET"));
            assert!(!spec.prod_bin.is_empty());
            assert!(spec.dev_bin.contains('/'));
        };
        check(&CLINIC_CORE);
        check(&VETCARE);
    }
}
