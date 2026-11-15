use dirs::cache_dir;
use std::fs;
use std::path::PathBuf;

pub fn get_cache_dir() -> PathBuf {
    let cache = cache_dir().unwrap_or_else(|| PathBuf::from("."));
    let launcher_cache = cache.join("game-launcher");
    if !launcher_cache.exists() {
        let _ = fs::create_dir_all(&launcher_cache);
    }
    launcher_cache
}

pub fn get_cover_path(app_id: u32) -> PathBuf {
    let cover_dir = get_cache_dir().join("covers");
    if !cover_dir.exists() {
        let _ = fs::create_dir_all(&cover_dir);
    }
    cover_dir.join(format!("{}.jpg", app_id))
}

fn steam_api_image(
    client: &reqwest::blocking::Client,
    app_id: u32,
    fields: &[&str],
) -> Option<String> {
    let url = format!(
        "https://store.steampowered.com/api/appdetails?appids={}&l=en",
        app_id
    );
    let resp = client.get(&url).send().ok()?;
    if !resp.status().is_success() {
        return None;
    }
    let text = resp.text().ok()?;
    let json: serde_json::Value = serde_json::from_str(&text).ok()?;
    let data = json.get(app_id.to_string())?.get("data")?;
    for field in fields {
        if let Some(value) = data.get(*field).and_then(|v| v.as_str()) {
            if !value.is_empty() {
                return Some(value.to_string());
            }
        }
    }
    None
}

pub fn download_cover(app_id: u32) -> Result<String, String> {
    let cover_path = get_cover_path(app_id);
    if cover_path.exists() {
        return Ok(cover_path.to_string_lossy().to_string());
    }

    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| format!("Ошибка клиента: {}", e))?;

    let attempts: [(&str, usize); 3] = [
        ("header.jpg", 10_000),
        ("capsule_616x353.jpg", 10_000),
        ("library_hero.jpg", 30_000),
    ];
    let mut last_error = "Обложка не найдена".to_string();

    for (file, min_size) in attempts {
        let url = format!(
            "https://cdn.cloudflare.steamstatic.com/steam/apps/{}/{}",
            app_id, file
        );

        let response = match client.get(&url).send() {
            Ok(r) => r,
            Err(e) => {
                last_error = format!("Ошибка загрузки: {}", e);
                continue;
            }
        };

        if !response.status().is_success() {
            continue;
        }

        let is_image = response
            .headers()
            .get(reqwest::header::CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
            .map(|t| t.starts_with("image/"))
            .unwrap_or(false);
        if !is_image {
            continue;
        }

        let bytes = match response.bytes() {
            Ok(b) => b,
            Err(e) => {
                last_error = format!("Ошибка чтения: {}", e);
                continue;
            }
        };

        if bytes.len() < min_size {
            continue;
        }

        fs::write(&cover_path, &bytes).map_err(|e| format!("Ошибка сохранения: {}", e))?;
        return Ok(cover_path.to_string_lossy().to_string());
    }

    if let Some(url) = steam_api_image(&client, app_id, &["header_image"]) {
        if let Ok(resp) = client.get(&url).send() {
            if resp.status().is_success() {
                if let Ok(bytes) = resp.bytes() {
                    if bytes.len() > 5_000 {
                        fs::write(&cover_path, &bytes)
                            .map_err(|e| format!("Ошибка сохранения: {}", e))?;
                        return Ok(cover_path.to_string_lossy().to_string());
                    }
                }
            }
        }
    }

    Err(last_error)
}

pub fn get_hero_path(app_id: u32) -> PathBuf {
    let dir = get_cache_dir().join("heroes");
    if !dir.exists() {
        let _ = fs::create_dir_all(&dir);
    }
    dir.join(format!("{}.jpg", app_id))
}

pub fn download_hero(app_id: u32) -> Result<String, String> {
    let hero_path = get_hero_path(app_id);
    if hero_path.exists() {
        return Ok(hero_path.to_string_lossy().to_string());
    }

    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| format!("Ошибка клиента: {}", e))?;

    let attempts: [(&str, usize); 3] = [
        ("library_hero.jpg", 20_000),
        ("capsule_616x353.jpg", 10_000),
        ("header.jpg", 10_000),
    ];
    let mut last_error = "Арт не найден".to_string();

    for (file, min_size) in attempts {
        let url = format!(
            "https://cdn.cloudflare.steamstatic.com/steam/apps/{}/{}",
            app_id, file
        );

        let response = match client.get(&url).send() {
            Ok(r) => r,
            Err(e) => {
                last_error = format!("Ошибка загрузки: {}", e);
                continue;
            }
        };

        if !response.status().is_success() {
            continue;
        }

        let is_image = response
            .headers()
            .get(reqwest::header::CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
            .map(|t| t.starts_with("image/"))
            .unwrap_or(false);
        if !is_image {
            continue;
        }

        let bytes = match response.bytes() {
            Ok(b) => b,
            Err(e) => {
                last_error = format!("Ошибка чтения: {}", e);
                continue;
            }
        };

        if bytes.len() < min_size {
            continue;
        }

        fs::write(&hero_path, &bytes).map_err(|e| format!("Ошибка сохранения: {}", e))?;
        return Ok(hero_path.to_string_lossy().to_string());
    }

    if let Some(url) = steam_api_image(
        &client,
        app_id,
        &["library_hero", "background_raw", "header_image"],
    ) {
        if let Ok(resp) = client.get(&url).send() {
            if resp.status().is_success() {
                if let Ok(bytes) = resp.bytes() {
                    if bytes.len() > 10_000 {
                        fs::write(&hero_path, &bytes)
                            .map_err(|e| format!("Ошибка сохранения: {}", e))?;
                        return Ok(hero_path.to_string_lossy().to_string());
                    }
                }
            }
        }
    }

    Err(last_error)
}

fn normalize_name(value: &str) -> String {
    value
        .to_lowercase()
        .chars()
        .filter(|c| c.is_alphanumeric())
        .collect()
}

pub fn search_steam_app(name: &str) -> Option<u32> {
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .ok()?;
    let response = client
        .get("https://store.steampowered.com/api/storesearch/")
        .query(&[("term", name), ("l", "russian"), ("cc", "RU")])
        .send()
        .ok()?;
    if !response.status().is_success() {
        return None;
    }
    let text = response.text().ok()?;
    let json: serde_json::Value = serde_json::from_str(&text).ok()?;
    let items = json.get("items")?.as_array()?;
    let wanted = normalize_name(name);
    let mut partial: Option<u32> = None;
    let mut first: Option<u32> = None;

    for item in items {
        let id = match item.get("id").and_then(|v| v.as_u64()) {
            Some(value) => value as u32,
            None => continue,
        };
        let title = item.get("name").and_then(|v| v.as_str()).unwrap_or("");
        let candidate = normalize_name(title);
        if first.is_none() {
            first = Some(id);
        }
        if candidate == wanted {
            return Some(id);
        }
        if partial.is_none()
            && !wanted.is_empty()
            && (candidate.starts_with(&wanted) || wanted.starts_with(&candidate))
        {
            partial = Some(id);
        }
    }

    partial.or(first)
}

pub fn download_cover_by_name(name: &str) -> Result<String, String> {
    let app_id = search_steam_app(name).ok_or_else(|| "Игра не найдена в Steam".to_string())?;
    download_cover(app_id)
}
