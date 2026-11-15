<script lang="ts">
  import { onMount } from 'svelte';
  import { invoke } from '@tauri-apps/api/tauri';
  import {
    online,
    setServer,
    adminGrantCoins,
    adminUserPatch,
    adminServerPatch,
    adminPromoClear,
  } from '../lib/online';
  import { CHANNEL, currentVersion, fetchLatest, installUpdate, isNewer, UPDATE_SERVER } from '../lib/updates';

  export let onClose: () => void = () => {};

  type DataInfo = { exists: boolean; size?: number; servers?: number; users?: number; orders?: number };

  let dataPath = '';
  let projectDir = '';
  let info: DataInfo = { exists: false };
  let backups: string[] = [];
  let backupSel = '';
  let healthText = '';
  let serverPid = '';
  let logText = '';
  let address = '';
  let coinsUser = '';
  let coinsAmount = 100;
  let patchServerId = '';
  let serverPatchText = '{\n  "name": "Новое имя"\n}';
  let userPatchText = '{\n  "city": "Магазин"\n}';
  let updateState = '';
  let note = '';
  let busy = false;
  let version = '';

  const dirOf = (path: string) => path.replace(/[\\/][^\\/]+$/, '');

  const port = () => {
    const match = /:(\d{2,5})\b/.exec(address || $online.server || '');
    return match ? parseInt(match[1], 10) : 8787;
  };

  const httpBase = () => {
    const trimmed = (address || $online.server || UPDATE_SERVER).trim().replace(/\/+$/, '');
    if (trimmed.startsWith('ws://')) return 'http://' + trimmed.slice(5);
    if (trimmed.startsWith('wss://')) return 'https://' + trimmed.slice(6);
    return trimmed;
  };

  async function refresh() {
    busy = true;
    try {
      if (!dataPath) dataPath = await invoke<string>('dev_default_data_path');
      if (!projectDir) {
        const stored = localStorage.getItem('dev_project_dir') || '';
        projectDir = stored || (await invoke<string>('dev_project_path')) || '';
      }
      if (!address) address = $online.server || UPDATE_SERVER;
      if (!coinsUser) coinsUser = $online.user || 'admin1';
      if (!patchServerId && $online.publicServers.length) patchServerId = $online.publicServers[0].id;
      info = await invoke('dev_data_info', { path: dataPath });
      backups = await invoke<string[]>('dev_list_backups', { path: dataPath });
      if (!backupSel && backups.length) backupSel = backups[0];
      version = await currentVersion();
      const status = await invoke<{ running: boolean; pid?: number }>('dev_server_status');
      serverPid = status.running && status.pid ? 'PID ' + status.pid : 'не управляется';
    } catch (e) {
      note = 'Ошибка: ' + String(e);
    } finally {
      busy = false;
    }
  }

  async function applyAddress() {
    const value = (address || '').trim();
    if (!/^wss?:\/\/.+/.test(value)) {
      note = 'Адрес должен начинаться с ws:// или wss://';
      return;
    }
    setServer(value);
    note = 'Адрес сохранён, переподключаюсь…';
  }

  async function checkServer() {
    healthText = 'проверяю…';
    try {
      healthText = await invoke<string>('dev_http_text', { url: httpBase() + '/health' });
    } catch (e) {
      healthText = 'нет ответа: ' + String(e);
    }
  }

  async function startServer() {
    if (!projectDir.trim()) {
      note = 'Укажите папку проекта сервера';
      return;
    }
    localStorage.setItem('dev_project_dir', projectDir.trim());
    busy = true;
    try {
      const pid = await invoke<number>('dev_server_start', {
        cwd: projectDir.trim(),
        dataFile: dataPath,
        port: port(),
      });
      note = 'Сервер запущен, PID ' + pid;
      await refresh();
    } catch (e) {
      note = 'Не удалось запустить: ' + String(e);
    } finally {
      busy = false;
    }
  }

  async function stopServer() {
    busy = true;
    try {
      await invoke('dev_server_stop');
      note = 'Сервер остановлен';
      await refresh();
    } catch (e) {
      note = 'Ошибка остановки: ' + String(e);
    } finally {
      busy = false;
    }
  }

  async function restartServer() {
    await stopServer();
    await startServer();
  }

  async function loadLog() {
    try {
      logText = await invoke<string>('dev_read_log', {
        path: dirOf(dataPath) + '\\server.log',
        lines: 120,
      });
      if (!logText.trim()) logText = '(лог пуст)';
    } catch (e) {
      logText = 'Не удалось прочитать лог: ' + String(e);
    }
  }

  async function makeBackup() {
    busy = true;
    try {
      const path = await invoke<string>('dev_backup_data', { path: dataPath });
      note = 'Бэкап: ' + String(path).split(/[\\/]/).pop();
      await refresh();
    } catch (e) {
      note = 'Ошибка бэкапа: ' + String(e);
    } finally {
      busy = false;
    }
  }

  async function restoreBackup() {
    if (!backupSel) {
      note = 'Выберите бэкап';
      return;
    }
    busy = true;
    try {
      await invoke('dev_restore_data', { path: dataPath, backup: backupSel });
      note = 'Восстановлено из ' + backupSel + '. Перезапустите сервер.';
      await refresh();
    } catch (e) {
      note = 'Ошибка восстановления: ' + String(e);
    } finally {
      busy = false;
    }
  }

  function grantCoins(sign: number) {
    if (!$online.authed) {
      note = 'Сначала войдите под админом';
      return;
    }
    adminGrantCoins(coinsUser.trim(), sign * Math.abs(coinsAmount || 0));
    note = (sign > 0 ? 'Начислено ' : 'Списано ') + Math.abs(coinsAmount || 0) + ' — ' + coinsUser;
  }

  function applyServerPatch() {
    try {
      const data = JSON.parse(serverPatchText);
      adminServerPatch(patchServerId, data);
      note = 'Патч сервера отправлен';
    } catch {
      note = 'Некорректный JSON';
    }
  }

  function applyUserPatch() {
    try {
      const data = JSON.parse(userPatchText);
      adminUserPatch(coinsUser.trim(), data);
      note = 'Патч пользователя отправлен';
    } catch {
      note = 'Некорректный JSON';
    }
  }

  function clearPromo() {
    adminPromoClear();
    note = 'Команда сброса промо отправлена';
  }

  async function checkUpdates() {
    updateState = 'проверяю…';
    const server = $online.server || UPDATE_SERVER;
    const [meta, current] = await Promise.all([fetchLatest(server), currentVersion()]);
    if (!meta) {
      updateState = 'обновлений нет';
      return;
    }
    const newer = isNewer(meta.version, current);
    updateState = newer ? 'доступна ' + meta.version : 'установлена ' + current;
    if (newer) {
      try {
        await installUpdate(server, meta);
      } catch (e) {
        updateState = 'ошибка установки: ' + String(e);
      }
    }
  }

  onMount(refresh);
</script>

<div class="dev-backdrop" role="presentation" on:click={onClose} on:keydown={() => {}}></div>
<div class="dev-panel" role="dialog" aria-modal="true" aria-label="Инструменты разработчика">
  <header class="dev-head">
    <div>
      <h3>Инструменты разработчика</h3>
      <p class="dev-sub">
        канал {CHANNEL} · версия {version || '…'} · {$online.authed ? 'вход: ' + $online.user : 'не авторизован'} · сервер
        {$online.server || UPDATE_SERVER}
      </p>
    </div>
    <button class="ghost" on:click={onClose}>Закрыть</button>
  </header>

  <section class="dev-block">
    <span class="dev-title">Сервер</span>
    <div class="dev-row">
      <input class="dev-input grow" bind:value={address} placeholder="ws://127.0.0.1:8787" spellcheck="false" />
      <button class="ghost" on:click={applyAddress}>Применить адрес</button>
    </div>
    <div class="dev-row">
      <button class="ghost" on:click={checkServer}>Проверить /health</button>
      <button class="ghost" disabled={busy} on:click={startServer}>Запустить</button>
      <button class="ghost" disabled={busy} on:click={stopServer}>Остановить</button>
      <button class="ghost" disabled={busy} on:click={restartServer}>Перезапустить</button>
      <span class="dev-note">{serverPid}</span>
    </div>
    <div class="dev-row">
      <input class="dev-input grow" bind:value={projectDir} placeholder="папка проекта с online-server\server.js" spellcheck="false" />
      <button class="ghost" on:click={() => invoke('open_data_dir').catch(() => {})}>Папка данных</button>
      <button class="ghost" on:click={() => location.reload()}>Перезагрузить окно</button>
    </div>
    {#if healthText}<span class="dev-note">{healthText}</span>{/if}
  </section>

  <section class="dev-block">
    <span class="dev-title">База</span>
    <input class="dev-input" bind:value={dataPath} spellcheck="false" on:change={refresh} />
    <span class="dev-note">
      {#if info.exists}
        серверов {info.servers} · пользователей {info.users} · заказов {info.orders} · {Math.round((info.size || 0) / 1024)} КБ
      {:else}
        файл не найден
      {/if}
    </span>
    <div class="dev-row">
      <button class="ghost" disabled={busy} on:click={makeBackup}>Сделать бэкап</button>
      <select class="dev-input grow" bind:value={backupSel}>
        {#if !backups.length}<option value="">бэкапов нет</option>{/if}
        {#each backups as item (item)}<option value={item}>{item}</option>{/each}
      </select>
      <button class="ghost" disabled={!backupSel || busy} on:click={restoreBackup}>Восстановить</button>
    </div>
  </section>

  <section class="dev-block">
    <span class="dev-title">Монеты</span>
    <div class="dev-row">
      <input class="dev-input" bind:value={coinsUser} placeholder="ник" spellcheck="false" />
      <input class="dev-input" type="number" bind:value={coinsAmount} style="width:110px" />
      <button class="ghost" on:click={() => grantCoins(1)}>Начислить</button>
      <button class="ghost" on:click={() => grantCoins(-1)}>Списать</button>
      <span class="dev-note">баланс: {$online.coins}</span>
    </div>
  </section>

  <section class="dev-block">
    <span class="dev-title">Правка сервера</span>
    <div class="dev-row">
      <select class="dev-input grow" bind:value={patchServerId}>
        {#each $online.publicServers as srv (srv.id)}
          <option value={srv.id}>{srv.name.slice(0, 40)}</option>
        {/each}
      </select>
      <button class="ghost" on:click={clearPromo}>Сбросить всё промо</button>
    </div>
    <textarea class="dev-input" rows="3" bind:value={serverPatchText} spellcheck="false"></textarea>
    <div class="dev-row">
      <button class="ghost" on:click={applyServerPatch}>Применить патч сервера</button>
      <span class="dev-note">поля: name, address, game, desc, hidden, manualMax</span>
    </div>
  </section>

  <section class="dev-block">
    <span class="dev-title">Правка пользователя</span>
    <textarea class="dev-input" rows="3" bind:value={userPatchText} spellcheck="false"></textarea>
    <div class="dev-row">
      <button class="ghost" on:click={applyUserPatch}>Применить патч пользователя</button>
      <span class="dev-note">поля: coins, banned, city, country, statusKind, reputation, displayName</span>
    </div>
  </section>

  <section class="dev-block">
    <span class="dev-title">Лог сервера</span>
    <div class="dev-row">
      <button class="ghost" on:click={loadLog}>Показать последние 120 строк</button>
    </div>
    {#if logText}<pre class="dev-log">{logText}</pre>{/if}
  </section>

  <section class="dev-block">
    <span class="dev-title">Обновления</span>
    <div class="dev-row">
      <button class="ghost" on:click={checkUpdates}>Проверить обновление</button>
      {#if updateState}<span class="dev-note">{updateState}</span>{/if}
    </div>
  </section>

  {#if note}<span class="dev-note strong">{note}</span>{/if}
</div>

<style>
  .dev-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(6, 10, 16, 0.6);
    z-index: 95;
  }
  .dev-panel {
    position: fixed;
    z-index: 96;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: min(680px, calc(100vw - 32px));
    max-height: calc(100vh - 40px);
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 18px;
    border: 1px solid var(--line-soft);
    border-radius: 14px;
    background: var(--panel);
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.45);
  }
  .dev-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 10px;
  }
  .dev-head h3 {
    margin: 0 0 2px;
    font-size: 15px;
  }
  .dev-sub {
    margin: 0;
    font-size: 11px;
    color: var(--muted-2);
    word-break: break-all;
  }
  .dev-block {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding-top: 10px;
    border-top: 1px solid var(--line-soft);
  }
  .dev-title {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--muted-2);
  }
  .dev-row {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .dev-input {
    padding: 7px 9px;
    border: 1px solid var(--line-soft);
    border-radius: 9px;
    background: var(--panel-2, var(--panel));
    color: var(--ink);
    font: inherit;
    font-size: 12px;
    min-width: 0;
    font-family: inherit;
  }
  textarea.dev-input {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 11.5px;
    resize: vertical;
  }
  .dev-input.grow {
    flex: 1;
  }
  .dev-note {
    font-size: 11.5px;
    color: var(--muted);
    word-break: break-word;
  }
  .dev-note.strong {
    color: var(--accent-2, #6f9dff);
  }
  .dev-log {
    max-height: 220px;
    overflow: auto;
    margin: 0;
    padding: 10px;
    border: 1px solid var(--line-soft);
    border-radius: 10px;
    background: rgba(6, 10, 16, 0.5);
    color: var(--muted);
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 11px;
    white-space: pre-wrap;
  }
</style>
