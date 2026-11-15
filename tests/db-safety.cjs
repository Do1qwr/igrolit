/**
 * Проверка защиты базы: бэкапы при старте, ротация, восстановление из бэкапа.
 * Самодостаточна: создаёт временную базу, реальные данные не трогает.
 * Запуск: npm run test:db
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn, spawnSync } = require('child_process');

const APP = path.join(__dirname, '..');
const SERVER = path.join(APP, 'online-server', 'server.js');
const TEMP = path.join(os.tmpdir(), 'igrolit-db-test');
const DATA = path.join(TEMP, 'data.json');
const BACKUPS = path.join(TEMP, 'backups');
const LOG = path.join(TEMP, 'server.log');
const PORT = 8791;

const MINIMAL_DB = {
  users: { test: { name: 'test', coins: 5, created: Date.now() } },
  admins: ['admin1'],
  public_servers: [],
  pending_servers: [],
};

const results = [];
function check(name, ok, extra) {
  results.push({ name, ok });
  console.log((ok ? '  OK   ' : '  FAIL ') + name + (extra ? ' → ' + extra : ''));
}

function reset() {
  fs.rmSync(TEMP, { recursive: true, force: true });
  fs.mkdirSync(TEMP, { recursive: true });
  fs.writeFileSync(DATA, JSON.stringify(MINIMAL_DB, null, 2), 'utf8');
}

function start() {
  spawn('node', [SERVER], {
    cwd: APP,
    detached: true,
    stdio: 'ignore',
    env: { ...process.env, PORT: String(PORT), DATA_FILE: DATA, ADMIN_NAMES: 'admin1' },
  }).unref();
}

function status() {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port: PORT, path: '/status', timeout: 1000 }, (res) => {
      res.resume();
      res.on('end', () => resolve(res.statusCode === 200));
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitReady() {
  for (let i = 0; i < 60; i += 1) {
    if (await status()) return true;
    await new Promise((r) => setTimeout(r, 150));
  }
  return false;
}

function stop() {
  const net = spawnSync('netstat', ['-ano'], { encoding: 'utf8' });
  const line = (net.stdout || '')
    .split(/\r?\n/)
    .find((l) => l.includes(':' + PORT) && l.includes('LISTENING'));
  if (!line) return;
  spawnSync('taskkill', ['/PID', line.trim().split(/\s+/).pop(), '/F'], { stdio: 'ignore' });
}

function backups() {
  try {
    return fs.readdirSync(BACKUPS).filter((f) => f.endsWith('.json'));
  } catch {
    return [];
  }
}

function logText() {
  try {
    return fs.readFileSync(LOG, 'utf8');
  } catch {
    return '';
  }
}

(async () => {
  reset();

  start();
  const ready = await waitReady();
  stop();
  await new Promise((r) => setTimeout(r, 400));
  check('сервер стартует на базе', ready);
  check('бэкап создан при старте', backups().length === 1, 'файлов: ' + backups().length);
  check('запись о бэкапе есть в логе', logText().includes('backup created'));

  for (let i = 0; i < 12; i += 1) {
    start();
    await waitReady();
    stop();
    await new Promise((r) => setTimeout(r, 250));
  }
  const count = backups().length;
  check('ротация держит не больше 10 бэкапов', count <= 10, 'файлов: ' + count);

  fs.writeFileSync(DATA, '{ это не json', 'utf8');
  const before = logText().length;
  start();
  const readyAfter = await waitReady();
  stop();
  await new Promise((r) => setTimeout(r, 400));
  const fresh = logText().slice(before);
  check('сервер поднялся на битой базе', readyAfter);
  check('в логе есть восстановление из бэкапа', fresh.includes('восстановлено из'));
  const corrupt = fs.readdirSync(TEMP).filter((f) => f.includes('.corrupt-'));
  check('испорченный файл сохранён отдельно', corrupt.length > 0, corrupt[0] || '');

  fs.rmSync(TEMP, { recursive: true, force: true });

  const failed = results.filter((r) => !r.ok).length;
  console.log('\nИтог: ' + (results.length - failed) + ' прошло, ' + failed + ' упало');
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error('ОШИБКА:', e.message);
  process.exit(1);
});
