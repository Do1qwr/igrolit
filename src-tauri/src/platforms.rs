use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use winreg::RegKey;
use winreg::enums::*;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Game {
    pub id: String,
    pub name: String,
    pub platform: String,
    pub launch_cmd: String,
    #[serde(default)]
    pub size_bytes: u64,
    #[serde(default)]
    pub update_bytes: u64,
}

pub fn scan_all_games() -> Vec<Game> {
    let mut all_games = Vec::new();
    all_games.extend(scan_steam());
    all_games.extend(scan_epic());
    all_games.extend(scan_gog());
    all_games.extend(scan_custom());
    all_games.sort_by_key(|a| a.name.to_lowercase());
    all_games
}

/// Имя игры по её id (для логов сессий и статистики). Если неизвестно — None.
pub fn name_for_id(id: &str) -> Option<String> {
    scan_all_games()
        .into_iter()
        .find(|g| g.id == id || g.launch_cmd == id)
        .map(|g| g.name)
}

pub(crate) fn steam_install_path() -> PathBuf {
    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);

    let candidates = [
        hklm.open_subkey(r"SOFTWARE\WOW6432Node\Valve\Steam")
            .and_then(|k| k.get_value::<String, _>("InstallPath")),
        hklm.open_subkey(r"SOFTWARE\Valve\Steam")
            .and_then(|k| k.get_value::<String, _>("InstallPath")),
        hkcu.open_subkey(r"Software\Valve\Steam")
            .and_then(|k| k.get_value::<String, _>("SteamPath")),
    ];

    for p in candidates.into_iter().flatten() {
        let path = PathBuf::from(p);
        if path.exists() {
            return path;
        }
    }
    PathBuf::from(r"C:\Program Files (x86)\Steam")
}

const TOOL_APP_IDS: [u32; 8] = [
    228980, // Steamworks Common Redistributables
    1070560, // Steam Linux Runtime 1.0
    1391110, // Steam Linux Runtime 2.0
    1493710, // Proton Experimental
    2180100, // Proton Hotfix
    1628350, // Steam Linux Runtime 3.0
    1887720, // Proton 7.0
    1490450, // Proton 6.3
];

fn is_service_entry(app_id: u32, name: &str) -> bool {
    if TOOL_APP_IDS.contains(&app_id) {
        return true;
    }
    let n = name.to_lowercase();
    n.contains("common redistributable")
        || n.contains("steam linux runtime")
        || n.contains("proton")
        || n.contains("steamworks")
        || n.contains("steamvr")
        || n.contains("steam audio")
}

fn scan_steam_library(steamapps: &PathBuf, games: &mut Vec<Game>) {
    let entries = match fs::read_dir(steamapps) {
        Ok(e) => e,
        Err(_) => return,
    };

    for entry in entries.flatten() {
        let path = entry.path();
        let is_manifest = path
            .file_name()
            .and_then(|n| n.to_str())
            .map(|n| n.starts_with("appmanifest_") && n.ends_with(".acf"))
            .unwrap_or(false);
        if !is_manifest {
            continue;
        }
        let content = match fs::read_to_string(&path) {
            Ok(c) => c,
            Err(_) => continue,
        };
        let mut app_id = None;
        let mut name = None;
        let mut size_bytes = 0u64;
        let mut to_download = 0u64;
        let mut downloaded = 0u64;
        for line in content.lines() {
            let line = line.trim();
            if line.starts_with("\"appid\"") {
                if let Some(val) = line.split('"').nth(3) {
                    app_id = val.parse::<u32>().ok();
                }
            }
            if line.starts_with("\"name\"") {
                if let Some(val) = line.split('"').nth(3) {
                    name = Some(val.to_string());
                }
            }
            if line.starts_with("\"SizeOnDisk\"") {
                if let Some(val) = line.split('"').nth(3) {
                    size_bytes = val.trim().parse::<u64>().unwrap_or(0);
                }
            }
            if line.starts_with("\"BytesToDownload\"") {
                if let Some(val) = line.split('"').nth(3) {
                    to_download = val.trim().parse::<u64>().unwrap_or(0);
                }
            }
            if line.starts_with("\"BytesDownloaded\"") {
                if let Some(val) = line.split('"').nth(3) {
                    downloaded = val.trim().parse::<u64>().unwrap_or(0);
                }
            }
        }
        if let (Some(id), Some(n)) = (app_id, name) {
            if is_service_entry(id, &n) {
                continue;
            }
            games.push(Game {
                id: id.to_string(),
                name: n,
                platform: "Steam".to_string(),
                launch_cmd: format!("steam://rungameid/{}", id),
                size_bytes,
                update_bytes: to_download.saturating_sub(downloaded),
            });
        }
    }
}

fn scan_steam() -> Vec<Game> {
    let mut games = Vec::new();
    let steam_path = steam_install_path();
    let main_steamapps = steam_path.join("steamapps");
    if !main_steamapps.exists() {
        return games;
    }
    scan_steam_library(&main_steamapps, &mut games);

    // Дополнительные библиотеки из libraryfolders.vdf
    let vdf = main_steamapps.join("libraryfolders.vdf");
    if let Ok(content) = fs::read_to_string(&vdf) {
        for line in content.lines() {
            let line = line.trim();
            if !line.starts_with("\"path\"") {
                continue;
            }
            if let Some(val) = line.split('"').nth(3) {
                let lib_path = PathBuf::from(val.replace("\\\\", "\\"));
                let lib_steamapps = lib_path.join("steamapps");
                if lib_steamapps.exists() && lib_steamapps != main_steamapps {
                    scan_steam_library(&lib_steamapps, &mut games);
                }
            }
        }
    }

    games.sort_by(|a, b| a.id.cmp(&b.id));
    games.dedup_by(|a, b| a.id == b.id);
    games
}

fn scan_epic() -> Vec<Game> {
    let mut games = Vec::new();
    let epic_data = PathBuf::from(r"C:\ProgramData\Epic\UnrealEngineLauncher\LauncherInstalled.dat");
    if let Ok(content) = fs::read_to_string(&epic_data) {
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
            if let Some(arr) = json.get("InstallationList").and_then(|v| v.as_array()) {
                for item in arr {
                    if let (Some(app_name), Some(display_name)) = (
                        item.get("AppName").and_then(|v| v.as_str()),
                        item.get("DisplayName").and_then(|v| v.as_str()),
                    ) {
                        games.push(Game {
                            id: app_name.to_string(),
                            name: display_name.to_string(),
                            platform: "Epic".to_string(),
                            launch_cmd: format!(
                                "com.epicgames.launcher://apps/{}?action=launch&silent=true",
                                app_name
                            ),
                            size_bytes: 0,
                            update_bytes: 0,
                        });
                    }
                }
            }
        }
    }
    games
}

fn scan_gog() -> Vec<Game> {
    let mut games = Vec::new();
    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    if let Ok(gog_key) = hklm.open_subkey(r"SOFTWARE\WOW6432Node\GOG.com\Games") {
        for key_name in gog_key.enum_keys().filter_map(Result::ok) {
            if let Ok(subkey) = gog_key.open_subkey(&key_name) {
                if let (Ok(name), Ok(path)) = (
                    subkey.get_value::<String, _>("gameName"),
                    subkey.get_value::<String, _>("path"),
                ) {
                    let exe = find_exe_in(&PathBuf::from(&path));
                    games.push(Game {
                        id: key_name.clone(),
                        name,
                        platform: "GOG".to_string(),
                        launch_cmd: exe.unwrap_or(path),
                        size_bytes: 0,
                        update_bytes: 0,
                    });
                }
            }
        }
    }
    games
}

fn find_exe_in(dir: &PathBuf) -> Option<String> {
    let entries = fs::read_dir(dir).ok()?;
    let mut best: Option<(u64, String)> = None;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            continue;
        }
        let is_exe = path
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.eq_ignore_ascii_case("exe"))
            .unwrap_or(false);
        if !is_exe {
            continue;
        }
        let size = entry.metadata().map(|m| m.len()).unwrap_or(0);
        let path_str = path.to_string_lossy().to_string();
        if best.as_ref().map(|(s, _)| size > *s).unwrap_or(true) {
            best = Some((size, path_str));
        }
    }
    best.map(|(_, p)| p)
}

fn custom_file() -> PathBuf {
    let app_data = dirs::data_local_dir().unwrap_or_else(|| PathBuf::from("."));
    app_data.join("game-launcher").join("custom_games.json")
}

fn scan_custom() -> Vec<Game> {
    let file = custom_file();
    if !file.exists() {
        return Vec::new();
    }
    match fs::read_to_string(&file) {
        Ok(content) => match serde_json::from_str::<Vec<Game>>(&content) {
            Ok(games) => games,
            Err(_) => {
                let failed = file.with_file_name("custom_games.corrupt.json");
                let _ = fs::remove_file(&failed);
                let _ = fs::rename(&file, &failed);
                Vec::new()
            }
        },
        Err(_) => Vec::new(),
    }
}

fn write_json_atomic(path: &std::path::Path, json: &str) -> Result<(), String> {
    let tmp = path.with_file_name("custom_games.json.tmp");
    fs::write(&tmp, json).map_err(|e| e.to_string())?;
    if path.exists() {
        let _ = fs::remove_file(path);
    }
    fs::rename(&tmp, path).map_err(|e| e.to_string())
}

pub fn add_custom_game(name: String, path: String) -> Result<(), String> {
    let file = custom_file();
    let dir = file.parent().unwrap_or_else(|| std::path::Path::new("."));
    if !dir.exists() {
        fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let mut games = scan_custom();
    if games.iter().any(|g| g.launch_cmd.eq_ignore_ascii_case(&path)) {
        return Err("Эта игра уже добавлена".to_string());
    }
    games.push(Game {
        id: path.clone(),
        name,
        platform: "Custom".to_string(),
        launch_cmd: path,
        size_bytes: 0,
        update_bytes: 0,
    });
    let json = serde_json::to_string_pretty(&games).map_err(|e| e.to_string())?;
    write_json_atomic(&file, &json)
}

pub fn remove_custom_game(path: String) -> Result<(), String> {
    let file = custom_file();
    let mut games = scan_custom();
    let before = games.len();
    games.retain(|g| !g.launch_cmd.eq_ignore_ascii_case(&path));
    if games.len() == before {
        return Err("Игра не найдена".to_string());
    }
    let json = serde_json::to_string_pretty(&games).map_err(|e| e.to_string())?;
    write_json_atomic(&file, &json)
}

fn covers_file() -> PathBuf {
    let app_data = dirs::data_local_dir().unwrap_or_else(|| PathBuf::from("."));
    app_data.join("game-launcher").join("custom_covers.json")
}

fn read_covers() -> std::collections::HashMap<String, String> {
    match fs::read_to_string(covers_file()) {
        Ok(text) => serde_json::from_str(&text).unwrap_or_default(),
        Err(_) => std::collections::HashMap::new(),
    }
}

pub fn get_custom_cover(id: &str) -> Option<String> {
    read_covers().remove(id)
}

pub fn set_custom_cover(id: &str, cover: &str) -> Result<(), String> {
    let file = covers_file();
    if let Some(dir) = file.parent() {
        if !dir.exists() {
            fs::create_dir_all(dir).map_err(|e| e.to_string())?;
        }
    }
    let mut covers = read_covers();
    covers.insert(id.to_string(), cover.to_string());
    let json = serde_json::to_string_pretty(&covers).map_err(|e| e.to_string())?;
    let tmp = file.with_file_name("custom_covers.json.tmp");
    fs::write(&tmp, json).map_err(|e| e.to_string())?;
    if file.exists() {
        let _ = fs::remove_file(&file);
    }
    fs::rename(&tmp, &file).map_err(|e| e.to_string())
}
