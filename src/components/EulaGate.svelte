<script lang="ts">
  import { invoke } from '@tauri-apps/api/tauri';
  import { appWindow } from '@tauri-apps/api/window';
  import { EULA_VERSION, EULA_PREAMBLE, EULA_SECTIONS } from '../lib/eula';

  export let onAccepted: () => void;

  let acceptEula = false;
  let telemetry = false;
  let busy = false;
  let declinedNotice = false;

  async function accept() {
    if (!acceptEula || busy) return;
    busy = true;
    try {
      await invoke('eula_accept', { version: EULA_VERSION, telemetry });
      onAccepted();
    } catch (e) {
      console.error(e);
      busy = false;
    }
  }

  async function decline() {
    if (busy) return;
    busy = true;
    try {
      await invoke('eula_decline');
      declinedNotice = true;
    } catch (e) {
      console.error(e);
      busy = false;
    }
  }

  async function exitApp() {
    try {
      await appWindow.close();
    } catch {
      /* ignore */
    }
  }
</script>

<div class="overlay" role="presentation">
  <div class="box" role="dialog" aria-modal="true" aria-label="Лицензионное соглашение">
    <header>
      <h1>Лицензионное соглашение</h1>
      <span class="ver">Версия {EULA_VERSION} · Igrolit</span>
    </header>

    {#if declinedNotice}
      <div class="declined">
        <h2>Вы отклонили соглашение</h2>
        <p>Сбор статистики остался выключенным, отказ зафиксирован. Без принятия условий использование Программы невозможно.</p>
        <button class="primary" on:click={exitApp}>Закрыть программу</button>
      </div>
    {:else}
      <div class="scroll">
        <p class="preamble">{EULA_PREAMBLE}</p>
        {#each EULA_SECTIONS as s (s.title)}
          <section>
            <h2>{s.title}</h2>
            {#each s.body as p (p)}
              <p>{p}</p>
            {/each}
          </section>
        {/each}
      </div>

      <div class="choices">
        <label class="check">
          <input type="checkbox" bind:checked={acceptEula} />
          <span>Я принимаю условия Лицензионного соглашения</span>
        </label>
        <label class="check muted">
          <input type="checkbox" bind:checked={telemetry} />
          <span>Разрешить анонимную статистику (необязательно, выключено по умолчанию)</span>
        </label>
      </div>

      <footer>
        <button class="ghost" on:click={decline} disabled={busy}>Отключить</button>
        <button class="primary" on:click={accept} disabled={!acceptEula || busy}>
          {busy ? 'Сохраняем…' : 'Принять'}
        </button>
      </footer>
    {/if}
  </div>
</div>

<style>
  .overlay {
    position: fixed; inset: 0; z-index: 300;
    background: rgba(0, 0, 0, 0.78);
    display: flex; align-items: center; justify-content: center;
    padding: 24px;
  }
  .box {
    width: 760px; max-width: 100%; max-height: 90vh;
    display: flex; flex-direction: column;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 16px;
    box-shadow: 0 30px 80px rgba(0, 0, 0, 0.7);
    overflow: hidden;
  }
  header {
    padding: 18px 24px 12px;
    border-bottom: 1px solid var(--line);
  }
  header h1 { margin: 0; font-size: 19px; }
  .ver { font-size: 12px; color: var(--muted); }
  .scroll {
    overflow-y: auto;
    padding: 16px 24px;
    font-size: 12.5px;
    line-height: 1.55;
    color: var(--text);
  }
  .preamble { font-style: italic; color: var(--muted); margin: 0 0 14px; }
  .scroll section { margin-bottom: 14px; }
  .scroll h2 { margin: 0 0 6px; font-size: 13.5px; }
  .scroll p { margin: 0 0 6px; }
  .choices {
    padding: 12px 24px;
    border-top: 1px solid var(--line);
    display: flex; flex-direction: column; gap: 8px;
  }
  .check { display: flex; align-items: center; gap: 10px; font-size: 12.5px; cursor: pointer; }
  .check.muted { color: var(--muted); }
  .check input { width: 17px; height: 17px; accent-color: var(--accent); }
  footer {
    display: flex; justify-content: space-between; gap: 10px;
    padding: 14px 24px 18px;
  }
  .primary, .ghost {
    padding: 10px 22px; border-radius: 10px; font: inherit; font-size: 13px;
    font-weight: 650; cursor: pointer;
  }
  .primary { border: 1px solid var(--accent); background: var(--accent); color: var(--ink-on-accent); }
  .primary:disabled { opacity: 0.45; cursor: not-allowed; }
  .primary:hover:not(:disabled) { filter: brightness(1.08); }
  .ghost { border: 1px solid var(--line); background: var(--panel-2); color: var(--text); }
  .ghost:hover { background: var(--hover); }
  .declined { padding: 28px 24px; display: flex; flex-direction: column; gap: 14px; }
  .declined h2 { margin: 0; font-size: 16px; }
  .declined p { margin: 0; color: var(--muted); font-size: 13px; line-height: 1.5; }
  .declined .primary { align-self: flex-start; }
</style>