<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { invoke } from '@tauri-apps/api/tauri';
  import { t } from '../lib/i18n';

  export let notice: { app_id: string; save_name: string | null; at: number };
  export let gameName = '';

  const dispatch = createEventDispatcher();

  let busy = false;
  let error = '';

  $: when = new Date(notice.at * 1000).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

  async function restore() {
    if (!notice.save_name || busy) return;
    busy = true;
    error = '';
    try {
      await invoke('saves_restore', { appId: notice.app_id, saveName: notice.save_name });
      dispatch('close');
    } catch (e) {
      error = typeof e === 'string' ? e : 'Не удалось восстановить сохранение';
    } finally {
      busy = false;
    }
  }
</script>

<div class="backdrop" role="presentation" on:keydown={() => {}}>
  <div class="panel" role="presentation" on:click|stopPropagation on:keydown={() => {}}>
    <h2>{$t('crash.title')}</h2>
    <p class="text">
      {#if gameName}<strong>{gameName}</strong> · {/if}{when}
    </p>
    <p class="text">{$t('crash.text')}</p>

    {#if error}
      <p class="error">{error}</p>
    {/if}

    <div class="actions">
      <button class="ghost" on:click={() => dispatch('close')}>{$t('crash.dismiss')}</button>
      {#if notice.save_name}
        <button class="primary" on:click={restore} disabled={busy}>
          {busy ? '…' : $t('crash.restore')}
        </button>
      {/if}
    </div>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 230;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    background: rgba(0, 0, 0, 0.55);
    backdrop-filter: blur(5px);
  }

  .panel {
    width: 420px;
    max-width: 100%;
    padding: 20px;
    border: 1px solid var(--line);
    border-radius: 16px;
    background: var(--panel);
    box-shadow: 0 26px 70px rgba(0, 0, 0, 0.6);
  }

  h2 { margin: 0 0 8px; font-size: 15.5px; font-weight: 650; }
  .text { margin: 0 0 10px; font-size: 12.5px; line-height: 1.5; color: var(--muted); }
  .text strong { color: var(--text); }

  .error {
    margin: 0 0 10px;
    padding: 7px 9px;
    border-radius: 7px;
    background: rgba(239, 91, 91, 0.12);
    color: var(--danger);
    font-size: 11.5px;
  }

  .actions { display: flex; gap: 8px; margin-top: 14px; }
  .ghost, .primary {
    flex: 1;
    height: 36px;
    border-radius: 9px;
    font: inherit;
    font-size: 12.5px;
    font-weight: 600;
    cursor: pointer;
  }
  .ghost { border: 1px solid var(--line); background: transparent; color: var(--text); }
  .ghost:hover { background: var(--hover-2); }
  .primary { border: 1px solid var(--accent); background: var(--accent); color: var(--ink-on-accent); }
  .primary:hover:not(:disabled) { filter: brightness(1.08); }
  .primary:disabled { cursor: progress; opacity: 0.75; }
</style>
