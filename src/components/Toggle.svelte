<script lang="ts">
  export let checked = false;
  export let title = '';
  export let desc = '';
  export let disabled = false;
</script>

<label class="row" class:off={disabled}>
  <div class="txt">
    <span class="t">{title}</span>
    {#if desc}<span class="d">{desc}</span>{/if}
  </div>
  <input type="checkbox" bind:checked {disabled} />
  <span class="sw" aria-hidden="true"></span>
</label>

<style>
  .row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 9px 11px;
    border-radius: var(--radius-sm);
    cursor: pointer;
    user-select: none;
  }
  .row:hover { background: var(--hover); }
  .row.off { opacity: 0.5; cursor: default; }
  .row.off:hover { background: none; }

  .txt { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .t { font-size: 13px; color: var(--text); }
  .d { font-size: 11.5px; color: var(--muted-2); line-height: 1.35; }

  input {
    position: absolute;
    opacity: 0;
    width: 0;
    height: 0;
    pointer-events: none;
  }

  .sw {
    position: relative;
    flex: none;
    width: 38px;
    height: 22px;
    border-radius: 999px;
    background: var(--panel-3);
    border: 1px solid var(--line);
    transition: background 0.16s ease, border-color 0.16s ease;
  }
  .sw::after {
    content: '';
    position: absolute;
    top: 2px;
    left: 2px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--muted);
    transition: transform 0.16s ease, background 0.16s ease;
  }
  input:checked + .sw {
    background: var(--accent-soft);
    border-color: rgba(110, 168, 255, 0.5);
  }
  input:checked + .sw::after {
    transform: translateX(16px);
    background: var(--accent);
  }
</style>
