import { writable, get } from 'svelte/store';
import { invoke } from '@tauri-apps/api/tauri';
import { getCurrent } from '@tauri-apps/api/window';
import { emit, listen } from '@tauri-apps/api/event';

export const imageCache = writable<Record<string, string>>({});
const imageInflight = new Set<string>();

export function resolveImage(url: string): string {
  if (!url) return '';
  const cached = get(imageCache)[url];
  if (cached) return cached;
  if (!imageInflight.has(url)) {
    imageInflight.add(url);
    invoke<string>('fetch_image', { url })
      .then((data) => {
        if (data) imageCache.update((cache) => ({ ...cache, [url]: data }));
      })
      .catch(() => {})
      .finally(() => imageInflight.delete(url));
  }
  return '';
}

export interface Friend {
  name: string;
  displayName?: string;
  uid?: number;
  online: boolean;
  game: string | null;
  statusKind?: string;
  avatar?: string;
}

export interface ProfileSettings {
  bio: string;
  firstName: string;
  lastName: string;
  statusText: string;
  statusKind: string;
  hideGame: boolean;
  avatar: string;
  gender: string;
  city: string;
  country: string;
  birthdate: string;
  cover: string;
  frame: string;
}

export interface AchievementReward {
  kind: 'frame' | 'cover' | 'badge' | string;
  id: string;
  label?: string;
  icon?: string;
}

export interface Achievement {
  id: string;
  name: string;
  metric?: string;
  need: number;
  rarity?: string;
  desc?: string;
  reward?: AchievementReward;
  value: number;
  done: boolean;
  pct: number;
}

export interface ProgressLevel {
  name: string;
  xp: number;
  reached: boolean;
}

export interface ProfileProgress {
  xp: number;
  title: string;
  next: string;
  nextXp: number;
  hours: number;
  logins: number;
  games: number;
  days: number;
  levels: ProgressLevel[];
  achievements: Achievement[];
}

export interface Msg {
  from: string;
  text: string;
  ts: number;
  mine: boolean;
}

export interface HostInfo {
  running: boolean;
  port: number;
  local_ip: string | null;
}

export interface PublicServer {
  id: string;
  name: string;
  address: string;
  game: string;
  desc: string;
  by: string;
  added: number;
  votes: number;
  votesAll: number;
  votesWeek: number;
  votesMonth: number;
  voted: boolean;
  canVote: boolean;
  voteWait: number;
  pinned: boolean;
  badge: string;
  highlight: string;
  promoSize: string;
  promoUntil: number;
  hidden: boolean;
  place: number;
  online: boolean;
  players: number;
  maxPlayers: number;
  map: string;
  version: string;
  motd: string;
  ping: number;
  checkedAt: number;
  banner: string;
  bannerSize?: string;
  bannerStyle?: string;
  pinSlot?: number;
  listBlock?: string;
  listSlot?: number;
  icon: string;
  history: { ts: number; online: boolean; players: number }[];
  votesLog: { name: string; ts: number }[];
}

export interface PinSlotInfo {
  slot: number;
  id: string;
  name: string;
  mine: boolean;
  price: number;
  priceCoins: number;
}

export interface ListSlotInfo {
  slot: number;
  id: string;
  name: string;
  mine: boolean;
}

export interface ListBlockInfo {
  id: string;
  at: number;
  label: string;
  price: number;
  priceCoins: number;
  slots: ListSlotInfo[];
}

export interface ServerStats {
  servers: number;
  online: number;
  votes: number;
  games: number;
}

export interface CoinHistoryEntry {
  type: 'buy' | 'vote' | 'daily' | 'spend' | string;
  pack?: string;
  delta: number;
  price?: number;
  ts: number;
  by?: string;
  note?: string;
}

export type GiftRarity = 'common' | 'rare' | 'epic' | 'legendary';

export interface GifItem {
  id: string;
  emoji: string;
  name: string;
  rarity: GiftRarity;
  price: number;
}

export interface GiftCategory {
  id: string;
  name: string;
  note: string;
  icon: string;
  items: GifItem[];
}

export interface Gift {
  id: string;
  emoji: string;
  name: string;
  price: number;
}

export interface PromoOrder {
  id: string;
  user: string;
  server: string;
  serverName: string;
  options: string[];
  days: number;
  amount: number;
  currency?: 'coins' | 'rub';
  status: 'pending' | 'paid' | 'expired';
  ts: number;
  paidAt?: number;
  payment?: string;
}

export interface ServerOffer {
  id: string;
  name: string;
  address: string;
  game: string;
  note: string;
  from: string;
  ts: number;
}

export interface AdminUser {
  name: string;
  email: string;
  online: boolean;
  game: string | null;
  banned: boolean;
  admin: boolean;
  reputation: number;
  friends: number;
}

export interface AdminStats {
  users: number;
  online: number;
  banned: number;
  approved: number;
  pending: number;
  rooms: number;
  admins: number;
}

export interface AuditEntry {
  ts: number;
  actor: string;
  action: string;
  target: string;
  extra: string;
}

export interface TotpSetup {
  secret: string;
  otpauth: string;
}

export interface TicketReply {
  by: string;
  text: string;
  ts: number;
}

export interface Ticket {
  id: string;
  from: string;
  kind: string;
  text: string;
  ts: number;
  status: string;
  replies: TicketReply[];
}

export interface Complaint {
  id: string;
  from: string;
  target: string;
  reason: string;
  ts: number;
  status: string;
  resolved_by?: string;
}

export interface PrivacySettings {
  profile: 'everyone' | 'friends' | 'nobody';
  game: 'everyone' | 'friends' | 'nobody';
  friends: 'everyone' | 'friends' | 'nobody';
  lastSeen: 'everyone' | 'friends' | 'nobody';
  photo: 'everyone' | 'friends' | 'nobody';
  messages: 'everyone' | 'friends';
  friendRequests: 'everyone' | 'nobody';
  showName: 'everyone' | 'friends' | 'nobody';
}

export interface SessionInfo {
  id: string;
  ip: string;
  ua: string;
  created: number;
  lastSeen: number;
  current: boolean;
  newDevice?: boolean;
}

export interface GroupPost {
  id: string;
  by: string;
  text: string;
  image: string;
  ts: number;
  likes: number;
  views: number;
  liked: boolean;
  published: boolean;
}

export interface GroupMember {
  name: string;
  avatar: string;
}

export interface Group {
  id: string;
  name: string;
  tagline: string;
  abbrev: string;
  link: string;
  isOpen: boolean;
  avatar: string;
  banner: string;
  by: string;
  byUid: number;
  created: number;
  members: number;
  subscribed: boolean;
  mine: boolean;
  applicant: boolean;
  applyCount: number;
  applicantsList: GroupMember[];
  membersList: GroupMember[];
  posts: GroupPost[];
}

export interface NewsFeedItem {
  g: { id: string; name: string; avatar: string; by: string };
  post: GroupPost;
}

export interface ViewedProfile {
  name: string;
  displayName?: string;
  uid?: number;
  online: boolean;
  statusKind?: string;
  game: string | null;
  avatar: string;
  bio: string;
  firstName?: string;
  lastName?: string;
  statusText: string;
  cover?: string;
  frame?: string;
  birthdate?: string;
  gender?: string;
  city?: string;
  country?: string;
  reputation: number;
  likes?: number;
  dislikes?: number;
  myVote?: number;
  lastSeen: number | null;
  isAdmin: boolean;
  title: string;
  xp: number;
  achievements: Achievement[];
  friendship: 'self' | 'friends' | 'none';
  friendsCount?: number;
  friendsList?: { name: string; avatar: string; online: boolean }[];
  followersCount?: number;
  followersList?: { name: string; avatar: string; online: boolean }[];
  posts?: FeedPost[];
}

export interface FeedComment {
  id: string;
  by: string;
  avatar: string;
  text: string;
  ts: number;
  mine: boolean;
}

export interface FeedPoll {
  question: string;
  options: { text: string; votes: number }[];
  voted: number;
  total: number;
}

export interface FeedPost {
  id: string;
  by: string;
  author: string;
  avatar: string;
  text: string;
  images: string[];
  game: string;
  visibility: 'public' | 'friends' | 'private';
  ts: number;
  likes: number;
  liked: boolean;
  comments: FeedComment[];
  commentsCount: number;
  poll: FeedPoll | null;
  mine: boolean;
}

export interface PostDraft {
  text: string;
  images: string[];
  game: string;
  visibility: 'public' | 'friends' | 'private';
  poll: { question: string; options: string[] } | null;
}

export interface DirectoryPlayer {
  name: string;
  display: string;
  uid?: number;
  hiddenProfile?: boolean;
  game?: string | null;
  online: boolean;
  statusKind: string;
  avatar: string;
  gender: string;
  city: string;
  country: string;
  followers: number;
  following: number;
  games: number;
  minutes: number;
  reputation: number;
  title: string;
  isAdmin: boolean;
}

export interface PlayersQuery {
  q?: string;
  gender?: string;
  city?: string;
  country?: string;
  sort?: string;
  limit?: number;
  offset?: number;
}

export interface PlayersDirectory {
  items: DirectoryPlayer[];
  total: number;
  online: number;
  offset: number;
  limit: number;
  cities: string[];
  countries: string[];
  loading: boolean;
  q: string;
  gender: string;
  city: string;
  country: string;
  sort: string;
}

export interface OnlineState {
  server: string;
  user: string;
  uid?: number;
  token: string;
  authed: boolean;
  busy: boolean;
  error: string;
  coins: number;
  coinHistory: CoinHistoryEntry[];
  dailyReady: boolean;
  lastCoin: { channel: string; ok: boolean; reason: string; amt: number; extra: unknown } | null;
  gifts: GiftCategory[];   // каталог подарков: категории со стикерами
  giftCol: Record<string, number>;  // коллекция: id -> количество
  activeGift: string;      // текущий подарок у аватара
  friends: Friend[];
  threads: Record<string, Msg[]>;
  unread: Record<string, number>;
  openChats: string[];
  host: HostInfo | null;
  panelOpen: boolean;
  publicServers: PublicServer[];
  pinnedServers: PublicServer[];
  hiddenMine: PublicServer[];
  pendingMine: PublicServer[];
  pinSlots: PinSlotInfo[];
  listBlocks: ListBlockInfo[];
  listBlockSize: number;
  orders: PromoOrder[];
  lastOrder: PromoOrder | null;
  paidOrder: PromoOrder | null;
  serverStats: ServerStats | null;
  pendingServers: PublicServer[];
  isAdmin: boolean;
  offers: ServerOffer[];
  offersSent: number;
  adminUsers: AdminUser[];
  adminStats: AdminStats | null;
  adminOrders: PromoOrder[];
  adminTotals: { paidCount: number; paidSum: number; paidCoins: number; pending: number; expired: number } | null;
  twofa: boolean;
  auth2fa: boolean;
  weakPassword: boolean;
  adminTotp: TotpSetup | null;
  adminAudit: AuditEntry[];
  myTickets: Ticket[];
  allTickets: Ticket[];
  supportSent: number;
  reputation: number;
profile: ProfileSettings;
  progress: ProfileProgress | null;
  holidayGranted: { id: string; name: string; symbol: string; rarity: string }[];
  onlineNow: Friend[];
  friendRequests: { name: string; avatar: string; online: boolean }[];
  friendSent: string[];
  viewed: ViewedProfile | null;
  groups: Group[];
  newsFeed: NewsFeedItem[];
  groupView: Group | null;
  complaints: Complaint[];
  complaintSent: number;
  email: string;
  consent: string;
  consentVersion: string;
  sessions: SessionInfo[];
  passwordResult: string;
  exportJson: string;
  deleted: boolean;
  voteOk: number;
  privacy: PrivacySettings;
  directory: PlayersDirectory;
  feed: FeedPost[];
  feedLoading: boolean;
}

function read(key: string, fallback = ''): string {
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}

export const online = writable<OnlineState>({
  server: read('online_server', 'ws://127.0.0.1:8787').trim(),
user: read('online_user').trim(),
  uid: 0,
  token: read('online_token'),
authed: false,
  busy: false,
  error: '',
  coins: 0,
  coinHistory: [],
  dailyReady: false,
  lastCoin: null,
  gifts: [],
  giftCol: {},
  activeGift: '',
  friends: [],
  threads: {},
  unread: {},
  openChats: [],
  host: null,
  panelOpen: false,
  publicServers: [],
  pinnedServers: [],
  hiddenMine: [],
  pendingMine: [],
  pinSlots: [],
  listBlocks: [],
  listBlockSize: 5,
  orders: [],
  lastOrder: null,
  paidOrder: null,
  serverStats: null,
  pendingServers: [],
  isAdmin: false,
  offers: [],
  offersSent: 0,
  adminUsers: [],
  adminStats: null,
  adminOrders: [],
  adminTotals: null,
  twofa: false,
  auth2fa: false,
  weakPassword: false,
  adminTotp: null,
  adminAudit: [],
  myTickets: [],
  allTickets: [],
  supportSent: 0,
  reputation: 0,
  profile: { bio: '', firstName: '', lastName: '', statusText: '', statusKind: 'online', hideGame: false, avatar: '', gender: '', city: '', country: '', birthdate: '', cover: '', frame: '' },
progress: null,
  holidayGranted: [],
  onlineNow: [],
  friendRequests: [],
  friendSent: [],
  viewed: null,
  groups: [],
  newsFeed: [],
  groupView: null,
  complaints: [],
  complaintSent: 0,
  email: '',
  consent: '',
  consentVersion: '',
  sessions: [],
  passwordResult: '',
  exportJson: '',
  deleted: false,
  voteOk: 0,
 privacy: { profile: 'everyone', game: 'friends', friends: 'everyone', lastSeen: 'friends', photo: 'friends', messages: 'friends', friendRequests: 'everyone', showName: 'everyone' },
  directory: {
    items: [],
    total: 0,
    online: 0,
    offset: 0,
    limit: 30,
    cities: [],
    countries: [],
    loading: false,
    q: '',
    gender: '',
    city: '',
    country: '',
    sort: 'playtime',
  },
  feed: [],
  feedLoading: false,
});

let ws: WebSocket | null = null;
let pending: Record<string, unknown> | null = null;
let retry = 0;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let initialized = false;
let rememberMe = true;
export const signupJust = writable(false);

const isMainWindow = getCurrent().label === 'main';

function patch(partial: Partial<OnlineState>) {
  online.update((state) => ({ ...state, ...partial }));
  if (isMainWindow) {
    const snapshot = get(online);
    try {
      localStorage.setItem('online_state', JSON.stringify(snapshot));
    } catch {}
    emit('online:state', snapshot).catch(() => {});
  }
}

export function applyRemoteState(snapshot: OnlineState) {
  online.set(snapshot);
}

function persist(server: string, user: string, token: string) {
  try {
    localStorage.setItem('online_server', server);
    localStorage.setItem('online_user', user);
    if (token) localStorage.setItem('online_token', token);
    else localStorage.removeItem('online_token');
  } catch (e) {
    console.error(e);
  }
}

function send(payload: unknown): boolean {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
    return true;
  }
  return false;
}

export function serverHttpBase(): string {
  return read('online_server', 'ws://127.0.0.1:8787')
    .trim()
    .replace(/^wss:/, 'https:')
    .replace(/^ws:/, 'http:')
    .replace(/\/+$/, '');
}

export function bannerUrl(server: { banner?: string } | null | undefined): string {
  if (!server || !server.banner) return '';
  const base = serverHttpBase();
  return base ? base + server.banner : '';
}

export function iconUrl(server: { icon?: string } | null | undefined): string {
  if (!server || !server.icon) return '';
  const base = serverHttpBase();
  return base ? base + server.icon : '';
}

export function setServerBanner(id: string, dataUrl: string, size?: string, style?: string): boolean {
  return send({ type: 'server_banner_set', id, dataUrl, size, style });
}

export function setServerBannerStyle(id: string, style: string): boolean {
  return send({ type: 'server_banner_style', id, style });
}

export function clearServerBanner(id: string): boolean {
  return send({ type: 'server_banner_clear', id });
}

export function setServerIcon(id: string, dataUrl: string): boolean {
  return send({ type: 'server_icon_set', id, dataUrl });
}

export function clearServerIcon(id: string): boolean {
  return send({ type: 'server_icon_clear', id });
}

function handle(raw: string) {
  let msg: any;
  try {
    msg = JSON.parse(raw);
  } catch {
    return;
  }
  const state = get(online);

  switch (msg.type) {
    case 'publish_consent_ok': {
      if (consentPending) {
        clearTimeout(consentPending.timer);
        const resolve = consentPending.resolve;
        consentPending = null;
        resolve(String(msg.token || ''));
      }
      break;
    }
    case 'publish_consent_fail': {
      if (consentPending) {
        clearTimeout(consentPending.timer);
        const reject = consentPending.reject;
        consentPending = null;
        reject(new Error(msg.reason === 'bad_pass' ? 'Неверный пароль' : 'Сервер отклонил запрос'));
      }
      break;
    }
    case 'auth_ok': {
      const threads = { ...state.threads };
      patch({
token: msg.token,
        user: msg.user,
        uid: Number(msg.uid) || 0,
        authed: true,
        busy: false,
        error: '',
        friends: msg.friends ?? [],
        friendRequests: msg.friend_requests ?? [],
        isAdmin: !!msg.is_admin,
        twofa: !!msg.twofa,
        auth2fa: false,
        weakPassword: !!msg.weak_password,
reputation: Number(msg.reputation) || 0,
        coins: Number(msg.coins) ?? 0,
        dailyReady: !!msg.daily_ready,
profile: msg.profile ?? { bio: '', statusText: '', statusKind: 'online', hideGame: false, avatar: '' },
        progress: msg.progress ?? null,
        holidayGranted: msg.holiday_granted && msg.holiday_granted.length ? msg.holiday_granted : [],
        offers: msg.offers ?? [],
        email: String(msg.email || ''),
        consent: String(msg.consent || ''),
        consentVersion: String(msg.consent_version || ''),
        privacy: msg.privacy ?? {
          lastSeen: 'friends',
          photo: 'friends',
          messages: 'friends',
          friendRequests: 'everyone',
        },
        deleted: false,
        panelOpen: true,
        threads,
      });
      if (rememberMe) {
        persist(state.server, msg.user, msg.token);
        invoke('online_session_save', {
          server: state.server,
          token: msg.token,
          user: msg.user,
        }).catch((e) => console.error(e));
      } else {
        persist(state.server, msg.user, '');
        invoke('online_session_clear').catch((e) => console.error(e));
      }
      send({ type: 'server_list' });
      if (msg.is_admin) send({ type: 'server_pending' });
      break;
    }
    case 'auth_fail': {
      const reason = String(msg.reason || '');
      patch({
        busy: false,
        error:
          reason === 'exists'
            ? 'Ник уже занят'
            : reason === 'bad_pass'
              ? 'Пароль слишком короткий (от 8 символов)'
              : reason === 'consent_required'
                ? 'Примите соглашение и политику обработки данных'
                : reason === 'ip_locked'
                  ? 'Слишком много попыток с этого адреса. Повторите позже'
                  : reason === 'bad_name'
                ? 'Ник: 3–20 символов, латиница, цифры, _'
                : reason === 'bad_email'
                  ? 'Проверьте адрес эл. почты'
                  : reason === 'banned'
                    ? 'Аккаунт заблокирован администратором'
                    : reason === 'locked'
                      ? `Слишком много попыток входа. Повторите через ${Math.max(1, Math.ceil(Number(msg.wait || 300) / 60))} мин`
                      : reason === 'bad_2fa'
                        ? 'Неверный код двухфакторки'
: reason === 'weak_admin_pass'
                          ? 'Для админского аккаунта пароль — от 10 символов'
                          : reason === 'weak_pass'
                            ? 'Ненадёжный пароль: минимум 10 символов, буквы разного регистра и цифра'
                            : reason === 'token'
                      ? 'Сессия истекла — войдите заново'
                      : 'Неверный ник или пароль',
      });
      if (reason === 'token') {
        patch({ token: '', authed: false });
        persist(state.server, state.user, '');
      }
      break;
    }
    case 'privacy': {
      patch({ privacy: msg.privacy ?? state.privacy });
      break;
    }
    case 'consent_saved': {
      patch({ consent: String(msg.version || ''), consentVersion: String(msg.version || '') });
      break;
    }
    case 'password_result': {
      patch({ passwordResult: msg.ok ? 'Пароль изменён' : passwordErrorText(String(msg.reason || '')) });
      break;
    }
    case 'sessions': {
      patch({ sessions: Array.isArray(msg.sessions) ? msg.sessions : [] });
      break;
    }
    case 'session_revoked': {
      patch({ sessions: state.sessions.filter((item) => item.id !== msg.id) });
      break;
    }
    case 'logged_out': {
      logout();
      break;
    }
    case 'account_export': {
      patch({ exportJson: JSON.stringify(msg.data ?? {}, null, 2) });
      break;
    }
    case 'account_deleted': {
      if (msg.ok) {
        logout();
        patch({ deleted: true });
      } else {
        patch({ passwordResult: 'Неверный пароль — удаление отменено' });
      }
      break;
    }
case 'friends': {
      patch({ friends: msg.friends ?? [] });
      break;
    }
    case 'friend_requests': {
      patch({
        friendRequests: msg.requests ?? [],
        friendSent: Array.isArray(msg.outgoing) ? msg.outgoing : state.friendSent,
      });
      break;
    }
    case 'friend_request_sent': {
      const sentTo = String(msg.user || '');
      const next = sentTo && !state.friendSent.includes(sentTo) ? [...state.friendSent, sentTo] : state.friendSent;
      patch({ friendSent: next, error: '' });
      break;
    }
    case 'presence': {
      const friends = [...state.friends];
      const idx = friends.findIndex((friend) => friend.name === msg.user);
      const next: Friend = {
        name: msg.user,
        online: !!msg.online,
        game: msg.game ?? null,
      };
      if (idx >= 0) friends[idx] = next;
      else friends.push(next);
      patch({ friends });
      break;
    }
    case 'chat': {
      const from = String(msg.from);
      const list = state.threads[from] ?? [];
      const threads = {
        ...state.threads,
        [from]: [
          ...list,
          {
            from,
            text: String(msg.text),
            ts: Number(msg.ts) || Date.now(),
            mine: from === state.user,
          },
        ],
      };
      const unread = { ...state.unread };
      if (!state.openChats.includes(from)) {
        unread[from] = (unread[from] ?? 0) + 1;
      }
      patch({ threads, unread });
      break;
    }
    case 'error': {
      const reason = String(msg.reason || '');
      patch({
        error:
          reason === 'no_user'
            ? 'Такого игрока нет'
              : reason === 'not_friend'
                ? 'Писать можно только друзьям'
                : reason === 'privacy_messages'
                  ? 'Игрок ограничил приём сообщений'
                  : reason === 'privacy_friends'
                    ? 'Игрок запретил добавлять его в друзья'
              : reason === 'slow_down'
                ? 'Слишком часто'
                : reason === 'need_name_address'
                  ? 'Укажите название и адрес'
                  : reason === 'not_authed'
                    ? 'Войдите в аккаунт, чтобы добавить сервер'
                    : reason === 'bad_address'
                    ? 'Адрес должен быть вида 1.2.3.4:27015'
                    : reason === 'self'
                      ? 'Нельзя отправить самому себе'
                      : reason === 'forbidden'
                        ? 'Нет прав администратора'
                        : reason === 'target_admin'
                          ? 'Администратора изменить нельзя'
                          : reason === 'env_admins'
                            ? 'Список админов задан на сервере через ADMIN_NAMES'
                            : reason === 'empty'
                              ? 'Введите текст'
                              : reason === 'no_ticket'
                                ? 'Обращение не найдено'
                                : reason === 'short'
                                  ? 'Опишите жалобу подробнее (от 5 символов)'
                                  : reason === 'no_complaint'
                                    ? 'Жалоба не найдена'
                                    : reason === 'bad_delta'
                                      ? 'Некорректное изменение репутации'
                                    : reason === 'bad_date'
                                      ? 'Некорректная дата рождения'
                                      : reason === 'too_big'
                                        ? 'Файл слишком большой (до 2 МБ)'
                                        : 'Ошибка сервера',
      });
      break;
    }
case 'servers': {
      patch({
        publicServers: msg.servers ?? [],
        pinnedServers: msg.pinned ?? [],
        hiddenMine: msg.hiddenMine ?? [],
        pendingMine: msg.pendingMine ?? [],
        pinSlots: msg.pinSlots ?? [],
        listBlocks: msg.listBlocks ?? [],
        listBlockSize: msg.listBlockSize ?? 5,
        serverStats: msg.stats ?? null,
      });
      break;
    }
    case 'online_now': {
      patch({ onlineNow: msg.users ?? [] });
      break;
    }
    case 'profile_info': {
      patch({ viewed: msg.user ?? null });
      break;
    }
    case 'profile_voted': {
      const voted = state.viewed;
      if (voted) {
        patch({
          viewed: {
            ...voted,
            reputation: Number(msg.reputation) || 0,
            myVote: Number(msg.myVote) || 0,
            likes: Number(msg.likes) || 0,
            dislikes: Number(msg.dislikes) || 0,
          },
        });
      }
      break;
    }
    case 'players_list': {
      patch({
        directory: {
          ...state.directory,
          items: msg.items ?? [],
          total: Number(msg.total) || 0,
          online: Number(msg.online) || 0,
          offset: Number(msg.offset) || 0,
          limit: Number(msg.limit) || 30,
          cities: msg.cities ?? [],
          countries: msg.countries ?? [],
          loading: false,
        },
      });
      break;
    }
    case 'groups': {
      patch({ groups: msg.groups ?? [] });
      break;
    }
    case 'feed_list': {
      patch({ feed: msg.posts ?? [], feedLoading: false });
      break;
    }
    case 'post_created': {
      const created: FeedPost | null = msg.post ?? null;
      if (created) {
        patch({ feed: [created, ...get(online).feed.filter((p) => p.id !== created.id)], feedLoading: false });
      }
      break;
    }
    case 'post_updated': {
      const updated: FeedPost | null = msg.post ?? null;
      if (updated) {
        patch({ feed: get(online).feed.map((p) => (p.id === updated.id ? updated : p)) });
      }
      break;
    }
    case 'post_deleted': {
      const removedId = String(msg.id ?? '');
      patch({ feed: get(online).feed.filter((p) => p.id !== removedId) });
      break;
    }
    case 'group_info': {
      patch({ groupView: msg.group ?? null });
      break;
    }
    case 'group_created': {
      const g = msg.group ?? null;
      if (g) {
        const groups = state.groups.some((x) => x.id === g.id) ? state.groups.map((x) => (x.id === g.id ? g : x)) : [...state.groups, g];
        patch({ groups, groupView: g });
      }
      break;
    }
    case 'post_created': {
      const g = msg.group ?? null;
      if (g) {
        const groups = state.groups.map((x) => (x.id === g.id ? g : x));
        patch({ groups, groupView: g });
      }
      break;
    }
    case 'group_applied': {
      const g = msg.group ?? null;
      if (g) {
        const groups = state.groups.map((x) => (x.id === g.id ? g : x));
        patch({ groups, groupView: g });
      }
      break;
    }
    case 'group_apply_resolved': {
      const g = msg.group ?? null;
      if (g) {
        const groups = state.groups.map((x) => (x.id === g.id ? g : x));
        patch({ groups, groupView: g });
      }
      break;
    }
    case 'group_subscribed': {
      const groups = state.groups.map((g) => (g.id === msg.id ? { ...g, subscribed: !!msg.subscribed } : g));
      if (state.groupView && state.groupView.id === msg.id) {
        patch({ groups, groupView: { ...state.groupView, subscribed: !!msg.subscribed } });
      } else {
        patch({ groups });
      }
      break;
    }
    case 'news_feed': {
      patch({ newsFeed: msg.feed ?? [] });
      break;
    }
    case 'promo_order': {
      patch({ lastOrder: msg.order ?? null, error: '', coins: Number(msg.coins) ?? get(online).coins });
      break;
    }
case 'coins_bought': {
      patch({ coins: Number(msg.coins) || 0, error: '', coinHistory: Array.isArray(msg.history) ? msg.history : get(online).coinHistory });
      break;
    }
    case 'wallet_history': {
      patch({ coins: Number(msg.coins) || 0, coinHistory: Array.isArray(msg.history) ? msg.history : [] });
      break;
    }
    case 'coin_result': {
      patch({ coins: Number(msg.coins) || get(online).coins, lastCoin: { channel: String(msg.channel || ''), ok: !!msg.ok, reason: String(msg.reason || ''), amt: Number(msg.amt) || 0, extra: msg.extra ?? null } });
      break;
    }
    case 'coin_collected': {
      patch({ coins: Number(msg.coins) || get(online).coins, lastCoin: { channel: 'daily', ok: !!msg.ok, reason: String(msg.reason || ''), amt: Number(msg.amt) || 0, extra: null }, dailyReady: !!msg.daily_ready });
      break;
    }
    case 'gift_catalog_data': {
      patch({ gifts: Array.isArray(msg.catalog) ? msg.catalog : [], giftCol: msg.collection ?? {}, activeGift: String(msg.activeGift || ''), coins: Number(msg.coins) || get(online).coins });
      break;
    }
    case 'gift_sent': {
      patch({ coins: Number(msg.coins) || get(online).coins, error: msg.ok ? '' : String(msg.reason || '') });
      break;
    }
    case 'gift_bought': {
      patch({
        coins: Number(msg.coins) || get(online).coins,
        activeGift: msg.mode === 'self' ? String(msg.activeGift || '') : get(online).activeGift,
        error: msg.ok ? '' : String(msg.reason || ''),
      });
      break;
    }
    case 'gift_active': {
      patch({ activeGift: String(msg.activeGift || '') });
      break;
    }
    case 'order_paid': {
      patch({ paidOrder: msg.order ?? null, lastOrder: null, error: '', coins: Number(msg.coins) ?? get(online).coins });
      break;
    }
    case 'orders': {
      patch({ orders: msg.orders ?? [] });
      break;
    }
    case 'vote_result': {
      const reason = String(msg.reason || '');
      patch({
        error: msg.ok
          ? ''
          : reason === 'wait'
            ? `Следующий голос через ${Math.max(1, Math.ceil(Number(msg.wait || 0) / 3600))} ч`
            : reason === 'new_account'
              ? 'Голос нового аккаунта учитывается после 10 минут с регистрации'
              : reason === 'auth'
                ? 'Войдите, чтобы голосовать'
                : 'Голос не учтён',
        voteOk: msg.ok ? Date.now() : 0,
      });
      break;
    }
    case 'pending_servers': {
      patch({ pendingServers: msg.servers ?? [] });
      break;
    }
    case 'server_submitted': {
      // заявка принята — полезно запросить очереди и список
      send({ type: 'server_list' });
      break;
    }
    case 'offers': {
      patch({ offers: msg.offers ?? [] });
      break;
    }
    case 'offer_sent': {
      patch({ error: '', offersSent: state.offersSent + 1 });
      break;
    }
    case 'admin_users': {
      patch({ adminUsers: msg.users ?? [] });
      break;
    }
    case 'admin_stats': {
      patch({ adminStats: msg.stats ?? null });
      break;
    }
    case 'admin_orders': {
      patch({ adminOrders: msg.orders ?? [], adminTotals: msg.totals ?? null });
      break;
    }
    case 'auth_2fa_required': {
      patch({ auth2fa: true, busy: false, error: '' });
      break;
    }
    case 'admin_2fa_setup': {
      patch({
        adminTotp: { secret: String(msg.secret || ''), otpauth: String(msg.otpauth || '') },
      });
      break;
    }
    case 'admin_audit': {
      patch({ adminAudit: msg.entries ?? [] });
      break;
    }
    case 'support_my': {
      patch({ myTickets: msg.tickets ?? [] });
      break;
    }
    case 'support_all': {
      patch({ allTickets: msg.tickets ?? [] });
      break;
    }
    case 'support_sent': {
      const ticket = msg.ticket;
      patch({
        myTickets: ticket ? [ticket, ...state.myTickets] : state.myTickets,
        supportSent: state.supportSent + 1,
        error: '',
      });
      break;
    }
    case 'support_new': {
      const ticket = msg.ticket;
      if (ticket && !state.allTickets.some((item) => item.id === ticket.id)) {
        patch({ allTickets: [ticket, ...state.allTickets] });
      }
      break;
    }
    case 'support_update': {
      const ticket = msg.ticket;
      if (!ticket) break;
      const replace = (list: Ticket[]) =>
        list.some((item) => item.id === ticket.id)
          ? list.map((item) => (item.id === ticket.id ? ticket : item))
          : list;
      patch({
        myTickets: replace(state.myTickets),
        allTickets: replace(state.allTickets),
      });
      break;
    }
    case 'complaints': {
      patch({ complaints: msg.complaints ?? [] });
      break;
    }
    case 'complaint_new': {
      const complaint = msg.complaint;
      if (complaint && !state.complaints.some((item) => item.id === complaint.id)) {
        patch({ complaints: [complaint, ...state.complaints] });
      }
      break;
    }
    case 'complaint_sent': {
      patch({ complaintSent: state.complaintSent + 1, error: '' });
      break;
    }
    case 'profile': {
      patch({
        profile: msg.profile ?? state.profile,
        progress: msg.progress ?? state.progress,
      });
      break;
    }
    case 'admin_ok': {
      if (msg.action === '2fa_enable') {
        patch({ twofa: true, adminTotp: null, error: '' });
      } else if (msg.action === '2fa_disable') {
        patch({ twofa: false, adminTotp: null, error: '' });
      }
      requestAdminData();
      break;
    }
    case 'kicked': {
      patch({ authed: false, token: '', error: 'Вас отключил администратор' });
      persist(state.server, state.user, '');
      invoke('online_session_clear').catch(() => {});
      break;
    }
    case 'banned': {
      patch({ authed: false, token: '', error: 'Аккаунт заблокирован администратором' });
      persist(state.server, state.user, '');
      invoke('online_session_clear').catch(() => {});
      break;
    }
  }
}

let consentPending: {
  resolve: (token: string) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
} | null = null;

export function requestPublishConsent(pass: string): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!ws || ws.readyState !== 1) {
      reject(new Error('Нет связи с сервером'));
      return;
    }
    if (consentPending) {
      clearTimeout(consentPending.timer);
      consentPending.reject(new Error('Повторный запрос'));
      consentPending = null;
    }
    const timer = setTimeout(() => {
      consentPending = null;
      reject(new Error('Сервер не ответил'));
    }, 10000);
    consentPending = { resolve, reject, timer };
    ws.send(JSON.stringify({ type: 'publish_consent', pass }));
  });
}

function connect() {
  disconnect();
  const state = get(online);
  if (!state.server.trim()) {
    patch({ error: 'Укажите адрес сервера' });
    return;
  }
  try {
    ws = new WebSocket(state.server.trim());
  } catch {
    patch({ error: 'Неверный адрес сервера' });
    return;
  }
  ws.onopen = () => {
    patch({ error: '' });
    retry = 0;
    if (pending) {
      send(pending);
      pending = null;
    } else if (get(online).token) {
      send({ type: 'auth', token: get(online).token });
    } else {
      send({ type: 'server_list' });
    }
  };
  ws.onmessage = (event) => handle(String(event.data));
  ws.onclose = () => {
    ws = null;
    if (!get(online).authed) return;
    const delay = Math.min(10000, 1000 * (retry + 1));
    retry += 1;
    retryTimer = setTimeout(() => {
      if (get(online).authed) connect();
    }, delay);
  };
  ws.onerror = () => {
    patch({ error: 'Нет связи с сервером' });
  };
}

function disconnect() {
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  if (ws) {
    ws.onclose = null;
    try {
      ws.close();
    } catch {}
    ws = null;
  }
}

async function loadHost() {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      const info = await invoke<HostInfo>('online_status');
      patch({ host: info });
      if (info.running) return;
    } catch (e) {
      console.error(e);
    }
    await new Promise((resolve) => setTimeout(resolve, 600));
  }
}

export function initOnline() {
  if (initialized) return;
  initialized = true;

  if (isMainWindow) {
    listen('online:action', (event) => {
      const action = event.payload as {
        type?: string;
        name?: string;
        to?: string;
        text?: string;
      } | null;
      if (!action?.type) return;
      if (action.type === 'openChat' && action.name) openChat(action.name);
      else if (action.type === 'closeChat' && action.name) closeChat(action.name);
      else if (action.type === 'sendChat' && action.to && action.text) {
        sendChat(action.to, action.text);
      } else if (action.type === 'logout') logout();
    });
  }

  window.addEventListener('launcher:launch', (event) => {
    const detail = (event as CustomEvent).detail as { name?: string } | undefined;
    if (detail?.name && get(online).authed) {
      send({ type: 'status', game: detail.name });
    }
  });

  (async () => {
    try {
      const saved = await invoke<{ server?: string; token?: string; user?: string } | null>(
        'online_session_get',
      );
      if (saved?.token) {
        patch({
          server: saved.server || get(online).server,
          user: saved.user || get(online).user,
          token: saved.token,
        });
      }
    } catch (e) {
      console.error(e);
    }
    loadHost().catch(() => {});
    if (get(online).token) connect();
  })();
}

function passwordErrorText(reason: string): string {
  if (reason === 'bad_old') return 'Текущий пароль неверен';
  if (reason === 'bad_pass') return 'Новый пароль — от 8 символов';
  if (reason === 'weak_admin_pass') return 'Для админского аккаунта — от 10 символов';
if (reason === 'weak_pass') return 'Ненадёжный пароль: минимум 10 символов, буквы разного регистра и цифра';
  if (reason === 'hold') return 'Недавно выполнялось критичное действие. Подождите, прежде чем менять пароль';
  return 'Не удалось изменить пароль';
}

export function login(
  kind: 'login' | 'register',
  server: string,
  user: string,
  pass: string,
  opts: { email?: string; remember?: boolean; consent?: boolean } = {},
) {
  const state = get(online);
  if (state.busy) return;
  if (!server.trim() || !user.trim() || !pass) {
    patch({ error: 'Заполните сервер, ник и пароль' });
    return;
  }
rememberMe = opts.remember !== false;
  signupJust.set(kind === 'register');
  patch({ busy: true, error: '', server: server.trim(), user: user.trim(), token: '' });
  persist(server.trim(), user.trim(), '');
  pending = { type: kind, user: user.trim(), pass };
  const email = (opts.email || '').trim();
  if (kind === 'register') {
    if (email) (pending as Record<string, unknown>).email = email;
    (pending as Record<string, unknown>).consent = !!opts.consent;
  }
  connect();
}

export function logout() {
  const state = get(online);
patch({
authed: false,
    token: '',
    uid: 0,
    isAdmin: false,
    coins: 0,
    coinHistory: [],
    friends: [],
    threads: {},
    unread: {},
    openChats: [],
    panelOpen: false,
    error: '',
    offers: [],
    twofa: false,
    auth2fa: false,
    weakPassword: false,
    adminTotp: null,
    adminAudit: [],
    myTickets: [],
    allTickets: [],
    supportSent: 0,
    reputation: 0,
profile: { bio: '', firstName: '', lastName: '', statusText: '', statusKind: 'online', hideGame: false, avatar: '', gender: '', city: '', country: '', birthdate: '', cover: '', frame: '' },
progress: null,
    holidayGranted: [],
    onlineNow: [],
    friendRequests: [],
    friendSent: [],
    complaints: [],
    complaintSent: 0,
privacy: { profile: 'everyone', game: 'friends', friends: 'everyone', lastSeen: 'friends', photo: 'friends', messages: 'friends', friendRequests: 'everyone', showName: 'everyone' },
  });
  persist(state.server, state.user, '');
  invoke('online_session_clear').catch((e) => console.error(e));
  disconnect();
}

export function acceptConsent() {
  send({ type: 'consent_accept' });
}

export function setPrivacy(partial: Partial<PrivacySettings>) {
  const next = { ...get(online).privacy, ...partial };
  patch({ privacy: next });
  send({ type: 'privacy_set', privacy: next });
}

export function changePassword(oldPass: string, newPass: string) {
  patch({ passwordResult: '' });
  if (!send({ type: 'password_change', old: oldPass, new: newPass })) {
    patch({ passwordResult: 'Нет соединения с сервером' });
  }
}

export function requestSessions() {
  send({ type: 'sessions_list' });
}

export function revokeSession(id: string) {
  send({ type: 'session_revoke', id });
}

export function revokeAllSessions() {
  send({ type: 'sessions_revoke_all' });
}

export function exportAccount() {
  patch({ exportJson: '' });
  send({ type: 'account_export' });
}

export function deleteAccount(pass: string) {
  patch({ passwordResult: '' });
  send({ type: 'account_delete', pass });
}

export function addFriend(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return;
  if (!send({ type: 'friend_add', user: trimmed })) {
    patch({ error: 'Нет связи с сервером' });
  }
}

export function removeFriend(name: string) {
  send({ type: 'friend_remove', user: name });
}

export function requestGroups() {
  send({ type: 'groups_list' });
}

export function requestNewsFeed() {
  send({ type: 'news_feed' });
}

export function createGroup(data: {
  name: string;
  tagline: string;
  abbrev: string;
  link: string;
  isOpen: boolean;
  avatar: string;
  banner: string;
}) {
  send({
    type: 'group_create',
    name: data.name,
    tagline: data.tagline,
    abbrev: data.abbrev,
    link: data.link,
    isOpen: data.isOpen,
    avatar: data.avatar,
    banner: data.banner,
  });
}

export function openGroup(id: string) {
  send({ type: 'group_info', id });
}

export function subscribeGroup(id: string) {
  send({ type: 'group_subscribe', id });
}

export function unsubscribeGroup(id: string) {
  send({ type: 'group_unsubscribe', id });
}

export function createPost(id: string, text: string, image = '', published = true) {
  send({ type: 'group_post', id, text, image, published });
}

export function publishPost(id: string, post: string, published: boolean) {
  send({ type: 'group_publish', id, post, published });
}

export function applyJoin(id: string) {
  send({ type: 'group_apply', id });
}

export function resolveApply(id: string, target: string, accept: boolean) {
  send({ type: 'group_apply_resolve', id, target, accept });
}

export function togglePostLike(groupId: string, postId: string) {
  send({ type: 'group_post_like', id: groupId, post: postId });
}

export function openChat(name: string) {
  const state = get(online);
  if (!state.openChats.includes(name)) {
    patch({ openChats: [...state.openChats, name] });
  }
  const unread = { ...state.unread, [name]: 0 };
  patch({ unread });
}

export function closeChat(name: string) {
  const state = get(online);
  patch({ openChats: state.openChats.filter((item) => item !== name) });
}

export function sendChat(to: string, text: string) {
  const trimmed = text.trim();
  if (!trimmed || !to) return;
  if (!send({ type: 'chat', to, text: trimmed })) {
    patch({ error: 'Нет связи с сервером' });
  }
}

export function togglePanel() {
  patch({ panelOpen: !get(online).panelOpen });
}

export function setServer(server: string) {
  const clean = String(server || '').trim();
  patch({ server: clean, error: '' });
  persist(clean, get(online).user, get(online).token);
  connect();
}

export function requestPublicServers() {
  send({ type: 'server_list' });
}

export function voteServer(id: string, nick = '') {
  if (!send({ type: 'server_vote', id, nick })) {
    patch({ error: 'Нет соединения с сервером' });
  }
}

export function recheckServer(id: string) {
  send({ type: 'server_recheck', id });
}

export function setServerPromo(
  id: string,
  promo: { pinned?: boolean; badge?: string; highlight?: string } = {},
) {
  send({ type: 'server_promo', id, ...promo });
}

export function buyPromo(
  id: string,
  payload: { options?: string[]; days?: number; currency?: 'coins' | 'rub'; pinSlot?: number; listBlock?: string; listSlot?: number },
) {
  send({ type: 'promo_buy', id, ...payload });
}

export function buyCoins(pack: string) {
  send({ type: 'coins_buy', pack });
}

export function requestWalletHistory() {
  send({ type: 'wallet_history' });
}

export function coinCheck() {
  send({ type: 'coin_check' });
}

export function coinSteam() {
  send({ type: 'coin_steam' });
}

export function coinRun() {
  send({ type: 'coin_run' });
}

export function coinFirstServer() {
  send({ type: 'coin_first_server' });
}

export function coinCollect() {
  send({ type: 'coin_collect' });
}

export function requestGifts() {
  send({ type: 'gift_catalog' });
}

export function giftSend(to: string, id: string) {
  send({ type: 'gift_send', to, id });
}

export function giftSetActive(id: string) {
  send({ type: 'gift_set_active', id });
}

export function giftBuy(id: string, mode: 'self' | 'to', to = '') {
  send({ type: 'gift_buy', id, mode, to });
}

export function coinCalendar() {
  send({ type: 'coin_calendar' });
}

export function coinChest() {
  send({ type: 'coin_chest' });
}

export function coinGoal() {
  send({ type: 'coin_goal' });
}

export function coinPlay() {
  send({ type: 'coin_play' });
}

export function payOrder(
  id: string,
  extras: { badge?: string; color?: string } = {},
) {
  send({ type: 'order_pay', id, ...extras });
}

export function clearLastOrder() {
  patch({ lastOrder: null, paidOrder: null });
}

export function requestOrders() {
  send({ type: 'orders_my' });
}

export function requestOnlineNow() {
  send({ type: 'online_now' });
}

export function requestProfileView(user: string | number) {
  send({ type: 'profile_view', user: String(user) });
}

export function voteProfile(user: string | number, value: 1 | -1 | 0) {
  if (!send({ type: 'profile_vote', user: String(user), value })) {
    patch({ error: 'Нет связи с сервером' });
  }
}

export function requestProfileClear() {
  patch({ viewed: null });
}

export function requestPlayers(query: PlayersQuery = {}) {
  patch({
    directory: {
      ...get(online).directory,
      loading: true,
      q: query.q ?? '',
      gender: query.gender ?? '',
      city: query.city ?? '',
      country: query.country ?? '',
      sort: query.sort ?? 'playtime',
    },
  });
  const payload = {
    type: 'players_list',
    q: query.q ?? '',
    gender: query.gender ?? '',
    city: query.city ?? '',
    country: query.country ?? '',
    sort: query.sort ?? 'playtime',
    limit: query.limit ?? 30,
    offset: query.offset ?? 0,
  };
  ensureConnected().then((ok) => {
    if (!ok) {
      patch({ directory: { ...get(online).directory, loading: false } });
      return;
    }
    send(payload);
  });
}

export function requestFeed() {
  patch({ feedLoading: true });
  ensureConnected().then((ok) => {
    if (!ok) {
      patch({ feedLoading: false });
      return;
    }
    send({ type: 'feed_list' });
  });
}

export function createFeedPost(draft: PostDraft) {
  ensureConnected().then((ok) => {
    if (!ok) return;
    send({
      type: 'post_create',
      text: draft.text,
      images: draft.images,
      game: draft.game,
      visibility: draft.visibility,
      poll: draft.poll,
    });
  });
}

export function deletePost(id: string) {
  send({ type: 'post_delete', id });
}

export function likePost(id: string) {
  send({ type: 'post_like', id });
}

export function commentPost(id: string, text: string) {
  send({ type: 'post_comment', id, text });
}

export function votePost(id: string, option: number) {
  send({ type: 'post_vote', id, option });
}

export function ensureConnected(): Promise<boolean> {
  return new Promise((resolve) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      resolve(true);
      return;
    }
    try {
      connect();
    } catch {
      resolve(false);
      return;
    }
    let tries = 0;
    const tick = setInterval(() => {
      tries++;
      if (ws && ws.readyState === WebSocket.OPEN) {
        clearInterval(tick);
        resolve(true);
      } else if (tries > 40) {
        clearInterval(tick);
        resolve(false);
      }
    }, 100);
  });
}

export function requestFriendRequests() {
  send({ type: 'friend_request_list' });
}

export function sendFriendRequest(user: string) {
  send({ type: 'friend_request_send', user });
}

export function acceptFriendRequest(user: string) {
  send({ type: 'friend_request_accept', user });
}

export function declineFriendRequest(user: string) {
  send({ type: 'friend_request_decline', user });
}

export function cancelFriendRequest(user: string) {
  send({ type: 'friend_request_cancel', user });
  patch({ friendSent: get(online).friendSent.filter((name) => name !== user) });
}

export function refreshServers() {
  if (!send({ type: 'server_refresh' })) {
    patch({ error: 'Нет соединения с сервером' });
  }
}

export function submitServer(p: { name: string; address: string; game: string; desc: string }) {
  if (!send({ type: 'server_submit', name: p.name, address: p.address, game: p.game, desc: p.desc })) {
    patch({ error: 'Нет связи с сервером' });
  }
}

export function updateServer(
  id: string,
  p: { name: string; address: string; game: string; desc: string; maxPlayers?: number; added?: number },
) {
  if (
    !send({
      type: 'server_update',
      id,
      name: p.name,
      address: p.address,
      game: p.game,
      desc: p.desc,
      maxPlayers: p.maxPlayers,
      added: p.added,
    })
  ) {
    patch({ error: 'Нет связи с сервером' });
  }
}

export function requestPendingServers() {
  send({ type: 'server_pending' });
}

export function moderateServer(id: string, action: 'approve' | 'reject') {
  send({ type: 'server_moderate', id, action });
}

export function removePublicServer(id: string) {
  send({ type: 'server_remove', id });
}

export function requestOffers() {
  send({ type: 'offer_list' });
}

export function sendOffer(p: {
  to: string;
  name: string;
  address: string;
  game: string;
  note: string;
}) {
  if (!p.to) {
    patch({ error: 'Выберите друга' });
    return;
  }
  if (!send({
    type: 'offer_send',
    to: p.to,
    name: p.name.trim(),
    address: p.address.trim(),
    game: p.game.trim(),
    note: p.note.trim(),
  })) {
    patch({ error: 'Нет связи с сервером' });
  }
}

export function dismissOffer(id: string) {
  send({ type: 'offer_dismiss', id });
}

export function requestAdminData() {
  send({ type: 'admin_stats' });
  send({ type: 'admin_users' });
  send({ type: 'server_pending' });
  send({ type: 'admin_audit' });
  send({ type: 'support_all' });
  send({ type: 'complaint_list' });
  send({ type: 'admin_orders' });
}

export function submitTwofa(code: string) {
  const clean = String(code || '').replace(/\D/g, '');
  if (!clean) return;
  if (!send({ type: 'auth_2fa', code: clean })) {
    patch({ error: 'Нет связи с сервером' });
  }
}

export function resetTwofa() {
  patch({ auth2fa: false, busy: false, error: '' });
}

export function setupTotp() {
  send({ type: 'admin_2fa_setup' });
}

export function enableTotp(code: string) {
  const clean = String(code || '').replace(/\D/g, '');
  if (!send({ type: 'admin_2fa_enable', code: clean })) {
    patch({ error: 'Нет связи с сервером' });
  }
}

export function disableTotp(code: string) {
  const clean = String(code || '').replace(/\D/g, '');
  if (!send({ type: 'admin_2fa_disable', code: clean })) {
    patch({ error: 'Нет связи с сервером' });
  }
}

export function requestAudit() {
  send({ type: 'admin_audit' });
}

export function sendSupport(kind: string, text: string) {
  const clean = text.trim();
  if (!clean) {
    patch({ error: 'Введите текст' });
    return;
  }
  if (!send({ type: 'support_send', kind, text: clean })) {
    patch({ error: 'Нет связи с сервером' });
  }
}

export function requestMyTickets() {
  send({ type: 'support_my' });
}

export function requestSupportAll() {
  send({ type: 'support_all' });
}

export function replyTicket(id: string, text: string) {
  const clean = text.trim();
  if (!clean) {
    patch({ error: 'Введите текст' });
    return;
  }
  send({ type: 'support_reply', id, text: clean });
}

export function closeTicket(id: string) {
  send({ type: 'support_close', id });
}

export function sendComplaint(target: string, reason: string) {
  const clean = reason.trim();
  if (!target.trim()) {
    patch({ error: 'Укажите ник игрока' });
    return;
  }
  if (clean.length < 5) {
    patch({ error: 'Опишите жалобу подробнее (от 5 символов)' });
    return;
  }
  if (!send({ type: 'complaint_send', target: target.trim().toLowerCase(), reason: clean })) {
    patch({ error: 'Нет связи с сервером' });
  }
}

export function requestComplaints() {
  send({ type: 'complaint_list' });
}

export function resolveComplaint(id: string, action: 'ban' | 'dismiss') {
  send({ type: 'complaint_resolve', id, action });
}

export function adjustReputation(user: string, delta: number) {
  send({ type: 'rep_adjust', user, delta });
}

export function saveProfile(partial: Partial<ProfileSettings>) {
  if (!send({ type: 'profile_set', ...partial })) {
    patch({ error: 'Нет связи с сервером' });
  }
}

export function adminBan(user: string, banned: boolean) {
  if (!send({ type: 'admin_ban', user, banned })) {
    patch({ error: 'Нет связи с сервером' });
  }
}

export function adminKick(user: string) {
  if (!send({ type: 'admin_kick', user })) {
    patch({ error: 'Нет связи с сервером' });
  }
}

export function adminDeleteUser(user: string) {
  if (!send({ type: 'admin_delete', user })) {
    patch({ error: 'Нет связи с сервером' });
  }
}

export function adminSetAdmin(user: string, admin: boolean) {
  if (!send({ type: 'admin_set_admin', user, admin })) {
    patch({ error: 'Нет связи с сервером' });
  }
}

export function adminGrantCoins(user: string, amount: number) {
  if (!send({ type: 'admin_grant_coins', user, amount })) {
    patch({ error: 'Нет связи с сервером' });
  }
}

export function adminUserPatch(user: string, data: Record<string, unknown>) {
  if (!send({ type: 'admin_user_patch', user, patch: data })) {
    patch({ error: 'Нет связи с сервером' });
  }
}

export function adminServerPatch(id: string, data: Record<string, unknown>) {
  if (!send({ type: 'admin_server_patch', id, patch: data })) {
    patch({ error: 'Нет связи с сервером' });
  }
}

export function adminPromoClear() {
  if (!send({ type: 'admin_promo_clear' })) {
    patch({ error: 'Нет связи с сервером' });
  }
}
