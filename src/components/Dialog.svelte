<script lang="ts">
  import { askState, answerAsk, toasts, dismissToast } from '../lib/dialogs';

  function onKeydown(event: KeyboardEvent) {
    if (!$askState) return;
    if (event.key === 'Escape') answerAsk(false);
    if (event.key === 'Enter') answerAsk(true);
  }

  function onBackdrop(event: MouseEvent) {
    if (event.target === event.currentTarget) answerAsk(false);
  }
</script>

<svelte:window on:keydown={onKeydown} />

{#if $askState}
  <button
    type="button"
    class="ask-layer"
    aria-label="Закрыть диалог"
    on:click={onBackdrop}
  >
    <div
      class="ask-panel"
      role="dialog"
      aria-modal="true"
      aria-label={$askState.title ?? 'Подтверждение'}
    >
      <strong class="ask-title">{$askState.title ?? 'Подтверждение'}</strong>
      <p class="ask-text">{$askState.message}</p>
      <div class="ask-actions">
        <button class="ghost" on:click={() => answerAsk(false)}>
          {$askState.cancelLabel ?? 'Отмена'}
        </button>
        <button
          class="primary"
          class:danger={$askState.danger}
          on:click={() => answerAsk(true)}
        >
          {$askState.okLabel ?? 'Продолжить'}
        </button>
      </div>
    </div>
  </button>
{/if}

{#if $toasts.length > 0}
  <div class="toasts" aria-live="polite">
    {#each $toasts as toast (toast.id)}
      <button
        type="button"
        class="toast"
        class:error={toast.tone === 'error'}
        on:click={() => dismissToast(toast.id)}
      >
        <span class="toast-mark" aria-hidden="true"></span>
        <span class="toast-text">{toast.text}</span>
      </button>
    {/each}
  </div>
{/if}

<style>
  .ask-layer {
    position: fixed;
    inset: 0;
    z-index: 260;
    display: grid;
    place-items: center;
    padding: 24px;
    border: 0;
    font: inherit;
    color: inherit;
    text-align: left;
    cursor: default;
    background: rgba(6, 8, 12, 0.7);
    backdrop-filter: blur(3px);
    animation: askFade 0.12s ease;
  }
  .ask-panel {
    width: 420px;
    max-width: 100%;
    display: flex;
    flex-direction: column;
    gap: 9px;
    padding: 20px;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--panel);
    box-shadow: var(--shadow-lift);
    animation: askPop 0.14s ease;
  }
  .ask-title { font-size: 15px; font-weight: 700; }
  .ask-text { margin: 0; color: var(--muted); font-size: 13px; line-height: 1.5; }
  .ask-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 6px;
  }
  .ghost,
  .primary {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: 34px;
    padding: 0 15px;
    border-radius: var(--radius-sm);
    font: inherit;
    font-size: 12.5px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.14s ease, border-color 0.14s ease, box-shadow 0.14s ease;
  }
  .ghost {
    border: 1px solid var(--line);
    background: var(--panel-2);
    color: var(--text);
  }
  .ghost:hover { background: var(--panel-3); border-color: var(--muted-2); }
  .primary {
    border: 1px solid transparent;
    background: var(--btn-bg);
    color: var(--btn-ink);
    font-weight: 680;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.3), var(--btn-glow);
  }
  .primary:hover { background: var(--btn-bg-hover); }
  .primary.danger {
    background: var(--btn-danger-bg);
    color: #fff;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.26), 0 2px 10px rgba(217, 86, 86, 0.22);
  }
  .primary.danger:hover { background: var(--btn-danger-hover); }

  .toasts {
    position: fixed;
    right: 18px;
    bottom: 18px;
    z-index: 250;
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-width: 420px;
  }
  .toast {
    display: flex;
    align-items: flex-start;
    gap: 9px;
    padding: 10px 13px;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--panel);
    color: var(--text);
    font: inherit;
    font-size: 12.5px;
    line-height: 1.45;
    text-align: left;
    cursor: pointer;
    box-shadow: var(--shadow-md);
    animation: toastIn 0.16s ease;
  }
  .toast-mark {
    flex: none;
    width: 4px;
    align-self: stretch;
    border-radius: 2px;
    background: var(--accent);
  }
  .toast.error { border-color: rgba(255, 111, 111, 0.4); }
  .toast.error .toast-mark { background: var(--danger); }
  .toast-text { min-width: 0; overflow-wrap: anywhere; }

  @keyframes askFade {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  @keyframes askPop {
    from { opacity: 0; transform: translateY(6px) scale(0.99); }
    to { opacity: 1; transform: none; }
  }
  @keyframes toastIn {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: none; }
  }
</style>
