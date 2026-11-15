use rand::RngCore;
use scrypt::{scrypt, Params};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::net::{TcpListener, TcpStream};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, Sender};
use std::sync::{Arc, Mutex, OnceLock};
use std::thread;
use tungstenite::protocol::Role;
use tungstenite::{accept, Message, WebSocket};

pub const PORT: u16 = 8787;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct User {
    pub name: String,
    pub salt: String,
    pub hash: String,
    #[serde(default)]
    pub friends: Vec<String>,
    #[serde(default)]
    pub token: String,
    #[serde(default)]
    pub online: bool,
    #[serde(default)]
    pub game: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct Store {
    #[serde(default)]
    users: HashMap<String, User>,
}

struct State {
    store: Store,
    senders: HashMap<String, Sender<String>>,
}

static STATE: OnceLock<Arc<Mutex<State>>> = OnceLock::new();
static STARTED: OnceLock<()> = OnceLock::new();
static RUNNING: AtomicBool = AtomicBool::new(false);

fn data_path() -> PathBuf {
    dirs::data_local_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("game-launcher")
        .join("online_data.json")
}

fn load_store() -> Store {
    let path = data_path();
    match std::fs::read_to_string(&path) {
        Ok(text) => match serde_json::from_str::<Store>(&text) {
            Ok(store) => store,
            Err(_) => {
                let broken = path.with_file_name("online_data.corrupt.json");
                let _ = std::fs::remove_file(&broken);
                let _ = std::fs::rename(&path, &broken);
                Store::default()
            }
        },
        Err(_) => Store::default(),
    }
}

fn save_store(store: &Store) {
    let path = data_path();
    if let Some(dir) = path.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    if let Ok(text) = serde_json::to_string_pretty(store) {
        let tmp = path.with_file_name("online_data.json.tmp");
        if std::fs::write(&tmp, text).is_ok() {
            if path.exists() {
                let _ = std::fs::remove_file(&path);
            }
            let _ = std::fs::rename(&tmp, &path);
        }
    }
}

fn encode_hex(bytes: &[u8]) -> String {
    let mut out = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        out.push_str(&format!("{:02x}", byte));
    }
    out
}

fn decode_hex(text: &str) -> Vec<u8> {
    let mut out = Vec::with_capacity(text.len() / 2);
    let bytes = text.as_bytes();
    let mut i = 0;
    while i + 1 < bytes.len() {
        let high = (bytes[i] as char).to_digit(16).unwrap_or(0) as u8;
        let low = (bytes[i + 1] as char).to_digit(16).unwrap_or(0) as u8;
        out.push((high << 4) | low);
        i += 2;
    }
    out
}

fn new_salt() -> String {
    let mut salt = [0u8; 16];
    rand::rngs::OsRng.fill_bytes(&mut salt);
    encode_hex(&salt)
}

fn new_token() -> String {
    let mut token = [0u8; 32];
    rand::rngs::OsRng.fill_bytes(&mut token);
    encode_hex(&token)
}

fn hash_password(password: &str, salt_hex: &str) -> String {
    let salt = decode_hex(salt_hex);
    let params = Params::new(14, 8, 1, 64).unwrap_or_default();
    let mut out = [0u8; 64];
    let _ = scrypt(password.as_bytes(), &salt, &params, &mut out);
    encode_hex(&out)
}

fn verify_password(password: &str, user: &User) -> bool {
    hash_password(password, &user.salt) == user.hash
}

fn valid_name(name: &str) -> bool {
    let len_ok = (3..=20).contains(&name.len());
    let chars_ok = name
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '_');
    len_ok && chars_ok
}

fn public_user(user: &User) -> Value {
    json!({ "name": user.name, "online": user.online, "game": user.game })
}

fn friends_of(state: &State, name: &str) -> Vec<String> {
    state
        .store
        .users
        .get(name)
        .map(|user| {
            user.friends
                .iter()
                .filter(|friend| state.store.users.contains_key(*friend))
                .cloned()
                .collect()
        })
        .unwrap_or_default()
}

fn send_to(state: &State, name: &str, payload: &Value) {
    if let Some(tx) = state.senders.get(name) {
        let _ = tx.send(payload.to_string());
    }
}

fn send_friends(state: &State, name: &str) {
    let friends: Vec<Value> = friends_of(state, name)
        .iter()
        .filter_map(|friend| state.store.users.get(friend))
        .map(public_user)
        .collect();
    send_to(state, name, &json!({ "type": "friends", "friends": friends }));
}

fn notify_friends(state: &State, name: &str, payload: &Value) {
    for friend in friends_of(state, name) {
        send_to(state, &friend, payload);
    }
}

fn auth_ok(state: &mut State, conn_user: &mut Option<String>, tx: &Sender<String>, name: &str) {
    if let Some(old) = conn_user.clone() {
        if old != name {
            state.senders.remove(&old);
        }
    }
    *conn_user = Some(name.to_string());
    state.senders.insert(name.to_string(), tx.clone());

    let token = match state.store.users.get_mut(name) {
        Some(user) => {
            user.online = true;
            user.game = None;
            user.token = new_token();
            user.token.clone()
        }
        None => return,
    };
    save_store(&state.store);

    let friends: Vec<Value> = friends_of(state, name)
        .iter()
        .filter_map(|friend| state.store.users.get(friend))
        .map(public_user)
        .collect();

    let _ = tx.send(
        json!({ "type": "auth_ok", "token": token, "user": name, "friends": friends })
            .to_string(),
    );

    notify_friends(
        state,
        name,
        &json!({ "type": "presence", "user": name, "online": true, "game": null }),
    );
}

fn handle(state: &mut State, conn_user: &mut Option<String>, tx: &Sender<String>, text: &str) {
    let msg: Value = match serde_json::from_str(text) {
        Ok(value) => value,
        Err(_) => return,
    };
    let kind = msg.get("type").and_then(Value::as_str).unwrap_or("");
    let reply = |tx: &Sender<String>, payload: Value| {
        let _ = tx.send(payload.to_string());
    };

    match kind {
        "register" => {
            let name = msg
                .get("user")
                .and_then(Value::as_str)
                .unwrap_or("")
                .trim()
                .to_lowercase();
            let pass = msg.get("pass").and_then(Value::as_str).unwrap_or("");
            if !valid_name(&name) {
                return reply(tx, json!({ "type": "auth_fail", "reason": "bad_name" }));
            }
            if pass.len() < 6 {
                return reply(tx, json!({ "type": "auth_fail", "reason": "bad_pass" }));
            }
            if state.store.users.contains_key(&name) {
                return reply(tx, json!({ "type": "auth_fail", "reason": "exists" }));
            }
            let salt = new_salt();
            let hash = hash_password(pass, &salt);
            state.store.users.insert(
                name.clone(),
                User {
                    name: name.clone(),
                    salt,
                    hash,
                    friends: Vec::new(),
                    token: new_token(),
                    online: false,
                    game: None,
                },
            );
            save_store(&state.store);
            auth_ok(state, conn_user, tx, &name);
        }

        "login" => {
            let name = msg
                .get("user")
                .and_then(Value::as_str)
                .unwrap_or("")
                .trim()
                .to_lowercase();
            let pass = msg.get("pass").and_then(Value::as_str).unwrap_or("");
            let ok = state
                .store
                .users
                .get(&name)
                .map(|user| verify_password(pass, user))
                .unwrap_or(false);
            if !ok {
                return reply(tx, json!({ "type": "auth_fail", "reason": "bad_login" }));
            }
            auth_ok(state, conn_user, tx, &name);
        }

        "auth" => {
            let token = msg.get("token").and_then(Value::as_str).unwrap_or("");
            let name = state
                .store
                .users
                .values()
                .find(|user| user.token == token)
                .map(|user| user.name.clone());
            match name {
                Some(name) => auth_ok(state, conn_user, tx, &name),
                None => reply(tx, json!({ "type": "auth_fail", "reason": "token" })),
            }
        }

        "friend_add" => {
            let Some(me) = conn_user.clone() else { return };
            let target = msg
                .get("user")
                .and_then(Value::as_str)
                .unwrap_or("")
                .trim()
                .to_lowercase();
            if !state.store.users.contains_key(&target) {
                return reply(tx, json!({ "type": "error", "reason": "no_user" }));
            }
            if target == me {
                return reply(tx, json!({ "type": "error", "reason": "self" }));
            }
            if let Some(user) = state.store.users.get_mut(&me) {
                if !user.friends.contains(&target) {
                    user.friends.push(target.clone());
                }
            }
            if let Some(other) = state.store.users.get_mut(&target) {
                if !other.friends.contains(&me) {
                    other.friends.push(me.clone());
                }
            }
            save_store(&state.store);
            send_friends(state, &me);
            send_friends(state, &target);
        }

        "friend_remove" => {
            let Some(me) = conn_user.clone() else { return };
            let target = msg
                .get("user")
                .and_then(Value::as_str)
                .unwrap_or("")
                .trim()
                .to_lowercase();
            if let Some(user) = state.store.users.get_mut(&me) {
                user.friends.retain(|friend| *friend != target);
            }
            if let Some(other) = state.store.users.get_mut(&target) {
                other.friends.retain(|friend| *friend != me);
            }
            save_store(&state.store);
            send_friends(state, &me);
            send_friends(state, &target);
        }

        "chat" => {
            let Some(me) = conn_user.clone() else { return };
            let to = msg
                .get("to")
                .and_then(Value::as_str)
                .unwrap_or("")
                .trim()
                .to_lowercase();
            let text = msg.get("text").and_then(Value::as_str).unwrap_or("");
            if text.trim().is_empty() {
                return;
            }
            if !friends_of(state, &me).contains(&to) {
                return reply(tx, json!({ "type": "error", "reason": "not_friend" }));
            }
            let payload = json!({
                "type": "chat",
                "from": me,
                "text": text.chars().take(2000).collect::<String>(),
                "ts": chrono::Utc::now().timestamp_millis(),
            });
            send_to(state, &to, &payload);
            reply(tx, payload);
        }

        "status" => {
            let Some(me) = conn_user.clone() else { return };
            let game = msg
                .get("game")
                .and_then(Value::as_str)
                .map(|value| value.chars().take(120).collect::<String>());
            if let Some(user) = state.store.users.get_mut(&me) {
                user.game = game.clone();
            }
            save_store(&state.store);
            notify_friends(
                state,
                &me,
                &json!({ "type": "presence", "user": me, "online": true, "game": game }),
            );
        }

        _ => {
            reply(tx, json!({ "type": "error", "reason": "unknown" }));
        }
    }
}

fn connection(shared: Arc<Mutex<State>>, stream: TcpStream) {
    let socket = match accept(stream) {
        Ok(socket) => socket,
        Err(_) => return,
    };
    let cloned = match socket.get_ref().try_clone() {
        Ok(cloned) => cloned,
        Err(_) => return,
    };
    let mut writer: WebSocket<TcpStream> =
        WebSocket::from_raw_socket(cloned, Role::Server, None);

    let (tx, rx) = mpsc::channel::<String>();
    thread::spawn(move || {
        for text in rx {
            if writer.send(Message::Text(text)).is_err() {
                break;
            }
        }
        let _ = writer.close(None);
    });

    let mut socket = socket;
    let mut conn_user: Option<String> = None;

    loop {
        match socket.read_message() {
            Ok(Message::Text(text)) => {
                if text.len() > 4096 {
                    continue;
                }
                let mut state = match shared.lock() {
                    Ok(state) => state,
                    Err(_) => return,
                };
                handle(&mut state, &mut conn_user, &tx, &text);
            }
            Ok(Message::Close(_)) => break,
            Ok(_) => {}
            Err(_) => break,
        }
    }

    if let Some(name) = conn_user {
        if let Ok(mut state) = shared.lock() {
            state.senders.remove(&name);
            if let Some(user) = state.store.users.get_mut(&name) {
                user.online = false;
                user.game = None;
            }
            save_store(&state.store);
            notify_friends(
                &state,
                &name,
                &json!({ "type": "presence", "user": name, "online": false, "game": null }),
            );
        }
    }
}

pub fn is_running() -> bool {
    RUNNING.load(Ordering::Relaxed)
}

pub fn start() {
    if STARTED.set(()).is_err() {
        return;
    }
    let listener = match TcpListener::bind(("0.0.0.0", PORT)) {
        Ok(listener) => listener,
        Err(_) => {
            RUNNING.store(false, Ordering::Relaxed);
            return;
        }
    };
    RUNNING.store(true, Ordering::Relaxed);

    let state = Arc::new(Mutex::new(State {
        store: load_store(),
        senders: HashMap::new(),
    }));
    let _ = STATE.set(state.clone());

    thread::spawn(move || {
        for stream in listener.incoming().flatten() {
            let shared = state.clone();
            thread::spawn(move || connection(shared, stream));
        }
    });
}

pub fn status() -> Value {
    let local_ip = local_ip_address::local_ip()
        .ok()
        .map(|ip| ip.to_string());
    json!({
        "running": is_running(),
        "port": PORT,
        "local_ip": local_ip,
    })
}
