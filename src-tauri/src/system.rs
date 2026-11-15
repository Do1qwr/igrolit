use std::fs::OpenOptions;
use std::io::Write;
use std::path::PathBuf;
use std::process::Command;
use chrono::Local;

const TORRENT_PROCS: &[&str] = &["qbittorrent", "utorrent", "transmission", "bitcomet", "deluge"];

pub fn pause_torrents(pause: bool) -> Result<(), String> {
    let method = if pause { "Suspend" } else { "Resume" };
    for p in TORRENT_PROCS {
        let _ = Command::new("powershell")
            .args([
                "-NoProfile",
                "-Command",
                &format!("Get-Process !{0}* -ErrorAction SilentlyContinue | ForEach-Object {{ $_.{1}() }}", p, method),
            ])
            .output();
    }
    Ok(())
}

pub fn toggle_focus_mode(enable: bool) -> Result<(), String> {
    let value = if enable { "0" } else { "1" };
    let _ = Command::new("reg")
        .args([
            "add",
            r"HKCU\Software\Microsoft\Windows\CurrentVersion\Notifications\Settings",
            "/v",
            "NOC_GLOBAL_SETTING_ALLOW_TOASTS_ABOVE_LOCK",
            "/t",
            "REG_DWORD",
            "/d",
            value,
            "/f",
        ])
        .output();
    Ok(())
}

pub fn log_session_end(game_name: &str, duration_mins: u32) -> Result<(), String> {
    let app_data = dirs::data_local_dir().unwrap_or_else(|| PathBuf::from("."));
    let log_file = app_data.join("game-launcher").join("sessions.log");
    if let Some(parent) = log_file.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_file)
        .map_err(|e| e.to_string())?;
    let timestamp = Local::now().format("%Y-%m-%d %H:%M:%S");
    let entry = format!("[{}] ИГРА: {} | ДЛИТЕЛЬНОСТЬ: {} мин.\n", timestamp, game_name, duration_mins);
    file.write_all(entry.as_bytes()).map_err(|e| e.to_string())?;
    Ok(())
}