use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::process::Command;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RetroGame {
    pub id: String,
    pub name: String,
    pub executables: Vec<String>,
    pub default_paths: Vec<String>,
    pub save_dir: String,
    pub launch_args: String,
    pub description: String,
    pub category: String,
    #[serde(default)]
    pub installed: bool,
}

const GAMES_JSON: &str = include_str!("../classic_games.json");

pub fn classic_games() -> Vec<RetroGame> {
    serde_json::from_str(GAMES_JSON).unwrap_or_default()
}

fn custom_games_path() -> PathBuf {
    let dir = dirs::data_local_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("game-launcher");
    let _ = std::fs::create_dir_all(&dir);
    dir.join("custom_games.json")
}

pub fn custom_games() -> Vec<RetroGame> {
    let Ok(text) = std::fs::read_to_string(custom_games_path()) else {
        return Vec::new();
    };
    serde_json::from_str(&text).unwrap_or_default()
}

pub fn save_custom_games(games: &[RetroGame]) -> Result<(), String> {
    let json = serde_json::to_string_pretty(games).map_err(|e| e.to_string())?;
    let path = custom_games_path();
    let tmp = path.with_file_name("custom_games.json.tmp");
    std::fs::write(&tmp, json).map_err(|e| e.to_string())?;
    if path.exists() {
        let _ = std::fs::remove_file(&path);
    }
    std::fs::rename(&tmp, &path).map_err(|e| e.to_string())
}

pub fn all_games() -> Vec<RetroGame> {
    let mut all = classic_games();
    all.extend(custom_games());
    for game in &mut all {
        game.installed = resolve_exe(&game.id, game).is_some();
    }
    all
}

/// Для пользовательских игр (custom-*) возвращает путь к exe из сохранённого retro_path,
/// иначе None. Используется, чтобы понять, установлена ли обычная пользовательская игра.
pub fn custom_exe_path(game_id: &str) -> Option<PathBuf> {
    crate::storage::retro_path(game_id).and_then(|p| {
        let path = PathBuf::from(&p);
        if path.exists() {
            Some(path)
        } else {
            None
        }
    })
}

pub fn add_custom(name: &str, exe_path: &str, category: &str) -> Result<RetroGame, String> {
    let trimmed_name = name.trim();
    let trimmed_exe = exe_path.trim();
    if trimmed_name.is_empty() {
        return Err("Укажите название игры".to_string());
    }
    if trimmed_exe.is_empty() {
        return Err("Укажите путь к игре".to_string());
    }
    let path = std::path::Path::new(trimmed_exe);
    if !path.is_file() {
        return Err("Файл не найден по этому пути".to_string());
    }

    let id = format!(
        "custom-{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0)
    );
    let trim_cat = category.trim();
    let valid_category = if trim_cat.is_empty() { "Свои".to_string() } else { trim_cat.to_string() };
    let game = RetroGame {
        id,
        name: trimmed_name.to_string(),
        executables: vec![path
            .file_name()
            .map(|f| f.to_string_lossy().to_string())
            .unwrap_or_else(|| "game.exe".to_string())],
        default_paths: vec![path
            .parent()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_default()],
        save_dir: String::new(),
        launch_args: String::new(),
        description: "Добавлена вручную".to_string(),
        category: valid_category,
        installed: true,
    };

let mut all = custom_games();
    all.push(game.clone());
    save_custom_games(&all)?;
    Ok(game)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerEntry {
    pub id: String,
    pub name: String,
    pub address: String,
}

fn servers_path() -> PathBuf {
    let dir = dirs::data_local_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("game-launcher");
    let _ = std::fs::create_dir_all(&dir);
    dir.join("servers.json")
}

pub fn list_servers() -> Vec<ServerEntry> {
    let Ok(text) = std::fs::read_to_string(servers_path()) else {
        return Vec::new();
    };
    serde_json::from_str(&text).unwrap_or_default()
}

fn save_servers(servers: &[ServerEntry]) -> Result<(), String> {
    let json = serde_json::to_string_pretty(servers).map_err(|e| e.to_string())?;
    let path = servers_path();
    let tmp = path.with_file_name("servers.json.tmp");
    std::fs::write(&tmp, json).map_err(|e| e.to_string())?;
    if path.exists() {
        let _ = std::fs::remove_file(&path);
    }
    std::fs::rename(&tmp, &path).map_err(|e| e.to_string())
}

pub fn add_server(name: &str, address: &str) -> Result<ServerEntry, String> {
    let trimmed_name = name.trim();
    let trimmed_addr = address.trim();
    if trimmed_name.is_empty() {
        return Err("Укажите название сервера".to_string());
    }
    if trimmed_addr.is_empty() {
        return Err("Укажите адрес сервера".to_string());
    }
    let id = format!(
        "srv-{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0)
    );
    let entry = ServerEntry {
        id,
        name: trimmed_name.to_string(),
        address: trimmed_addr.to_string(),
    };
    let mut all = list_servers();
    all.push(entry.clone());
    save_servers(&all)?;
    Ok(entry)
}

pub fn delete_server(id: &str) -> Result<(), String> {
    let mut all = list_servers();
    let before = all.len();
    all.retain(|s| s.id != id);
    if all.len() == before {
        return Err("Сервер не найден".to_string());
    }
    save_servers(&all)
}

pub fn is_custom(id: &str) -> bool {
    custom_games().iter().any(|g| g.id == id)
}

pub fn delete_custom(id: &str) -> Result<(), String> {
    let mut all = custom_games();
    let before = all.len();
    all.retain(|g| g.id != id);
    if all.len() == before {
        return Err("Игра не найдена".to_string());
    }
    let _ = crate::storage::set_retro_path(id, "");
    save_custom_games(&all)
}

pub fn update_custom(id: &str, name: &str, exe_path: &str, category: &str) -> Result<RetroGame, String> {
    let mut all = custom_games();
    let Some(game) = all.iter_mut().find(|g| g.id == id) else {
        return Err("Игра не найдена".to_string());
    };

    let trimmed_name = name.trim();
    if !trimmed_name.is_empty() {
        game.name = trimmed_name.to_string();
    }

    let trim_cat = category.trim();
    if !trim_cat.is_empty() {
        game.category = trim_cat.to_string();
    }

    let trimmed_exe = exe_path.trim();
    if !trimmed_exe.is_empty() {
        let path = std::path::Path::new(trimmed_exe);
        if !path.is_file() {
            return Err("Файл не найден по этому пути".to_string());
        }
        game.executables = vec![path
            .file_name()
            .map(|f| f.to_string_lossy().to_string())
            .unwrap_or_else(|| "game.exe".to_string())];
        game.default_paths = vec![path
            .parent()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_default()];
    }

    let updated = game.clone();
    save_custom_games(&all)?;
    Ok(updated)
}

fn expand(path: &str) -> PathBuf {
    let profile = std::env::var("USERPROFILE").unwrap_or_default();
    PathBuf::from(path.replace("%USERPROFILE%", &profile))
}

pub fn find_exe(game: &RetroGame) -> Option<PathBuf> {
    for raw in &game.default_paths {
        let dir = expand(raw);
        if !dir.exists() {
            continue;
        }
        for exe in &game.executables {
            let candidate = dir.join(exe);
            if candidate.exists() {
                return Some(candidate);
            }
        }
    }
    None
}

fn resolve_exe(game_id: &str, game: &RetroGame) -> Option<PathBuf> {
    if let Some(path) = crate::storage::retro_path(game_id) {
        let candidate = PathBuf::from(&path);
        if candidate.exists() {
            return Some(candidate);
        }
        let _ = crate::storage::set_retro_path(game_id, "");
    }
    find_exe(game)
}

pub fn launch(game_id: &str) -> Result<String, String> {
    let game = all_games()
        .into_iter()
        .find(|item| item.id == game_id)
        .ok_or_else(|| "Игра не найдена в базе".to_string())?;

    let exe = resolve_exe(game_id, &game)
        .ok_or_else(|| format!("Не удалось найти {}. Укажите путь вручную.", game.name))?;
    let working_dir = exe.parent().map(PathBuf::from).unwrap_or_default();
    let args: Vec<String> = game
        .launch_args
        .split_whitespace()
        .map(|part| part.to_string())
        .collect();

Command::new(&exe)
        .current_dir(&working_dir)
        .args(&args)
        .spawn()
        .map_err(|e| format!("Ошибка запуска: {}", e))?;

    Ok(format!("{} запущена", game.name))
}

fn compat_key() -> winreg::RegKey {
    use winreg::RegKey;
    RegKey::predef(winreg::enums::HKEY_CURRENT_USER)
        .open_subkey_with_flags(
            r"Software\Microsoft\Windows NT\CurrentVersion\AppCompatFlags\Layers",
            winreg::enums::KEY_WRITE | winreg::enums::KEY_READ,
        )
        .unwrap_or_else(|_| {
            use winreg::RegKey;
            RegKey::predef(winreg::enums::HKEY_CURRENT_USER)
                .create_subkey(
                    r"Software\Microsoft\Windows NT\CurrentVersion\AppCompatFlags\Layers",
                )
                .map(|(k, _)| k)
                .unwrap_or_else(|_| winreg::RegKey::predef(winreg::enums::HKEY_CURRENT_USER))
                .open_subkey_with_flags(
                    r"Software\Microsoft\Windows NT\CurrentVersion\AppCompatFlags\Layers",
                    winreg::enums::KEY_WRITE | winreg::enums::KEY_READ,
                )
                .unwrap_or_else(|_| winreg::RegKey::predef(winreg::enums::HKEY_CURRENT_USER))
        })
}

fn reset_compat(game_id: &str, exe: &std::path::Path) -> Result<(), String> {
    let key = compat_key();
    let _ = key.delete_value(exe.to_string_lossy().as_ref());
    let _ = crate::storage::set_retro_path(&format!("compat:{}", game_id), "");
    Ok(())
}

fn apply_compat(game_id: &str, exe: &std::path::Path, layer: &str) -> Result<(), String> {
    let key = compat_key();
    key.set_value(exe.to_string_lossy().as_ref(), &layer)
        .map_err(|e| format!("Не удалось задать режим совместимости: {}", e))?;
    crate::storage::set_retro_path(&format!("compat:{}", game_id), layer)
}

pub fn set_compat_layer(game_id: &str, layer: &str) -> Result<(), String> {
    let game = all_games()
        .into_iter()
        .find(|item| item.id == game_id)
        .ok_or_else(|| "Игра не найдена в базе".to_string())?;
    let exe = resolve_exe(game_id, &game)
        .ok_or_else(|| format!("Не удалось найти {}. Укажите путь вручную.", game.name))?;
    apply_compat(game_id, &exe, layer)
}

pub fn clear_compat_layer(game_id: &str) -> Result<(), String> {
    let game = all_games()
        .into_iter()
        .find(|item| item.id == game_id)
        .ok_or_else(|| "Игра не найдена в базе".to_string())?;
    let exe = resolve_exe(game_id, &game)
        .ok_or_else(|| format!("Не удалось найти {}. Укажите путь вручную.", game.name))?;
    reset_compat(game_id, &exe)
}

pub fn active_compat_layer(game_id: &str) -> String {
    crate::storage::retro_path(&format!("compat:{}", game_id)).unwrap_or_default()
}

pub struct CompatOptions {
    pub run_as_admin: bool,
    pub windowed_65560: bool,
    pub win_xp: bool,
    pub win98: bool,
}

pub fn launch_with_compat(game_id: &str, options: CompatOptions) -> Result<String, String> {
    let game = all_games()
        .into_iter()
        .find(|item| item.id == game_id)
        .ok_or_else(|| "Игра не найдена в базе".to_string())?;

    let exe = resolve_exe(game_id, &game)
        .ok_or_else(|| format!("Не удалось найти {}. Укажите путь вручную.", game.name))?;

    let compat = crate::storage::retro_path(&format!("compat:{}", game_id))
        .filter(|s| !s.is_empty());

    if let Some(layer) = compat {
        let _ = apply_compat(game_id, &exe, &layer);
    } else {
        // Заранее сбрасываем чистое состояние для этой игры.
        let key = compat_key();
        let _ = key.delete_value(exe.to_string_lossy().as_ref());
    }

    let working_dir = exe.parent().map(PathBuf::from).unwrap_or_default();
    let mut args: Vec<String> = game
        .launch_args
        .split_whitespace()
        .map(|part| part.to_string())
        .collect();

    if options.windowed_65560 {
        // Общий флаг оконного режима для многих старых игр.
        args.push("-windowed".to_string());
    }

    let mut cmd = Command::new(&exe);
    cmd.current_dir(&working_dir).args(&args);

    #[cfg(windows)]
    if options.run_as_admin {
        use std::os::windows::process::CommandExt;
        const CREATE_NEW_CONSOLE: u32 = 0x0000_0010;
        // Создаём с повышенными правами через runas.
        let mut elevated = Command::new(&exe);
        elevated
            .current_dir(&working_dir)
            .args(&args)
            .creation_flags(CREATE_NEW_CONSOLE);
        elevated
            .spawn()
            .map_err(|e| format!("Ошибка запуска с правами администратора: {}", e))?;
        return Ok(format!("{} запущена (администратор)", game.name));
    }

    cmd.spawn()
        .map_err(|e| format!("Ошибка запуска: {}", e))?;

    Ok(format!("{} запущена", game.name))
}

pub fn choose_exe(game_id: &str) -> Result<String, String> {
    let game = all_games()
        .into_iter()
        .find(|item| item.id == game_id)
        .ok_or_else(|| "Игра не найдена в базе".to_string())?;

    let title = format!("Выберите exe для «{}»", game.name);
    let picked = tauri::api::dialog::blocking::FileDialogBuilder::new()
        .set_title(&title)
        .add_filter("Программа", &["exe"])
        .pick_file();

    let path = picked.ok_or_else(|| "Файл не выбран".to_string())?;
    let path_str = path.to_string_lossy().to_string();
    crate::storage::set_retro_path(game_id, &path_str)?;
    Ok(path_str)
}

pub fn save_dir(game_id: &str) -> Result<String, String> {
    let game = all_games()
        .into_iter()
        .find(|item| item.id == game_id)
        .ok_or_else(|| "Игра не найдена".to_string())?;
    Ok(expand(&game.save_dir).to_string_lossy().to_string())
}

pub fn launch_connect(game_id: &str, address: &str) -> Result<String, String> {
    let game = all_games()
        .into_iter()
        .find(|item| item.id == game_id)
        .ok_or_else(|| "Игра не найдена в базе".to_string())?;

    if game.id != "counterstrike16" {
        return Err(format!(
            "{} не принимает адрес из лаунчера — подключитесь внутри игры",
            game.name
        ));
    }

    let address = address.trim();
    let valid = address
        .rsplit_once(':')
        .map(|(host, port)| !host.is_empty() && port.parse::<u16>().is_ok())
        .unwrap_or(false);
    if !valid {
        return Err("Формат адреса: адрес:порт".to_string());
    }

    let exe = resolve_exe(game_id, &game)
        .ok_or_else(|| format!("Не удалось найти {}. Укажите путь вручную.", game.name))?;
    let working_dir = exe.parent().map(PathBuf::from).unwrap_or_default();
    let mut args: Vec<String> = game
        .launch_args
        .split_whitespace()
        .map(|part| part.to_string())
        .collect();
    args.push("+connect".to_string());
    args.push(address.to_string());

    Command::new(&exe)
        .current_dir(&working_dir)
        .args(&args)
        .spawn()
        .map_err(|e| format!("Ошибка запуска: {}", e))?;

    Ok(format!("{} подключается к {}", game.name, address))
}

pub fn import_saves(game_id: &str) -> Result<String, String> {
    let game = all_games()
        .into_iter()
        .find(|item| item.id == game_id)
        .ok_or_else(|| "Игра не найдена в базе".to_string())?;

    let dir = expand(&game.save_dir);
    std::fs::create_dir_all(&dir).map_err(|e| format!("Не удалось создать папку сейвов: {}", e))?;

    let picked = tauri::api::dialog::blocking::FileDialogBuilder::new()
        .set_title("Выберите файлы сохранений")
        .pick_files();

    let files = match picked {
        Some(files) if !files.is_empty() => files,
        _ => return Err("Файлы не выбраны".to_string()),
    };

    let mut copied = 0usize;
    for source in files {
        let name = match source.file_name() {
            Some(name) => name.to_string_lossy().to_string(),
            None => continue,
        };

        let mut target = dir.join(&name);
        let mut counter = 2;
        while target.exists() {
            let stem = source
                .file_stem()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_else(|| name.clone());
            let ext = source
                .extension()
                .map(|e| format!(".{}", e.to_string_lossy()))
                .unwrap_or_default();
            target = dir.join(format!("{}-{}{}", stem, counter, ext));
            counter += 1;
        }

        std::fs::copy(&source, &target)
            .map_err(|e| format!("Не удалось скопировать {}: {}", name, e))?;
        copied += 1;
    }

    Ok(format!(
        "Добавлено сохранений: {} → {}",
        copied,
        dir.to_string_lossy()
    ))
}
