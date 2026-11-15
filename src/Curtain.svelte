<script lang="ts">
  import { onMount } from 'svelte';
  import { invoke } from '@tauri-apps/api/tauri';
  import { t } from './lib/i18n';

  interface Game {
    id: string;
    name: string;
    platform: string;
    launch_cmd: string;
  }

  interface Settings {
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
  }

  let games: Game[] = [];
  let s: Settings | null = null;
  let zoneOpen = false;
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  let ready = false;

  onMount(async () => {
    try {
      const all = await invoke<Game[]>('get_games');
      games = all.slice(0, 6);
    } catch (e) {
      console.error('Не удалось получить игры', e);
    }
    try {
      s = await invoke<Settings>('settings_get');
    } catch (e) {
      console.error('Не удалось прочитать настройки', e);
    }
    ready = true;
  });

  function touch() {
    if (!ready || !s) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      invoke('settings_save', { s }).catch((e) => console.error(e));
    }, 300);
  }

  async function play(game: Game) {
    try {
      await invoke('launch_game', { appId: game.id, launchCmd: game.launch_cmd });
    } catch (e) {
      console.error('Не удалось запустить игру', e);
    }
  }

  function close() {
    invoke('curtain_close').catch(() => {});
  }

  function openMain() {
    invoke('open_main').catch(() => {});
    invoke('curtain_close').catch(() => {});
  }

  async function toggleEnabled() {
    if (!s) return;
    const next = !s.curtain_enabled;
    s.curtain_enabled = next;
    try {
      await invoke('curtain_set_enabled', { enabled: next });
    } catch (e) {
      console.error('Не удалось переключить шторку', e);
    }
  }
</script>

<svelte:window
  on:keydown={(e) => {
    if (e.key === 'Escape') close();
  }}
/>

<div class="curtain" on:change={touch} on:input={touch}>
  <header class="head">
    <span class="dot"></span>
    <strong>{$t('curtain.title')}</strong>
    <span class="tail">
      {#if s}
        <button
          class="power"
          class:on={s.curtain_enabled}
          title={s.curtain_enabled ? 'Выключить шторку' : 'Включить шторку'}
          on:click={toggleEnabled}
        >
          {s.curtain_enabled ? $t('curtain.on') : $t('curtain.off')}
        </button>
      {/if}
    </span>
    <button class="x" title={$t('curtain.hide')} aria-label={$t('curtain.hide')} on:click={close}>×</button>
  </header>

  <div class="body">
    <p class="sect">{$t('curtain.quick')}</p>
    {#if games.length === 0}
      <p class="empty">Игр пока нет</p>
    {:else}
      {#each games as g (g.id)}
        <button class="game" on:click={() => play(g)}>
          <span class="gname">{g.name}</span>
          <span class="gplat">{g.platform}</span>
          <span class="play">▶</span>
        </button>
      {/each}
    {/if}

    {#if s}
      <button class="zone-toggle" class:open={zoneOpen} on:click={() => (zoneOpen = !zoneOpen)}>
        <span>{$t('curtain.zone')}</span>
        <span class="chev">{zoneOpen ? '▾' : '▸'}</span>
      </button>

      {#if zoneOpen}
        <div class="zone">
          <div class="corners">
            <button class="chip" class:on={s.corner_tl} on:click={() => { if (s) s.corner_tl = !s.corner_tl; }}>{$t('corner.tl')}</button>
            <button class="chip" class:on={s.corner_tr} on:click={() => { if (s) s.corner_tr = !s.corner_tr; }}>{$t('corner.tr')}</button>
            <button class="chip" class:on={s.corner_bl} on:click={() => { if (s) s.corner_bl = !s.corner_bl; }}>{$t('corner.bl')}</button>
            <button class="chip" class:on={s.corner_br} on:click={() => { if (s) s.corner_br = !s.corner_br; }}>{$t('corner.br')}</button>
          </div>

          <label class="row">
            <span>{$t('row.edge')}</span>
            <select bind:value={s.curtain_edge}>
              <option value="right">{$t('edge.right')}</option>
              <option value="left">{$t('edge.left')}</option>
            </select>
          </label>

          <label class="row">
            <span>{$t('row.zoneSize')}</span>
            <input type="number" bind:value={s.corner_size} min="40" max="400" step="10" />
          </label>

          <label class="row">
            <span>{$t('row.speed')}</span>
            <input type="number" bind:value={s.min_speed} min="10" max="600" step="10" />
          </label>

          <label class="row">
            <span>{$t('row.dwell')}</span>
            <input type="number" bind:value={s.dwell_ms} min="0" max="1000" step="10" />
          </label>

          <p class="note">{$t('curtain.saveNote')}</p>
        </div>
      {/if}
    {/if}
  </div>

  <footer class="foot">
    <button class="ghost" on:click={openMain}>{$t('curtain.open')}</button>
    <button class="ghost" on:click={close}>{$t('curtain.hide')}</button>
  </footer>
</div>

<style>
  :global(body.curtain-window) {
    background: transparent;
    overflow: hidden;
  }

  .curtain {
    height: 100vh;
    display: flex;
    flex-direction: column;
    margin: 8px;
    border-radius: 14px;
    background: var(--curtain-bg);
    border: 1px solid rgba(255, 255, 255, 0.08);
    box-shadow: 0 18px 40px rgba(0, 0, 0, 0.45);
    backdrop-filter: blur(14px);
    overflow: hidden;
    color: var(--text);
    font-family: "Segoe UI Variable Text", "Segoe UI", sans-serif;
  }

  .head {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 12px 10px;
  }
  .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--accent);
    box-shadow: 0 0 10px rgba(110, 168, 255, 0.8);
  }
  .head strong { font-size: 13px; letter-spacing: 0.2px; }
  .tail { flex: 1; text-align: right; }
  .power {
    padding: 4px 9px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 999px;
    background: transparent;
    color: var(--muted);
    font: inherit;
    font-size: 10.5px;
    letter-spacing: 0.3px;
    cursor: pointer;
  }
  .power.on {
    border-color: rgba(110, 168, 255, 0.5);
    background: rgba(110, 168, 255, 0.14);
    color: #cfe0ff;
  }
  .power:hover { background: rgba(255, 255, 255, 0.08); }
  .x {
    width: 24px;
    height: 24px;
    border: 0;
    border-radius: 7px;
    background: rgba(255, 255, 255, 0.06);
    color: #cfd6e4;
    font-size: 15px;
    line-height: 1;
    cursor: pointer;
  }
  .x:hover { background: rgba(239, 91, 91, 0.22); color: var(--danger); }

  .body {
    flex: 1;
    overflow-y: auto;
    padding: 0 10px 8px;
  }
  .body::-webkit-scrollbar { width: 6px; }
  .body::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.12); border-radius: 3px; }

  .sect {
    margin: 4px 2px 6px;
    font-size: 10px;
    letter-spacing: 1px;
    text-transform: uppercase;
    color: var(--muted-2);
  }

  .game {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 9px 9px;
    margin-bottom: 4px;
    border: 1px solid transparent;
    border-radius: 9px;
    background: rgba(255, 255, 255, 0.03);
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .game:hover { background: rgba(110, 168, 255, 0.12); border-color: rgba(110, 168, 255, 0.25); }
  .gname { flex: 1; font-size: 12.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .gplat { font-size: 10px; color: var(--muted-2); text-transform: uppercase; }
  .play { font-size: 10px; color: var(--accent); }

  .zone-toggle {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 10px;
    padding: 10px 10px;
    border: 1px solid rgba(255, 255, 255, 0.07);
    border-radius: 9px;
    background: rgba(255, 255, 255, 0.03);
    color: inherit;
    font: inherit;
    font-size: 12.5px;
    cursor: pointer;
  }
  .zone-toggle:hover { background: rgba(255, 255, 255, 0.06); }
  .zone-toggle.open { border-color: rgba(110, 168, 255, 0.35); background: rgba(110, 168, 255, 0.1); }
  .chev { color: var(--muted); font-size: 11px; }

  .zone {
    margin-top: 6px;
    padding: 8px;
    border-radius: 9px;
    background: rgba(0, 0, 0, 0.22);
  }

  .corners { display: grid; grid-template-columns: repeat(4, 1fr); gap: 5px; margin-bottom: 8px; }
  .chip {
    padding: 7px 0;
    border: 1px solid rgba(255, 255, 255, 0.09);
    border-radius: 7px;
    background: transparent;
    color: var(--muted);
    font: inherit;
    font-size: 11px;
    cursor: pointer;
  }
  .chip.on {
    border-color: rgba(110, 168, 255, 0.5);
    background: rgba(110, 168, 255, 0.16);
    color: #d6e4ff;
  }

  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 4px 2px;
    font-size: 12px;
    color: #c3cad8;
  }
  .row input,
  .row select {
    width: 92px;
    padding: 5px 7px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.05);
    color: var(--text);
    font: inherit;
    font-size: 11.5px;
    outline: none;
  }
  .row input:focus,
  .row select:focus { border-color: rgba(110, 168, 255, 0.6); }

  .note { margin: 6px 2px 2px; font-size: 10.5px; color: var(--muted-2); }
  .empty { margin: 6px 2px 10px; font-size: 11.5px; color: var(--muted-2); }

  .foot {
    display: flex;
    gap: 6px;
    padding: 9px 10px 10px;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
  }
  .ghost {
    flex: 1;
    padding: 8px 0;
    border: 1px solid rgba(255, 255, 255, 0.09);
    border-radius: 8px;
    background: transparent;
    color: #c3cad8;
    font: inherit;
    font-size: 11.5px;
    cursor: pointer;
  }
  .ghost:hover { background: rgba(255, 255, 255, 0.06); color: var(--text); }
</style>
