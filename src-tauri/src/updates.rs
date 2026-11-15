/// Проверка Ed25519-подписи файла обновления.
///
/// Закрытый ключ подписи хранится только у издателя (`update-signing.key`
/// рядом с dev-приложением), публичный вшит в клиент через `update.pub`.
/// Подмена exe на сервере без закрытого ключа не пройдёт проверку.
pub fn verify_update_signature(sig_hex: &str, file: &[u8]) -> bool {
    crate::verify_update(file, sig_hex)
}

#[tauri::command]
pub fn verify_update_cmd(sig: String, file_bytes: Vec<u8>) -> bool {
    let valid = verify_update_signature(&sig, &file_bytes);
    crate::audit::append(
        "update_verified",
        "system",
        if valid {
            "подпись обновления подтверждена"
        } else {
            "подпись обновления НЕ подтверждена"
        },
    );
    valid
}
