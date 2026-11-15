#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod audit;
mod cache;
mod chat;
mod content;
mod crypto;
mod gamification;
mod gamewatch;
mod lanplay;
mod lobby;
mod online;
mod optimizer;
mod platforms;
mod retro;
mod saves;
mod server;
mod settings;
mod steam_stats;
mod storage;
mod system;
mod tools;
mod updates;
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::Instant;

static CURTAIN_SHOWN_AT: Mutex<Option<Instant>> = Mutex::new(None);
static PALETTE_SHOWN_AT: Mutex<Option<Instant>> = Mutex::new(None);

lazy_static::lazy_static! {
    static ref IMAGE_CACHE: Mutex<HashMap<String, String>> = Mutex::new(HashMap::new());
}

static SERVER_CHILD: Mutex<Option<std::process::Child>> = Mutex::new(None);

const UPDATE_PUBKEY_HEX: &str = include_str!("../update.pub");

fn update_pubkey() -> Option<ed25519_dalek::VerifyingKey> {
    let bytes = hex::decode(UPDATE_PUBKEY_HEX.trim()).ok()?;
    let array: [u8; 32] = bytes.as_slice().try_into().ok()?;
    ed25519_dalek::VerifyingKey::from_bytes(&array).ok()
}

fn update_signing_key() -> Result<ed25519_dalek::SigningKey, String> {
    let current = std::env::current_exe().map_err(|e| e.to_string())?;
    let dir = current.parent().ok_or("no_dir")?;
    let path = dir.join("update-signing.key");
    let text = std::fs::read_to_string(&path).map_err(|_| "no_signing_key".to_string())?;
    let bytes = hex::decode(text.trim()).map_err(|_| "bad_signing_key".to_string())?;
    let array: [u8; 32] = bytes
        .as_slice()
        .try_into()
        .map_err(|_| "bad_signing_key".to_string())?;
    Ok(ed25519_dalek::SigningKey::from_bytes(&array))
}

pub fn sign_update(bytes: &[u8]) -> Result<String, String> {
    use ed25519_dalek::Signer;
    let key = update_signing_key()?;
    Ok(hex::encode(key.sign(bytes).to_bytes()))
}

pub fn verify_update(bytes: &[u8], sig_hex: &str) -> bool {
    use ed25519_dalek::Verifier;
    let Some(key) = update_pubkey() else {
        return false;
    };
    let Ok(sig_bytes) = hex::decode(sig_hex.trim()) else {
        return false;
    };
    let Ok(sig_array) = <[u8; 64]>::try_from(sig_bytes.as_slice()) else {
        return false;
    };
    let sig = ed25519_dalek::Signature::from_bytes(&sig_array);
    key.verify(bytes, &sig).is_ok()
}

fn base64_encode(data: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(data.len().div_ceil(3) * 4);
    for chunk in data.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = *chunk.get(1).unwrap_or(&0) as u32;
        let b2 = *chunk.get(2).unwrap_or(&0) as u32;
        let n = (b0 << 16) | (b1 << 8) | b2;
        out.push(TABLE[((n >> 18) & 63) as usize] as char);
        out.push(TABLE[((n >> 12) & 63) as usize] as char);
        out.push(if chunk.len() > 1 { TABLE[((n >> 6) & 63) as usize] as char } else { '=' });
        out.push(if chunk.len() > 2 { TABLE[(n & 63) as usize] as char } else { '=' });
    }
    out
}

fn url_encode(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    for byte in value.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => out.push(byte as char),
            b' ' => out.push('+'),
            _ => out.push_str(&format!("%{:02X}", byte)),
        }
    }
    out
}

fn applied_version_path() -> Option<std::path::PathBuf> {
    let current = std::env::current_exe().ok()?;
    Some(current.parent()?.to_path_buf().join("update.applied"))
}

fn applied_version() -> String {
    applied_version_path()
        .and_then(|path| std::fs::read_to_string(path).ok())
        .unwrap_or_default()
        .trim()
        .to_string()
}

fn write_applied_version(version: &str) {
    if let Some(path) = applied_version_path() {
        let _ = std::fs::write(path, version.trim());
        update_log(&format!("marker written {version}"));
    }
}

fn update_log(line: &str) {
    if let Ok(current) = std::env::current_exe() {
        if let Some(dir) = current.parent() {
            use std::io::Write;
            if let Ok(mut file) = std::fs::OpenOptions::new()
                .create(true)
                .append(true)
                .open(dir.join("update.log"))
            {
                let _ = writeln!(file, "{} {}", chrono::Local::now().format("%H:%M:%S"), line);
            }
        }
    }
}

fn http_base(server: &str) -> String {
    let trimmed = server.trim().trim_end_matches('/');
    if let Some(rest) = trimmed.strip_prefix("ws://") {
        format!("http://{}", rest)
    } else if let Some(rest) = trimmed.strip_prefix("wss://") {
        format!("https://{}", rest)
    } else {
        trimmed.to_string()
    }
}

fn http_client(timeout_secs: u64) -> Result<reqwest::blocking::Client, String> {
    reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(timeout_secs))
        .build()
        .map_err(|e| e.to_string())
}

fn release_exe_path() -> Result<std::path::PathBuf, String> {
    let current = std::env::current_exe().map_err(|e| e.to_string())?;
    let dir = current.parent().ok_or("no_dir")?.to_path_buf();
    let candidates = [
        dir.join("igrolit.exe"),
        dir.join("Igrolit.exe"),
        dir.join("game-launcher.exe"),
        dir.join("Game Launcher.exe"),
    ];
    for path in candidates {
        if path.exists() {
            return Ok(path);
        }
    }
    if current.exists() {
        return Ok(current);
    }
    Err("release_exe_not_found".to_string())
}

#[tauri::command]
fn app_channel() -> String {
    option_env!("GL_CHANNEL").unwrap_or("release").to_string()
}

#[tauri::command]
fn app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[tauri::command]
fn release_publish(
    server: String,
    token: String,
    version: String,
    notes: String,
    confirm: String,
) -> Result<String, String> {
    let path = release_exe_path()?;
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    let signature = sign_update(&bytes).map_err(|err| {
        if err == "no_signing_key" {
            "Нет ключа подписи: положите update-signing.key рядом с приложением".to_string()
        } else {
            format!("Не удалось подписать обновление: {err}")
        }
    })?;
    let url = format!(
        "{}/app/publish?version={}&notes={}",
        http_base(&server),
        url_encode(version.trim()),
        url_encode(notes.trim())
    );
    let client = http_client(300)?;
    let response = client
        .post(&url)
        .header("x-token", token)
        .header("x-signature", signature)
        .header("x-confirm", confirm)
        .body(bytes)
        .send()
        .map_err(|e| e.to_string())?;
    if !response.status().is_success() {
        return Err(format!("status {}", response.status()));
    }
    response.text().map_err(|e| e.to_string())
}

#[tauri::command]
fn update_check(server: String) -> Result<serde_json::Value, String> {
    let url = format!("{}/app/latest", http_base(&server));
    update_log(&format!("check {url}"));
    let client = http_client(6)?;
    let response = match client.get(&url).send() {
        Ok(value) => value,
        Err(err) => {
            update_log(&format!("check failed: {err}"));
            return Ok(serde_json::Value::Null);
        }
    };
    update_log(&format!("check status {}", response.status()));
    if !response.status().is_success() {
        return Ok(serde_json::Value::Null);
    }
    let body = response.text().map_err(|e| e.to_string())?;
    let meta: serde_json::Value = serde_json::from_str(&body).map_err(|e| e.to_string())?;
    let latest = meta
        .get("version")
        .and_then(|value| value.as_str())
        .unwrap_or("")
        .to_string();
    let applied = applied_version();
    update_log(&format!("latest={latest} applied={applied}"));
    if !latest.is_empty() && applied == latest {
        update_log("already applied");
        return Ok(meta);
    }
    Ok(meta)
}

#[tauri::command]
fn update_apply(server: String, url: String, sha256: String, version: String, sig: String) -> Result<(), String> {
    let client = http_client(300)?;
    let full = if url.starts_with("http") {
        url.clone()
    } else {
        format!("{}{}", http_base(&server), url)
    };
    update_log(&format!("download {full}"));
    let bytes = client
        .get(&full)
        .send()
        .map_err(|e| {
            update_log(&format!("download failed: {e}"));
            e.to_string()
        })?
        .bytes()
        .map_err(|e| e.to_string())?;
    update_log(&format!("downloaded {} bytes", bytes.len()));
    if !sha256.is_empty() {
        use sha2::{Digest, Sha256};
        let mut hasher = Sha256::new();
        hasher.update(&bytes);
        let got = hex::encode(hasher.finalize());
        if got != sha256.to_lowercase() {
            update_log(&format!("hash mismatch got={got} want={sha256}"));
            return Err("hash_mismatch".to_string());
        }
        update_log("hash ok");
    }
    if sig.trim().is_empty() {
        if app_channel() == "dev" {
            update_log("signature missing (dev allowed)");
        } else {
            update_log("signature missing — refuse");
            return Err("unsigned_update".to_string());
        }
    } else if verify_update(&bytes, &sig) {
        update_log("signature ok");
    } else {
        update_log("signature invalid — refuse");
        return Err("bad_signature".to_string());
    }
    let current = std::env::current_exe().map_err(|e| e.to_string())?;
    let backup = current.with_extension("old.exe");
    let new_exe = std::env::temp_dir().join("game-launcher-update.exe");
    std::fs::write(&new_exe, &bytes).map_err(|e| e.to_string())?;
    if backup.exists() {
        let _ = std::fs::remove_file(&backup);
    }
    std::fs::rename(&current, &backup).map_err(|e| {
        update_log(&format!("rename failed: {e}"));
        e.to_string()
    })?;
    update_log("current renamed");
    if let Err(err) = std::fs::copy(&new_exe, &current) {
        let _ = std::fs::rename(&backup, &current);
        update_log(&format!("copy failed: {err}"));
        return Err(err.to_string());
    }
    update_log("new exe placed");
    write_applied_version(&version);
    let _ = std::process::Command::new(&current).spawn();
    update_log("restart spawned");
    std::process::exit(0);
}

#[tauri::command]
fn dev_project_path() -> String {
    std::env::current_exe()
        .ok()
        .and_then(|exe| exe.parent().map(|dir| dir.join("project.path")))
        .and_then(|path| std::fs::read_to_string(path).ok())
        .unwrap_or_default()
        .trim()
        .to_string()
}

#[tauri::command]
fn dev_read_log(path: String, lines: u32) -> Result<String, String> {
    let text = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let take = lines.max(1) as usize;
    let all: Vec<&str> = text.lines().collect();
    let start = all.len().saturating_sub(take);
    Ok(all[start..].join("\n"))
}

#[tauri::command]
fn dev_server_status() -> serde_json::Value {
    let mut guard = match SERVER_CHILD.lock() {
        Ok(value) => value,
        Err(_) => return serde_json::json!({ "running": false }),
    };
    if let Some(child) = guard.as_mut() {
        match child.try_wait() {
            Ok(Some(status)) => {
                let code = status.code().unwrap_or(-1);
                *guard = None;
                return serde_json::json!({ "running": false, "exit": code });
            }
            Ok(None) => {
                return serde_json::json!({ "running": true, "pid": child.id() });
            }
            Err(err) => {
                *guard = None;
                return serde_json::json!({ "running": false, "error": err.to_string() });
            }
        }
    }
    serde_json::json!({ "running": false })
}

#[tauri::command]
fn dev_server_start(cwd: String, data_file: String, port: u16) -> Result<u32, String> {
    let _ = dev_server_stop();
    let nested = std::path::Path::new(&cwd).join("online-server").join("server.js");
    let script = if nested.exists() {
        "online-server/server.js".to_string()
    } else {
        "server.js".to_string()
    };
    let child = std::process::Command::new("node")
        .arg(script)
        .current_dir(&cwd)
        .env("PORT", port.to_string())
        .env("DATA_FILE", &data_file)
        .env("ADMIN_NAMES", "admin1")
        .spawn()
        .map_err(|e| e.to_string())?;
    let pid = child.id();
    if let Ok(mut guard) = SERVER_CHILD.lock() {
        *guard = Some(child);
    }
    Ok(pid)
}

#[tauri::command]
fn dev_server_stop() -> Result<(), String> {
    if let Ok(mut guard) = SERVER_CHILD.lock() {
        if let Some(mut child) = guard.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
    Ok(())
}

#[tauri::command]
fn dev_default_data_path() -> String {
    let base = dirs::data_local_dir().unwrap_or_else(std::env::temp_dir);
    base.join("game-launcher-demo").join("data.json").display().to_string()
}

#[tauri::command]
fn dev_http_text(url: String) -> Result<String, String> {
    let client = http_client(6)?;
    let response = client.get(&url).send().map_err(|e| e.to_string())?;
    let status = response.status().as_u16();
    let body = response.text().unwrap_or_default();
    let short: String = body.chars().take(200).collect();
    Ok(format!("{status}: {short}"))
}

#[tauri::command]
fn app_status(url: String) -> Result<serde_json::Value, String> {
    let client = http_client(5)?;
    let response = client.get(&url).send().map_err(|e| e.to_string())?;
    let text = response.text().map_err(|e| e.to_string())?;
    serde_json::from_str(&text).map_err(|e| e.to_string())
}

#[tauri::command]
fn log_crash(kind: String, message: String, details: String) -> Result<(), String> {
    let current = std::env::current_exe().map_err(|e| e.to_string())?;
    let dir = current.parent().ok_or("no_dir")?;
    let path = dir.join("crash.log");
    let stamp = chrono::Local::now().format("%Y-%m-%d %H:%M:%S");
    let line = format!(
        "[{stamp}] {}: {}\n  {}\n",
        kind.chars().take(40).collect::<String>(),
        message.chars().take(500).collect::<String>(),
        details.chars().take(2000).collect::<String>()
    );
    use std::io::Write;
    let mut file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|e| e.to_string())?;
    file.write_all(line.as_bytes()).map_err(|e| e.to_string())?;
    crate::audit::append("crash_logged", "system", &kind);
    Ok(())
}

#[tauri::command]
fn dev_data_info(path: String) -> Result<serde_json::Value, String> {
    let file = std::path::Path::new(&path);
    if !file.exists() {
        return Ok(serde_json::json!({ "exists": false }));
    }
    let meta = std::fs::metadata(file).map_err(|e| e.to_string())?;
    let text = std::fs::read_to_string(file).map_err(|e| e.to_string())?;
    let value: serde_json::Value = serde_json::from_str(&text).unwrap_or(serde_json::Value::Null);
    Ok(serde_json::json!({
        "exists": true,
        "size": meta.len(),
        "servers": value.get("public_servers").and_then(|v| v.as_array()).map(|v| v.len()).unwrap_or(0),
        "users": value.get("users").and_then(|v| v.as_object()).map(|v| v.len()).unwrap_or(0),
        "orders": value.get("orders").and_then(|v| v.as_array()).map(|v| v.len()).unwrap_or(0),
    }))
}

#[tauri::command]
fn dev_backup_data(path: String) -> Result<String, String> {
    let src = std::path::Path::new(&path);
    if !src.exists() {
        return Err("no_data".to_string());
    }
    let stamp = chrono::Local::now().format("%Y%m%d-%H%M%S");
    let backup = src.with_file_name(format!("data-{stamp}.bak.json"));
    std::fs::copy(src, &backup).map_err(|e| e.to_string())?;
    Ok(backup.display().to_string())
}

#[tauri::command]
fn dev_list_backups(path: String) -> Result<Vec<String>, String> {
    let dir = std::path::Path::new(&path).parent().ok_or("no_dir")?.to_path_buf();
    let mut list: Vec<String> = std::fs::read_dir(dir)
        .map_err(|e| e.to_string())?
        .filter_map(|entry| entry.ok())
        .filter_map(|entry| {
            let name = entry.file_name().to_string_lossy().to_string();
            if name.starts_with("data-") && name.ends_with(".bak.json") {
                Some(name)
            } else {
                None
            }
        })
        .collect();
    list.sort();
    list.reverse();
    Ok(list)
}

#[tauri::command]
fn dev_restore_data(path: String, backup: String) -> Result<(), String> {
    let src = std::path::Path::new(&path);
    let dir = src.parent().ok_or("no_dir")?.to_path_buf();
    let from = dir.join(&backup);
    if !from.exists() {
        return Err("no_backup".to_string());
    }
    std::fs::copy(&from, src).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn fetch_image(url: String) -> Result<String, String> {
    if !(url.starts_with("http://") || url.starts_with("https://")) {
        return Err("bad_url".to_string());
    }
    if let Ok(cache) = IMAGE_CACHE.lock() {
        if let Some(hit) = cache.get(&url) {
            return Ok(hit.clone());
        }
    }
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(8))
        .build()
        .map_err(|e| e.to_string())?;
    let response = client.get(&url).send().map_err(|e| e.to_string())?;
    if !response.status().is_success() {
        return Err(format!("status {}", response.status()));
    }
    let mime = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("image/jpeg")
        .split(';')
        .next()
        .unwrap_or("image/jpeg")
        .trim()
        .to_string();
    if !mime.starts_with("image/") {
        return Err("not_image".to_string());
    }
    let bytes = response.bytes().map_err(|e| e.to_string())?;
    if bytes.len() > 4 * 1024 * 1024 {
        return Err("too_big".to_string());
    }
    let data = format!("data:{};base64,{}", mime, base64_encode(&bytes));
    if let Ok(mut cache) = IMAGE_CACHE.lock() {
        if cache.len() > 300 {
            cache.clear();
        }
        cache.insert(url, data.clone());
    }
    Ok(data)
}

#[cfg(windows)]
#[link(name = "dwmapi")]
extern "system" {
    fn DwmSetWindowAttribute(
        hwnd: isize,
        attribute: u32,
        value: *const core::ffi::c_void,
        size: u32,
    ) -> i32;
}

#[cfg(windows)]
fn apply_dark_titlebar(window: &tauri::Window) {
    if let Ok(hwnd) = window.hwnd() {
        let dark: i32 = 1;
        let ptr = &dark as *const i32 as *const core::ffi::c_void;
        unsafe {
            // DWMWA_USE_IMMERSIVE_DARK_MODE (20) и её старое значение (19)
            let _ = DwmSetWindowAttribute(hwnd.0, 20, ptr, 4);
            let _ = DwmSetWindowAttribute(hwnd.0, 19, ptr, 4);
        }
    }
}

#[cfg(windows)]
#[link(name = "user32")]
extern "system" {
    fn ReleaseCapture() -> i32;
    fn SendMessageW(hwnd: isize, msg: u32, wparam: usize, lparam: isize) -> isize;
}

#[cfg(windows)]
const WM_NCLBUTTONDOWN: u32 = 0x00A1;

#[cfg(windows)]
fn resize_hit_code(direction: &str) -> Option<usize> {
    Some(match direction {
        "left" => 10,
        "right" => 11,
        "top" => 12,
        "top-left" => 13,
        "top-right" => 14,
        "bottom" => 15,
        "bottom-left" => 16,
        "bottom-right" => 17,
        _ => return None,
    })
}

#[tauri::command]
#[cfg(windows)]
fn begin_resize(window: tauri::Window, direction: String) -> Result<(), String> {
    let code = resize_hit_code(&direction).ok_or_else(|| "bad_direction".to_string())?;
    let hwnd = window.hwnd().map_err(|e| e.to_string())?.0;
    unsafe {
        ReleaseCapture();
        SendMessageW(hwnd, WM_NCLBUTTONDOWN, code, 0);
    }
    Ok(())
}

#[tauri::command]
#[cfg(not(windows))]
fn begin_resize(_window: tauri::Window, _direction: String) -> Result<(), String> {
    Err("unsupported".to_string())
}

#[cfg(windows)]
#[repr(C)]
struct CursorPoint {
    x: i32,
    y: i32,
}

#[cfg(windows)]
#[repr(C)]
struct WindowRect {
    left: i32,
    top: i32,
    right: i32,
    bottom: i32,
}

#[cfg(windows)]
#[link(name = "user32")]
extern "system" {
    fn GetCursorPos(point: *mut CursorPoint) -> i32;
    fn GetSystemMetrics(index: i32) -> i32;
    fn GetWindowRect(hwnd: *mut core::ffi::c_void, rect: *mut WindowRect) -> i32;
}

#[cfg(windows)]
fn foreground_is_fullscreen() -> bool {
    unsafe {
        let window = GetForegroundWindow();
        if window.is_null() {
            return false;
        }

        let mut rect = WindowRect {
            left: 0,
            top: 0,
            right: 0,
            bottom: 0,
        };
        if GetWindowRect(window, &mut rect) == 0 {
            return false;
        }

        let screen_w = GetSystemMetrics(0);
        let screen_h = GetSystemMetrics(1);
        let width = rect.right - rect.left;
        let height = rect.bottom - rect.top;

        width >= screen_w && height >= screen_h
    }
}

#[cfg(windows)]
fn start_corner_watch(app: tauri::AppHandle) {
    std::thread::spawn(move || {
        use tauri::Manager;

        let mut s = settings::load_settings();
        let mut refreshed = Instant::now();
        let mut inside = false;
        let mut inside_since = Instant::now();
        let mut armed = true;

        loop {
            std::thread::sleep(std::time::Duration::from_millis(70));

            if refreshed.elapsed() >= std::time::Duration::from_millis(2000) {
                s = settings::load_settings();
                refreshed = Instant::now();
            }

            if !s.curtain_enabled {
                inside = false;
                armed = true;
                std::thread::sleep(std::time::Duration::from_millis(250));
                continue;
            }

            if s.pause_in_games && foreground_is_fullscreen() {
                inside = false;
                armed = true;
                std::thread::sleep(std::time::Duration::from_millis(200));
                continue;
            }

            let mut point = CursorPoint { x: 0, y: 0 };
            if unsafe { GetCursorPos(&mut point) } == 0 {
                continue;
            }

            let screen_w = unsafe { GetSystemMetrics(0) };
            let screen_h = unsafe { GetSystemMetrics(1) };
            let zone = s.corner_size as i32;

            let hit = (s.corner_tl && point.x <= zone && point.y <= zone)
                || (s.corner_tr && point.x >= screen_w - zone && point.y <= zone)
                || (s.corner_bl && point.x <= zone && point.y >= screen_h - zone)
                || (s.corner_br && point.x >= screen_w - zone && point.y >= screen_h - zone);

            if hit {
                if !inside {
                    inside = true;
                    inside_since = Instant::now();
                }
            } else {
                inside = false;
                armed = true;
            }

            if armed && inside && inside_since.elapsed().as_millis() as u32 >= s.dwell_ms {
                let visible = app
                    .get_window("curtain")
                    .and_then(|win| win.is_visible().ok())
                    .unwrap_or(false);
                if !visible {
                    curtain_show(&app);
                    armed = false;
                    inside = false;
                    std::thread::sleep(std::time::Duration::from_millis(1200));
                }
            }
        }
    });
}

#[tauri::command]
fn get_games() -> Vec<platforms::Game> {
    platforms::scan_all_games()
}
#[tauri::command]
fn launch_game(app_id: String, launch_cmd: String) -> Result<(), String> {
    let s = settings::load_settings();
    let mut pre_save: Option<String> = None;
    if s.auto_backup && !app_id.is_empty() {
        let root = if s.backup_path.trim().is_empty() {
            None
        } else {
            Some(std::path::PathBuf::from(s.backup_path.trim()))
        };
        if let Ok(entry) = saves::create_backup_at(
            &app_id,
            Some("auto".to_string()),
            root.as_deref(),
            s.backup_history,
        ) {
            pre_save = Some(entry.name);
        }
    }
    if s.optimize_on_launch {
        let _ = optimizer::optimize();
    }
    if s.pause_torrents_on_launch {
        let _ = system::pause_torrents(true);
    }
    if s.focus_mode_on_launch {
        let _ = system::toggle_focus_mode(true);
    }

    let args = storage::launch_args_for(&app_id);
    let trimmed = args.trim();

    // Целостность: для локального exe проверяем существование и размер.
    if launch_cmd.to_lowercase().ends_with(".exe") {
        let exe_path = std::path::Path::new(&launch_cmd);
        if !exe_path.exists() {
            return Err(format!(
                "Не найден файл игры:\n{}\nПереустановите игру или измените путь.",
                launch_cmd
            ));
        }
        if exe_path.metadata().map(|m| m.len() == 0).unwrap_or(false) {
            return Err(format!(
                "Файл игры повреждён (0 байт):\n{}\nПроверьте целостность файлов.",
                launch_cmd
            ));
        }
    }
    if launch_cmd.starts_with("steam://run/") && app_id.parse::<u64>().is_ok() {
        // Steam сам сообщит, если игра не установлена.
    }

    let launched = if trimmed.is_empty() {
        open::that(&launch_cmd).map_err(|e| format!("Ошибка запуска: {}", e))
    } else if launch_cmd.starts_with("steam://run/") {
        let url = format!("{}//{}", launch_cmd, trimmed);
        open::that(&url).map_err(|e| format!("Ошибка запуска: {}", e))
    } else if launch_cmd.to_lowercase().ends_with(".exe")
        && std::path::Path::new(&launch_cmd).exists()
    {
        std::process::Command::new(&launch_cmd)
            .args(trimmed.split_whitespace())
            .spawn()
            .map(|_| ())
            .map_err(|e| format!("Ошибка запуска: {}", e))
    } else {
        open::that(&launch_cmd).map_err(|e| format!("Ошибка запуска: {}", e))
    };

    if launched.is_ok() && s.restore_after_game {
        if let Some(exe) = gamewatch::resolve_exe(&app_id, &launch_cmd) {
            gamewatch::watch(exe, app_id.clone(), pre_save);
        }
    }

    launched
}

#[tauri::command]
fn get_cover(app_id: String) -> Result<String, String> {
    if let Ok(id) = app_id.parse::<u32>() {
        return cache::download_cover(id);
    }

    if let Some(path) = platforms::get_custom_cover(&app_id) {
        if std::path::Path::new(&path).exists() {
            return Ok(path);
        }
    }

    let name = platforms::name_for_id(&app_id).unwrap_or_default();
    let stem = std::path::Path::new(&app_id)
        .file_stem()
        .map(|value| value.to_string_lossy().to_string())
        .unwrap_or_default();

    let mut last_error = "Обложка не найдена".to_string();
    for query in [name.as_str(), stem.as_str()] {
        if query.trim().is_empty() {
            continue;
        }
        match cache::download_cover_by_name(query) {
            Ok(path) => {
                let _ = platforms::set_custom_cover(&app_id, &path);
                return Ok(path);
            }
            Err(error) => last_error = error,
        }
    }

    Err(last_error)
}

#[tauri::command]
fn find_cover(name: String) -> Result<String, String> {
    cache::download_cover_by_name(&name)
}

#[tauri::command]
fn set_custom_cover_file(id: String, source: String) -> Result<String, String> {
    let src = std::path::Path::new(&source);
    if !src.exists() {
        return Err("Файл не найден".to_string());
    }
    let ext = src
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("jpg")
        .to_lowercase();
    if !["jpg", "jpeg", "png", "webp"].contains(&ext.as_str()) {
        return Err("Поддерживаются JPG, PNG и WebP".to_string());
    }

    let dir = cache::get_cache_dir().join("covers");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    use std::hash::{Hash, Hasher};
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    id.hash(&mut hasher);
    let target = dir.join(format!("custom_{:x}.{}", hasher.finish(), ext));

    std::fs::copy(src, &target).map_err(|e| format!("Не удалось скопировать: {}", e))?;
    let path = target.to_string_lossy().to_string();
    platforms::set_custom_cover(&id, &path)?;
    Ok(path)
}

#[tauri::command]
fn add_custom_game(name: String, path: String) -> Result<(), String> {
    platforms::add_custom_game(name, path)
}

#[tauri::command]
fn remove_custom_game(path: String) -> Result<(), String> {
    platforms::remove_custom_game(path)
}

#[tauri::command]
fn get_prefs() -> storage::Prefs {
    storage::load_prefs()
}

#[tauri::command]
fn open_steam(url: String) -> Result<(), String> {
    open::that(&url).map_err(|e| format!("Не удалось открыть Steam: {}", e))
}

#[tauri::command]
fn validate_game(app_id: String) -> Result<(), String> {
    if app_id.parse::<u32>().is_err() {
        return Err("Проверка файлов доступна только для игр Steam".to_string());
    }
    open::that(format!("steam://validate/{}", app_id))
        .map_err(|e| format!("Не удалось открыть Steam: {}", e))
}

#[tauri::command]
fn deps_status(app_id: String) -> Vec<String> {
    use winreg::enums::*;
    use winreg::RegKey;

    let _ = app_id;
    let mut missing = Vec::new();

    let vc_ok = RegKey::predef(HKEY_LOCAL_MACHINE)
        .open_subkey("SOFTWARE\\WOW6432Node\\Microsoft\\VisualStudio\\14.0\\VC\\Runtimes\\x64")
        .and_then(|key| key.get_value::<u32, _>("Installed"))
        .map(|value| value == 1)
        .unwrap_or(false);
    if !vc_ok {
        missing.push("Visual C++ 2015-2022 (x64)".to_string());
    }

    let net_ok = RegKey::predef(HKEY_LOCAL_MACHINE)
        .open_subkey("SOFTWARE\\Microsoft\\NET Framework Setup\\NDP\\v4\\Full")
        .and_then(|key| key.get_value::<u32, _>("Release"))
        .map(|release| release >= 528_040)
        .unwrap_or(false);
    if !net_ok {
        missing.push(".NET Framework 4.8".to_string());
    }

    missing
}

#[tauri::command]
fn online_session_get() -> Option<serde_json::Value> {
    let path = dirs::data_local_dir()?
        .join("game-launcher")
        .join("online_session.json");
    let text = std::fs::read_to_string(path).ok()?;
    serde_json::from_str(&text).ok()
}

#[tauri::command]
fn online_session_save(server: String, token: String, user: String) -> Result<(), String> {
    let dir = dirs::data_local_dir()
        .ok_or_else(|| "Не найдена папка данных".to_string())?
        .join("game-launcher");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join("online_session.json");
    let json = serde_json::json!({ "server": server, "token": token, "user": user });
    let text = serde_json::to_string_pretty(&json).map_err(|e| e.to_string())?;
    let tmp = path.with_file_name("online_session.json.tmp");
    std::fs::write(&tmp, text).map_err(|e| e.to_string())?;
    if path.exists() {
        let _ = std::fs::remove_file(&path);
    }
    std::fs::rename(&tmp, &path).map_err(|e| e.to_string())
}

#[tauri::command]
fn online_session_clear() -> Result<(), String> {
    let path = dirs::data_local_dir()
        .ok_or_else(|| "Не найдена папка данных".to_string())?
        .join("game-launcher")
        .join("online_session.json");
    if path.exists() {
        std::fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Полный сброс локальных данных программы: сохранённая онлайн-сессия и настройки.
#[tauri::command]
fn clear_local_data() -> Result<(), String> {
    let dir = dirs::data_local_dir()
        .ok_or_else(|| "Не найдена папка данных".to_string())?
        .join("game-launcher");
    let session = dir.join("online_session.json");
    let settings = dir.join("settings.json");
    if session.exists() {
        std::fs::remove_file(&session).map_err(|e| e.to_string())?;
    }
    if settings.exists() {
        std::fs::remove_file(&settings).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn read_avatar_file(path: String) -> Result<Vec<u8>, String> {
    let meta = std::fs::metadata(&path).map_err(|e| e.to_string())?;
    if meta.len() > 300 * 1024 {
        return Err("Файл больше 300 КБ".to_string());
    }
    std::fs::read(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn read_preset_avatar(name: String) -> Result<Vec<u8>, String> {
    let base = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("avatars");
    let safe = std::path::Path::new(&name)
        .file_name()
        .map(|f| f.to_string_lossy().to_string())
        .unwrap_or_default();
    let file = base.join(safe);
    let meta = std::fs::metadata(&file).map_err(|_| "not found".to_string())?;
    if meta.len() > 400 * 1024 {
        return Err("too big".to_string());
    }
    std::fs::read(&file).map_err(|e| e.to_string())
}

#[tauri::command]
fn online_status() -> serde_json::Value {
    online::status()
}

#[tauri::command]
fn friends_open(app: tauri::AppHandle) {
    use tauri::Manager;
    if let Some(win) = app.get_window("friends") {
        let _ = win.show();
        let _ = win.set_focus();
    }
}

#[tauri::command]
fn open_url(url: String) -> Result<(), String> {
    open::that(&url).map_err(|e| e.to_string())
}

fn zerotier_cli() -> Option<std::path::PathBuf> {
    let candidates = [
        r"C:\ProgramData\ZeroTier\One\zerotier-cli.bat",
        r"C:\Program Files (x86)\ZeroTier\One\zerotier-cli.bat",
        r"C:\Program Files\ZeroTier\One\zerotier-cli.bat",
    ];
    for candidate in candidates {
        let path = std::path::PathBuf::from(candidate);
        if path.exists() {
            return Some(path);
        }
    }
    None
}

fn run_zerotier(cli: &std::path::Path, args: &[&str]) -> Result<String, String> {
    let output = std::process::Command::new("cmd")
        .arg("/c")
        .arg(cli)
        .args(args)
        .output()
        .map_err(|e| e.to_string())?;
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    if !output.status.success() {
        let message = format!(
            "{}{}",
            stdout,
            if stderr.is_empty() {
                String::new()
            } else {
                format!(" {}", stderr)
            }
        );
        return Err(if message.trim().is_empty() {
            "ZeroTier вернул ошибку".to_string()
        } else {
            message.trim().to_string()
        });
    }
    Ok(stdout)
}

#[tauri::command]
fn zerotier_status() -> serde_json::Value {
    let Some(cli) = zerotier_cli() else {
        return serde_json::json!({
            "installed": false,
            "ok": false,
            "info": null,
            "networks": [],
            "error": "ZeroTier не установлен"
        });
    };
    let info = run_zerotier(&cli, &["-j", "info"])
        .ok()
        .and_then(|text| serde_json::from_str::<serde_json::Value>(&text).ok());
    let networks = run_zerotier(&cli, &["-j", "listnetworks"])
        .ok()
        .and_then(|text| serde_json::from_str::<serde_json::Value>(&text).ok())
        .unwrap_or(serde_json::json!([]));
    serde_json::json!({ "installed": true, "ok": info.is_some(), "info": info, "networks": networks })
}

#[tauri::command]
fn zerotier_join(network_id: String) -> Result<String, String> {
    let id = network_id.trim().to_lowercase();
    if id.len() != 16 || !id.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err("ID сети — 16 шестнадцатеричных символов".to_string());
    }
    let cli = zerotier_cli().ok_or_else(|| "ZeroTier не установлен".to_string())?;
    run_zerotier(&cli, &["join", &id])
}

#[tauri::command]
fn zerotier_leave(network_id: String) -> Result<String, String> {
    let id = network_id.trim().to_lowercase();
    let cli = zerotier_cli().ok_or_else(|| "ZeroTier не установлен".to_string())?;
    run_zerotier(&cli, &["leave", &id])
}

#[tauri::command]
fn get_retro_games() -> Vec<retro::RetroGame> {
    retro::all_games()
}

#[tauri::command]
fn add_retro_game_cmd(name: String, exe_path: String, category: String) -> Result<retro::RetroGame, String> {
    let category = if category.trim().is_empty() { "Свои" } else { category.trim() };
    retro::add_custom(&name, &exe_path, category)
}

#[tauri::command]
fn update_retro_game_cmd(id: String, name: String, exe_path: String, category: String) -> Result<retro::RetroGame, String> {
    retro::update_custom(&id, &name, &exe_path, &category)
}

#[tauri::command]
fn delete_retro_game_cmd(id: String) -> Result<(), String> {
    retro::delete_custom(&id)
}

#[tauri::command]
fn list_retro_servers() -> Vec<retro::ServerEntry> {
    retro::list_servers()
}

#[tauri::command]
fn add_retro_server_cmd(name: String, address: String) -> Result<retro::ServerEntry, String> {
    retro::add_server(&name, &address)
}

#[tauri::command]
fn delete_retro_server_cmd(id: String) -> Result<(), String> {
    retro::delete_server(&id)
}

#[tauri::command]
fn set_compat_layer_cmd(game_id: String, layer: String) -> Result<(), String> {
    retro::set_compat_layer(&game_id, &layer)
}

#[tauri::command]
fn clear_compat_layer_cmd(game_id: String) -> Result<(), String> {
    retro::clear_compat_layer(&game_id)
}

#[tauri::command]
fn launch_retro_compat_cmd(
    game_id: String,
    run_as_admin: bool,
    windowed: bool,
) -> Result<String, String> {
    let result = retro::launch_with_compat(
        &game_id,
        retro::CompatOptions {
            run_as_admin,
            windowed_65560: windowed,
            win_xp: false,
            win98: false,
        },
    )?;
    let _ = storage::record_launch(&format!("retro:{}", game_id));
    Ok(result)
}

#[tauri::command]
fn launch_retro_game_cmd(game_id: String) -> Result<String, String> {
    let result = retro::launch(&game_id)?;
    let _ = storage::record_launch(&format!("retro:{}", game_id));
    Ok(result)
}

#[tauri::command]
async fn choose_retro_exe(game_id: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || retro::choose_exe(&game_id))
        .await
        .map_err(|e| format!("Ошибка выбора файла: {}", e))?
}

#[tauri::command]
fn get_retro_save_dir(game_id: String) -> Result<String, String> {
    retro::save_dir(&game_id)
}

#[tauri::command]
fn launch_retro_connect(game_id: String, address: String) -> Result<String, String> {
    let result = retro::launch_connect(&game_id, &address)?;
    let _ = storage::record_launch(&format!("retro:{}", game_id));
    Ok(result)
}

#[tauri::command]
async fn import_retro_saves(game_id: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || retro::import_saves(&game_id))
        .await
        .map_err(|e| format!("Ошибка выбора файла: {}", e))?
}

#[tauri::command]
fn lan_local_ips() -> Vec<String> {
    lanplay::local_ips()
}

#[tauri::command]
fn lan_external_ip() -> Result<String, String> {
    lanplay::external_ip()
}

#[tauri::command]
fn lan_check_port(host: String, port: u16) -> Result<bool, String> {
    // Сначала TCP, затем, если молчит, — UDP (старые игры живут на UDP).
    lanplay::check_server(&host, port)
}

#[tauri::command]
fn check_server_cmd(address: String) -> Result<bool, String> {
    let addr = address.trim();
    let port = addr.rsplit_once(':').map(|(_, p)| p.parse::<u16>());
    match port {
        Some(Ok(port)) => lanplay::check_server(addr.split(':').next().unwrap_or(addr), port),
        _ => Err("Некорректный адрес сервера (формат адрес:порт)".to_string()),
    }
}

#[tauri::command]
fn lobby_start(app: tauri::AppHandle, nick: String) {
    lobby::start(app, nick);
}

#[tauri::command]
fn lobby_create(
    nick: String,
    name: String,
    game_id: String,
    game_name: String,
    port: u16,
    slots: u16,
) -> Result<lobby::Room, String> {
    lobby::create(nick, name, game_id, game_name, port, slots)
}

#[tauri::command]
fn lobby_stop() {
    lobby::stop();
}

#[tauri::command]
fn lobby_current() -> Option<lobby::Room> {
    lobby::current()
}

#[tauri::command]
fn chat_host(app: tauri::AppHandle, port: u16, nick: String, slots: u16) -> Result<(), String> {
    chat::host(app, port, nick, slots)
}

#[tauri::command]
fn chat_join(
    app: tauri::AppHandle,
    host: String,
    port: u16,
    nick: String,
) -> Result<(), String> {
    chat::join(app, &host, port, nick)
}

#[tauri::command]
fn chat_send(app: tauri::AppHandle, text: String) -> Result<(), String> {
    chat::send(app, &text)
}

#[tauri::command]
fn chat_ready(app: tauri::AppHandle, ready: bool) -> Result<(), String> {
    chat::set_ready(app, ready)
}

#[tauri::command]
fn chat_start(app: tauri::AppHandle, game_id: String) {
    chat::start(app, game_id);
}

#[tauri::command]
fn chat_lock(app: tauri::AppHandle, locked: bool) {
    chat::set_locked(app, locked);
}

#[tauri::command]
fn chat_reset() {
    chat::reset();
}

#[tauri::command]
fn open_data_dir() -> Result<(), String> {
    let dir = dirs::data_local_dir()
        .unwrap_or_default()
        .join("game-launcher");
    let _ = std::fs::create_dir_all(&dir);
    open::that(&dir).map_err(|e| format!("Не удалось открыть папку: {}", e))
}

#[tauri::command]
async fn export_backup() -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let prefs = storage::export_prefs()?;
        let settings = settings::export_settings()?;
        let payload = serde_json::json!({
            "app": "game-launcher",
            "version": 1,
            "prefs": serde_json::from_str::<serde_json::Value>(&prefs).map_err(|e| e.to_string())?,
            "settings": serde_json::from_str::<serde_json::Value>(&settings).map_err(|e| e.to_string())?,
        });
        let picked = tauri::api::dialog::blocking::FileDialogBuilder::new()
            .add_filter("Резервная копия", &["json"])
            .set_title("Сохранение резервной копии")
            .set_file_name("game-launcher-backup.json")
            .save_file();
        let path = picked.ok_or_else(|| "Отменено".to_string())?;
        std::fs::write(&path, serde_json::to_string_pretty(&payload).map_err(|e| e.to_string())?)
            .map_err(|e| format!("Не удалось сохранить: {}", e))?;
        Ok(path.to_string_lossy().to_string())
    })
    .await
    .map_err(|e| format!("Ошибка: {}", e))?
}

#[tauri::command]
async fn import_backup() -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let picked = tauri::api::dialog::blocking::FileDialogBuilder::new()
            .add_filter("Резервная копия", &["json"])
            .set_title("Загрузка резервной копии")
            .pick_file();
        let path = picked.ok_or_else(|| "Отменено".to_string())?;
        let text = std::fs::read_to_string(&path).map_err(|e| format!("Не удалось прочитать: {}", e))?;
        let value: serde_json::Value =
            serde_json::from_str(&text).map_err(|_| "Неверный файл резервной копии".to_string())?;
        let prefs = value
            .get("prefs")
            .and_then(|v| serde_json::to_string(v).ok())
            .ok_or_else(|| "В файле нет раздела вложений".to_string())?;
        let settings = value
            .get("settings")
            .and_then(|v| serde_json::to_string(v).ok())
            .ok_or_else(|| "В файле нет раздела настроек".to_string())?;
        storage::import_prefs(&prefs)?;
        settings::import_settings(&settings)?;
        Ok("Импорт выполнен. Перезапустите лаунчер.".to_string())
    })
    .await
    .map_err(|e| format!("Ошибка: {}", e))?
}

#[tauri::command]
fn quit_app(app: tauri::AppHandle) {
    app.exit(0);
}

#[tauri::command]
fn check_update() -> String {
    let current = env!("CARGO_PKG_VERSION");
    const MANIFEST_URL: &str = ""; // например: "https://example.com/game-launcher/latest.json"
    if MANIFEST_URL.is_empty() {
        return "Сервер обновлений не настроен. Текущая версия: {current}. Скачивайте новые версии вручную.".replace("{current}", current);
    }
    let body = match reqwest::blocking::get(MANIFEST_URL) {
        Ok(resp) if resp.status().is_success() => match resp.text() {
            Ok(t) => t,
            Err(_) => "Не удалось прочитать ответ сервера.".to_string(),
        },
        Ok(_) => "Сервер обновлений недоступен.".to_string(),
        Err(_) => "Нет соединения с сервером обновлений.".to_string(),
    };
    let latest = body.trim().trim_matches('"').to_string();
    if latest.is_empty() || latest == current {
        format!("Установлена последняя версия ({current}).")
    } else {
        format!("Доступна версия {latest}. Текущая: {current}.")
    }
}

#[tauri::command]
fn toggle_favorite(id: String) -> Result<bool, String> {
    storage::toggle_favorite(&id)
}

#[tauri::command]
fn record_launch(id: String) -> Result<(), String> {
    storage::record_launch(&id)?;
    // Автоматически копим XP и монеты за реальные запуски игры.
    let _ = gamification::record_launch("local_player", 0);
    Ok(())
}

#[tauri::command]
fn get_launch_args(app_id: String) -> String {
    storage::launch_args_for(&app_id)
}

#[tauri::command]
fn set_launch_args(app_id: String, args: String) -> Result<(), String> {
    storage::set_launch_args(&app_id, &args)
}

#[tauri::command]
fn get_steam_stats() -> HashMap<String, steam_stats::SteamStat> {
    steam_stats::load_stats()
}

#[tauri::command]
fn get_hero(app_id: String) -> Result<String, String> {
    match app_id.parse::<u32>() {
        Ok(id) => cache::download_hero(id),
        Err(_) => Err("Арт недоступен".to_string()),
    }
}

#[tauri::command]
fn saves_list(app_id: String) -> Result<Vec<saves::SaveEntry>, String> {
    saves::list_saves(&app_id)
}

#[tauri::command]
fn saves_create(app_id: String, comment: Option<String>) -> Result<saves::SaveEntry, String> {
    saves::create_backup(&app_id, comment)
}

#[tauri::command]
fn saves_restore(app_id: String, save_name: String) -> Result<(), String> {
    saves::restore_backup(&save_name, &app_id)
}

#[tauri::command]
fn settings_get() -> settings::AppSettings {
    settings::load_settings()
}

#[tauri::command]
fn settings_save(app: tauri::AppHandle, s: settings::AppSettings) -> Result<(), String> {
    settings::save_settings(&s)?;
    if !s.curtain_enabled {
        curtain_hide(&app);
    }
    Ok(())
}

#[tauri::command]
fn autostart_get() -> bool {
    settings::autostart_enabled()
}

#[tauri::command]
fn autostart_set(enabled: bool) -> Result<(), String> {
    settings::set_autostart(enabled)
}

fn eula_now() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

#[tauri::command]
fn eula_accept(version: String, telemetry: bool) -> Result<(), String> {
    let mut s = settings::load_settings();
    s.eula_accepted = true;
    s.eula_version = version.clone();
    s.eula_decided_at = eula_now();
    s.telemetry_enabled = telemetry;
    settings::save_settings(&s)?;
    audit::append(
        "eula_accepted",
        "user",
        &format!("version={} telemetry={}", version, telemetry),
    );
    Ok(())
}

#[tauri::command]
fn eula_decline() -> Result<(), String> {
    let mut s = settings::load_settings();
    s.eula_accepted = false;
    s.eula_decided_at = eula_now();
    s.telemetry_enabled = false;
    settings::save_settings(&s)?;
    audit::append("eula_declined", "user", "telemetry off");
    Ok(())
}

#[tauri::command]
fn optimize_preview() -> optimizer::Plan {
    optimizer::plan()
}

#[tauri::command]
fn optimize_now() -> Result<String, String> {
    optimizer::optimize()
}

#[tauri::command]
fn restore_system() -> Result<String, String> {
    optimizer::restore()
}

#[tauri::command]
fn memory_stats() -> optimizer::MemoryInfo {
    optimizer::memory_info()
}

#[tauri::command]
fn pause_torrents_cmd(pause: bool) -> Result<(), String> {
    system::pause_torrents(pause)
}

#[tauri::command]
fn toggle_focus_mode_cmd(enable: bool) -> Result<(), String> {
    system::toggle_focus_mode(enable)
}

#[tauri::command]
fn log_session_end_cmd(game_name: String, duration_mins: u32) -> Result<(), String> {
    system::log_session_end(&game_name, duration_mins)
}

#[tauri::command]
fn scan_screenshots_cmd(game_name: String) -> Vec<tools::Screenshot> {
    tools::scan_screenshots(&game_name)
}

#[tauri::command]
fn export_library_cmd() -> Result<String, String> {
    let games = platforms::scan_all_games();
    tools::export_library(&games)
}

#[tauri::command]
fn gam_get_player(user_id: String) -> gamification::PlayerStats {
    gamification::get_player(&user_id)
}

#[tauri::command]
fn gam_record_launch(user_id: String, duration_mins: u32) -> gamification::PlayerStats {
    gamification::record_launch(&user_id, duration_mins)
}

#[tauri::command]
fn gam_get_quests(user_id: String) -> Vec<gamification::Quest> {
    gamification::get_quests(&user_id)
}

#[tauri::command]
fn gam_complete_quest(user_id: String, quest_id: String) -> Result<gamification::PlayerStats, String> {
    gamification::complete_quest(&user_id, &quest_id)
}

#[tauri::command]
fn gam_leaderboard(nicknames: std::collections::HashMap<String, String>) -> Vec<gamification::LeaderboardEntry> {
    gamification::get_leaderboard(&nicknames)
}

#[tauri::command]
fn gam_set_title(user_id: String, title: String) -> Result<gamification::PlayerStats, String> {
    gamification::set_active_title(&user_id, &title)
}

#[tauri::command]
fn gam_spend_coins(user_id: String, amount: u32) -> Result<gamification::PlayerStats, String> {
    gamification::spend_coins(&user_id, amount)
}

#[tauri::command]
fn get_news_cmd(appid: u32, limit: usize) -> Vec<content::NewsItem> {
    content::get_news(appid, limit)
}

#[tauri::command]
fn submit_review_cmd(
    id: String,
    game: String,
    author: String,
    rating: u8,
    title: String,
    text: String,
) -> content::Review {
    content::review(id, game, author, rating, title, text)
}

#[tauri::command]
fn tournament_create(
    name: String,
    game: String,
    format: String,
    max_participants: usize,
    created_by: String,
) -> Result<server::Tournament, String> {
    server::create_tournament(name, game, format, max_participants, created_by)
}

#[tauri::command]
fn tournament_list() -> Vec<server::Tournament> {
    server::get_tournaments()
}

#[tauri::command]
fn tournament_join(id: String, user_id: String) -> Result<server::Tournament, String> {
    server::join_tournament(id, user_id)
}

#[tauri::command]
fn tournament_close(id: String, owner: String) -> Result<server::Tournament, String> {
    server::close_tournament(id, owner)
}

#[tauri::command]
fn get_activity() -> Vec<storage::LaunchEvent> {
    storage::load_activity()
}

#[tauri::command]
fn take_crash_notice() -> Option<saves::CrashNotice> {
    saves::take_crash()
}

#[tauri::command]
fn export_wrapped(png: Vec<u8>) -> Result<String, String> {
    if png.is_empty() {
        return Err("Пустое изображение".to_string());
    }
    let dir = dirs::picture_dir()
        .or_else(|| dirs::home_dir().map(|home| home.join("Pictures")))
        .unwrap_or_else(|| dirs::data_local_dir().unwrap_or_default())
        .join("Igrolit");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let name = format!(
        "wrapped-{}.png",
        chrono::Local::now().format("%Y-%m-%d_%H-%M-%S")
    );
    let path = dir.join(name);
    std::fs::write(&path, png).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
fn curtain_open(app: tauri::AppHandle) {
    curtain_show(&app);
}

#[tauri::command]
fn curtain_close(app: tauri::AppHandle) {
    curtain_hide(&app);
}

#[tauri::command]
fn curtain_set_enabled(app: tauri::AppHandle, enabled: bool) -> Result<(), String> {
    let mut s = settings::load_settings();
    s.curtain_enabled = enabled;
    settings::save_settings(&s)?;
    if !enabled {
        curtain_hide(&app);
    }
    Ok(())
}

#[tauri::command]
fn open_main(app: tauri::AppHandle) {
    show_main(&app);
}

#[tauri::command]
fn palette_open(app: tauri::AppHandle) {
    palette_show(&app);
}

#[tauri::command]
fn palette_close(app: tauri::AppHandle) {
    palette_hide(&app);
}

fn palette_show(handle: &tauri::AppHandle) {
    use tauri::Manager;

    let Some(win) = handle.get_window("palette") else {
        return;
    };

    let monitor = match win.current_monitor() {
        Ok(Some(m)) => Some(m),
        _ => win.primary_monitor().ok().flatten(),
    };
    let Some(monitor) = monitor else { return };

    let origin = monitor.position();
    let screen_w = monitor.size().width as i32;
    let screen_h = monitor.size().height as i32;

    let w: i32 = 640;
    let h: i32 = 460;

    let x = origin.x + (screen_w - w) / 2;
    let y = origin.y + (screen_h as f32 * 0.22).round() as i32;

    let _ = win.set_size(tauri::PhysicalSize::new(w as u32, h as u32));
    let _ = win.set_position(tauri::PhysicalPosition::new(x, y));
    let _ = win.set_always_on_top(true);
    let _ = win.show();
    let _ = win.set_focus();
    if let Ok(mut slot) = PALETTE_SHOWN_AT.lock() {
        *slot = Some(Instant::now());
    }
}

fn palette_hide(handle: &tauri::AppHandle) {
    use tauri::Manager;
    if let Some(win) = handle.get_window("palette") {
        let _ = win.hide();
    }
}

fn palette_toggle(handle: &tauri::AppHandle) {
    use tauri::Manager;
    let visible = handle
        .get_window("palette")
        .and_then(|win| win.is_visible().ok())
        .unwrap_or(false);
    if visible {
        palette_hide(handle);
    } else {
        palette_show(handle);
    }
}

fn show_main(handle: &tauri::AppHandle) {
    use tauri::Manager;
    if let Some(window) = handle.get_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn curtain_show(handle: &tauri::AppHandle) {
    use tauri::Manager;
    let s = settings::load_settings();
    if !s.curtain_enabled {
        return;
    }

    let Some(win) = handle.get_window("curtain") else {
        return;
    };

    let monitor = match win.current_monitor() {
        Ok(Some(m)) => Some(m),
        _ => win.primary_monitor().ok().flatten(),
    };
    let Some(monitor) = monitor else { return };

    let origin = monitor.position();
    let screen_w = monitor.size().width as i32;
    let screen_h = monitor.size().height as i32;

    let w: i32 = 360;
    let h: i32 = 640;
    let _ = win.hide();
    let _ = win.set_size(tauri::PhysicalSize::new(w as u32, h as u32));
    let _ = win.set_always_on_top(true);

    let margin = 12;
    let y = origin.y + (screen_h - h) / 2;
    let (start_x, end_x) = if s.curtain_edge == "left" {
        (origin.x - w, origin.x + margin)
    } else {
        (origin.x + screen_w, origin.x + screen_w - w - margin)
    };

    let _ = win.set_position(tauri::PhysicalPosition::new(start_x, y));
    let _ = win.show();
    let _ = win.set_focus();
    if let Ok(mut slot) = CURTAIN_SHOWN_AT.lock() {
        *slot = Some(Instant::now());
    }

    let steps: i32 = 20;
    let total_ms = s.anim_ms.clamp(80, 1200) as i32;
    let delay = std::time::Duration::from_millis((total_ms / steps).max(4) as u64);

    std::thread::spawn(move || {
        for i in 1..=steps {
            let t = i as f32 / steps as f32;
            let eased = 1.0 - (1.0 - t) * (1.0 - t);
            let x = start_x + ((end_x - start_x) as f32 * eased).round() as i32;
            if win
                .set_position(tauri::PhysicalPosition::new(x, y))
                .is_err()
            {
                break;
            }
            std::thread::sleep(delay);
        }
    });
}

fn curtain_hide(handle: &tauri::AppHandle) {
    use tauri::Manager;
    if let Some(win) = handle.get_window("curtain") {
        let _ = win.hide();
    }
}

#[cfg(windows)]
#[link(name = "user32")]
extern "system" {
    fn GetAsyncKeyState(vk: i32) -> i16;
    fn GetForegroundWindow() -> *mut core::ffi::c_void;
    fn ShowWindow(hwnd: *mut core::ffi::c_void, cmd: i32) -> i32;
    fn OpenClipboard(hwnd: *mut core::ffi::c_void) -> i32;
    fn EmptyClipboard() -> i32;
    fn CloseClipboard() -> i32;
}

#[cfg(windows)]
fn parse_hotkey(spec: &str) -> Option<(u32, u32)> {
    let mut mods = 0u32;
    let mut key: Option<u32> = None;

    for part in spec.split('+') {
        let p = part.trim();
        if p.is_empty() {
            continue;
        }
        if p.eq_ignore_ascii_case("ctrl") {
            mods |= 0x0002;
        } else if p.eq_ignore_ascii_case("shift") {
            mods |= 0x0004;
        } else if p.eq_ignore_ascii_case("alt") {
            mods |= 0x0001;
        } else if p.eq_ignore_ascii_case("win") {
            mods |= 0x0008;
        } else if let Some(ch) = p.chars().next() {
            key = Some(ch.to_ascii_uppercase() as u32);
        }
    }

    key.map(|k| (mods, k))
}

#[cfg(windows)]
fn clear_recent_docs() {
    if let Some(appdata) = dirs::data_dir() {
        let recent = appdata.join("Microsoft").join("Windows").join("Recent");
        if let Ok(entries) = std::fs::read_dir(&recent) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_file() {
                    let _ = std::fs::remove_file(path);
                }
            }
        }
    }
}

#[cfg(windows)]
fn launch_mask_app(name: &str) {
    let (cmd, args): (&str, &[&str]) = match name {
        "Excel" => ("excel", &[]),
        "Word" => ("winword", &[]),
        "VS Code" => ("code", &[]),
        "1C" => ("1cv8", &[]),
        _ => ("notepad", &[]),
    };
    let _ = std::process::Command::new(cmd).args(args).spawn().or_else(|_| {
        std::process::Command::new("notepad").spawn()
    });
}

#[cfg(windows)]
fn stealth_trigger() {
    let s = settings::load_settings();

    if let Some(dir) = dirs::data_local_dir() {
        let dir = dir.join("game-launcher");
        let _ = std::fs::create_dir_all(&dir);
        let log = dir.join("stealth.log");
        if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(&log) {
            use std::io::Write;
            let _ = writeln!(
                f,
                "{} trigger mask={} clip={}",
                chrono::Local::now().format("%H:%M:%S"),
                s.mask_app,
                s.clear_clipboard
            );
        }
    }

    if s.clear_clipboard {
        unsafe {
            if OpenClipboard(std::ptr::null_mut()) != 0 {
                let _ = EmptyClipboard();
                let _ = CloseClipboard();
            }
        }
    }

    if s.clear_recent_docs {
        clear_recent_docs();
    }

    unsafe {
        let fg = GetForegroundWindow();
        if !fg.is_null() {
            let _ = ShowWindow(fg, 6);
        }
    }

    launch_mask_app(&s.mask_app);
}

#[cfg(windows)]
fn key_down(vk: i32) -> bool {
    unsafe { (GetAsyncKeyState(vk) as u16 & 0x8000) != 0 }
}

#[cfg(windows)]
fn start_boss_key() {
    std::thread::spawn(move || {
        let mut mods = 0x0002u32 | 0x0004;
        let mut vk = 'X' as u32;
        let mut was_down = false;
        let mut tick: u32 = 0;

        loop {
            std::thread::sleep(std::time::Duration::from_millis(50));
            tick = tick.wrapping_add(1);

            if tick.is_multiple_of(33) {
                let s = settings::load_settings();
                if let Some((m, k)) = parse_hotkey(&s.boss_key) {
                    mods = m;
                    vk = k;
                }
            }

            let pressed = key_down(vk as i32);
            let mods_ok = (mods & 0x0001 == 0 || key_down(0x12))
                && (mods & 0x0002 == 0 || key_down(0x11))
                && (mods & 0x0004 == 0 || key_down(0x10))
                && (mods & 0x0008 == 0 || key_down(0x5B));

            if pressed && mods_ok && !was_down {
                stealth_trigger();
            }
            was_down = pressed;
        }
    });
}

#[cfg(windows)]
fn start_palette_key(app: tauri::AppHandle) {
    std::thread::spawn(move || {
        let mut was_down = false;

        loop {
            std::thread::sleep(std::time::Duration::from_millis(40));

            let pressed = key_down(0x11) && key_down(0x20);
            if pressed && !was_down {
                palette_toggle(&app);
            }
            was_down = pressed;
        }
    });
}

#[cfg(windows)]
fn start_overlay_key(app: tauri::AppHandle) {
    std::thread::spawn(move || {
        use tauri::Manager;

        let mut was_down = false;
        let mut enabled = false;
        let mut tick: u32 = 0;

        loop {
            std::thread::sleep(std::time::Duration::from_millis(50));
            tick = tick.wrapping_add(1);

            if tick.is_multiple_of(20) {
                enabled = settings::load_settings().overlay_shift_tab;
            }

            let pressed = enabled && key_down(0x10) && key_down(0x09);
            if pressed && !was_down {
                if let Some(win) = app.get_window("curtain") {
                    let visible = win.is_visible().unwrap_or(false);
                    if visible {
                        let _ = win.hide();
                    } else {
                        curtain_show(&app);
                    }
                }
            }
            was_down = pressed;
        }
    });
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            #[cfg(windows)]
            {
                use tauri::Manager;
                if let Some(window) = app.get_window("main") {
                    apply_dark_titlebar(&window);
                }
            }

            optimizer::restore_on_startup();

            let open = tauri::CustomMenuItem::new("open".to_string(), "Открыть Igrolit");
            let curtain = tauri::CustomMenuItem::new("curtain".to_string(), "Открыть шторку");
            let quit = tauri::CustomMenuItem::new("quit".to_string(), "Выход");
            let menu = tauri::SystemTrayMenu::new()
                .add_item(open)
                .add_item(curtain)
                .add_item(quit);

            let handle = app.handle();
            let mut tray = tauri::SystemTray::new()
                .with_menu(menu)
                .with_tooltip("Igrolit")
                .on_event(move |event| match event {
                    tauri::SystemTrayEvent::LeftClick { .. } => show_main(&handle),
                    tauri::SystemTrayEvent::MenuItemClick { id, .. } => {
                        match id.as_str() {
                            "open" => show_main(&handle),
                            "curtain" => curtain_show(&handle),
                            "quit" => handle.exit(0),
                            _ => {}
                        }
                    }
                    _ => {}
                });

            tray = tray.with_icon(tauri::Icon::Raw(
                include_bytes!("../icons/32x32.png").to_vec(),
            ));

            tray.build(app)?;

            {
                use tauri::Manager;
                if let Some(curtain) = app.get_window("curtain") {
                    let handle = app.handle();
                    curtain.on_window_event(move |event| {
                        if let tauri::WindowEvent::Focused(false) = event {
                            let s = settings::load_settings();
                            if s.hide_outside {
                                let fresh = CURTAIN_SHOWN_AT
                                    .lock()
                                    .ok()
                                    .and_then(|slot| *slot)
                                    .map(|t| t.elapsed() < std::time::Duration::from_millis(700))
                                    .unwrap_or(false);
                                if !fresh {
                                    if let Some(win) = handle.get_window("curtain") {
                                        let _ = win.hide();
                                    }
                                }
                            }
                        }
                    });
                }
            }

            {
                use tauri::Manager;
                if let Some(palette) = app.get_window("palette") {
                    let handle = app.handle();
                    palette.on_window_event(move |event| {
                        if let tauri::WindowEvent::Focused(false) = event {
                            let fresh = PALETTE_SHOWN_AT
                                .lock()
                                .ok()
                                .and_then(|slot| *slot)
                                .map(|t| t.elapsed() < std::time::Duration::from_millis(450))
                                .unwrap_or(false);
                            if !fresh {
                                if let Some(win) = handle.get_window("palette") {
                                    let _ = win.hide();
                                }
                            }
                        }
                    });
                }
            }

            #[cfg(windows)]
            start_corner_watch(app.handle().clone());

            #[cfg(windows)]
            start_boss_key();

            #[cfg(windows)]
            start_palette_key(app.handle().clone());
            start_overlay_key(app.handle().clone());

            Ok(())
        })
        .on_window_event(|event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event.event() {
                api.prevent_close();
                let _ = event.window().hide();
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_games,
            launch_game,
            get_cover,
            fetch_image,
            dev_default_data_path,
            dev_read_log,
            dev_project_path,
            dev_server_status,
            dev_server_start,
            dev_server_stop,
            dev_http_text,
            app_status,
            log_crash,
            dev_data_info,
            dev_backup_data,
            dev_list_backups,
            dev_restore_data,
            app_channel,
            app_version,
            release_publish,
            update_check,
            update_apply,
            find_cover,
            set_custom_cover_file,
            add_custom_game,
            remove_custom_game,
            get_prefs,
            toggle_favorite,
            record_launch,
            get_launch_args,
            set_launch_args,
            get_steam_stats,
            get_hero,
            open_steam,
            validate_game,
            deps_status,
            online_session_get,
            online_session_save,
            read_avatar_file,
            read_preset_avatar,
            online_session_clear,
            clear_local_data,
            online_status,
            friends_open,
            open_url,
            zerotier_status,
            zerotier_join,
            zerotier_leave,
            get_retro_games,
            add_retro_game_cmd,
            launch_retro_game_cmd,
            launch_retro_connect,
            import_retro_saves,
            choose_retro_exe,
            get_retro_save_dir,
            lan_local_ips,
            lan_external_ip,
            lan_check_port,
            lobby_start,
            lobby_create,
            lobby_stop,
            lobby_current,
            chat_host,
            chat_join,
            chat_send,
            chat_ready,
            chat_start,
            chat_lock,
            chat_reset,
            update_retro_game_cmd,
            delete_retro_game_cmd,
            list_retro_servers,
            add_retro_server_cmd,
            delete_retro_server_cmd,
            check_server_cmd,
            set_compat_layer_cmd,
            clear_compat_layer_cmd,
            launch_retro_compat_cmd,
            open_data_dir,
            quit_app,
            begin_resize,
            check_update,
            export_backup,
            import_backup,
            saves_list,
            saves_create,
            saves_restore,
            settings_get,
            settings_save,
            autostart_get,
            autostart_set,
            eula_accept,
            eula_decline,
            optimize_preview,
            optimize_now,
            restore_system,
            memory_stats,
            get_activity,
            take_crash_notice,
            export_wrapped,
            pause_torrents_cmd,
            toggle_focus_mode_cmd,
            log_session_end_cmd,
            scan_screenshots_cmd,
            export_library_cmd,
            gam_get_player,
            gam_record_launch,
            gam_get_quests,
            gam_complete_quest,
            gam_leaderboard,
            gam_set_title,
            gam_spend_coins,
            get_news_cmd,
            submit_review_cmd,
            tournament_create,
            tournament_list,
            tournament_join,
            tournament_close,
            curtain_open,
            curtain_close,
            updates::verify_update_cmd,
            audit::verify_chain,
            audit::get_recent_logs,
            curtain_set_enabled,
            open_main,
            palette_open,
            palette_close
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod update_tests {
    #[test]
    fn rejects_junk_signature() {
        assert!(!crate::verify_update(b"payload", "zzzz"));
    }

    #[test]
    fn rejects_wrong_length_signature() {
        assert!(!crate::verify_update(b"payload", "00"));
    }

    #[test]
    fn rejects_valid_hex_but_wrong_signature() {
        let forged = "11".repeat(64);
        assert!(!crate::verify_update(b"payload", &forged));
    }
}
