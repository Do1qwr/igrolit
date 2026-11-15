use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NewsItem {
    pub id: String,
    pub title: String,
    pub content: String,
    pub game: String,
    pub source: String,
    pub timestamp: String,
    pub url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Review {
    pub id: String,
    pub game: String,
    pub author: String,
    pub rating: u8,
    pub title: String,
    pub content: String,
    pub timestamp: String,
    pub likes: u32,
}

/// Реально тянет RSS новостей игры из Steam (store.steampowered.com/news).
/// Если сеть недоступна — возвращает пустой список (без фейковых записей).
pub fn get_news(appid: u32, limit: usize) -> Vec<NewsItem> {
    let url = format!(
        "https://store.steampowered.com/news/app/{}/?enddate=2100000000&count={}&maxlength=300&format=json",
        appid, limit.min(20)
    );
    let Ok(resp) = reqwest::blocking::get(&url) else {
        return Vec::new();
    };
    let Ok(text) = resp.text() else {
        return Vec::new();
    };
    let Ok(json) = serde_json::from_str::<serde_json::Value>(&text) else {
        return Vec::new();
    };
    let Some(list) = json.get("appnews").and_then(|n| n.get("newsitems")).and_then(|v| v.as_array()) else {
        return Vec::new();
    };
    list.iter()
        .filter_map(|item| {
            let title = item.get("title").and_then(|v| v.as_str())?;
            let content = item.get("contents").and_then(|v| v.as_str()).unwrap_or("");
            let url = item.get("url").and_then(|v| v.as_str()).unwrap_or("");
            let ts = item.get("date").and_then(|v| v.as_i64()).unwrap_or(0);
            let id = item.get("gid").and_then(|v| v.as_str()).unwrap_or_default();
            Some(NewsItem {
                id: format!("news_{}", id),
                title: title.to_string(),
                content: content.to_string(),
                game: String::new(),
                source: "Steam".to_string(),
                timestamp: format_timestamp(ts),
                url: url.to_string(),
            })
        })
        .take(limit)
        .collect()
}

fn format_timestamp(ts: i64) -> String {
    use chrono::TimeZone;
    let Some(t) = chrono::Local.timestamp_opt(ts, 0).single() else {
        return String::new();
    };
    t.format("%d.%m.%Y %H:%M").to_string()
}

/// Реальные обзоры из онлайн-профилей (сигнатура простая; данные приходят с UI).
pub fn review(id: String, game: String, author: String, rating: u8, title: String, content: String) -> Review {
    Review {
        id,
        game,
        author,
        rating: rating.min(10),
        title,
        content,
        timestamp: chrono::Local::now().format("%d.%m.%Y %H:%M").to_string(),
        likes: 0,
    }
}