use chrono::{Local, TimeZone};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

/// Структура точки сохранения (бэкапа).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SaveEntry {
    pub id: String,
    pub name: String,
    pub date: String,
    pub size_formatted: String,
    pub size_bytes: u64,
    pub comment: Option<String>,
}

/// Уведомление о том, что игра закрылась подозрительно быстро.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CrashNotice {
    pub app_id: String,
    pub pre_save: Option<String>,
    pub when: String,
}

fn app_data_dir() -> PathBuf {
    dirs::data_local_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("game-launcher")
}

fn saves_root_for(app_id: &str) -> PathBuf {
    app_data_dir().join("saves").join(app_id)
}

fn crash_path() -> PathBuf {
    app_data_dir().join("crash_notice.json")
}

fn now_epoch() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn format_epoch(secs: u64) -> String {
    match Local.timestamp_opt(secs as i64, 0) {
        chrono::LocalResult::Single(dt) => dt.format("%d %b %Y, %H:%M").to_string(),
        _ => String::new(),
    }
}

fn format_size(bytes: u64) -> String {
    const KB: f64 = 1024.0;
    const MB: f64 = KB * 1024.0;
    const GB: f64 = MB * 1024.0;

    let value = bytes as f64;
    if value >= GB {
        format!("{:.1} ГБ", value / GB)
    } else if value >= MB {
        format!("{:.1} МБ", value / MB)
    } else if value >= KB {
        format!("{:.0} КБ", value / KB)
    } else {
        format!("{} Б", bytes)
    }
}

/// Расположение папки сохранений игры по appid.
fn game_save_path(app_id: &str) -> Option<PathBuf> {
    let known: &[(&str, &str)] = &[
        ("292030", "The Witcher 3"),
        ("1091500", "Cyberpunk 2077"),
        ("1245620", "ELDEN RING"),
        ("1049410", "Superliminal"),
        ("617700", "Weed Shop 2"),
        ("2807960", "Battlefield 6"),
        ("2725090", "HER TREES : THE PUZZLE HOUSE"),
        ("3300800", "HER TREES : PUZZLE DREAM"),
        ("5335510", "Moon Sweepers"),
    ];

    let base_docs = dirs::document_dir();
    let base_local = dirs::data_local_dir();

    for (id, dir) in known {
        if *id != app_id {
            continue;
        }
        if let Some(docs) = &base_docs {
            let candidate = docs.join("My Games").join(dir);
            if candidate.is_dir() {
                return Some(candidate);
            }
        }
        if let Some(local) = &base_local {
            let candidate = local.join(dir);
            if candidate.is_dir() {
                return Some(candidate);
            }
        }
    }

    None
}

fn copy_dir(from: &Path, to: &Path) -> std::io::Result<()> {
    if from.is_file() {
        fs::copy(from, to)?;
        return Ok(());
    }

    fs::create_dir_all(to)?;
    for entry in fs::read_dir(from)? {
        let entry = entry?;
        let source = entry.path();
        let target = to.join(entry.file_name());
        if source.is_dir() {
            copy_dir(&source, &target)?;
        } else {
            fs::copy(&source, &target)?;
        }
    }
    Ok(())
}

fn rename_dir(from: &Path, to: &Path) -> std::io::Result<()> {
    if !from.exists() {
        return Ok(());
    }
    fs::rename(from, to)
}

fn dir_size_bytes(path: &Path) -> u64 {
    let mut total = 0u64;
    if path.is_file() {
        return fs::metadata(path).map(|m| m.len()).unwrap_or(0);
    }
    if let Ok(entries) = fs::read_dir(path) {
        for entry in entries.flatten() {
            let child = entry.path();
            if child.is_dir() {
                total += dir_size_bytes(&child);
            } else {
                total += entry.metadata().map(|m| m.len()).unwrap_or(0);
            }
        }
    }
    total
}

pub fn list_saves(app_id: &str) -> Result<Vec<SaveEntry>, String> {
    let root = saves_root_for(app_id);
    let mut items = Vec::new();

    if let Ok(entries) = fs::read_dir(&root) {
        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_dir() {
                continue;
            }
            let name = path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("")
                .to_string();
            if name.is_empty() {
                continue;
            }
            let secs = name
                .split('_')
                .next()
                .and_then(|part| part.parse::<u64>().ok())
                .unwrap_or(0);
            let size = dir_size_bytes(&path);
            items.push(SaveEntry {
                id: format!("{}|{}", app_id, name),
                name,
                date: format_epoch(secs),
                size_formatted: format_size(size),
                size_bytes: size,
                comment: None,
            });
        }
    }

    items.sort_by(|a, b| b.name.cmp(&a.name));
    Ok(items)
}

pub fn create_backup(app_id: &str, comment: Option<String>) -> Result<SaveEntry, String> {
    create_backup_at(app_id, comment, None, 0)
}

fn prune_history(root: &Path, keep: u32) {
    if keep == 0 || keep >= 999 {
        return;
    }

    let mut items: Vec<(String, PathBuf)> = Vec::new();
    if let Ok(entries) = fs::read_dir(root) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                    items.push((name.to_string(), path));
                }
            }
        }
    }

    items.sort_by(|a, b| a.0.cmp(&b.0));
    if items.len() > keep as usize {
        let excess = items.len() - keep as usize;
        for (_, path) in items.into_iter().take(excess) {
            let _ = fs::remove_dir_all(path);
        }
    }
}

pub fn create_backup_at(
    app_id: &str,
    comment: Option<String>,
    root: Option<&Path>,
    history: u32,
) -> Result<SaveEntry, String> {
    let source = game_save_path(app_id)
        .ok_or_else(|| "Местоположение сохранений этой игры ещё не настроено".to_string())?;
    if !source.exists() {
        return Err("Папка сохранений игры не найдена".to_string());
    }

    let secs = now_epoch();
    let target_root = match root {
        Some(path) if !path.as_os_str().is_empty() => path.join(app_id),
        _ => saves_root_for(app_id),
    };
    fs::create_dir_all(&target_root).map_err(|e| e.to_string())?;

    let base = source
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("save");
    let name = format!("{}_{}", secs, base);
    let target = target_root.join(&name);
    copy_dir(&source, &target).map_err(|e| format!("Не удалось скопировать: {}", e))?;

    prune_history(&target_root, history);

    let size = dir_size_bytes(&target);
    Ok(SaveEntry {
        id: format!("{}|{}", app_id, name),
        name,
        date: format_epoch(secs),
        size_formatted: format_size(size),
        size_bytes: size,
        comment,
    })
}

pub fn restore_backup(save_name: &str, app_id: &str) -> Result<(), String> {
    let source = saves_root_for(app_id).join(save_name);
    if !source.exists() {
        return Err("Бэкап не найден".to_string());
    }

    let target = game_save_path(app_id)
        .ok_or_else(|| "Местоположение сохранений этой игры ещё не настроено".to_string())?;

    let mut previous = target.clone();
    let stamp = now_epoch();
    previous.set_file_name(format!(
        "{}_old_{}",
        target.file_name().and_then(|n| n.to_str()).unwrap_or("save"),
        stamp
    ));

    let _ = rename_dir(&target, &previous);

    match copy_dir(&source, &target) {
        Ok(()) => {
            let _ = fs::remove_dir_all(&previous);
            Ok(())
        }
        Err(error) => {
            let _ = rename_dir(&previous, &target);
            Err(error.to_string())
        }
    }
}

/// Запомнить, что игра закрылась слишком быстро (возможен краш).
pub fn note_crash(app_id: &str, pre_save: Option<String>) {
    let notice = CrashNotice {
        app_id: app_id.to_string(),
        pre_save,
        when: format_epoch(now_epoch()),
    };

    let path = crash_path();
    if let Some(dir) = path.parent() {
        let _ = fs::create_dir_all(dir);
    }
    if let Ok(json) = serde_json::to_string_pretty(&notice) {
        let _ = fs::write(path, json);
    }
}

/// Забрать уведомление о краше (и удалить его).
pub fn take_crash() -> Option<CrashNotice> {
    let path = crash_path();
    let notice = fs::read_to_string(&path)
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok());
    let _ = fs::remove_file(&path);
    notice
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn formats_sizes() {
        assert_eq!(format_size(512), "512 Б");
        assert_eq!(format_size(2048), "2 КБ");
    }

    #[test]
    fn crash_notice_roundtrip() {
        let dir = app_data_dir();
        let _ = fs::create_dir_all(&dir);
        note_crash("test", Some("123_save".to_string()));
        let notice = take_crash();
        assert!(notice.is_some());
        assert!(take_crash().is_none());
    }
}
