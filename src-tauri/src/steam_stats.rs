use serde::Serialize;
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Default)]
pub struct SteamStat {
    /// Всего наиграно, минуты
    pub minutes: u64,
    /// Наиграно за последние две недели, минуты
    pub minutes_2wks: u64,
    /// Unix-время последнего запуска
    pub last_played: u64,
}

fn localconfig_files() -> Vec<PathBuf> {
    let userdata = crate::platforms::steam_install_path().join("userdata");
    let mut files = Vec::new();
    if let Ok(entries) = fs::read_dir(&userdata) {
        for entry in entries.flatten() {
            let path = entry.path().join("config").join("localconfig.vdf");
            if path.exists() {
                files.push(path);
            }
        }
    }
    files
}

fn quoted(line: &str) -> Option<(&str, Option<&str>)> {
    let parts: Vec<&str> = line.split('"').skip(1).step_by(2).collect();
    match parts.len() {
        0 => None,
        _ => Some((parts[0], parts.get(1).copied())),
    }
}

fn parse_into(content: &str, out: &mut HashMap<String, SteamStat>) {
    let mut depth: usize = 0;
    let mut apps_depth: usize = 0;
    let mut in_apps = false;
    let mut current: Option<(String, SteamStat)> = None;

    for raw in content.lines() {
        let line = raw.trim();
        if line.is_empty() || line.starts_with("//") {
            continue;
        }

        if line == "{" {
            depth += 1;
            continue;
        }

        if line == "}" {
            if current.is_some() && depth == apps_depth + 2 {
                if let Some((id, stat)) = current.take() {
                    out.insert(id, stat);
                }
            }
            depth = depth.saturating_sub(1);
            if in_apps && depth <= apps_depth {
                in_apps = false;
            }
            continue;
        }

        let Some((key, value)) = quoted(line) else {
            continue;
        };

        if key == "apps" && value.is_none() {
            in_apps = true;
            apps_depth = depth;
            continue;
        }

        if !in_apps {
            continue;
        }

        if depth == apps_depth + 1 {
            if key.chars().all(|c| c.is_ascii_digit()) {
                if let Some((id, stat)) = current.take() {
                    out.insert(id, stat);
                }
                current = Some((key.to_string(), SteamStat::default()));
            }
            continue;
        }

        if depth == apps_depth + 2 {
            if let Some((_, stat)) = current.as_mut() {
                match key {
                    "Playtime" => {
                        if let Some(v) = value {
                            stat.minutes = v.parse().unwrap_or(0);
                        }
                    }
                    "Playtime2wks" => {
                        if let Some(v) = value {
                            stat.minutes_2wks = v.parse().unwrap_or(0);
                        }
                    }
                    "LastPlayed" => {
                        if let Some(v) = value {
                            stat.last_played = v.parse().unwrap_or(0);
                        }
                    }
                    _ => {}
                }
            }
        }
    }
}

pub fn load_stats() -> HashMap<String, SteamStat> {
    let mut stats: HashMap<String, SteamStat> = HashMap::new();
    for file in localconfig_files() {
        if let Ok(content) = fs::read_to_string(&file) {
            parse_into(&content, &mut stats);
        }
    }
    stats
}
