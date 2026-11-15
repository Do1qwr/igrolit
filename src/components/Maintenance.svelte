<script lang="ts">
  import { gate, retryNow } from '../lib/gate';

  $: phase = $gate.phase;
  $: title =
    phase === 'maintenance'
      ? 'Технические работы'
      : phase === 'offline'
        ? 'Нет связи с сервером'
        : 'Подключение к серверу';
  $: subtitle =
    phase === 'maintenance'
      ? $gate.message || 'Сервер временно остановлен для обновления. Мы скоро вернёмся.'
      : phase === 'offline'
        ? 'Приложение работает только при подключении к серверу. Проверьте интернет-соединение.'
        : 'Проверяем доступность сервера, это займёт пару секунд.';
</script>

<div class="gate">
  <div class="gate-card">
    <div class="gate-mark" class:spin={phase === 'checking'}>
      {#if phase === 'maintenance'}
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M14.7 6.3a4 4 0 0 1 5 5l-8.4 8.4a2 2 0 0 1-2.8 0l-2.2-2.2a2 2 0 0 1 0-2.8z" />
          <path d="M4 20l3-3" />
        </svg>
      {:else if phase === 'offline'}
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M3 9a15 15 0 0 1 18 0" />
          <path d="M6 12.5a10 10 0 0 1 12 0" />
          <path d="M9.5 16a5 5 0 0 1 5 0" />
          <circle cx="12" cy="19.5" r="0.6" />
        </svg>
      {:else}
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 3a9 9 0 1 0 9 9" />
        </svg>
      {/if}
    </div>

    <h1>{title}</h1>
    <p>{subtitle}</p>

    {#if phase === 'maintenance' && $gate.since}
      <p class="since">Начало работ: {new Date($gate.since).toLocaleString('ru-RU')}</p>
    {/if}

    <div class="gate-actions">
      <button class="gate-btn" on:click={retryNow}>Повторить сейчас</button>
      {#if $gate.nextIn > 0}
        <span class="gate-timer">автопроверка через {$gate.nextIn} с</span>
      {:else}
        <span class="gate-timer">проверяем…</span>
      {/if}
    </div>

    {#if $gate.attempts > 1}
      <p class="attempts">Попыток подряд: {$gate.attempts}</p>
    {/if}
  </div>
</div>

<style>
  .gate {
    position: fixed;
    inset: 0;
    z-index: 999;
    display: grid;
    place-items: center;
    padding: 24px;
    background:
      radial-gradient(1200px 600px at 50% -10%, rgba(96, 165, 250, 0.18), transparent 60%),
      linear-gradient(180deg, #0b0f16 0%, #0a0d13 100%);
    backdrop-filter: blur(6px);
  }

  .gate-card {
    width: min(460px, 100%);
    padding: 32px 28px 26px;
    border-radius: 18px;
    background: rgba(17, 22, 31, 0.92);
    border: 1px solid rgba(148, 163, 184, 0.16);
    box-shadow: 0 24px 80px rgba(0, 0, 0, 0.55);
    text-align: center;
    color: #e6edf7;
  }

  .gate-mark {
    width: 64px;
    height: 64px;
    margin: 0 auto 18px;
    display: grid;
    place-items: center;
    border-radius: 18px;
    background: rgba(96, 165, 250, 0.12);
    border: 1px solid rgba(96, 165, 250, 0.28);
    color: #7fb3ff;
  }

  .gate-mark svg {
    width: 30px;
    height: 30px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .gate-mark.spin svg {
    animation: gate-spin 1.1s linear infinite;
    transform-origin: 12px 12px;
  }

  @keyframes gate-spin {
    to {
      transform: rotate(360deg);
    }
  }

  h1 {
    margin: 0 0 10px;
    font-size: 22px;
    font-weight: 600;
    letter-spacing: 0.2px;
  }

  p {
    margin: 0 0 8px;
    font-size: 14px;
    line-height: 1.5;
    color: #9fb0c7;
  }

  .since,
  .attempts {
    font-size: 12px;
    color: #6f8099;
  }

  .gate-actions {
    margin-top: 18px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    align-items: center;
  }

  .gate-btn {
    padding: 10px 20px;
    border-radius: 10px;
    border: 1px solid rgba(96, 165, 250, 0.4);
    background: rgba(96, 165, 250, 0.16);
    color: #dce9ff;
    font-size: 14px;
    cursor: pointer;
    transition: background 0.15s ease, border-color 0.15s ease;
  }

  .gate-btn:hover {
    background: rgba(96, 165, 250, 0.26);
    border-color: rgba(96, 165, 250, 0.6);
  }

  .gate-timer {
    font-size: 12px;
    color: #6f8099;
  }
</style>
