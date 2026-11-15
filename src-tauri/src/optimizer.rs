use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::process::Command;

/// Что делает оптимизация. Специально без остановки служб и без обрезки
/// рабочих наборов всех процессов: на практике это вызывало жёсткий сброс
/// в своп и зависание системы.
#[derive(Debug, Clone, Default, Serialize)]
pub struct Plan {
    pub services: Vec<String>,
    pub processes: Vec<String>,
    pub disable_sleep: bool,
    pub high_performance: bool,
    pub trim_memory: bool,
}

#[derive(Debug, Clone, Default, Serialize)]
pub struct MemoryInfo {
    pub used_mb: u64,
    pub total_mb: u64,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
struct SavedState {
    previous_scheme: Option<String>,
    sleep_changed: bool,
}

#[repr(C)]
#[derive(Default)]
struct MemoryStatusEx {
    length: u32,
    memory_load: u32,
    total_phys: u64,
    avail_phys: u64,
    total_page_file: u64,
    avail_page_file: u64,
    total_virtual: u64,
    avail_virtual: u64,
    avail_extended_virtual: u64,
}

extern "system" {
    fn GlobalMemoryStatusEx(status: *mut MemoryStatusEx) -> i32;
}

fn state_path() -> PathBuf {
    dirs::data_local_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("game-launcher")
        .join("optimizer_state.json")
}

pub fn memory_info() -> MemoryInfo {
    let mut status = MemoryStatusEx {
        length: std::mem::size_of::<MemoryStatusEx>() as u32,
        ..Default::default()
    };

    if unsafe { GlobalMemoryStatusEx(&mut status) } != 0 {
        MemoryInfo {
            used_mb: status.total_phys.saturating_sub(status.avail_phys) / 1024 / 1024,
            total_mb: status.total_phys / 1024 / 1024,
        }
    } else {
        MemoryInfo::default()
    }
}

fn active_scheme() -> Option<String> {
    let output = Command::new("powercfg").arg("/getactivescheme").output().ok()?;
    let text = String::from_utf8_lossy(&output.stdout);
    let start = text.find("GUID:")? + 5;
    let guid: String = text[start..]
        .trim()
        .chars()
        .take_while(|c| c.is_ascii_hexdigit() || *c == '-')
        .collect();
    if guid.len() >= 36 {
        Some(guid)
    } else {
        None
    }
}

fn save_state(state: &SavedState) {
    let path = state_path();
    if let Some(dir) = path.parent() {
        let _ = fs::create_dir_all(dir);
    }
    if let Ok(json) = serde_json::to_string_pretty(state) {
        let tmp = path.with_file_name("optimizer_state.json.tmp");
        if fs::write(&tmp, json).is_ok() {
            if path.exists() {
                let _ = fs::remove_file(&path);
            }
            let _ = fs::rename(&tmp, &path);
        }
    }
}

fn load_state() -> Option<SavedState> {
    fs::read_to_string(state_path())
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok())
}

pub fn plan() -> Plan {
    Plan {
        services: Vec::new(),
        processes: Vec::new(),
        disable_sleep: true,
        high_performance: true,
        trim_memory: false,
    }
}

/// Безопасная оптимизация: только план питания и таймаут сна.
/// Система не теряет память принудительно и не останавливает службы.
pub fn optimize() -> Result<String, String> {
    let previous_scheme = active_scheme();

    let sleep_changed = matches!(
        Command::new("powercfg")
            .args(["/change", "standby-timeout-ac", "0"])
            .status(),
        Ok(status) if status.success()
    );

    let _ = Command::new("powercfg").args(["/setactive", "SCHEME_MIN"]).output();

    save_state(&SavedState {
        previous_scheme,
        sleep_changed,
    });

    Ok(format!(
        "План питания: высокая производительность. Сон: {}. Память и службы не трогаем — безопасный режим.",
        if sleep_changed { "отключён" } else { "не изменён" }
    ))
}

pub fn restore() -> Result<String, String> {
    let Some(state) = load_state() else {
        return Ok("Нечего восстанавливать: оптимизация не запускалась".to_string());
    };

    if state.sleep_changed {
        let _ = Command::new("powercfg")
            .args(["/change", "standby-timeout-ac", "1800"])
            .output();
    }

    match state.previous_scheme {
        Some(scheme) => {
            let _ = Command::new("powercfg").args(["/setactive", &scheme]).output();
        }
        None => {
            let _ = Command::new("powercfg")
                .args(["/setactive", "SCHEME_BALANCED"])
                .output();
        }
    }

    let _ = fs::remove_file(state_path());

    Ok("План питания и таймаут сна возвращены к прежним значениям".to_string())
}

/// Если приложение упало или ПК перезагрузили во время игры, настройки
/// питания остались изменёнными. Возвращаем их при следующем запуске.
pub fn restore_on_startup() {
    if state_path().exists() {
        let _ = restore();
    }
}
