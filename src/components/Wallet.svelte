<script lang="ts">
  import { onMount } from 'svelte';
  import {
    online,
    buyCoins,
    requestWalletHistory,
    coinCollect,
    type CoinHistoryEntry,
  } from '../lib/online';
  import Icon from './Icon.svelte';

  export let onNeedAuth: (mode: 'login' | 'register') => void = () => {};

  const PACKS = [
    { id: 'start', coins: 100, price: 99, label: 'Стартовый' },
    { id: 'plus', coins: 500, price: 399, label: 'Выгодный' },
    { id: 'pro', coins: 1200, price: 799, label: 'Профи' },
    { id: 'max', coins: 3000, price: 1490, label: 'Максимум' },
  ];

  let tab: 'packs' | 'history' = 'packs';

$: history = $online.coinHistory ?? [];
  $: coins = $online.coins ?? 0;

  onMount(() => {
    if ($online.authed) {
      requestWalletHistory();
    }
  });

  function pick(packId: string) {
    if (!$online.authed) {
      onNeedAuth('login');
      return;
    }
    buyCoins(packId);
  }

  function when(ts: number) {
    return new Date(ts).toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function sign(e: CoinHistoryEntry) {
    return e.type === 'spend' ? `−${e.delta}` : `+${e.delta}`;
  }

  function desc(e: CoinHistoryEntry) {
    switch (e.type) {
      case 'buy':
        return `Покупка${e.pack ? ` «${e.pack}»` : ''}${e.price ? ` за ${e.price} ₽` : ''}`;
      case 'vote':
        return 'Голос за сервер';
      case 'daily':
        return 'Ежедневный вход';
      case 'spend':
        return 'Оплата оформления сервера';
      case 'check':
        return 'Проверка статуса сервера';
      case 'steam':
        return 'Привязка Steam';
      case 'firstSrv':
        return 'Первый сервер в каталог';
      case 'runGame':
        return 'Запуск игры';
      case 'calendar':
        return 'Календарь месяца';
      case 'chest':
        return 'Сундук 5-го дня';
      case 'goal':
        return 'Дневная цель';
      case 'playTime':
        return 'Время в игре';
      default:
        return 'Операция с монетами';
    }
  }
</script>

<header class="bar">
  <div class="bar-title">
    <h1>Кошелёк</h1>
    <span class="bar-sub">Пополняйте монетами, оплачивайте оформление серверов и следите за балансом</span>
  </div>
</header>

<section class="wallet-view">
  {#if !$online.authed}
    <div class="wallet-empty">
      <div class="wallet-empty-ic"><Icon name="wallet" size={26} /></div>
      <strong>Войдите в аккаунт</strong>
      <p class="muted small">Чтобы пополнять кошелёк и тратить монеты, войдите или зарегистрируйтесь.</p>
      <div class="empty-actions">
        <button class="primary" on:click={() => onNeedAuth('login')}>Войти</button>
        <button class="ghost" on:click={() => onNeedAuth('register')}>Регистрация</button>
      </div>
    </div>
  {:else}
    <div class="wallet-bals">
      <div class="balance-card">
        <span class="bc-label">Баланс монет</span>
        <strong class="bc-val">{coins}<span>монет</span></strong>
        <span class="bc-sub">Монеты тратятся на оформление сервера: плашка, цвет, карточка, закрепление</span>
      </div>
      <div class="balance-card rub">
        <span class="bc-label">Рубли</span>
        <strong class="bc-val">0<span>потрачено</span></strong>
        <span class="bc-sub">Оплата оформления в тестовом режиме — деньги не списываются</span>
      </div>
    </div>
    <div class="wallet-top">
      <div class="buy-card">
        <div class="buy-tabs">
          <button class:active={tab === 'packs'} on:click={() => (tab = 'packs')}>
            Купить монеты
            <span class="soon-chip">скоро</span>
          </button>
          <button class:active={tab === 'history'} on:click={() => (tab = 'history')} disabled={!history.length}>История</button>
        </div>
        {#if tab === 'packs'}
          <p class="muted small">Оплата картой скоро появится. Пока монеты начисляются за голоса и ежедневный вход.</p>
          <div class="pack-grid">
            {#each PACKS as pack (pack.id)}
              <button class="pack soon" disabled title="Покупка монет скоро появится">
                <span class="pack-label">{pack.label}</span>
                <strong class="pack-coins">{pack.coins}<span>монет</span></strong>
                <span class="pack-price">{pack.price} ₽</span>
                <span class="pack-soon">скоро</span>
              </button>
            {/each}
          </div>
          <p class="muted small pack-note">Курс: от 1 ₽ за монету с выгодой на больших пакетах. Оплата картой в разработке.</p>
        {:else}
          {#if history.length === 0}
            <p class="muted small">Пока нет операций. Купите монеты или заработайте их голосами и входом.</p>
          {:else}
            <div class="history-list">
              {#each history as h (h.ts + '-' + h.delta)}
                <div class="h-row">
                  <span class="h-desc">
                    <strong>{desc(h)}</strong>
                    <span class="muted small">{when(h.ts)}</span>
                  </span>
                  <span class="h-delta" class:neg={h.type === 'spend'}>{sign(h)}</span>
                </div>
              {/each}
            </div>
          {/if}
        {/if}
      </div>
    </div>

    <div class="earn">
      <div class="earn-head">Заработать монеты</div>

      <div class="collect-box">
        <div class="collect-info">
          <div class="collect-name">Ежедневный сбор</div>
          <div class="collect-desc">
            {#if $online.dailyReady}
              Заходите и собирайте +10 монет (стрик множит награду до ×2).
            {:else}
              Дневной сбор уже получен — возвращайтесь завтра.
            {/if}
          </div>
        </div>
        <button
          class="collect-btn"
          disabled={!$online.dailyReady}
          on:click={() => coinCollect()}
        >
          {#if $online.dailyReady}Собрать монеты{:else}Собрано ✓{/if}
        </button>
      </div>

      <p class="muted small">Монеты начисляются автоматически за реальные действия: вход, голос, запуск игры, добавление сервера, привязку Steam. Наград «по кнопке» нет — фарм невозможен.</p>

      <div class="earn-sec">
        <div class="earn-sec-title">Ежедневная активность</div>
        <div class="earn-card">
          <span class="e-ic">📅</span>
          <div class="e-info">
            <div class="e-name">Ежедневный вход (стрик)</div>
            <div class="e-desc">Серия дней множит награду: 7 → ×1.2, 30 → ×1.5, 90 → ×2.</div>
          </div>
          <span class="e-reward">+10<small>за вход</small></span>
        </div>
        <div class="earn-card">
          <span class="e-ic">🗓</span>
          <div class="e-info">
            <div class="e-name">Календарь месяца</div>
            <div class="e-desc">Отметка каждый день: +5, за полный месяц +100.</div>
          </div>
          <span class="e-reward">+5<small>за день</small></span>
        </div>
        <div class="earn-card">
          <span class="e-ic">🎁</span>
          <div class="e-info">
            <div class="e-name">Сундук 5-го дня</div>
            <div class="e-desc">Каждые 5 дней серии — случайная награда.</div>
          </div>
          <span class="e-reward">+50…200<small>рандом</small></span>
        </div>
        <div class="earn-card">
          <span class="e-ic">🎯</span>
          <div class="e-info">
            <div class="e-name">Дневная цель</div>
            <div class="e-desc">Накопите 60 монет за день — бонус за активность.</div>
          </div>
          <span class="e-reward">+30<small>за цель</small></span>
        </div>
      </div>

      <div class="earn-sec">
        <div class="earn-sec-title">Серверы и голоса</div>
        <div class="earn-card">
          <span class="e-ic">🗳</span>
          <div class="e-info">
            <div class="e-name">Голос за сервер</div>
            <div class="e-desc">Один голос в сутки за сервер в каталоге.</div>
          </div>
          <span class="e-reward">+5<small>за голос</small></span>
        </div>
        <div class="earn-card">
          <span class="e-ic">🆕</span>
          <div class="e-info">
            <div class="e-name">Первый сервер в каталог</div>
            <div class="e-desc">Начисляется при одобрении вашего первого сервера модератором.</div>
          </div>
          <span class="e-reward">+200<small>разово</small></span>
        </div>
        <div class="earn-card">
          <span class="e-ic">🔍</span>
          <div class="e-info">
            <div class="e-name">Проверка статуса сервера</div>
            <div class="e-desc">За проверку своего сервера. Кулдаун 1 час.</div>
          </div>
          <span class="e-reward">+5<small>кап 20/день</small></span>
        </div>
      </div>

      <div class="earn-sec">
        <div class="earn-sec-title">Игры и профиль</div>
        <div class="earn-card">
          <span class="e-ic">🛡</span>
          <div class="e-info">
            <div class="e-name">Привязка Steam</div>
            <div class="e-desc">Разово при реальной привязке. Не фармится.</div>
          </div>
          <span class="e-reward">+100<small>разово</small></span>
        </div>
        <div class="earn-card">
          <span class="e-ic">🎮</span>
          <div class="e-info">
            <div class="e-name">Запуск игры</div>
            <div class="e-desc">За реальный запуск через лаунчер. Кап 30/день.</div>
          </div>
          <span class="e-reward">+10<small>кап 30</small></span>
        </div>
        <div class="earn-card">
          <span class="e-ic">⏱</span>
          <div class="e-info">
            <div class="e-name">Время в игре</div>
            <div class="e-desc">За активную сессию. Кап 40/сессию.</div>
          </div>
          <span class="e-reward">+1 / 15м<small>кап 40</small></span>
        </div>
      </div>
    </div>
    <div class="wall-warn">Фарм не пройдёт: у каждого канала суточный лимит, кулдаун и проверка по IP. Мультиаккаунты с одного адреса блокируются, аномальный счётчик замораживается до проверки. Все операции — в audit.log.</div>
  {/if}
</section>

<style>
  .bar {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    padding: 14px 18px;
    border-bottom: 1px solid var(--line);
  }
  .bar-title h1 { margin: 0; font-size: 17px; }
  .bar-sub { font-size: 12px; color: var(--muted); }

  .wallet-view { padding: 16px 18px; overflow-y: auto; display: flex; flex-direction: column; gap: 16px; }

  .wallet-empty {
    margin: 40px auto;
    max-width: 360px;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    padding: 30px 22px;
    border: 1px solid var(--line);
    border-radius: 16px;
    background: var(--panel);
  }
  .wallet-empty-ic {
    width: 54px;
    height: 54px;
    display: grid;
    place-items: center;
    border-radius: 14px;
    background: var(--accent-soft);
    color: var(--accent);
  }
  .wallet-empty strong { font-size: 16px; }
  .empty-actions { display: flex; gap: 8px; margin-top: 6px; }

  .wallet-bals { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  .wallet-top { display: flex; flex-direction: column; gap: 14px; }

  .balance-card {
    padding: 18px;
    border: 1px solid var(--line);
    border-radius: 16px;
    background: linear-gradient(135deg, color-mix(in srgb, var(--gold, #e3a13b) 12%, var(--panel)), var(--panel));
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .balance-card.rub { background: linear-gradient(135deg, color-mix(in srgb, var(--accent) 12%, var(--panel)), var(--panel)); }
  .bc-label { font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted-2); }
  .bc-val { font-size: 34px; font-weight: 800; color: var(--text); display: flex; align-items: baseline; gap: 8px; }
  .bc-val span { font-size: 13px; font-weight: 600; color: var(--muted); }
  .bc-sub { font-size: 12px; color: var(--muted); line-height: 1.45; }

  .buy-card {
    padding: 16px;
    border: 1px solid var(--line);
    border-radius: 16px;
    background: var(--panel);
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .buy-tabs { display: flex; gap: 6px; }
  .buy-tabs button {
    padding: 6px 12px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--panel-2);
    color: var(--muted);
    font: inherit;
    font-size: 12px;
    cursor: pointer;
  }
  .buy-tabs button.active { border-color: var(--accent); background: var(--accent-soft); color: var(--text); }
  .buy-tabs button:disabled { opacity: 0.45; cursor: not-allowed; }

  .pack-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; }
  .soon-chip {
    margin-left: 6px;
    padding: 1px 6px;
    border: 1px solid var(--line);
    border-radius: 999px;
    font-size: 10px;
    letter-spacing: 0.03em;
    text-transform: uppercase;
    color: var(--muted-2);
  }
  .pack.soon {
    opacity: 0.6;
    cursor: not-allowed;
    position: relative;
  }
  .pack.soon:hover { transform: none; border-color: var(--line); }
  .pack-soon {
    position: absolute;
    top: 8px;
    right: 8px;
    font-size: 10px;
    letter-spacing: 0.03em;
    text-transform: uppercase;
    color: var(--muted-2);
  }
  .pack {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 3px;
    padding: 12px;
    border: 1px solid var(--line);
    border-radius: 12px;
    background: var(--panel-2);
    color: var(--text);
    font: inherit;
    cursor: pointer;
    transition: border-color 0.14s ease, transform 0.08s ease;
  }
  .pack:hover { border-color: var(--gold, #e3a13b); transform: translateY(-1px); }
  .pack-label { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; }
  .pack-coins { font-size: 18px; font-weight: 800; display: flex; align-items: baseline; gap: 5px; }
  .pack-coins span { font-size: 10.5px; font-weight: 600; color: var(--muted); text-transform: uppercase; }
  .pack-price { font-size: 13px; font-weight: 700; color: var(--gold, #e3a13b); }
  .pack-note { margin-top: 2px; }

  .history-list { display: flex; flex-direction: column; max-height: 300px; overflow-y: auto; }
  .h-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 9px 2px;
    border-bottom: 1px solid var(--line-soft);
  }
  .h-row:last-child { border-bottom: 0; }
  .h-desc { display: flex; flex-direction: column; gap: 1px; }
  .h-desc strong { font-size: 12.5px; }
  .h-delta { font-size: 14px; font-weight: 800; color: var(--ok); white-space: nowrap; }
  .h-delta.neg { color: var(--danger, #e5534b); }

  .wall-hint strong { font-size: 12px; color: var(--gold, #e3a13b); }
  .wall-hint ul { margin: 6px 0 0; padding-left: 18px; }
  .wall-hint li { font-size: 12px; color: var(--muted); line-height: 1.6; }
  .earn { display: flex; flex-direction: column; gap: 14px; margin-top: 16px; }
  .earn-head { font-size: 13px; font-weight: 700; color: var(--gold, #e3a13b); }
  .earn-sec { display: flex; flex-direction: column; gap: 8px; }
  .earn-sec-title { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted-2); font-weight: 700; margin-top: 4px; }
  .earn-card {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 11px 13px;
    border: 1px solid var(--line);
    border-radius: 12px;
    background: var(--panel);
  }
  .e-ic {
    width: 38px; height: 38px; flex: none;
    display: grid; place-items: center;
    border-radius: 10px;
    background: var(--panel-2);
    border: 1px solid var(--line);
    font-size: 18px;
  }
  .e-info { flex: 1; min-width: 0; }
  .e-name { font-weight: 600; font-size: 13px; }
  .e-desc { font-size: 11.5px; color: var(--muted); margin-top: 2px; line-height: 1.4; }
  .e-reward { flex: none; text-align: right; font-weight: 800; font-size: 13px; color: var(--gold, #e3a13b); white-space: nowrap; }
  .e-reward small { display: block; font-weight: 600; font-size: 10px; color: var(--muted); }
  .btn-mini {
    height: 28px;
    padding: 0 10px;
    border-radius: 7px;
    border: 1px solid var(--line);
    background: var(--panel-2);
    color: var(--text);
    font-size: 11.5px;
    font-weight: 600;
    cursor: pointer;
    flex: none;
    white-space: nowrap;
  }
  .btn-mini:hover { border-color: rgba(138, 180, 255, 0.4); color: var(--accent); }
  .btn-mini:disabled { opacity: 0.5; cursor: default; }
  .wall-warn {
    margin-top: 10px;
    padding: 11px 14px;
    border: 1px solid rgba(226, 83, 77, 0.4);
    border-radius: 12px;
    background: rgba(226, 83, 77, 0.07);
    color: var(--muted);
    font-size: 11.5px;
    line-height: 1.55;
  }
  .coin-status {
    display: block;
    margin-top: 8px;
    font-size: 12px;
    font-weight: 600;
    color: var(--muted);
  }
  .coin-status.ok { color: var(--ok, #43d17a); }
  .coin-status.bad { color: var(--danger, #e5534b); }

  .collect-box {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    padding: 14px 16px;
    border: 1px solid var(--gold, #e3a13b);
    border-radius: 14px;
    background: linear-gradient(135deg, rgba(227, 161, 59, 0.14), rgba(227, 161, 59, 0.03));
  }
  .collect-info { flex: 1; min-width: 0; }
  .collect-name { font-weight: 700; font-size: 14px; color: var(--text); }
  .collect-desc { font-size: 12px; color: var(--muted); margin-top: 3px; line-height: 1.4; }
  .collect-btn {
    flex: none;
    height: 40px;
    padding: 0 18px;
    border-radius: 10px;
    border: 1px solid var(--gold, #e3a13b);
    background: linear-gradient(135deg, #e3a13b, #f0c060);
    color: #241a08;
    font-size: 13px;
    font-weight: 800;
    cursor: pointer;
    white-space: nowrap;
  }
  .collect-btn:hover { filter: brightness(1.05); }
  .collect-btn:disabled {
    background: var(--panel-2);
    border-color: var(--line);
    color: var(--muted-2);
    cursor: default;
    filter: none;
  }

  .ghost, .primary {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: 36px;
    padding: 0 16px;
    border-radius: var(--radius-sm);
    font: inherit;
    font-size: 12.5px;
    font-weight: 600;
    cursor: pointer;
  }
  .ghost { border: 1px solid var(--line); background: var(--panel-2); color: var(--text); }
  .ghost:hover { background: var(--panel-3); }
  .primary {
    border: 1px solid transparent;
    background: var(--btn-bg);
    color: var(--btn-ink);
    box-shadow: var(--btn-glow);
  }
  .primary:hover { background: var(--btn-bg-hover); }
</style>