use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

use crate::platforms;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Screenshot {
    pub id: String,
    pub game: String,
    pub path: String,
    pub timestamp: String,
    pub size_kb: u64,
}

pub fn scan_screenshots(game_name: &str) -> Vec<Screenshot> {
    let mut screenshots = Vec::new();
    let user_profile = std::env::var("USERPROFILE").unwrap_or_default();
    let steam_path = PathBuf::from(&user_profile).join("Steam").join("userdata");
    let root = PathBuf::from(std::env::var("ProgramFiles(x86)").unwrap_or_default())
        .join("Steam")
        .join("userdata");
    let candidates = [steam_path, root];
    for base in &candidates {
        if !base.exists() {
            continue;
        }
        if let Ok(entries) = fs::read_dir(base) {
            for entry in entries.flatten() {
                let sdir = entry
                    .path()
                    .join("760")
                    .join("remote")
                    .join("screenshots");
                if !sdir.exists() {
                    continue;
                }
                if let Ok(files) = fs::read_dir(&sdir) {
                    for file in files.flatten() {
                        let ext = file
                            .path()
                            .extension()
                            .and_then(|e| e.to_str())
                            .map(|e| e.to_lowercase());
                        if ext.as_deref() != Some("jpg") && ext.as_deref() != Some("png") {
                            continue;
                        }
                        let meta = file.metadata().ok();
                        let hop = match meta.as_ref().and_then(|m| m.modified().ok()) {
                            Some(t) => format!("{:?}", t),
                            None => "Неизвестно".to_string(),
                        };
                        screenshots.push(Screenshot {
                            id: format!("shot_{}", screenshots.len()),
                            game: game_name.to_string(),
                            path: file.path().to_string_lossy().to_string(),
                            timestamp: hop,
                            size_kb: meta.map(|m| m.len() / 1024).unwrap_or(0),
                        });
                    }
                }
            }
        }
    }
    screenshots
}

pub fn export_library(list: &[platforms::Game]) -> Result<String, String> {
    let json = serde_json::to_string_pretty(list).map_err(|e| e.to_string())?;
    let path = PathBuf::from(std::env::var("USERPROFILE").unwrap_or_default())
        .join("Desktop")
        .join("game_library_export.json");
    fs::write(&path, json).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}