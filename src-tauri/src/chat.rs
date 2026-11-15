use serde::{Deserialize, Serialize};
use std::io::{BufRead, BufReader, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::{Mutex, OnceLock};
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Player {
    pub nick: String,
    pub ready: bool,
    pub ping: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Msg {
    pub kind: String,
    #[serde(default)]
    pub nick: String,
    #[serde(default)]
    pub text: String,
    #[serde(default)]
    pub ready: bool,
    #[serde(default)]
    pub t: u64,
    #[serde(default)]
    pub players: Vec<Player>,
    #[serde(default)]
    pub game_id: String,
    #[serde(default)]
    pub slots: u16,
    #[serde(default)]
    pub locked: bool,
}

struct Chat {
    nick: String,
    writer: Option<TcpStream>,
    clients: Vec<(String, TcpStream)>,
    players: Vec<Player>,
    hosting: bool,
    slots: u16,
    locked: bool,
}

static CHAT: OnceLock<Mutex<Chat>> = OnceLock::new();

fn chat() -> &'static Mutex<Chat> {
    CHAT.get_or_init(|| {
        Mutex::new(Chat {
            nick: String::new(),
            writer: None,
            clients: Vec::new(),
            players: Vec::new(),
            hosting: false,
            slots: 10,
            locked: false,
        })
    })
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn encode(msg: &Msg) -> Option<String> {
    serde_json::to_string(msg).ok().map(|payload| format!("{}\n", payload))
}

fn broadcast(msg: &Msg) {
    let payload = match encode(msg) {
        Some(payload) => payload,
        None => return,
    };
    let mut state = chat().lock().unwrap();
    state
        .clients
        .retain_mut(|(_, stream)| stream.write_all(payload.as_bytes()).is_ok());
}

fn broadcast_state(app: &AppHandle) {
    let (players, slots, locked) = {
        let state = chat().lock().unwrap();
        (state.players.clone(), state.slots, state.locked)
    };
    let msg = Msg {
        kind: "state".to_string(),
        players: players.clone(),
        slots,
        locked,
        ..Default::default()
    };
    broadcast(&msg);
    let _ = app.emit_all("lobby-state", &msg);
}

fn handle_client(app: AppHandle, stream: TcpStream) {
    let reader_stream = match stream.try_clone() {
        Ok(stream) => stream,
        Err(_) => return,
    };
    let mut registered = false;
    let mut nick = String::new();
    let reader = BufReader::new(reader_stream);

    for line in reader.lines().flatten() {
        let msg: Msg = match serde_json::from_str(&line) {
            Ok(msg) => msg,
            Err(_) => continue,
        };

        match msg.kind.as_str() {
            "join" => {
                if registered {
                    continue;
                }
                nick = if msg.nick.trim().is_empty() {
                    "игрок".to_string()
                } else {
                    msg.nick.trim().to_string()
                };
                let writer = match stream.try_clone() {
                    Ok(writer) => writer,
                    Err(_) => return,
                };
                registered = true;
                let rejection = {
                    let state = chat().lock().unwrap();
                    if state.locked {
                        Some("Хост закрыл вход в комнату".to_string())
                    } else if state.players.len() >= state.slots as usize {
                        Some(format!("Комната заполнена ({} мест)", state.slots))
                    } else {
                        None
                    }
                };
                if let Some(reason) = rejection {
                    let mut writer = writer;
                    let reject = Msg {
                        kind: "reject".to_string(),
                        text: reason,
                        ..Default::default()
                    };
                    if let Some(payload) = encode(&reject) {
                        let _ = writer.write_all(payload.as_bytes());
                    }
                    registered = false;
                    return;
                }
                {
                    let mut state = chat().lock().unwrap();
                    state.clients.push((nick.clone(), writer));
                    if !state.players.iter().any(|p| p.nick == nick) {
                        state.players.push(Player {
                            nick: nick.clone(),
                            ready: false,
                            ping: 0,
                        });
                    }
                }
                broadcast_state(&app);
            }
            "chat" => {
                if !registered {
                    continue;
                }
                let out = Msg {
                    kind: "chat".to_string(),
                    nick: nick.clone(),
                    text: msg.text,
                    ..Default::default()
                };
                broadcast(&out);
                let _ = app.emit_all("lobby-chat", &out);
            }
            "ready" => {
                if !registered {
                    continue;
                }
                {
                    let mut state = chat().lock().unwrap();
                    if let Some(player) = state.players.iter_mut().find(|p| p.nick == nick) {
                        player.ready = msg.ready;
                    }
                }
                broadcast_state(&app);
            }
            "pong" => {
                let rtt = now_ms().saturating_sub(msg.t);
                {
                    let mut state = chat().lock().unwrap();
                    if let Some(player) = state.players.iter_mut().find(|p| p.nick == nick) {
                        player.ping = rtt;
                    }
                }
                broadcast_state(&app);
            }
            _ => {}
        }
    }

    if registered {
        let host_nick = chat().lock().unwrap().nick.clone();
        {
            let mut state = chat().lock().unwrap();
            state.clients.retain(|(name, _)| name != &nick);
            state.players.retain(|p| p.nick != nick || p.nick == host_nick);
        }
        broadcast_state(&app);
    }
}

pub fn host(app: AppHandle, port: u16, nick: String, slots: u16) -> Result<(), String> {
    {
        let mut state = chat().lock().unwrap();
        state.hosting = false;
    }
    thread::sleep(Duration::from_millis(300));

    let listener = TcpListener::bind(("0.0.0.0", port))
        .map_err(|_| format!("Чат: порт {} занят", port))?;
    let _ = listener.set_nonblocking(true);

    {
        let mut state = chat().lock().unwrap();
        state.nick = nick.clone();
        state.writer = None;
        state.clients.clear();
        state.hosting = true;
        state.slots = slots.max(2);
        state.locked = false;
        state.players = vec![Player {
            nick,
            ready: true,
            ping: 0,
        }];
    }

    broadcast_state(&app);

    let accept_app = app.clone();
    thread::spawn(move || loop {
        if !chat().lock().unwrap().hosting {
            break;
        }
        match listener.accept() {
            Ok((stream, _)) => {
                let app = accept_app.clone();
                thread::spawn(move || handle_client(app, stream));
            }
            Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                thread::sleep(Duration::from_millis(150));
            }
            Err(_) => break,
        }
    });

    thread::spawn(move || loop {
        if !chat().lock().unwrap().hosting {
            break;
        }
        let ping = Msg {
            kind: "ping".to_string(),
            t: now_ms(),
            ..Default::default()
        };
        broadcast(&ping);
        thread::sleep(Duration::from_secs(3));
    });

    Ok(())
}

pub fn join(app: AppHandle, host: &str, port: u16, nick: String) -> Result<(), String> {
    let stream = TcpStream::connect((host, port))
        .map_err(|_| "Не удалось подключиться к чату комнаты".to_string())?;
    let mut writer = stream.try_clone().map_err(|e| e.to_string())?;

    {
        let mut state = chat().lock().unwrap();
        state.nick = nick.clone();
        state.writer = Some(stream.try_clone().map_err(|e| e.to_string())?);
        state.hosting = false;
        state.clients.clear();
        state.players.clear();
    }

    let hello = Msg {
        kind: "join".to_string(),
        nick: nick.clone(),
        ..Default::default()
    };
    if let Some(payload) = encode(&hello) {
        writer
            .write_all(payload.as_bytes())
            .map_err(|_| "Хост не принял подключение".to_string())?;
    }

    let mut reader = BufReader::new(stream.try_clone().map_err(|e| e.to_string())?);
    let _ = stream.set_read_timeout(Some(Duration::from_millis(2500)));
    let mut first = String::new();
    let probe = reader.read_line(&mut first);
    let _ = stream.set_read_timeout(None);

    match probe {
        Ok(0) | Err(_) => {
            return Err("Комната не ответила".to_string());
        }
        Ok(_) => {
            if let Ok(msg) = serde_json::from_str::<Msg>(first.trim()) {
                match msg.kind.as_str() {
                    "reject" => return Err(msg.text),
                    "state" => {
                        let _ = app.emit_all("lobby-state", &msg);
                    }
                    _ => {}
                }
            }
        }
    }

    thread::spawn(move || {

        for line in reader.lines().flatten() {
            let msg: Msg = match serde_json::from_str(&line) {
                Ok(msg) => msg,
                Err(_) => continue,
            };

            match msg.kind.as_str() {
                "state" => {
                    let _ = app.emit_all("lobby-state", &msg.players);
                }
                "chat" => {
                    let _ = app.emit_all("lobby-chat", &msg);
                }
                "start" => {
                    let _ = app.emit_all("lobby-start", &msg);
                }
                "ping" => {
                    let pong = Msg {
                        kind: "pong".to_string(),
                        t: msg.t,
                        ..Default::default()
                    };
                    if let Some(payload) = encode(&pong) {
                        let _ = writer.write_all(payload.as_bytes());
                    }
                }
                _ => {}
            }
        }
    });

    Ok(())
}

pub fn send(app: AppHandle, text: &str) -> Result<(), String> {
    let text = text.trim().to_string();
    if text.is_empty() {
        return Ok(());
    }

    let (nick, hosting) = {
        let state = chat().lock().unwrap();
        (state.nick.clone(), state.hosting)
    };

    let msg = Msg {
        kind: "chat".to_string(),
        nick,
        text,
        ..Default::default()
    };

    if hosting {
        broadcast(&msg);
    } else {
        let payload = encode(&msg).ok_or_else(|| "Сообщение не отправлено".to_string())?;
        let mut state = chat().lock().unwrap();
        match state.writer.as_mut() {
            Some(writer) => writer
                .write_all(payload.as_bytes())
                .map_err(|_| "Сообщение не отправлено".to_string())?,
            None => return Err("Нет соединения с комнатой".to_string()),
        }
    }

    let _ = app.emit_all("lobby-chat", &msg);
    Ok(())
}

pub fn set_ready(app: AppHandle, ready: bool) -> Result<(), String> {
    let (nick, hosting) = {
        let state = chat().lock().unwrap();
        (state.nick.clone(), state.hosting)
    };

    if hosting {
        {
            let mut state = chat().lock().unwrap();
            if let Some(player) = state.players.iter_mut().find(|p| p.nick == nick) {
                player.ready = ready;
            }
        }
        broadcast_state(&app);
        return Ok(());
    }

    let msg = Msg {
        kind: "ready".to_string(),
        nick,
        ready,
        ..Default::default()
    };
    let payload = encode(&msg).ok_or_else(|| "Не отправлено".to_string())?;
    let mut state = chat().lock().unwrap();
    match state.writer.as_mut() {
        Some(writer) => writer
            .write_all(payload.as_bytes())
            .map_err(|_| "Не отправлено".to_string()),
        None => Err("Нет соединения с комнатой".to_string()),
    }
}

pub fn start(app: AppHandle, game_id: String) {
    let msg = Msg {
        kind: "start".to_string(),
        game_id,
        ..Default::default()
    };
    broadcast(&msg);
    let _ = app.emit_all("lobby-start", &msg);
}

pub fn set_locked(app: AppHandle, locked: bool) {
    {
        let mut state = chat().lock().unwrap();
        state.locked = locked;
    }
    broadcast_state(&app);
}

pub fn reset() {
    let mut state = chat().lock().unwrap();
    state.hosting = false;
    state.writer = None;
    state.clients.clear();
    state.players.clear();
    state.locked = false;
}
