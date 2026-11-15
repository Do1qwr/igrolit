<script lang="ts">
  import { invoke, convertFileSrc } from '@tauri-apps/api/tauri';
  import { createEventDispatcher, onMount } from 'svelte';
  import { notify } from '../lib/dialogs';

  const dispatch = createEventDispatcher();

  export let game: {
    id: string;
    name: string;
    platform: string;
    launch_cmd: string;
    size_bytes?: number;
    update_bytes?: number;
  };
  export let rect: { left: number; top: number; width: number; height: number };
  export let favorite = false;
  export let stat: { minutes: number; minutes_2wks: number; last_played: number } | undefined = undefined;
  export let launches = 0;
  export let lastLaunched = 0;
  export let hidePlaytime = false;

  let hero = '';
  let loaded = false;
  let args = '';
  let missingDeps: string[] = [];

  const WIDTH = 320;
  const GAP = 14;

  $: left =
    rect.left + rect.width + GAP + WIDTH <= window.innerWidth
      ? rect.left + rect.width + GAP
      : Math.max(8, rect.left - WIDTH - GAP);
  $: top = Math.min(Math.max(rect.top, 8), Math.max(8, window.innerHeight - 300));

  $: totalMinutes = stat?.minutes ?? 0;
  $: twoWeekMinutes = stat?.minutes_2wks ?? 0;
  $: lastPlayedUnix = Math.max(stat?.last_played ?? 0, lastLaunched);

  function formatHours(minutes: number): string {
    const hours = minutes / 60;
    if (hours >= 100) return `${Math.round(hours)} ч.`;
    const value = hours.toFixed(1).replace('.', ',');
    return `${value.replace(',0', '')} ч.`;
  }

  function formatDate(unix: number): string {
    if (!unix) return '';
    const d = new Date(unix * 1000);
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  function formatSize(bytes: number): string {
    const gb = bytes / (1024 * 1024 * 1024);
    if (gb >= 1) return `${gb.toFixed(1).replace('.', ',')} ГБ`;
    return `${Math.max(1, Math.round(bytes / (1024 * 1024)))} МБ`;
  }

  async function saveArgs() {
    try {
      await invoke('set_launch_args', { appId: game.id, args });
    } catch (e) {
      console.error(e);
    }
  }

  function onArgsKey(e: KeyboardEvent) {
    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
  }

  async function validateFiles() {
    try {
      await invoke('validate_game', { appId: game.id });
    } catch (e) {
      notify(String(e));
    }
  }

  $: initials = game.name
    .replace(/[^A-Za-zА-Яа-я0-9 ]/g, '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');

  onMount(async () => {
    try {
      args = await invoke<string>('get_launch_args', { appId: game.id });
    } catch {
      args = '';
    }
    try {
      missingDeps = await invoke<string[]>('deps_status', { appId: game.id });
    } catch {
      missingDeps = [];
    }
    if (game.platform === 'Custom') {
      loaded = true;
      return;
    }
    try {
      const path = await invoke<string>('get_hero', { appId: game.id });
      hero = convertFileSrc(path);
    } catch (e) {
      hero = '';
    } finally {
      loaded = true;
    }
  });
</script>

<div
  class="preview"
  style="left: {left}px; top: {top}px; width: {WIDTH}px;"
  role="presentation"
  on:mouseenter={() => dispatch('keep')}
  on:mouseleave={() => dispatch('hide')}
>
  <header class="head">
    <h4>{game.name}</h4>
    {#if favorite}<span class="fav" title="В избранном">★</span>{/if}
  </header>

  <div class="shot">
    {#if !loaded}
      <div class="ph"><span class="spinner"></span></div>
    {:else if hero}
      <img src={hero} alt={game.name} />
    {:else}
      <div class="ph"><span class="initials">{initials || '🎮'}</span></div>
    {/if}
  </div>

  <div class="body">
    {#if !hidePlaytime && totalMinutes > 0}
      <p class="label">Вы играли</p>
      {#if twoWeekMinutes > 0}
        <p class="stat">{formatHours(twoWeekMinutes)} за последние две недели</p>
      {/if}
      <p class="stat strong">{formatHours(totalMinutes)} всего</p>
    {:else if launches > 0}
      <p class="label">Запусков через лаунчер</p>
      <p class="stat strong">{launches}</p>
      {#if lastPlayedUnix}
        <p class="stat">Последний запуск — {formatDate(lastPlayedUnix)}</p>
      {/if}
    {:else if lastPlayedUnix}
      <p class="label">Последний запуск</p>
      <p class="stat">{formatDate(lastPlayedUnix)}</p>
    {:else}
      <p class="label">Ещё не запускалась</p>
    {/if}

    {#if game.size_bytes}
      <p class="stat">На диске — {formatSize(game.size_bytes)}</p>
    {/if}
    {#if game.update_bytes}
      <p class="stat update">Обновление — {formatSize(game.update_bytes)}</p>
    {/if}
    {#if missingDeps.length}
      <p class="stat deps">Не хватает: {missingDeps.join(', ')}</p>
    {/if}

    <label class="opts">
      <span class="opts-label">Параметры запуска</span>
      <input
        class="opts-input"
        type="text"
        placeholder="-dx11 -windowed"
        bind:value={args}
        on:blur={saveArgs}
        on:keydown={onArgsKey}
      />
    </label>

    {#if game.platform === 'Steam'}
      <button class="check" on:click={validateFiles}>Проверить файлы</button>
    {/if}

    <span class="platform">{game.platform}</span>
  </div>
</div>

<style>
  .preview {
    position: fixed;
    z-index: 50;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 10px;
    box-shadow: 0 18px 50px rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(10px);
    overflow: hidden;
    pointer-events: auto;
    animation: appear 0.14s ease both;
  }
  @keyframes appear {
    from { opacity: 0; transform: translateY(4px); }
    to { opacity: 1; transform: none; }
  }

  .head {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
  }
  h4 {
    flex: 1;
    min-width: 0;
    font-size: 13px;
    font-weight: 650;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .fav { color: var(--accent); font-size: 12px; }

  .shot {
    position: relative;
    aspect-ratio: 16 / 7;
    background: var(--panel-2);
    overflow: hidden;
  }
  .shot img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .ph {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(150deg, var(--panel-3), var(--panel-2));
  }
  .initials {
    font-size: 30px;
    font-weight: 600;
    color: var(--accent);
    opacity: 0.75;
    letter-spacing: 1px;
  }
  .spinner {
    width: 24px;
    height: 24px;
    border: 2px solid var(--line);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 0.9s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  .body {
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 11px 12px 12px;
  }
  .label {
    font-size: 11.5px;
    color: var(--muted);
    margin-bottom: 2px;
  }
  .stat {
    font-size: 12.5px;
    color: var(--muted);
    line-height: 1.45;
  }
  .stat.strong { color: var(--text); font-size: 13px; }
  .stat.update { color: #ffd48a; }
  .stat.deps { color: var(--danger); }

  .opts { display: block; margin-top: 8px; }
  .opts-label {
    display: block;
    font-size: 9.5px;
    text-transform: uppercase;
    letter-spacing: 0.6px;
    color: var(--muted-2);
    margin-bottom: 4px;
  }
  .opts-input {
    width: 100%;
    height: 26px;
    padding: 0 8px;
    border: 1px solid var(--line-soft);
    border-radius: 6px;
    background: var(--panel-2);
    color: var(--text);
    font: inherit;
    font-size: 11px;
  }
  .opts-input:focus { outline: none; border-color: var(--accent); }

  .check {
    align-self: flex-start;
    margin-top: 8px;
    height: 26px;
    padding: 0 10px;
    border: 1px solid var(--line);
    border-radius: 6px;
    background: var(--panel-2);
    color: var(--text);
    font: inherit;
    font-size: 11px;
    cursor: pointer;
  }
  .check:hover { border-color: var(--accent); }

  .platform {
    align-self: flex-start;
    margin-top: 9px;
    padding: 2px 7px;
    font-size: 10px;
    font-weight: 650;
    letter-spacing: 0.5px;
    border-radius: 5px;
    color: var(--muted);
    border: 1px solid var(--line);
  }
</style>
