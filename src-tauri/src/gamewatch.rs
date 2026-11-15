use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{Duration, Instant};

use winreg::enums::*;
use winreg::RegKey;

/// Имя исполняемого файла игры (без .exe), если его удалось определить.
pub fn resolve_exe(app_id: &str, launch_cmd: &str) -> Option<String> {
    let lower = launch_cmd.to_ascii_lowercase();

    if lower.ends_with(".exe") || lower.ends_with(".bat") || lower.ends_with(".lnk") {
        return Path::new(launch_cmd)
            .file_stem()
            .map(|stem| stem.to_string_lossy().to_string())
            .filter(|stem| !stem.is_empty());
    }

    let id = app_id.parse::<u32>().ok()?;
    steam_exe_for(id)
}

fn steam_root() -> PathBuf {
    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);

    for key in [
        r"SOFTWARE\WOW6432Node\Valve\Steam",
        r"SOFTWARE\Valve\Steam",
    ] {
        if let Ok(sub) = hklm.open_subkey(key) {
            if let Ok(path) = sub.get_value::<String, _>("InstallPath") {
                let candidate = PathBuf::from(path);
                if candidate.is_dir() {
                    return candidate;
                }
            }
        }
    }

    PathBuf::from(r"C:\Program Files (x86)\Steam")
}

fn steam_libraries(root: &Path) -> Vec<PathBuf> {
    let mut libraries = vec![root.to_path_buf()];
    let vdf = root.join("steamapps").join("libraryfolders.vdf");

    if let Ok(text) = fs::read_to_string(&vdf) {
        for line in text.lines() {
            let trimmed = line.trim();
            if trimmed.starts_with("\"path\"") {
                if let Some(value) = quoted_value(trimmed) {
                    let path = PathBuf::from(value.replace("\\\\", "\\"));
                    if path.is_dir() && !libraries.contains(&path) {
                        libraries.push(path);
                    }
                }
            }
        }
    }

    libraries
}

fn quoted_value(line: &str) -> Option<String> {
    let mut parts = line.split('"');
    parts.next();
    parts.next().map(|value| value.to_string())
}

fn manifest_installdir(acf: &Path) -> Option<String> {
    let text = fs::read_to_string(acf).ok()?;
    for line in text.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("\"installdir\"") {
            return quoted_value(trimmed);
        }
    }
    None
}

fn largest_exe(dir: &Path) -> Option<String> {
    let mut best: Option<(u64, String)> = None;

    for entry in fs::read_dir(dir).ok()?.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let is_exe = path
            .extension()
            .map(|ext| ext.eq_ignore_ascii_case("exe"))
            .unwrap_or(false);
        if !is_exe {
            continue;
        }

        let size = entry.metadata().map(|meta| meta.len()).unwrap_or(0);
        let stem = match path.file_stem() {
            Some(stem) => stem.to_string_lossy().to_string(),
            None => continue,
        };

        let better = match &best {
            Some((best_size, _)) => size > *best_size,
            None => true,
        };
        if better {
            best = Some((size, stem));
        }
    }

    best.map(|(_, stem)| stem)
}

fn steam_exe_for(app_id: u32) -> Option<String> {
    let root = steam_root();

    for library in steam_libraries(&root) {
        let acf = library
            .join("steamapps")
            .join(format!("appmanifest_{}.acf", app_id));
        if !acf.is_file() {
            continue;
        }

        let Some(installdir) = manifest_installdir(&acf) else {
            continue;
        };

        let game_dir = library.join("steamapps").join("common").join(installdir);
        if let Some(exe) = largest_exe(&game_dir) {
            return Some(exe);
        }
    }

    None
}

fn is_running(exe: &str) -> bool {
    let filter = format!("IMAGENAME eq {}.exe", exe);
    match Command::new("tasklist").args(["/FI", &filter, "/NH"]).output() {
        Ok(output) => String::from_utf8_lossy(&output.stdout)
            .to_ascii_lowercase()
            .contains(&exe.to_ascii_lowercase()),
        Err(_) => false,
    }
}

fn log(line: &str) {
    if let Some(dir) = dirs::data_local_dir() {
        let dir = dir.join("game-launcher");
        let _ = fs::create_dir_all(&dir);
        let path = dir.join("watch.log");
        if let Ok(mut file) = fs::OpenOptions::new().create(true).append(true).open(&path) {
            use std::io::Write;
            let _ = writeln!(file, "{} {}", chrono::Local::now().format("%H:%M:%S"), line);
        }
    }
}

/// Ждём появления процесса игры, делаем снимки сохранений и возвращаем систему,
/// когда он завершится.
pub fn watch(exe: String, app_id: String, pre_save: Option<String>) {
    std::thread::spawn(move || {
        let wait_start = Instant::now();
        let mut seen = false;

        while wait_start.elapsed() < Duration::from_secs(10 * 60) {
            if is_running(&exe) {
                seen = true;
                break;
            }
            std::thread::sleep(Duration::from_secs(2));
        }

        if !seen {
            log(&format!("{} не запустился за 10 минут, откат не нужен", exe));
            return;
        }

        log(&format!("{} запущен, следим за выходом", exe));
        let run_start = Instant::now();
        let mut last_snapshot = Instant::now();

        while run_start.elapsed() < Duration::from_secs(12 * 3600) {
            if !is_running(&exe) {
                let ran_secs = run_start.elapsed().as_secs();
                if ran_secs < 120 && !app_id.is_empty() {
                    crate::saves::note_crash(&app_id, pre_save.clone());
                    log(&format!("{} закрылся через {} с — похоже на краш", exe, ran_secs));
                }

                let result = crate::optimizer::restore();
                match result {
                    Ok(message) => log(&format!("{} закрыт. {}", exe, message)),
                    Err(error) => log(&format!("{} закрыт, откат не удался: {}", exe, error)),
                }
                // Логируем сессию и копим игровое время в геймификации.
                let game_name = crate::platforms::name_for_id(&app_id).unwrap_or_else(|| exe.clone());
                let minutes = (ran_secs / 60) as u32;
                let _ = crate::system::log_session_end(&game_name, minutes);
                let _ = crate::gamification::add_minutes("local_player", minutes);
                return;
            }

            let s = crate::settings::load_settings();
            if s.snapshot_interval > 0
                && last_snapshot.elapsed() >= Duration::from_secs(s.snapshot_interval as u64 * 60)
            {
                last_snapshot = Instant::now();
                if !app_id.is_empty() {
                    let root = if s.backup_path.trim().is_empty() {
                        None
                    } else {
                        Some(PathBuf::from(s.backup_path.trim()))
                    };
                    match crate::saves::create_backup_at(
                        &app_id,
                        None,
                        root.as_deref(),
                        s.backup_history.max(10),
                    ) {
                        Ok(entry) => log(&format!("снимок сохранений: {}", entry.name)),
                        Err(error) => log(&format!("снимок не создан: {}", error)),
                    }
                }
            }

            std::thread::sleep(Duration::from_secs(5));
        }

        log(&format!("{} работает больше 12 часов, наблюдение остановлено", exe));
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolves_exe_from_path() {
        assert_eq!(
            resolve_exe("", r"C:\Games\Cyberpunk 2077\bin\x64\Cyberpunk2077.exe"),
            Some("Cyberpunk2077".to_string())
        );
    }

    #[test]
    fn returns_none_for_steam_uri_without_manifest() {
        assert_eq!(resolve_exe("", "steam://rungameid/999999999"), None);
    }
}
