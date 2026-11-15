<script lang="ts">
  export let gameName: string;
  export let onConfirm: () => void;
  export let onCancel: () => void;
</script>

<div class="overlay" role="presentation">
  <div class="box" role="dialog" aria-modal="true" aria-label="Сторонние модификации">
    <h2>⚠️ Сторонние модификации</h2>
    <p>Вы применяете фиксы/моды к <strong>{gameName}</strong>.</p>
    <ul>
      <li>Это может нарушать EULA игры.</li>
      <li>В мультиплеере — риск бана античитом (VAC, EAC, BE).</li>
      <li>Лаунчер сделает резервную копию оригинальных файлов.</li>
    </ul>
    <p class="q">Применяете на свой страх и риск?</p>
    <div class="actions">
      <button class="cancel" on:click={onCancel}>Отмена</button>
      <button class="confirm" on:click={onConfirm}>Понимаю, применить</button>
    </div>
  </div>
</div>

<style>
  .overlay {
    position: fixed; inset: 0; z-index: 250;
    background: rgba(0, 0, 0, 0.72);
    display: flex; align-items: center; justify-content: center;
    padding: 24px;
  }
  .box {
    width: 500px; max-width: 100%;
    background: var(--panel);
    border: 1px solid color-mix(in srgb, #d29922 60%, var(--line));
    border-radius: 16px;
    padding: 26px 28px;
    color: var(--text);
    box-shadow: 0 30px 80px rgba(0, 0, 0, 0.65);
  }
  h2 { margin: 0 0 14px; font-size: 18px; color: #d29922; }
  p { margin: 0 0 10px; font-size: 13px; line-height: 1.5; }
  ul { margin: 8px 0 16px 18px; padding: 0; color: var(--muted); }
  li { margin-bottom: 6px; font-size: 12.5px; }
  .q { font-weight: 600; margin: 14px 0; }
  .actions { display: flex; justify-content: flex-end; gap: 10px; }
  .cancel {
    padding: 9px 18px; border: 1px solid var(--line); border-radius: 9px;
    background: var(--panel-2); color: var(--text); font: inherit; font-size: 13px; cursor: pointer;
  }
  .confirm {
    padding: 9px 18px; border: 1px solid var(--accent); border-radius: 9px;
    background: var(--accent); color: var(--ink-on-accent); font: inherit; font-size: 13px; font-weight: 650; cursor: pointer;
  }
  .cancel:hover { background: var(--hover); }
  .confirm:hover { filter: brightness(1.08); }
</style>