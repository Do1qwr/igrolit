<script lang="ts">
  export let value = '';
  export let inputId = '';
  export let shortcut = '';
</script>

<div class="search">
  <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="11" cy="11" r="7" />
    <path d="M16.4 16.4 L21 21" />
  </svg>
  <input
    type="text"
    id={inputId}
    placeholder="Поиск игр"
    bind:value
    spellcheck="false"
    autocomplete="off"
  />
  {#if value}
    <button class="clear" on:click={() => (value = '')} aria-label="Очистить">×</button>
  {:else if shortcut}
    <kbd class="kbd">{shortcut}</kbd>
  {/if}
</div>

<style>
  .search {
    position: relative;
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1;
    max-width: 460px;
    height: var(--control-h, 36px);
    padding: 0 12px;
    background: var(--bg-soft);
    border: 1px solid var(--line);
    border-radius: var(--radius-sm);
    transition: border-color var(--dur, 0.16s) var(--ease, ease),
      background var(--dur, 0.16s) var(--ease, ease),
      box-shadow var(--dur, 0.16s) var(--ease, ease);
  }
  .search:hover { border-color: var(--panel-3); }
  .search:focus-within {
    border-color: rgba(111, 157, 255, 0.55);
    background: var(--panel-2);
    box-shadow: var(--ring, 0 0 0 3px rgba(111, 157, 255, 0.24));
  }
  .icon {
    width: 15px;
    height: 15px;
    stroke: var(--muted-2);
    stroke-width: 2;
    stroke-linecap: round;
    fill: none;
    flex: none;
    transition: stroke var(--dur, 0.16s) var(--ease, ease);
  }
  .search:focus-within .icon { stroke: var(--accent); }
  input {
    flex: 1;
    min-width: 0;
    height: 100%;
    background: transparent;
    border: none;
    outline: none;
    color: var(--text);
    font-size: var(--fs-md, 13.5px);
  }
  input::placeholder { color: var(--muted-2); }
  .kbd {
    flex: none;
    display: inline-flex;
    align-items: center;
    height: 20px;
    padding: 0 6px;
    border: 1px solid var(--line-soft);
    border-bottom-width: 2px;
    border-radius: 5px;
    background: rgba(255, 255, 255, 0.04);
    color: var(--muted-2);
    font-family: inherit;
    font-size: 10.5px;
    font-weight: 600;
    letter-spacing: 0.2px;
    line-height: 1;
  }
  .clear {
    flex: none;
    width: 22px;
    height: 22px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--panel-3);
    border: none;
    border-radius: var(--radius-xs, 8px);
    color: var(--muted);
    font-size: 14px;
    line-height: 1;
    cursor: pointer;
    transition: background var(--dur, 0.16s) var(--ease, ease),
      color var(--dur, 0.16s) var(--ease, ease);
  }
  .clear:hover { color: var(--text); background: var(--panel-2); }
</style>
