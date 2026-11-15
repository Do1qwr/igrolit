use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use winreg::enums::*;
use winreg::RegKey;

/// Настройки приложения. Часть полей перенесена из SteamCurtain (settings.txt),
/// часть — поведение самого Igrolit.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct AppSettings {
    // ---- Программа ----
    pub close_to_tray: bool,

    // ---- Шторка ----
    pub curtain_enabled: bool,
    pub curtain_app: String,
    pub curtain_edge: String,

    // ---- Шторка (перенесено из SteamCurtain) ----
    pub hide_on_switch: bool,
    pub animate: bool,
    pub corner_size: u32,
    pub min_speed: u32,
    pub anim_ms: u32,
    pub switch_hide_ms: u32,
    pub dwell_ms: u32,
    pub corner_tr: bool,
    pub corner_br: bool,
    pub corner_tl: bool,
    pub corner_bl: bool,
    pub rounded: bool,
    pub corner_radius: u32,
    pub hide_esc: bool,
    pub hide_outside: bool,
    pub overlay_shift_tab: bool,
    pub pause_in_games: bool,

    // ---- HUD (перенесено) ----
    pub show_hud: bool,
    pub hud_cpu: bool,
    pub hud_ram: bool,
    pub hud_fps: bool,
    pub hud_clock: bool,
    pub hud_only_in_games: bool,
    pub hud_real_fps: bool,

    // ---- Рабочие настройки ----
    pub auto_backup: bool,
    pub backup_path: String,
    pub backup_history: u32,
    pub boss_key: String,
    pub mask_app: String,
    pub clear_clipboard: bool,
    pub clear_recent_docs: bool,
    pub hide_playtime: bool,
    pub enable_toasts: bool,
    pub enable_sounds: bool,
    pub optimize_on_launch: bool,
    pub restore_after_game: bool,
    #[serde(default)]
    pub pause_torrents_on_launch: bool,
    #[serde(default)]
    pub focus_mode_on_launch: bool,

    // ---- Новое: снимки, онбординг, TV-режим ----
    #[serde(default = "default_snapshot_interval")]
    pub snapshot_interval: u32,
    #[serde(default)]
    pub onboarded: bool,
    #[serde(default)]
    pub tv_mode: bool,

    // ---- Лицензионное соглашение и телеметрия ----
    #[serde(default)]
    pub eula_accepted: bool,
    #[serde(default)]
    pub eula_version: String,
    #[serde(default)]
    pub eula_decided_at: u64,
    #[serde(default)]
    pub telemetry_enabled: bool,
}

fn default_snapshot_interval() -> u32 {
    15
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            close_to_tray: true,
            curtain_enabled: true,
            curtain_app: String::new(),
            curtain_edge: "right".to_string(),
            hide_on_switch: true,
            animate: true,
            corner_size: 120,
            min_speed: 120,
            anim_ms: 320,
            switch_hide_ms: 1200,
            dwell_ms: 80,
            corner_tr: true,
            corner_br: true,
            corner_tl: false,
            corner_bl: false,
            rounded: true,
            corner_radius: 18,
            hide_esc: true,
            hide_outside: true,
            overlay_shift_tab: false,
            pause_in_games: true,
            show_hud: true,
            hud_cpu: false,
            hud_ram: false,
            hud_fps: true,
            hud_clock: false,
            hud_only_in_games: true,
            hud_real_fps: true,
            auto_backup: true,
            backup_path: String::new(),
            backup_history: 5,
            boss_key: "Ctrl+Shift+X".to_string(),
            mask_app: "Excel".to_string(),
            clear_clipboard: true,
            clear_recent_docs: false,
            hide_playtime: false,
            enable_toasts: true,
            enable_sounds: true,
            optimize_on_launch: false,
            restore_after_game: true,
            pause_torrents_on_launch: false,
            focus_mode_on_launch: false,
            snapshot_interval: default_snapshot_interval(),
            onboarded: false,
            tv_mode: false,
            eula_accepted: false,
            eula_version: String::new(),
            eula_decided_at: 0,
            telemetry_enabled: false,
        }
    }
}

fn settings_path() -> PathBuf {
    dirs::data_local_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("game-launcher")
        .join("settings.json")
}

pub fn load_settings() -> AppSettings {
    let p = settings_path();
    match std::fs::read_to_string(&p) {
        Ok(s) => {
            // Убираем возможный BOM: файл могли сохранить редактор или PowerShell.
            let content = s.trim_start_matches('\u{feff}');
            match serde_json::from_str(content) {
                Ok(v) => v,
                Err(_) => {
                    let failed = p.with_file_name("settings.corrupt.json");
                    let _ = std::fs::remove_file(&failed);
                    let _ = std::fs::rename(&p, &failed);
                    AppSettings::default()
                }
            }
        }
        Err(_) => AppSettings::default(),
    }
}

pub fn save_settings(s: &AppSettings) -> Result<(), String> {
    let p = settings_path();
    let dir = p.parent().unwrap_or_else(|| std::path::Path::new("."));
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let json = serde_json::to_string_pretty(s).map_err(|e| e.to_string())?;
    let tmp = p.with_file_name("settings.json.tmp");
    std::fs::write(&tmp, json).map_err(|e| e.to_string())?;
    if p.exists() {
        let _ = std::fs::remove_file(&p);
    }
    std::fs::rename(&tmp, &p).map_err(|e| e.to_string())
}

pub fn export_settings() -> Result<String, String> {
    serde_json::to_string_pretty(&load_settings()).map_err(|e| e.to_string())
}

pub fn import_settings(json: &str) -> Result<(), String> {
    let parsed: AppSettings =
        serde_json::from_str(json).map_err(|e| format!("Неверный файл: {}", e))?;
    save_settings(&parsed)
}

const RUN_KEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";
const RUN_NAME: &str = "GameLauncher";

pub fn autostart_enabled() -> bool {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    match hkcu.open_subkey(RUN_KEY) {
        Ok(key) => key.get_value::<String, _>(RUN_NAME).is_ok(),
        Err(_) => false,
    }
}

pub fn set_autostart(enabled: bool) -> Result<(), String> {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let key = hkcu
        .open_subkey_with_flags(RUN_KEY, KEY_ALL_ACCESS)
        .map_err(|e| e.to_string())?;

    if enabled {
        let exe = std::env::current_exe().map_err(|e| e.to_string())?;
        let value = format!("\"{}\"", exe.display());
        key.set_value(RUN_NAME, &value).map_err(|e| e.to_string())
    } else {
        match key.delete_value(RUN_NAME) {
            Ok(()) => Ok(()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(e) => Err(e.to_string()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_are_sane() {
        let s = AppSettings::default();
        assert!(s.close_to_tray);
        assert_eq!(s.corner_size, 120);
        assert!(s.corner_tr && s.corner_br);
        assert!(!s.corner_tl && !s.corner_bl);
    }
}
