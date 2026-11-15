<script lang="ts">
  import { createEventDispatcher } from 'svelte';
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

  const dispatch = createEventDispatcher();

  let covers: Record<string, string> = {};
  let launching: string | null = null;

  const DAY = 86_400_000;

  function whenText(id: string): string {
    const last = usage[id]?.last ?? 0;
    if (!last) return '';
    const lastMs = last < 1_000_000_000_000 ? last * 1000 : last;
    const days = Math.floor((Date.now() - lastMs) / DAY);
    if (days <= 0) return $t('cont.today');
    if (days === 1) return $t('cont.yesterday');
    return $t('cont.daysAgo', { n: days });
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

  async function loadCover(game: Game) {
    try {
      const path = await invoke<string>('get_cover', { appId: game.id });
      covers = { ...covers, [game.id]: convertFileSrc(path) };
    } catch {
      covers = { ...covers, [game.id]: '' };
    }
  }

  $: games.forEach((game) => {
    if (!(game.id in covers)) loadCover(game);
  });

  async function play(game: Game) {
    if (launching) return;
    launching = game.id;
    try {
      await invoke('record_launch', { id: game.id });
      dispatch('launched');
      await invoke('launch_game', { appId: game.id, launchCmd: game.launch_cmd });
      window.dispatchEvent(
        new CustomEvent('launcher:launch', { detail: { name: game.name } }),
      );
    } catch (e) {
      notify(`Не удалось запустить: ${e}`);
    } finally {
      setTimeout(() => (launching = null), 1200);
    }
  }
</script>

<section class="cont">
  <header class="head">
    <h2>{$t('cont.title')}</h2>
    <span class="sub">{$t('cont.sub')}</span>
  </header>

  <div class="strip">
    {#each games as game (game.id)}
      <button class="tile" on:click={() => play(game)} disabled={launching === game.id}>
        <span class="art">
          {#if covers[game.id]}
            <img src={covers[game.id]} alt={game.name} on:error={() => (covers = { ...covers, [game.id]: '' })} />
          {:else}
            <span class="ph">{initials(game.name) || '🎮'}</span>
          {/if}
          <span class="shade"></span>
          <span class="plat">{game.platform}</span>
          <span class="go">{launching === game.id ? '…' : '▶'}</span>
        </span>
        <span class="cap">
          <strong title={game.name}>{game.name}</strong>
          <span class="when">{whenText(game.id)}</span>
        </span>
      </button>
    {/each}
  </div>
</section>

<style>
  .cont { margin-bottom: var(--space-6, 24px); }

  .head {
    display: flex;
    align-items: baseline;
    gap: 10px;
    margin-bottom: 12px;
  }
  h2 {
    margin: 0;
    font-size: var(--fs-lg, 15px);
    font-weight: 650;
    letter-spacing: -0.01em;
  }
  .sub { font-size: var(--fs-xs, 11.5px); color: var(--muted-2); }

  .strip {
    display: flex;
    gap: 12px;
    overflow-x: auto;
    padding-bottom: 8px;
    scroll-snap-type: x proximity;
    scrollbar-width: thin;
    scrollbar-color: rgba(255, 255, 255, 0.16) transparent;
  }
  .strip::-webkit-scrollbar { height: 8px; }
  .strip::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.12);
    border-radius: var(--radius-pill, 999px);
  }

  .tile {
    flex: none;
    width: 236px;
    padding: 0;
    border: 1px solid var(--line-soft);
    border-radius: var(--radius);
    background: var(--panel);
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
    overflow: hidden;
    scroll-snap-align: start;
    transition: transform var(--dur, 0.16s) var(--ease, ease),
      border-color var(--dur, 0.16s) var(--ease, ease),
      box-shadow var(--dur, 0.16s) var(--ease, ease);
  }
  .tile:hover:not(:disabled) {
    transform: translateY(-2px);
    border-color: rgba(138, 180, 255, 0.22);
    box-shadow: var(--shadow-md, 0 10px 24px rgba(9, 12, 20, 0.32));
  }
  .tile:disabled { cursor: progress; }
  .tile:focus-visible {
    outline: 2px solid rgba(110, 168, 255, 0.65);
    outline-offset: 2px;
  }

  .art {
    position: relative;
    display: block;
    aspect-ratio: 16 / 9;
    background: linear-gradient(150deg, var(--panel-3), var(--panel-2));
    overflow: hidden;
  }
  .art img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
    transition: transform 0.4s ease;
  }
  .tile:hover .art img { transform: scale(1.04); }

  .ph {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 26px;
    font-weight: 650;
    letter-spacing: 1px;
    color: var(--accent);
    opacity: 0.7;
  }

  .shade {
    position: absolute;
    inset: auto 0 0 0;
    height: 55%;
    background: linear-gradient(to top, rgba(10, 12, 17, 0.78), transparent);
  }

  .plat {
    position: absolute;
    top: 10px;
    left: 10px;
    padding: 3px 8px;
    font-size: var(--fs-2xs, 10.5px);
    font-weight: 650;
    letter-spacing: 0.5px;
    border-radius: 6px;
    background: rgba(10, 12, 17, 0.72);
    border: 1px solid rgba(255, 255, 255, 0.09);
    color: var(--text);
    backdrop-filter: blur(3px);
  }

  .go {
    position: absolute;
    right: 10px;
    bottom: 10px;
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    border-radius: 50%;
    background: rgba(10, 12, 17, 0.75);
    border: 1px solid rgba(255, 255, 255, 0.14);
    color: var(--accent);
    opacity: 0;
    transform: scale(0.9);
    transition: opacity var(--dur, 0.16s) var(--ease, ease),
      transform var(--dur, 0.16s) var(--ease, ease);
  }
  .tile:hover .go,
  .tile:focus-visible .go { opacity: 1; transform: scale(1); }

  .cap {
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 10px 12px 12px;
  }
  .cap strong {
    font-size: var(--fs-sm, 12.5px);
    font-weight: 600;
    line-height: 1.3;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .when { font-size: var(--fs-2xs, 10.5px); color: var(--muted-2); }
</style>
