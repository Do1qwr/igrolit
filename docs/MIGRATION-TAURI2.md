Миграция Igrolit на Tauri 2
============================

Зачем
-----
Tauri 1.x — предыдущая ветка: новые фичи, плагины и security-фиксы выходят только
в 2.x. Tauri 2 даёт официальный updater, мобильные сборки, изолированные
permissions (capabilities), нормальный tray/menu API и сборку под ARM64.

Что меняется по существу (не косметика):

| Область        | Сейчас (1.5)                              | Нужно (2.x)                                  |
|----------------|-------------------------------------------|----------------------------------------------|
| Зависимости    | tauri 1.5, tauri-build 1.5                | tauri 2, tauri-build 2                       |
| Диалоги        | feature "dialog" из tauri                 | tauri-plugin-dialog + разрешения             |
| Открытие ссылок| feature "shell-open"                      | tauri-plugin-opener (или shell)              |
| Трей           | SystemTray + CustomMenuItem               | TrayIconBuilder + Menu/MenuItem              |
| События        | emit_all / listen                         | emit + Emitter                               |
| Конфиг         | tauri.{windows,bundle}, tauri.allowlist   | app.{windows}, bundle, capabilities/*.json   |
| Фронтенд       | @tauri-apps/api 1.x (`api/tauri`)         | @tauri-apps/api 2.x (`api/core`) + плагины    |
| Обновления     | свой updater (подмена exe)                | свой остаётся, но можно перейти на plugin    |

Наш собственный цикл обновлений (Ed25519 + одноразовое согласие) от версии
фреймворка не зависит — его переносим как есть.

Ветка и откат
-------------
1. `git checkout -b tauri2` в app\.
2. Первый коммит — «как есть» (точка отката).
3. Тег на текущем релизе: `git tag v1.6.1-core1`.
4. Если миграция упирается — `git checkout main`, релиз 1.6.1 остаётся рабочим.

Порядок работ
-------------
Шаг 1. Зависимости фронтенда
  npm i @tauri-apps/api@^2 @tauri-apps/plugin-dialog@^2 @tauri-apps/plugin-opener@^2
  npm i -D @tauri-apps/cli@^2

Шаг 2. Cargo.toml
  tauri = { version = "2", features = ["tray-icon", "protocol-asset"] }
  tauri-build = { version = "2" }
  tauri-plugin-dialog = "2"
  tauri-plugin-opener = "2"

Шаг 3. Конфиг
  - tauri.conf.json → схема v2: `app.windows`, `bundle`, `identifier` на верхнем
    уровне, `app.security.csp` переносится сюда же.
  - Удалить `tauri.allowlist` (в v2 его нет).
  - Добавить `src-tauri/capabilities/default.json` с разрешениями:
    core:default, dialog:default, opener:default, при необходимости
    window:allow-*, event:default.

Шаг 4. Rust API (main.rs, ~2300 строк)
  - [ ] Builder: `.plugin(tauri_plugin_dialog::init()).plugin(tauri_plugin_opener::init())`.
  - [ ] Трей: SystemTray → TrayIconBuilder::new().menu(&menu).on_menu_event(...)
        (файл: блок вокруг строк 2050–2090).
  - [ ] Меню: CustomMenuItem → Menu::with_items + MenuItem::with_id.
  - [ ] emit_all → app.emit(...).
  - [ ] Диалоги (открытие файлов) → tauri_plugin_dialog::DialogExt.
  - [ ] Открытие url → tauri_plugin_opener::OpenerExt (или shell::open).
  - [ ] Окна: `app.get_window("main")` → `app.get_webview_window("main")`.
  - [ ] События окна/мыши: проверить сигнатуры (изменились в tao 0.25+).
  - [ ] Команды (invoke) не переименовывать — фронтенд их вызывает по именам.

Шаг 5. Фронтенд (~35 компонентов)
  - [ ] `@tauri-apps/api/tauri` → `@tauri-apps/api/core` (invoke, convertFileSrc).
  - [ ] dialog: `@tauri-apps/plugin-dialog`.
  - [ ] shell/open: `@tauri-apps/plugin-opener`.
  - [ ] `appWindow` из `@tauri-apps/api/window` остаётся, но часть методов
        переехала в плагины разрешений.
  - [ ] Проверить `listen('tauri://resize')` — в v2 события окна называются иначе
        (window events через `getCurrentWindow().onResized`).

Шаг 6. Сборка и проверка
  npm run typecheck && cargo clippy
  npm run build:dev && npx tauri build --config src-tauri/tauri.dev.conf.json
  Проверки вживую:
  - окно открывается, трей работает, меню «⋯» открывается;
  - выбор файла (обложка игры) открывает системный диалог;
  - запуск игры и «Открыть папку» работают;
  - «Выкатить обновление»: подпись, согласие, публикация;
  - режим техработ и проверка обновлений.

Где ждать проблем
-----------------
1. Capabilities: если забыть разрешение — вызов молча падает в консоль
   «not allowed». Лечится добавлением permission в capabilities/default.json.
2. Трей: в v2 меню создаётся до TrayIcon; у нас в меню 3 пункта — переписать
   целиком, а не патчить.
3. Диалоги: async-модель (DialogExt) вместо блокирующих вызовов — поменяются
   места вызова в командах загрузки обложек.
4. События окна: `tauri://resize` заменяется на `onResized()`.
5. Подпись/обновления: путь к exe и права не меняются, но проверить
   `std::process::exit(0)` и перезапуск после подмены.

Оценка
------
- Мeханическая часть (зависимости, конфиг, импорты): 4–6 часов.
- Rust API (трей, меню, диалоги, окна): 6–10 часов.
- Отладка capabilities и сборки: 2–4 часа.
- Итого 1,5–2 рабочих дня с проверками на каждом шаге.

Что делать сейчас, а что потом
------------------------------
Сейчас база приведена в порядок: типы 0 ошибок, clippy 0 предупреждений,
сборка проверена. Это делает миграцию безопасной — любая поломка будет видна
на typecheck/clippy, а не всплывёт в проде.

Миграцию начинать с ветки `tauri2` и первого «пустого» коммита, чтобы откат был
в одну команду.
