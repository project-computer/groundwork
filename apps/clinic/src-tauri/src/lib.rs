use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use db::Db;
use serde_json::Value;
use tauri::Manager;

pub mod clinic;
pub mod db;

/// Owns the clinic-core sidecar process and the loopback URL it announced.
pub struct Sidecar {
    pub base_url: Arc<Mutex<Option<String>>>,
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
            let candidate = dir.join("clinic-core");
            if candidate.exists() {
                return Some(candidate);
            }
        }
    }

    // Development: use the build produced by desktop/scripts/build-sidecar.sh.
    let dev = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../../apps/sidecar/bin/clinic-core");
    if dev.exists() {
        return Some(dev);
    }

    None
}

fn spawn_sidecar(app: &tauri::AppHandle) -> Option<Sidecar> {
    let binary = sidecar_binary()?;
    let data_dir = app.path().app_data_dir().ok()?;
    let db_path = data_dir.join("clinic.db");

    let mut command = Command::new(&binary);
    command
        .env("VET_DB", &db_path)
        .env("VET_PORT", "0")
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit());

    let mut child = match command.spawn() {
        Ok(child) => child,
        Err(error) => {
            eprintln!("failed to spawn clinic-core sidecar: {error}");
            return None;
        }
    };

    let stdout = child.stdout.take()?;
    let base_url = Arc::new(Mutex::new(None));
    let (tx, rx) = mpsc::channel::<String>();
    let shared = Arc::clone(&base_url);

    std::thread::spawn(move || {
        let reader = BufReader::new(stdout);
        for line in reader.lines().map_while(Result::ok) {
            if let Some(addr) = line.strip_prefix("LISTENING ") {
                let url = addr.trim().to_string();
                if let Ok(mut guard) = shared.lock() {
                    *guard = Some(url.clone());
                }
                let _ = tx.send(url);
            } else if !line.trim().is_empty() {
                eprintln!("clinic-core: {line}");
            }
        }
    });

    match rx.recv_timeout(Duration::from_secs(10)) {
        Ok(url) => println!("clinic-core listening at {url}"),
        Err(_) => eprintln!("clinic-core did not report a listening address"),
    }

    Some(Sidecar {
        base_url,
        child: Mutex::new(Some(child)),
    })
}

#[tauri::command]
fn backend_url(sidecar: tauri::State<Sidecar>) -> Option<String> {
    sidecar.base_url.lock().ok().and_then(|guard| guard.clone())
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
                    app.manage(Sidecar {
                        base_url: Arc::new(Mutex::new(None)),
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
