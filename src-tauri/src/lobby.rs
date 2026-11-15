use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::net::UdpSocket;
use std::sync::{Mutex, OnceLock};
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

const DISCOVERY_PORT: u16 = 47891;
const MAGIC: &str = "GLR1";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Room {
    pub magic: String,
    pub id: String,
    pub name: String,
    pub game_id: String,
    pub game_name: String,
    pub host: String,
    pub port: u16,
    pub slots: u16,
    pub nick: String,
    pub ts: u64,
}

struct State {
    nick: String,
    advert: Option<Room>,
    rooms: HashMap<String, Room>,
    listening: bool,
}

static STATE: OnceLock<Mutex<State>> = OnceLock::new();

fn state() -> &'static Mutex<State> {
    STATE.get_or_init(|| {
        Mutex::new(State {
            nick: String::new(),
            advert: None,
            rooms: HashMap::new(),
            listening: false,
        })
    })
}

fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

pub fn start(app: AppHandle, nick: String) {
    {
        let mut s = state().lock().unwrap();
        s.nick = nick;
        if s.listening {
            return;
        }
        s.listening = true;
    }

    thread::spawn(move || {
        let socket = match UdpSocket::bind(("0.0.0.0", DISCOVERY_PORT)) {
            Ok(socket) => socket,
            Err(_) => return,
        };
        let _ = socket.set_read_timeout(Some(Duration::from_millis(400)));

        let mut buffer = [0u8; 2048];
        loop {
            if let Ok((len, _)) = socket.recv_from(&mut buffer) {
                if let Ok(room) = serde_json::from_slice::<Room>(&buffer[..len]) {
                    if room.magic == MAGIC {
                        state().lock().unwrap().rooms.insert(room.id.clone(), room);
                    }
                }
            }

            let list = {
                let mut s = state().lock().unwrap();
                let limit = now().saturating_sub(8);
                s.rooms.retain(|_, room| room.ts >= limit);
                let mut rooms: Vec<Room> = s.rooms.values().cloned().collect();
                rooms.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
                rooms
            };

            let _ = app.emit_all("lobby-rooms", &list);
        }
    });
}

pub fn create(
    nick: String,
    name: String,
    game_id: String,
    game_name: String,
    port: u16,
    slots: u16,
) -> Result<Room, String> {
    let nick = nick.trim().to_string();
    if nick.is_empty() {
        return Err("Укажите имя игрока".to_string());
    }
    let name = name.trim().to_string();
    let name = if name.is_empty() {
        format!("Комната {}", nick)
    } else {
        name
    };

    let host = crate::lanplay::best_lan_ip();

    let room = Room {
        magic: MAGIC.to_string(),
        id: format!("{:016x}", rand::random::<u64>()),
        name,
        game_id,
        game_name,
        host,
        port,
        slots: slots.max(2),
        nick,
        ts: now(),
    };

    {
        let mut s = state().lock().unwrap();
        s.advert = Some(room.clone());
    }

    let room_id = room.id.clone();
    thread::spawn(move || {
        let socket = match UdpSocket::bind("0.0.0.0:0") {
            Ok(socket) => socket,
            Err(_) => return,
        };
        let _ = socket.set_broadcast(true);

        loop {
            let current = {
                let mut s = state().lock().unwrap();
                match s.advert.as_mut() {
                    Some(advert) if advert.id == room_id => {
                        advert.ts = now();
                        Some(advert.clone())
                    }
                    _ => None,
                }
            };

            let advert = match current {
                Some(advert) => advert,
                None => break,
            };

            if let Ok(payload) = serde_json::to_vec(&advert) {
                let _ = socket.send_to(&payload, ("255.255.255.255", DISCOVERY_PORT));
                let _ = socket.send_to(&payload, ("127.0.0.1", DISCOVERY_PORT));
            }

            thread::sleep(Duration::from_secs(2));
        }
    });

    Ok(room)
}

pub fn stop() {
    state().lock().unwrap().advert = None;
}

pub fn current() -> Option<Room> {
    state().lock().unwrap().advert.clone()
}
