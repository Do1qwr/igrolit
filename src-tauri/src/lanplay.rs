use std::net::{TcpStream, ToSocketAddrs, UdpSocket};
use std::time::Duration;

pub fn local_ips() -> Vec<String> {
    let mut list: Vec<String> = local_ip_address::list_afinet_netifas()
        .map(|items| {
            items
                .into_iter()
                .filter(|(name, ip)| {
                    ip.is_ipv4() && !name.to_lowercase().contains("loopback") && !ip.is_loopback()
                })
                .map(|(_, ip)| ip.to_string())
                .collect()
        })
        .unwrap_or_default();
    list.sort();
    list.dedup();
    list
}

pub fn best_lan_ip() -> String {
    let ips = local_ips();
    let score = |ip: &str| -> u8 {
        if ip.starts_with("192.168.") {
            3
        } else if ip.starts_with("10.") {
            2
        } else if ip.starts_with("172.") {
            1
        } else if ip.starts_with("169.254.") {
            0
        } else {
            1
        }
    };

    let mut best: Option<(&str, u8)> = None;
    for ip in &ips {
        let value = score(ip);
        if best.map(|(_, current)| value > current).unwrap_or(true) {
            best = Some((ip.as_str(), value));
        }
    }

    best.map(|(ip, _)| ip.to_string())
        .unwrap_or_else(|| "127.0.0.1".to_string())
}

pub fn external_ip() -> Result<String, String> {
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(6))
        .build()
        .map_err(|e| format!("Сеть недоступна: {}", e))?;

    let text = client
        .get("https://api.ipify.org")
        .send()
        .map_err(|e| format!("Не удалось получить внешний IP: {}", e))?
        .text()
        .map_err(|e| format!("Не удалось прочитать ответ: {}", e))?;

    let ip = text.trim().to_string();
    if ip.is_empty() {
        return Err("Сервис вернул пустой адрес".to_string());
    }
    Ok(ip)
}

pub fn check_port(host: &str, port: u16) -> Result<bool, String> {
    let host = host.trim();
    if host.is_empty() {
        return Err("Укажите адрес хоста".to_string());
    }

    let address = format!("{}:{}", host, port);
    let socket = address
        .to_socket_addrs()
        .map_err(|_| "Некорректный адрес".to_string())?
        .next()
        .ok_or_else(|| "Адрес не найден".to_string())?;

    Ok(TcpStream::connect_timeout(&socket, Duration::from_secs(3)).is_ok())
}

/// Проверяет игровой сервер: сначала TCP-подключение (новые игры), затем,
/// если TCP молчит, — UDP-запрос по игровому протоколу. Старые игры (CS 1.6,
/// HL и т.п.) живут на UDP и TCP не открывают, поэтому простого TCP-чека
/// недостаточно. Возвращает Ok(true), если хост ответил хоть как-то.
pub fn check_server(host: &str, port: u16) -> Result<bool, String> {
    let host = host.trim();
    if host.is_empty() {
        return Err("Укажите адрес хоста".to_string());
    }

    let address = format!("{}:{}", host, port);
    let socket = address
        .to_socket_addrs()
        .map_err(|_| "Некорректный адрес".to_string())?
        .next()
        .ok_or_else(|| "Адрес не найден".to_string())?;

    // 1) TCP — заглушает современные серверы (Source, мэтчмейкинг и т.п.)
    if TcpStream::connect_timeout(&socket, Duration::from_secs(3)).is_ok() {
        return Ok(true);
    }

    // 2) UDP — старые игры. Пробуем два запроса: современный A2S_INFO
    //    («Source Engine Query») и классический GoldSource «details».
    Ok(udp_ping(host, port, b"Source Engine Query\x00")
        || udp_ping(host, port, b"details\x00"))
}

fn udp_ping(host: &str, port: u16, payload: &[u8]) -> bool {
    let Ok(sock) = UdpSocket::bind(("0.0.0.0", 0)) else {
        return false;
    };
    if sock.set_read_timeout(Some(Duration::from_secs(2))).is_err() {
        return false;
    }

    let mut packet = vec![0xFFu8, 0xFF, 0xFF, 0xFF];
    packet.extend_from_slice(payload);
    if sock.send_to(&packet, (host, port)).is_err() {
        return false;
    }

    let mut buf = [0u8; 256];
    sock.recv_from(&mut buf).is_ok()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::TcpListener;

    #[test]
    fn detects_open_port() {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind");
        let port = listener.local_addr().unwrap().port();
        assert!(check_port("127.0.0.1", port).unwrap());
    }

#[test]
    fn rejects_empty_host() {
        assert!(check_port("", 80).is_err());
    }

    #[test]
    #[ignore = "requires network"]
    fn live_cs16_udp_server() {
        assert!(check_server("93.114.82.47", 27015).unwrap());
    }
}
