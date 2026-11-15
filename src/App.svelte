<script lang="ts">
  import { invoke } from '@tauri-apps/api/tauri';
  import { open } from '@tauri-apps/api/dialog';
  import GameCard from './components/GameCard.svelte';
  import SearchBar from './components/SearchBar.svelte';
  import GamePreview from './components/GamePreview.svelte';
  import Icon from './components/Icon.svelte';
  import StoreLogo from './components/StoreLogo.svelte';
  import Logo from './components/Logo.svelte';
import Settings from './components/Settings.svelte';
  import AuthModal from './components/AuthModal.svelte';
  import { online, initOnline, acceptConsent, signupJust, requestProfileView, requestWalletHistory } from './lib/online';
  import { IS_DEV, UPDATE_SERVER, currentVersion, publishRelease, fetchLatest, installUpdate, isNewer } from './lib/updates';
  import Maintenance from './components/Maintenance.svelte';
  import { gate, startGate } from './lib/gate';
  import ContinueRow from './components/ContinueRow.svelte';
  import PlayPicker from './components/PlayPicker.svelte';
  import Onboarding from './components/Onboarding.svelte';
  import ProfileOnboarding from './components/ProfileOnboarding.svelte';
  import EulaGate from './components/EulaGate.svelte';
  import Wrapped from './components/Wrapped.svelte';
  import CrashNotice from './components/CrashNotice.svelte';
  import Dialog from './components/Dialog.svelte';
  import { notify, ask } from './lib/dialogs';
  import { appWindow } from '@tauri-apps/api/window';
  import { onDestroy, onMount } from 'svelte';
  import { t, pluralKey, locale } from './lib/i18n';

  import { writable, get } from 'svelte/store';

  const lazyParts = writable<Record<string, any>>({});
  function loadPart(key: string, loader: () => Promise<any>) {
    if (get(lazyParts)[key]) return;
    loader()
      .then((mod) => lazyParts.update((all) => ({ ...all, [key]: mod.default })))
      .catch(() => {});
  }

  onMount(() => {
    document.body.classList.add('shell-window');
    initOnline();
    currentVersion().then((v) => (appVer = v)).catch(() => {});

    const crash = (kind: string, message: string, details: string) => {
      invoke('log_crash', { kind, message, details }).catch(() => {});
    };
    window.addEventListener('error', (event) => {
      const err = (event as ErrorEvent).error as { stack?: string } | undefined;
      crash(
        'error',
        String(event.message || 'unknown'),
        `${event.filename || ''}:${event.lineno || 0} ${err?.stack || ''}`,
      );
    });
    window.addEventListener('unhandledrejection', (event) => {
      const reason = (event as PromiseRejectionEvent).reason as
        | { message?: string; stack?: string }
        | string
        | undefined;
      const message = typeof reason === 'string' ? reason : String(reason?.message || 'promise rejection');
      const stack = typeof reason === 'object' && reason ? String(reason.stack || '') : '';
      crash('promise', message, stack);
    });
    if (!IS_DEV) {
      startGate();
      setTimeout(() => {
        checkServerUpdate(false).catch(() => {});
      }, 5000);
    }
    syncMaximized();
    let unlisten: (() => void) | undefined;
    appWindow
      .listen('tauri://resize', () => syncMaximized())
      .then((un) => (unlisten = un))
      .catch(() => {});

    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        const input = document.getElementById('main-search') as HTMLInputElement | null;
        if (input) {
          input.focus();
          input.select();
        }
      }
    };
    window.addEventListener('keydown', onKey);

    return () => {
      unlisten?.();
      window.removeEventListener('keydown', onKey);
    };
  });

  const RESIZE_DIRS = [
    'top',
    'bottom',
    'left',
    'right',
    'top-left',
    'top-right',
    'bottom-left',
    'bottom-right',
  ] as const;

  function startResize(event: MouseEvent, direction: string) {
    if (event.button !== 0) return;
    invoke('begin_resize', { direction }).catch((e) => console.error('resize', e));
  }

  interface Game {
    id: string;
    name: string;
    platform: string;
    launch_cmd: string;
    size_bytes?: number;
    update_bytes?: number;
  }

  interface Usage {
    count: number;
    last: number;
  }

  interface Prefs {
    favorites: string[];
    usage: Record<string, Usage>;
  }

  interface Rect {
    left: number;
    top: number;
    width: number;
    height: number;
  }

  interface SteamStat {
    minutes: number;
    minutes_2wks: number;
    last_played: number;
  }

  let steamStats: Record<string, SteamStat> = {};
  let hoverGame: Game | null = null;
  let hoverRect: Rect | null = null;
  let previewOpen = false;
  let showTimer: ReturnType<typeof setTimeout> | null = null;
  let hideTimer: ReturnType<typeof setTimeout> | null = null;

  let games: Game[] = [];
  let loading = true;
  let error = '';
  let searchQuery = '';
  let searchInput = '';
  let searchTimer: ReturnType<typeof setTimeout> | null = null;

  // Поле поиска отзывается сразу, а фильтр пересобирается после паузы в наборе.
  $: if (searchInput !== searchQuery) {
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => (searchQuery = searchInput), 140);
  }
  let activeFilter = 'Все';
  let view: 'library' | 'saves' | 'settings' | 'retro' | 'servers' | 'profile' | 'admin' | 'support' | 'news' | 'players' | 'wallet' = 'library';
  $: if (view === 'profile') loadPart('profile', () => import('./components/Profile.svelte'));
  $: if (view === 'players') loadPart('players', () => import('./components/PlayersDirectory.svelte'));
  $: if (view === 'news') loadPart('news', () => import('./components/News.svelte'));
  $: if (view === 'saves') loadPart('saves', () => import('./components/SaveManager.svelte'));
  $: if (view === 'retro') loadPart('retro', () => import('./components/Lan.svelte'));
  $: if (view === 'servers') loadPart('servers', () => import('./components/ServersMonitor.svelte'));
  $: if (view === 'wallet') loadPart('wallet', () => import('./components/Wallet.svelte'));
  $: if (view === 'admin') loadPart('admin', () => import('./components/AdminPanel.svelte'));
  $: if (view === 'support') loadPart('support', () => import('./components/Support.svelte'));
  $: if (view === 'settings') loadPart('settings', () => import('./components/Settings.svelte'));

  $: spentRubles = $online.orders
    .filter((o) => o.status === 'paid' && (o.currency ?? 'rub') !== 'coins')
    .reduce((sum, o) => sum + (Number(o.amount) || 0), 0);

  function openPlayerProfile(name: string) {
    if (!$online.authed) {
      authMode = 'login';
      authOpen = true;
      return;
    }
    requestProfileView(name);
    view = 'profile';
  }
  let sortMode: 'name' | 'recent' | 'count' = 'name';
  let layout: 'grid' | 'list' = 'grid';
  let prefs: Prefs = { favorites: [], usage: {} };
  let showAddModal = false;
  let authOpen = false;
  let authMode: 'login' | 'register' = 'login';
  let showPicker = false;
  let showOnboarding = false;
  let showProfileOnboarding = false;
  let showEula = false;
  let showWrapped = false;
  let crash: { app_id: string; save_name: string | null; at: number } | null = null;
  let tvMode = false;
  let showAbout = false;
  let appMenuOpen = false;
  let publishOpen = false;
  let publishVersion = '';
  let publishNotes = '';
  let appVer = '';
  let publishBusy = false;
  let publishMsg = '';
  let devToolsOpen = false;
  let DevToolsComp: typeof import('./components/DevTools.svelte').default | null = null;
  let enableToasts = true;
  let toastText = '';
  let toastTimer: ReturnType<typeof setTimeout> | null = null;
  let newGameName = '';
  let newGamePath = '';
  let saving = false;

  $: counts = games.reduce<Record<string, number>>((acc, g) => {
    acc[g.platform] = (acc[g.platform] || 0) + 1;
    return acc;
  }, {});

  $: platforms = Object.keys(counts).sort();

  const STORES = [
    { id: 'Steam', label: 'Steam', icon: 'steam', color: '#6fc3f7', plate: 'linear-gradient(150deg, #12324a, #1f6f96)' },
    { id: 'Epic', label: 'Epic Games', icon: 'epic', color: '#dfe6f2', plate: 'linear-gradient(150deg, #23262e, #3c414d)' },
    { id: 'GOG', label: 'GOG', icon: 'gog', color: '#b478ff', plate: 'linear-gradient(150deg, #2a1a3f, #4a2a6e)' },
    { id: 'EA', label: 'EA app', icon: 'ea', color: '#ff7a6b', plate: 'linear-gradient(150deg, #3a1414, #7a2b26)' },
    { id: 'Ubisoft', label: 'Ubisoft Connect', icon: 'ubisoft', color: '#7fb3ff', plate: 'linear-gradient(150deg, #12243f, #1d4b8a)' },
    { id: 'Battle.net', label: 'Battle.net', icon: 'battlenet', color: '#6fa8ff', plate: 'linear-gradient(150deg, #101c33, #1b3f75)' },
    { id: 'Custom', label: 'Свои игры', icon: 'custom', color: '#8fd3a0', plate: 'linear-gradient(150deg, #16321f, #2c6140)' },
  ];

  function platformIcon(platform: string): string {
    const p = platform.toLowerCase();
    return ['steam', 'epic', 'gog'].includes(p) ? p : 'custom';
  }

  $: favoriteIds = new Set(prefs.favorites);
  $: favoritesCount = games.filter((g) => favoriteIds.has(g.id)).length;

  $: queryLower = searchQuery.trim().toLowerCase();

  $: filteredGames = games.filter((game) => {
    const byPlatform =
      activeFilter === 'Все'
        ? true
        : activeFilter === 'Избранное'
          ? favoriteIds.has(game.id)
          : game.platform === activeFilter;
    const byQuery = !queryLower || game.name.toLowerCase().includes(queryLower);
    return byPlatform && byQuery;
  });

  $: recentGames = games
    .filter((g) => (prefs.usage[g.id]?.last ?? 0) > 0)
    .sort((a, b) => (prefs.usage[b.id]?.last ?? 0) - (prefs.usage[a.id]?.last ?? 0))
    .slice(0, 8);

  $: crashGame = (() => {
    const id = crash?.app_id;
    if (!id) return '';
    return games.find((game) => game.id === id)?.name ?? '';
  })();

  $: visibleGames = [...filteredGames].sort((a, b) => {
    if (sortMode === 'recent') {
      const diff = (prefs.usage[b.id]?.last ?? 0) - (prefs.usage[a.id]?.last ?? 0);
      if (diff !== 0) return diff;
    } else if (sortMode === 'count') {
      const diff = (prefs.usage[b.id]?.count ?? 0) - (prefs.usage[a.id]?.count ?? 0);
      if (diff !== 0) return diff;
    }
    return a.name.localeCompare(b.name, 'ru');
  });

  async function loadGames() {
    loading = true;
    error = '';
    try {
      games = await invoke<Game[]>('get_games');
    } catch (e) {
      error = typeof e === 'string' ? e : 'Неизвестная ошибка';
      console.error(e);
    } finally {
      loading = false;
    }
  }

  async function loadPrefs() {
    try {
      prefs = await invoke<Prefs>('get_prefs');
    } catch (e) {
      console.error('Не удалось прочитать настройки', e);
    }
  }

  async function toggleFavorite(id: string) {
    try {
      const isFavorite = await invoke<boolean>('toggle_favorite', { id });
      prefs = {
        ...prefs,
        favorites: isFavorite
          ? [...prefs.favorites, id]
          : prefs.favorites.filter((f) => f !== id),
      };
    } catch (e) {
      notify(`Не удалось изменить избранное: ${e}`);
    }
  }

  async function loadStats() {
    try {
      steamStats = await invoke<Record<string, SteamStat>>('get_steam_stats');
    } catch (e) {
      console.error('Не удалось прочитать статистику Steam', e);
    }
  }

  let hidePlaytime = false;

  async function loadUiSettings() {
    try {
      const s = await invoke<{
        hide_playtime: boolean;
        onboarded: boolean;
        tv_mode: boolean;
        enable_toasts: boolean;
        eula_accepted: boolean;
      }>('settings_get');
      hidePlaytime = s.hide_playtime;
      tvMode = s.tv_mode;
      enableToasts = s.enable_toasts;
      showEula = !s.eula_accepted;
      showOnboarding = !s.onboarded;
    } catch (e) {
      console.error('Не удалось прочитать настройки', e);
    }
  }

  async function finishOnboarding() {
    showOnboarding = false;
    try {
      const s = await invoke<Record<string, unknown>>('settings_get');
      s.onboarded = true;
      await invoke('settings_save', { s });
    } catch (e) {
      console.error('Не удалось сохранить онбординг', e);
    }
  }

  async function loadCrash() {
    try {
      crash = await invoke<{ app_id: string; save_name: string | null; at: number } | null>(
        'take_crash_notice',
      );
    } catch (e) {
      console.error('Не удалось прочитать уведомление о краше', e);
    }
  }

  async function toggleTvMode() {
    tvMode = !tvMode;
    try {
      const s = await invoke<Record<string, unknown>>('settings_get');
      s.tv_mode = tvMode;
      await invoke('settings_save', { s });
    } catch (e) {
      console.error('Не удалось сохранить TV-режим', e);
    }
  }

  function moveTvFocus(key: string) {
    const cards = Array.from(document.querySelectorAll<HTMLElement>('.grid .card'));
    if (!cards.length) return;

    const current = document.activeElement as HTMLElement | null;
    const index = current ? cards.indexOf(current) : -1;
    if (index < 0) {
      cards[0].focus();
      return;
    }

    if (key === 'ArrowRight' || key === 'ArrowLeft') {
      const next = Math.min(
        cards.length - 1,
        Math.max(0, index + (key === 'ArrowRight' ? 1 : -1)),
      );
      cards[next].focus();
      return;
    }

    const rect = cards[index].getBoundingClientRect();
    let best = -1;
    let bestScore = Number.POSITIVE_INFINITY;
    cards.forEach((card, i) => {
      if (i === index) return;
      const r = card.getBoundingClientRect();
      const dy = key === 'ArrowDown' ? r.top - rect.top : rect.top - r.top;
      if (dy <= 8) return;
      const score = dy + Math.abs(r.left - rect.left) * 0.6;
      if (score < bestScore) {
        bestScore = score;
        best = i;
      }
    });
    if (best >= 0) cards[best].focus();
  }

let padRaf = 0;
  let padLast = 0;
  let padPrev: Record<string, boolean> = {};

  function startPadLoop() {
    if (!padRaf) padRaf = requestAnimationFrame(gamepadTick);
  }

  function gamepadTick(t: number) {
    const pads = navigator.getGamepads ? Array.from(navigator.getGamepads()) : [];
    const pad = pads.find((p): p is Gamepad => !!p && p.connected);
    if (!pad) {
      padRaf = 0;
      return;
    }
    if (t - padLast < 80 || !document.hasFocus()) {
      padRaf = requestAnimationFrame(gamepadTick);
      return;
    }
    padLast = t;

    const btn = (i: number) => pad.buttons[i]?.pressed ?? false;
    const ax = pad.axes[0] ?? 0;
    const ay = pad.axes[1] ?? 0;
    const state: Record<string, boolean> = {
      up: btn(12) || ay < -0.5,
      down: btn(13) || ay > 0.5,
      left: btn(14) || ax < -0.5,
      right: btn(15) || ax > 0.5,
      a: btn(0),
      b: btn(1),
    };
    const hit = (k: string) => state[k] && !padPrev[k];
    padPrev = state;

    const anyNav = hit('up') || hit('down') || hit('left') || hit('right') || hit('a') || hit('b');
    if (anyNav && !tvMode) toggleTvMode();

    if (hit('up')) moveTvFocus('ArrowUp');
    if (hit('down')) moveTvFocus('ArrowDown');
    if (hit('left')) moveTvFocus('ArrowLeft');
    if (hit('right')) moveTvFocus('ArrowRight');
    if (hit('a')) {
      const el = document.activeElement as HTMLElement | null;
      if (el && el !== document.body) el.click();
    }
    if (hit('b')) {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    }
    padRaf = requestAnimationFrame(gamepadTick);
  }

  function onCardHover(event: CustomEvent<{ game: Game; rect: Rect }>) {
    const { game, rect } = event.detail;
    if (showTimer) clearTimeout(showTimer);
    if (hideTimer) clearTimeout(hideTimer);
    hoverGame = game;
    hoverRect = rect;
    showTimer = setTimeout(() => {
      previewOpen = true;
    }, 320);
  }

  function onCardLeave() {
    if (showTimer) clearTimeout(showTimer);
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      previewOpen = false;
    }, 260);
  }

  function keepPreview() {
    if (hideTimer) clearTimeout(hideTimer);
  }

  function hidePreview() {
    previewOpen = false;
  }

  function reportError(e: unknown) {
    notify(typeof e === 'string' ? e : 'Не удалось выполнить действие');
  }

  function showToast(text: string) {
    toastText = text;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastText = '';
    }, 3200);
  }

  let seenHoliday = '';
  $: if ($online.holidayGranted && $online.holidayGranted.length && $online.holidayGranted.map((h) => h.id).join(',') !== seenHoliday) {
    seenHoliday = $online.holidayGranted.map((h) => h.id).join(',');
    const first = $online.holidayGranted[0];
    showToast(`Получен праздничный койн: ${first.name} ${first.symbol}`);
    if (enableToasts && Notification && typeof Notification === 'function') {
      try {
        new Notification('Праздничный койн', { body: `Ты получил «${first.name}» ${first.symbol}` });
      } catch {}
    }
  }

  function runMenu(id: string) {
    appMenuOpen = false;
    onMenuAction(new CustomEvent('action', { detail: id }));
  }

  let isMaximized = false;

  async function syncMaximized() {
    try {
      isMaximized = await appWindow.isMaximized();
    } catch {}
  }

  async function minimizeWindow() {
    try {
      await appWindow.minimize();
    } catch (e) {
      console.error(e);
    }
  }

  async function toggleMaximizeWindow() {
    try {
      await appWindow.toggleMaximize();
      await syncMaximized();
    } catch (e) {
      console.error(e);
    }
  }

  async function closeWindow() {
    try {
      await appWindow.close();
    } catch (e) {
      console.error(e);
    }
  }

  function onMenuAction(event: CustomEvent<string>) {
    switch (event.detail) {
      case 'open-steam':
        invoke('open_steam', { url: 'steam://open/main' }).catch(reportError);
        break;
      case 'open-friends':
      case 'open-friends-2':
        invoke('open_steam', { url: 'steam://friends/' }).catch(reportError);
        break;
      case 'open-profile':
      case 'open-profile-2':
        invoke('open_steam', { url: 'steam://url/SteamIDMyProfile' }).catch(reportError);
        break;
      case 'palette':
        invoke('palette_open').catch(reportError);
        break;
      case 'rescan':
      case 'rescan-2':
        loadGames();
        loadStats();
        break;
      case 'data-folder':
      case 'data-folder-2':
        invoke('open_data_dir').catch(reportError);
        break;
      case 'quit':
        invoke('quit_app');
        break;
      case 'sort-name':
        sortMode = 'name';
        break;
      case 'sort-recent':
        sortMode = 'recent';
        break;
      case 'sort-count':
        sortMode = 'count';
        break;
      case 'add-game':
        showAddModal = true;
        break;
      case 'tv':
        toggleTvMode();
        break;
      case 'show-all':
        activeFilter = 'Все';
        break;
      case 'show-favorites':
        activeFilter = 'Избранное';
        break;
      case 'about':
        showAbout = true;
        break;
      case 'check-update':
        checkServerUpdate(true);
        break;
      case 'publish':
        openPublish();
        break;
      case 'dev-tools':
        if (DevToolsComp) {
          devToolsOpen = true;
        } else {
          import('./components/DevTools.svelte')
            .then((mod) => {
              DevToolsComp = mod.default;
              devToolsOpen = true;
            })
            .catch(() => {});
        }
        break;
    }
  }

  async function chooseExe() {
    const selected = await open({
      multiple: false,
      filters: [{ name: 'Игры', extensions: ['exe', 'lnk'] }],
    });
    if (selected && typeof selected === 'string') {
      newGamePath = selected;
      if (!newGameName) {
        const parts = selected.split(/[\\/]/);
        const filename = parts[parts.length - 1];
        newGameName = filename.replace(/\.(exe|lnk)$/i, '');
      }
    }
  }

  function bumpPatch(version: string) {
    const parts = String(version).split('.').map((x) => parseInt(x, 10) || 0);
    while (parts.length < 3) parts.push(0);
    parts[2] += 1;
    return parts.slice(0, 3).join('.');
  }

  async function openPublish() {
    publishOpen = true;
    publishBusy = false;
    publishMsg = '';
    publishNotes = '';
    publishVersion = bumpPatch(await currentVersion());
  }

  async function doPublish() {
    const server = $online.server;
    const token = $online.token;
    if (!server || !token) {
      publishMsg = 'Сначала войдите в онлайн под админом';
      return;
    }
    if (!/^\d+\.\d+\.\d+$/.test(publishVersion.trim())) {
      publishMsg = 'Версия в формате 1.0.1';
      return;
    }
    publishBusy = true;
    publishMsg = 'Собираю и выкладываю…';
    try {
      await publishRelease(server, token, publishVersion.trim(), publishNotes.trim());
      publishMsg = 'Опубликовано: ' + publishVersion.trim();
    } catch (e) {
      publishMsg = 'Ошибка: ' + String(e);
    } finally {
      publishBusy = false;
    }
  }

  async function checkServerUpdate(manual: boolean) {
    const server = ($online.server || UPDATE_SERVER).trim();
    if (!server) {
      if (manual) notify('Не указан адрес сервера онлайна');
      return;
    }
    console.log('[update] server', server);
    const [meta, current] = await Promise.all([fetchLatest(server), currentVersion()]);
    console.log('[update] latest', meta && meta.version, 'current', current);
    if (!meta) {
      if (manual) notify('Обновлений нет');
      return;
    }
    if (!isNewer(meta.version, current)) {
      if (manual) notify('Установлена последняя версия ' + current);
      return;
    }
    if (manual) notify('Обновляюсь до ' + meta.version + '…');
    try {
      await installUpdate(server, meta);
    } catch (e) {
      console.log('[update] failed', String(e));
      notify('Не удалось обновиться: ' + String(e));
    }
  }

  async function addCustomGame() {
    if (!newGameName || !newGamePath) {
      notify('Заполни название и путь к игре!');
      return;
    }
    saving = true;
    try {
      await invoke('add_custom_game', { name: newGameName, path: newGamePath });
      newGameName = '';
      newGamePath = '';
      showAddModal = false;
      await loadGames();
      activeFilter = 'Все';
    } catch (e) {
      notify(`Ошибка: ${e}`);
    } finally {
      saving = false;
    }
  }

  function closeModal() {
    if (!saving) showAddModal = false;
  }

  function onGlobalKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') appMenuOpen = false;
    const tag = (e.target as HTMLElement | null)?.tagName ?? '';
    if (
      tvMode &&
      e.key.startsWith('Arrow') &&
      tag !== 'INPUT' &&
      tag !== 'TEXTAREA' &&
      tag !== 'SELECT'
    ) {
      e.preventDefault();
      moveTvFocus(e.key);
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      invoke('palette_open').catch(reportError);
    }
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'l') {
      e.preventDefault();
      toggleLayout();
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
      const tag = document.activeElement?.tagName;
      if (tag !== 'INPUT' && tag !== 'TEXTAREA') {
        e.preventDefault();
        document.getElementById('main-search')?.focus();
      }
    }
  }

  function toggleLayout() {
    layout = layout === 'grid' ? 'list' : 'grid';
    try {
      localStorage.setItem('glLayout', layout);
    } catch (e) {
      /* ignore */
    }
  }

  loadGames();
  loadPrefs();
  loadUiSettings();
  loadCrash();
  const idle = (window as unknown as { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => void })
    .requestIdleCallback;
  if (typeof idle === 'function') idle(() => loadStats(), { timeout: 2500 });
  else setTimeout(() => loadStats(), 800);
  try {
    layout = localStorage.getItem('glLayout') === 'list' ? 'list' : 'grid';
  } catch (e) {
    /* ignore */
  }

const onPadConnected = () => startPadLoop();
  window.addEventListener('gamepadconnected', onPadConnected);
  window.addEventListener('gamepaddisconnected', onPadConnected);
  startPadLoop();
  const onLaunchedToast = (e: Event) => {
    const detail = (e as CustomEvent<{ name: string }>).detail;
    if (enableToasts && detail?.name) showToast(`Запущена игра: ${detail.name}`);
  };
  window.addEventListener('launcher:launch', onLaunchedToast);
  onDestroy(() => {
    if (padRaf) cancelAnimationFrame(padRaf);
    window.removeEventListener('gamepadconnected', onPadConnected);
    window.removeEventListener('gamepaddisconnected', onPadConnected);
    window.removeEventListener('launcher:launch', onLaunchedToast);
  });
</script>

<svelte:window
  on:click={() => (appMenuOpen = false)}
  on:keydown={onGlobalKeydown}
  on:contextmenu={(e) => e.preventDefault()}
/>

{#if !IS_DEV && $gate.phase !== 'online'}
  <Maintenance />
{/if}

<div class="app" class:tv={tvMode} class:layout-list={layout === 'list'}>
  <div class="resize-layer" aria-hidden="true">
    {#each RESIZE_DIRS as dir (dir)}
      <div class="rz rz-{dir}" on:mousedown|preventDefault={(e) => startResize(e, dir)}></div>
    {/each}
  </div>
  <Dialog />
  <header class="titlebar" role="group" aria-label="Строка заголовка" on:dblclick={toggleMaximizeWindow}>
    <div class="tb-left">
      <div class="tb-menu">
        <button
          class="tb-logo"
          title={$t('win.menu')}
          aria-label="Меню"
          on:click|stopPropagation={() => (appMenuOpen = !appMenuOpen)}
        >
          <Logo size={15} />
        </button>

        {#if appMenuOpen}
          <div class="app-menu-list" role="menu" tabindex="-1" on:click|stopPropagation on:keydown={() => {}}>
            <button class="menu-entry" role="menuitem" on:click={() => runMenu('palette')}>
              {$t('menu.palette')}
            </button>
            <div class="menu-sep"></div>
            <button class="menu-entry" role="menuitem" on:click={() => runMenu('rescan')}>
              {$t('menu.refresh')}
            </button>
            <button class="menu-entry" role="menuitem" on:click={() => runMenu('add-game')}>
              {$t('menu.add')}
            </button>
            <button class="menu-entry" role="menuitem" on:click={() => runMenu('tv')}>
              {$t('menu.tv')} {tvMode ? '✓' : ''}
            </button>
            <div class="menu-sep"></div>
            <button class="menu-entry" role="menuitem" on:click={() => runMenu('data-folder')}>
              {$t('menu.data')}
            </button>
            <button class="menu-entry" role="menuitem" on:click={() => runMenu('check-update')}>
              Проверить обновления
            </button>
            {#if IS_DEV}
              <button class="menu-entry" role="menuitem" on:click={() => runMenu('publish')}>
                Выкатить обновление
              </button>
              <button class="menu-entry" role="menuitem" on:click={() => runMenu('dev-tools')}>
                Инструменты разработчика
              </button>
            {/if}
            <button class="menu-entry" role="menuitem" on:click={() => runMenu('about')}>
              {$t('menu.about')}
            </button>
            <div class="menu-sep"></div>
            <button class="menu-entry danger" role="menuitem" on:click={() => runMenu('quit')}>
              {$t('menu.quit')}
            </button>
          </div>
        {/if}
      </div>

      <span class="tb-title" data-tauri-drag-region>Game Launcher</span>
      <div class="tb-drag" data-tauri-drag-region></div>
    </div>

    <div class="tb-buttons">
      <button
        class="tb-btn"
        title={$t('win.curtain')}
        aria-label="Шторка"
        on:click={() => invoke('curtain_open').catch(reportError)}
      >
        <Icon name="curtain" size={14} />
      </button>
      <button class="tb-btn" title={$t('win.minimize')} aria-label={$t('win.minimize')} on:click={minimizeWindow}>
        <Icon name="minimize" size={14} />
      </button>
      <button
        class="tb-btn"
        title={isMaximized ? 'Восстановить' : $t('win.maximize')}
        aria-label={isMaximized ? 'Восстановить' : $t('win.maximize')}
        on:click={toggleMaximizeWindow}
      >
        <Icon name={isMaximized ? 'restore' : 'maximize'} size={13} />
      </button>
      <button class="tb-btn close" title={$t('win.close')} aria-label={$t('win.close')} on:click={closeWindow}>
        <Icon name="close" size={14} />
      </button>
    </div>
  </header>

  <div class="shell">
  <aside class="rail">
    <div class="brand">
      <span class="glyph" aria-hidden="true">
        <Logo size={19} />
      </span>
      <div class="brand-text">
        <strong>{$t('brand.title')}</strong>
        <small>{$t('brand.sub')}</small>
      </div>
    </div>

    <nav class="nav">
      <button
        class="nav-item"
        class:active={view === 'library' && activeFilter === 'Все'}
        title={$t('nav.all')}
        on:click={() => { view = 'library'; activeFilter = 'Все'; }}
      >
        <span class="nav-icon"><Icon name="library" /></span>
        <span class="label">{$t('nav.all')}</span>
        <span class="count">{games.length}</span>
      </button>

      <button
        class="nav-item"
        class:active={view === 'library' && activeFilter === 'Избранное'}
        title={$t('nav.favorites')}
        on:click={() => { view = 'library'; activeFilter = 'Избранное'; }}
      >
        <span class="nav-icon"><Icon name="star" /></span>
        <span class="label">{$t('nav.favorites')}</span>
        <span class="count">{favoritesCount}</span>
      </button>

      <p class="nav-label">{$t('nav.library')}</p>
      <button
        class="nav-item"
        class:active={view === 'library' && activeFilter === 'Custom'}
        title="Только игры, добавленные вручную"
        on:click={() => { view = 'library'; activeFilter = 'Custom'; }}
      >
        <span class="nav-icon"><Icon name="custom" /></span>
        <span class="label">Свои игры</span>
        <span class="count">{counts['Custom'] || 0}</span>
      </button>

      <button
        class="nav-item nav-add"
        title="Добавить свою игру"
        on:click={() => (showAddModal = true)}
      >
        <span class="nav-icon"><Icon name="plus" size={16} /></span>
        <span class="label">Добавить игру</span>
      </button>

      <p class="nav-label">Магазины</p>
      <div class="store-strip">
        {#each STORES.filter((store) => store.id !== 'Custom') as store (store.id)}
          <button
            class="store"
            class:active={view === 'library' && activeFilter === store.id}
            class:empty={!counts[store.id]}
            title="{store.label} · {counts[store.id] || 0} {(counts[store.id] || 0) === 1 ? 'игра' : 'игр'}"
            style="--plate: {store.plate}; --store: {store.color}"
            on:click={() => { view = 'library'; activeFilter = store.id; }}
          >
            <span class="store-plate">
              <StoreLogo id={store.id} size={20} />
              {#if counts[store.id]}<span class="store-badge">{counts[store.id]}</span>{/if}
            </span>
          </button>
        {/each}
      </div>

      <div class="nav-sep"></div>

      <button
        class="nav-item"
        class:active={view === 'retro'}
        title="Классика и сети"
        on:click={() => { view = 'retro'; }}
      >
        <span class="nav-icon"><Icon name="gamepad" /></span>
        <span class="label">Классика и сети</span>
      </button>

      <button
        class="nav-item"
        class:active={view === 'servers'}
        title="Ваши серверы"
        on:click={() => { view = 'servers'; }}
      >
        <span class="nav-icon"><Icon name="server" /></span>
        <span class="label">Ваши серверы</span>
      </button>

      <button
        class="nav-item"
        class:active={view === 'wallet'}
        title="Кошелёк"
        on:click={() => { view = 'wallet'; requestWalletHistory(); }}
      >
        <span class="nav-icon"><Icon name="wallet" /></span>
        <span class="label">Кошелёк</span>
        <span class="nav-bal">
          <span class="nb-item" aria-label="Монеты"><i class="coin-ic coin-ic-coins" aria-hidden="true"></i>{$online.authed ? $online.coins : '—'}</span>
          <span class="nb-item" aria-label="Рубли"><i class="coin-ic coin-ic-rub" aria-hidden="true">₽</i>{$online.authed ? spentRubles : 0}</span>
        </span>
      </button>
    </nav>

    <div class="rail-foot">
      <button class="ghost-btn" on:click={loadGames} disabled={loading}>
        {loading ? $t('rail.scanning') : $t('rail.refresh')}
      </button>
      <p class="hint">{$t('rail.platforms')}</p>
    </div>

    <div class="nav-sep rail-sep-bottom"></div>
    <nav class="nav">
      <button
        class="nav-item"
        class:active={view === 'profile'}
        title="Мой профиль"
        on:click={() => { view = 'profile'; }}
      >
        <span class="nav-icon"><Icon name="user" /></span>
        <span class="label">Мой профиль</span>
        {#if $online.offers.length > 0}
          <span class="count">{$online.offers.length}</span>
        {/if}
      </button>

      <button
        class="nav-item"
        class:active={view === 'players'}
        title="Все игроки"
        on:click={() => { view = 'players'; }}
      >
        <span class="nav-icon"><Icon name="users" /></span>
        <span class="label">Все игроки</span>
      </button>

      <button
        class="nav-item"
        class:active={view === 'news'}
        title="Новости"
        on:click={() => { view = 'news'; }}
      >
        <span class="nav-icon"><Icon name="bell" /></span>
        <span class="label">Новости</span>
      </button>

      <button
        class="nav-item"
        class:active={view === 'support'}
        title="Поддержка"
        on:click={() => { view = 'support'; }}
      >
        <span class="nav-icon"><Icon name="support" /></span>
        <span class="label">Поддержка</span>
      </button>

      {#if $online.isAdmin}
        <button
          class="nav-item"
          class:active={view === 'admin'}
          title="Администрирование"
          on:click={() => { view = 'admin'; }}
        >
          <span class="nav-icon"><Icon name="shield" /></span>
          <span class="label">Администрирование</span>
        </button>
      {/if}

      <button
        class="nav-item"
        class:active={view === 'saves'}
        title={$t('nav.saves')}
        on:click={() => { view = 'saves'; }}
      >
        <span class="nav-icon"><Icon name="save" /></span>
        <span class="label">{$t('nav.saves')}</span>
      </button>

      <button
        class="nav-item"
        class:active={view === 'settings'}
        title={$t('nav.settings')}
        on:click={() => { view = 'settings'; }}
      >
        <span class="nav-icon"><Icon name="settings" /></span>
        <span class="label">{$t('nav.settings')}</span>
      </button>
    </nav>
  </aside>

  <section class="workspace">
    {#if view === 'library'}
      <header class="bar">
        <div class="bar-title">
          <h1>{activeFilter === 'Все' ? $t('nav.all') : activeFilter === 'Избранное' ? $t('nav.favorites') : (STORES.find((store) => store.id === activeFilter)?.label ?? activeFilter)}</h1>
          <span class="bar-sub">{$t('bar.inList', { n: visibleGames.length })}</span>
        </div>
        <SearchBar inputId="main-search" shortcut="Ctrl K" bind:value={searchInput} />
        <label class="sort">
          <span class="sort-label">{$t('bar.sort')}</span>
          <select bind:value={sortMode} aria-label={$t('bar.sort')}>
            <option value="name">{$t('sort.name')}</option>
            <option value="recent">{$t('sort.recent')}</option>
            <option value="count">{$t('sort.count')}</option>
          </select>
        </label>
        <button
          class="icon-btn layout-toggle"
          title={layout === 'grid' ? 'Список (Ctrl+Shift+L)' : 'Сетка (Ctrl+Shift+L)'}
          on:click={toggleLayout}
        >
          {layout === 'grid' ? '☰' : '▦'}
        </button>
      </header>
      <p class="bar-hint">
        {#if activeFilter === 'Избранное'}
          {$t('bar.hintFav')}
        {:else if activeFilter === 'Custom'}
          Игры, добавленные вручную: ярлык или exe. Игры магазинов — в разделе «Магазины».
        {:else if activeFilter !== 'Все'}
          {$t('bar.hintPlatform')}
        {:else}
          {$t('bar.hint')}
        {/if}
      </p>
      <div class="lib-chips">
        <button
          class="cat"
          class:active={activeFilter === 'Все'}
          on:click={() => { activeFilter = 'Все'; }}
        >
          {$t('nav.all')}<span class="cat-count">{games.length}</span>
        </button>
        <button
          class="cat"
          class:active={activeFilter === 'Избранное'}
          on:click={() => { activeFilter = 'Избранное'; }}
        >
          {$t('nav.favorites')}<span class="cat-count">{favoritesCount}</span>
        </button>
        {#each STORES.filter((store) => counts[store.id] && store.id !== 'Custom') as store (store.id)}
          <button
            class="cat"
            class:active={activeFilter === store.id}
            title={store.label}
            on:click={() => { activeFilter = store.id; }}
          >
            <span class="cat-ic" style="color: {store.color}"><StoreLogo id={store.id} size={14} /></span>
            {store.label}<span class="cat-count">{counts[store.id]}</span>
          </button>
        {/each}
      </div>
    {/if}

    {#if view === 'settings'}
      <header class="bar">
        <div class="bar-title">
          <h1>{$t('settings.title')}</h1>
          <span class="bar-sub">{$t('settings.sub')}</span>
        </div>
      </header>
    {/if}

    <div class="content">
      {#if $online.authed && $online.consentVersion && $online.consent !== $online.consentVersion}
        <div class="consent-banner">
          <span>
            Опубликована новая редакция документов ({$online.consentVersion}). Чтобы продолжить,
            примите условия.
          </span>
          <div class="consent-actions">
            <button class="ghost-btn" on:click={() => (view = 'support')}>Документы</button>
            <button class="primary" on:click={acceptConsent}>Принять</button>
          </div>
        </div>
      {/if}
      {#if view === 'profile'}
        {#if $lazyParts.profile}
          <svelte:component
            this={$lazyParts.profile}
            gamesCount={games.length}
            games={games}
            onOpenAuth={(mode) => { authMode = mode; authOpen = true; }}
            onOpenServers={() => { view = 'servers'; }}
            onOpenPlayers={() => { view = 'players'; }}
          />
        {:else}
          <div class="state"><span class="spinner"></span></div>
        {/if}
      {:else if view === 'players'}
        {#if $lazyParts.players}<svelte:component this={$lazyParts.players} onOpenProfile={openPlayerProfile} />{/if}
      {:else if view === 'news'}
        {#if $lazyParts.news}<svelte:component this={$lazyParts.news} onOpenAuth={(mode) => { authMode = mode; authOpen = true; }} />{/if}
      {:else if view === 'saves'}
        {#if $lazyParts.saves}<svelte:component this={$lazyParts.saves} {games} />{/if}
      {:else if view === 'retro'}
        {#if $lazyParts.retro}<svelte:component this={$lazyParts.retro} games={games} usage={prefs.usage} on:launched={loadPrefs} />{/if}
      {:else if view === 'servers'}
        {#if $lazyParts.servers}<svelte:component this={$lazyParts.servers} />{/if}
      {:else if view === 'wallet'}
        {#if $lazyParts.wallet}<svelte:component this={$lazyParts.wallet} onNeedAuth={(mode) => { authMode = mode; authOpen = true; }} />{/if}
      {:else if view === 'admin'}
        {#if $lazyParts.admin}<svelte:component this={$lazyParts.admin} onOpenSupport={() => { view = 'support'; }} />{/if}
      {:else if view === 'support'}
        {#if $lazyParts.support}<svelte:component this={$lazyParts.support} onOpenAuth={(mode) => { authMode = mode; authOpen = true; }} />{/if}
      {:else if view === 'settings'}
        {#if $lazyParts.settings}<svelte:component this={$lazyParts.settings} {games} />{/if}
      {:else if loading}
        <div class="state">
          <span class="spinner"></span>
          <p>{$t('state.scanning')}</p>
        </div>
      {:else if error}
        <div class="state">
          <h2>{$t('state.scanFailed')}</h2>
          <p class="mono">{error}</p>
          <button class="primary" on:click={loadGames}>{$t('state.retry')}</button>
        </div>
      {:else if games.length === 0}
        <div class="state">
          <h2>{$t('state.empty')}</h2>
          <p>{$t('state.emptyHint')}</p>
        <button class="ghost-btn" on:click={() => (showPicker = true)}>{$t('pick.open')}</button>
        <button class="ghost-btn" on:click={() => (showWrapped = true)}>{$t('wrap.open')}</button>
        <button class="primary" on:click={() => (showAddModal = true)}>{$t('bar.add')}</button>
        </div>
      {:else if visibleGames.length === 0}
        <div class="state">
          <h2>
            {activeFilter === 'Избранное'
              ? $t('state.noFavorites')
              : activeFilter === 'Custom'
                ? 'Своих игр пока нет'
                : STORES.some((store) => store.id === activeFilter)
                  ? `Игр из «${STORES.find((store) => store.id === activeFilter)?.label}» нет`
                  : $t('state.nothing')}
          </h2>
          <p>
            {activeFilter === 'Избранное'
              ? $t('state.noFavoritesHint')
              : activeFilter === 'Custom'
                ? 'Нажмите «Добавить игру» в правом верхнем углу и выберите ярлык или exe — игра появится здесь.'
                : STORES.some((store) => store.id === activeFilter)
                  ? 'Лаунчер не нашёл игр этого магазина. Проверьте, что он установлен, и обновите список.'
                  : $t('state.nothingHint')}
          </p>
          <button class="ghost-btn" on:click={() => { searchQuery = ''; searchInput = ''; activeFilter = 'Все'; }}>
            {$t('state.reset')}
          </button>
        </div>
      {:else}
        {#if recentGames.length > 0 && activeFilter === 'Все' && !searchQuery.trim()}
          <ContinueRow games={recentGames} usage={prefs.usage} on:launched={loadPrefs} />
        {/if}
        <div class="grid">
          {#each visibleGames as game (game.id)}
            <GameCard
              {game}
              layout={layout}
              favorite={favoriteIds.has(game.id)}
              on:removed={loadGames}
              on:favorite={(e) => toggleFavorite(e.detail)}
              on:launched={loadPrefs}
              on:hover={onCardHover}
              on:leave={onCardLeave}
            />
          {/each}
        </div>
      {/if}
    </div>

    {#if view === 'library'}
      <footer class="status">
        <span>
          {games.length} {$t(pluralKey($locale, games.length, 'status.games'))} ·
          {platforms.length} {$t(pluralKey($locale, platforms.length, 'status.platforms'))} ·
          {$t('status.fav', { n: favoritesCount })}
        </span>
        <span class="ver">Game Launcher {appVer}</span>
      </footer>
    {/if}
  </section>
  </div>

</div>

{#if toastText}
  <div class="app-toast" role="status">{toastText}</div>
{/if}

{#if previewOpen && hoverGame && hoverRect}
  <GamePreview
    game={hoverGame}
    rect={hoverRect}
    favorite={favoriteIds.has(hoverGame.id)}
    stat={steamStats[hoverGame.id]}
    launches={prefs.usage[hoverGame.id]?.count ?? 0}
    lastLaunched={prefs.usage[hoverGame.id]?.last ?? 0}
    hidePlaytime={hidePlaytime}
    on:keep={keepPreview}
    on:hide={hidePreview}
  />
{/if}

{#if devToolsOpen && IS_DEV && DevToolsComp}
  <svelte:component this={DevToolsComp} onClose={() => (devToolsOpen = false)} />
{/if}

{#if publishOpen}
    <div class="pub-backdrop" role="presentation" on:click={() => (publishOpen = false)} on:keydown={() => {}}></div>
    <div class="pub-modal" role="dialog" aria-modal="true" aria-label="Выкатить обновление">
      <h3>Выкатить обновление</h3>
      <p class="pub-hint">Соберётся версия из текущей сборки и уйдёт на сервер. Пользователи получат её автоматически.</p>
      <label class="pub-field">
        <span>Версия</span>
        <input bind:value={publishVersion} placeholder="1.0.1" spellcheck="false" />
      </label>
      <label class="pub-field">
        <span>Что нового</span>
        <textarea bind:value={publishNotes} rows="3" placeholder="Коротко о изменениях"></textarea>
      </label>
      {#if publishMsg}<span class="pub-msg">{publishMsg}</span>{/if}
      <div class="pub-actions">
        <button class="ghost" on:click={() => (publishOpen = false)}>Закрыть</button>
        <button class="primary" disabled={publishBusy} on:click={doPublish}>
          {publishBusy ? 'Публикую…' : 'Выкатить'}
        </button>
      </div>
    </div>
  {/if}

{#if showAbout}
  <div class="overlay" role="presentation" on:click={() => (showAbout = false)} on:keydown={() => {}}>
    <div class="modal about" role="presentation" on:click|stopPropagation on:keydown={() => {}}>
      <header class="modal-head">
        <h2>О программе</h2>
        <button class="icon-btn" on:click={() => (showAbout = false)} aria-label="Закрыть">×</button>
      </header>
      <div class="modal-body">
        <p class="about-name">Game Launcher <span>{appVer}</span></p>
        <p class="about-text">
          Собирает установленные игры из Steam, Epic и GOG, показывает обложки,
          статистику и позволяет добавлять свои игры.
        </p>
        <p class="about-text">
          Данные Steam читаются локально: наигранное время, время за две недели
          и дата последнего запуска.
        </p>
      </div>
      <footer class="modal-foot">
        <button class="primary" on:click={() => (showAbout = false)}>Закрыть</button>
      </footer>
    </div>
  </div>
{/if}

{#if crash}
  <CrashNotice notice={crash} gameName={crashGame} on:close={() => (crash = null)} />
{/if}

{#if showWrapped}
  <Wrapped {games} usage={prefs.usage} on:close={() => (showWrapped = false)} />
{/if}

{#if showEula}
  <EulaGate onAccepted={() => (showEula = false)} />
{/if}

{#if showOnboarding}
  <Onboarding gamesCount={games.length} on:close={finishOnboarding} />
{/if}

{#if showProfileOnboarding}
  <ProfileOnboarding on:close={() => (showProfileOnboarding = false)} />
{/if}

{#if showPicker}
  <PlayPicker
    {games}
    usage={prefs.usage}
    favorites={prefs.favorites}
    on:launched={loadPrefs}
    on:close={() => (showPicker = false)}
  />
{/if}

{#if showAddModal}
  <div class="overlay" role="presentation" on:click={closeModal} on:keydown={() => {}}>
    <div class="modal" role="presentation" on:click|stopPropagation on:keydown={() => {}}>
      <header class="modal-head">
        <h2>Добавить игру</h2>
        <button class="icon-btn" on:click={closeModal} aria-label="Закрыть">×</button>
      </header>

      <div class="modal-body">
        <label class="field">
          <span>Название</span>
          <input type="text" placeholder="Например, Cyberpunk 2077" bind:value={newGameName} />
        </label>

        <label class="field">
          <span>Файл запуска</span>
          <div class="row">
            <input type="text" placeholder="C:\Games\game.exe" bind:value={newGamePath} readonly />
            <button class="ghost-btn" on:click={chooseExe}>Выбрать</button>
          </div>
        </label>
      </div>

      <footer class="modal-foot">
        <button class="ghost-btn" on:click={closeModal}>Отмена</button>
        <button class="primary" on:click={addCustomGame} disabled={saving}>
          {saving ? 'Сохраняю…' : 'Добавить'}
        </button>
      </footer>
    </div>
  </div>
{/if}

{#if authOpen}
  <AuthModal
    initialMode={authMode}
    on:close={() => {
      authOpen = false;
      if ($signupJust) {
        showProfileOnboarding = true;
        signupJust.set(false);
      }
    }}
  />
{/if}

<style>
  .app {
    position: relative;
    display: flex;
    flex-direction: column;
    height: 100vh;
    margin: 0;
    box-sizing: border-box;
    overflow: hidden;
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(15, 19, 27, 0.98);
    box-shadow: none;
  }

  /* ---------- Ручки изменения размера окна ---------- */
  .resize-layer {
    position: absolute;
    inset: 0;
    z-index: 1200;
    pointer-events: none;
  }
  .rz { position: absolute; pointer-events: auto; }
  .rz-top { top: 0; left: 12px; right: 12px; height: 6px; cursor: ns-resize; }
  .rz-bottom { bottom: 0; left: 12px; right: 12px; height: 6px; cursor: ns-resize; }
  .rz-left { left: 0; top: 12px; bottom: 12px; width: 6px; cursor: ew-resize; }
  .rz-right { right: 0; top: 12px; bottom: 12px; width: 6px; cursor: ew-resize; }
  .rz-top-left { top: 0; left: 0; width: 14px; height: 14px; cursor: nwse-resize; }
  .rz-top-right { top: 0; right: 0; width: 14px; height: 14px; cursor: nesw-resize; }
  .rz-bottom-left { bottom: 0; left: 0; width: 14px; height: 14px; cursor: nesw-resize; }
  .rz-bottom-right { bottom: 0; right: 0; width: 14px; height: 14px; cursor: nwse-resize; }

  .titlebar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 36px;
    flex: none;
    background: var(--bg);
    border-bottom: 1px solid var(--line-soft);
    user-select: none;
    -webkit-user-select: none;
  }
  .tb-left {
    display: flex;
    align-items: center;
    gap: 10px;
    flex: 1;
    height: 100%;
    padding-left: 12px;
  }
  .tb-menu { position: relative; display: flex; }
  .tb-logo {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    padding: 0;
    background: transparent;
    border: none;
    border-radius: 5px;
    color: var(--accent);
    cursor: pointer;
    transition: background 0.12s ease;
  }
  .tb-logo:hover { background: var(--hover-2); }
  .tb-title {
    font-size: 12px;
    color: var(--muted);
    letter-spacing: 0.3px;
  }
  .tb-drag {
    flex: 1;
    height: 100%;
  }
  .tb-buttons { display: flex; align-items: center; height: 100%; gap: 2px; padding: 0 4px; }
  .tb-btn {
    width: 46px;
    height: calc(100% - 10px);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 7px;
    color: rgba(196, 208, 226, 0.78);
    line-height: 1;
    cursor: pointer;
    transition: background 0.12s ease, color 0.12s ease, border-color 0.12s ease;
  }
  .tb-btn svg { pointer-events: none; }
  .tb-btn:hover { background: rgba(255, 255, 255, 0.08); color: #fff; }
  .tb-btn:active { background: rgba(255, 255, 255, 0.14); }
  .tb-btn:focus-visible { outline: 1px solid rgba(110, 168, 255, 0.8); outline-offset: 1px; }
  .tb-btn.close { color: rgba(210, 218, 232, 0.82); }
  .tb-btn.close:hover { background: #c42b1c; color: #fff; border-color: rgba(255, 255, 255, 0.12); }
  .tb-btn.close:active { background: #a12417; }

  .shell {
    flex: 1;
    min-height: 0;
    display: flex;
    background: var(--bg);
  }

  /* ---------- Боковая панель ---------- */
  .rail {
    width: 232px;
    flex: none;
    display: flex;
    flex-direction: column;
    padding: 16px 12px 12px;
    background: var(--bg-soft);
    border-right: 1px solid var(--line-soft);
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
    scrollbar-width: thin;
    scrollbar-color: rgba(255, 255, 255, 0.16) transparent;
  }
  .rail::-webkit-scrollbar { width: 8px; }
  .rail::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.14); border-radius: 999px; }
  .rail::-webkit-scrollbar-thumb:hover { background: rgba(255, 255, 255, 0.24); }
  .rail::-webkit-scrollbar-track { background: transparent; }
  .brand, .nav, .rail-foot, .store-strip { flex: none; }
  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 4px 14px;
  }
  .glyph {
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-sm);
    background: linear-gradient(145deg, var(--accent), #3f6fd6);
    box-shadow: 0 8px 20px rgba(138, 180, 255, 0.26);
    color: var(--ink-on-accent);
    flex: none;
  }
  .brand-text strong {
    display: block;
    font-size: var(--fs-lg);
    font-weight: 700;
    letter-spacing: 0.2px;
  }
  .brand-text small {
    display: block;
    margin-top: 3px;
    font-size: var(--fs-xs);
    color: var(--muted-2);
  }

  .nav { display: flex; flex-direction: column; gap: 2px; }
  .nav-sep { height: 1px; margin: 10px 6px; background: var(--line-soft); }
  .nav-label {
    margin-top: 10px;
    padding: 12px 8px 5px;
    border-top: 1px solid var(--line-soft);
    font-size: var(--fs-2xs);
    font-weight: 700;
    letter-spacing: 1.1px;
    text-transform: uppercase;
    color: var(--muted-2);
  }
  .nav-item {
    position: relative;
    display: flex;
    align-items: center;
    gap: 10px;
    height: 34px;
    padding: 0 10px;
    background: transparent;
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    color: var(--muted);
    font-size: 13px;
    cursor: pointer;
    text-align: left;
    transition: background var(--dur) var(--ease), color var(--dur) var(--ease),
      border-color var(--dur) var(--ease);
  }
  .nav-item:hover { background: var(--hover); color: var(--text); }
  .nav-item.active {
    background: rgba(138, 180, 255, 0.12);
    border-color: transparent;
    color: var(--text);
    font-weight: 600;
  }
  .nav-item.active::before {
    content: "";
    position: absolute;
    left: 0;
    top: 8px;
    bottom: 8px;
    width: 2px;
    border-radius: 2px;
    background: var(--accent);
  }
  .nav-item .label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .nav-item .count {
    font-size: var(--fs-2xs);
    font-variant-numeric: tabular-nums;
    color: var(--muted-2);
    background: transparent;
    padding: 1px 4px;
    min-width: 18px;
    text-align: right;
  }
  .nav-item.active .count { color: var(--accent-2); }
  .nav-bal {
    display: flex;
    align-items: center;
    gap: 8px;
    font-variant-numeric: tabular-nums;
    font-size: 12px;
    color: var(--muted-2);
    flex: none;
  }
  .nav-bal .nb-item {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    white-space: nowrap;
  }
  .nav-bal .coin-ic {
    width: 17px;
    height: 17px;
    font-size: 10.5px;
  }
  .nav-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    color: var(--muted-2);
    flex: none;
  }
  .nav-item:hover .nav-icon { color: var(--muted); }
  .nav-item.active .nav-icon { color: var(--accent); }
  .nav-add .nav-icon { color: var(--accent); }
  .nav-add:hover .nav-icon { color: var(--accent-2); }

  .rail-foot {
    margin-top: 4px;
    padding-top: 12px;
    border-top: 1px solid var(--line-soft);
  }
  .rail-foot .ghost-btn {
    width: 100%;
    height: 32px;
    font-size: var(--fs-xs);
  }
  .rail-sep-bottom {
    margin: auto 6px 8px;
  }
  .hint {
    margin-top: 8px;
    font-size: 9.5px;
    letter-spacing: 0.9px;
    text-transform: uppercase;
    color: var(--muted-2);
    text-align: center;
  }

  .coin-ic {
    width: 22px;
    height: 22px;
    flex: none;
    display: grid;
    place-items: center;
    font-size: 13px;
    font-weight: 700;
  }
  .coin-ic-coins {
    border: 1.5px solid #e3a13b;
    border-radius: 50%;
    color: #e3a13b;
    background: rgba(227, 161, 59, 0.12);
  }
  .coin-ic-coins::before {
    content: '';
    width: 8px;
    height: 8px;
    background: #e3a13b;
    clip-path: polygon(50% 0, 61% 34%, 97% 35%, 68% 55%, 79% 89%, 50% 67%, 21% 89%, 32% 55%, 3% 35%, 39% 34%);
  }
  .coin-ic-rub {
    border: 1.5px solid #cbd5e1;
    border-radius: 50%;
    color: #cbd5e1;
    background: rgba(203, 213, 225, 0.12);
  }

  /* ---------- Рабочая область ---------- */
  .workspace {
    flex: 1;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .bar {
    display: flex;
    flex: none;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px;
    padding: 16px var(--pad-x) 8px;
    background: var(--panel);
  }
  .bar-title {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
    flex: none;
  }
  .bar-title h1 {
    font-size: var(--fs-xl);
    font-weight: 700;
    letter-spacing: -0.02em;
    line-height: 1.15;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .bar-sub {
    font-size: var(--fs-xs);
    color: var(--muted-2);
    white-space: nowrap;
    padding: 2px 9px;
    border: 1px solid var(--line-soft);
    border-radius: var(--radius-pill);
    background: rgba(255, 255, 255, 0.03);
    font-variant-numeric: tabular-nums;
  }
  .bar-hint {
    flex: none;
    margin: 0;
    padding: 4px var(--pad-x) 14px;
    border-bottom: 1px solid var(--line-soft);
    background: var(--panel);
    color: var(--muted);
    font-size: var(--fs-sm);
    line-height: 1.45;
    max-width: 1120px;
  }

  .lib-chips {
    flex: none;
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    padding: 12px var(--pad-x);
    border-bottom: 1px solid var(--line-soft);
    background: var(--bg-soft);
  }
  .lib-chips .cat {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    height: var(--control-h-sm);
    padding: 0 12px;
    border: 1px solid var(--line-soft);
    border-radius: var(--radius-pill);
    background: transparent;
    color: var(--muted);
    font: inherit;
    font-size: var(--fs-sm);
    cursor: pointer;
    transition: border-color var(--dur) var(--ease), color var(--dur) var(--ease),
      background var(--dur) var(--ease);
  }
  .lib-chips .cat:hover {
    color: var(--text);
    border-color: var(--line);
    background: var(--hover);
  }
  .lib-chips .cat.active {
    background: var(--accent);
    border-color: var(--accent);
    color: #0b1220;
    font-weight: 600;
  }
  .lib-chips .cat-count {
    font-size: var(--fs-xs);
    font-variant-numeric: tabular-nums;
    opacity: 0.65;
  }
  .lib-chips .cat.active .cat-count { opacity: 0.75; }
  .lib-chips .cat-ic { display: inline-flex; align-items: center; justify-content: center; width: 14px; height: 14px; }

  .store-strip {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
    padding: 2px 2px 6px;
  }
  .store {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    height: 44px;
    padding: 0;
    border: 1px solid transparent;
    border-radius: var(--radius-md);
    background: transparent;
    color: var(--muted);
    cursor: pointer;
    transition: background var(--dur) var(--ease), border-color var(--dur) var(--ease),
      opacity var(--dur) var(--ease);
  }
  .store:hover { background: var(--hover); border-color: var(--line-soft); }
  .store:active { background: var(--hover-2); }
  .store.active { border-color: transparent; background: rgba(138, 180, 255, 0.06); }
  .store.empty { opacity: 0.85; }
  .store.empty:hover { opacity: 1; }
  .store-plate {
    position: relative;
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    border-radius: 10px;
    background: var(--plate, linear-gradient(150deg, #232833, #343d4d));
    color: #f4f8ff;
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.16),
      inset 0 -3px 8px rgba(0, 0, 0, 0.38),
      0 2px 7px rgba(0, 0, 0, 0.4);
    transition: transform 0.16s ease, box-shadow 0.16s ease, filter 0.16s ease;
  }
  .store-badge {
    position: absolute;
    top: -6px;
    right: -6px;
    min-width: 15px;
    height: 15px;
    padding: 0 4px;
    box-sizing: border-box;
    display: grid;
    place-items: center;
    border-radius: 999px;
    background: rgba(10, 14, 20, 0.88);
    border: 1px solid rgba(255, 255, 255, 0.16);
    color: #e7eefc;
    font-size: 9px;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    line-height: 1;
  }
  .store:hover .store-plate { filter: brightness(1.07); }
  .store.active .store-plate {
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.18),
      inset 0 -2px 6px rgba(0, 0, 0, 0.3),
      0 0 0 2px color-mix(in srgb, var(--accent) 75%, transparent),
      0 0 14px color-mix(in srgb, var(--store, var(--accent)) 45%, transparent);
  }
  .store.empty .store-plate { filter: saturate(0.45) brightness(0.82); }
  .store.empty:hover .store-plate { filter: saturate(0.9) brightness(1); }
  .store.active .store-badge {
    background: var(--accent);
    border-color: transparent;
    color: #0b1220;
  }
  .store.empty .store-badge { opacity: 0.6; }

  .sort {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: none;
  }
  .sort-label {
    font-size: 11px;
    color: var(--muted-2);
    white-space: nowrap;
  }
  .sort select {
    height: var(--control-h);
    padding: 0 10px;
    background: var(--bg-soft);
    border: 1px solid var(--line);
    border-radius: var(--radius-sm);
    color: var(--text);
    font-size: var(--fs-sm);
    cursor: pointer;
    outline: none;
    transition: border-color var(--dur) var(--ease), box-shadow var(--dur) var(--ease);
  }
  .sort select:hover { border-color: var(--line); background: var(--panel-2); }
  .sort select:focus { border-color: rgba(111, 157, 255, 0.55); box-shadow: var(--ring); }

  .status {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex: none;
    height: 30px;
    padding: 0 var(--pad-x);
    border-top: 1px solid var(--line-soft);
    background: var(--bg-soft);
    font-size: var(--fs-xs);
    color: var(--muted-2);
  }
  .status > span:first-child {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .status .ver {
    flex: none;
    font-variant-numeric: tabular-nums;
    opacity: 0.8;
  }

  .content {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: var(--space-5) var(--pad-x) var(--space-7);
    scrollbar-width: thin;
    scrollbar-color: rgba(255, 255, 255, 0.16) transparent;
  }
  .content::-webkit-scrollbar { width: 10px; }
  .content::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.12);
    border: 3px solid transparent;
    background-clip: content-box;
    border-radius: var(--radius-pill);
  }
  .content::-webkit-scrollbar-thumb:hover { background: rgba(255, 255, 255, 0.22); background-clip: content-box; }
  .content::-webkit-scrollbar-track { background: transparent; }
  .consent-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    flex-wrap: wrap;
    margin-bottom: var(--space-4);
    padding: 12px 14px;
    border: 1px solid rgba(63, 108, 240, 0.4);
    border-left: 3px solid var(--accent);
    border-radius: var(--radius-md);
    background: rgba(63, 108, 240, 0.1);
    font-size: var(--fs-sm);
  }
  .consent-actions { display: flex; gap: 8px; flex: none; }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(238px, 1fr));
    align-content: start;
    gap: 18px 16px;
  }
  .app.layout-list .grid {
    grid-template-columns: 1fr;
    gap: 10px;
  }
  .layout-toggle {
    flex: none;
    width: var(--control-h);
    height: var(--control-h);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--line);
    border-radius: var(--radius-sm);
    background: var(--bg-soft);
    color: var(--muted);
    font-size: 14px;
    line-height: 1;
    cursor: pointer;
    transition: background var(--dur) var(--ease), color var(--dur) var(--ease),
      border-color var(--dur) var(--ease);
  }
  .layout-toggle:hover { color: var(--text); border-color: var(--line); background: var(--panel-2); }
  .app-toast {
    position: fixed;
    left: 50%;
    bottom: 70px;
    transform: translateX(-50%);
    z-index: 500;
    max-width: 70vw;
    padding: 10px 16px;
    border-radius: var(--radius-md);
    background: rgba(20, 24, 34, 0.96);
    border: 1px solid var(--line);
    color: var(--text);
    font-size: var(--fs-sm);
    box-shadow: var(--shadow-lift, 0 14px 30px rgba(9, 12, 20, 0.4));
    animation: toast-in 0.18s ease;
  }
  @keyframes toast-in { from { opacity: 0; transform: translate(-50%, 8px); } to { opacity: 1; transform: translate(-50%, 0); } }

  .app.tv .grid {
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: 20px;
  }
  .app.tv :global(.card:focus-visible) {
    outline: 3px solid rgba(110, 168, 255, 0.8);
    outline-offset: 4px;
  }

  /* ---------- Кнопки ---------- */
  .primary {
    height: var(--control-h);
    padding: 0 16px;
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    background: var(--btn-bg);
    color: var(--btn-ink);
    font-size: 13px;
    font-weight: 650;
    cursor: pointer;
    white-space: nowrap;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.3), var(--btn-glow);
    transition: background 0.14s ease, box-shadow 0.14s ease, transform 0.14s ease;
  }
  .primary:hover:not(:disabled) {
    background: var(--btn-bg-hover);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.38), 0 4px 14px rgba(90, 139, 255, 0.3);
  }
  .primary:active:not(:disabled) { transform: translateY(1px); }
  .primary:disabled { opacity: 0.5; cursor: not-allowed; }

  .ghost-btn {
    height: var(--control-h);
    padding: 0 14px;
    border: 1px solid var(--line);
    border-radius: var(--radius-sm);
    background: var(--panel);
    color: var(--text);
    font-size: var(--fs-sm);
    cursor: pointer;
    transition: background var(--dur) var(--ease), border-color var(--dur) var(--ease),
      color var(--dur) var(--ease);
  }
  .ghost-btn:hover:not(:disabled) {
    background: var(--panel-2);
    border-color: var(--line);
  }
  .ghost-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .rail-foot .ghost-btn { width: 100%; }

  .app-menu-list {
    position: absolute;
    top: 34px;
    left: 0;
    min-width: 216px;
    padding: 6px;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-lift, 0 16px 40px rgba(0, 0, 0, 0.55));
    z-index: 80;
  }
  .menu-entry {
    display: block;
    width: 100%;
    padding: 8px 10px;
    background: transparent;
    border: none;
    border-radius: var(--radius-xs);
    color: var(--muted);
    font-size: var(--fs-sm);
    text-align: left;
    cursor: pointer;
    white-space: nowrap;
    transition: background var(--dur) var(--ease), color var(--dur) var(--ease);
  }
  .menu-entry:hover { background: rgba(110, 168, 255, 0.16); color: var(--text); }
  .menu-entry.danger:hover { background: rgba(239, 91, 91, 0.18); color: var(--danger); }
  .menu-sep { height: 1px; margin: 5px 6px; background: var(--line-soft); }

  /* ---------- Состояния ---------- */
  .state {
    max-width: 520px;
    margin: 0 auto;
    padding: 56px 20px;
    text-align: center;
  }
  .state h2 { font-size: var(--fs-lg); font-weight: 650; margin-bottom: 8px; }
  .state p { color: var(--muted-2); font-size: var(--fs-sm); line-height: 1.55; margin-bottom: 18px; }
  .state .mono { font-family: Consolas, monospace; font-size: var(--fs-sm); }
  .state .primary,
  .state .ghost-btn { margin: 0 4px; }
  .spinner {
    display: block;
    width: 28px;
    height: 28px;
    margin: 0 auto 16px;
    border: 2px solid var(--line-soft);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 0.9s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* ---------- Модалка ---------- */
  .overlay {
    position: fixed;
    inset: 0;
    z-index: 100;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    background: rgba(8, 10, 14, 0.72);
    backdrop-filter: blur(4px);
  }
  .modal {
    width: 100%;
    max-width: 480px;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lift, 0 24px 60px rgba(0, 0, 0, 0.55));
    overflow: hidden;
  }
  .modal-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 18px;
    border-bottom: 1px solid var(--line-soft);
  }
  .modal-head h2 { font-size: var(--fs-lg); font-weight: 650; }
  .icon-btn {
    width: 30px;
    height: 30px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--line);
    border-radius: var(--radius-xs);
    background: transparent;
    color: var(--muted);
    font-size: 15px;
    line-height: 1;
    cursor: pointer;
    transition: background var(--dur) var(--ease), color var(--dur) var(--ease),
      border-color var(--dur) var(--ease);
  }
  .icon-btn:hover { color: var(--text); background: var(--panel-2); border-color: var(--line); }

  .modal-body { padding: 18px 18px 4px; }
  .field { display: block; margin-bottom: 14px; }
  .field > span {
    display: block;
    margin-bottom: 6px;
    font-size: var(--fs-xs);
    font-weight: 600;
    color: var(--muted-2);
  }
  .field input {
    width: 100%;
    height: var(--control-h);
    padding: 0 11px;
    background: var(--bg-soft);
    border: 1px solid var(--line);
    border-radius: var(--radius-sm);
    color: var(--text);
    font-size: var(--fs-md);
    outline: none;
    transition: border-color var(--dur) var(--ease), box-shadow var(--dur) var(--ease);
  }
  .field input:focus { border-color: var(--accent); box-shadow: var(--ring); }
  .field input[readonly] { color: var(--muted-2); }
  .row { display: flex; gap: 8px; }
  .row input { flex: 1; min-width: 0; }
  .row .ghost-btn { flex: none; height: var(--control-h); }

  .modal-foot {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 14px 18px 16px;
    border-top: 1px solid var(--line-soft);
    background: var(--bg-soft);
  }

  .about-name {
    font-size: 15px;
    font-weight: 700;
    margin-bottom: 12px;
  }
  .about-name span {
    margin-left: 6px;
    font-size: 11px;
    font-weight: 600;
    color: var(--muted-2);
  }
  .about-text {
    font-size: 12.5px;
    line-height: 1.55;
    color: var(--muted);
    margin-bottom: 10px;
  }

  /* ---------- Адаптив ---------- */
  @media (max-width: 1060px) {
    .grid { grid-template-columns: repeat(auto-fill, minmax(216px, 1fr)); }
    .bar { padding: 16px var(--pad-x-sm) 10px; }
    .bar-hint { padding: 0 var(--pad-x-sm) 12px; }
    .lib-chips { padding: 10px var(--pad-x-sm); }
    .content { padding: var(--space-4) var(--pad-x-sm) var(--space-6); }
    .sort-label { display: none; }
    .status { padding: 8px var(--pad-x-sm); }
  }

  @media (max-width: 900px) {
    .rail { width: 64px; padding: 14px 8px; }
    .store-strip {
      flex-direction: column;
      align-items: center;
      gap: 6px;
      padding: 0 0 6px;
    }
    .store { flex: none; width: 48px; min-width: 48px; max-width: 48px; height: 48px; }
    .store-plate { width: 34px; height: 34px; border-radius: 10px; }
    .store-badge { display: none; }
    .brand { justify-content: center; padding: 2px 0 14px; }
    .brand-text,
    .nav-label,
    .nav-item .label,
    .nav-item .count,
    .hint { display: none; }
    .nav-item { justify-content: center; height: 40px; padding: 0; }
    .rail-foot .ghost-btn {
      padding: 0;
      font-size: 0;
      height: 38px;
    }
    .rail-foot .ghost-btn::before { content: "⟳"; font-size: 17px; }
    .bar { padding: 12px 16px; gap: 10px; }
    .bar-title { min-width: 0; }
    .bar-sub { display: none; }
    .content { padding: 16px 16px 26px; }
  }

  .pub-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(6, 10, 16, 0.6);
    z-index: 90;
  }
  .pub-modal {
    position: fixed;
    z-index: 91;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: min(440px, calc(100vw - 40px));
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 18px;
    border: 1px solid var(--line-soft);
    border-radius: 14px;
    background: var(--panel);
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.45);
  }
  .pub-modal h3 { margin: 0; font-size: 15px; }
  .pub-hint { margin: 0; font-size: 11.5px; color: var(--muted); }
  .pub-field { display: flex; flex-direction: column; gap: 4px; font-size: 11.5px; color: var(--muted-2); }
  .pub-field input,
  .pub-field textarea {
    padding: 8px 10px;
    border: 1px solid var(--line-soft);
    border-radius: 9px;
    background: var(--panel-2, var(--panel));
    color: var(--ink);
    font: inherit;
    font-size: 12.5px;
    resize: vertical;
  }
  .pub-msg { font-size: 11.5px; color: var(--accent-2, #6f9dff); }
  .pub-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 4px; }
</style>









