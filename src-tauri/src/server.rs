use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Tournament {
    pub id: String,
    pub name: String,
    pub game: String,
    pub format: String,
    pub max_participants: usize,
    pub participants: Vec<String>,
    pub status: String,
    pub created_by: String,
    pub created_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ServerStore {
    #[serde(default)]
    pub tournaments: Vec<Tournament>,
}

fn store_path() -> PathBuf {
    let dir = dirs::data_local_dir().unwrap_or_else(|| PathBuf::from(".")).join("game-launcher");
    let _ = fs::create_dir_all(&dir);
    dir.join("server.json")
}

fn load() -> ServerStore {
    match fs::read_to_string(store_path()) {
        Ok(c) => serde_json::from_str(&c).unwrap_or_default(),
        Err(_) => ServerStore::default(),
    }
}

fn save(store: &ServerStore) -> Result<(), String> {
    let json = serde_json::to_string_pretty(store).map_err(|e| e.to_string())?;
    let path = store_path();
    let tmp = path.with_file_name("server.json.tmp");
    fs::write(&tmp, json).map_err(|e| e.to_string())?;
    let _ = fs::remove_file(&path);
    fs::rename(&tmp, &path).map_err(|e| e.to_string())
}

fn now_secs() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

pub fn create_tournament(
    name: String,
    game: String,
    format: String,
    max_participants: usize,
    created_by: String,
) -> Result<Tournament, String> {
    let name = name.trim();
    if name.is_empty() {
        return Err("Название турнира пустое".to_string());
    }
    let max = max_participants.clamp(2, 64);
    let id = format!("t{}", now_secs());
    let tournament = Tournament {
        id: id.clone(),
        name: name.to_string(),
        game,
        format,
        max_participants: max,
        participants: vec![created_by.clone()],
        status: "open".to_string(),
        created_by,
        created_at: now_secs(),
    };
    let mut store = load();
    store.tournaments.push(tournament.clone());
    save(&store)?;
    Ok(tournament)
}

pub fn get_tournaments() -> Vec<Tournament> {
    let store = load();
    let mut list = store.tournaments;
    list.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    list
}

pub fn join_tournament(id: String, user_id: String) -> Result<Tournament, String> {
    let mut store = load();
    let tournament = store
        .tournaments
        .iter_mut()
        .find(|t| t.id == id)
        .ok_or("Турнир не найден")?;
    if tournament.status != "open" {
        return Err("Турнир уже закрыт".to_string());
    }
    if tournament.participants.contains(&user_id) {
        return Ok(tournament.clone());
    }
    if tournament.participants.len() >= tournament.max_participants {
        return Err("Турнир заполнен".to_string());
    }
    tournament.participants.push(user_id.clone());
    let clone = tournament.clone();
    save(&store)?;
    Ok(clone)
}

pub fn close_tournament(id: String, owner: String) -> Result<Tournament, String> {
    let mut store = load();
    let tournament = store
        .tournaments
        .iter_mut()
        .find(|t| t.id == id)
        .ok_or("Турнир не найден")?;
    if tournament.created_by != owner {
        return Err("Только создатель может закрыть турнир".to_string());
    }
    if tournament.status == "open" {
        tournament.status = "closed".to_string();
    }
    let clone = tournament.clone();
    save(&store)?;
    Ok(clone)
}