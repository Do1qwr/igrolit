const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const { queryServer } = require('./query');

const PORT = Number(process.env.PORT || 8787);
const DATA_FILE = path.resolve(process.env.DATA_FILE || path.join(__dirname, 'data.json'));
const BANNER_DIR = path.join(path.dirname(DATA_FILE), 'banners');
const RELEASES_DIR = path.join(path.dirname(DATA_FILE), 'releases');
const LOG_FILE = path.join(path.dirname(DATA_FILE), 'server.log');
const BACKUP_DIR = path.join(path.dirname(DATA_FILE), 'backups');
const BACKUP_KEEP = 10;

function appendLogLine(text) {
  try {
    fs.appendFileSync(LOG_FILE, '[' + new Date().toISOString() + '] ' + text + '\n');
  } catch {}
}

function backupStamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return (
    d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' +
    p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds()) + '-' +
    String(d.getMilliseconds()).padStart(3, '0')
  );
}

function backupFiles() {
  try {
    return fs
      .readdirSync(BACKUP_DIR)
      .filter((f) => f.endsWith('.json'))
      .sort();
  } catch {
    return [];
  }
}

function newestBackup() {
  const files = backupFiles();
  return files.length ? path.join(BACKUP_DIR, files[files.length - 1]) : null;
}

function makeBackup(reason) {
  try {
    if (!fs.existsSync(DATA_FILE)) return;
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const target = path.join(BACKUP_DIR, 'data-' + backupStamp() + '.json');
    fs.copyFileSync(DATA_FILE, target);
    const files = backupFiles();
    while (files.length > BACKUP_KEEP) {
      const old = files.shift();
      try {
        fs.unlinkSync(path.join(BACKUP_DIR, old));
      } catch {}
    }
    console.log('backup created:', path.basename(target), reason || '');
  } catch (e) {
    console.warn('backup failed:', e && e.message ? e.message : e);
  }
}

function appendLog(line) {
  try {
    fs.appendFileSync(LOG_FILE, line + '\n');
  } catch {}
}
const nativeLog = console.log.bind(console);
const nativeError = console.error.bind(console);
console.log = (...args) => {
  nativeLog(...args);
  appendLog('[' + new Date().toISOString() + '] ' + args.map((a) => String(a)).join(' '));
};
console.error = (...args) => {
  nativeError(...args);
  appendLog('[' + new Date().toISOString() + '] ERROR ' + args.map((a) => String(a)).join(' '));
};
console.log('server start, data:', DATA_FILE);
const BANNER_MIME = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
try {
  fs.mkdirSync(BANNER_DIR, { recursive: true });
} catch {}

// admins: список имён, которые могут одобрять серверы.
// Можно задать через переменную окружения ADMIN_NAMES ("moder,admin2").
const ENV_ADMINS = (process.env.ADMIN_NAMES || '')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);
let db = { users: {}, admins: ENV_ADMINS, public_servers: [], pending_servers: [] };
try {
  const raw = fs.readFileSync(DATA_FILE, 'utf8');
  const parsed = JSON.parse(raw);
  if (parsed && parsed.users) {
    db = {
      users: parsed.users || {},
      admins: ENV_ADMINS.length ? ENV_ADMINS : (parsed.admins || []),
      public_servers: parsed.public_servers || [],
      pending_servers: parsed.pending_servers || [],
audit: parsed.audit || [],
      tickets: parsed.tickets || [],
      complaints: parsed.complaints || [],
      orders: parsed.orders || [],
      groups: parsed.groups || [],
    };
  }
} catch (error) {
  const recover = newestBackup();
  if (recover) {
    try {
      const parsed = JSON.parse(fs.readFileSync(recover, 'utf8'));
      if (!parsed || !parsed.users) throw new Error('backup_bad_shape');
      db = {
        users: parsed.users || {},
        admins: ENV_ADMINS.length ? ENV_ADMINS : (parsed.admins || []),
        public_servers: parsed.public_servers || [],
        pending_servers: parsed.pending_servers || [],
        audit: parsed.audit || [],
        tickets: parsed.tickets || [],
        complaints: parsed.complaints || [],
        orders: parsed.orders || [],
        groups: parsed.groups || [],
      };
      const recoveryNote =
        'data.json повреждён (' +
        (error && error.message ? error.message : error) +
        '), восстановлено из ' +
        path.basename(recover);
      appendLogLine(recoveryNote);
      console.warn(recoveryNote);
      try {
        fs.copyFileSync(DATA_FILE, DATA_FILE + '.corrupt-' + backupStamp());
      } catch {}
    } catch {
      console.warn('бэкап не подошёл — старт с пустой базой');
      db = { users: {}, admins: ENV_ADMINS, public_servers: [], pending_servers: [] };
    }
  } else {
    console.warn('data.json не прочитан, бэкапов нет — старт с пустой базой');
    db = { users: {}, admins: ENV_ADMINS, public_servers: [], pending_servers: [] };
  }
}

db.audit = Array.isArray(db.audit) ? db.audit : [];
db.public_servers = Array.isArray(db.public_servers) ? db.public_servers : [];
db.groups = Array.isArray(db.groups) ? db.groups : [];
db.pending_servers = Array.isArray(db.pending_servers) ? db.pending_servers : [];
db.tickets = Array.isArray(db.tickets) ? db.tickets : [];
db.complaints = Array.isArray(db.complaints) ? db.complaints : [];
db.orders = Array.isArray(db.orders) ? db.orders : [];
db.meta = db.meta && typeof db.meta === 'object' ? db.meta : {};
if (!db.meta.maintenance || typeof db.meta.maintenance !== 'object') {
  db.meta.maintenance = { on: false, message: '', since: 0 };
}

makeBackup('startup');

// Уникальный числовой ID игрока. Выдаётся при регистрации; существующим — при загрузке.
// db.seqUid хранит счётчик следующего свободного ID, чтобы не выдавать повторно.
db.seqUid = Number(db.seqUid) || 0;
for (const user of Object.values(db.users)) {
  if (!user.uid) {
    db.seqUid += 1;
    user.uid = db.seqUid;
  } else if (Number(user.uid) > db.seqUid) {
    db.seqUid = Number(user.uid);
  }
}

function nextUid(user) {
  if (user.uid) return user.uid;
  db.seqUid += 1;
  const id = db.seqUid;
  user.uid = id;
  return id;
}

// Находит юзера по нику или по числовому ID (строка из цифр => ID).
// Ники хранятся как введены ("Корона", "Korona"), но находятся без учёта регистра.
// Возвращает реальный ключ пользователя либо ник в нижнем регистре, если такого нет.
function resolveUserName(ref) {
  const raw = String(ref || '').trim();
  if (!raw) return '';
  const lower = raw.toLowerCase();
  if (db.users[lower]) return lower;
  for (const key of Object.keys(db.users)) {
    if (key.toLowerCase() === lower) return key;
  }
  return lower;
}

function userByRef(ref) {
  const key = resolveUserName(ref);
  if (!key) return null;
  if (/^\d+$/.test(key)) {
    const n = Number(key);
    for (const user of Object.values(db.users)) {
      if (Number(user.uid) === n) return user;
    }
    return null;
  }
  return db.users[key] || null;
}
for (const server of db.public_servers) {
  const promo = server.promo;
  if (!promo || typeof promo !== 'object') continue;
  if (promo.frame && !promo.color) promo.color = '#e3a13b';
  if (promo.color && !promo.highlight) promo.highlight = promo.color;
  if (promo.describe && !promo.size) promo.size = 'large';
  delete promo.frame;
  delete promo.glow;
  delete promo.soft;
  delete promo.describe;
}
for (const server of db.public_servers) {
  server.voters = voterList(server).map((item) => ({
    name: item.name,
    ts: item.ts || server.added || 0,
  }));
}


// Версия документов (соглашение, политика, лицензия). Меняется при публикации новой редакции:
// пользователь с устаревшей версией получает запрос на повторное согласие.
const CONSENT_VERSION = '2026-11-13';
const PASS_MIN = 8;
const PASS_MAX = 200;

// Пресеты оформления профиля (без файлов — рисуются на клиенте).
const FREE_FRAMES = ['none', 'gold', 'ember', 'frost', 'neon'];
const EARNED_FRAMES = ['bronze', 'royal', 'void', 'legend', 'toxic'];
const FRAMES = [...FREE_FRAMES, ...EARNED_FRAMES];

const FREE_COVERS = ['aurora', 'sunset', 'ocean', 'forest', 'nebula', 'graphite'];
const EARNED_COVERS = ['dawn', 'matrix', 'ice', 'magma'];
const COVERS = [...FREE_COVERS, ...EARNED_COVERS];

// Надёжный пароль: от 10 символов, буквы разного регистра и хотя бы одна цифра.
function passwordStrong(pass) {
  if (typeof pass !== 'string') return false;
  if (pass.length < 10) return false;
  if (!/[a-zа-я]/.test(pass) || !/[A-ZА-Я]/.test(pass)) return false;
  if (!/\d/.test(pass)) return false;
  return true;
}
const IP_WINDOW_MS = 5 * 60 * 1000;
const IP_MAX_FAILS = 20;
// Сессии не истекают: вход выполняется один раз, выход — только вручную.
const MAX_SESSIONS = 200;

const DEFAULT_PRIVACY = {
  profile: 'everyone',
  game: 'everyone',
  friends: 'everyone',
  lastSeen: 'friends',
  photo: 'friends',
  messages: 'friends',
  friendRequests: 'everyone',
  showName: 'everyone',
};

function normalizePrivacy(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const pick = (value, allowed, fallback) =>
    allowed.includes(value) ? value : fallback;
  return {
    profile: pick(src.profile, ['everyone', 'friends', 'nobody'], DEFAULT_PRIVACY.profile),
    game: pick(src.game, ['everyone', 'friends', 'nobody'], DEFAULT_PRIVACY.game),
    friends: pick(src.friends, ['everyone', 'friends', 'nobody'], DEFAULT_PRIVACY.friends),
    lastSeen: pick(src.lastSeen, ['everyone', 'friends', 'nobody'], DEFAULT_PRIVACY.lastSeen),
    photo: pick(src.photo, ['everyone', 'friends', 'nobody'], DEFAULT_PRIVACY.photo),
    messages: pick(src.messages, ['everyone', 'friends'], DEFAULT_PRIVACY.messages),
    friendRequests: pick(src.friendRequests, ['everyone', 'nobody'], DEFAULT_PRIVACY.friendRequests),
    showName: pick(src.showName, ['everyone', 'friends', 'nobody'], DEFAULT_PRIVACY.showName),
  };
}

// Псевдоним для пользователя, который скрыл имя: «Игрок <uid>»
function displayNameOf(user, viewer) {
  const privacy = normalizePrivacy(user.privacy);
  if (viewer && viewer !== user.name && !privacyAllows(privacy.showName, viewer, user.name)) {
    return `Игрок ${user.uid ? Number(user.uid) : ''}`.trim();
  }
  return user.name;
}

for (const user of Object.values(db.users)) {
  if (!Array.isArray(user.sessions)) user.sessions = [];
  if (!user.consent) user.consent = null;
  if (typeof user.passLen !== 'number') user.passLen = 0;
  user.privacy = normalizePrivacy(user.privacy);
}

for (const user of Object.values(db.users)) {
  if (!user.createdAt) user.createdAt = Date.now();
  if (typeof user.logins !== 'number') user.logins = 1;
  if (typeof user.onlineMs !== 'number') user.onlineMs = 0;
  if (!Array.isArray(user.gamesSeen)) user.gamesSeen = [];
}

const TITLES = [
  { name: 'Новичок', xp: 0 },
  { name: 'Игрок', xp: 10 },
  { name: 'Опытный', xp: 40 },
  { name: 'Ветеран', xp: 120 },
  { name: 'Мастер', xp: 250 },
  { name: 'Легенда', xp: 500 },
  { name: 'Гранд', xp: 900 },
  { name: 'Бессмертный', xp: 1500 },
];

const ACHIEVEMENTS = [
  { id: 'first_game', name: 'Первый запуск', metric: 'games', need: 1, rarity: 'common', desc: 'Запустить первую игру из лаунчера', reward: { kind: 'badge', id: 'first_game', label: 'Значок «Первооткрыватель»', icon: '▦' } },
  { id: 'games12', name: 'Дюжина игр', metric: 'games', need: 12, rarity: 'rare', desc: 'Собрать 12 разных игр', reward: { kind: 'cover', id: 'matrix', label: 'Обложка «Матрица»' } },
  { id: 'hours10', name: 'Десять часов', metric: 'hours', need: 10, rarity: 'common', desc: 'Наиграть 10 часов', reward: { kind: 'badge', id: 'hours10', label: 'Значок «Часы»', icon: '◷' } },
  { id: 'hours100', name: 'Сотня часов', metric: 'hours', need: 100, rarity: 'rare', desc: 'Наиграть 100 часов', reward: { kind: 'frame', id: 'bronze', label: 'Рамка «Бронза»' } },
  { id: 'hours500', name: 'Полтысячи', metric: 'hours', need: 500, rarity: 'epic', desc: 'Наиграть 500 часов', reward: { kind: 'frame', id: 'royal', label: 'Рамка «Королевская»' } },
  { id: 'friend1', name: 'Есть контакт', metric: 'friends', need: 1, rarity: 'common', desc: 'Завести первого друга', reward: { kind: 'badge', id: 'friend1', label: 'Значок «Контакт»', icon: '♦' } },
  { id: 'friend5', name: 'Своя компания', metric: 'friends', need: 5, rarity: 'rare', desc: 'Собрать пять друзей', reward: { kind: 'cover', id: 'dawn', label: 'Обложка «Рассвет»' } },
  { id: 'voter3', name: 'Критик', metric: 'votesGiven', need: 3, rarity: 'common', desc: 'Оценить три профиля', reward: { kind: 'badge', id: 'voter3', label: 'Значок «Критик»', icon: '✎' } },
  { id: 'liked3', name: 'Наш человек', metric: 'votesReceived', need: 3, rarity: 'rare', desc: 'Получить три лайка за репутацию', reward: { kind: 'frame', id: 'void', label: 'Рамка «Пустота»' } },
  { id: 'rep80', name: 'Уважаемый', metric: 'reputation', need: 80, rarity: 'rare', desc: 'Поднять репутацию до 80', reward: { kind: 'frame', id: 'legend', label: 'Рамка «Легенда»' } },
  { id: 'group1', name: 'Свой уголок', metric: 'groups', need: 1, rarity: 'common', desc: 'Подписаться на группу', reward: { kind: 'badge', id: 'group1', label: 'Значок «Свой уголок»', icon: '▤' } },
  { id: 'server1', name: 'Хозяин сервера', metric: 'servers', need: 1, rarity: 'epic', desc: 'Добавить свой сервер в мониторинг', reward: { kind: 'cover', id: 'ice', label: 'Обложка «Лёд»' } },
  { id: 'veteran180', name: 'Ветеран', metric: 'days', need: 180, rarity: 'epic', desc: 'Полгода в лаунчере', reward: { kind: 'cover', id: 'magma', label: 'Обложка «Магма»' } },
  { id: 'legend500', name: 'Легенда', metric: 'days', need: 500, rarity: 'legendary', desc: 'Больше года в лаунчере', reward: { kind: 'frame', id: 'toxic', label: 'Рамка «Токсин»' } },
  { id: 'dossier_filled', name: 'Визитка', metric: 'profileFilled', need: 1, rarity: 'common', desc: 'Заполнить дату рождения, пол, страну и город', reward: { kind: 'badge', id: 'dossier_filled', label: 'Значок «Визитка»', icon: '✪' } },
  { id: 'avatar_set', name: 'Лицо профиля', metric: 'hasAvatar', need: 1, rarity: 'common', desc: 'Установить аватар', reward: { kind: 'badge', id: 'avatar_set', label: 'Значок «Лицо»', icon: '◉' } },
  { id: 'twofa_on', name: 'Ключ и замок', metric: 'twofa', need: 1, rarity: 'rare', desc: 'Включить двухфакторную аутентификацию', reward: { kind: 'badge', id: 'twofa_on', label: 'Значок «Страж»', icon: '⛨' } },
  { id: 'group_created', name: 'Основатель', metric: 'createdGroups', need: 1, rarity: 'rare', desc: 'Создать свою группу', reward: { kind: 'badge', id: 'group_created', label: 'Значок «Основатель»', icon: '✦' } },
];

// Праздничные «койны»: вручаются автоматически в день праздника (по местному времени сервера).
// Каждый койн привязан к дате (месяц.день) и выдаётся раз в год — по году в записи юзера.
// uniqueId: базовый id (без года) + год. rarity — редкость койна, symbol — метка на жетоне.
const HOLIDAYS = [
  { id: 'ny', month: 1, day: 1, name: 'Новогодний койн', rarity: 'legendary', symbol: '❄' },
  { id: 'jan2', month: 1, day: 2, name: 'После Нового года', rarity: 'epic', symbol: '🎄' },
  { id: 'feb23', month: 2, day: 23, name: 'Защитник праздника', rarity: 'rare', symbol: '★' },
  { id: 'march8', month: 3, day: 8, name: 'Весенний койн', rarity: 'rare', symbol: '✿' },
  { id: 'april1', month: 4, day: 1, name: 'Шутник', rarity: 'rare', symbol: '☺' },
  { id: 'may9', month: 5, day: 9, name: 'День Победы', rarity: 'legendary', symbol: '✷' },
  { id: 'june1', month: 6, day: 1, name: 'Койн детства', rarity: 'rare', symbol: '★' },
  { id: 'july_mid', month: 7, day: 12, name: 'Летний койн', rarity: 'rare', symbol: '☀' },
  { id: 'aug_mid', month: 8, day: 12, name: 'Койн августа', rarity: 'rare', symbol: '☀' },
  { id: 'sept1', month: 9, day: 1, name: 'Койн знаний', rarity: 'epic', symbol: '✎' },
  { id: 'oct31', month: 10, day: 31, name: 'Ужасный койн', rarity: 'epic', symbol: '☠' },
  { id: 'nov4', month: 11, day: 4, name: 'День единства', rarity: 'rare', symbol: '◆' },
  { id: 'dec31', month: 12, day: 31, name: 'Канун Нового года', rarity: 'legendary', symbol: '🎇' },
];

function holidayKey(def, year) {
  return def.id + '_' + Math.abs(year);
}

// Проверяет, приходится ли сейчас праздник, и вручает койны, которых у юзера ещё нет за этот год.
// Возвращает список только что выданных койнов { id, name, symbol, rarity }.
function grantHolidays(user) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const d = now.getDate();
  const granted = [];
  for (const def of HOLIDAYS) {
    if (def.month !== m || def.day !== d) continue;
    const key = holidayKey(def, y);
    user.holidays = user.holidays || {};
    if (!user.holidays[key]) {
      user.holidays[key] = y;
      granted.push({ id: key, name: def.name, symbol: def.symbol, rarity: def.rarity, need: 1 });
    }
  }
  if (granted.length) save();
  return granted;
}

function userMetrics(user) {
  const created = user.createdAt || Date.now();
  const name = user.name;
  const votesReceived = Object.values(user.ratings || {}).filter((v) => v > 0).length;
  let votesGiven = 0;
  for (const other of Object.values(db.users)) {
    if (other.name === name) continue;
    if ((other.ratings || {})[name]) votesGiven++;
  }
  return {
    hours: Math.floor((user.onlineMs || 0) / 3600000),
    logins: user.logins || 0,
    games: Array.isArray(user.gamesSeen) ? user.gamesSeen.length : 0,
    friends: Array.isArray(user.friends) ? user.friends.length : 0,
    reputation: user.reputation ?? 50,
    days: Math.max(0, Math.floor((Date.now() - created) / 86400000)),
    votesReceived,
    votesGiven,
    groups: Array.isArray(user.subs) ? user.subs.length : 0,
    servers: (db.servers || []).filter((s) => s.by === name).length,
    createdGroups: (db.groups || []).filter((g) => g.by === name).length,
    profileFilled: user.birthdate && user.gender && user.country && user.city ? 1 : 0,
    hasAvatar: user.avatar ? 1 : 0,
    hasCover: user.cover ? 1 : 0,
    twofa: user.totp ? 1 : 0,
  };
}

// Награды, доступные пользователю: свободные + открытые выполненными достижениями.
function achievementRewards(user) {
  const m = userMetrics(user);
  const frames = new Set(FREE_FRAMES);
  const covers = new Set(FREE_COVERS);
  const badges = [];
  for (const item of ACHIEVEMENTS) {
    if (!item.reward) continue;
    if ((m[item.metric] || 0) < item.need) continue;
    if (item.reward.kind === 'frame') frames.add(item.reward.id);
    else if (item.reward.kind === 'cover') covers.add(item.reward.id);
    else badges.push(item.reward);
  }
  return { frames, covers, badges };
}

function userXp(user) {
  const m = userMetrics(user);
  return m.hours * 2 + m.logins + m.games * 5 + m.friends * 3 + Math.floor(m.reputation / 5) + m.days;
}

function titleInfo(user) {
  const m = userMetrics(user);
  const xp = userXp(user);
  let current = TITLES[0];
  for (const title of TITLES) if (xp >= title.xp) current = title;
  const next = TITLES.find((title) => title.xp > xp) || null;
  return {
    xp,
    title: current.name,
    next: next ? next.name : '',
    nextXp: next ? next.xp : 0,
    hours: m.hours,
    logins: m.logins,
    games: m.games,
    days: m.days,
    levels: TITLES.map((title) => ({
      name: title.name,
      xp: title.xp,
      reached: xp >= title.xp,
    })),
achievements: ACHIEVEMENTS.map((item) => {
      const value = m[item.metric] || 0;
      return {
        id: item.id,
        name: item.name,
        metric: item.metric,
        need: item.need,
        rarity: item.rarity,
        desc: item.desc,
        reward: item.reward,
        value,
        done: value >= item.need,
        pct: Math.min(100, Math.round((value / item.need) * 100)),
      };
    }).concat(holidayAchievements(user)),
  };
}

function holidayAchievements(user) {
  const granted = user.holidays || {};
  const out = [];
  for (const key of Object.keys(granted)) {
    const def = HOLIDAYS.find((h) => key.startsWith(h.id + '_'));
    if (!def) continue;
    out.push({
      id: key,
      name: def.name,
      metric: 'holiday',
      need: 1,
      value: 1,
      done: true,
      pct: 100,
      symbol: def.symbol,
      rarity: def.rarity,
      holiday: true,
    });
  }
  return out;
}

function audit(actor, action, target, extra) {
  db.audit.unshift({
    ts: Date.now(),
    actor: actor || '',
    action: String(action || ''),
    target: target || '',
    extra: extra || '',
  });
  if (db.audit.length > 300) db.audit.length = 300;
  save();
}

const DAY_MS = 24 * 60 * 60 * 1000;
// ---------- Экономика монет: анти-фарм ядро начислений ----------
// Единый канал начислений. У каждого канала дневной кап и кулдаун;
// мультиаккаунт с одного IP свыше лимита блокирует начисление.
const EARN = {
  daily:     { amt: 10, cap: 10,   cd: DAY_MS },
  vote:      { amt: 5,  cap: 5,    cd: DAY_MS },
  check:     { amt: 5,  cap: 20,   cd: 60 * 60 * 1000 },
  steam:     { amt: 100, cap: 100, cd: 0, once: 1 },
  firstSrv:  { amt: 200, cap: 200, cd: 0, once: 1 },
  secondSrv: { amt: 20,  cap: 20,  cd: 0, once: 1 },
  runGame:   { amt: 10, cap: 30,   cd: 0 },
  playTime:  { amt: 1,  cap: 40,   cd: 0 },
  calendar:  { amt: 5,  cap: 1,    cd: DAY_MS },
  chest:     { amt: 0,  cap: 1,    cd: DAY_MS },
  goal:      { amt: 30, cap: 1,    cd: DAY_MS },
};
const EARN_MAX_ACCOUNTS_PER_IP = 2;

// ---------- Подарки: каталог, коллекция, активный у аватара ----------
const GIFT_RARITY = { common: 50, rare: 500, epic: 1000, legendary: 5000 };

const GIFT_CATEGORIES = [
  { id: 'halloween', name: 'Веселого Хеллоуина', note: '27 окт – 31 окт', icon: '🎃', items: [
    ['🧟','Зомби','rare'],['🎃','Тыква','common'],['👻','Призрак','rare'],['🦇','Летучая мышь','common'],['🧛','Вампир','epic'],['🧙','Ведьма','epic'],['🕸','Паутина','common'],['⚰','Гроб','legendary'],
  ] },
  { id: 'valentine', name: 'С любовью', note: '14 фев – 16 фев', icon: '💖', items: [
    ['❤','Сердце','common'],['💘','Стрела Купидона','rare'],['🌹','Роза','rare'],['💐','Букет','epic'],['🕊','Голубь','common'],['🍫','Шоколад','rare'],['💝','Сердце в ленту','epic'],['💍','Кольцо','legendary'],
  ] },
  { id: 'defender', name: 'Защитнику', note: '17 фев – 27 фев', icon: '🪖', items: [
    ['🪖','Каска','rare'],['🎖','Медаль','epic'],['⭐','Звезда','common'],['🚁','Вертолёт','epic'],['🛡','Щит','rare'],['⚔','Мечи','epic'],['🏅','Награда','legendary'],['🕯','Свеча','common'],
  ] },
  { id: 'lady', name: 'Настоящей леди', note: '4 мар – 12 мар', icon: '💐', items: [
    ['🌸','Цветок','common'],['💄','Помада','rare'],['👜','Сумочка','rare'],['👠','Туфля','epic'],['💅','Маникюр','common'],['👑','Корона','legendary'],['💍','Кольцо','epic'],['🌷','Тюльпан','rare'],
  ] },
  { id: 'drinks', name: 'Напитки', note: '', icon: '🥤', items: [
    ['☕','Кофе','common'],['🍵','Чай','common'],['🥤','Сок','common'],['🍺','Пиво','rare'],['🍷','Вино','rare'],['🍹','Коктейль','epic'],['🥂','Бокалы','epic'],['🥃','Виски','legendary'],
  ] },
  { id: 'food', name: 'Еда', note: '', icon: '🍔', items: [
    ['🍔','Бургер','common'],['🍕','Пицца','common'],['🍟','Картошка','common'],['🌭','Хот-дог','rare'],['🍩','Пончик','rare'],['🎂','Торт','epic'],['🍣','Суши','epic'],['🍇','Виноград','rare'],
  ] },
  { id: 'gaming', name: 'Гейминг', note: '', icon: '🎮', items: [
    ['🎮','Геймпад','epic'],['🕹','Джойстик','rare'],['🖥','ПК','epic'],['⌨','Клавиатура','common'],['🖱','Мышь','common'],['🎧','Наушники','rare'],['🧢','Кепка стримера','rare'],['🏆','Трофей','legendary'],
  ] },
  { id: 'server', name: 'Серверные пасхалки', note: '', icon: '🖧', items: [
    ['🖧','Сервер','legendary'],['🔌','Провод','common'],['⚡','Молния','rare'],['📡','Антенна','rare'],['🛠','Инструмент','common'],['🔧','Ключ','common'],['💾','Дискета','epic'],['🐧','Пингвин','epic'],
  ] },
  { id: 'tank', name: 'Кто в танке?', note: '', icon: '🛡', items: [
    ['🛡','Щит танка','rare'],['💣','Бомба','epic'],['🔫','Пистолет','rare'],['🪖','Шлем','common'],['🔭','Прицел','rare'],['📻','Рация','common'],['🚬','Патроны','common'],['🥇','Золото','legendary'],
  ] },
  { id: 'gold', name: 'Золотая лихорадка', note: 'LIMITED', icon: '🪙', items: [
    ['🪙','Монета','rare'],['💎','Кристалл','epic'],['💰','Мешок денег','epic'],['💵','Доллар','rare'],['🏦','Банк','legendary'],['📈','График','common'],['🧾','Чек','common'],['👑','Золотая корона','legendary'],
  ] },
  { id: 'chivapi', name: 'Чивапчич мем', note: '', icon: '😎', items: [
    ['😎','Мем','common'],['🤙','Зову','common'],['💪','Сила','rare'],['🔥','Огонь','rare'],['😏','Хитрый','common'],['🎤','Микрофон','rare'],['🏎','Гонка','epic'],['👌','OK','epic'],
  ] },
  { id: 'basic', name: 'Базовый минимум', note: 'LIMITED', icon: '📦', items: [
    ['📦','Коробка','common'],['🔑','Ключ','common'],['🧳','Чемодан','rare'],['🖊','Ручка','common'],['📓','Блокнот','common'],['🔦','Фонарь','rare'],['🧷','Скрепка','common'],['📚','Книги','epic'],
  ] },
  { id: 'bouquets', name: 'Букеты', note: '', icon: '💐', items: [
    ['💐','Букет','rare'],['🌸','Ветка','common'],['🌺','Гибискус','rare'],['🌻','Подсолнух','common'],['🌹','Роза','rare'],['🌷','Тюльпан','common'],['💮','Белая','epic'],['🥀','Увядшая','epic'],
  ] },
  { id: 'animals', name: 'Животные', note: '', icon: '🐾', items: [
    ['🐶','Собака','common'],['🐱','Кот','common'],['🐰','Кролик','rare'],['🦊','Лиса','rare'],['🐼','Панда','epic'],['🦁','Лев','epic'],['🐧','Пингвин','rare'],['🦄','Единорог','legendary'],
  ] },
  { id: 'gifts', name: 'Подарки', note: '', icon: '🎁', items: [
    ['🎁','Подарок','common'],['🎀','Лента','common'],['🎈','Шарик','common'],['🎉','Хлопушка','rare'],['🪅','Пиньята','epic'],['🧸','Мишка','rare'],['💝','Подарок-сердце','epic'],['🌀','Фонтан','legendary'],
  ] },
  { id: 'weapons', name: 'Оружие', note: '', icon: '🔫', items: [
    ['🔫','Пистолет','rare'],['⚔','Меч','rare'],['🏹','Лук','common'],['🪓','Топор','rare'],['🔪','Нож','common'],['💣','Граната','epic'],['🛡','Щит','rare'],['💥','Взрыв','legendary'],
  ] },
  { id: 'cars', name: 'Автомобили', note: '', icon: '🚗', items: [
    ['🚗','Машина','common'],['🏎','Гонка','epic'],['🚓','Полиция','rare'],['🚕','Такси','rare'],['🚙','Джип','rare'],['🛸','НЛО','legendary'],['🚑','Скорая','rare'],['🏁','Флаг','common'],
  ] },
  { id: 'chem', name: 'Уроки химии', note: '', icon: '⚗', items: [
    ['⚗','Колба','epic'],['🧪','Пробирка','rare'],['🧫','Чашка','rare'],['🔬','Микроскоп','epic'],['🧬','ДНК','legendary'],['🧯','Огнетушитель','common'],['☣','Опасность','common'],['💊','Таблетка','rare'],
  ] },
  { id: 'victory', name: 'День Победы', note: '', icon: '🎖', items: [
    ['🎖','Медаль','epic'],['⭐','Звезда','common'],['🕊','Голубь','rare'],['🏵','Орден','epic'],['🪖','Каска','rare'],['🎆','Салют','legendary'],['⏳','Песочные часы','rare'],['🕯','Свеча памяти','rare'],
  ] },
    { id: 'ice', name: 'Ледяная коллекция', note: 'NEW', icon: '❄️', items: [
    ['❄️','Снежинка','common'],
    ['🧊','Ледяной куб','common'],
    ['🗡','Сосулька','common'],
    ['✴','Ледяная звезда','common'],
    ['💠','Ледяной алмаз','common'],
    ['🌨','Снежный шар','common'],
    ['🗝','Ледяной ключ','common'],
    ['🛡','Ледяной щит','common'],
    ['👑','Ледяная корона','common'],
    ['⚔','Ледяной меч','common'],
    ['💙','Ледяное сердце','common'],
    ['🏆','Ледяной трофей','common'],
    ['🍶','Ледяная бутылка','common'],
    ['🎭','Ледяная маска','common'],
    ['🏮','Ледяной фонарь','common'],
    ['⚓','Ледяной якорь','common'],
    ['❄','Ледяной знак','common'],
    ['⛏','Ледяной топор','common'],
    ['☃️','Снеговик','common'],
    ['🛷','Санки','common'],
    ['🎿','Лыжи','common'],
    ['⛸','Коньки','common'],
    ['❄','Снежный медальон','common'],
    ['🐧','Пингвин','common'],
    ['🐻','Белый медведь','common'],
    ['✸','Снежная звезда','common'],
    ['⛄','Иглу','common'],
    ['🏂','Сноуборд','common'],
    ['⚪','Снежок','common'],
    ['🌲','Снежная ель','common'],
    ['🔔','Снежный колокольчик','common'],
    ['🦉','Полярная сова','common'],
    ['👑','Снежная корона','common'],
    ['☁','Снежное облако','common'],
    ['🧣','Шарф','common'],
    ['🏒','Шайба','common'],
    ['🌸','Морозный цветок','common'],
    ['🥀','Замороженная роза','common'],
    ['🐉','Ледяной дракон','common'],
    ['🪄','Ледяной посох','common'],
    ['👊','Ледяной кулак','common'],
    ['🐦','Ледяной феникс','common'],
    ['🌀','Магический круг льда','common'],
    ['🐺','Ледяной волк','common'],
    ['👑','Морозная корона','common'],
    ['🛡','Морозный щит','common'],
    ['⏳','Морозные часы','common'],
    ['🎼','Ледяная арфа','common'],
    ['🔮','Хрустальный шар','common'],
    ['🏹','Морозный лук','common'],
    ['❄','Морозный знак','common'],
    ['⚔','Морозный клинок','common'],
    ['🕊','Ледяные крылья','common'],
    ['🦉','Морозный страж','common'],
    ['🔮','Хруст. шар','common'],
    ['💎','Скопление крис.','common'],
    ['💙','Хруст. сердце','common'],
    ['⭐','Хруст. звезда','common'],
    ['🔪','Хруст. клинок','common'],
    ['👑','Хруст. корона','common'],
    ['🥚','Хруст. яйцо','common'],
    ['🛡','Хруст. щит','common'],
    ['🪄','Хруст. жезл','common'],
    ['🌸','Хруст. цветок','common'],
    ['🗝','Хруст. ключ','common'],
    ['👑','Хруст. тиара','common'],
    ['⏳','Хруст. часы','common'],
    ['🦉','Хруст. сова','common'],
    ['🐦','Хруст. птица','common'],
    ['⚡','Хруст. молния','common'],
    ['❄','Хруст. снежинка','common'],
    ['🛸','Хруст. корабль','common'],
    ['🦌','Аврора-олень','common'],
    ['🌀','Аврора-сфера','common'],
    ['🦊','Аврора-лис','common'],
    ['🌸','Аврора-цветок','common'],
    ['🌨','Аврора-шар','common'],
    ['🐋','Аврора-кит','common'],
    ['👑','Аврора-корона','common'],
    ['⭐','Аврора-звезда','common'],
    ['🐉','Аврора-дракон','common'],
    ['💙','Аврора-сердце','common'],
    ['⚔','Аврора-меч','common'],
    ['🛡','Аврора-щит','common'],
    ['🌙','Аврора-луна','common'],
    ['🦄','Аврора-пегас','common'],
    ['🪷','Аврора-лотос','common'],
    ['🐺','Аврора-волк','common'],
    ['🔷','Аврора-осколок','common'],
    ['🐦','Аврора-феникс','common'],
    ['⚔','Аврора-клинок','common'],
    ['👑','Аврора-тиара','common'],
    ['❄','Аврора-снежинка','common'],
  ] },
  { id: 'fire', name: 'Огонь', note: 'NEW', icon: '🔥', items: [
    ['🔥','Пылающее сердце','common'],
    ['🔥','Огненный феникс','common'],
    ['🔥','Горящий факел','common'],
    ['🔥','Огненный меч','common'],
    ['🔥','Пылающая корона','common'],
    ['🔥','Огненная сфера','common'],
    ['🔥','Огненный щит','common'],
    ['🔥','Пылающая звезда','common'],
    ['🔥','Огненная роза','common'],
    ['🔥','Огненная птица','common'],
    ['🔥','Пылающий шлем','common'],
    ['🔥','Огненное перо','common'],
    ['🔥','Огненная комета','common'],
    ['🔥','Огненное колесо','common'],
    ['🔥','Горящий фонарь','common'],
    ['🔥','Огненный топор','common'],
    ['🔥','Огненный дракон','common'],
    ['🔥','Огненное крыло','common'],
  ] },
  { id: 'nature', name: 'Природа', note: 'NEW', icon: '🌿', items: [
    ['🌿','Изумрудный лист','common'],
    ['🌿','Лесной олень','common'],
    ['🌿','Магический цветок','common'],
    ['🌿','Древесный росток','common'],
    ['🌿','Волшебный гриб','common'],
    ['🌿','Лесной щит','common'],
    ['🌿','Лесной волк','common'],
    ['🌿','Зелёная корона','common'],
    ['🌿','Лесной лотос','common'],
    ['🌿','Лесная сова','common'],
    ['🌿','Лесной посох','common'],
    ['🌿','Лесная бабочка','common'],
    ['🌿','Моховидный медведь','common'],
    ['🌿','Кольцо лиан','common'],
    ['🌿','Лесная черепаха','common'],
    ['🌿','Лунный лист','common'],
    ['🌿','Магический жёлудь','common'],
    ['🌿','Дух природы','common'],
  ] },
  { id: 'space', name: 'Космос', note: 'NEW', icon: '🌌', items: [
    ['🌌','Неон-планета','common'],
    ['🌌','Лунный серп','common'],
    ['🌌','Галактический вихрь','common'],
    ['🌌','Падающая звезда','common'],
    ['🌌','Мистическая комета','common'],
    ['🌌','Созвездие','common'],
    ['🌌','Голубая планета','common'],
    ['🌌','Ракета','common'],
    ['🌌','Звёздный жезл','common'],
    ['🌌','Небула-дракон','common'],
    ['🌌','Лунный самоцвет','common'],
    ['🌌','Звёздная корона','common'],
    ['🌌','Астронавт','common'],
    ['🌌','Лунный шар','common'],
    ['🌌','Спутник','common'],
    ['🌌','Нова-взрыв','common'],
    ['🌌','Галактический ключ','common'],
    ['🌌','Нейтронная звезда','common'],
  ] },
  { id: 'lava', name: 'Лава', note: 'NEW', icon: '🌋', items: [
    ['🌋','Лавовое сердце','common'],
    ['🌋','Извержение','common'],
    ['🌋','Лавовый дракон','common'],
    ['🌋','Лавовый меч','common'],
    ['🌋','Лавовая корона','common'],
    ['🌋','Лавовая сфера','common'],
    ['🌋','Лавовый щит','common'],
    ['🌋','Лавовый феникс','common'],
    ['🌋','Лавовый кулак','common'],
    ['🌋','Лавовая роза','common'],
    ['🌋','Лавовая черепаха','common'],
    ['🌋','Лавовый топор','common'],
    ['🌋','Магмовый венец','common'],
    ['🌋','Лавовый кристалл','common'],
    ['🌋','Лавовый волк','common'],
    ['🌋','Лавовый клинок','common'],
    ['🌋','Лавовая руна','common'],
    ['🌋','Лавовый голем','common'],
  ] },
  { id: 'tech', name: 'Техно', note: 'NEW', icon: '⚙️', items: [
    ['⚙️','Кибер-чип','common'],
    ['⚙️','Гекс-портал','common'],
    ['⚙️','Кибер-глаз','common'],
    ['⚙️','Робот-голова','common'],
    ['⚙️','Цифровой меч','common'],
    ['⚙️','Техно-шлем','common'],
    ['⚙️','Цифровой щит','common'],
    ['⚙️','Кибер-дракон','common'],
    ['⚙️','Голографическая корона','common'],
    ['⚙️','Дрон','common'],
    ['⚙️','Схема-посох','common'],
    ['⚙️','Кибер-бабочка','common'],
    ['⚙️','Голограф-звезда','common'],
    ['⚙️','Кибер-феникс','common'],
    ['⚙️','Интерфейс-сфера','common'],
    ['⚙️','Кибер-катана','common'],
    ['⚙️','Кибер-сердце','common'],
    ['⚙️','Кристалл данных','common'],
  ] },
];

const GIFTS = GIFT_CATEGORIES.flatMap((cat) =>
  cat.items.map((it, i) => ({
    id: cat.id + '-' + i,
    cat: cat.id,
    emoji: it[0],
    name: it[1],
    rarity: it[2],
    price: GIFT_RARITY[it[2]],
  }))
);
const GIFT_PRICE_GROW = 1.5; // множитель цены при повторной отправке тому же получателю

function giftCatalog() {
  return GIFT_CATEGORIES.map((c) => ({
    id: c.id,
    name: c.name,
    note: c.note,
    icon: c.icon,
    items: c.items.map((it, i) => {
      const g = GIFTS.find((x) => x.id === c.id + '-' + i);
      return { id: g.id, emoji: it[0], name: it[1], rarity: it[2], price: g.price };
    }),
  }));
}

function giftsToSender(user, sender) {
  return (user.giftsReceived || []) // каждый элемент { by, id, ts }
    .filter((g) => g.by === sender)
    .map((g) => ({ id: g.id, ts: g.ts }));
}

function userGiftCollection(user) {
  // коллекция: карта id -> количество полученных
  const col = {};
  for (const g of user.giftsReceived || []) col[g.id] = (col[g.id] || 0) + 1;
  return col;
}

function giftPriceFor(recipient, sender, giftId) {
  const base = (GIFTS.find((g) => g.id === giftId) || {}).price;
  if (!base) return 0;
  const sentCount = (recipient.giftsReceived || []).filter((g) => g.by === sender).length;
  return Math.round(base * Math.pow(GIFT_PRICE_GROW, sentCount));
}

function todayKey() {
  return Math.floor(Date.now() / DAY_MS);
}

function ensureEarnState(user) {
  if (!user) return false;
  if (typeof user.coins !== 'number') user.coins = 200;
  if (!Array.isArray(user.coinHistory)) user.coinHistory = [];
  if (!user.earn) user.earn = {};
  if (user.earn.day !== todayKey()) {
    user.earn = { day: todayKey(), counts: {}, cd: {}, once: {} };
  }
  return true;
}

// Число аккаунтов этого IP, которые уже получали награду сегодня.
function ipEarnCount(ip, channel) {
  if (!ip) return 0;
  const rec = ipEarn.get(ip + '|' + channel);
  return rec && rec.day === todayKey() ? rec.count : 0;
}

function ipEarnMark(ip, channel) {
  if (!ip) return;
  const key = ip + '|' + channel;
  const rec = ipEarn.get(key) || { day: todayKey(), count: 0 };
  if (rec.day !== todayKey()) rec = { day: todayKey(), count: 0 };
  rec.count += 1;
  ipEarn.set(key, rec);
  if (ipEarn.size > 5000) {
    for (const k of ipEarn.keys()) {
      if (ipEarn.get(k).day !== todayKey()) ipEarn.delete(k);
    }
  }
}

const ipEarn = new Map();

// Возвращает { ok, reason } — начислил монеты или описал причину отказа.
function grantCoins(user, channel, opts = {}) {
  if (!user) return { ok: false, reason: 'no_user' };
  const spec = EARN[channel];
  if (!spec) return { ok: false, reason: 'unknown_channel' };
  ensureEarnState(user);

  const key = todayKey();
  const counts = user.earn.counts || {};
  const cds = user.earn.cd || {};
  const once = user.earn.once || {};
  const got = counts[channel] || 0;

  if (spec.once && (once[channel] || got > 0)) return { ok: false, reason: 'once' };
  if (got >= spec.cap) return { ok: false, reason: 'cap' };
  if (spec.cd && cds[channel] && Date.now() - cds[channel] < spec.cd) {
    return { ok: false, reason: 'cooldown' };
  }

  const ip = opts.ip || '';
  if (ip && ipEarnCount(ip, channel) >= EARN_MAX_ACCOUNTS_PER_IP) {
    return { ok: false, reason: 'multi_ip' };
  }

  let amt = spec.amt;
  if (channel === 'chest') {
    amt = 50 + Math.floor(Math.random() * 4) * 50;
  }
  if (channel === 'calendar') {
    const cal = user.earn.cal || { days: 0, month: '' };
    const mkey = dayMonthKey();
    if (cal.month !== mkey) { cal.days = 0; cal.month = mkey; }
    cal.days += 1;
    user.earn.cal = cal;
    if (cal.days >= 30) {
      amt = 100;
      cal.days = 0;
    }
  }
  if (channel === 'daily') {
    user.streak = (user.streak || 0) + 1;
    const mult = streakMult(user.streak);
    amt = Math.round(spec.amt * mult);
  }

  user.coins += amt;
  counts[channel] = got + 1;
  user.earn.counts = counts;
  if (spec.cd) user.earn.cd[channel] = Date.now();
  if (spec.once) user.earn.once[channel] = 1;
  if (user.coinHistory.unshift) {
    user.coinHistory.unshift({
      type: channel,
      delta: amt,
      ts: Date.now(),
      by: opts.by || '',
      note: opts.note || '',
    });
    if (user.coinHistory.length > 100) user.coinHistory.length = 100;
  }
  ipEarnMark(ip, channel);
  audit(user.name || opts.by || '', 'coin_earn', channel, '+' + amt);
  return { ok: true, amt, total: user.coins };
}

function dayMonthKey() {
  const d = new Date();
  return d.getFullYear() + '-' + d.getMonth();
}

function streakMult(streak) {
  if (streak >= 90) return 2;
  if (streak >= 30) return 1.5;
  if (streak >= 7) return 1.2;
  return 1;
}

function earnState(user) {
  ensureEarnState(user);
  return user.earn;
}

function sumEarnedToday(user) {
  ensureEarnState(user);
  const counts = user.earn.counts || {};
  let total = 0;
  for (const ch of Object.keys(counts)) {
    const spec = EARN[ch];
    if (!spec) continue;
    if (ch === 'goal') continue;
    total += counts[ch] * (ch === 'chest' ? 75 : spec.amt);
  }
  return total;
}

// --- TOTP (RFC 6238): двухфакторный код для админов ---
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buffer) {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(input) {
  const clean = String(input || '')
    .toUpperCase()
    .replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const out = [];
  for (const char of clean) {
    const idx = B32.indexOf(char);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

function totpCode(secret, offsetSteps = 0) {
  const key = base32Decode(secret);
  if (!key.length) return '';
  const counter = Math.floor(Date.now() / 1000 / 30) + offsetSteps;
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(counter / 4294967296), 0);
  buf.writeUInt32BE(counter % 4294967296, 4);
  const hmac = crypto.createHmac('sha1', key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    (((hmac[offset] & 0x7f) << 24) |
      (hmac[offset + 1] << 16) |
      (hmac[offset + 2] << 8) |
      hmac[offset + 3]) %
    1000000;
  return String(code).padStart(6, '0');
}

function verifyTotp(secret, code) {
  const clean = String(code || '').replace(/\D/g, '');
  if (clean.length !== 6) return false;
  for (let shift = -1; shift <= 1; shift += 1) {
    if (totpCode(secret, shift) === clean) return true;
  }
  return false;
}

// --- защита от перебора пароля ---
const loginFails = new Map();
const LOCK_AFTER = 5;
const LOCK_BASE_MS = 5 * 60 * 1000;

function lockLeft(name) {
  const rec = loginFails.get(name);
  if (!rec || !rec.until) return 0;
  const left = rec.until - Date.now();
  if (left <= 0) {
    loginFails.delete(name);
    return 0;
  }
  return left;
}

function failLogin(name) {
  const rec = loginFails.get(name) || { count: 0, until: 0 };
  rec.count += 1;
  if (rec.count >= LOCK_AFTER) {
    const over = rec.count - LOCK_AFTER;
    rec.until = Date.now() + Math.min(LOCK_BASE_MS * 2 ** over, 60 * 60 * 1000);
  }
  loginFails.set(name, rec);
  return rec.count >= LOCK_AFTER;
}

function okLogin(name) {
  loginFails.delete(name);
}

function isAdmin(name) {
  const wanted = String(name || '').toLowerCase();
  return (db.admins || []).some((item) => String(item).toLowerCase() === wanted);
}

function voterList(server) {
  const raw = Array.isArray(server.voters) ? server.voters : [];
  return raw
    .map((item) => (typeof item === 'string' ? { name: item, ts: server.added || 0 } : item))
    .filter((item) => item && item.name);
}

function votesSince(server, ms) {
  const from = Date.now() - ms;
  return voterList(server).filter((item) => (item.ts || 0) >= from).length;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const MONTH_MS = 30 * 24 * 60 * 60 * 1000;
// Рейтинг считается по голосам за последние два года.
const RATING_WINDOW_MS = 2 * 365 * DAY_MS;
const VOTE_COOLDOWN_MS = DAY_MS;
// Голос нового аккаунта не учитывается первые 10 минут — отсев массовых регистраций.
const VOTE_MIN_ACCOUNT_AGE = 10 * 60 * 1000;

function votesRating(server) {
  return votesSince(server, RATING_WINDOW_MS);
}

function lastVoteOf(server, name) {
  if (!name) return null;
  return voterList(server)
    .filter((item) => item.name === name)
    .sort((a, b) => (b.ts || 0) - (a.ts || 0))[0] || null;
}

const PROMO_OPTIONS = {
  badge: { price: 1, priceCoins: 30, label: 'Плашка на карточке' },
  color: { price: 2, priceCoins: 60, label: 'Свой цвет и рамка' },
  large: { price: 3, priceCoins: 90, label: 'Крупная карточка' },
  pinned: { price: 5, priceCoins: 150, label: 'Закрепление вверху' },
  banner: { price: 2, priceCoins: 60, label: 'Баннер на карточке' },
  catalog: { price: 2, priceCoins: 60, label: 'Место в каталоге' },
};
// Опции прежних версий: переводим в новые, чтобы старые покупки продолжали работать.
const PROMO_LEGACY = { frame: 'color', describe: 'large' };
const PROMO_DAYS = [7, 30, 90];
const BANNER_SIZES = ['468x60', '728x90', '320x100', '970x90', '300x250'];
const BANNER_SIZE_DEFAULT = '468x60';
const BANNER_STYLES = ['soft', 'blur', 'full'];
const BANNER_STYLE_DEFAULT = 'soft';
const PROMO_DISCOUNT = { 7: 0, 30: 0.1, 90: 0.2 };
// Закрепление — 5 мест. Чем выше место, тем дороже день.
const PIN_SLOTS = 5;
const PIN_SLOT_PRICES = [
  { price: 3, priceCoins: 90 },
  { price: 2.5, priceCoins: 75 },
  { price: 2, priceCoins: 60 },
  { price: 1.5, priceCoins: 45 },
  { price: 1, priceCoins: 30 },
];
function pinSlotPrice(slot) {
  const index = Number(slot) - 1;
  return PIN_SLOT_PRICES[index] || PIN_SLOT_PRICES[PIN_SLOT_PRICES.length - 1];
}

// Рекламные блоки в каталоге: после #10, #25, #30 и постоянный в конце списка.
const LIST_BLOCK_SIZE = 5;
const LIST_BLOCKS = [
  { id: 'mid10', at: 10, label: 'После #10', price: 2, priceCoins: 60 },
  { id: 'mid25', at: 25, label: 'После #25', price: 1.5, priceCoins: 45 },
  { id: 'mid30', at: 30, label: 'После #30', price: 1.25, priceCoins: 38 },
  { id: 'end', at: 0, label: 'В конце списка', price: 1, priceCoins: 30 },
];
function listBlockRate(block) {
  return LIST_BLOCKS.find((item) => item.id === String(block)) || LIST_BLOCKS[0];
}

// Пакеты пополнения кошелька. price — в рублях, coins — сколько зачислится.
const COIN_PACKS = {
  start: { coins: 100, price: 99, label: 'Стартовый' },
  plus: { coins: 500, price: 399, label: 'Выгодный' },
  pro: { coins: 1200, price: 799, label: 'Профи' },
  max: { coins: 3000, price: 1490, label: 'Максимум' },
};

function promoOptions(list) {
  const raw = Array.isArray(list) ? list : [];
  const mapped = raw.map((item) => PROMO_LEGACY[item] || item).filter((item) => PROMO_OPTIONS[item]);
  return [...new Set(mapped)];
}

function promoPrice(options, days, slot, listBlock) {
  const list = promoOptions(options);
  const perDay = list.reduce((sum, item) => {
    if (item === 'pinned') return sum + pinSlotPrice(slot).price;
    if (item === 'catalog') return sum + listBlockRate(listBlock).price;
    return sum + PROMO_OPTIONS[item].price;
  }, 0);
  const discount = PROMO_DISCOUNT[days] ?? 0;
  return Math.round(perDay * days * (1 - discount) * 100) / 100;
}

function promoPriceCoins(options, days, slot, listBlock) {
  const list = promoOptions(options);
  const perDay = list.reduce((sum, item) => {
    if (item === 'pinned') return sum + pinSlotPrice(slot).priceCoins;
    if (item === 'catalog') return sum + listBlockRate(listBlock).priceCoins;
    return sum + (PROMO_OPTIONS[item].priceCoins || 0);
  }, 0);
  const discount = PROMO_DISCOUNT[days] ?? 0;
  return Math.round(perDay * days * (1 - discount));
}

function pinnedActiveList() {
  return db.public_servers
    .filter((server) => activePromo(server).pinned)
    .sort((a, b) => (activePromo(a).pinSlot || 99) - (activePromo(b).pinSlot || 99) || (a.added || 0) - (b.added || 0));
}

function pinSlotState(serverId) {
  const list = pinnedActiveList();
  const slots = [];
  for (let slot = 1; slot <= PIN_SLOTS; slot += 1) {
    const holder = list.find((server) => (activePromo(server).pinSlot || 0) === slot);
    const rate = pinSlotPrice(slot);
    slots.push({
      slot,
      id: holder ? holder.id : '',
      name: holder ? holder.name : '',
      mine: !!holder && holder.by === serverId,
      price: rate.price,
      priceCoins: rate.priceCoins,
    });
  }
  return slots;
}

function ensurePinSlots() {
  const pinned = pinnedActiveList();
  const seen = new Set();
  let changed = false;
  for (const server of pinned) {
    if (!server.promo || typeof server.promo !== 'object') server.promo = {};
    let slot = Number(server.promo.pinSlot) || 0;
    if (slot < 1 || slot > PIN_SLOTS || seen.has(slot)) {
      slot = 0;
      for (let i = 1; i <= PIN_SLOTS; i += 1) {
        if (!seen.has(i)) { slot = i; break; }
      }
      if (!slot) break;
      server.promo.pinSlot = slot;
      changed = true;
    }
    seen.add(slot);
  }
  if (changed) save();
}

function pinSlotConflict(serverId, slot) {
  const occupant = pinnedActiveList().find(
    (server) => server.id !== serverId && (activePromo(server).pinSlot || 0) === Number(slot)
  );
  return !!occupant;
}

function listBlockState(serverId) {
  return LIST_BLOCKS.map((item) => {
    const slots = [];
    for (let slot = 1; slot <= LIST_BLOCK_SIZE; slot += 1) {
      const holder = db.public_servers.find(
        (server) =>
          (activePromo(server).listBlock || '') === item.id && (activePromo(server).listSlot || 0) === slot
      );
      slots.push({
        slot,
        id: holder ? holder.id : '',
        name: holder ? holder.name : '',
        mine: !!holder && holder.by === serverId,
      });
    }
    return { id: item.id, at: item.at, label: item.label, price: item.price, priceCoins: item.priceCoins, slots };
  });
}

function listSlotConflict(serverId, block, slot) {
  const targetBlock = String(block || '');
  const targetSlot = Number(slot) || 0;
  if (!targetBlock || !targetSlot) return false;
  return db.public_servers.some(
    (server) =>
      server.id !== serverId &&
      (activePromo(server).listBlock || '') === targetBlock &&
      (activePromo(server).listSlot || 0) === targetSlot
  );
}

// Одно место в каталоге — один сервер: лишние снимаем, оставляя первого.
function ensureListSlots() {
  const seen = new Set();
  let changed = false;
  const ordered = db.public_servers
    .filter((server) => activePromo(server).listBlock)
    .sort((a, b) => (a.added || 0) - (b.added || 0));
  for (const server of ordered) {
    const promo = activePromo(server);
    const block = String(promo.listBlock || '');
    const slot = Number(promo.listSlot) || 0;
    const key = block + ':' + slot;
    const known = LIST_BLOCKS.some((item) => item.id === block);
    if (!known || slot < 1 || slot > LIST_BLOCK_SIZE || seen.has(key)) {
      delete server.promo.listBlock;
      delete server.promo.listSlot;
      changed = true;
      continue;
    }
    seen.add(key);
  }
  if (changed) save();
  return changed;
}

function activePromo(server) {
  const promo = server && server.promo && typeof server.promo === 'object' ? server.promo : {};
  if (promo.until && promo.until <= Date.now()) return {};
  return promo;
}

// Автоотключение оплаченного оформления по окончании срока.
function promoCleanup() {
  const now = Date.now();
  let changed = false;
  for (const server of db.public_servers) {
    const promo = server.promo;
    if (promo && promo.until && promo.until <= now) {
      delete server.promo;
      changed = true;
      audit('system', 'promo_expired', server.by, server.name);
    }
  }
  if (changed) save();
  return changed;
}

function cleanGame(value) {
  return String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\^x[0-9a-fA-F]{6}/g, ' ')
    .replace(/\^\d/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
}

function serverPublic(s, viewer) {
  const voters = voterList(s);
  const status = s.status || null;
  const lastVote = lastVoteOf(s, viewer);
  const sinceLast = lastVote ? Date.now() - (lastVote.ts || 0) : null;
  const promo = activePromo(s);
  return {
    id: s.id,
    name: s.name,
    address: s.address,
    game: cleanGame(s.game),
    desc: s.desc || '',
    by: s.by,
    added: s.added,
    votes: votesRating(s),
    votesAll: voters.length,
    votesWeek: votesSince(s, WEEK_MS),
    votesMonth: votesSince(s, MONTH_MS),
    voted: !!lastVote,
    canVote: !lastVote || sinceLast >= VOTE_COOLDOWN_MS,
    voteWait: lastVote && sinceLast < VOTE_COOLDOWN_MS
      ? Math.ceil((VOTE_COOLDOWN_MS - sinceLast) / 1000)
      : 0,
    pinned: !!promo.pinned,
    badge: promo.badge || '',
    highlight: promo.highlight || promo.color || '',
    promoSize: promo.size || '',
    promoUntil: promo.until || 0,
    history: Array.isArray(s.history) ? s.history.slice(-96) : [],
    votesLog: voterList(s)
      .slice()
      .sort((a, b) => (b.ts || 0) - (a.ts || 0))
      .slice(0, 12)
      .map((item) => ({ name: item.name, ts: item.ts || 0 })),
    online: !!status && !!status.online,
    players: status ? status.players || 0 : 0,
    maxPlayers: s.manualMax || (status ? status.maxPlayers || 0 : 0),
    map: status ? status.map || '' : '',
    version: status ? status.version || '' : '',
    motd: status ? status.motd || '' : '',
    ping: status ? status.ping || 0 : 0,
    checkedAt: status ? status.ts || 0 : 0,
banner: s.banner && s.banner.ext ? `/banner/${s.id}?v=${s.banner.v}` : '',
    bannerSize: (s.banner && s.banner.size) || '',
    bannerStyle: (s.banner && s.banner.style) || '',
    pinSlot: (activePromo(s).pinSlot || 0),
    listBlock: (activePromo(s).listBlock || ''),
    listSlot: (activePromo(s).listSlot || 0),
    icon: s.icon && s.icon.ext ? `/icon/${s.id}?v=${s.icon.v}` : '',
    hidden: !!(s.monitor && s.monitor.fails > 0),
  };
}


const MONITOR_MS = 5 * 60 * 1000;
// Офлайн-серверы опрашиваются реже: сутки, двое, трое, затем раз в неделю, потом стоп.
const RETRY_DELAYS = [DAY_MS, 2 * DAY_MS, 3 * DAY_MS, 7 * DAY_MS];
let monitorRunning = false;

async function refreshServerEntry(server) {
  let result;
  try {
    result = await queryServer(server.address, server.game);
  } catch (e) {
    result = { online: false, error: String(e.message || e) };
  }
  server.status = {
    online: !!result.online,
    players: result.players || 0,
    maxPlayers: result.maxPlayers || 0,
    version: result.version || '',
    map: result.map || '',
    motd: result.motd || '',
    ping: result.ping || 0,
    error: result.error || '',
    game: result.game || '',
    folder: result.folder || '',
    ts: Date.now(),
  };

  if (result.online && result.game) {
    server.game = result.game;
    server.detected_game = result.game;
  }
  const now = Date.now();
  if (result.online) {
    server.monitor = { fails: 0, nextCheckAt: now + MONITOR_MS };
  } else {
    const fails = ((server.monitor && server.monitor.fails) || 0) + 1;
    const delay = RETRY_DELAYS[Math.min(fails - 1, RETRY_DELAYS.length - 1)];
    server.monitor = {
      fails,
      nextCheckAt: fails > RETRY_DELAYS.length ? null : now + delay,
    };
  }
}

function hiddenServersOf(viewer) {
  if (!viewer) return [];
  return db.public_servers
    .filter((server) => server.by === viewer && server.monitor && server.monitor.fails > 0)
    .map((server) => serverPublic(server, viewer));
}

function pendingServersOf(viewer) {
  if (!viewer) return [];
  return db.pending_servers
    .filter((server) => server.by === viewer && server.status === 'pending')
    .map((server) => ({
      id: server.id,
      name: server.name,
      address: server.address,
      game: server.game || '',
      desc: server.desc || '',
      by: server.by,
      added: server.added || 0,
      status: 'pending',
    }));
}

function broadcastServers() {
  for (const [name, sock] of sockets) {
    if (sock.readyState === 1) {
      send(sock, {
        type: 'servers',
        servers: rankedServers(name),
        pinned: pinnedServers(name),
        pinSlots: pinSlotState(name),
        listBlocks: listBlockState(name),
        listBlockSize: LIST_BLOCK_SIZE,
        hiddenMine: hiddenServersOf(name),
        pendingMine: pendingServersOf(name),
        stats: serverStats(db.public_servers),
      });
    }
  }
}

async function refreshAll() {
  if (monitorRunning) return;
  monitorRunning = true;
  try {
    const now = Date.now();
    const queue = db.public_servers.filter((server) => {
      const monitor = server.monitor;
      if (!monitor) return true;
      if (monitor.nextCheckAt === null) return false;
      return !monitor.nextCheckAt || monitor.nextCheckAt <= now;
    });
    const workers = Array.from({ length: 4 }, async () => {
      while (queue.length) {
        const server = queue.shift();
        await refreshServerEntry(server);
      }
    });
    await Promise.all(workers);
    save();
    broadcastServers();
  } finally {
    monitorRunning = false;
  }
}


function serverStats(servers) {
  const online = Object.values(db.users).filter(
    (user) => user.online && user.statusKind !== 'invisible',
  ).length;
  const games = new Set(
    servers.map((server) => String(server.game || '').toLowerCase()).filter(Boolean),
  );
  const votes = servers.reduce((sum, server) => sum + voterList(server).length, 0);
  return { servers: servers.length, online, votes, games: games.size };
}

// Закреплённые карточки идут отдельным блоком, остальные — по рейтингу за 2 года.
function rankedServers(viewer) {
  return db.public_servers
    .filter((server) => !activePromo(server).pinned)
    .map((server) => serverPublic(server, viewer))
    .sort((a, b) => b.votes - a.votes || (a.added || 0) - (b.added || 0))
    .map((server, index) => ({ ...server, place: index + 1 }));
}

function pinnedServers(viewer) {
  return db.public_servers
    .map((server) => serverPublic(server, viewer))
    .filter((server) => server.pinned)
    .sort((a, b) => (a.pinSlot || 99) - (b.pinSlot || 99))
    .map((server, index) => ({ ...server, place: index + 1 }));
}

function save() {
  const tmp = DATA_FILE + '.tmp';
  try {
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
    fs.renameSync(tmp, DATA_FILE);
  } catch (e) {
    console.warn('save failed:', e && e.message ? e.message : e);
  }
}

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function verifyPassword(password, user) {
  const attempt = Buffer.from(hashPassword(password, user.salt), 'hex');
  const known = Buffer.from(user.hash, 'hex');
  return attempt.length === known.length && crypto.timingSafeEqual(attempt, known);
}

function newToken() {
  return crypto.randomBytes(32).toString('hex');
}

function ipOf(ws) {
  try {
    const raw = ws._socket && ws._socket.remoteAddress ? ws._socket.remoteAddress : '';
    return String(raw).replace(/^::ffff:/, '');
  } catch {
    return '';
  }
}

// Ограничение по IP: 20 неудачных попыток за 5 минут блокируют адрес.
const ipFails = new Map();

function ipBlocked(ip) {
  const rec = ipFails.get(ip);
  if (!rec) return 0;
  if (rec.until && rec.until > Date.now()) return rec.until - Date.now();
  if (rec.until && rec.until <= Date.now()) ipFails.delete(ip);
  return 0;
}

function ipFail(ip) {
  const rec = ipFails.get(ip) || { count: 0, until: 0 };
  rec.count += 1;
  if (rec.count >= IP_MAX_FAILS) rec.until = Date.now() + IP_WINDOW_MS;
  ipFails.set(ip, rec);
}

function ipOk(ip) {
  ipFails.delete(ip);
}

// ---------- Анти-спам и лимиты действий ----------
// Защита от «мусора»: повторные сообщения (flood), спам-ссылки и мусорные строки.

// Кулдауны на действия. Ключ: `${user}:${action}`. Значение: время следующего разрешённого вызова.
const actCooldown = new Map();
const ACT_LIMITS = {
  chat: 1200,        // приват-сообщение: раз в 1.2 c
  group_post: 15000, // пост в группе: раз в 15 с
  group_create: 60000, // создание группы: раз в 60 с
  status: 5000,      // смена статуса/игры: раз в 5 с
  profile_set: 30000, // изменение профиля: раз в 30 с
  profile_vote: 1200, // голос за репутацию: не чаще раза в 1,2 с
};

// Задержка критичных действий («удержание» из карты): после смены пароля или
// отключения 2FA следующий критичный шаг в окне CRITICAL_HOLD_MS отклоняется,
// чтобы у владельца было время заметить взлом. Значение — 1 ч (не 24 ч, чтобы
// не запирать легитимного пользователя; 24 ч уместно для денежных выводов).
const CRITICAL_HOLD_MS = 60 * 60 * 1000;
// Возвращает: null если доступно, либо { wait, reason } если недавно было критичное действие.
function criticalHold(user, lastActionKey) {
  const last = user[lastActionKey] || 0;
  if (!last) return null;
  const left = last + CRITICAL_HOLD_MS - Date.now();
  if (left > 0) return { wait: Math.ceil(left / 1000), reason: 'hold' };
  return null;
}
function markCritical(user, key) {
  user[key] = Date.now();
}
// Возвращает 0 если можно, иначе число мс до разрешения.
function cooldown(ws, action) {
  if (!ws.user) return 0;
  const key = ws.user + ':' + action;
  const now = Date.now();
  const next = actCooldown.get(key) || 0;
  if (next > now) return next - now;
  actCooldown.set(key, now + (ACT_LIMITS[action] || 0));
  // Убираем просроченные записи, чтобы карта не росла бесконечно.
  if (actCooldown.size > 5000) {
    for (const [k, v] of actCooldown) if (v <= now) actCooldown.delete(k);
  }
  return 0;
}

// Персистентный кэш последних сообщений пользователя — ловит повторный спам одного и того же текста.
const lastUserMsg = new Map(); // user -> { text, at }

// Возвращает null если ок, или объект { blocked: true, reason }.
function spamCheck(ws, text, opts = {}) {
  if (!ws.user) return null;
  const s = String(text || '').trim();
  if (!s) return null;

  // 1) Слишком много ссылок — типичный признак спама.
  const urlMatches = s.match(/https?:\/\/[^\s]+/gi) || [];
  if (urlMatches.length > (opts.maxLinks ?? 2)) {
    return { blocked: true, reason: 'too_many_links' };
  }

  // 2) Мусорные повторяющиеся символы (например, "aaaaaaaaaaaa" или "!!!???").
  if (/(.)\1{9,}/.test(s)) {
    return { blocked: true, reason: 'repetitive' };
  }

  // 3) Повтор последнего сообщения пользователя (flood).
  const prev = lastUserMsg.get(ws.user);
  if (prev && prev.text === s && now - prev.at < 60000) {
    return { blocked: true, reason: 'duplicate' };
  }

  // 4) Капслок-кричалка — весь текст заглавными без смысла.
  const letters = s.replace(/[^a-zа-яё]/gi, '');
  if (letters.length > 12) {
    const upper = s.replace(/[^A-ZА-ЯЁ]/g, '');
    if (upper.length === letters.length) {
      return { blocked: true, reason: 'caps' };
    }
  }

  return null;
}

let now = Date.now();
setInterval(() => { now = Date.now(); }, 1000);

// Обновляет кэш последнего сообщения (вызывать после успешной отправки).
function noteUserMsg(user, text) {
  lastUserMsg.set(user, { text: String(text || '').trim(), at: Date.now() });
  if (lastUserMsg.size > 2000) {
    const cutoff = Date.now() - 86400000;
    for (const [k, v] of lastUserMsg) if (v.at < cutoff) lastUserMsg.delete(k);
  }
}

// Сессии: до 10 устройств на аккаунт, у каждой свой токен и срок жизни.
// incomingIp передаётся отдельно, потому что на момент вызова ws ещё не привязан к пользователю.
function createSession(user, ws) {
  const now = Date.now();
  const ip = ipOf(ws);
  const knownIps = new Set(
    (user.sessions || []).map((item) => item && item.ip).filter(Boolean),
  );
  const isNewDevice = knownIps.size > 0 && !knownIps.has(ip);
  const session = {
    id: crypto.randomBytes(8).toString('hex'),
    token: newToken(),
    ip,
    ua: String(ws.ua || '').slice(0, 160),
    created: now,
    lastSeen: now,
    newDevice: isNewDevice,
  };
  const list = (user.sessions || []).filter(
    (item) => item && item.id !== session.id && item.token !== session.token,
  );
  list.unshift(session);
  user.sessions = list.slice(0, MAX_SESSIONS);
  user.token = session.token;
  user.tokenTs = now;
  return session;
}

function findSession(token) {
  if (!token) return null;
  for (const user of Object.values(db.users)) {
    const session = (user.sessions || []).find((item) => item && item.token === token);
    if (session) return { user, session };
  }
  return null;
}

function sessionTtl() {
  return Number.MAX_SAFE_INTEGER;
}

function isFriendOf(viewer, target) {
  const user = db.users[viewer];
  return !!user && (user.friends || []).includes(target);
}

function privacyAllows(rule, viewer, target) {
  if (!viewer || viewer === target) return true;
  if (rule === 'nobody') return false;
  if (rule === 'friends') return isFriendOf(viewer, target);
  return true;
}

function publicUser(user, viewer) {
  const privacy = normalizePrivacy(user.privacy);
  const hidden = user.statusKind === 'invisible' && viewer !== user.name;
  const canProfile = privacyAllows(privacy.profile, viewer, user.name);
  const canGame = canProfile && privacyAllows(privacy.game, viewer, user.name);
return {
    name: displayNameOf(user, viewer),
    displayName: user.name,
    uid: canProfile && user.uid ? Number(user.uid) : undefined,
    hiddenProfile: !canProfile,
    online: canProfile && !!user.online && !hidden,
    game: !canGame || user.hideGame || hidden ? null : user.game || null,
    statusKind: !canProfile || hidden ? 'offline' : user.statusKind || (user.online ? 'online' : 'offline'),
    avatar: canProfile && privacyAllows(privacy.photo, viewer, user.name) ? user.avatar || '' : '',
    lastSeen: canProfile && privacyAllows(privacy.lastSeen, viewer, user.name) ? user.lastActive || 0 : null,
  };
}

function groupPublic(group, viewer) {
  const owner = group.by === viewer;
  const posts = (group.posts || [])
    .filter((p) => p.published || owner)
    .map((p) => postPublic(p, viewer))
    .sort((a, b) => b.ts - a.ts);
  return {
    id: group.id,
    name: group.name,
    tagline: group.tagline,
    abbrev: group.abbrev || '',
    link: group.link || '',
    isOpen: !!group.isOpen,
    avatar: group.avatar || '',
    banner: group.banner || '',
    by: group.by,
    byUid: group.byUid || 0,
    created: group.created,
    members: (group.subs || []).length,
    subscribed: (group.subs || []).includes(viewer),
    mine: owner,
    applicant: (group.applicants || []).includes(viewer),
    applyCount: (group.applicants || []).length,
    applicantsList: (group.applicants || []).map((n) => ({ name: n, avatar: (db.users[n] || {}).avatar || '' })),
    membersList: (group.subs || []).map((n) => ({ name: n, avatar: (db.users[n] || {}).avatar || '' })),
    posts,
  };
}

function groupLite(group) {
  return {
    id: group.id,
    name: group.name,
    avatar: group.avatar || '',
    by: group.by,
  };
}

function postPublic(post, viewer) {
  return {
    id: post.id,
    by: post.by,
    text: post.text,
    image: post.image || '',
    ts: post.ts,
    likes: (post.liked || []).length,
    views: post.views || 0,
    liked: (post.liked || []).includes(viewer),
    published: post.published !== false,
  };
}

function friendsOf(name) {
  const user = db.users[name];
  if (!user) return [];
  return user.friends.filter((friend) => db.users[friend]);
}

// ——— Публикации (лента профиля) ———
const POST_VISIBILITY = ['public', 'friends', 'private'];

function canSeeFeedPost(post, viewer) {
  if (!post) return false;
  if (post.by === viewer) return true;
  const visibility = POST_VISIBILITY.includes(post.visibility) ? post.visibility : 'friends';
  if (visibility === 'private') return false;
  if (visibility === 'public') return true;
  return friendsOf(post.by).includes(viewer);
}

function feedPostPublic(post, viewer) {
  const author = db.users[post.by] || {};
  const liked = Array.isArray(post.liked) ? post.liked : [];
  const comments = Array.isArray(post.comments) ? post.comments : [];
  const poll = post.poll && Array.isArray(post.poll.options) && post.poll.options.length >= 2 ? post.poll : null;
  let voted = -1;
  let total = 0;
  let options = [];
  if (poll) {
    options = poll.options.map((opt, i) => {
      const votes = Array.isArray(opt.votes) ? opt.votes : [];
      if (votes.includes(viewer)) voted = i;
      total += votes.length;
      return { text: opt.text, votes: votes.length };
    });
  }
  return {
    id: post.id,
    by: post.by,
    author: post.by === viewer ? 'Вы' : displayNameOf(author, viewer),
    avatar: author.avatar || '',
    text: post.text || '',
    images: Array.isArray(post.images) ? post.images : [],
    game: post.game || '',
    visibility: POST_VISIBILITY.includes(post.visibility) ? post.visibility : 'friends',
    ts: post.ts,
    likes: liked.length,
    liked: liked.includes(viewer),
    comments: comments.slice(-20).map((c) => ({
      id: c.id,
      by: c.by === viewer ? 'Вы' : displayNameOf(db.users[c.by] || {}, viewer),
      avatar: (db.users[c.by] || {}).avatar || '',
      text: c.text,
      ts: c.ts,
      mine: c.by === viewer,
    })),
    commentsCount: comments.length,
    poll: poll ? { question: poll.question, options, voted, total } : null,
    mine: post.by === viewer,
  };
}

function findPostById(id) {
  if (!id) return null;
  for (const name of Object.keys(db.users)) {
    const list = Array.isArray(db.users[name].posts) ? db.users[name].posts : [];
    const post = list.find((p) => p.id === id);
    if (post) return post;
  }
  return null;
}

function userFeedPosts(name, viewer, limit) {
  const user = db.users[name];
  if (!user) return [];
  const list = Array.isArray(user.posts) ? user.posts : [];
  return list
    .filter((post) => canSeeFeedPost(post, viewer))
    .sort((a, b) => b.ts - a.ts)
    .slice(0, limit)
    .map((post) => feedPostPublic(post, viewer));
}
function incomingRequests(name) {
  const user = db.users[name];
  const list = Array.isArray(user?.reqIn) ? user.reqIn : [];
  return list
    .filter((req) => !user.friends.includes(req))
    .map((req) => ({
      name: db.users[req] ? db.users[req].name : req,
      avatar: db.users[req] ? publicUser(db.users[req], name).avatar : '',
      online: !!(db.users[req] && db.users[req].online),
    }));
}

function sendFriendRequests(name) {
  const ws = sockets.get(name);
  if (!ws) return;
  const user = db.users[name];
  const outgoing = Array.isArray(user?.reqOut) ? user.reqOut.filter((req) => db.users[req]) : [];
  send(ws, { type: 'friend_requests', requests: incomingRequests(name), outgoing });
}

// Входящие «адреса серверов», которые игроку присылают друзья.
function offersOf(name) {
  const user = db.users[name];
  return Array.isArray(user?.offers) ? user.offers : [];
}

function validAddress(address) {
  return /^[^\s:]+:\d{1,5}$/.test(address) || /^[^\s]+$/.test(address);
}

// Публичные комнаты: видны всем подключённым к серверу (через интернет).
// Хранятся только в памяти; устаревают через ROOM_TTL.
const ROOM_TTL = 8000;
const rooms = new Map(); // id -> room

function roomExpire() {
  const now = Date.now();
  for (const [id, room] of rooms) {
    if (now - room.ts > ROOM_TTL) rooms.delete(id);
  }
}

function roomPublic(room) {
  return {
    id: room.id,
    name: room.name,
    game_id: room.game_id,
    game_name: room.game_name,
    host: room.host,
    port: room.port,
    slots: room.slots,
    nick: room.nick,
    ts: room.ts,
  };
}

function allRooms() {
  roomExpire();
  return Array.from(rooms.values()).map(roomPublic);
}

const server = http.createServer((req, res) => {
  const iconMatch = /^\/icon\/([a-f0-9]{16})$/.exec(String(req.url || '').split('?')[0]);
  if (iconMatch) {
    const id = iconMatch[1];
    const entry = db.public_servers.find((s) => s.id === id);
    const ext = entry && entry.icon && entry.icon.ext;
    if (!ext) {
      res.writeHead(404);
      res.end();
      return;
    }
    fs.readFile(path.join(BANNER_DIR, 'icon-' + id + '.' + ext), (err, buf) => {
      if (err) {
        res.writeHead(404);
        res.end();
        return;
      }
      res.writeHead(200, {
        'Content-Type': BANNER_MIME[ext] || 'image/jpeg',
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Content-Length': buf.length,
      });
      res.end(buf);
    });
    return;
  }
  const bannerMatch = /^\/banner\/([a-f0-9]{16})$/.exec(String(req.url || '').split('?')[0]);
  if (bannerMatch) {
    const id = bannerMatch[1];
    const entry = db.public_servers.find((s) => s.id === id);
    const ext = entry && entry.banner && entry.banner.ext;
    if (!ext) {
      res.writeHead(404);
      res.end();
      return;
    }
    fs.readFile(path.join(BANNER_DIR, id + '.' + ext), (err, buf) => {
      if (err) {
        res.writeHead(404);
        res.end();
        return;
      }
      res.writeHead(200, {
        'Content-Type': BANNER_MIME[ext] || 'image/jpeg',
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Content-Length': buf.length,
      });
      res.end(buf);
    });
    return;
  }
  if (req.url.split('?')[0] === '/app/latest') {
    fs.readFile(path.join(RELEASES_DIR, 'latest.json'), (err, buf) => {
      if (err) {
        res.writeHead(404);
        res.end();
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(buf);
    });
    return;
  }
  const appFileMatch = /^\/app\/file\/([A-Za-z0-9._-]{1,80})$/.exec(String(req.url || '').split('?')[0]);
  if (appFileMatch) {
    const file = path.join(RELEASES_DIR, appFileMatch[1]);
    fs.readFile(file, (err, buf) => {
      if (err) {
        res.writeHead(404);
        res.end();
        return;
      }
      res.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Length': buf.length,
        'Cache-Control': 'no-store',
      });
      res.end(buf);
    });
    return;
  }
  if (req.url.split('?')[0] === '/app/publish' && req.method === 'POST') {
    const found = findSession(String(req.headers['x-token'] || ''));
    const publisher = found && found.user ? found.user.name : '';
    if (!publisher || !isAdmin(publisher)) {
      res.writeHead(403);
      res.end('forbidden');
      return;
    }
    const query = new URLSearchParams(String(req.url).split('?')[1] || '');
    const version = String(query.get('version') || '').trim();
    const confirm = String(req.headers['x-confirm'] || '').trim();
    const consent = publishConsents.get(confirm);
    if (!consent || consent.user !== publisher || consent.exp < Date.now()) {
      res.writeHead(403);
      res.end('consent_required');
      return;
    }
    publishConsents.delete(confirm);
    const notes = String(query.get('notes') || '').slice(0, 400);
    const signature = String(req.headers['x-signature'] || '').trim().toLowerCase();
    if (!/^[0-9a-f]{128}$/.test(signature)) {
      res.writeHead(400);
      res.end('bad_signature');
      return;
    }
    if (!/^\d+\.\d+\.\d+$/.test(version)) {
      res.writeHead(400);
      res.end('bad_version');
      return;
    }
    fs.mkdirSync(RELEASES_DIR, { recursive: true });
    const name = 'app-' + version + '.exe';
    const target = path.join(RELEASES_DIR, name);
    const tmp = target + '.tmp';
    let size = 0;
    let aborted = false;
    const out = fs.createWriteStream(tmp);
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 200 * 1024 * 1024) {
        aborted = true;
        req.destroy();
        out.destroy();
        fs.unlink(tmp, () => {});
      }
    });
    req.pipe(out);
    out.on('finish', () => {
      if (aborted) return;
      fs.renameSync(tmp, target);
      const hash = crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex');
      const meta = {
        version,
        notes,
        file: name,
        size,
        sha256: hash,
        sig: signature,
        url: '/app/file/' + name,
        publishedAt: Date.now(),
        by: publisher,
      };
      fs.writeFileSync(path.join(RELEASES_DIR, 'latest.json'), JSON.stringify(meta, null, 2));
      audit(publisher, 'release_publish', version, name);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(meta));
    });
    out.on('error', () => {
      res.writeHead(500);
      res.end('io');
    });
    return;
  }
  if (req.url === '/health') {
    res.writeHead(200);
    res.end('ok');
    return;
  }
  if (req.url === '/status') {
    const maintenance = db.meta.maintenance;
    res.writeHead(200, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'access-control-allow-origin': '*',
    });
    res.end(
      JSON.stringify({
        ok: true,
        service: 'game-launcher',
        version: process.env.APP_VERSION || '1.0.0',
        time: Date.now(),
        maintenance: {
          on: !!maintenance.on,
          message: maintenance.message || '',
          since: maintenance.since || 0,
        },
      }),
    );
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ server });
const sockets = new Map();
const publishConsents = new Map();

wss.on('error', (error) => {
  console.error('WebSocket server error:', error);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception (server keeps running):', error);
});

process.on('unhandledRejection', (error) => {
  console.error('Unhandled rejection (server keeps running):', error);
});

function broadcastRooms() {
  const list = allRooms();
  for (const sock of sockets.values()) {
    if (sock.readyState === 1) send(sock, { type: 'rooms', rooms: list });
  }
}

function leaveRoom(ws) {
  if (!ws.room) return;
  const id = ws.room;
  const room = rooms.get(id);
  if (room) {
    room.members.delete(ws.user);
    if (room.members.size === 0) rooms.delete(id);
  }
  ws.room = undefined;
  if (ws.user) {
    const list = allRooms();
    const sock = sockets.get(ws.user);
    if (sock && sock.readyState === 1) send(sock, { type: 'rooms', rooms: list });
  }
}

function send(ws, payload) {
  if (ws.readyState === 1) ws.send(JSON.stringify(payload));
}

function sendFriends(name) {
  const ws = sockets.get(name);
  if (!ws) return;
  send(ws, {
    type: 'friends',
    friends: friendsOf(name).map((friend) => publicUser(db.users[friend], name)),
  });
}

function authOk(ws, name, opts = {}) {
  const user = db.users[name];
  if (!user) return send(ws, { type: 'auth_fail', reason: 'token' });
  if (user.banned) return send(ws, { type: 'auth_fail', reason: 'banned' });
  if (user.totp && !opts.twofa) {
    ws.pendingAuth = { name, ts: Date.now(), tries: 0 };
    return send(ws, { type: 'auth_2fa_required', user: name });
  }
  ws.user = name;
  ws.pendingAuth = null;
  sockets.set(name, ws);
  user.online = true;
  user.game = null;
  user.lastActive = Date.now();
user.logins = (user.logins || 0) + 1;
  ws.onlineSince = Date.now();
  if (typeof user.coins !== 'number') user.coins = 200;
  if (typeof user.lastDaily !== 'number') user.lastDaily = 0;
  if (!Array.isArray(user.coinHistory)) user.coinHistory = [];
  const todayStart = Math.floor(Date.now() / DAY_MS);
  const lastDailyDay = user.lastDaily;
  const dailyReady = todayStart !== lastDailyDay;
  const session = opts.session || createSession(user, ws);
  ws.token = session.token;
  const holidayGranted = grantHolidays(user);
  save();

  const admin = isAdmin(name);
  send(ws, {
type: 'auth_ok',
    token: session.token,
    user: name,
    uid: nextUid(user) ? Number(user.uid) : undefined,
    is_admin: admin,
twofa: !!user.totp,
    reputation: user.reputation ?? 50,
    coins: user.coins ?? 200,
    daily_ready: dailyReady,
    profile: {
      bio: user.bio || '',
      statusText: user.statusText || '',
      statusKind: user.statusKind || 'online',
      hideGame: !!user.hideGame,
      avatar: user.avatar || '',
      firstName: user.firstName || '',
      lastName: user.lastName || '',
      gender: user.gender || '',
      city: user.city || '',
      country: user.country || '',
      birthdate: user.birthdate || '',
      cover: user.cover || '',
      frame: user.frame || '',
    },
progress: titleInfo(user),
    holiday_granted: holidayGranted && holidayGranted.length ? holidayGranted : undefined,
    admins: admin ? db.admins : undefined,
    weak_password: (user.passLen || 0) < (admin ? 10 : PASS_MIN),
    consent: (user.consent && user.consent.version) || '',
    consent_version: CONSENT_VERSION,
    email: user.email || '',
friends: friendsOf(name).map((friend) => publicUser(db.users[friend], name)),
    friend_requests: incomingRequests(name),
    offers: offersOf(name),
    privacy: user.privacy || DEFAULT_PRIVACY,
  });

  const presence = {
    type: 'presence',
    user: name,
    online: (user.statusKind || 'online') !== 'invisible',
    game: user.statusKind === 'invisible' ? null : null,
  };
  for (const friend of friendsOf(name)) {
    const friendSocket = sockets.get(friend);
    if (friendSocket) send(friendSocket, presence);
  }
}

wss.on('connection', (ws) => {
  ws.user = null;
  ws.hits = 0;
  ws.windowStart = Date.now();
  console.log('ws connect client', ipOf(ws));

  ws.on('error', (error) => {
    console.warn('WebSocket error:', error && error.message ? error.message : error);
    try {
      ws.terminate();
    } catch {}
  });

  const tooFast = () => {
    const now = Date.now();
    if (now - ws.windowStart > 3000) {
      ws.windowStart = now;
      ws.hits = 0;
    }
    ws.hits += 1;
    return ws.hits > 60;
  };

  ws.on('message', (raw) => {
    if (raw.length > 450000) return;
    if (tooFast()) {
      send(ws, { type: 'error', reason: 'slow_down' });
      return;
    }

    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (!msg || typeof msg.type !== 'string') return;

    switch (msg.type) {
      case 'register': {
        const name = String(msg.user || '').trim();
        const pass = String(msg.pass || '');
        if (db.meta.maintenance.on) {
          return send(ws, {
            type: 'auth_fail',
            reason: 'maintenance',
            message: db.meta.maintenance.message || '',
          });
        }
        if (!/^[A-Za-zА-Яа-яЁё0-9_]{3,20}$/.test(name)) {
          return send(ws, { type: 'auth_fail', reason: 'bad_name' });
        }
        if (!msg.consent) {
          return send(ws, { type: 'auth_fail', reason: 'consent_required' });
        }
if (pass.length < PASS_MIN || pass.length > PASS_MAX) {
          return send(ws, { type: 'auth_fail', reason: 'bad_pass' });
        }
        if (!passwordStrong(pass)) {
          return send(ws, { type: 'auth_fail', reason: 'weak_pass' });
        }
        if (isAdmin(name) && pass.length < 10) {
          return send(ws, { type: 'auth_fail', reason: 'weak_admin_pass' });
        }
        if (Object.keys(db.users).some((key) => key.toLowerCase() === name.toLowerCase())) {
          return send(ws, { type: 'auth_fail', reason: 'exists' });
        }
        const email = String(msg.email || '').trim().slice(0, 120);
        if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email)) {
          return send(ws, { type: 'auth_fail', reason: 'bad_email' });
        }
        const salt = crypto.randomBytes(16).toString('hex');
        db.users[name] = {
          name,
          email: email || null,
          salt,
          hash: hashPassword(pass, salt),
          friends: [],
          sessions: [],
          consent: { version: CONSENT_VERSION, ts: Date.now(), ip: ipOf(ws) },
          passLen: pass.length,
          reputation: 50,
          ratings: {},
          createdAt: Date.now(),
logins: 1,
          onlineMs: 0,
          coins: 200,
          lastDaily: 0,
          coinHistory: [],
          gamesSeen: [],
          bio: '',
          firstName: '',
          lastName: '',
          statusText: '',
          statusKind: 'online',
          hideGame: false,
          gender: '',
          city: '',
          country: '',
          birthdate: '',
          cover: '',
          frame: '',
          posts: [],
          online: false,
          game: null,
        };
save();
        audit(name, 'register', name, 'consent ' + CONSENT_VERSION);
        nextUid(db.users[name]);
        save();
        return authOk(ws, name);
      }

      case 'login': {
        const name = resolveUserName(msg.user);
        const pass = String(msg.pass || '');
        const ip = ipOf(ws);
        const ipWait = ipBlocked(ip);
        if (ipWait > 0) {
          return send(ws, { type: 'auth_fail', reason: 'ip_locked', wait: Math.ceil(ipWait / 1000) });
        }
        const wait = lockLeft(name);
        if (wait > 0) {
          ipFail(ip);
          return send(ws, {
            type: 'auth_fail',
            reason: 'locked',
            wait: Math.ceil(wait / 1000),
          });
        }
        const user = db.users[name];
        if (!user || !verifyPassword(pass, user)) {
          ipFail(ip);
          const locked = failLogin(name);
          return send(ws, {
            type: 'auth_fail',
            reason: locked ? 'locked' : 'bad_login',
            wait: locked ? 300 : 0,
          });
        }
        if (db.meta.maintenance.on && !isAdmin(user.name)) {
          return send(ws, {
            type: 'auth_fail',
            reason: 'maintenance',
            message: db.meta.maintenance.message || '',
          });
        }
        okLogin(name);
        ipOk(ip);
        user.passLen = pass.length;
        save();
        return authOk(ws, name);
      }

      case 'auth': {
        const token = String(msg.token || '');
        const found = findSession(token);
        if (!found) return send(ws, { type: 'auth_fail', reason: 'token' });
        const entry = found.user;
        if (db.meta.maintenance.on && !isAdmin(entry.name)) {
          return send(ws, {
            type: 'auth_fail',
            reason: 'maintenance',
            message: db.meta.maintenance.message || '',
          });
        }
        const session = found.session;
        const ttl = sessionTtl(entry.name);
        const last = session.lastSeen || session.created || 0;
        if (Date.now() - last > ttl) {
          entry.sessions = (entry.sessions || []).filter((item) => item.token !== token);
          save();
          return send(ws, { type: 'auth_fail', reason: 'token' });
        }
        session.lastSeen = Date.now();
        if (!entry.tokenTs) entry.tokenTs = Date.now();
        return authOk(ws, entry.name, { session });
      }

      case 'friend_add': {
        if (!ws.user) return;
        const target = resolveUserName(msg.user);
        if (!db.users[target]) return send(ws, { type: 'error', reason: 'no_user' });
        if (target === ws.user) return send(ws, { type: 'error', reason: 'self' });
        const targetPrivacy = normalizePrivacy(db.users[target].privacy);
        if (targetPrivacy.friendRequests === 'nobody') {
          return send(ws, { type: 'error', reason: 'privacy_friends' });
        }
        const user = db.users[ws.user];
        if (!user.friends.includes(target)) {
          user.friends.push(target);
          const other = db.users[target];
          if (!other.friends.includes(ws.user)) other.friends.push(ws.user);
          save();
        }
sendFriends(ws.user);
        sendFriends(target);
        return;
      }

      case 'friend_request_list': {
        if (!ws.user) return;
        sendFriendRequests(ws.user);
        return;
      }

      case 'friend_request_send': {
        if (!ws.user) return;
        const targetUser = userByRef(msg.user);
        if (!targetUser) return send(ws, { type: 'error', reason: 'no_user' });
        const target = targetUser.name;
        if (target === ws.user) return send(ws, { type: 'error', reason: 'self' });
        const targetPrivacy = normalizePrivacy(db.users[target].privacy);
        if (targetPrivacy.friendRequests === 'nobody') {
          return send(ws, { type: 'error', reason: 'privacy_friends' });
        }
        const me = db.users[ws.user];
        if (me.friends.includes(target)) return send(ws, { type: 'error', reason: 'already' });
        me.reqOut = Array.isArray(me.reqOut) ? me.reqOut : [];
        me.reqIn = Array.isArray(me.reqIn) ? me.reqIn : [];
        const other = db.users[target];
        other.reqIn = Array.isArray(other.reqIn) ? other.reqIn : [];
        other.reqOut = Array.isArray(other.reqOut) ? other.reqOut : [];

        // Встречная заявка: оба уже хотели — сразу дружим.
        if (other.reqOut.includes(ws.user) || me.reqIn.includes(target)) {
          me.reqIn = (me.reqIn || []).filter((x) => x !== target);
          other.reqOut = (other.reqOut || []).filter((x) => x !== ws.user);
          if (!me.friends.includes(target)) me.friends.push(target);
          if (!other.friends.includes(ws.user)) other.friends.push(ws.user);
          save();
          send(ws, { type: 'friend_request_sent', user: target, mutual: true });
          sendFriends(ws.user);
          sendFriends(target);
          sendFriendRequests(ws.user);
          sendFriendRequests(target);
          return;
        }

        if (!other.reqIn.includes(ws.user)) other.reqIn.push(ws.user);
        if (!me.reqOut.includes(target)) me.reqOut.push(target);
        save();
        send(ws, { type: 'friend_request_sent', user: target });
        sendFriendRequests(target);
        sendFriendRequests(ws.user);
        return;
      }

      case 'friend_request_accept': {
        if (!ws.user) return;
        const from = resolveUserName(msg.user);
        const user = db.users[ws.user];
        const sender = db.users[from];
        if (!user || !sender) return;
        user.reqIn = (user.reqIn || []).filter((x) => x !== from);
        sender.reqOut = (sender.reqOut || []).filter((x) => x !== ws.user);
        if (!user.friends.includes(from)) user.friends.push(from);
        if (!sender.friends.includes(ws.user)) sender.friends.push(ws.user);
        save();
        sendFriends(ws.user);
        sendFriends(from);
        sendFriendRequests(ws.user);
        return;
      }

      case 'friend_request_cancel': {
        if (!ws.user) return;
        const cancelUser = userByRef(msg.user);
        if (!cancelUser) return send(ws, { type: 'error', reason: 'no_user' });
        const me = db.users[ws.user];
        me.reqOut = (me.reqOut || []).filter((x) => x !== cancelUser.name);
        cancelUser.reqIn = (cancelUser.reqIn || []).filter((x) => x !== ws.user);
        save();
        sendFriendRequests(ws.user);
        sendFriendRequests(cancelUser.name);
        return;
      }

      case 'friend_request_decline': {
        if (!ws.user) return;
        const from = resolveUserName(msg.user);
        const user = db.users[ws.user];
        const sender = db.users[from];
        if (user) user.reqIn = (user.reqIn || []).filter((x) => x !== from);
        if (sender) sender.reqOut = (sender.reqOut || []).filter((x) => x !== ws.user);
        save();
        sendFriendRequests(ws.user);
        return;
      }

      case 'friend_remove': {
        if (!ws.user) return;
        const target = resolveUserName(msg.user);
        const user = db.users[ws.user];
        user.friends = user.friends.filter((friend) => friend !== target);
        if (db.users[target]) {
          db.users[target].friends = db.users[target].friends.filter(
            (friend) => friend !== ws.user,
          );
        }
        save();
        sendFriends(ws.user);
        sendFriends(target);
        return;
      }

case 'chat': {
        if (!ws.user) return;
        const to = resolveUserName(msg.to);
        const text = String(msg.text || '').slice(0, 2000);
        if (!text.trim()) return;
        const sp = spamCheck(ws, text);
        if (sp) return send(ws, { type: 'error', reason: sp.reason });
        const cd = cooldown(ws, 'chat');
        if (cd) return send(ws, { type: 'error', reason: 'slow_down', wait: cd });
        const chatTarget = db.users[to];
        if (!chatTarget) return send(ws, { type: 'error', reason: 'no_user' });
        const chatPrivacy = normalizePrivacy(chatTarget.privacy);
        const friends = friendsOf(ws.user).includes(to);
        if (!friends && chatPrivacy.messages !== 'everyone') {
          return send(ws, { type: 'error', reason: 'privacy_messages' });
        }
        noteUserMsg(ws.user, text);
        const payload = { type: 'chat', from: ws.user, text, ts: Date.now() };
        const targetSocket = sockets.get(to);
        if (targetSocket) send(targetSocket, payload);
        return send(ws, payload);
      }

case 'status': {
        if (!ws.user) return;
        const game = msg.game ? String(msg.game).slice(0, 120) : null;
        if (game) {
          const sp = spamCheck(ws, game);
          if (sp) return send(ws, { type: 'error', reason: sp.reason });
        }
        const cdStatus = cooldown(ws, 'status');
        if (cdStatus) return send(ws, { type: 'error', reason: 'slow_down', wait: cdStatus });
        const statusUser = db.users[ws.user];
        statusUser.game = game;
        if (game && !statusUser.gamesSeen.includes(game)) {
          statusUser.gamesSeen.push(game);
          if (statusUser.gamesSeen.length > 50) statusUser.gamesSeen.shift();
        }
        save();
        const presence = {
          type: 'presence',
          user: ws.user,
          online: (statusUser.statusKind || 'online') !== 'invisible',
          game: statusUser.hideGame || statusUser.statusKind === 'invisible' ? null : game,
          statusKind: statusUser.statusKind || 'online',
        };
        for (const friend of friendsOf(ws.user)) {
          const friendSocket = sockets.get(friend);
          if (friendSocket) send(friendSocket, presence);
        }
return;
      }

      case 'online_now': {
        if (!ws.user) return send(ws, { type: 'error', reason: 'forbidden' });
        const me = db.users[ws.user];
        const list = [];
        for (const [name, sock] of sockets) {
          if (sock.readyState !== 1) continue;
          const user = db.users[name];
          if (!user || !user.online) continue;
          if (user.statusKind === 'invisible') continue;
          list.push(publicUser(user, ws.user));
        }
        list.sort((a, b) => b.lastSeen - a.lastSeen || a.name.localeCompare(b.name, 'ru'));
        send(ws, { type: 'online_now', users: list, count: list.length });
        return;
      }

      case 'players_list': {
        const viewer = ws.user || null;
        const q = String(msg.q || '').trim().toLowerCase().slice(0, 40);
        const gender = ['m', 'f'].includes(msg.gender) ? msg.gender : '';
        const city = String(msg.city || '').trim().toLowerCase().slice(0, 40);
        const country = String(msg.country || '').trim().toLowerCase().slice(0, 40);
        const sort = ['playtime', 'games', 'followers', 'name', 'rating', 'online'].includes(msg.sort)
          ? msg.sort
          : 'playtime';
        const limit = Math.min(Math.max(parseInt(msg.limit, 10) || 30, 1), 60);
        const offset = Math.max(parseInt(msg.offset, 10) || 0, 0);

        const all = Object.values(db.users);
        const followers = {};
        for (const u of all) {
          for (const f of u.friends || []) followers[f] = (followers[f] || 0) + 1;
        }

        let items = [];
        for (const u of all) {
          if (u.banned) continue;
          const hidden = u.statusKind === 'invisible' && viewer !== u.name;
          const uPriv = normalizePrivacy(u.privacy);
          const canProfile = privacyAllows(uPriv.profile, viewer, u.name);
          const canGame = canProfile && privacyAllows(uPriv.game, viewer, u.name);
          const canFriends = canProfile && privacyAllows(uPriv.friends, viewer, u.name);
          const info = titleInfo(u);
          items.push({
            name: u.name,
            display: displayNameOf(u, viewer),
            uid: canProfile && u.uid ? Number(u.uid) : undefined,
            hiddenProfile: !canProfile,
            online: canProfile && !!u.online && !hidden,
            statusKind: !canProfile || hidden ? 'offline' : u.statusKind || (u.online ? 'online' : 'offline'),
            avatar: canProfile && privacyAllows(uPriv.photo, viewer, u.name) ? u.avatar || '' : '',
            gender: canProfile ? u.gender || '' : '',
            city: canProfile ? u.city || '' : '',
            country: canProfile ? u.country || '' : '',
            followers: canFriends ? followers[u.name] || 0 : 0,
            following: canFriends ? (u.friends || []).length : 0,
            games: canGame ? (u.gamesSeen || []).length : 0,
            minutes: canGame ? Math.round((u.onlineMs || 0) / 60000) : 0,
            reputation: canProfile ? u.reputation ?? 50 : 0,
            title: canProfile && info ? info.title : '',
            game: canGame && !u.hideGame && !hidden ? u.game || null : null,
            isAdmin: isAdmin(u.name),
          });
        }

        if (q) {
          items = items.filter(
            (x) =>
              x.name.includes(q) ||
              (x.city || '').toLowerCase().includes(q) ||
              (x.country || '').toLowerCase().includes(q)
          );
        }
        if (gender) items = items.filter((x) => x.gender === gender);
        if (city) items = items.filter((x) => (x.city || '').toLowerCase().includes(city));
        if (country) items = items.filter((x) => (x.country || '').toLowerCase() === country);

        const cmp = {
          playtime: (a, b) => b.minutes - a.minutes,
          games: (a, b) => b.games - a.games,
          followers: (a, b) => b.followers - a.followers,
          rating: (a, b) => b.reputation - a.reputation,
          name: (a, b) => a.name.localeCompare(b.name, 'ru'),
          online: (a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name, 'ru'),
        }[sort];
        items.sort((a, b) => cmp(a, b) || a.name.localeCompare(b.name, 'ru'));

        const total = items.length;
        const onlineCount = items.filter((x) => x.online).length;
        const page = items.slice(offset, offset + limit);

        const uniq = (key) => [...new Set(all.map((u) => u[key]).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru'));

        send(ws, {
          type: 'players_list',
          items: page,
          total,
          online: onlineCount,
          offset,
          limit,
          cities: uniq('city').slice(0, 80),
          countries: uniq('country').slice(0, 80),
        });
        return;
      }

      case 'profile_vote': {
        if (!ws.user) return send(ws, { type: 'error', reason: 'forbidden' });
        const voteTarget = userByRef(msg.user);
        if (!voteTarget) return send(ws, { type: 'error', reason: 'no_user' });
        if (voteTarget.name === ws.user) return send(ws, { type: 'error', reason: 'self' });
        const cdVote = cooldown(ws, 'profile_vote');
        if (cdVote) return send(ws, { type: 'error', reason: 'slow_down', wait: cdVote });
        const rawVote = Number(msg.value);
        const value = rawVote === 1 ? 1 : rawVote === -1 ? -1 : 0;
        if (!voteTarget.ratings) voteTarget.ratings = {};
        const prevVote = voteTarget.ratings[ws.user] || 0;
        const nextVote = prevVote === value ? 0 : value;
        if (nextVote) voteTarget.ratings[ws.user] = nextVote;
        else delete voteTarget.ratings[ws.user];
        voteTarget.reputation = Math.max(
          0,
          Math.min(100, (voteTarget.reputation ?? 50) + (nextVote - prevVote))
        );
        save();
        const allVotes = Object.values(voteTarget.ratings);
        send(ws, {
          type: 'profile_voted',
          user: voteTarget.name,
          reputation: voteTarget.reputation,
          myVote: nextVote,
          likes: allVotes.filter((v) => v > 0).length,
          dislikes: allVotes.filter((v) => v < 0).length,
        });
        return;
      }

      case 'profile_view': {
        if (!ws.user) return send(ws, { type: 'error', reason: 'forbidden' });
        const targetUser = userByRef(msg.user);
        if (!targetUser) return send(ws, { type: 'error', reason: 'no_user' });
        const t = targetUser.name;
        const privacy = normalizePrivacy(targetUser.privacy);
        const hidden = targetUser.statusKind === 'invisible' && t !== ws.user;
        const info = titleInfo(targetUser);
        const viewer = ws.user;
        const canProfile = privacyAllows(privacy.profile, viewer, t);
        const canGameInfo = canProfile && privacyAllows(privacy.game, viewer, t);
        const canFriends = canProfile && privacyAllows(privacy.friends, viewer, t);
        send(ws, {
          type: 'profile_info',
          user: {
            name: displayNameOf(targetUser, viewer),
            displayName: t,
            uid: canProfile && targetUser.uid ? Number(targetUser.uid) : undefined,
            online: canProfile && !!targetUser.online && !hidden,
            statusKind: !canProfile || hidden ? 'offline' : targetUser.statusKind || (targetUser.online ? 'online' : 'offline'),
            game: !canGameInfo || targetUser.hideGame || hidden ? null : targetUser.game || null,
            avatar: canProfile && privacyAllows(privacy.photo, viewer, t) ? targetUser.avatar || '' : '',
            bio: canProfile ? targetUser.bio || '' : '',
            firstName: canProfile ? targetUser.firstName || '' : '',
            lastName: canProfile ? targetUser.lastName || '' : '',
            statusText: canProfile ? targetUser.statusText || '' : '',
            cover: canProfile ? targetUser.cover || '' : '',
            frame: canProfile ? targetUser.frame || '' : '',
            birthdate: canProfile ? targetUser.birthdate || '' : '',
            gender: canProfile ? targetUser.gender || '' : '',
            city: canProfile ? targetUser.city || '' : '',
            country: canProfile ? targetUser.country || '' : '',
            reputation: canProfile ? targetUser.reputation ?? 50 : 0,
            likes: canProfile ? Object.values(targetUser.ratings || {}).filter((v) => v > 0).length : 0,
            dislikes: canProfile ? Object.values(targetUser.ratings || {}).filter((v) => v < 0).length : 0,
            myVote: canProfile ? (targetUser.ratings || {})[viewer] || 0 : 0,
            lastSeen: canProfile && privacyAllows(privacy.lastSeen, viewer, t) ? targetUser.lastActive || 0 : null,
            isAdmin: isAdmin(t),
            title: canProfile ? info.title : '',
            xp: canProfile ? info.xp : 0,
            achievements: canProfile ? info.achievements : [],
            posts: canProfile ? userFeedPosts(t, viewer, 10) : [],
            friendship: ws.user === t ? 'self' : (targetUser.friends || []).includes(ws.user) ? 'friends' : 'none',
            friendsCount: canFriends ? (targetUser.friends || []).length : 0,
            friendsList: canFriends
              ? (targetUser.friends || [])
                  .filter((n) => db.users[n])
                  .map((n) => {
                    const u = db.users[n];
                    return { name: displayNameOf(u, ws.user), avatar: u.avatar || '', online: !!u.online };
                  })
                  .slice(0, 20)
              : [],
            followersCount: canFriends
              ? Object.values(db.users).filter((u) => (u.friends || []).includes(t)).length
              : 0,
            followersList: canFriends
              ? Object.values(db.users)
                  .filter((u) => (u.friends || []).includes(t))
                  .map((u) => ({ name: displayNameOf(u, ws.user), avatar: u.avatar || '', online: !!u.online }))
                  .slice(0, 20)
              : [],
          },
        });
        return;
      }

      case 'groups_list': {
        if (!ws.user) return send(ws, { type: 'error', reason: 'forbidden' });
        const me = db.users[ws.user];
        const subs = new Set(me.subs || []);
        const groups = db.groups.map((g) => ({
          id: g.id,
          name: g.name,
          tagline: g.tagline,
          abbrev: g.abbrev || '',
          link: g.link || '',
          isOpen: !!g.isOpen,
          avatar: g.avatar || '',
          banner: g.banner || '',
          by: g.by,
          created: g.created,
          members: (g.subs || []).length,
          posts: (g.posts || []).length,
          subscribed: subs.has(g.id),
          mine: g.by === ws.user,
        }));
        groups.sort((a, b) => b.members - a.members || b.created - a.created);
        // подписанные группы отдельно, для ленты
        const subscribedGroups = groups.filter((g) => g.subscribed);
        send(ws, { type: 'groups', groups, subscribed: subscribedGroups });
        return;
      }

      case 'group_create': {
        if (!ws.user) return send(ws, { type: 'error', reason: 'forbidden' });
        const name = String(msg.name || '').trim().slice(0, 40);
        const tagline = String(msg.tagline || '').trim().slice(0, 120);
        const abbrev = String(msg.abbrev || '').trim().slice(0, 20);
        const link = String(msg.link || '').trim().slice(0, 60);
        const isOpen = !!msg.isOpen;
        const avatar = typeof msg.avatar === 'string' ? msg.avatar.slice(0, 400000) : '';
        const banner = typeof msg.banner === 'string' ? msg.banner.slice(0, 400000) : '';
        if (!name) return send(ws, { type: 'error', reason: 'empty' });
        const sp = spamCheck(ws, name + ' ' + tagline);
        if (sp) return send(ws, { type: 'error', reason: sp.reason });
        const cd = cooldown(ws, 'group_create');
        if (cd) return send(ws, { type: 'error', reason: 'slow_down', wait: cd });
        const id = 'g' + Date.now().toString(36) + Math.floor(Math.random() * 1000).toString(36);
        const group = {
          id,
          name,
          tagline,
          abbrev,
          link,
          isOpen,
          avatar,
          banner,
          by: ws.user,
          byUid: db.users[ws.user].uid || 0,
          created: Date.now(),
          subs: [ws.user],
          applicants: [],
          posts: [],
        };
        db.users[ws.user].subs = db.users[ws.user].subs || [];
        db.users[ws.user].subs.push(id);
        db.groups.push(group);
        save();
        audit(ws.user, 'group_create', id, name);
        send(ws, { type: 'group_created', group: groupPublic(group, ws.user) });
        return;
      }

      case 'group_info': {
        if (!ws.user) return send(ws, { type: 'error', reason: 'forbidden' });
        const group = db.groups.find((g) => g.id === msg.id);
        if (!group) return send(ws, { type: 'error', reason: 'no_group' });
        send(ws, { type: 'group_info', group: groupPublic(group, ws.user) });
        return;
      }

      case 'group_subscribe': {
        if (!ws.user) return send(ws, { type: 'error', reason: 'forbidden' });
        const group = db.groups.find((g) => g.id === msg.id);
        if (!group) return send(ws, { type: 'error', reason: 'no_group' });
        const me = db.users[ws.user];
        me.subs = me.subs || [];
        if (!me.subs.includes(group.id)) {
          me.subs.push(group.id);
          if (!group.subs.includes(ws.user)) group.subs.push(ws.user);
          save();
        }
        send(ws, { type: 'group_subscribed', id: group.id, subscribed: true });
        return;
      }

      case 'group_unsubscribe': {
        if (!ws.user) return send(ws, { type: 'error', reason: 'forbidden' });
        const group = db.groups.find((g) => g.id === msg.id);
        const me = db.users[ws.user];
        me.subs = me.subs || [];
        me.subs = me.subs.filter((s) => s !== msg.id);
        if (group) group.subs = group.subs.filter((s) => s !== ws.user);
        save();
        send(ws, { type: 'group_subscribed', id: msg.id, subscribed: false });
        return;
      }

      case 'group_post': {
        if (!ws.user) return send(ws, { type: 'error', reason: 'forbidden' });
        const group = db.groups.find((g) => g.id === msg.id);
        if (!group) return send(ws, { type: 'error', reason: 'no_group' });
        const text = String(msg.text || '').trim();
        const image = typeof msg.image === 'string' ? msg.image.slice(0, 400000) : '';
        if (!text && !image) return send(ws, { type: 'error', reason: 'empty' });
        if (group.by !== ws.user && !isAdmin(ws.user)) {
          return send(ws, { type: 'error', reason: 'forbidden' });
        }
        if (text) {
          const sp = spamCheck(ws, text);
          if (sp) return send(ws, { type: 'error', reason: sp.reason });
        }
        const cd = cooldown(ws, 'group_post');
        if (cd) return send(ws, { type: 'error', reason: 'slow_down', wait: cd });
        const post = {
          id: 'p' + Date.now().toString(36) + Math.floor(Math.random() * 1000).toString(36),
          by: ws.user,
          text: text.slice(0, 3000),
          image,
          ts: Date.now(),
          likes: 0,
          views: 0,
          published: msg.published !== false,
        };
        noteUserMsg(ws.user, text);
        group.posts.push(post);
        save();
        audit(ws.user, 'group_post', group.id, 'post');
        send(ws, { type: 'post_created', group: groupPublic(group, ws.user) });
        return;
      }

      case 'group_publish': {
        if (!ws.user) return send(ws, { type: 'error', reason: 'forbidden' });
        const group = db.groups.find((g) => g.id === msg.id);
        if (!group || (group.by !== ws.user && !isAdmin(ws.user))) return send(ws, { type: 'error', reason: 'forbidden' });
        const post = group.posts.find((p) => p.id === msg.post);
        if (!post) return send(ws, { type: 'error', reason: 'no_post' });
        post.published = msg.published !== false;
        save();
        send(ws, { type: 'post_created', group: groupPublic(group, ws.user) });
        return;
      }

      case 'group_apply': {
        if (!ws.user) return send(ws, { type: 'error', reason: 'forbidden' });
        const group = db.groups.find((g) => g.id === msg.id);
        if (!group) return send(ws, { type: 'error', reason: 'no_group' });
        if (group.by === ws.user) return send(ws, { type: 'error', reason: 'owner' });
        if ((group.subs || []).includes(ws.user)) return send(ws, { type: 'error', reason: 'already_member' });
        group.applicants = group.applicants || [];
        if (!group.applicants.includes(ws.user)) {
          group.applicants.push(ws.user);
          save();
        }
        send(ws, { type: 'group_applied', id: group.id, group: groupPublic(group, ws.user) });
        return;
      }

      case 'group_apply_resolve': {
        if (!ws.user) return send(ws, { type: 'error', reason: 'forbidden' });
        const group = db.groups.find((g) => g.id === msg.id);
        if (!group || (group.by !== ws.user && !isAdmin(ws.user))) return send(ws, { type: 'error', reason: 'forbidden' });
        const target = String(msg.target || '');
        if (!target) return send(ws, { type: 'error', reason: 'empty' });
        group.applicants = group.applicants || [];
        const idx = group.applicants.indexOf(target);
        if (idx < 0) return send(ws, { type: 'error', reason: 'no_apply' });
        if (msg.accept) {
          group.applicants.splice(idx, 1);
          group.subs = group.subs || [];
          if (!group.subs.includes(target)) group.subs.push(target);
          const u = db.users[target];
          if (u) { u.subs = u.subs || []; if (!u.subs.includes(group.id)) u.subs.push(group.id); }
        } else {
          group.applicants.splice(idx, 1);
        }
        save();
        send(ws, { type: 'group_apply_resolved', id: group.id, group: groupPublic(group, ws.user) });
        return;
      }

      case 'group_post_like': {
        if (!ws.user) return send(ws, { type: 'error', reason: 'forbidden' });
        const group = db.groups.find((g) => g.id === msg.id);
        const post = group && group.posts.find((p) => p.id === msg.post);
        if (!group || !post) return send(ws, { type: 'error', reason: 'no_post' });
        post.liked = post.liked || [];
        const idx = post.liked.indexOf(ws.user);
        if (idx >= 0) post.liked.splice(idx, 1);
        else post.liked.push(ws.user);
        post.likes = post.liked.length;
        save();
        send(ws, { type: 'post_liked', id: group.id, post: postPublic(post, ws.user) });
        return;
      }

      case 'news_feed': {
        if (!ws.user) return send(ws, { type: 'error', reason: 'forbidden' });
        const me = db.users[ws.user];
        const subs = new Set(me.subs || []);
        const feed = [];
        const limit = Math.min(Number(msg.limit) || 40, 60);
        for (const g of db.groups) {
          if (!subs.has(g.id)) continue;
          for (const p of g.posts) feed.push({ g: groupLite(g), post: postPublic(p, ws.user) });
        }
        feed.sort((a, b) => b.post.ts - a.post.ts);
        send(ws, { type: 'news_feed', feed: feed.slice(0, limit) });
        return;
      }

      case 'feed_list': {
        if (!ws.user) return send(ws, { type: 'error', reason: 'forbidden' });
        const viewer = ws.user;
        const names = new Set([viewer, ...friendsOf(viewer)]);
        const posts = [];
        for (const name of names) {
          for (const post of userFeedPosts(name, viewer, 60)) {
            if (!posts.some((p) => p.id === post.id)) posts.push(post);
          }
        }
        posts.sort((a, b) => b.ts - a.ts);
        send(ws, { type: 'feed_list', posts: posts.slice(0, 60) });
        return;
      }

      case 'post_create': {
        if (!ws.user) return send(ws, { type: 'error', reason: 'forbidden' });
        const me = db.users[ws.user];
        const text = String(msg.text || '').trim().slice(0, 2000);
        const images = (Array.isArray(msg.images) ? msg.images : [])
          .filter((src) => typeof src === 'string' && src.startsWith('data:image/') && src.length <= 700000)
          .slice(0, 4);
        const game = String(msg.game || '').trim().slice(0, 120);
        const visibility = POST_VISIBILITY.includes(msg.visibility) ? msg.visibility : 'friends';
        const pollIn = msg.poll && typeof msg.poll === 'object' ? msg.poll : null;
        let poll = null;
        if (pollIn) {
          const question = String(pollIn.question || '').trim().slice(0, 140);
          const options = (Array.isArray(pollIn.options) ? pollIn.options : [])
            .map((opt) => String(opt || '').trim().slice(0, 80))
            .filter(Boolean)
            .slice(0, 4);
          if (question && options.length >= 2) {
            poll = { question, options: options.map((opt) => ({ text: opt, votes: [] })) };
          }
        }
        if (!text && images.length === 0 && !poll) return send(ws, { type: 'error', reason: 'empty' });
        if (text) {
          const sp = spamCheck(ws, text);
          if (sp) return send(ws, { type: 'error', reason: sp.reason });
        }
        const cdPost = cooldown(ws, 'post_create');
        if (cdPost) return send(ws, { type: 'error', reason: 'slow_down', wait: cdPost });
        me.posts = Array.isArray(me.posts) ? me.posts : [];
        const newPost = {
          id: 'f' + Date.now().toString(36) + Math.floor(Math.random() * 1000).toString(36),
          by: ws.user,
          text,
          images,
          game,
          visibility,
          poll,
          liked: [],
          comments: [],
          ts: Date.now(),
        };
        me.posts.unshift(newPost);
        if (me.posts.length > 200) me.posts.length = 200;
        if (text) noteUserMsg(ws.user, text);
        save();
        audit(ws.user, 'post_create', ws.user, visibility);
        send(ws, { type: 'post_created', post: feedPostPublic(newPost, ws.user) });
        return;
      }

      case 'post_delete': {
        if (!ws.user) return send(ws, { type: 'error', reason: 'forbidden' });
        const postDel = findPostById(msg.id);
        if (!postDel) return send(ws, { type: 'error', reason: 'no_post' });
        if (postDel.by !== ws.user && !isAdmin(ws.user)) {
          return send(ws, { type: 'error', reason: 'forbidden' });
        }
        const ownerDel = db.users[postDel.by];
        if (ownerDel && Array.isArray(ownerDel.posts)) {
          ownerDel.posts = ownerDel.posts.filter((p) => p.id !== postDel.id);
        }
        save();
        audit(ws.user, 'post_delete', postDel.by, postDel.id);
        send(ws, { type: 'post_deleted', id: postDel.id });
        return;
      }

      case 'post_like': {
        if (!ws.user) return send(ws, { type: 'error', reason: 'forbidden' });
        const postLike = findPostById(msg.id);
        if (!postLike || !canSeeFeedPost(postLike, ws.user)) {
          return send(ws, { type: 'error', reason: 'no_post' });
        }
        postLike.liked = Array.isArray(postLike.liked) ? postLike.liked : [];
        const likeIdx = postLike.liked.indexOf(ws.user);
        if (likeIdx >= 0) postLike.liked.splice(likeIdx, 1);
        else postLike.liked.push(ws.user);
        save();
        send(ws, { type: 'post_updated', post: feedPostPublic(postLike, ws.user) });
        return;
      }

      case 'post_comment': {
        if (!ws.user) return send(ws, { type: 'error', reason: 'forbidden' });
        const postCmt = findPostById(msg.id);
        if (!postCmt || !canSeeFeedPost(postCmt, ws.user)) {
          return send(ws, { type: 'error', reason: 'no_post' });
        }
        const cmtText = String(msg.text || '').trim().slice(0, 500);
        if (!cmtText) return send(ws, { type: 'error', reason: 'empty' });
        const spCmt = spamCheck(ws, cmtText);
        if (spCmt) return send(ws, { type: 'error', reason: spCmt.reason });
        const cdCmt = cooldown(ws, 'post_comment');
        if (cdCmt) return send(ws, { type: 'error', reason: 'slow_down', wait: cdCmt });
        postCmt.comments = Array.isArray(postCmt.comments) ? postCmt.comments : [];
        postCmt.comments.push({
          id: 'c' + Date.now().toString(36) + Math.floor(Math.random() * 1000).toString(36),
          by: ws.user,
          text: cmtText,
          ts: Date.now(),
        });
        if (postCmt.comments.length > 200) postCmt.comments = postCmt.comments.slice(-200);
        noteUserMsg(ws.user, cmtText);
        save();
        send(ws, { type: 'post_updated', post: feedPostPublic(postCmt, ws.user) });
        return;
      }

      case 'post_vote': {
        if (!ws.user) return send(ws, { type: 'error', reason: 'forbidden' });
        const postVote = findPostById(msg.id);
        if (!postVote || !canSeeFeedPost(postVote, ws.user)) {
          return send(ws, { type: 'error', reason: 'no_post' });
        }
        if (!postVote.poll || !Array.isArray(postVote.poll.options)) {
          return send(ws, { type: 'error', reason: 'no_poll' });
        }
        const optionIdx = Number(msg.option);
        if (!Number.isInteger(optionIdx) || optionIdx < 0 || optionIdx >= postVote.poll.options.length) {
          return send(ws, { type: 'error', reason: 'bad_option' });
        }
        for (const opt of postVote.poll.options) {
          opt.votes = Array.isArray(opt.votes) ? opt.votes : [];
          const vIdx = opt.votes.indexOf(ws.user);
          if (vIdx >= 0) opt.votes.splice(vIdx, 1);
        }
        postVote.poll.options[optionIdx].votes.push(ws.user);
        save();
        send(ws, { type: 'post_updated', post: feedPostPublic(postVote, ws.user) });
        return;
      }

case 'profile_set': {
        if (!ws.user) return send(ws, { type: 'error', reason: 'forbidden' });
        const profileUser = db.users[ws.user];
        const spBio = typeof msg.bio === 'string' ? spamCheck(ws, msg.bio) : null;
        if (spBio) return send(ws, { type: 'error', reason: spBio.reason });
        const cdProfile = cooldown(ws, 'profile_set');
        if (cdProfile) return send(ws, { type: 'error', reason: 'slow_down', wait: cdProfile });
        if (typeof msg.bio === 'string') profileUser.bio = msg.bio.slice(0, 300).trim();
        if (typeof msg.statusText === 'string') {
          const spStatus = spamCheck(ws, msg.statusText);
          if (spStatus) return send(ws, { type: 'error', reason: spStatus.reason });
          profileUser.statusText = msg.statusText.slice(0, 80).trim();
        }
        if (
          typeof msg.statusKind === 'string' &&
          ['online', 'away', 'dnd', 'invisible'].includes(msg.statusKind)
        ) {
          profileUser.statusKind = msg.statusKind;
        }
        if (typeof msg.hideGame === 'boolean') profileUser.hideGame = msg.hideGame;
        if (typeof msg.gender === 'string' && ['', 'm', 'f'].includes(msg.gender)) {
          profileUser.gender = msg.gender;
        }
        if (typeof msg.city === 'string') {
          const spCity = spamCheck(ws, msg.city);
          if (spCity) return send(ws, { type: 'error', reason: spCity.reason });
          profileUser.city = msg.city.replace(/[<>]/g, '').slice(0, 40).trim();
        }
        if (typeof msg.country === 'string') {
          const spCountry = spamCheck(ws, msg.country);
          if (spCountry) return send(ws, { type: 'error', reason: spCountry.reason });
          profileUser.country = msg.country.replace(/[<>]/g, '').slice(0, 40).trim();
        }
        if (typeof msg.birthdate === 'string') {
          const raw = msg.birthdate.trim();
          if (raw === '') {
            profileUser.birthdate = '';
          } else {
            const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
            if (!parts) return send(ws, { type: 'error', reason: 'bad_date' });
            const by = Number(parts[1]);
            const bm = Number(parts[2]);
            const bd = Number(parts[3]);
            const probe = new Date(Date.UTC(by, bm - 1, bd));
            const valid =
              probe.getUTCFullYear() === by &&
              probe.getUTCMonth() === bm - 1 &&
              probe.getUTCDate() === bd &&
              by >= 1900 &&
              by <= new Date().getUTCFullYear();
            if (!valid) return send(ws, { type: 'error', reason: 'bad_date' });
            profileUser.birthdate = raw;
          }
        }
        if (typeof msg.firstName === 'string') {
          const spFirst = spamCheck(ws, msg.firstName);
          if (spFirst) return send(ws, { type: 'error', reason: spFirst.reason });
          profileUser.firstName = msg.firstName.replace(/[<>]/g, '').slice(0, 40).trim();
        }
        if (typeof msg.lastName === 'string') {
          const spLast = spamCheck(ws, msg.lastName);
          if (spLast) return send(ws, { type: 'error', reason: spLast.reason });
          profileUser.lastName = msg.lastName.replace(/[<>]/g, '').slice(0, 40).trim();
        }
        if (typeof msg.cover === 'string') {
          const rawCover = msg.cover.trim();
          if (rawCover === '') {
            profileUser.cover = '';
          } else if (COVERS.includes(rawCover)) {
            if (!achievementRewards(profileUser).covers.has(rawCover)) {
              return send(ws, { type: 'error', reason: 'locked' });
            }
            profileUser.cover = rawCover;
          } else if (/^data:image\/(png|jpeg|jpg|webp|gif|bmp);base64,/.test(rawCover)) {
            if (rawCover.length > 2800000) {
              return send(ws, { type: 'error', reason: 'too_big' });
            }
            profileUser.cover = rawCover;
          } else {
            profileUser.cover = '';
          }
        }
        if (typeof msg.frame === 'string') {
          if (!FRAMES.includes(msg.frame)) {
            profileUser.frame = 'none';
          } else if (!achievementRewards(profileUser).frames.has(msg.frame)) {
            return send(ws, { type: 'error', reason: 'locked' });
          } else {
            profileUser.frame = msg.frame;
          }
        }
        if (typeof msg.avatar === 'string') {
          if (msg.avatar === '') {
            profileUser.avatar = '';
          } else if (
            /^data:image\/(png|jpeg|jpg|webp);base64,/.test(msg.avatar) &&
            msg.avatar.length <= 400000
          ) {
            profileUser.avatar = msg.avatar;
          }
        }
        save();
        send(ws, {
          type: 'profile',
          profile: {
            bio: profileUser.bio || '',
            statusText: profileUser.statusText || '',
            statusKind: profileUser.statusKind || 'online',
            hideGame: !!profileUser.hideGame,
            avatar: profileUser.avatar || '',
            gender: profileUser.gender || '',
            city: profileUser.city || '',
            country: profileUser.country || '',
            birthdate: profileUser.birthdate || '',
            cover: profileUser.cover || '',
            frame: profileUser.frame || '',
            firstName: profileUser.firstName || '',
            lastName: profileUser.lastName || '',
          },
          progress: titleInfo(profileUser),
        });
        const profilePresence = {
          type: 'presence',
          user: ws.user,
          online: (profileUser.statusKind || 'online') !== 'invisible',
          game:
            profileUser.hideGame || profileUser.statusKind === 'invisible'
              ? null
              : profileUser.game || null,
          statusKind: profileUser.statusKind || 'online',
        };
        for (const friend of friendsOf(ws.user)) {
          const friendSocket = sockets.get(friend);
          if (friendSocket) send(friendSocket, profilePresence);
        }
        return;
      }

      case 'privacy_set': {
        if (!ws.user) return send(ws, { type: 'error', reason: 'auth' });
        const privacyUser = db.users[ws.user];
        privacyUser.privacy = normalizePrivacy({ ...(privacyUser.privacy || {}), ...(msg.privacy || {}) });
        save();
        audit(ws.user, 'privacy', ws.user, JSON.stringify(privacyUser.privacy));
        send(ws, { type: 'privacy', privacy: privacyUser.privacy });
        for (const friend of friendsOf(ws.user)) {
          const friendSocket = sockets.get(friend);
          if (friendSocket) {
            send(friendSocket, {
              type: 'friends',
              friends: friendsOf(friend).map((name) => publicUser(db.users[name], friend)),
            });
          }
        }
        return;
      }

      case 'room_create': {
        if (!ws.user) return;
        const name = String(msg.name || '').slice(0, 32).trim() || `Комната ${ws.user}`;
        const gameId = String(msg.game_id || '').slice(0, 64);
        const gameName = String(msg.game_name || '').slice(0, 64);
        const port = Number.isFinite(Number(msg.port)) ? Math.max(1, Math.min(65535, Number(msg.port))) : 27015;
        const slots = Number.isFinite(Number(msg.slots)) ? Math.max(2, Math.min(64, Number(msg.slots))) : 10;
        const host = msg.host ? String(msg.host).slice(0, 64) : null;
        const room = {
          id: crypto.randomBytes(8).toString('hex'),
          name,
          game_id: gameId,
          game_name: gameName,
          host,
          port,
          slots,
          nick: ws.user,
          ts: Date.now(),
          members: new Set([ws.user]),
        };
        rooms.set(room.id, room);
        ws.room = room.id;
        send(ws, { type: 'room_created', room: roomPublic(room) });
        broadcastRooms();
        return;
      }

      case 'room_list': {
        send(ws, { type: 'rooms', rooms: allRooms() });
        return;
      }

      case 'room_join': {
        if (!ws.user) return;
        const id = String(msg.id || '');
        const room = rooms.get(id);
        if (!room) return send(ws, { type: 'error', reason: 'no_room' });
        if (room.members.size >= room.slots) {
          return send(ws, { type: 'error', reason: 'room_full' });
        }
        if (ws.room && ws.room !== id) {
          const old = rooms.get(ws.room);
          if (old) old.members.delete(ws.user);
        }
        room.members.add(ws.user);
        ws.room = id;
        send(ws, { type: 'room_joined', room: roomPublic(room), members: [...room.members] });
        broadcastRooms();
        return;
      }

      case 'room_leave': {
        if (!ws.user) return;
        leaveRoom(ws);
        return;
      }

      case 'room_start': {
        if (!ws.user) return;
        const id = String(msg.id || '');
        const room = rooms.get(id);
        if (!room || !room.members.has(ws.user)) return;
        room.ts = Date.now();
        const payload = { type: 'room_started', room: roomPublic(room), by: ws.user };
        for (const member of room.members) {
          const sock = sockets.get(member);
          if (sock && sock.readyState === 1) send(sock, payload);
        }
        return;
      }

      case 'server_list': {
        // одобренные серверы видят все (без логина тоже можно вернуть сразу)
        promoCleanup();
ensurePinSlots();
ensureListSlots();
        send(ws, {
          type: 'servers',
          servers: rankedServers(ws.user),
          pinned: pinnedServers(ws.user),
          pinSlots: pinSlotState(ws.user),
          listBlocks: listBlockState(ws.user),
          listBlockSize: LIST_BLOCK_SIZE,
          hiddenMine: hiddenServersOf(ws.user),
          pendingMine: pendingServersOf(ws.user),
          stats: serverStats(db.public_servers),
        });
        return;
      }

      case 'server_vote': {
        if (!ws.user) return send(ws, { type: 'vote_result', ok: false, reason: 'auth' });
        const voteId = String(msg.id || '');
        const targetServer = db.public_servers.find((item) => item.id === voteId);
        if (!targetServer) return send(ws, { type: 'vote_result', ok: false, reason: 'no_server' });
        const voter = db.users[ws.user];
        const accountAge = Date.now() - (voter.createdAt || 0);
        if (accountAge < VOTE_MIN_ACCOUNT_AGE) {
          return send(ws, { type: 'vote_result', ok: false, reason: 'new_account' });
        }
        const lastVote = lastVoteOf(targetServer, ws.user);
        if (lastVote && Date.now() - (lastVote.ts || 0) < VOTE_COOLDOWN_MS) {
          return send(ws, {
            type: 'vote_result',
            ok: false,
            reason: 'wait',
            wait: Math.ceil((VOTE_COOLDOWN_MS - (Date.now() - (lastVote.ts || 0))) / 1000),
          });
        }
        const nick = String(msg.nick || '').replace(/\s+/g, ' ').trim().slice(0, 32);
        const voters = voterList(targetServer);
        voters.push({ name: ws.user, ts: Date.now(), nick });
        targetServer.voters = voters;
        grantCoins(voter, 'vote', { ip: ipOf(ws), by: ws.user, note: targetServer.name });
        save();
        send(ws, {
          type: 'vote_result',
          ok: true,
          id: targetServer.id,
          rating: votesRating(targetServer),
          coins: voter.coins ?? 0,
        });
        broadcastServers();
        return;
      }


      case 'coin_collect': {
        if (!ws.user) return send(ws, { type: 'error', reason: 'auth' });
        const ccUser = db.users[ws.user];
        const cc = grantCoins(ccUser, 'daily', { ip: ipOf(ws), by: ws.user, note: 'собрать' });
        if (cc.ok) ccUser.lastDaily = Math.floor(Date.now() / DAY_MS);
        save();
        send(ws, {
          type: 'coin_collected',
          ok: cc.ok,
          reason: cc.reason || '',
          coins: ccUser.coins ?? 0,
          amt: cc.ok ? cc.amt : 0,
          streak: ccUser.streak || 0,
          daily_ready: false,
        });
        return;
      }

      case 'gift_buy': {
        if (!ws.user) return send(ws, { type: 'error', reason: 'auth' });
        const bId = String(msg.id || '');
        const mode = msg.mode === 'to' ? 'to' : 'self';
        const bTo = resolveUserName(msg.to);
        const bBuyer = db.users[ws.user];
        const bDef = GIFTS.find((g) => g.id === bId);
        if (!bDef) return send(ws, { type: 'error', reason: 'no_gift' });
        const bPrice = bDef.price;
        if ((bBuyer.coins ?? 0) < bPrice) return send(ws, { type: 'error', reason: 'no_coins' });
        let bTarget = bBuyer;
        if (mode === 'to') {
          if (!bTo) return send(ws, { type: 'error', reason: 'no_user' });
          const rec = db.users[bTo];
          if (!rec) return send(ws, { type: 'error', reason: 'no_user' });
          if (bTo === ws.user) return send(ws, { type: 'error', reason: 'self' });
          if (rec.banned) return send(ws, { type: 'error', reason: 'banned' });
          bTarget = rec;
        }
        bBuyer.coins = (bBuyer.coins ?? 0) - bPrice;
        if (!Array.isArray(bTarget.giftsReceived)) bTarget.giftsReceived = [];
        bTarget.giftsReceived.push({ by: ws.user, id: bId, ts: Date.now() });
        if (bTarget.giftsReceived.length > 500) bTarget.giftsReceived.length = 500;
        if (mode === 'to' && !Array.isArray(bBuyer.giftsGiven)) bBuyer.giftsGiven = [];
        if (mode === 'to') bBuyer.giftsGiven.push({ to: bTo, id: bId, ts: Date.now() });
        if (mode === 'self') bBuyer.activeGift = bId;
        save();
        audit(ws.user, 'gift_buy', mode === 'self' ? 'self' : bTo, `${bId} за ${bPrice}`);
        send(ws, {
          type: 'gift_bought',
          ok: true,
          id: bId,
          mode,
          to: mode === 'to' ? bTo : undefined,
          price: bPrice,
          coins: bBuyer.coins ?? 0,
          activeGift: bBuyer.activeGift || '',
        });
        return;
      }

      case 'gift_send': {
        if (!ws.user) return send(ws, { type: 'error', reason: 'auth' });
        const gTarget = String(msg.to || '');
        const gId = String(msg.id || '');
        const gSender = db.users[ws.user];
        const gRec = db.users[gTarget];
        const gDef = GIFTS.find((g) => g.id === gId);
        if (!gDef) return send(ws, { type: 'error', reason: 'no_gift' });
        if (!gRec) return send(ws, { type: 'error', reason: 'no_user' });
        if (gTarget === ws.user) return send(ws, { type: 'error', reason: 'self' });
        if (gRec.banned) return send(ws, { type: 'error', reason: 'banned' });
        const price = giftPriceFor(gRec, ws.user, gId);
        if ((gSender.coins ?? 0) < price) return send(ws, { type: 'error', reason: 'no_coins' });
        gSender.coins = (gSender.coins ?? 0) - price;
        if (!Array.isArray(gSender.giftsGiven)) gSender.giftsGiven = [];
        gSender.giftsGiven.push({ to: gTarget, id: gId, ts: Date.now() });
        if (gSender.giftsGiven.length > 500) gSender.giftsGiven.length = 500;
        if (!Array.isArray(gRec.giftsReceived)) gRec.giftsReceived = [];
        gRec.giftsReceived.push({ by: ws.user, id: gId, ts: Date.now() });
        if (gRec.giftsReceived.length > 500) gRec.giftsReceived.length = 500;
        save();
        audit(ws.user, 'gift_send', gTarget, `${gId} за ${price}`);
        send(ws, {
          type: 'gift_sent',
          ok: true,
          id: gId,
          to: gTarget,
          price,
          coins: gSender.coins ?? 0,
          giftCount: gSender.giftsGiven.length,
        });
        return;
      }

      case 'gift_set_active': {
        if (!ws.user) return send(ws, { type: 'error', reason: 'auth' });
        const targetId = String(msg.id || '');
        const targetUser = db.users[ws.user];
        if (targetId !== '' && !GIFTS.find((g) => g.id === targetId)) {
          return send(ws, { type: 'error', reason: 'no_gift' });
        }
        targetUser.activeGift = targetId || '';
        save();
        send(ws, { type: 'gift_active', ok: true, activeGift: targetUser.activeGift || '' });
        return;
      }

      case 'gift_catalog': {
        const u = ws.user ? db.users[ws.user] : null;
        send(ws, {
          type: 'gift_catalog_data',
          catalog: giftCatalog(),
          collection: u ? userGiftCollection(u) : {},
          activeGift: u ? (u.activeGift || '') : '',
          coins: u ? (u.coins ?? 0) : 0,
        });
        return;
      }

      case 'server_recheck': {
        if (!ws.user) return send(ws, { type: 'error', reason: 'auth' });
        const recheckId = String(msg.id || '');
        const recheckSrv = db.public_servers.find((item) => item.id === recheckId);
        if (!recheckSrv) return send(ws, { type: 'error', reason: 'no_server' });
        if (recheckSrv.by !== ws.user && !isAdmin(ws.user)) {
          return send(ws, { type: 'error', reason: 'forbidden' });
        }
        recheckSrv.monitor = { fails: 0, nextCheckAt: Date.now() };
        const ckUser = db.users[ws.user];
        const ck = ckUser ? grantCoins(ckUser, 'check', { ip: ipOf(ws), by: ws.user, note: recheckSrv.name }) : null;
        if (ck && ck.ok) save();
        send(ws, { type: 'recheck_started', id: recheckId, coins: ck ? ckUser.coins ?? 0 : undefined });
        refreshServerEntry(recheckSrv)
          .then(() => {
            save();
            broadcastServers();
          })
          .catch(() => {});
        return;
      }

      case 'server_promo': {
        if (!ws.user || !isAdmin(ws.user)) {
          return send(ws, { type: 'error', reason: 'forbidden' });
        }
        const promoId = String(msg.id || '');
        const promoSrv = db.public_servers.find((item) => item.id === promoId);
        if (!promoSrv) return send(ws, { type: 'error', reason: 'no_server' });
        promoSrv.promo = {
          ...(promoSrv.promo || {}),
          pinned: !!msg.pinned,
          badge: String(msg.badge || '').slice(0, 24),
          highlight: String(msg.highlight || '').slice(0, 16),
        };
        save();
        audit(ws.user, 'server_promo', promoSrv.by, promoSrv.name);
        broadcastServers();
        return;
      }

case 'promo_buy': {
        if (!ws.user) return send(ws, { type: 'error', reason: 'auth' });
        const buyId = String(msg.id || '');
        const buySrv = db.public_servers.find((item) => item.id === buyId);
        if (!buySrv) return send(ws, { type: 'error', reason: 'no_server' });
        if (buySrv.by !== ws.user && !isAdmin(ws.user)) {
          return send(ws, { type: 'error', reason: 'forbidden' });
        }
        const days = PROMO_DAYS.includes(Number(msg.days)) ? Number(msg.days) : 30;
        const options = promoOptions(msg.options);
        const currency = msg.currency === 'coins' ? 'coins' : 'rub';
        if (!options.length) return send(ws, { type: 'error', reason: 'no_options' });
        let pinSlot = 0;
        if (options.includes('pinned')) {
          const already = activePromo(buySrv).pinned ? activePromo(buySrv).pinSlot || 0 : 0;
          const requested = Number(msg.pinSlot);
          const free = pinSlotState('').find((item) => !item.id) || null;
          pinSlot = PIN_SLOT_PRICES[requested - 1] ? requested : already || (free ? free.slot : 0);
          if (!pinSlot) return send(ws, { type: 'error', reason: 'slots_full' });
          if (pinSlotConflict(buyId, pinSlot)) return send(ws, { type: 'error', reason: 'slot_busy' });
          if (!already && pinnedActiveList().length >= PIN_SLOTS) {
            return send(ws, { type: 'error', reason: 'slots_full' });
          }
        }
        let listBlock = '';
        let listSlot = 0;
        if (options.includes('catalog')) {
          const prevPromo = activePromo(buySrv);
          const prevBlock = String(prevPromo.listBlock || '');
          const prevSlot = Number(prevPromo.listSlot) || 0;
          const wanted = LIST_BLOCKS.find((item) => item.id === String(msg.listBlock || ''));
          const state = listBlockState('');
          const firstFree = state
            .map((block) => {
              const slot = block.slots.find((item) => !item.id);
              return slot ? { block: block.id, slot: slot.slot } : null;
            })
            .find(Boolean);
          listBlock = wanted ? wanted.id : prevBlock || (firstFree ? firstFree.block : '');
          const requestedSlot = Number(msg.listSlot) || 0;
          const inRange = requestedSlot >= 1 && requestedSlot <= LIST_BLOCK_SIZE;
          listSlot = inRange ? requestedSlot : prevBlock === listBlock ? prevSlot : 0;
          if (!listSlot) {
            const block = state.find((item) => item.id === listBlock);
            const free = block && block.slots.find((item) => !item.id);
            listSlot = free ? free.slot : 0;
          }
          if (!listBlock || !listSlot) return send(ws, { type: 'error', reason: 'list_slots_full' });
          if (listSlotConflict(buyId, listBlock, listSlot)) {
            return send(ws, { type: 'error', reason: 'list_slot_busy' });
          }
        }
        const amount = currency === 'coins'
          ? promoPriceCoins(options, days, pinSlot, listBlock)
          : promoPrice(options, days, pinSlot, listBlock);
        const user = db.users[ws.user] || {};
        if (currency === 'coins' && (user.coins ?? 0) < amount) {
          return send(ws, { type: 'error', reason: 'no_coins' });
        }
        const order = {
          id: crypto.randomBytes(6).toString('hex'),
          user: ws.user,
          server: buyId,
          serverName: buySrv.name,
          options,
          days,
          pinSlot,
          listBlock,
          listSlot,
          amount,
          currency,
          status: 'pending',
          ts: Date.now(),
        };
        // Новый счёт заменяет прошлые неоплаченные по этому серверу.
        db.orders = db.orders.filter(
          (item) => !(item.user === ws.user && item.server === buyId && item.status === 'pending')
        );
        db.orders.unshift(order);
        save();
        send(ws, { type: 'promo_order', order, coins: user.coins ?? 0 });
        return;
      }

      case 'coins_buy': {
        if (!ws.user) return send(ws, { type: 'error', reason: 'auth' });
        const packId = String(msg.pack || '');
        const pack = COIN_PACKS[packId];
        if (!pack) return send(ws, { type: 'error', reason: 'no_pack' });
        const buyer = db.users[ws.user];
        if (!buyer) return send(ws, { type: 'error', reason: 'auth' });
        buyer.coins = (buyer.coins ?? 200) + pack.coins;
        buyer.coinHistory = Array.isArray(buyer.coinHistory) ? buyer.coinHistory : [];
        buyer.coinHistory.unshift({
          type: 'buy',
          pack: pack.label || packId,
          delta: pack.coins,
          price: pack.price,
          ts: Date.now(),
        });
        buyer.coinHistory = buyer.coinHistory.slice(0, 50);
        save();
        audit(ws.user, 'coins_buy', packId, `${pack.coins} монет за ${pack.price} ₽`);
        send(ws, {
          type: 'coins_bought',
          coins: buyer.coins,
          pack: packId,
          added: pack.coins,
          price: pack.price,
          history: buyer.coinHistory || [],
        });
        return;
      }

      case 'wallet_history': {
        if (!ws.user) return send(ws, { type: 'error', reason: 'auth' });
        const wUser = db.users[ws.user] || {};
        send(ws, {
          type: 'wallet_history',
          history: Array.isArray(wUser.coinHistory) ? wUser.coinHistory : [],
          coins: wUser.coins ?? 0,
        });
        return;
      }

      case 'order_pay': {
        if (!ws.user) return send(ws, { type: 'error', reason: 'auth' });
        const payOrder = db.orders.find((item) => item.id === String(msg.id || ''));
        if (!payOrder || (payOrder.user !== ws.user && !isAdmin(ws.user))) {
          return send(ws, { type: 'error', reason: 'no_order' });
        }
if (payOrder.status === 'paid') {
          return send(ws, { type: 'order_paid', order: payOrder });
        }
        if (Date.now() - (payOrder.ts || 0) > 7 * DAY_MS) {
          payOrder.status = 'expired';
          save();
          return send(ws, { type: 'error', reason: 'order_expired' });
        }
        const payOpts = promoOptions(payOrder.options);
        if (payOpts.includes('pinned')) {
          const slot = Number(payOrder.pinSlot) || 0;
          if (!slot) return send(ws, { type: 'error', reason: 'slots_full' });
          if (pinSlotConflict(payOrder.server, slot)) return send(ws, { type: 'error', reason: 'slot_busy' });
          const alreadyPinned = !!activePromo(db.public_servers.find((item) => item.id === payOrder.server) || {}).pinned;
          if (!alreadyPinned && pinnedActiveList().length >= PIN_SLOTS) {
            return send(ws, { type: 'error', reason: 'slots_full' });
          }
        }
        if (payOpts.includes('catalog')) {
          const block = String(payOrder.listBlock || '');
          const at = Number(payOrder.listSlot) || 0;
          if (!block || at < 1 || at > LIST_BLOCK_SIZE) {
            return send(ws, { type: 'error', reason: 'list_slots_full' });
          }
          if (listSlotConflict(payOrder.server, block, at)) {
            return send(ws, { type: 'error', reason: 'list_slot_busy' });
          }
        }
        if (payOrder.currency === 'coins') {
          const buyer = db.users[payOrder.user] || {};
          if ((buyer.coins ?? 0) < Number(payOrder.amount || 0)) {
            return send(ws, { type: 'error', reason: 'no_coins' });
          }
          buyer.coins = (buyer.coins ?? 0) - Number(payOrder.amount || 0);
        }
        payOrder.status = 'paid';
        payOrder.paidAt = Date.now();
        payOrder.payment = payOrder.currency === 'coins' ? 'coins' : 'test';
        const paySrv = db.public_servers.find((item) => item.id === payOrder.server);
        if (paySrv) {
          const prev = activePromo(paySrv);
          const opts = promoOptions(payOrder.options);
          const color = /^#[0-9a-fA-F]{6}$/.test(String(msg.color || ''))
            ? String(msg.color)
            : prev.color || '#e3a13b';
          // Продление идёт от конца текущего срока, а не от сегодняшнего дня.
          const base = Math.max(prev.until || 0, Date.now());
          paySrv.promo = {
            until: base + payOrder.days * DAY_MS,
            badge: opts.includes('badge') ? String(msg.badge || prev.badge || 'ПРОМО').slice(0, 16) : prev.badge || '',
            color: opts.includes('color') ? color : prev.color || '',
            highlight: opts.includes('color') ? color : prev.highlight || '',
            size: opts.includes('large') ? 'large' : prev.size || '',
            pinned: opts.includes('pinned') ? true : !!prev.pinned,
            pinSlot: opts.includes('pinned') ? Number(payOrder.pinSlot) || prev.pinSlot || 0 : prev.pinSlot || 0,
            listBlock: opts.includes('catalog') ? String(payOrder.listBlock || prev.listBlock || '') : prev.listBlock || '',
            listSlot: opts.includes('catalog') ? Number(payOrder.listSlot) || prev.listSlot || 0 : prev.listSlot || 0,
          };
        }
        save();
        audit(ws.user, 'order_paid', payOrder.server, String(payOrder.amount));
        broadcastServers();
        const updatedCoins = (db.users[payOrder.user] || {}).coins ?? 0;
        send(ws, { type: 'order_paid', order: payOrder, coins: updatedCoins });
        return;
      }

      case 'admin_grant_coins': {
        if (!ws.user || !isAdmin(ws.user)) return send(ws, { type: 'error', reason: 'forbidden' });
        const coinUser = resolveUserName(msg.user);
        const amount = Math.round(Number(msg.amount) || 0);
        const target = db.users[coinUser];
        if (!target) return send(ws, { type: 'error', reason: 'no_user' });
        if (!amount) return send(ws, { type: 'error', reason: 'bad_amount' });
        target.coins = Math.max(0, (target.coins ?? 0) + amount);
        target.coinHistory = Array.isArray(target.coinHistory) ? target.coinHistory : [];
        target.coinHistory.unshift({
          type: amount > 0 ? 'admin_grant' : 'admin_take',
          delta: amount,
          by: ws.user,
          ts: Date.now(),
        });
        target.coinHistory = target.coinHistory.slice(0, 50);
        save();
        audit(ws.user, 'admin_coins', coinUser, String(amount));
        console.log('admin coins', ws.user, coinUser, amount, '→', target.coins);
        send(ws, { type: 'admin_ok', action: 'coins', user: coinUser, coins: target.coins });
        return;
      }

      case 'admin_user_patch': {
        if (!ws.user || !isAdmin(ws.user)) return send(ws, { type: 'error', reason: 'forbidden' });
        const patchUser = resolveUserName(msg.user);
        const entry = db.users[patchUser];
        if (!entry) return send(ws, { type: 'error', reason: 'no_user' });
        const patch = msg.patch && typeof msg.patch === 'object' ? msg.patch : null;
        if (!patch) return send(ws, { type: 'error', reason: 'bad_patch' });
        const allowed = ['coins', 'banned', 'city', 'country', 'statusKind', 'reputation', 'displayName'];
        const applied = [];
        for (const key of allowed) {
          if (Object.prototype.hasOwnProperty.call(patch, key)) {
            entry[key] = patch[key];
            applied.push(key);
          }
        }
        if (!applied.length) return send(ws, { type: 'error', reason: 'nothing_allowed' });
        save();
        audit(ws.user, 'admin_user_patch', patchUser, applied.join(','));
        console.log('admin user patch', ws.user, patchUser, applied.join(','));
        send(ws, { type: 'admin_ok', action: 'user_patch', user: patchUser, applied });
        return;
      }

      case 'admin_server_patch': {
        if (!ws.user || !isAdmin(ws.user)) return send(ws, { type: 'error', reason: 'forbidden' });
        const patchId = String(msg.id || '');
        const entry = db.public_servers.find((item) => item.id === patchId);
        if (!entry) return send(ws, { type: 'error', reason: 'no_server' });
        const patch = msg.patch && typeof msg.patch === 'object' ? msg.patch : null;
        if (!patch) return send(ws, { type: 'error', reason: 'bad_patch' });
        const allowed = ['name', 'address', 'game', 'desc', 'hidden', 'manualMax', 'status'];
        const applied = [];
        for (const key of allowed) {
          if (!Object.prototype.hasOwnProperty.call(patch, key)) continue;
          if (key === 'name') entry.name = String(patch.name || '').slice(0, 60);
          else if (key === 'address') entry.address = String(patch.address || '').slice(0, 90);
          else if (key === 'game') entry.game = String(patch.game || '').slice(0, 40);
          else if (key === 'desc') entry.desc = String(patch.desc || '').slice(0, 200);
          else entry[key] = patch[key];
          applied.push(key);
        }
        if (!applied.length) return send(ws, { type: 'error', reason: 'nothing_allowed' });
        save();
        broadcastServers();
        audit(ws.user, 'admin_server_patch', patchId, applied.join(','));
        console.log('admin server patch', ws.user, patchId, applied.join(','));
        send(ws, { type: 'admin_ok', action: 'server_patch', id: patchId, applied });
        return;
      }

      case 'admin_promo_clear': {
        if (!ws.user || !isAdmin(ws.user)) return send(ws, { type: 'error', reason: 'forbidden' });
        let cleared = 0;
        for (const entry of db.public_servers) {
          if (entry.promo) {
            delete entry.promo;
            cleared += 1;
          }
        }
        save();
        broadcastServers();
        audit(ws.user, 'admin_promo_clear', '', String(cleared));
        console.log('admin promo clear', ws.user, cleared);
        send(ws, { type: 'admin_ok', action: 'promo_clear', cleared });
        return;
      }

      case 'admin_maintenance': {
        if (!ws.user || !isAdmin(ws.user)) return send(ws, { type: 'error', reason: 'forbidden' });
        const on = !!msg.on;
        const text = typeof msg.message === 'string' ? msg.message.slice(0, 300) : '';
        db.meta.maintenance = { on, message: text, since: on ? Date.now() : 0 };
        save();
        for (const [, sock] of sockets) {
          if (sock.readyState === 1) {
            send(sock, { type: 'maintenance', on, message: text });
          }
        }
        audit(ws.user, 'admin_maintenance', on ? 'on' : 'off', text);
        console.log('admin maintenance', ws.user, on, text);
        send(ws, { type: 'admin_ok', action: 'maintenance', on, message: text });
        return;
      }

      case 'publish_consent': {
        if (!ws.user || !isAdmin(ws.user)) return send(ws, { type: 'error', reason: 'forbidden' });
        const pass = String(msg.pass || '');
        if (!pass || !verifyPassword(pass, db.users[ws.user])) {
          return send(ws, { type: 'publish_consent_fail', reason: 'bad_pass' });
        }
        const token = crypto.randomBytes(24).toString('hex');
        publishConsents.set(token, { user: ws.user, exp: Date.now() + 10 * 60 * 1000 });
        for (const [key, value] of publishConsents) {
          if (value.exp < Date.now()) publishConsents.delete(key);
        }
        audit(ws.user, 'publish_consent', ws.user, 'ok');
        console.log('publish consent', ws.user);
        send(ws, { type: 'publish_consent_ok', token, user: ws.user, ttl: 600 });
        return;
      }

      case 'orders_my': {
        if (!ws.user) return send(ws, { type: 'error', reason: 'auth' });
        send(ws, {
          type: 'orders',
          orders: db.orders.filter((item) => item.user === ws.user).slice(0, 30),
        });
        return;
      }

      case 'server_refresh': {
        if (!ws.user) return send(ws, { type: 'error', reason: 'auth' });
  const now = Date.now();
  if (!Array.isArray(server.history)) server.history = [];
  server.history.push({
    ts: now,
    online: !!result.online,
    players: result.players || 0,
  });
  if (server.history.length > 288) server.history.splice(0, server.history.length - 288);
        if (ws.lastRefresh && now - ws.lastRefresh < 20000) {
          return send(ws, { type: 'error', reason: 'slow_down' });
        }
        ws.lastRefresh = now;
        refreshAll().catch(() => {});
        return;
      }

      case 'server_submit': {
        if (!ws.user) return send(ws, { type: 'error', reason: 'not_authed' });
        const name = String(msg.name || '').trim().slice(0, 60);
        const address = String(msg.address || '').trim().slice(0, 90);
        const game = String(msg.game || '').trim().slice(0, 40);
        const desc = String(msg.desc || '').trim().slice(0, 200);
        if (!name || !address) {
          return send(ws, { type: 'error', reason: 'need_name_address' });
        }
        // простая проверка формата адреса host:port
        if (!/^[^\s:]+:\d{1,5}$/.test(address) && !/^[^\s]+$/.test(address)) {
          return send(ws, { type: 'error', reason: 'bad_address' });
        }
        const entry = {
          id: crypto.randomBytes(8).toString('hex'),
          name,
          address,
          game,
          desc,
          by: ws.user,
          added: Date.now(),
          status: 'pending',
        };
        db.pending_servers.unshift(entry);
        save();
        send(ws, { type: 'server_submitted', server: entry });
        return;
      }

      case 'server_update': {
        if (!ws.user) return send(ws, { type: 'error', reason: 'not_authed' });
        const id = String(msg.id || '');
        const entry = db.public_servers.find((s) => s.id === id);
        if (!entry) return send(ws, { type: 'error', reason: 'no_server' });
        if (entry.by !== ws.user && !isAdmin(ws.user)) {
          return send(ws, { type: 'error', reason: 'forbidden' });
        }

        const name = String(msg.name ?? entry.name).trim().slice(0, 60);
        const address = String(msg.address ?? entry.address).trim().slice(0, 90);
        const game = String(msg.game ?? entry.game ?? '').trim().slice(0, 40);
        const desc = String(msg.desc ?? entry.desc ?? '').trim().slice(0, 200);

        if (!name || !address) {
          return send(ws, { type: 'error', reason: 'need_name_address' });
        }
        if (!/^[^\s:]+:\d{1,5}$/.test(address) && !/^[^\s]+$/.test(address)) {
          return send(ws, { type: 'error', reason: 'bad_address' });
        }

        // Меняем данные владельца. status, votes, monitor, by, id — авто.
        entry.name = name;
        entry.address = address;
        entry.game = game;
        entry.desc = desc;
        entry.edited = Date.now();

        // Слоты и дата добавления — метаданные владельца, их можно править.
        if (msg.maxPlayers !== undefined) {
          const slots = Number(msg.maxPlayers);
          if (Number.isFinite(slots) && slots > 0) {
            entry.manualMax = Math.max(2, Math.min(256, Math.round(slots)));
          } else {
            delete entry.manualMax;
          }
        }
        if (msg.added !== undefined) {
          const addedTs = Number(msg.added);
          if (Number.isFinite(addedTs) && addedTs > 0) {
            entry.added = addedTs;
          }
        }

        if (entry.monitor) entry.monitor.nextCheckAt = Date.now();

        save();
        broadcastServers();
        send(ws, { type: 'server_updated', id });
        return;
      }

      case 'server_pending': {
        if (!ws.user || !isAdmin(ws.user)) {
          return send(ws, { type: 'error', reason: 'forbidden' });
        }
        send(ws, { type: 'pending_servers', servers: db.pending_servers });
        return;
      }

      case 'server_moderate': {
        if (!ws.user || !isAdmin(ws.user)) {
          return send(ws, { type: 'error', reason: 'forbidden' });
        }
        const id = String(msg.id || '');
        const action = String(msg.action || ''); // 'approve' | 'reject'
        const idx = db.pending_servers.findIndex((s) => s.id === id);
        if (idx < 0) return send(ws, { type: 'error', reason: 'no_pending' });
        const [entry] = db.pending_servers.splice(idx, 1);
        if (action === 'approve') {
          entry.status = 'approved';
          const added = { ...entry, approved_by: ws.user };
          db.public_servers.unshift(added);
          const owner = db.users[entry.by];
          if (owner) {
            const mineCount = db.public_servers.filter((s) => s.by === entry.by).length;
            const fs = mineCount === 1
              ? grantCoins(owner, 'firstSrv', { ip: '', by: entry.by, note: entry.name })
              : { ok: false };
            if (fs.ok) save();
          }
          setTimeout(() => {
            refreshServerEntry(added).then(() => {
              save();
              broadcastServers();
            }).catch(() => {});
          }, 150);
        }

        save();
        audit(
          ws.user,
          action === 'approve' ? 'server_approve' : 'server_reject',
          entry.by,
          entry.name,
        );
        // вернуть всем обновлённый список
        broadcastServers();
        send(ws, { type: 'moderated', server: entry });
        return;
      }

      case 'server_icon_set': {
        if (!ws.user) return;
        const iconId = String(msg.id || '');
        const iconEntry = db.public_servers.find((s) => s.id === iconId);
        if (!iconEntry) return send(ws, { type: 'error', reason: 'not_found' });
        if (iconEntry.by !== ws.user && !isAdmin(ws.user)) {
          return send(ws, { type: 'error', reason: 'forbidden' });
        }
        const match = /^data:image\/(jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(
          String(msg.dataUrl || '')
        );
        if (!match) return send(ws, { type: 'error', reason: 'bad_image' });
        const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
        const buf = Buffer.from(match[2], 'base64');
        if (!buf.length) return send(ws, { type: 'error', reason: 'bad_image' });
        if (buf.length > 600 * 1024) return send(ws, { type: 'error', reason: 'too_big' });
        try {
          for (const old of Object.keys(BANNER_MIME)) {
            const stale = path.join(BANNER_DIR, 'icon-' + iconId + '.' + old);
            if (old !== ext && fs.existsSync(stale)) fs.unlinkSync(stale);
          }
          fs.writeFileSync(path.join(BANNER_DIR, 'icon-' + iconId + '.' + ext), buf);
        } catch (e) {
          return send(ws, { type: 'error', reason: 'save_failed' });
        }
        iconEntry.icon = { v: Date.now(), ext };
        save();
        audit(ws.user, 'server_icon', iconEntry.name);
        send(ws, {
          type: 'server_icon_saved',
          id: iconId,
          icon: `/icon/${iconId}?v=${iconEntry.icon.v}`,
        });
        broadcastServers();
        return;
      }

      case 'server_icon_clear': {
        if (!ws.user) return;
        const cid = String(msg.id || '');
        const cEntry = db.public_servers.find((s) => s.id === cid);
        if (!cEntry) return send(ws, { type: 'error', reason: 'not_found' });
        if (cEntry.by !== ws.user && !isAdmin(ws.user)) {
          return send(ws, { type: 'error', reason: 'forbidden' });
        }
        for (const old of Object.keys(BANNER_MIME)) {
          const stale = path.join(BANNER_DIR, 'icon-' + cid + '.' + old);
          try {
            if (fs.existsSync(stale)) fs.unlinkSync(stale);
          } catch {}
        }
        delete cEntry.icon;
        save();
        audit(ws.user, 'server_icon_clear', cEntry.name);
        send(ws, { type: 'server_icon_saved', id: cid, icon: '' });
        broadcastServers();
        return;
      }

      case 'server_banner_set': {
        if (!ws.user) return;
        const bannerId = String(msg.id || '');
        const bannerEntry = db.public_servers.find((s) => s.id === bannerId);
        if (!bannerEntry) return send(ws, { type: 'error', reason: 'not_found' });
        if (bannerEntry.by !== ws.user && !isAdmin(ws.user)) {
          return send(ws, { type: 'error', reason: 'forbidden' });
        }
        const match = /^data:image\/(jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(
          String(msg.dataUrl || '')
        );
        if (!match) return send(ws, { type: 'error', reason: 'bad_image' });
        const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
        const buf = Buffer.from(match[2], 'base64');
        if (!buf.length) return send(ws, { type: 'error', reason: 'bad_image' });
        if (buf.length > 900 * 1024) return send(ws, { type: 'error', reason: 'too_big' });
        try {
          for (const old of Object.keys(BANNER_MIME)) {
            const stale = path.join(BANNER_DIR, bannerId + '.' + old);
            if (old !== ext && fs.existsSync(stale)) fs.unlinkSync(stale);
          }
          fs.writeFileSync(path.join(BANNER_DIR, bannerId + '.' + ext), buf);
        } catch (e) {
          return send(ws, { type: 'error', reason: 'save_failed' });
        }
        const sizeRaw = String(msg.size || '');
        const size = BANNER_SIZES.includes(sizeRaw) ? sizeRaw : (bannerEntry.banner && bannerEntry.banner.size) || BANNER_SIZE_DEFAULT;
        const styleRaw = String(msg.style || '');
        const style = BANNER_STYLES.includes(styleRaw)
          ? styleRaw
          : (bannerEntry.banner && bannerEntry.banner.style) || BANNER_STYLE_DEFAULT;
        bannerEntry.banner = { v: Date.now(), ext, size, style };
        save();
        audit(ws.user, 'server_banner', bannerEntry.name);
        send(ws, {
          type: 'server_banner_saved',
          id: bannerId,
          banner: `/banner/${bannerId}?v=${bannerEntry.banner.v}`,
          bannerSize: bannerEntry.banner.size,
          bannerStyle: bannerEntry.banner.style,
        });
        broadcastServers();
        return;
      }

      case 'server_banner_style': {
        if (!ws.user) return send(ws, { type: 'error', reason: 'auth' });
        const styleId = String(msg.id || '');
        const styleEntry = db.public_servers.find((s) => s.id === styleId);
        if (!styleEntry) return send(ws, { type: 'error', reason: 'not_found' });
        if (styleEntry.by !== ws.user && !isAdmin(ws.user)) {
          return send(ws, { type: 'error', reason: 'forbidden' });
        }
        if (!styleEntry.banner || !styleEntry.banner.ext) {
          return send(ws, { type: 'error', reason: 'no_banner' });
        }
        const nextStyle = String(msg.style || '');
        if (!BANNER_STYLES.includes(nextStyle)) return send(ws, { type: 'error', reason: 'bad_style' });
        styleEntry.banner.style = nextStyle;
        save();
        audit(ws.user, 'server_banner_style', styleEntry.name);
        send(ws, {
          type: 'server_banner_saved',
          id: styleId,
          banner: `/banner/${styleId}?v=${styleEntry.banner.v}`,
          bannerSize: styleEntry.banner.size,
          bannerStyle: nextStyle,
        });
        broadcastServers();
        return;
      }

      case 'server_banner_clear': {
        if (!ws.user) return;
        const clearId = String(msg.id || '');
        const clearEntry = db.public_servers.find((s) => s.id === clearId);
        if (!clearEntry) return send(ws, { type: 'error', reason: 'not_found' });
        if (clearEntry.by !== ws.user && !isAdmin(ws.user)) {
          return send(ws, { type: 'error', reason: 'forbidden' });
        }
        for (const old of Object.keys(BANNER_MIME)) {
          const stale = path.join(BANNER_DIR, clearId + '.' + old);
          try {
            if (fs.existsSync(stale)) fs.unlinkSync(stale);
          } catch {}
        }
        delete clearEntry.banner;
        save();
        audit(ws.user, 'server_banner_clear', clearEntry.name);
        send(ws, { type: 'server_banner_saved', id: clearId, banner: '' });
        broadcastServers();
        return;
      }

      case 'server_remove': {
        if (!ws.user) return send(ws, { type: 'error', reason: 'auth' });
        const id = String(msg.id || '');
        const gone = db.public_servers.find((s) => s.id === id);
        if (!gone) return send(ws, { type: 'error', reason: 'no_server' });
        if (gone.by !== ws.user && !isAdmin(ws.user)) {
          return send(ws, { type: 'error', reason: 'forbidden' });
        }
        db.public_servers = db.public_servers.filter((s) => s.id !== id);
        save();
        audit(ws.user, 'server_remove', gone.by, gone.name);
        broadcastServers();
        return;
      }

      case 'offer_list': {
        if (!ws.user) return;
        send(ws, { type: 'offers', offers: offersOf(ws.user) });
        return;
      }

      case 'offer_send': {
        if (!ws.user) return;
        const to = resolveUserName(msg.to);
        const name = String(msg.name || '').trim().slice(0, 60);
        const address = String(msg.address || '').trim().slice(0, 90);
        const game = String(msg.game || '').trim().slice(0, 40);
        const note = String(msg.note || '').trim().slice(0, 120);
        if (!db.users[to]) return send(ws, { type: 'error', reason: 'no_user' });
        if (to === ws.user) return send(ws, { type: 'error', reason: 'self' });
        if (!friendsOf(ws.user).includes(to)) {
          return send(ws, { type: 'error', reason: 'not_friend' });
        }
        if (!name || !address) {
          return send(ws, { type: 'error', reason: 'need_name_address' });
        }
        if (!validAddress(address)) {
          return send(ws, { type: 'error', reason: 'bad_address' });
        }
        const target = db.users[to];
        const entry = {
          id: crypto.randomBytes(8).toString('hex'),
          name,
          address,
          game,
          note,
          from: ws.user,
          ts: Date.now(),
        };
        if (!Array.isArray(target.offers)) target.offers = [];
        target.offers.unshift(entry);
        if (target.offers.length > 100) target.offers.length = 100;
        save();
        const targetSocket = sockets.get(to);
        if (targetSocket) send(targetSocket, { type: 'offers', offers: offersOf(to) });
        send(ws, { type: 'offer_sent', offer: entry });
        return;
      }

      case 'offer_dismiss': {
        if (!ws.user) return;
        const id = String(msg.id || '');
        const user = db.users[ws.user];
        if (Array.isArray(user.offers)) {
          user.offers = user.offers.filter((offer) => offer.id !== id);
          save();
        }
        send(ws, { type: 'offers', offers: offersOf(ws.user) });
        return;
      }

      case 'admin_orders': {
        if (!ws.user || !isAdmin(ws.user)) {
          return send(ws, { type: 'error', reason: 'forbidden' });
        }
        const paidOrders = db.orders.filter((item) => item.status === 'paid');
        const sumRub = paidOrders
          .filter((item) => (item.currency || 'rub') !== 'coins')
          .reduce((total, item) => total + (Number(item.amount) || 0), 0);
        const sumCoins = paidOrders
          .filter((item) => item.currency === 'coins')
          .reduce((total, item) => total + (Number(item.amount) || 0), 0);
        send(ws, {
          type: 'admin_orders',
          orders: db.orders.slice(0, 120),
          totals: {
            paidCount: paidOrders.length,
            paidSum: Math.round(sumRub * 100) / 100,
            paidCoins: Math.round(sumCoins),
            pending: db.orders.filter((item) => item.status === 'pending').length,
            expired: db.orders.filter((item) => item.status === 'expired').length,
          },
        });
        return;
      }

      case 'admin_stats': {
        if (!ws.user || !isAdmin(ws.user)) {
          return send(ws, { type: 'error', reason: 'forbidden' });
        }
        roomExpire();
        const allUsers = Object.values(db.users);
        send(ws, {
          type: 'admin_stats',
          stats: {
            users: allUsers.length,
            online: allUsers.filter((user) => user.online).length,
            banned: allUsers.filter((user) => user.banned).length,
            approved: db.public_servers.length,
            pending: db.pending_servers.length,
            rooms: rooms.size,
            admins: db.admins.length,
          },
        });
        return;
      }

      case 'admin_users': {
        if (!ws.user || !isAdmin(ws.user)) {
          return send(ws, { type: 'error', reason: 'forbidden' });
        }
        const list = Object.values(db.users)
          .map((user) => ({
            name: user.name,
            email: user.email || '',
            online: !!user.online,
            game: user.game || null,
            banned: !!user.banned,
            admin: isAdmin(user.name),
            reputation: user.reputation ?? 50,
            friends: Array.isArray(user.friends) ? user.friends.length : 0,
          }))
          .sort((a, b) => (b.online ? 1 : 0) - (a.online ? 1 : 0) || a.name.localeCompare(b.name));
        send(ws, { type: 'admin_users', users: list });
        return;
      }

      case 'admin_ban': {
        if (!ws.user || !isAdmin(ws.user)) {
          return send(ws, { type: 'error', reason: 'forbidden' });
        }
        const target = resolveUserName(msg.user);
        if (!db.users[target]) return send(ws, { type: 'error', reason: 'no_user' });
        if (target === ws.user) return send(ws, { type: 'error', reason: 'self' });
        if (isAdmin(target)) return send(ws, { type: 'error', reason: 'target_admin' });
        const banned = !!msg.banned;
        db.users[target].banned = banned;
        save();
        const sock = sockets.get(target);
        if (banned && sock) {
          send(sock, { type: 'banned' });
          setTimeout(() => {
            try {
              sock.close();
            } catch {}
          }, 150);
        }
        audit(ws.user, banned ? 'ban' : 'unban', target);
        send(ws, { type: 'admin_ok', action: 'ban', user: target, banned });
        return;
      }

      case 'admin_kick': {
        if (!ws.user || !isAdmin(ws.user)) {
          return send(ws, { type: 'error', reason: 'forbidden' });
        }
        const target = resolveUserName(msg.user);
        if (!db.users[target]) return send(ws, { type: 'error', reason: 'no_user' });
        if (target === ws.user) return send(ws, { type: 'error', reason: 'self' });
        const sock = sockets.get(target);
        if (sock) {
          send(sock, { type: 'kicked' });
          setTimeout(() => {
            try {
              sock.close();
            } catch {}
          }, 150);
        }
        audit(ws.user, 'kick', target);
        send(ws, { type: 'admin_ok', action: 'kick', user: target });
        return;
      }

      case 'admin_delete': {
        if (!ws.user || !isAdmin(ws.user)) {
          return send(ws, { type: 'error', reason: 'forbidden' });
        }
        const target = resolveUserName(msg.user);
        if (!db.users[target]) return send(ws, { type: 'error', reason: 'no_user' });
        if (target === ws.user) return send(ws, { type: 'error', reason: 'self' });
        if (isAdmin(target)) return send(ws, { type: 'error', reason: 'target_admin' });
        delete db.users[target];
        for (const user of Object.values(db.users)) {
          if (Array.isArray(user.friends)) {
            user.friends = user.friends.filter((friend) => friend !== target);
          }
        }
        db.public_servers = db.public_servers.filter((entry) => entry.by !== target);
        const sock = sockets.get(target);
        sockets.delete(target);
        if (sock) {
          send(sock, { type: 'kicked' });
          setTimeout(() => {
            try {
              sock.close();
            } catch {}
          }, 150);
        }
        save();
        for (const other of sockets.values()) {
          if (other.readyState === 1) {
            send(other, {
              type: 'servers',
              servers: rankedServers(),
              stats: serverStats(db.public_servers),
            });
          }
        }
        audit(ws.user, 'delete_user', target);
        send(ws, { type: 'admin_ok', action: 'delete', user: target });
        return;
      }

      case 'admin_set_admin': {
        if (!ws.user || !isAdmin(ws.user)) {
          return send(ws, { type: 'error', reason: 'forbidden' });
        }
        if (ENV_ADMINS.length) return send(ws, { type: 'error', reason: 'env_admins' });
        const target = resolveUserName(msg.user);
        if (!db.users[target]) return send(ws, { type: 'error', reason: 'no_user' });
        const promote = !!msg.admin;
        if (promote && !db.admins.includes(target)) db.admins.push(target);
        if (!promote) db.admins = db.admins.filter((name) => name !== target);
        save();
        audit(ws.user, promote ? 'grant_admin' : 'revoke_admin', target);
        send(ws, { type: 'admin_ok', action: 'set_admin', user: target, admin: promote });
        return;
      }

      case 'auth_2fa': {
        const pending = ws.pendingAuth;
        if (!pending) return send(ws, { type: 'auth_fail', reason: 'token' });
        if (Date.now() - pending.ts > 5 * 60 * 1000) {
          ws.pendingAuth = null;
          return send(ws, { type: 'auth_fail', reason: 'token' });
        }
        const pendingUser = db.users[pending.name];
        if (!pendingUser || !pendingUser.totp || !verifyTotp(pendingUser.totp, msg.code)) {
          pending.tries = (pending.tries || 0) + 1;
          if (pending.tries >= 5) {
            ws.pendingAuth = null;
            return send(ws, { type: 'auth_fail', reason: 'token' });
          }
          return send(ws, { type: 'auth_fail', reason: 'bad_2fa' });
        }
        ws.pendingAuth = null;
        return authOk(ws, pending.name, { twofa: true });
      }

case 'admin_2fa_setup': {
        if (!ws.user) return send(ws, { type: 'error', reason: 'forbidden' });
        const user = db.users[ws.user];
        const secret = base32Encode(crypto.randomBytes(20));
        user.totpPending = secret;
        save();
        const label = encodeURIComponent('GameLauncher:' + ws.user);
        send(ws, {
          type: 'admin_2fa_setup',
          secret,
          otpauth:
            'otpauth://totp/' + label + '?secret=' + secret + '&issuer=GameLauncher&digits=6&period=30',
        });
        return;
      }

case 'admin_2fa_enable': {
        if (!ws.user) return send(ws, { type: 'error', reason: 'forbidden' });
        const user = db.users[ws.user];
        const secret = user.totpPending || user.totp;
        if (!secret) return send(ws, { type: 'error', reason: 'no_secret' });
        if (!verifyTotp(secret, msg.code)) {
          return send(ws, { type: 'error', reason: 'bad_2fa' });
        }
        user.totp = secret;
        delete user.totpPending;
        save();
        audit(ws.user, '2fa_enable', ws.user);
        send(ws, { type: 'admin_ok', action: '2fa_enable' });
        return;
      }

case 'admin_2fa_disable': {
        if (!ws.user) return send(ws, { type: 'error', reason: 'forbidden' });
        const user = db.users[ws.user];
        if (!user.totp) return send(ws, { type: 'error', reason: 'no_2fa' });
        if (!verifyTotp(user.totp, msg.code)) {
          return send(ws, { type: 'error', reason: 'bad_2fa' });
        }
        const hold2fa = criticalHold(user, 'criticalHoldUntil');
        if (hold2fa) return send(ws, { type: 'error', reason: 'hold', wait: hold2fa.wait });
        delete user.totp;
        delete user.totpPending;
        markCritical(user, 'criticalHoldUntil');
        save();
        audit(ws.user, '2fa_disable', ws.user);
        send(ws, { type: 'admin_ok', action: '2fa_disable' });
        return;
      }

      case 'admin_audit': {
        if (!ws.user || !isAdmin(ws.user)) {
          return send(ws, { type: 'error', reason: 'forbidden' });
        }
        send(ws, { type: 'admin_audit', entries: db.audit.slice(0, 100) });
        return;
      }

      case 'support_send': {
        if (!ws.user) return send(ws, { type: 'error', reason: 'forbidden' });
        const kind = ['problem', 'wish', 'other'].includes(String(msg.kind))
          ? String(msg.kind)
          : 'other';
const text = String(msg.text || '').trim().slice(0, 2000);
        if (!text) return send(ws, { type: 'error', reason: 'empty' });
        const spTicket = spamCheck(ws, text);
        if (spTicket) return send(ws, { type: 'error', reason: spTicket.reason });
        const ticket = {
          id: crypto.randomBytes(8).toString('hex'),
          from: ws.user,
          kind,
          text,
          ts: Date.now(),
          status: 'open',
          replies: [],
        };
        db.tickets.unshift(ticket);
        if (db.tickets.length > 500) db.tickets.length = 500;
        save();
        send(ws, { type: 'support_sent', ticket });
        for (const [adminName, adminSocket] of sockets) {
          if (isAdmin(adminName) && adminSocket && adminSocket.readyState === 1) {
            send(adminSocket, { type: 'support_new', ticket });
          }
        }
        return;
      }

      case 'support_my': {
        if (!ws.user) return send(ws, { type: 'error', reason: 'forbidden' });
        send(ws, {
          type: 'support_my',
          tickets: db.tickets.filter((ticket) => ticket.from === ws.user),
        });
        return;
      }

      case 'support_all': {
        if (!ws.user || !isAdmin(ws.user)) {
          return send(ws, { type: 'error', reason: 'forbidden' });
        }
        send(ws, { type: 'support_all', tickets: db.tickets });
        return;
      }

      case 'support_reply': {
        if (!ws.user || !isAdmin(ws.user)) {
          return send(ws, { type: 'error', reason: 'forbidden' });
        }
        const id = String(msg.id || '');
        const text = String(msg.text || '').trim().slice(0, 2000);
        if (!text) return send(ws, { type: 'error', reason: 'empty' });
        const ticket = db.tickets.find((entry) => entry.id === id);
        if (!ticket) return send(ws, { type: 'error', reason: 'no_ticket' });
        ticket.replies.push({ by: ws.user, text, ts: Date.now() });
        ticket.status = 'open';
        save();
        audit(ws.user, 'support_reply', ticket.from, id);
        send(ws, { type: 'support_update', ticket });
        const authorSocket = sockets.get(ticket.from);
        if (authorSocket) send(authorSocket, { type: 'support_update', ticket });
        return;
      }

      case 'support_close': {
        if (!ws.user || !isAdmin(ws.user)) {
          return send(ws, { type: 'error', reason: 'forbidden' });
        }
        const id = String(msg.id || '');
        const ticket = db.tickets.find((entry) => entry.id === id);
        if (!ticket) return send(ws, { type: 'error', reason: 'no_ticket' });
        ticket.status = 'closed';
        save();
        audit(ws.user, 'support_close', ticket.from, id);
        send(ws, { type: 'support_update', ticket });
        const authorSocket = sockets.get(ticket.from);
        if (authorSocket) send(authorSocket, { type: 'support_update', ticket });
        return;
      }

      case 'complaint_send': {
        if (!ws.user) return send(ws, { type: 'error', reason: 'forbidden' });
        const target = resolveUserName(msg.target);
        const reason = String(msg.reason || '').trim().slice(0, 500);
        if (!db.users[target]) return send(ws, { type: 'error', reason: 'no_user' });
if (target === ws.user) return send(ws, { type: 'error', reason: 'self' });
        if (reason.length < 5) return send(ws, { type: 'error', reason: 'short' });
        const spComplaint = spamCheck(ws, reason);
        if (spComplaint) return send(ws, { type: 'error', reason: spComplaint.reason });
        const complaint = {
          id: crypto.randomBytes(8).toString('hex'),
          from: ws.user,
          target,
          reason,
          ts: Date.now(),
          status: 'open',
        };
        db.complaints.unshift(complaint);
        if (db.complaints.length > 300) db.complaints.length = 300;
        save();
        send(ws, { type: 'complaint_sent', complaint });
        for (const [adminName, adminSocket] of sockets) {
          if (isAdmin(adminName) && adminSocket.readyState === 1) {
            send(adminSocket, { type: 'complaint_new', complaint });
          }
        }
        return;
      }

      case 'complaint_list': {
        if (!ws.user || !isAdmin(ws.user)) {
          return send(ws, { type: 'error', reason: 'forbidden' });
        }
        send(ws, { type: 'complaints', complaints: db.complaints });
        return;
      }

      case 'complaint_resolve': {
        if (!ws.user || !isAdmin(ws.user)) {
          return send(ws, { type: 'error', reason: 'forbidden' });
        }
        const id = String(msg.id || '');
        const action = String(msg.action || '');
        const complaint = db.complaints.find((entry) => entry.id === id);
        if (!complaint) return send(ws, { type: 'error', reason: 'no_complaint' });
        if (complaint.status === 'open') {
          if (action === 'ban') {
            if (isAdmin(complaint.target)) {
              return send(ws, { type: 'error', reason: 'target_admin' });
            }
            const targetUser = db.users[complaint.target];
            if (targetUser) {
              targetUser.banned = true;
              targetUser.reputation = Math.max(0, (targetUser.reputation ?? 50) - 15);
              const sock = sockets.get(complaint.target);
              if (sock) {
                send(sock, { type: 'banned' });
                setTimeout(() => {
                  try {
                    sock.close();
                  } catch {}
                }, 150);
              }
            }
            complaint.status = 'resolved';
          } else {
            complaint.status = 'rejected';
          }
          complaint.resolved_by = ws.user;
          complaint.resolved_ts = Date.now();
          save();
          audit(ws.user, 'complaint_' + action, complaint.target, id);
        }
        send(ws, { type: 'complaints', complaints: db.complaints });
        return;
      }

      case 'rep_adjust': {
        if (!ws.user || !isAdmin(ws.user)) {
          return send(ws, { type: 'error', reason: 'forbidden' });
        }
        const repTarget = resolveUserName(msg.user);
        const delta = Math.max(-20, Math.min(20, Number(msg.delta) || 0));
        const repUser = db.users[repTarget];
        if (!repUser) return send(ws, { type: 'error', reason: 'no_user' });
        if (!delta) return send(ws, { type: 'error', reason: 'bad_delta' });
        repUser.reputation = Math.max(0, Math.min(100, (repUser.reputation ?? 50) + delta));
        save();
        audit(ws.user, 'reputation', repTarget, String(delta));
        send(ws, { type: 'admin_ok', action: 'reputation', user: repTarget });
        return;
      }

      // --- документы, безопасность аккаунта ---
      case 'consent_accept': {
        if (!ws.user) return send(ws, { type: 'error', reason: 'auth' });
        const consentUser = db.users[ws.user];
        consentUser.consent = { version: CONSENT_VERSION, ts: Date.now(), ip: ipOf(ws) };
        save();
        audit(ws.user, 'consent', ws.user, CONSENT_VERSION);
        send(ws, { type: 'consent_saved', version: CONSENT_VERSION });
        return;
      }

case 'password_change': {
        if (!ws.user) return send(ws, { type: 'error', reason: 'auth' });
        const passUser = db.users[ws.user];
        const oldPass = String(msg.old || '');
        const newPass = String(msg.new || '');
        if (!verifyPassword(oldPass, passUser)) {
          return send(ws, { type: 'password_result', ok: false, reason: 'bad_old' });
        }
        const holdPw = criticalHold(passUser, 'criticalHoldUntil');
        if (holdPw) {
          return send(ws, { type: 'password_result', ok: false, reason: 'hold', wait: holdPw.wait });
        }
if (newPass.length < PASS_MIN || newPass.length > PASS_MAX) {
          return send(ws, { type: 'password_result', ok: false, reason: 'bad_pass' });
        }
        if (!passwordStrong(newPass)) {
          return send(ws, { type: 'password_result', ok: false, reason: 'weak_pass' });
        }
        if (isAdmin(passUser.name) && newPass.length < 10) {
          return send(ws, { type: 'password_result', ok: false, reason: 'weak_admin_pass' });
        }
        const salt = crypto.randomBytes(16).toString('hex');
        passUser.salt = salt;
        passUser.hash = hashPassword(newPass, salt);
passUser.passLen = newPass.length;
        passUser.sessions = (passUser.sessions || []).filter((item) => item.token === ws.token);
        markCritical(passUser, 'criticalHoldUntil');
        save();
        audit(ws.user, 'password_change', ws.user);
        send(ws, { type: 'password_result', ok: true });
        return;
      }

      case 'sessions_list': {
        if (!ws.user) return send(ws, { type: 'error', reason: 'auth' });
        const sessionUser = db.users[ws.user];
        send(ws, {
          type: 'sessions',
sessions: (sessionUser.sessions || []).map((item) => ({
            id: item.id,
            ip: item.ip,
            ua: item.ua,
            created: item.created,
            lastSeen: item.lastSeen,
            current: item.token === ws.token,
            newDevice: !!item.newDevice,
          })),
        });
        return;
      }

      case 'sessions_revoke_all': {
        if (!ws.user) return send(ws, { type: 'error', reason: 'auth' });
        const allUser = db.users[ws.user];
        allUser.sessions = (allUser.sessions || []).filter((item) => item.token === ws.token);
        const revoked = allUser.sessions.filter((item) => item.token === ws.token).length > 0;
        allUser.token = ws.token;
        save();
        audit(ws.user, 'sessions_revoke_all', ws.user);
        send(ws, { type: 'sessions_all_revoked' });
        return;
      }

      case 'session_revoke': {
        if (!ws.user) return send(ws, { type: 'error', reason: 'auth' });
        const sessionUser = db.users[ws.user];
        const sessionId = String(msg.id || '');
        const victim = (sessionUser.sessions || []).find((item) => item.id === sessionId);
        if (!victim) return send(ws, { type: 'error', reason: 'no_session' });
        sessionUser.sessions = sessionUser.sessions.filter((item) => item.id !== sessionId);
        if (sessionUser.token === victim.token) sessionUser.token = '';
        save();
        audit(ws.user, 'session_revoke', ws.user, sessionId);
        send(ws, { type: 'session_revoked', id: sessionId });
        if (victim.token === ws.token) {
          ws.user = null;
          send(ws, { type: 'logged_out' });
        }
        return;
      }

      case 'account_export': {
        if (!ws.user) return send(ws, { type: 'error', reason: 'auth' });
        const exportUser = db.users[ws.user];
        const data = {
          name: exportUser.name,
          email: exportUser.email || null,
          createdAt: exportUser.createdAt || null,
          consent: exportUser.consent || null,
          consentVersion: CONSENT_VERSION,
          reputation: exportUser.reputation ?? 50,
          logins: exportUser.logins || 0,
          onlineMs: exportUser.onlineMs || 0,
          gamesSeen: exportUser.gamesSeen || [],
          friends: friendsOf(ws.user),
          profile: {
            bio: exportUser.bio || '',
            statusText: exportUser.statusText || '',
            statusKind: exportUser.statusKind || 'online',
            hideGame: !!exportUser.hideGame,
            hasAvatar: !!exportUser.avatar,
          },
          sessions: (exportUser.sessions || []).map((item) => ({
            ip: item.ip,
            ua: item.ua,
            created: item.created,
            lastSeen: item.lastSeen,
          })),
        };
        audit(ws.user, 'account_export', ws.user);
        send(ws, { type: 'account_export', data, ts: Date.now() });
        return;
      }

      case 'account_delete': {
        if (!ws.user) return send(ws, { type: 'error', reason: 'auth' });
        const delName = ws.user;
        const delUser = db.users[delName];
        if (!verifyPassword(String(msg.pass || ''), delUser)) {
          return send(ws, { type: 'account_deleted', ok: false, reason: 'bad_pass' });
        }
        if (isAdmin(delName) && db.admins.filter((item) => item !== delName).length === 0) {
          return send(ws, { type: 'account_deleted', ok: false, reason: 'last_admin' });
        }
        for (const other of Object.values(db.users)) {
          other.friends = (other.friends || []).filter((friend) => friend !== delName);
          other.offers = (other.offers || []).filter((offer) => offer.from !== delName);
        }
        db.admins = db.admins.filter((item) => item !== delName);
        delete db.users[delName];
        sockets.delete(delName);
        audit(delName, 'account_delete', delName);
        save();
        ws.user = null;
        send(ws, { type: 'account_deleted', ok: true });
        return;
      }

      default:
        return send(ws, { type: 'error', reason: 'unknown' });
    }
  });

  ws.on('close', () => {
    if (ws.user) leaveRoom(ws);
    if (!ws.user) return;
    if (sockets.get(ws.user) !== ws) return;
    sockets.delete(ws.user);
    const user = db.users[ws.user];
    if (user) {
      user.online = false;
      user.game = null;
      user.lastActive = Date.now();
      if (ws.onlineSince) {
        user.onlineMs = (user.onlineMs || 0) + (Date.now() - ws.onlineSince);
        ws.onlineSince = null;
      }
      save();
    }
    const presence = { type: 'presence', user: ws.user, online: false, game: null };
    for (const friend of friendsOf(ws.user)) {
      const friendSocket = sockets.get(friend);
      if (friendSocket) send(friendSocket, presence);
    }
  });
});

server.listen(PORT, () => {
  console.log(`game-launcher online server on :${PORT}`);
  refreshAll().catch(() => {});
  setInterval(() => {
    if (promoCleanup()) broadcastServers();
    refreshAll().catch(() => {});
  }, MONITOR_MS);
});
