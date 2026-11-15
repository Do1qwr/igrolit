<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { t } from '../lib/i18n';

  export let gamesCount = 0;

  const dispatch = createEventDispatcher();
</script>

<div class="backdrop" role="presentation" on:keydown={() => {}}>
  <div class="panel" role="presentation" on:click|stopPropagation on:keydown={() => {}}>
    <span class="glyph" aria-hidden="true">🎮</span>
    <h2>{$t('onb.title')}</h2>
    <p class="found">{$t('onb.found', { n: gamesCount })}</p>

    <ul>
      <li><kbd>Ctrl</kbd> + <kbd>Space</kbd> — {$t('onb.li1')}</li>
      <li>{$t('onb.li2')}</li>
      <li>{$t('onb.li3')}</li>
    </ul>

    <button class="start" on:click={() => dispatch('close')}>{$t('onb.start')}</button>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 240;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(6px);
  }

  .panel {
    width: 440px;
    max-width: 100%;
    padding: 26px 24px 22px;
    border: 1px solid var(--line);
    border-radius: 18px;
    background: var(--panel);
    box-shadow: 0 30px 80px rgba(0, 0, 0, 0.65);
    text-align: center;
  }

  .glyph {
    display: inline-flex;
    width: 46px;
    height: 46px;
    align-items: center;
    justify-content: center;
    margin-bottom: 12px;
    border-radius: 14px;
    background: rgba(110, 168, 255, 0.14);
    border: 1px solid rgba(110, 168, 255, 0.35);
    font-size: 22px;
  }

  h2 { margin: 0 0 6px; font-size: 18px; font-weight: 650; }
  .found { margin: 0 0 18px; font-size: 12.5px; color: var(--muted); }

  ul {
    margin: 0 0 20px;
    padding: 0;
    list-style: none;
    text-align: left;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  li {
    display: flex;
    align-items: baseline;
    gap: 6px;
    font-size: 12.5px;
    line-height: 1.45;
    color: var(--text);
  }
  li::before {
    content: '•';
    color: var(--accent);
    margin-right: 4px;
  }

  kbd {
    padding: 1px 5px;
    border: 1px solid var(--line);
    border-radius: 4px;
    font-size: 10.5px;
    color: var(--muted);
  }

  .start {
    width: 100%;
    height: 40px;
    border: 1px solid var(--accent);
    border-radius: 10px;
    background: var(--accent);
    color: var(--ink-on-accent);
    font: inherit;
    font-size: 13px;
    font-weight: 650;
    cursor: pointer;
  }
  .start:hover { filter: brightness(1.08); }
</style>
