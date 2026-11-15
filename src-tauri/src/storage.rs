use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Usage {
    #[serde(default)]
    pub count: u32,
    #[serde(default)]
    pub last: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Prefs {
    #[serde(default)]
    pub favorites: Vec<String>,
    #[serde(default)]
    pub usage: HashMap<String, Usage>,
    #[serde(default)]
    pub launch_args: HashMap<String, String>,
    #[serde(default)]
    pub retro_paths: HashMap<String, String>,
}

fn prefs_path() -> PathBuf {
    let dir = dirs::data_local_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("game-launcher");
    let _ = fs::create_dir_all(&dir);
    dir.join("prefs.json")
}

pub fn load_prefs() -> Prefs {
    let path = prefs_path();
    match fs::read_to_string(&path) {
        Ok(content) => match serde_json::from_str(&content) {
            Ok(v) => v,
            Err(_) => {
                let failed = path.with_file_name("prefs.corrupt.json");
                let _ = fs::remove_file(&failed);
                let _ = fs::rename(&path, &failed);
                Prefs::default()
            }
        },
        Err(_) => Prefs::default(),
    }
}

fn save_prefs(prefs: &Prefs) -> Result<(), String> {
    let json = serde_json::to_string_pretty(prefs).map_err(|e| e.to_string())?;
    let path = prefs_path();
    let tmp = path.with_file_name("prefs.json.tmp");
    fs::write(&tmp, json).map_err(|e| e.to_string())?;
    if path.exists() {
        let _ = fs::remove_file(&path);
    }
    fs::rename(&tmp, &path).map_err(|e| e.to_string())
}

pub fn toggle_favorite(id: &str) -> Result<bool, String> {
    let mut prefs = load_prefs();
    let is_favorite = match prefs.favorites.iter().position(|f| f == id) {
        Some(pos) => {
            prefs.favorites.remove(pos);
            false
        }
        None => {
            prefs.favorites.push(id.to_string());
            true
        }
    };
    save_prefs(&prefs)?;
    Ok(is_favorite)
}

pub fn record_launch(id: &str) -> Result<(), String> {
    let mut prefs = load_prefs();
    let entry = prefs.usage.entry(id.to_string()).or_default();
    entry.count = entry.count.saturating_add(1);
    entry.last = now_secs();
    append_event(id);
    save_prefs(&prefs)
}

pub fn launch_args_for(id: &str) -> String {
    load_prefs()
        .launch_args
        .get(id)
        .cloned()
        .unwrap_or_default()
}

pub fn set_launch_args(id: &str, args: &str) -> Result<(), String> {
    let mut prefs = load_prefs();
    let trimmed = args.trim();
    if trimmed.is_empty() {
        prefs.launch_args.remove(id);
    } else {
        prefs.launch_args.insert(id.to_string(), trimmed.to_string());
    }
    save_prefs(&prefs)
}

pub fn retro_path(id: &str) -> Option<String> {
    load_prefs().retro_paths.get(id).cloned()
}

pub fn set_retro_path(id: &str, path: &str) -> Result<(), String> {
    let mut prefs = load_prefs();
    let trimmed = path.trim();
    if trimmed.is_empty() {
        prefs.retro_paths.remove(id);
    } else {
        prefs.retro_paths.insert(id.to_string(), trimmed.to_string());
    }
    save_prefs(&prefs)
}

pub fn export_prefs() -> Result<String, String> {
    serde_json::to_string_pretty(&load_prefs()).map_err(|e| e.to_string())
}

pub fn import_prefs(json: &str) -> Result<(), String> {
    let parsed: Prefs = serde_json::from_str(json).map_err(|e| format!("Неверный файл: {}", e))?;
    save_prefs(&parsed)
}

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LaunchEvent {
    pub id: String,
    pub ts: u64,
}

fn events_path() -> PathBuf {
    let dir = dirs::data_local_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("game-launcher");
    let _ = fs::create_dir_all(&dir);
    dir.join("events.jsonl")
}

fn append_event(id: &str) {
    use std::io::Write;

    let event = LaunchEvent {
        id: id.to_string(),
        ts: now_secs(),
    };
    let Ok(line) = serde_json::to_string(&event) else {
        return;
    };
    let path = events_path();
    if let Ok(mut file) = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
    {
        let _ = writeln!(file, "{}", line);
    }

    // Держим журнал компактным: при переполнении оставляем последние 2000 событий.
    if let Ok(meta) = fs::metadata(&path) {
        if meta.len() > 2 * 1024 * 1024 {
            if let Ok(text) = fs::read_to_string(&path) {
                let keep: Vec<&str> = text.lines().rev().take(2000).collect();
                let rebuilt: Vec<String> = keep.into_iter().rev().map(str::to_string).collect();
                let _ = fs::write(&path, rebuilt.join("\n"));
            }
        }
    }
}

pub fn load_activity() -> Vec<LaunchEvent> {
    let Ok(text) = fs::read_to_string(events_path()) else {
        return Vec::new();
    };
    text.lines()
        .filter_map(|line| serde_json::from_str::<LaunchEvent>(line).ok())
        .collect()
}
