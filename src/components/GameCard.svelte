<script lang="ts">
  import { invoke, convertFileSrc } from '@tauri-apps/api/tauri';
  import { open } from '@tauri-apps/api/dialog';
  import { createEventDispatcher, onMount } from 'svelte';
  import { notify, ask } from '../lib/dialogs';

  const dispatch = createEventDispatcher();

  export let game: {
    id: string;
    name: string;
    platform: string;
    launch_cmd: string;
  };

  export let favorite = false;

  export let layout: 'grid' | 'list' = 'grid';

  let coverUrl = '';
  let loading = true;
  let cardEl: HTMLDivElement | null = null;
  let coverRequested = false;

  // Общая на все карточки память: повторно не дёргаем Rust и не качаем файл.
  const coverCache = new Map<string, string>();

  onMount(() => {
    if (coverRequested) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        if (!coverRequested) {
          coverRequested = true;
          loadCover();
        }
      },
      { rootMargin: '320px' },
    );
    if (cardEl) observer.observe(cardEl);
    return () => observer.disconnect();
  });
  let launching = false;

  $: initials = game.name
    .replace(/[^A-Za-zА-Яа-я0-9 ]/g, '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');

  async function loadCover() {
    const cached = coverCache.get(game.id);
    if (cached) {
      coverUrl = cached;
      loading = false;
      return;
    }
    try {
      const path = await invoke<string>('get_cover', { appId: game.id });
      const url = convertFileSrc(path);
      coverCache.set(game.id, url);
      coverUrl = url;
    } catch (e) {
      coverUrl = '';
    } finally {
      loading = false;
    }
  }

  async function launchGame() {
    launching = true;
    try {
      await invoke('record_launch', { id: game.id });
      dispatch('launched');
      await invoke('launch_game', { appId: game.id, launchCmd: game.launch_cmd });
      window.dispatchEvent(
        new CustomEvent('launcher:launch', { detail: { name: game.name } }),
      );
      setTimeout(() => { launching = false; }, 2000);
    } catch (e) {
      launching = false;
      notify(`Не удалось запустить: ${e}`);
    }
  }

  async function removeGame(event: MouseEvent) {
    event.stopPropagation();
    if (
      !(await ask({
        title: 'Удалить игру?',
        message: `«${game.name}» исчезнет из списка лаунчера. Файлы игры останутся на диске.`,
        okLabel: 'Удалить',
        danger: true,
      }))
    )
      return;
    try {
      await invoke('remove_custom_game', { path: game.launch_cmd });
      dispatch('removed');
    } catch (e) {
      notify(`Не удалось удалить: ${e}`);
    }
  }

  async function pickCover(event: MouseEvent) {
    event.stopPropagation();
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: 'Обложка', extensions: ['jpg', 'jpeg', 'png', 'webp'] }],
      });
      if (!selected || typeof selected !== 'string') return;
      const path = await invoke<string>('set_custom_cover_file', {
        id: game.id,
        source: selected,
      });
      const url = convertFileSrc(path);
      coverCache.set(game.id, url);
      coverUrl = url;
      loading = false;
    } catch (e) {
      notify(`Не удалось поставить обложку: ${e}`);
    }
  }

  function rectOf(el: Element) {
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  }

  function onEnter(event: MouseEvent) {
    dispatch('hover', { game, rect: rectOf(event.currentTarget as HTMLElement) });
  }

  function onFocus(event: FocusEvent) {
    dispatch('hover', { game, rect: rectOf(event.currentTarget as HTMLElement) });
  }

  function onLeave() {
    dispatch('leave');
  }
</script>

<div
  class="card"
  class:list={layout === 'list'}
  bind:this={cardEl}
  role="button"
  tabindex="0"
  on:mouseenter={onEnter}
  on:mouseleave={onLeave}
  on:focus={onFocus}
  on:blur={onLeave}
  on:keydown={(e) => {
    if (e.key === 'Enter' && e.target === e.currentTarget) {
      e.preventDefault();
      launchGame();
    }
  }}
>
  <div class="cover">
    {#if loading}
      <div class="ph"><span class="spinner"></span></div>
    {:else if coverUrl}
      <img src={coverUrl} alt={game.name} on:error={() => { coverUrl = ''; }} />
    {:else}
      <div class="ph"><span class="initials">{initials || '🎮'}</span></div>
    {/if}

    <span class="tag tag-{game.platform.toLowerCase()}">{game.platform}</span>

    <div class="actions">
      <button
        class="star"
        class:on={favorite}
        title={favorite ? 'Убрать из избранного' : 'В избранное'}
        aria-label="Избранное"
        on:click|stopPropagation={() => dispatch('favorite', game.id)}
      >
        {favorite ? '★' : '☆'}
      </button>

      {#if game.platform === 'Custom'}
        <button class="cover" title="Сменить обложку" on:click={pickCover} aria-label="Сменить обложку">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="3.5" y="5" width="17" height="14" rx="2.4" />
            <circle cx="8.8" cy="10" r="1.6" />
            <path d="M4.6 17.2l4.5-4.3 3.5 3.1 3-2.5 3.7 3.7" />
          </svg>
        </button>
        <button class="remove" title="Удалить из списка" on:click={removeGame} aria-label="Удалить">
          ×
        </button>
      {/if}
    </div>

    <div class="shade"></div>
  </div>

  <div class="body">
    <h3 title={game.name}>{game.name}</h3>
    <button class="play" on:click={launchGame} disabled={launching}>
      {#if launching}
        <span class="pulse"></span> Запуск…
      {:else}
        <svg class="play-ic" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M8 5.4v13.2L18.6 12z" />
        </svg>
        Играть
      {/if}
    </button>
  </div>
</div>

<style>
  .card {
    display: flex;
    flex-direction: column;
    background: var(--panel);
    border: 1px solid var(--line-soft);
    border-radius: var(--radius);
    overflow: hidden;
    transition: transform var(--dur, 0.16s) var(--ease, ease),
      border-color var(--dur, 0.16s) var(--ease, ease),
      box-shadow var(--dur, 0.16s) var(--ease, ease);
  }
  .card:hover {
    transform: translateY(-2px);
    border-color: rgba(138, 180, 255, 0.22);
    box-shadow: var(--shadow-md, 0 10px 24px rgba(9, 12, 20, 0.32));
  }
  .card:focus-visible {
    outline: 2px solid rgba(110, 168, 255, 0.65);
    outline-offset: 2px;
  }

  .card.list {
    flex-direction: row;
    align-items: stretch;
    min-height: 88px;
    border-radius: var(--radius-md, 12px);
  }
  .card.list .cover {
    flex: 0 0 128px;
    aspect-ratio: auto;
  }
  .card.list .body {
    flex: 1;
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 14px;
  }
  .card.list .body h3 {
    flex: 1;
    min-width: 0;
  }

  .cover {
    position: relative;
    aspect-ratio: 16 / 9;
    background: var(--panel);
    overflow: hidden;
  }
  .cover img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
    transition: transform 0.45s ease, filter 0.3s ease;
    filter: saturate(1);
  }
  .card:hover .cover img { transform: scale(1.05); filter: saturate(1.12); }

  .shade {
    position: absolute;
    inset: auto 0 0 0;
    height: 46%;
    background: linear-gradient(to top, rgba(10, 12, 17, 0.72), transparent);
    pointer-events: none;
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
    font-size: 34px;
    font-weight: 600;
    letter-spacing: 1px;
    color: var(--accent);
    opacity: 0.75;
  }
  .spinner {
    width: 26px;
    height: 26px;
    border: 2px solid var(--line);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 0.9s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  .tag {
    position: absolute;
    top: 10px;
    left: 10px;
    padding: 3px 8px;
    font-size: var(--fs-2xs, 10.5px);
    font-weight: 650;
    letter-spacing: 0.5px;
    border-radius: 6px;
    color: var(--text);
    background: rgba(10, 12, 17, 0.72);
    border: 1px solid rgba(255, 255, 255, 0.09);
    backdrop-filter: blur(3px);
  }
  .tag-steam { color: #a9c8f2; }
  .tag-epic { color: #d5d8de; }
  .tag-gog { color: #c9a6e8; }
  .tag-custom { color: var(--accent-2); border-color: rgba(110, 168, 255, 0.40); }

  .actions {
    position: absolute;
    top: 10px;
    right: 10px;
    display: flex;
    gap: 6px;
  }
  .star,
  .remove,
  .cover {
    width: 26px;
    height: 26px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    font-size: 14px;
    line-height: 1;
    color: var(--text);
    background: rgba(10, 12, 17, 0.7);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: var(--radius-xs, 8px);
    cursor: pointer;
    transition: opacity var(--dur, 0.16s) var(--ease, ease),
      background var(--dur, 0.16s) var(--ease, ease),
      border-color var(--dur, 0.16s) var(--ease, ease),
      color var(--dur, 0.16s) var(--ease, ease);
  }
  .cover { opacity: 0; }
  .cover svg {
    width: 14px;
    height: 14px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .card:hover .cover,
  .card:focus-within .cover { opacity: 1; }
  .cover:hover { background: rgba(10, 12, 17, 0.92); border-color: rgba(255, 255, 255, 0.28); }
  .star { opacity: 0.55; }
  .card:hover .star,
  .card:focus-within .star { opacity: 1; }
  .star:hover { background: rgba(10, 12, 17, 0.92); border-color: rgba(255, 255, 255, 0.28); }
  .star.on { opacity: 1; color: var(--accent); border-color: rgba(110, 168, 255, 0.55); }

  .remove { opacity: 0; }
  .card:hover .remove,
  .card:focus-within .remove { opacity: 1; }
  .remove:hover { background: var(--danger); border-color: var(--danger); color: #fff; }

  .body {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 12px 14px 14px;
    flex-grow: 1;
  }
  h3 {
    font-size: var(--fs-md, 13.5px);
    font-weight: 600;
    line-height: 1.35;
    letter-spacing: -0.006em;
    color: var(--text);
    flex-grow: 1;
    min-height: 2.7em;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .play {
    height: 34px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    background: rgba(138, 180, 255, 0.1);
    border: 1px solid rgba(138, 180, 255, 0.28);
    border-radius: var(--radius-sm);
    color: var(--accent-2);
    font-size: var(--fs-sm, 12.5px);
    font-weight: 600;
    letter-spacing: 0.01em;
    cursor: pointer;
    transition: background var(--dur, 0.16s) var(--ease, ease),
      color var(--dur, 0.16s) var(--ease, ease),
      border-color var(--dur, 0.16s) var(--ease, ease),
      box-shadow var(--dur, 0.16s) var(--ease, ease);
  }
  .play-ic {
    width: 11px;
    height: 11px;
    fill: currentColor;
    flex: none;
  }
  .play:hover:not(:disabled) {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--ink-on-accent);
    box-shadow: 0 4px 14px -6px rgba(111, 157, 255, 0.7);
  }
  .play:disabled { cursor: progress; color: var(--accent-2); border-color: rgba(110, 168, 255, 0.40); }
  .pulse {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--accent);
    animation: pulse 0.9s ease-in-out infinite;
  }
  @keyframes pulse {
    0%, 100% { opacity: 0.35; transform: scale(0.85); }
    50% { opacity: 1; transform: scale(1.15); }
  }
</style>
