use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

const BASE_EXP_PER_LEVEL: u32 = 100;
pub const COINS_START: u32 = 100;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Quest {
    pub id: String,
    pub title: String,
    pub description: String,
    pub target: u32,
    pub progress: u32,
    pub reward_xp: u32,
    pub reward_coins: u32,
    pub completed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlayerStats {
    pub user_id: String,
    pub xp: u32,
    pub level: u32,
    pub coins: u32,
    pub titles: Vec<String>,
    pub active_title: String,
    pub achievements: Vec<String>,
    pub launches: u32,
    pub minutes_played: u32,
}

impl PlayerStats {
    fn new(user_id: &str) -> Self {
        Self {
            user_id: user_id.to_string(),
            xp: 0,
            level: 1,
            coins: COINS_START,
            titles: vec!["Новичок".to_string()],
            active_title: "Новичок".to_string(),
            achievements: Vec::new(),
            launches: 0,
            minutes_played: 0,
        }
    }

    fn daily_quests(&self) -> Vec<Quest> {
        vec![
            Quest { id: "q_launch".into(), title: "Первый запуск".into(), description: "Запусти любую игру".to_string(), target: 1, progress: self.launches.min(1), reward_xp: 10, reward_coins: 5, completed: self.launches >= 1 },
            Quest { id: "q_3launch".into(), title: "Игровой день".into(), description: "Запусти 3 игры".to_string(), target: 3, progress: self.launches.min(3), reward_xp: 25, reward_coins: 12, completed: self.launches >= 3 },
            Quest { id: "q_min".into(), title: "Час в игре".into(), description: "Наиграй 60 минут".to_string(), target: 60, progress: self.minutes_played.min(60), reward_xp: 30, reward_coins: 15, completed: self.minutes_played >= 60 },
        ]
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LeaderboardEntry {
    pub user_id: String,
    pub nickname: String,
    pub xp: u32,
    pub level: u32,
    pub rank: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct GamificationStore {
    #[serde(default)]
    pub players: HashMap<String, PlayerStats>,
}

fn store_path() -> PathBuf {
    let dir = dirs::data_local_dir().unwrap_or_else(|| PathBuf::from(".")).join("game-launcher");
    let _ = fs::create_dir_all(&dir);
    dir.join("gamification.json")
}

fn load() -> GamificationStore {
    match fs::read_to_string(store_path()) {
        Ok(c) => serde_json::from_str(&c).unwrap_or_default(),
        Err(_) => GamificationStore::default(),
    }
}

fn save(store: &GamificationStore) -> Result<(), String> {
    let json = serde_json::to_string_pretty(store).map_err(|e| e.to_string())?;
    let path = store_path();
    let tmp = path.with_file_name("gamification.json.tmp");
    fs::write(&tmp, json).map_err(|e| e.to_string())?;
    let _ = fs::remove_file(&path);
    fs::rename(&tmp, &path).map_err(|e| e.to_string())
}



pub fn ensure_player(user_id: &str) -> PlayerStats {
    let mut store = load();
    let p = store.players.entry(user_id.to_string()).or_insert_with(|| PlayerStats::new(user_id));
    p.clone()
}

fn level_for_xp(xp: u32) -> u32 {
    (xp / BASE_EXP_PER_LEVEL) + 1
}

fn apply_xp(player: &mut PlayerStats, amount: u32) {
    player.xp = player.xp.saturating_add(amount);
    let new_level = level_for_xp(player.xp);
    if new_level > player.level {
        // Бонус монет за новый уровень.
        let gained = new_level - player.level;
        player.coins = player.coins.saturating_add(gained * 30);
        player.level = new_level;
        let unlock = format!("Уровень {}", new_level);
        if !player.titles.contains(&unlock) {
            player.titles.push(unlock);
        }
    }
}

pub fn record_launch(user_id: &str, duration_mins: u32) -> PlayerStats {
    let mut store = load();
    let player = store.players.entry(user_id.to_string()).or_insert_with(|| PlayerStats::new(user_id));
    player.launches = player.launches.saturating_add(1);
    player.minutes_played = player.minutes_played.saturating_add(duration_mins);
    apply_xp(player, 20);
    // Достижения
    if player.launches >= 1 && !player.achievements.contains(&"first_launch".to_string()) {
        player.achievements.push("first_launch".to_string());
        player.coins = player.coins.saturating_add(10);
    }
    if player.launches >= 10 && !player.achievements.contains(&"plays10".to_string()) {
        player.achievements.push("plays10".to_string());
        player.coins = player.coins.saturating_add(50);
    }
    if player.minutes_played >= 60 && !player.achievements.contains(&"hour".to_string()) {
        player.achievements.push("hour".to_string());
    }
    let clone = player.clone();
    let _ = save(&store);
    clone
}

pub fn get_player(user_id: &str) -> PlayerStats {
    ensure_player(user_id)
}

pub fn add_minutes(user_id: &str, minutes: u32) {
    let mut store = load();
    let player = store
        .players
        .entry(user_id.to_string())
        .or_insert_with(|| PlayerStats::new(user_id));
    player.minutes_played = player.minutes_played.saturating_add(minutes);
    let _ = save(&store);
}

pub fn get_quests(user_id: &str) -> Vec<Quest> {
    let p = ensure_player(user_id);
    p.daily_quests()
}

pub fn complete_quest(user_id: &str, quest_id: &str) -> Result<PlayerStats, String> {
    let mut store = load();
    let player = store.players.entry(user_id.to_string()).or_insert_with(|| PlayerStats::new(user_id));
    let quest = player
        .daily_quests()
        .into_iter()
        .find(|q| q.id == quest_id)
        .ok_or("Квест не найден")?;
    if !quest.completed {
        player.xp = player.xp.saturating_add(quest.reward_xp);
        player.coins = player.coins.saturating_add(quest.reward_coins);
        let new_level = level_for_xp(player.xp);
        if new_level > player.level {
            let gained = new_level - player.level;
            player.coins = player.coins.saturating_add(gained * 30);
            player.level = new_level;
            let unlock = format!("Уровень {}", new_level);
            if !player.titles.contains(&unlock) {
                player.titles.push(unlock);
            }
        }
    }
    let clone = player.clone();
    let _ = save(&store);
    Ok(clone)
}

pub fn get_leaderboard(nicknames: &HashMap<String, String>) -> Vec<LeaderboardEntry> {
    let store = load();
    let mut entries: Vec<LeaderboardEntry> = store
        .players
        .values()
        .map(|p| LeaderboardEntry {
            user_id: p.user_id.clone(),
            nickname: nicknames.get(&p.user_id).cloned().unwrap_or_else(|| p.user_id.clone()),
            xp: p.xp,
            level: p.level,
            rank: 0,
        })
        .collect();
    entries.sort_by_key(|a| std::cmp::Reverse(a.xp));
    for (i, e) in entries.iter_mut().enumerate() {
        e.rank = (i as u32) + 1;
    }
    entries.truncate(20);
    entries
}

pub fn set_active_title(user_id: &str, title: &str) -> Result<PlayerStats, String> {
    let mut store = load();
    let player = store.players.entry(user_id.to_string()).or_insert_with(|| PlayerStats::new(user_id));
    if player.titles.iter().any(|t| t == title) {
        player.active_title = title.to_string();
        let clone = player.clone();
        let _ = save(&store);
        Ok(clone)
    } else {
        Err("Титул не получен".to_string())
    }
}

pub fn spend_coins(user_id: &str, amount: u32) -> Result<PlayerStats, String> {
    let mut store = load();
    let player = store.players.entry(user_id.to_string()).or_insert_with(|| PlayerStats::new(user_id));
    if player.coins >= amount {
        player.coins -= amount;
        let clone = player.clone();
        let _ = save(&store);
        Ok(clone)
    } else {
        Err("Недостаточно монет".to_string())
    }
}