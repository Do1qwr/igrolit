<script lang="ts">
  import { onMount, createEventDispatcher } from 'svelte';
  import { invoke, convertFileSrc } from '@tauri-apps/api/tauri';
  import { t } from '../lib/i18n';
  import { notify } from '../lib/dialogs';

  interface Game {
    id: string;
    name: string;
    platform: string;
    launch_cmd: string;
  }

  interface Usage {
    count: number;
    last: number;
  }

  export let games: Game[] = [];
  export let usage: Record<string, Usage> = {};
  export let favorites: string[] = [];

  const dispatch = createEventDispatcher();
  const DAY = 86_400_000;

  type Mode = 'dusty' | 'favorites' | 'any';

  let mode: Mode = 'dusty';
  let pick: Game | null = null;
  let cover = '';
  let busy = false;
  let tried: string[] = [];

  $: dusty = games.filter((game) => {
    const last = usage[game.id]?.last ?? 0;
    return last === 0 || (Date.now() - last * 1000) / DAY > 30;
  });

  $: pool =
    mode === 'dusty'
      ? dusty
      : mode === 'favorites'
        ? games.filter((game) => favorites.includes(game.id))
        : games;

  function shufflePick(reset = false) {
    if (reset) tried = [];
    const free = pool.filter((game) => !tried.includes(game.id));
    const list = free.length ? free : pool;
    if (!list.length) {
      pick = null;
      cover = '';
      return;
    }
    const next = list[Math.floor(Math.random() * list.length)];
    tried = [...tried, next.id];
    pick = next;
    cover = '';
    loadCover(next);
  }

  async function loadCover(game: Game) {
    try {
      const path = await invoke<string>('get_cover', { appId: game.id });
      if (pick?.id === game.id) cover = convertFileSrc(path);
    } catch {
      cover = '';
    }
  }

  function setMode(next: Mode) {
    mode = next;
    shufflePick(true);
  }

  function initials(name: string): string {
    return name
      .replace(/[^A-Za-zА-Яа-я0-9 ]/g, '')
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0].toUpperCase())
      .join('');
  }

  async function play() {
    if (!pick || busy) return;
    busy = true;
    try {
      await invoke('record_launch', { id: pick.id });
      dispatch('launched');
      await invoke('launch_game', { appId: pick.id, launchCmd: pick.launch_cmd });
      dispatch('close');
    } catch (e) {
      notify(`Не удалось запустить: ${e}`);
    } finally {
      busy = false;
    }
  }

  onMount(() => shufflePick(true));
</script>

<div class="backdrop" role="presentation" on:click={() => dispatch('close')} on:keydown={() => {}}>
  <div class="panel" role="presentation" on:click|stopPropagation on:keydown={() => {}}>
    <header>
      <h2>{$t('pick.title')}</h2>
      <button class="x" on:click={() => dispatch('close')} aria-label="Закрыть">×</button>
    </header>

    <div class="chips">
      <button class="chip" class:on={mode === 'dusty'} on:click={() => setMode('dusty')}>
        {$t('pick.dusty')}
      </button>
      <button class="chip" class:on={mode === 'favorites'} on:click={() => setMode('favorites')}>
        {$t('pick.favorites')}
      </button>
      <button class="chip" class:on={mode === 'any'} on:click={() => setMode('any')}>
        {$t('pick.any')}
      </button>
    </div>

    {#if !pick}
      <p class="empty">{$t('pick.empty')}</p>
    {:else}
      <div class="hero">
        {#if cover}
          <img src={cover} alt={pick.name} on:error={() => (cover = '')} />
        {:else}
          <span class="ph">{initials(pick.name) || '🎮'}</span>
        {/if}
      </div>

      <div class="info">
        <strong>{pick.name}</strong>
        <span class="meta">
          {pick.platform} · {usage[pick.id]?.count ?? 0} {$t('pick.launches')}
        </span>
      </div>

      <div class="actions">
        <button class="ghost" on:click={() => shufflePick()}>{$t('pick.more')}</button>
        <button class="play" on:click={play} disabled={busy}>
          {busy ? '…' : $t('pick.play')}
        </button>
      </div>
    {/if}
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 210;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    background: rgba(0, 0, 0, 0.55);
    backdrop-filter: blur(5px);
  }

  .panel {
    width: 460px;
    max-width: 100%;
    padding: 16px;
    border: 1px solid var(--line);
    border-radius: 16px;
    background: var(--panel);
    box-shadow: 0 26px 70px rgba(0, 0, 0, 0.6);
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
  }
  h2 { margin: 0; font-size: 15px; font-weight: 650; }
  .x {
    width: 26px;
    height: 26px;
    border: 0;
    border-radius: 7px;
    background: var(--panel-2);
    color: var(--muted);
    font-size: 16px;
    cursor: pointer;
  }
  .x:hover { background: var(--hover-2); color: var(--text); }

  .chips { display: flex; gap: 6px; margin-bottom: 12px; flex-wrap: wrap; }
  .chip {
    padding: 6px 10px;
    border: 1px solid var(--line);
    border-radius: 999px;
    background: var(--panel-2);
    color: var(--muted);
    font: inherit;
    font-size: 11.5px;
    cursor: pointer;
  }
  .chip.on {
    border-color: rgba(110, 168, 255, 0.55);
    background: rgba(110, 168, 255, 0.16);
    color: var(--text);
  }

  .hero {
    position: relative;
    aspect-ratio: 16 / 9;
    border-radius: 12px;
    overflow: hidden;
    background: linear-gradient(150deg, var(--panel-3), var(--panel-2));
  }
  .hero img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .ph {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 36px;
    font-weight: 650;
    color: var(--accent);
    opacity: 0.75;
  }

  .info { display: flex; flex-direction: column; gap: 4px; padding: 12px 2px 14px; }
  .info strong { font-size: 16px; font-weight: 650; }
  .meta { font-size: 11.5px; color: var(--muted-2); }

  .actions { display: flex; gap: 8px; }
  .ghost, .play {
    flex: 1;
    height: 38px;
    border-radius: 9px;
    font: inherit;
    font-size: 12.5px;
    font-weight: 600;
    cursor: pointer;
  }
  .ghost {
    border: 1px solid var(--line);
    background: transparent;
    color: var(--text);
  }
  .ghost:hover { background: var(--hover-2); }
  .play {
    border: 1px solid var(--accent);
    background: var(--accent);
    color: var(--ink-on-accent);
  }
  .play:hover:not(:disabled) { filter: brightness(1.08); }
  .play:disabled { cursor: progress; opacity: 0.75; }

  .empty {
    padding: 30px 10px;
    text-align: center;
    font-size: 12.5px;
    color: var(--muted-2);
  }
</style>
