<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { invoke } from '@tauri-apps/api/tauri';
  import { t } from './lib/i18n';

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

  interface Prefs {
    favorites: string[];
    usage: Record<string, Usage>;
  }

  type Row =
    | { kind: 'game'; game: Game; meta: string }
    | { kind: 'action'; id: 'open' | 'quit'; label: string; meta: string };

  let games: Game[] = [];
  let prefs: Prefs = { favorites: [], usage: {} };
  let query = '';
  let active = 0;
  let loading = true;
  let inputEl: HTMLInputElement;
  let listEl: HTMLDivElement;
  let busy = false;
  let failed = '';

  const DAY = 86_400_000;

  function score(text: string, q: string): number {
    if (!q) return 0;
    if (text === q) return 1000;
    if (text.startsWith(q)) return 800 - text.length;
    const direct = text.indexOf(q);
    if (direct >= 0) return 600 - direct;

    let ti = 0;
    let hits = 0;
    let streak = 0;
    let best = 0;
    for (const ch of q) {
      const found = text.indexOf(ch, ti);
      if (found < 0) return 0;
      if (found === ti) {
        streak += 1;
        best = Math.max(best, streak);
      } else {
        streak = 0;
      }
      ti = found + 1;
      hits += 1;
    }
    return 200 + hits * 2 + best * 8;
  }

  function lastOf(game: Game): number {
    return prefs.usage[game.id]?.last ?? 0;
  }

  function whenText(ts: number): string {
    if (!ts) return $t('pal.never');
    const days = Math.floor((Date.now() - ts) / DAY);
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

  $: q = query.trim().toLowerCase();

  $: gameRows = games
    .map((game) => ({ game, rank: q ? score(game.name.toLowerCase(), q) : 0 }))
    .filter((row) => !q || row.rank > 0)
    .sort((a, b) => (q ? b.rank - a.rank : lastOf(b.game) - lastOf(a.game)))
    .slice(0, 40)
    .map<Row>(({ game }) => ({ kind: 'game', game, meta: whenText(lastOf(game)) }));

  $: actionRows = (
    [
      { kind: 'action' as const, id: 'open' as const, label: $t('pal.open'), meta: '↵' },
      { kind: 'action' as const, id: 'quit' as const, label: $t('pal.quit'), meta: '↵' },
    ] satisfies Row[]
  ).filter((row) => !q || row.label.toLowerCase().includes(q));

  $: rows = [...gameRows, ...actionRows];

  $: if (active > rows.length - 1) active = Math.max(0, rows.length - 1);

  function close() {
    invoke('palette_close').catch(() => {});
  }

  async function activate(row: Row | undefined) {
    if (!row || busy) return;
    busy = true;
    failed = '';
    try {
      if (row.kind === 'game') {
        await invoke('record_launch', { id: row.game.id });
        await invoke('launch_game', { appId: row.game.id, launchCmd: row.game.launch_cmd });
        close();
      } else if (row.id === 'open') {
        await invoke('open_main');
        close();
      } else {
        await invoke('quit_app');
      }
    } catch (e) {
      failed = typeof e === 'string' ? e : 'Не удалось выполнить';
    } finally {
      busy = false;
    }
  }

  async function scrollActive() {
    await tick();
    const node = listEl?.querySelector<HTMLElement>('.row.on');
    node?.scrollIntoView({ block: 'nearest' });
  }

  function onKey(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      active = Math.min(active + 1, Math.max(0, rows.length - 1));
      scrollActive();
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      active = Math.max(active - 1, 0);
      scrollActive();
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      activate(rows[active]);
      return;
    }
    if (event.key === ' ' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      close();
    }
  }

  onMount(async () => {
    inputEl?.focus();
    try {
      const [all, stored] = await Promise.all([
        invoke<Game[]>('get_games'),
        invoke<Prefs>('get_prefs'),
      ]);
      games = all;
      prefs = stored;
    } catch (e) {
      console.error('Не удалось открыть палитру', e);
    } finally {
      loading = false;
    }
    await tick();
    inputEl?.focus();
  });
</script>

<svelte:window on:keydown={onKey} on:blur={close} />

<div class="pal">
  <div class="field">
    <span class="lens" aria-hidden="true">⌕</span>
    <input
      bind:this={inputEl}
      bind:value={query}
      on:input={() => (active = 0)}
      placeholder={$t('pal.placeholder')}
      spellcheck="false"
      autocomplete="off"
      aria-label={$t('pal.placeholder')}
    />
    <kbd>Esc</kbd>
  </div>

  <div class="list" bind:this={listEl}>
    {#if loading}
      <div class="empty">{$t('state.scanning')}</div>
    {:else if rows.length === 0}
      <div class="empty">{$t('pal.empty')}</div>
    {:else}
      {#each rows as row, i (row.kind === 'game' ? 'g' + row.game.id : 'a' + row.id)}
        <button
          class="row"
          class:on={i === active}
          on:mouseenter={() => (active = i)}
          on:click={() => activate(row)}
        >
          {#if row.kind === 'game'}
            <span class="badge">{initials(row.game.name) || '🎮'}</span>
            <span class="name">{row.game.name}</span>
            <span class="plat">{row.game.platform}</span>
            <span class="meta">{row.meta}</span>
            <span class="play">▶</span>
          {:else}
            <span class="badge act">⌘</span>
            <span class="name">{row.label}</span>
            <span class="meta">{row.meta}</span>
          {/if}
        </button>
      {/each}
    {/if}
  </div>

  {#if failed}
    <p class="failed">{failed}</p>
  {/if}

  <footer class="hint">{$t('pal.hint')}</footer>
</div>

<style>
  :global(body.palette-window) {
    background: transparent;
    overflow: hidden;
  }

  .pal {
    height: calc(100vh - 20px);
    margin: 10px;
    display: flex;
    flex-direction: column;
    border-radius: 16px;
    border: 1px solid rgba(255, 255, 255, 0.10);
    background: var(--panel-2);
    backdrop-filter: blur(18px);
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.55);
    overflow: hidden;
    color: var(--text);
    font-family: "Segoe UI Variable Text", "Segoe UI", sans-serif;
  }

  .field {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 14px 16px;
    border-bottom: 1px solid var(--line-soft);
  }
  .lens { font-size: 17px; color: var(--accent); }
  .field input {
    flex: 1;
    min-width: 0;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--text);
    font: inherit;
    font-size: 17px;
    outline: none;
  }
  .field input::placeholder { color: var(--muted-2); }
  kbd {
    padding: 2px 6px;
    border: 1px solid var(--line);
    border-radius: 5px;
    font-size: 10px;
    color: var(--muted);
  }

  .list {
    flex: 1;
    overflow-y: auto;
    padding: 6px;
  }
  .list::-webkit-scrollbar { width: 6px; }
  .list::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.12); border-radius: 3px; }

  .row {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    border: 1px solid transparent;
    border-radius: 9px;
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .row:hover { background: rgba(255, 255, 255, 0.04); }
  .row.on {
    background: rgba(110, 168, 255, 0.14);
    border-color: rgba(110, 168, 255, 0.32);
  }

  .badge {
    width: 26px;
    height: 26px;
    flex: none;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 7px;
    background: var(--panel-3);
    border: 1px solid var(--line-soft);
    color: var(--accent);
    font-size: 10.5px;
    font-weight: 650;
  }
  .badge.act { color: var(--accent-2); font-size: 13px; }

  .name {
    flex: 1;
    min-width: 0;
    font-size: 13.5px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .plat {
    font-size: 9.5px;
    letter-spacing: 0.6px;
    text-transform: uppercase;
    color: var(--muted-2);
  }
  .meta {
    font-size: 11px;
    color: var(--muted-2);
    white-space: nowrap;
  }
  .play {
    font-size: 9px;
    color: var(--accent);
    opacity: 0;
    transition: opacity 0.12s ease;
  }
  .row.on .play { opacity: 1; }

  .empty {
    padding: 26px 12px;
    text-align: center;
    font-size: 12.5px;
    color: var(--muted-2);
  }
  .failed {
    margin: 0;
    padding: 8px 16px;
    font-size: 11.5px;
    color: var(--danger);
    background: rgba(239, 91, 91, 0.12);
  }

  .hint {
    padding: 8px 14px;
    border-top: 1px solid var(--line-soft);
    font-size: 10.5px;
    color: var(--muted-2);
  }
</style>
