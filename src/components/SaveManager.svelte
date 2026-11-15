<script lang="ts">
  import { invoke } from '@tauri-apps/api/tauri';
  import { ask } from '../lib/dialogs';

  interface Game {
    id: string;
    name: string;
    platform: string;
    launch_cmd: string;
  }

  interface SaveEntry {
    id: string;
    name: string;
    date: string;
    size_formatted: string;
    size_bytes: number;
    comment?: string | null;
  }

  export let games: Game[] = [];
  let selectedId: string | null = null;
  let saves: SaveEntry[] = [];
  let loading = false;
  let busy = false;
  let comment = '';
  let error = '';
  let notice = '';

  $: selectedGame = games.find((g) => g.id === selectedId) ?? null;

  async function openGame(id: string) {
    selectedId = id;
    error = '';
    saves = [];
    if (!id) return;
    loading = true;
    try {
      saves = await invoke<SaveEntry[]>('saves_list', { appId: id });
    } catch (e) {
      error = typeof e === 'string' ? e : 'Не удалось загрузить сохранения';
    } finally {
      loading = false;
    }
  }

  async function createBackup() {
    if (!selectedId) return;
    busy = true;
    error = '';
    notice = '';
    try {
      await invoke('saves_create', { appId: selectedId, comment: comment.trim() || null });
      comment = '';
      saves = await invoke<SaveEntry[]>('saves_list', { appId: selectedId });
      notice = 'Точка сохранения создана';
    } catch (e) {
      error = typeof e === 'string' ? e : 'Не удалось создать бэкап';
    } finally {
      busy = false;
    }
  }

  async function restoreSave(save: SaveEntry) {
    if (!selectedId) return;
    if (
      !(await ask({
        title: 'Восстановить сохранение?',
        message: `Состояние от ${save.date} вернётся на место. Текущая картина будет перенесена в старую копию.`,
        okLabel: 'Восстановить',
      }))
    )
      return;
    busy = true;
    error = '';
    notice = '';
    try {
      await invoke('saves_restore', { appId: selectedId, saveName: save.name });
      notice = 'Сохранение восстановлено';
    } catch (e) {
      error = typeof e === 'string' ? e : 'Не удалось восстановить';
    } finally {
      busy = false;
    }
  }

  function emptyNotice() {
    notice = '';
  }

  // выбрать первую игру сразу
  $: if (games.length > 0 && !selectedId) {
    openGame(games[0].id);
  }
</script>

  <div class="saves" role="presentation" on:click={emptyNotice} on:keydown={() => {}}>
  <aside class="saves-side">
    <h2>Сохранения</h2>
    <p class="hint">Выбери игру — бэкапы её папки сохранений появятся справа</p>

    <div class="game-list">
      {#each games as game (game.id)}
        <button
          class="game-item"
          class:active={selectedId === game.id}
          on:click={() => openGame(game.id)}
        >
          <span class="dot" class:steam={game.platform === 'Steam'}></span>
          <span class="gname">{game.name}</span>
        </button>
      {/each}
    </div>
  </aside>

  <section class="saves-main">
    {#if !selectedId}
      <div class="empty-state">Выбери игру слева</div>
    {:else}
      <header class="saves-head">
        <div>
          <h1>{games.find((g) => g.id === selectedId)?.name ?? 'Игра не выбрана'}</h1>
          <p class="sub">{games.find((g) => g.id === selectedId)?.platform ?? ''}</p>
        </div>
        <button class="create-btn" on:click={createBackup} disabled={busy || loading}>
          {busy ? 'Работаем…' : '+ Создать точку'}
        </button>
      </header>

      {#if error}<div class="msg error">{error}</div>{/if}
      {#if notice && !error}<div class="msg good">{notice}</div>{/if}

      <div class="comment-row">
        <input
          type="text"
          placeholder="Комментарий к точке (необязательно)"
          bind:value={comment}
        />
      </div>

      <div class="saves-list">
        {#if loading}
          <div class="empty-state">Загружаю…</div>
        {:else if saves.length === 0}
          <div class="empty-state">Тут пока пусто. Нажми «Создать точку», чтобы сохранить папку логий игры.</div>
        {:else}
          {#each saves as save (save.id)}
            <div class="save-row">
              <div class="save-info">
                <div class="save-date">{save.date}</div>
                <div class="save-meta">
                  <span>{save.size_formatted}</span>
                  {#if save.comment}<span class="comm">{save.comment}</span>{/if}
                </div>
              </div>
              <div class="save-actions">
                <button class="restore" disabled={busy} on:click={() => restoreSave(save)}>
                  Восстановить
                </button>
              </div>
            </div>
          {/each}
        {/if}
      </div>
    {/if}
  </section>
</div>

<style>
  .saves {
    display: flex;
    gap: 18px;
    height: 100%;
    min-height: 0;
  }
  .saves-side {
    width: 250px;
    flex: none;
    background: var(--surface);
    border: 1px solid var(--line-soft);
    border-radius: var(--radius);
    padding: 14px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .saves-side h2 {
    font-size: 15px;
    font-weight: 700;
    margin-bottom: 4px;
  }
  .saves-side .hint {
    font-size: 11.5px;
    color: var(--muted);
    line-height: 1.45;
    margin-bottom: 12px;
  }
  .game-list {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .game-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 9px;
    background: transparent;
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    color: var(--text);
    font-size: 12.5px;
    text-align: left;
    cursor: pointer;
  }
  .game-item:hover { background: var(--panel-2); }
  .game-item.active { background: var(--accent-soft); border-color: var(--line); }
  .game-item .gname {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    flex: none;
    background: var(--muted-2);
  }
  .dot.steam { background: #5c8fd6; }

  .saves-main {
    flex: 1;
    min-width: 0;
    background: var(--surface);
    border: 1px solid var(--line-soft);
    border-radius: var(--radius);
    padding: 18px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .saves-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 14px;
  }
  .saves-head h1 {
    font-size: 19px;
    font-weight: 700;
    margin-bottom: 2px;
  }
  .saves-head .sub { font-size: 11px; color: var(--muted-2); text-transform: uppercase; letter-spacing: 1px; }
  .create-btn {
    height: 36px;
    padding: 0 16px;
    background: var(--accent);
    border: 1px solid var(--accent);
    border-radius: var(--radius-sm);
    color: #0a0e18;
    font-size: 13px;
    font-weight: 650;
    cursor: pointer;
  }
  .create-btn:hover:not(:disabled) { filter: brightness(1.08); }
  .create-btn:disabled { opacity: 0.5; cursor: not-allowed; }

  .comment-row { margin-bottom: 12px; }
  .comment-row input {
    width: 100%;
    height: 36px;
    padding: 0 11px;
    background: var(--bg-soft);
    border: 1px solid var(--line);
    border-radius: var(--radius-sm);
    color: var(--text);
    font-size: 12.5px;
    outline: none;
  }
  .comment-row input:focus { border-color: var(--accent); }

  .msg {
    padding: 9px 12px;
    border-radius: var(--radius-sm);
    font-size: 12.5px;
    margin-bottom: 12px;
  }
  .msg.error { background: rgba(239, 91, 91, 0.12); color: var(--danger); border: 1px solid rgba(239, 91, 91, 0.4); }
  .msg.good { background: rgba(64, 190, 120, 0.12); color: #9be3b8; border: 1px solid rgba(64, 190, 120, 0.4); }

  .saves-list { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; }
  .save-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 14px;
    background: var(--bg-soft);
    border: 1px solid var(--line-soft);
    border-radius: var(--radius-sm);
  }
  .save-date { font-size: 14px; font-weight: 600; margin-bottom: 3px; }
  .save-meta { display: flex; gap: 12px; font-size: 11.5px; color: var(--muted); }
  .save-meta .comm { color: var(--accent-2); }
  .restore {
    padding: 8px 14px;
    background: var(--panel-2);
    border: 1px solid var(--line-strong);
    border-radius: var(--radius-sm);
    color: var(--text);
    font-size: 12.5px;
    cursor: pointer;
  }
  .restore:hover:not(:disabled) { border-color: var(--accent); color: var(--accent-2); }
  .restore:disabled { opacity: 0.5; cursor: not-allowed; }

  .empty-state {
    padding: 40px 16px;
    text-align: center;
    color: var(--muted);
    font-size: 13px;
  }
</style>