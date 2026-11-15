use std::fs::OpenOptions;
use std::io::Write;
use std::path::PathBuf;
use std::sync::Mutex;

use chrono::Local;
use lazy_static::lazy_static;
use sha2::{Digest, Sha256};

lazy_static! {
    static ref LAST_HASH: Mutex<String> = Mutex::new(load_last_hash());
}

fn log_path() -> PathBuf {
    dirs::data_local_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("game-launcher")
        .join("audit.log")
}

/// Восстанавливает последний хеш из существующего лога, чтобы цепочка не прерывалась.
fn load_last_hash() -> String {
    let path = log_path();
    if !path.exists() {
        return "GENESIS".to_string();
    }
    if let Ok(content) = std::fs::read_to_string(&path) {
        for line in content.lines().rev() {
            if let Some(idx) = line.find("hash=") {
                return line[idx + 5..].to_string();
            }
        }
    }
    "GENESIS".to_string()
}

pub fn append(event: &str, actor: &str, detail: &str) {
    let mut lh = LAST_HASH.lock().unwrap();
    let prev = lh.clone();
    let ts = Local::now().to_rfc3339();
    let payload = format!("{ts}|{event}|{actor}|{detail}|prev={prev}");
    let mut h = Sha256::new();
    h.update(payload.as_bytes());
    let cur = hex::encode(h.finalize());

    let path = log_path();
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    if let Ok(mut f) = OpenOptions::new().create(true).append(true).open(&path) {
        let _ = writeln!(f, "{}|hash={}", payload, cur);
        *lh = cur;
    }
}

/// Проверка целостности журнала: верифицирует хеш-цепочку от начала до конца.
#[tauri::command]
pub fn verify_chain() -> bool {
    use std::io::BufRead;

    let path = log_path();
    if !path.exists() {
        return true;
    }
    let Ok(file) = std::fs::File::open(&path) else {
        return false;
    };
    let reader = std::io::BufReader::new(file);
    let mut expected_prev = "GENESIS".to_string();
    for line in reader.lines().flatten() {
        if line.trim().is_empty() {
            continue;
        }
        let Some(hash_idx) = line.rfind("|hash=") else {
            return false;
        };
        let payload = &line[..hash_idx];
        let declared = &line[hash_idx + 6..];
        // payload оканчивается на prev=<prev> — извлекаем его
        let prev_prefix = format!("prev={}", expected_prev);
        if !payload.ends_with(&prev_prefix) {
            return false;
        }
        let mut h = Sha256::new();
        h.update(payload.as_bytes());
        let computed = hex::encode(h.finalize());
        if computed != declared {
            return false;
        }
        expected_prev = declared.to_string();
    }
    true
}

#[tauri::command]
pub fn get_recent_logs(limit: usize) -> Vec<String> {
    let path = log_path();
    if !path.exists() {
        return Vec::new();
    }
    match std::fs::read_to_string(&path) {
        Ok(content) => content.lines().rev().take(limit).map(|l| l.to_string()).collect(),
        Err(_) => Vec::new(),
    }
}