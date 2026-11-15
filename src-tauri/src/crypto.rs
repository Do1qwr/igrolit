use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Key, Nonce};
use rand::rngs::OsRng;
use rand::RngCore;

/// Генерирует случайный 12-байтовый nonce (обязателен при каждом шифровании).
fn random_nonce() -> [u8; 12] {
    let mut n = [0u8; 12];
    OsRng.fill_bytes(&mut n);
    n
}

/// Шифрует данные AES-256-GCM. Формат: [12-байтовый nonce][шифротекст+tag].
/// nonce уникален для каждого шифрования — это критично для GCM.
pub fn encrypt_pii(data: &[u8], key: &[u8; 32]) -> Vec<u8> {
    let key = Key::<Aes256Gcm>::from_slice(key);
    let cipher = Aes256Gcm::new(key);
    let nonce = random_nonce();
    match cipher.encrypt(Nonce::from_slice(&nonce), data) {
        Ok(ct) => {
            let mut out = Vec::with_capacity(12 + ct.len());
            out.extend_from_slice(&nonce);
            out.extend_from_slice(&ct);
            out
        }
        Err(_) => Vec::new(),
    }
}

/// Расшифровывает формат, созданный `encrypt_pii`.
pub fn decrypt_pii(data: &[u8], key: &[u8; 32]) -> Vec<u8> {
    if data.len() < 12 {
        return Vec::new();
    }
    let key = Key::<Aes256Gcm>::from_slice(key);
    let cipher = Aes256Gcm::new(key);
    let (nonce, ct) = data.split_at(12);
    match cipher.decrypt(Nonce::from_slice(nonce), ct) {
        Ok(pt) => pt,
        Err(_) => Vec::new(),
    }
}

/// Ключ шифрования из переменной окружения ENCRYPTION_KEY (64 hex-символа).
/// Если переменная не задана — ключ генерируется один раз и сохраняется в файл
/// (не перезагружается из нулей, иначе все зашифрованные данные станут нечитаемыми).
pub fn get_encryption_key() -> [u8; 32] {
    if let Ok(env_key) = std::env::var("ENCRYPTION_KEY") {
        if let Ok(bytes) = hex::decode(&env_key) {
            if bytes.len() == 32 {
                let mut key = [0u8; 32];
                key.copy_from_slice(&bytes);
                return key;
            }
        }
    }
    persist_or_load_key()
}

fn key_file_path() -> std::path::PathBuf {
    dirs::data_local_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("game-launcher")
        .join("encryption.key")
}

fn persist_or_load_key() -> [u8; 32] {
    let path = key_file_path();
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    if path.exists() {
        if let Ok(raw) = std::fs::read(&path) {
            if raw.len() == 32 {
                let mut key = [0u8; 32];
                key.copy_from_slice(&raw);
                return key;
            }
        }
    }
    let mut key = [0u8; 32];
    OsRng.fill_bytes(&mut key);
    let _ = std::fs::write(&path, &key);
    key
}