# Онлайн-сервер Game Launcher

WebSocket-сервер для друзей, статусов и чата. Работает без внешних зависимостей, кроме `ws`.

## Локальный запуск

```bash
npm install
npm start
```

Сервер слушает `0.0.0.0:8787`, проверка: `GET /health` → `ok`.

## Деплой (чтобы не зависеть от компьютера хоста)

### Fly.io

```bash
fly launch --no-deploy --name gamelauncher-online --region ams
fly deploy
```

Адрес будет вида `wss://gamelauncher-online.fly.dev`.

### Render.com

1. Загрузить папку `online-server` в Git-репозиторий.
2. Создать Blueprint по `render.yaml` (или Web Service с Docker).
3. После деплоя получить адрес вида `wss://<name>.onrender.com`.

Бесплатный тариф Render засыпает при простое — первый запрос может занять несколько секунд.

### Свой VPS

```bash
docker build -t gamelauncher-online .
docker run -d --name online -p 8787:8787 --restart unless-stopped gamelauncher-online
```

Для интернета поставьте nginx с TLS перед сервером и проксируйте WebSocket:

```nginx
location / {
  proxy_pass http://127.0.0.1:8787;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  proxy_set_header Host $host;
}
```

Адрес для лаунчера: `wss://<домен>` (без порта при прокси).

## В лаунчере

Раздел «Онлайн» → поле «Сервер» → `wss://<адрес сервера>`.

## Важно

- Данные (`data.json`) хранятся на сервере. Сделайте бэкап или подключите том (`-v ./data:/app/data`).
- Пароли хранятся в виде scrypt-хэшей с солью; токены сессий — случайные.
- Для публичного сервиса нужны согласие на обработку персональных данных и модерация чата.
