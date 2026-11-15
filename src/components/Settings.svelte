<script lang="ts">
  import { onMount } from 'svelte';
  import { invoke } from '@tauri-apps/api/tauri';
  import { t, applyLocale } from '../lib/i18n';
  import pkg from '../../package.json';
  import { notify, ask } from '../lib/dialogs';
  import Icon from './Icon.svelte';
  const appVersion = pkg.version;

  interface AppSettings {
    close_to_tray: boolean;
    overlay_shift_tab: boolean;
    curtain_enabled: boolean;
    curtain_app: string;
    curtain_edge: string;
    corner_tl: boolean;
    corner_tr: boolean;
    corner_bl: boolean;
    corner_br: boolean;
    corner_size: number;
    min_speed: number;
    dwell_ms: number;
    anim_ms: number;
    corner_radius: number;
    animate: boolean;
    rounded: boolean;
    hide_esc: boolean;
    hide_outside: boolean;
    auto_backup: boolean;
    backup_path: string;
    backup_history: number;
    boss_key: string;
    mask_app: string;
    clear_clipboard: boolean;
    clear_recent_docs: boolean;
    hide_playtime: boolean;
    enable_toasts: boolean;
    enable_sounds: boolean;
    optimize_on_launch: boolean;
    restore_after_game: boolean;
    pause_torrents_on_launch: boolean;
    focus_mode_on_launch: boolean;
    snapshot_interval: number;
    onboarded: boolean;
    tv_mode: boolean;
  }

  interface LocalSettings {
    theme: 'graphite' | 'amoled' | 'midnight' | 'forest' | 'garnet' | 'ocean' | 'standard';
    language: 'ru' | 'en';
    autoBackup: boolean;
    backupPath: string;
    backupHistory: number;
    compressBackups: boolean;
    bossKey: string;
    maskApp: string;
    clearClipboard: boolean;
    hideDiscordStatus: boolean;
optimizeOnLaunch: boolean;
    restoreAfterGame: boolean;
    pauseTorrentsOnLaunch: boolean;
    focusModeOnLaunch: boolean;
    clearRecentDocs: boolean;
    hidePlaytime: boolean;
    enableSounds: boolean;
    enableToasts: boolean;
  }

  const localDefaults: LocalSettings = {
    theme: 'graphite',
    language: 'ru',
    autoBackup: true,
    backupPath: '%APPDATA%\\GameLauncher\\Backups',
    backupHistory: 5,
    compressBackups: true,
    bossKey: 'Ctrl+Shift+X',
    maskApp: 'Excel',
    clearClipboard: true,
    hideDiscordStatus: false,
optimizeOnLaunch: true,
    restoreAfterGame: true,
    pauseTorrentsOnLaunch: false,
    focusModeOnLaunch: false,
    clearRecentDocs: false,
    hidePlaytime: false,
    enableSounds: true,
    enableToasts: true,
  };

  const sDefaults: AppSettings = {
    close_to_tray: true,
    overlay_shift_tab: false,
    curtain_enabled: true,
    curtain_app: '',
    curtain_edge: 'right',
    corner_tl: false,
    corner_tr: true,
    corner_bl: false,
    corner_br: true,
    corner_size: 120,
    min_speed: 120,
    dwell_ms: 80,
    anim_ms: 320,
    corner_radius: 18,
    animate: true,
    rounded: true,
    hide_esc: true,
    hide_outside: true,
    auto_backup: true,
    backup_path: '',
    backup_history: 5,
    boss_key: 'Ctrl+Shift+X',
    mask_app: 'Excel',
    clear_clipboard: true,
    clear_recent_docs: false,
    hide_playtime: false,
    enable_toasts: true,
    enable_sounds: true,
    optimize_on_launch: false,
    restore_after_game: true,
    pause_torrents_on_launch: false,
    focus_mode_on_launch: false,
    snapshot_interval: 15,
    onboarded: false,
    tv_mode: false,
  };

  const sections = [
    { id: 'general', icon: 'settings', label: 'sec.general' },
    { id: 'saves', icon: 'save', label: 'sec.saves' },
    { id: 'curtain', icon: 'curtain', label: 'sec.curtain' },
    { id: 'stealth', icon: 'shield', label: 'sec.stealth' },
    { id: 'performance', icon: 'rocket', label: 'sec.performance' },
    { id: 'privacy', icon: 'ghost', label: 'sec.privacy' },
    { id: 'notifications', icon: 'bell', label: 'sec.notifications' },
    { id: 'help', icon: 'book', label: 'sec.help' },
  ];

  let s: AppSettings = { ...sDefaults };
  let local: LocalSettings = { ...localDefaults };
  export let games: { id: string; name: string }[] = [];
  let autostart = false;
  let prevAutostart = false;
  let ready = false;
  let activeSection = 'general';
  let toast = '';
  let checkingUpdates = false;
  let toastTimer: ReturnType<typeof setTimeout> | null = null;
  let saveTimer: ReturnType<typeof setTimeout> | null = null;

  onMount(async () => {
    try {
      const loaded = await invoke<AppSettings>('settings_get');
      s = { ...sDefaults, ...loaded };
    } catch (e) {
      console.error('Не удалось прочитать настройки', e);
    }
    try {
      autostart = await invoke<boolean>('autostart_get');
    } catch (e) {
      console.error('Не удалось прочитать автозапуск', e);
    }

    try {
      const raw = localStorage.getItem('gameLauncherSettings');
      if (raw) local = { ...localDefaults, ...JSON.parse(raw) };
    } catch (e) {
      console.error('Не удалось прочитать локальные настройки', e);
    }
    local = { ...local, theme: normalizeTheme(local.theme as string) as typeof local.theme };

    applyTheme();
    loadMemory();
    prevAutostart = autostart;
    ready = true;
  });

  const THEME_CLASSES = [
    'theme-amoled',
    'theme-midnight',
    'theme-forest',
    'theme-garnet',
    'theme-ocean',
    'theme-light',
  ];

  const DARK_THEMES = ['graphite', 'amoled', 'midnight', 'forest', 'garnet', 'ocean'];

  function normalizeTheme(name: string): string {
    if (DARK_THEMES.includes(name)) return name;
    if (name === 'standard' || name === 'system') return 'standard';
    return 'graphite';
  }

  function resolveTheme(name: string): string {
    const norm = normalizeTheme(name);
    if (norm === 'standard') {
      return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'graphite';
    }
    return norm;
  }

  function applyTheme() {
    const resolved = resolveTheme(local.theme);
    document.body.classList.remove(...THEME_CLASSES);
    if (resolved !== 'graphite') {
      document.body.classList.add('theme-' + resolved);
    }
  }

  function showToast(text: string) {
    if (!s.enable_toasts) return;
    toast = text;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toast = ''), 2200);
  }

  let busy = false;
  let mem = { used_mb: 0, total_mb: 0 };

  async function loadMemory() {
    try {
      mem = await invoke<{ used_mb: number; total_mb: number }>('memory_stats');
    } catch (e) {
      console.error('Не удалось прочитать память', e);
    }
  }

  async function showPlan() {
    try {
      const plan = await invoke<{
        services: string[];
        processes: string[];
        disable_sleep: boolean;
        high_performance: boolean;
      }>('optimize_preview');

      const lines: string[] = [];
      if (plan.high_performance) lines.push('План питания: высокая производительность');
      if (plan.disable_sleep) lines.push('Спящий режим будет отключён');
      if (plan.processes.length) lines.push('Закроются приложения: ' + plan.processes.join(', '));
      if (plan.services.length) lines.push('Будут остановлены службы: ' + plan.services.join(', '));

      notify(lines.length ? lines.join('\n\n') : 'Оптимизировать нечего');
    } catch (e) {
      console.error(e);
      showToast('Не удалось получить план');
    }
  }

  async function onOptimizeToggle(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    if (input.checked) {
      const ok = await ask({
        title: 'Включить оптимизацию?',
        message:
          'При запуске игры лаунчер переключит план питания на высокую производительность и отключит сон. Приложения и службы не трогаем.',
        okLabel: 'Включить',
      });
      if (!ok) {
        input.checked = false;
        s.optimize_on_launch = false;
        return;
      }
    }
    s.optimize_on_launch = input.checked;
    touch();
  }

  async function runOptimize() {
    const ok = await ask({
      title: 'Оптимизировать сейчас?',
      message:
        'Переключу план питания на высокую производительность и отключу сон. Приложения и службы не трогаем. Откат — кнопкой «Восстановить».',
      okLabel: 'Оптимизировать',
    });
    if (!ok) return;

    busy = true;
    try {
      const message = await invoke<string>('optimize_now');
      showToast(message);
    } catch (e) {
      console.error(e);
      showToast('Не удалось оптимизировать');
    } finally {
      await loadMemory();
      busy = false;
    }
  }

  async function restoreSystem() {
    busy = true;
    try {
      const message = await invoke<string>('restore_system');
      showToast(message);
    } catch (e) {
      console.error(e);
      showToast('Не удалось восстановить');
    } finally {
      await loadMemory();
      busy = false;
    }
  }

  function touch() {
    if (!ready) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(persist, 350);
  }

  async function persist() {
    try {
      await invoke('settings_save', { s });
      localStorage.setItem('gameLauncherSettings', JSON.stringify(local));
      showToast('Настройки сохранены');
    } catch (e) {
      console.error(e);
      showToast('Не удалось сохранить');
    }
  }

  async function checkUpdates() {
    checkingUpdates = true;
    try {
      const message = await invoke<string>('check_update');
      showToast(message);
    } catch (e) {
      showToast('Не удалось проверить обновления');
    } finally {
      checkingUpdates = false;
    }
  }

  async function resetSettings() {
    const ok = await ask({
      title: 'Сбросить настройки?',
      message:
        'Переключатели шторки, стелса, сохранений и уведомлений вернутся к значениям по умолчанию. Библиотека, сохранения и профиль останутся на месте.',
      okLabel: 'Сбросить',
      danger: true,
    });
    if (!ok) return;
    s = { ...sDefaults };
    local = { ...localDefaults };
    applyTheme();
    applyLocale(local.language);
    try {
      await invoke('settings_save', { s });
      localStorage.setItem('gameLauncherSettings', JSON.stringify(local));
      showToast('Настройки сброшены');
    } catch (e) {
      console.error(e);
      showToast('Не удалось сбросить настройки');
    }
  }

  async function exportBackup() {
    try {
      const path = await invoke<string>('export_backup');
      showToast(`Резервная копия: ${path}`);
    } catch (e) {
      showToast(String(e));
    }
  }

  async function importBackup() {
    try {
      const msg = await invoke<string>('import_backup');
      showToast(msg);
    } catch (e) {
      showToast(String(e));
    }
  }

  async function clearDeviceData() {
    const ok = await ask({
      title: 'Очистить данные на этом устройстве?',
      message:
        'Удалятся сохранённая онлайн-сессия (выход из профиля), настройки лаунчера, кэш и недавние документы. Игровые файлы, библиотека и данные на сервере останутся.',
      okLabel: 'Очистить',
      danger: true,
    });
    if (!ok) return;
    busy = true;
    try {
      await invoke('clear_local_data');
    } catch (e) {
      console.error(e);
    }
    try {
      localStorage.clear();
    } catch (e) {
      console.error(e);
    }
    busy = false;
    showToast('Локальные данные очищены');
    location.reload();
  }

  $: if (ready && autostart !== prevAutostart) {
    prevAutostart = autostart;
    invoke('autostart_set', { enabled: autostart }).catch((e) => {
      console.error('Автозапуск не изменён', e);
      autostart = !autostart;
      prevAutostart = autostart;
      showToast('Автозапуск не изменён');
    });
  }

  function changeBossKey(e: KeyboardEvent) {
    e.preventDefault();
    const keys: string[] = [];
    if (e.ctrlKey) keys.push('Ctrl');
    if (e.shiftKey) keys.push('Shift');
    if (e.altKey) keys.push('Alt');
    if (!['Control', 'Shift', 'Alt'].includes(e.key)) keys.push(e.key.toUpperCase());
    if (keys.length > 0) s.boss_key = keys.join('+');
  }
</script>

<div class="settings" on:change={touch} on:input={touch}>
  {#if toast}
    <div class="toast">{toast}</div>
  {/if}

  <aside class="cats">
    <h2>Настройки</h2>
    <div class="cat-list">
      {#each sections as section (section.id)}
        <button
          class="cat"
          class:active={activeSection === section.id}
          on:click={() => (activeSection = section.id)}
        >
          <span class="ic"><Icon name={section.icon} size={16} /></span>
          <span>{$t(section.label)}</span>
        </button>
      {/each}
    </div>
    <button class="save" on:click={persist}>{$t('settings.save')}</button>
  </aside>

  <div class="pane">
    {#if activeSection === 'general'}
      <h1><Icon name="settings" size={22} /> {$t('h.general')}</h1>

      <div class="group">
        <div class="row">
          <div class="info">
            <h3>{$t('row.autostart')}</h3>
            <p>{$t('row.autostartDesc')}</p>
          </div>
          <label class="toggle">
            <input type="checkbox" bind:checked={autostart} />
            <span class="slider"></span>
          </label>
        </div>

        <div class="row">
          <div class="info">
            <h3>{$t('row.tray')}</h3>
            <p>{$t('row.trayDesc')}</p>
          </div>
          <label class="toggle">
            <input type="checkbox" bind:checked={s.close_to_tray} />
            <span class="slider"></span>
          </label>
        </div>

        <div class="row">
          <div class="info">
            <h3>{$t('row.theme')}</h3>
            <p>{$t('row.themeDesc')}</p>
          </div>
          <select class="ctl-select" bind:value={local.theme} on:change={applyTheme}>
            <option value="graphite">{$t('theme.graphite')}</option>
            <option value="amoled">{$t('theme.amoled')}</option>
            <option value="midnight">{$t('theme.midnight')}</option>
            <option value="forest">{$t('theme.forest')}</option>
            <option value="garnet">{$t('theme.garnet')}</option>
            <option value="ocean">{$t('theme.ocean')}</option>
            <option value="standard">{$t('theme.standard')}</option>
          </select>
        </div>

        <div class="row">
          <div class="info">
            <h3>{$t('row.language')}</h3>
            <p>{$t('row.languageDesc')}</p>
          </div>
<select class="ctl-select" bind:value={local.language} on:change={() => applyLocale(local.language)}>
            <option value="ru">Русский</option>
            <option value="en">English</option>
          </select>
        </div>

        <div class="row">
          <div class="info">
            <h3>{$t('row.backup')}</h3>
            <p>{$t('row.backupDesc')}</p>
          </div>
          <div class="row-actions">
            <button class="mini" on:click={exportBackup}>{$t('btn.export')}</button>
            <button class="mini" on:click={importBackup}>{$t('btn.import')}</button>
          </div>
        </div>
      </div>

      <div class="group">
        <div class="row">
          <div class="info">
            <h3>Версия и данные</h3>
            <p>Настройки, статистика и пути к играм хранятся локально на этом компьютере.</p>
          </div>
          <div class="row-actions">
            <button class="mini" on:click={() => invoke('open_data_dir').catch(() => {})}>Открыть папку данных</button>
          </div>
        </div>
        <div class="row">
          <div class="info">
            <h3>Обновления</h3>
            <p>Проверить, вышла ли новая версия лаунчера.</p>
          </div>
          <div class="row-actions">
            <button class="mini" on:click={checkUpdates} disabled={checkingUpdates}>
              {checkingUpdates ? 'Проверяю…' : 'Проверить'}
            </button>
          </div>
        </div>

        <div class="row">
          <div class="info">
            <h3>Сброс настроек</h3>
            <p>
              Вернуть все переключатели к значениям по умолчанию. Библиотека, сохранения и профиль
              не затрагиваются.
            </p>
          </div>
          <div class="row-actions">
            <button class="mini danger" on:click={resetSettings}>Сбросить</button>
          </div>
        </div>

        <div class="facts">
          <div><span>Версия</span><strong>{appVersion}</strong></div>
          <div><span>Игр в библиотеке</span><strong>{games.length}</strong></div>
          <div><span>Система</span><strong>Windows</strong></div>
        </div>
      </div>
    {:else if activeSection === 'saves'}
      <h1><Icon name="save" size={22} /> {$t('h.saves')}</h1>

      <div class="group">
        <div class="row highlight">
          <div class="info">
            <h3>{$t('row.autoBackup')}</h3>
            <p>{$t('row.autoBackupDesc')}</p>
          </div>
          <label class="toggle">
            <input type="checkbox" bind:checked={s.auto_backup} />
            <span class="slider"></span>
          </label>
        </div>

        <div class="row">
          <div class="info">
            <h3>{$t('row.backupPath')}</h3>
            <p>{$t('row.backupPathDesc')}</p>
          </div>
          <input class="ctl-text" type="text" bind:value={s.backup_path} />
        </div>

        <div class="row">
          <div class="info">
            <h3>{$t('row.history')}</h3>
            <p>{$t('row.historyDesc')}</p>
          </div>
          <select class="ctl-select" bind:value={s.backup_history}>
            <option value={3}>{$t('hist.3')}</option>
            <option value={5}>{$t('hist.5')}</option>
            <option value={10}>{$t('hist.10')}</option>
            <option value={999}>{$t('hist.all')}</option>
          </select>
        </div>
      </div>
    {:else if activeSection === 'curtain'}
      <h1><Icon name="curtain" size={22} /> {$t('h.curtain')}</h1>

      <div class="group">
        <div class="row">
          <div class="info">
            <h3>{$t('row.curtainOn')}</h3>
            <p>{$t('row.curtainOnDesc')}</p>
          </div>
          <label class="toggle">
            <input type="checkbox" bind:checked={s.curtain_enabled} />
            <span class="slider"></span>
          </label>
        </div>

        <div class="row">
          <div class="info">
            <h3>{$t('row.overlay')}</h3>
            <p>{$t('row.overlayDesc')}</p>
          </div>
          <label class="toggle">
            <input type="checkbox" bind:checked={s.overlay_shift_tab} />
            <span class="slider"></span>
          </label>
        </div>

        <div class="row">
          <div class="info">
            <h3>{$t('row.curtainApp')}</h3>
            <p>{$t('row.curtainAppDesc')}</p>
          </div>
          <select class="ctl-select" bind:value={s.curtain_app} disabled={!s.curtain_enabled}>
            <option value="">{$t('row.anyApp')}</option>
            {#each games as g (g.id)}
              <option value={g.id}>{g.name}</option>
            {/each}
          </select>
        </div>

        <div class="row">
          <div class="info">
            <h3>{$t('row.edge')}</h3>
            <p>{$t('row.edgeDesc')}</p>
          </div>
          <select class="ctl-select" bind:value={s.curtain_edge} disabled={!s.curtain_enabled}>
            <option value="right">{$t('edge.right')}</option>
            <option value="left">{$t('edge.left')}</option>
          </select>
        </div>

        <div class="row">
          <div class="info">
            <h3>{$t('row.corners')}</h3>
            <p>{$t('row.cornersDesc')}</p>
          </div>
          <div class="corners">
            <button class="chip" class:on={s.corner_tl} on:click={() => (s.corner_tl = !s.corner_tl)}>{$t('corner.tl')}</button>
            <button class="chip" class:on={s.corner_tr} on:click={() => (s.corner_tr = !s.corner_tr)}>{$t('corner.tr')}</button>
            <button class="chip" class:on={s.corner_bl} on:click={() => (s.corner_bl = !s.corner_bl)}>{$t('corner.bl')}</button>
            <button class="chip" class:on={s.corner_br} on:click={() => (s.corner_br = !s.corner_br)}>{$t('corner.br')}</button>
          </div>
        </div>

        <div class="row">
          <div class="info">
            <h3>{$t('row.zoneSize')}</h3>
            <p>{$t('row.zoneSizeDesc')}</p>
          </div>
          <input class="ctl-num" type="number" bind:value={s.corner_size} min="40" max="400" step="10" />
        </div>

        <div class="row">
          <div class="info">
            <h3>{$t('row.speed')}</h3>
            <p>{$t('row.speedDesc')}</p>
          </div>
          <input class="ctl-num" type="number" bind:value={s.min_speed} min="10" max="600" step="10" />
        </div>

        <div class="row">
          <div class="info">
            <h3>{$t('row.dwell')}</h3>
            <p>{$t('row.dwellDesc')}</p>
          </div>
          <input class="ctl-num" type="number" bind:value={s.dwell_ms} min="0" max="1000" step="10" />
        </div>

        <div class="row">
          <div class="info">
            <h3>{$t('row.anim')}</h3>
            <p>{$t('row.animDesc')}</p>
          </div>
          <input class="ctl-num" type="number" bind:value={s.anim_ms} min="0" max="1500" step="10" />
        </div>
      </div>
    {:else if activeSection === 'stealth'}
      <h1><Icon name="shield" size={22} /> {$t('h.stealth')}</h1>

      <div class="group">
        <div class="row">
          <div class="info">
            <h3>{$t('row.bossKey')}</h3>
            <p>{$t('row.bossKeyDesc')}</p>
          </div>
          <input
            class="ctl-text hotkey"
            type="text"
            bind:value={s.boss_key}
            on:keydown={changeBossKey}
            placeholder={$t('row.bossKeyHint')}
          />
        </div>

        <div class="row">
          <div class="info">
            <h3>{$t('row.maskApp')}</h3>
            <p>{$t('row.maskAppDesc')}</p>
          </div>
          <select class="ctl-select" bind:value={s.mask_app}>
            <option value="Excel">Excel</option>
            <option value="Word">Word</option>
            <option value="VS Code">VS Code</option>
            <option value="Browser">Браузер</option>
            <option value="1C">1С: Предприятие</option>
          </select>
        </div>

        <div class="row">
          <div class="info">
            <h3>{$t('row.clearClipboard')}</h3>
            <p>{$t('row.clearClipboardDesc')}</p>
          </div>
          <label class="toggle">
            <input type="checkbox" bind:checked={s.clear_clipboard} />
            <span class="slider"></span>
          </label>
        </div>
      </div>
    {:else if activeSection === 'performance'}
      <h1><Icon name="rocket" size={22} /> {$t('h.performance')}</h1>

      <div class="group">
        <div class="row highlight">
          <div class="info">
            <h3>{$t('row.optimize')}</h3>
            <p>{$t('row.optimizeDesc')}</p>
          </div>
          <label class="toggle">
            <input
              type="checkbox"
              checked={s.optimize_on_launch}
              on:change={onOptimizeToggle}
            />
            <span class="slider"></span>
          </label>
        </div>

        <div class="row">
          <div class="info">
            <h3>{$t('row.restore')}</h3>
            <p>{$t('row.restoreDesc')}</p>
          </div>
          <label class="toggle">
            <input type="checkbox" bind:checked={s.restore_after_game} />
            <span class="slider"></span>
          </label>
        </div>

        <div class="row">
          <div class="info">
            <h3>Пауза торрентов при запуске</h3>
            <p>Приостановить загрузку в торрент-клиентах, пока игра запущена (qBittorrent, uTorrent, Transmission и др.).</p>
          </div>
          <label class="toggle">
            <input type="checkbox" bind:checked={s.pause_torrents_on_launch} />
            <span class="slider"></span>
          </label>
        </div>

        <div class="row">
          <div class="info">
            <h3>Режим фокуса при запуске</h3>
            <p>Скрыть всплывающие уведомления Windows во время игры, чтобы ничто не отвлекало.</p>
          </div>
          <label class="toggle">
            <input type="checkbox" bind:checked={s.focus_mode_on_launch} />
            <span class="slider"></span>
          </label>
        </div>

        <div class="row">
          <div class="info">
            <h3>{$t('row.memory')}</h3>
            <p>{$t('row.memoryDesc')}</p>
          </div>
          <div class="mem">
            <span class="mem-val">{mem.used_mb} / {mem.total_mb} МБ</span>
            <button class="mini" on:click={loadMemory} disabled={busy}>
              {$t('btn.refresh')}
            </button>
          </div>
        </div>

        <div class="row">
          <div class="info">
            <h3>{$t('row.sysOpt')}</h3>
            <p>{$t('row.sysOptDesc')}</p>
          </div>
          <div class="actions">
            <button class="mini" on:click={showPlan} disabled={busy}>{$t('btn.plan')}</button>
            <button class="mini accent" on:click={runOptimize} disabled={busy}>
              {$t('btn.optimize')}
            </button>
            <button class="mini" on:click={restoreSystem} disabled={busy}>
              {$t('btn.restore')}
            </button>
          </div>
        </div>
      </div>
    {:else if activeSection === 'privacy'}
      <h1><Icon name="ghost" size={22} /> {$t('h.privacy')}</h1>

      <div class="group">
        <div class="row">
          <div class="info">
            <h3>{$t('row.recent')}</h3>
            <p>{$t('row.recentDesc')}</p>
          </div>
          <label class="toggle">
            <input type="checkbox" bind:checked={s.clear_recent_docs} />
            <span class="slider"></span>
          </label>
        </div>

<div class="row">
          <div class="info">
            <h3>{$t('row.playtime')}</h3>
            <p>{$t('row.playtimeDesc')}</p>
          </div>
          <label class="toggle">
            <input type="checkbox" bind:checked={s.hide_playtime} />
            <span class="slider"></span>
          </label>
        </div>

        <div class="row">
          <div class="info">
            <h3>Очистить данные на устройстве</h3>
            <p>Удаляет сохранённую онлайн-сессию, настройки и кэш с этого компьютера. Игровые файлы и данные на сервере не затрагиваются.</p>
          </div>
          <button class="mini danger" disabled={busy} on:click={clearDeviceData}>Очистить</button>
        </div>
      </div>

      <div class="group">
        <div class="help-block">
          <h3>Какие данные мы собираем</h3>
          <p>
            Лаунчер работает локально и не передаёт данные магазинов или игру, за которой вы
            следите, разработчикам. Хранится и передаётся на сервер только то, что нужно для
            работы онлайн-функций:
          </p>
          <p>
            • Ваш ник, почта-логин и пароль (пароль хранится в виде хеша, не открытым текстом).<br />
            • Профиль: биография, статус, аватар, настройки приватности, достижения.<br />
            • Активность: «в сети», последняя активность, наигранное время, список друзей.<br />
            • Действия по созданию групп и публикации постов в ленте новостей.<br />
            • Служебные журналы (аудит) для администраторов — кто и что менял, без паролей.
          </p>
          <p>
            Какие данные видны другим игрокам — вы управляете в профиле → вкладка
            «Приватность» (фото, активность, личные сообщения, заявки в друзья, имя).
            Экспорт своих данных и удаление аккаунта — там же.
          </p>
          <p>
            По умолчанию программа не передаёт данные аналитики и рекламы. Локальные настройки
            и кэш вы можете очистить кнопкой выше. Полное удаление аккаунта стирает профиль,
            друзей, посты и ленту с сервера.
          </p>
        </div>
      </div>
    {:else if activeSection === 'notifications'}
      <h1><Icon name="bell" size={22} /> {$t('h.notifications')}</h1>

      <div class="group">
        <div class="row">
          <div class="info">
            <h3>{$t('row.toasts')}</h3>
            <p>{$t('row.toastsDesc')}</p>
          </div>
          <label class="toggle">
            <input type="checkbox" bind:checked={s.enable_toasts} />
            <span class="slider"></span>
          </label>
        </div>
        <div class="row">
          <div class="info">
            <h3>Проверка уведомлений</h3>
            <p>Покажет уведомление в углу окна, если они включены выше.</p>
          </div>
          <button class="mini" on:click={() => (s.enable_toasts ? showToast('Так выглядит уведомление лаунчера') : showToast('Уведомления выключены'))}>
            Проверить
          </button>
        </div>
        <div class="row">
          <div class="info">
            <h3>О чём уведомляет</h3>
            <p>Сохранение настроек, создание резервной копии, оптимизация и восстановление системы, ошибки действий.</p>
          </div>
        </div>
      </div>
    {:else if activeSection === 'help'}
      <h1><Icon name="book" size={22} /> Справка</h1>

      <div class="group">
        <div class="help-block">
          <h3>Зачем этот лаунчер</h3>
          <p>
            Он собирает в одном окне игры из Steam, Epic, GOG и добавленные вручную exe. Отсюда
            видно всю библиотеку, обложки, наигранное время Steam, избранное и частые запуски —
            не нужно открывать каждый магазин отдельно.
          </p>
        </div>

        <div class="help-block">
          <h3>Как добавить игру</h3>
          <ul class="help-list">
            <li>Steam, Epic и GOG подхватываются сами — нажмите «Обновить список».</li>
            <li>Свою игру добавьте кнопкой «Добавить игру» и укажите .exe.</li>
            <li>Звёздочка на карточке — избранное, оно всегда вверху списка.</li>
          </ul>
        </div>

        <div class="help-block">
          <h3>Классика и сети</h3>
          <ul class="help-list">
            <li>
              Внизу пункта — каталог старых сетевых игр по категориям. «Играть» ищет .exe в типовых
              путях; если игра установлена в другое место, нажмите «Путь» и укажите exe вручную.
            </li>
            <li>
              «Создать комнату» — вы хост. Гости в той же сети увидят комнату сами; из другой сети
              пришлите им свой адрес из карточки комнаты.
            </li>
            <li>Если гости не видят комнату — разрешите лаунчеру доступ в брандмауэре Windows.</li>
            <li>«Запусков: N» и блок «Часто запускаемые» показывают, во что вы играете чаще.</li>
          </ul>
        </div>

        <div class="help-block">
          <h3>Сохранения</h3>
          <p>
            Менеджер сохранений делает резервные копии перед запуском (если включено в разделе
            «Сохранения») и умеет вернуть выбранный бэкап. Для классики кнопка «+ Сейв» добавляет
            файлы сохранений в папку игры.
          </p>
        </div>

        <div class="help-block">
          <h3>Шторка и стелс</h3>
          <p>
            Шторка — быстрый доступ к библиотеке поверх игры по наведению мыши к краю экрана.
            Стелс-режим прячет окна по «босс-клавише» и очищает буфер обмена, если включено.
          </p>
        </div>

        <div class="help-block">
          <h3>Поиск, вид и режим ТВ</h3>
          <ul class="help-list">
            <li>Поиск ищет по названию игры и фильтрует текущий список на ходу.</li>
            <li>Фильтры платформ и «Избранное» слева переключают список без перезагрузки.</li>
            <li>
              Вид «сетка» или «список» переключается кнопкой раскладки в шапке библиотеки
              или по Ctrl+Shift+L.
            </li>
            <li>
              Режим ТВ — в меню «⋯»: включается крупная сетка и управление стрелками, удобно с
              геймпада или с дивана.
            </li>
          </ul>
        </div>

        <div class="help-block">
          <h3>Горячие клавиши</h3>
          <ul class="help-list">
            <li><strong>Ctrl+K</strong> — палитра команд: быстрый поиск и запуск без мыши.</li>
            <li><strong>Ctrl+F</strong> — перейти в поле поиска библиотеки.</li>
            <li><strong>Ctrl+Shift+L</strong> — сменить вид: сетка или список.</li>
            <li><strong>Esc</strong> — закрыть меню, палитру или шторку.</li>
            <li>
              <strong>Босс-клавиша</strong> (по умолчанию Ctrl+Shift+X, меняется в «Стелс-режиме»)
              — мгновенно спрятать окна.
            </li>
            <li>В режиме ТВ — стрелки для перехода по карточкам, Enter для запуска.</li>
          </ul>
        </div>

        <div class="help-block">
          <h3>Серверы и рейтинг</h3>
          <ul class="help-list">
            <li>
              Каталог открывается пунктом «Ваши серверы»: сначала закреплённые, затем общий список.
              Серверы, которые не отвечают, скрываются из выдачи.
            </li>
            <li>
              Сортировка: топ по голосам, за неделю, за месяц, по онлайну, новые, по названию.
              Рядом с карточкой — число игроков, карта, версия и время последней проверки.
            </li>
            <li>
              Голос — один раз в сутки за каждый сервер. Итоговый рейтинг считается по голосам за
              последние два года, поэтому накрутка не держится долго.
            </li>
            <li>
              Свою страницу сервера можно открыть по названию: там история онлайна, журнал голосов,
              адрес для подключения и паспорт сервера.
            </li>
          </ul>
        </div>

        <div class="help-block">
          <h3>Продвижение серверов</h3>
          <ul class="help-list">
            <li>
              Кнопка «Продвинуть» на своём сервере открывает оформление: плашка, свой цвет, крупная
              карточка, рамка, мягкое оформление, подсветка и закрепление наверху.
            </li>
            <li>Срок — от 7 дней до года, чем дольше срок, тем больше скидка.</li>
            <li>
              Платное оформление не меняет место в рейтинге: закреплённые показываются отдельным
              блоком с подписью, голоса за них считаются как обычно.
            </li>
            <li>
              Оплата сейчас в тестовом режиме — заказ проходит целиком, но деньги не списываются.
            </li>
          </ul>
        </div>

        <div class="help-block">
          <h3>Профиль, друзья и достижения</h3>
          <ul class="help-list">
            <li>
              В профиле меняются аватар, статус, строка «о себе» и видимость игры для друзей.
              Там же друзья по нику, достижения и свои серверы.
            </li>
            <li>Достижения дают опыт; по опыту растёт титул в «Опыт и титул».</li>
            <li>
              Раздел «Безопасность» — смена пароля и двухфакторный код, «Приватность» — что видят
              друзья, «Жалоба» — сообщить о нарушении.
            </li>
          </ul>
        </div>

        <div class="help-block">
          <h3>Если что-то не работает</h3>
          <ul class="help-list">
            <li>
              Серая обложка вместо арта — нажмите «Обновить список»: Steam иногда отдаёт заглушку
              вместо нормальной картинки.
            </li>
            <li>
              Сервер помечен «не отвечает» — он выключен или закрыт порт. Кнопка «Проверить»
              запрашивает статус заново.
            </li>
            <li>
              Игра не находится в «Классике» — укажите путь к exe вручную кнопкой «Путь».
            </li>
            <li>
              Шторка не появляется — проверьте, что она включена, и что игра запущена не в
              эксклюзивном полноэкранном режиме.
            </li>
            <li>Гости не видят комнату — разрешите лаунчеру доступ в брандмауэре Windows.</li>
          </ul>
        </div>

        <div class="help-block">
          <h3>Что лаунчер читает с диска</h3>
          <ul class="help-list">
            <li>
              Библиотеку Steam, Epic и GOG — из их установочных папок и реестра, чтобы показать
              список игр и пути запуска.
            </li>
            <li>
              Наигранное время Steam — из локального файла <code>localconfig.vdf</code> учётной
              записи на этом компьютере.
            </li>
            <li>
              Сохранения — только по играм, для которых включён автобэкап; копии лежат в папке
              данных лаунчера.
            </li>
            <li>Ничего не отправляется наружу: настройки, статистика и пути хранятся локально.</li>
          </ul>
        </div>

        <div class="help-block">
          <h3>Что важно знать</h3>
          <ul class="help-list">
            <li>Лаунчер не обходит защиту игр и не качает их — нужны свои легальные копии.</li>
            <li>Часть пунктов помечена «скоро»: сжатие бэкапов, звуки, интеграция с Discord.</li>
            <li>Данные лежат в папке лаунчера: меню «⋯» → «Папка данных».</li>
            <li>Пинг в комнате — приблизительный, по каналу лаунчера, а не игровой.</li>
          </ul>
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  .settings {
    display: flex;
    gap: 14px;
    align-items: stretch;
    padding: 2px 2px 26px;
  }

  .toast {
    position: fixed;
    right: 26px;
    bottom: 26px;
    padding: 10px 16px;
    border-radius: 8px;
    background: var(--accent);
    color: var(--ink-on-accent);
    font-size: 12.5px;
    font-weight: 600;
    box-shadow: 0 12px 28px rgba(0, 0, 0, 0.45);
    z-index: 50;
  }

  .cats {
    width: 208px;
    flex: none;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .cats h2 {
    margin: 2px 2px 4px;
    font-size: 13.5px;
    font-weight: 600;
  }

  .cat-list { display: flex; flex-direction: column; gap: 3px; }

  .cat {
    display: flex;
    align-items: center;
    gap: 9px;
    width: 100%;
    padding: 8px 10px;
    border: 0;
    border-left: 2px solid transparent;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--muted);
    font: inherit;
    font-size: 12.5px;
    text-align: left;
    cursor: pointer;
  }
  .cat:hover { background: var(--hover); color: var(--text); }
  .cat.active {
    background: var(--accent-soft);
    border-left-color: var(--accent);
    color: var(--accent-2);
  }
  .cat .ic { width: 15px; text-align: center; opacity: 0.85; }

  .save {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.3), var(--btn-glow);
    margin-top: 6px;
    padding: 9px 10px;
    border: 1px solid var(--line);
    border-radius: var(--radius-sm);
    background: var(--panel-2);
    color: var(--text);
    font: inherit;
    font-size: 12.5px;
    cursor: pointer;
  }
  .save:hover { border-color: var(--accent); color: var(--accent-2); }

  .pane {
    flex: 1;
    min-width: 0;
    max-width: none;
  }

  .pane h1 {
    margin: 2px 0 12px;
    font-size: 16px;
    font-weight: 600;
  }

  .group { display: flex; flex-direction: column; gap: 8px; }
  .facts {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 10px;
  }
  .facts > div {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 10px 12px;
    border: 1px solid var(--border, rgba(255,255,255,0.08));
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.02);
  }
  .facts span { font-size: 11.5px; color: var(--muted); }
  .facts strong { font-size: 15px; font-weight: 650; }


  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 11px 13px;
    border: 1px solid var(--line-soft);
    border-radius: var(--radius-sm);
    background: var(--panel);
  }

  .row.highlight { border-color: rgba(110, 168, 255, 0.3); background: rgba(110, 168, 255, 0.06); }

  .info { min-width: 0; }
  .info h3 { margin: 0 0 2px; font-size: 12.5px; font-weight: 500; color: var(--text); }
  .info p { margin: 0; font-size: 11px; color: var(--muted-2); }

  .toggle { position: relative; flex: none; width: 40px; height: 22px; cursor: pointer; }
  .toggle input { position: absolute; opacity: 0; width: 0; height: 0; }
  .slider {
    position: absolute;
    inset: 0;
    border-radius: 999px;
    background: var(--panel-3);
    border: 1px solid var(--line);
    transition: background 0.16s ease, border-color 0.16s ease;
  }
  .slider::before {
    content: '';
    position: absolute;
    width: 16px;
    height: 16px;
    left: 2px;
    top: 2px;
    border-radius: 50%;
    background: var(--muted);
    transition: transform 0.16s ease, background 0.16s ease;
  }
  input:checked + .slider {
    background: var(--accent-soft);
    border-color: rgba(110, 168, 255, 0.5);
  }
  input:checked + .slider::before {
    transform: translateX(18px);
    background: var(--accent);
  }

  .ctl-select,
  .ctl-text {
    flex: none;
    padding: 6px 9px;
    font: inherit;
    font-size: 12px;
    color: var(--text);
    background: var(--panel-2);
    border: 1px solid var(--line);
    border-radius: var(--radius-sm);
    outline: none;
  }
  .ctl-select { min-width: 168px; }
  .ctl-text { width: 220px; }
  .ctl-select:focus, .ctl-text:focus { border-color: var(--accent); }
  .ctl-select:disabled { opacity: 0.5; }

  .ctl-num {
    width: 86px;
    padding: 6px 9px;
    font: inherit;
    font-size: 12px;
    color: var(--text);
    background: var(--panel-2);
    border: 1px solid var(--line);
    border-radius: var(--radius-sm);
    outline: none;
  }
  .ctl-num:focus { border-color: var(--accent); }

  .hotkey { text-align: center; font-weight: 600; cursor: pointer; }

  .corners { display: flex; gap: 5px; }
  .chip {
    padding: 6px 10px;
    border: 1px solid var(--line);
    border-radius: 7px;
    background: transparent;
    color: var(--muted);
    font: inherit;
    font-size: 11px;
    cursor: pointer;
  }
  .chip.on {
    border-color: rgba(110, 168, 255, 0.55);
    background: rgba(110, 168, 255, 0.16);
    color: var(--accent-2);
  }

  @media (max-width: 1020px) {
    .settings { flex-direction: column; gap: 12px; }
    .cats { width: 100%; }
    .cats h2 { margin-bottom: 6px; }
    .cat-list { flex-direction: row; flex-wrap: wrap; gap: 6px; }
    .cat { width: auto; border-left: 0; border-bottom: 2px solid transparent; padding: 7px 11px; }
    .cat.active { border-left: 0; border-bottom-color: var(--accent); }
    .save { align-self: flex-start; }
    .pane { max-width: none; }
    .row { flex-wrap: wrap; }
    .ctl-text { width: 100%; }
    .ctl-select { min-width: 0; width: 100%; }
  }
  /* ---------- Макет: крупная страница настроек ---------- */
  .settings {
    display: flex;
    gap: 0;
    min-height: 100%;
    padding: 0;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 12px;
    overflow: visible;
  }

  .cats {
    width: 280px;
    gap: 0;
    padding: 20px;
    background: var(--bg-soft);
    border-right: 1px solid var(--line);
  }

  .cats h2 { margin: 0 0 20px; font-size: 20px; font-weight: 600; }
  .cat-list { flex: 1; gap: 8px; }

  .cat {
    gap: 12px;
    padding: 12px 16px;
    border-left: 3px solid transparent;
    border-radius: 6px;
    font-size: 14px;
  }
  .cat .ic { font-size: 17px; width: 20px; }

  .save {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.3), var(--btn-glow);
    margin-top: 20px;
    padding: 12px;
    border: 0;
    border-radius: 6px;
    background: var(--btn-bg);
    color: var(--btn-ink);
    font-size: 13.5px;
    font-weight: 600;
  }
  .save:hover { background: var(--btn-bg-hover); }

  .pane { padding: 30px; max-width: none; }
  .pane h1 { margin: 0 0 26px; font-size: 26px; font-weight: 600; display: flex; align-items: center; gap: 10px; }
  .pane h1 :global(svg) { color: var(--accent); }
  .group { gap: 16px; }

  .row {
    padding: 18px 20px;
    border-radius: 8px;
    background: var(--bg-soft);
  }
  .row:hover { border-color: var(--accent); }
  .row.highlight { border-color: #238636; background: rgba(35, 134, 54, 0.08); }

  .info h3 { margin: 0 0 5px; font-size: 15px; font-weight: 600; }
  .info p { font-size: 13px; }

  .toggle { width: 50px; height: 26px; }
  .slider::before {
    width: 18px;
    height: 18px;
    left: 3px;
    top: 3px;
    background: #ffffff;
  }
  input:checked + .slider { background: #238636; border-color: #238636; }
  input:checked + .slider::before { transform: translateX(24px); background: #ffffff; }

  .help-block {
    padding: 14px 16px;
    border: 1px solid var(--line);
    border-radius: 12px;
    background: var(--bg-soft);
  }
  .help-block + .help-block { margin-top: 10px; }
  .help-block h3 {
    margin: 0 0 6px;
    font-size: 13.5px;
  }
  .help-block p {
    margin: 0;
    color: var(--muted);
    font-size: 12.5px;
    line-height: 1.55;
  }
  .help-list {
    margin: 0;
    padding-left: 18px;
    color: var(--muted);
    font-size: 12.5px;
    line-height: 1.55;
  }
  .help-list li + li { margin-top: 5px; }
  .help-block code {
    padding: 1px 5px;
    border-radius: 5px;
    background: var(--hover-2);
    font-family: "Cascadia Mono", Consolas, monospace;
    font-size: 11.5px;
  }

  .ctl-select, .ctl-text {
    min-width: 200px;
    padding: 8px 12px;
    font-size: 13.5px;
    border-radius: 6px;
  }
  .ctl-num { width: 100px; padding: 8px 10px; font-size: 13.5px; }

  .toast {
    right: 30px;
    bottom: 30px;
    padding: 14px 24px;
    border-radius: 8px;
    font-size: 13.5px;
  }

  @media (max-width: 1100px) {
    .settings { flex-direction: column; height: auto; }
    .cats { width: 100%; padding: 16px; border-right: 0; border-bottom: 1px solid var(--line); }
    .cat-list { flex-direction: row; flex-wrap: wrap; }
    .cat { width: auto; border-left: 0; border-bottom: 3px solid transparent; }
    .cat.active { border-left: 0; border-bottom-color: var(--accent); }
    .save { align-self: flex-start; }
    .pane { padding: 18px; }
  }
  .actions {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  .mini {
    padding: 7px 11px;
    border: 1px solid var(--line);
    border-radius: var(--radius-sm);
    background: var(--panel-2);
    color: var(--text);
    font: inherit;
    font-size: 11.5px;
    cursor: pointer;
  }
  .mini:hover:not(:disabled) { border-color: var(--accent); color: var(--accent-2); }
  .mini.accent { border-color: #238636; background: rgba(35, 134, 54, 0.16); }
  .mini.danger { border-color: rgba(255, 111, 111, 0.45); color: var(--danger); }
  .mini.danger:hover:not(:disabled) { background: rgba(255, 111, 111, 0.12); border-color: var(--danger); }
  .mini:disabled { opacity: 0.5; cursor: default; }
  .mem {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .mem-val {
    font-size: 12.5px;
    color: var(--accent-2);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
</style>

