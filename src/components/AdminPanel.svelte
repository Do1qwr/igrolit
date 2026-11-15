<script lang="ts">
  import { onMount } from 'svelte';
  import Icon from './Icon.svelte';
  import {
    online,
    requestAdminData,
    adminBan,
    adminKick,
    adminDeleteUser,
    adminSetAdmin,
    moderateServer,
    removePublicServer,
    setupTotp,
    enableTotp,
    disableTotp,
    requestAudit,
    resolveComplaint,
    adjustReputation,
  } from '../lib/online';

  let query = '';
  let confirmDelete: string | null = null;
  let confirmSrv: string | null = null;
  let status = '';
  let twofaCode = '';

  export let onOpenSupport: () => void = () => {};

  $: isAdmin = $online.isAdmin;
  $: users = $online.adminUsers ?? [];
  $: stats = $online.adminStats;
  $: pending = $online.pendingServers ?? [];
  $: servers = $online.publicServers ?? [];
  $: twofa = $online.twofa;
  $: totp = $online.adminTotp;
  $: audit = $online.adminAudit ?? [];
  $: weak = $online.weakPassword;
  $: admins = users.filter((user) => user.admin);
  $: supportTickets = $online.allTickets ?? [];
  $: openTickets = supportTickets.filter((ticket) => ticket.status !== 'closed').length;
  $: complaints = $online.complaints ?? [];
  $: openComplaints = complaints.filter((complaint) => complaint.status === 'open').length;

  let prevTwofa = $online.twofa;
  $: if ($online.twofa !== prevTwofa) {
    prevTwofa = $online.twofa;
    status = $online.twofa ? '2FA включена' : '2FA отключена';
    twofaCode = '';
  }
  $: filtered = users.filter((user) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      user.name.toLowerCase().includes(q) ||
      (user.email || '').toLowerCase().includes(q) ||
      (user.game || '').toLowerCase().includes(q)
    );
  });

  onMount(() => {
    if ($online.authed) requestAdminData();
  });

  function refresh() {
    requestAdminData();
    status = 'Данные обновлены';
  }

  function act(label: string, fn: () => void) {
    status = '';
    fn();
    status = label;
  }

  const ACTION_LABEL: Record<string, string> = {
    ban: 'заблокировал',
    unban: 'разблокировал',
    kick: 'отключил',
    delete_user: 'удалил пользователя',
    grant_admin: 'выдал права админа',
    revoke_admin: 'снял права админа',
    server_approve: 'одобрил сервер',
    server_reject: 'отклонил сервер',
    server_remove: 'удалил сервер',
    '2fa_enable': 'включил 2FA',
    '2fa_disable': 'отключил 2FA',
  };

  function actionLabel(action: string): string {
    return ACTION_LABEL[action] || action;
  }

  function when(ts: number): string {
    try {
      return new Date(ts).toLocaleString('ru-RU', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '';
    }
  }

  function confirmTotp() {
    if (!/^\d{6}$/.test(twofaCode.trim())) {
      status = 'Код — 6 цифр';
      return;
    }
    if (twofa) {
      disableTotp(twofaCode.trim());
      status = 'Запрос на отключение 2FA отправлен';
    } else {
      enableTotp(twofaCode.trim());
      status = 'Запрос на включение 2FA отправлен';
    }
    twofaCode = '';
  }
</script>

<div class="admin">
  <header class="adm-head">
    <div>
      <h2>Администрирование</h2>
      <p class="muted small">Пользователи, блокировки и серверы — всё управление в одном месте.</p>
    </div>
    {#if isAdmin}
      <button class="ghost" on:click={refresh}>Обновить</button>
    {/if}
  </header>

  {#if !$online.authed}
    <section class="panel">
      <h3>Нужен вход</h3>
      <p class="muted small">Войдите в онлайн-аккаунт с правами администратора.</p>
    </section>
  {:else if !isAdmin}
    <section class="panel">
      <h3>Нет прав</h3>
      <p class="muted small">
        Раздел доступен администраторам. Список админов задаётся на сервере переменной окружения
        ADMIN_NAMES (через запятую), например: ADMIN_NAMES=ник1,ник2.
      </p>
    </section>
  {:else}
    {#if status}<p class="status">{status}</p>{/if}
    {#if $online.error}<p class="status err">{$online.error}</p>{/if}

    <div class="stat-grid">
      <div class="stat">
        <span class="stat-val">{stats?.users ?? '—'}</span>
        <span class="muted small">пользователей</span>
        <span class="muted small">онлайн: {stats?.online ?? 0} · бан: {stats?.banned ?? 0}</span>
      </div>
      <div class="stat">
        <span class="stat-val">{stats?.approved ?? '—'}</span>
        <span class="muted small">серверов</span>
        <span class="muted small">на модерации: {stats?.pending ?? 0}</span>
      </div>
      <div class="stat">
        <span class="stat-val">{stats?.rooms ?? '—'}</span>
        <span class="muted small">комнат онлайн</span>
        <span class="muted small">админов: {stats?.admins ?? 0}</span>
      </div>
    </div>

    <section class="panel">
      <div class="sect-head">
        <h3>Оплаты и продвижение</h3>
        <span class="muted small">заказов: {$online.adminOrders.length}</span>
      </div>
      <div class="stat-grid">
        <div class="stat">
          <span class="stat-val">{$online.adminTotals?.paidSum ?? 0} ₽</span>
          <span class="muted small">выручка</span>
          <span class="muted small">оплачено: {$online.adminTotals?.paidCount ?? 0}</span>
        </div>
        <div class="stat">
          <span class="stat-val">{$online.adminTotals?.paidCoins ?? 0} монет</span>
          <span class="muted small">списано монет</span>
          <span class="muted small">за оформление в монетах</span>
        </div>
        <div class="stat">
          <span class="stat-val">{$online.adminTotals?.pending ?? 0}</span>
          <span class="muted small">ждут оплаты</span>
          <span class="muted small">счета не оплачены</span>
        </div>
        <div class="stat">
          <span class="stat-val">{$online.adminTotals?.expired ?? 0}</span>
          <span class="muted small">истекли</span>
          <span class="muted small">старше 7 дней</span>
        </div>
      </div>
      {#if $online.adminOrders.length === 0}
        <p class="muted small">Заказов пока не было.</p>
      {:else}
        <div class="pay-list">
          {#each $online.adminOrders.slice(0, 40) as order (order.id)}
            <div class="pay-row">
              <span class="pay-who">{order.user}</span>
              <span class="pay-what">{order.serverName}</span>
              <span class="muted small">{new Date(order.ts).toLocaleDateString('ru-RU')}</span>
              <span class="pay-sum">{order.amount} {(order.currency ?? 'rub') === 'coins' ? 'монет' : '₽'}</span>
              <span class="pay-state {order.status}">
                {order.status === 'paid' ? 'оплачен' : order.status === 'expired' ? 'истёк' : 'ожидает'}
              </span>
            </div>
          {/each}
        </div>
      {/if}
    </section>

    <section class="panel">
      <div class="sect-head">
        <h3>Безопасность аккаунта</h3>
        <span class="tag admin">{twofa ? '2FA включена' : '2FA выключена'}</span>
      </div>
      {#if weak}
        <p class="warn">Пароль короче 10 символов — смените его на более длинный.</p>
      {/if}
      {#if !twofa}
        <p class="muted small">
          Двухфакторная защита: при входе кроме пароля понадобится 6-значный код из
          приложения-аутентификатора (Google Authenticator, Aegis, 1Password и похожие).
        </p>
        {#if !totp}
          <button class="mini" on:click={() => { setupTotp(); status = 'Секрет сформирован — добавьте его в приложение'; }}>
            Включить 2FA
          </button>
        {:else}
          <div class="sec-box">
            <span class="muted small">Секрет для ручного ввода:</span>
            <code class="mono">{totp.secret}</code>
            <span class="muted small">Ссылка для приложения:</span>
            <code class="mono small">{totp.otpauth}</code>
          </div>
          <div class="sec-row">
            <input
              class="code"
              bind:value={twofaCode}
              placeholder="6 цифр из приложения"
              maxlength="6"
              inputmode="numeric"
              spellcheck="false"
            />
            <button class="mini ok" on:click={confirmTotp}>Подтвердить</button>
          </div>
        {/if}
      {:else}
        <p class="muted small">2FA включена. Чтобы отключить, введите текущий код.</p>
        <div class="sec-row">
          <input
            class="code"
            bind:value={twofaCode}
            placeholder="6 цифр"
            maxlength="6"
            inputmode="numeric"
            spellcheck="false"
          />
          <button class="mini danger" on:click={confirmTotp}>Отключить 2FA</button>
        </div>
      {/if}
    </section>

    <section class="panel">
      <div class="sect-head">
        <h3>Пользователи</h3>
        <input class="search" bind:value={query} placeholder="Поиск по нику, почте или игре" spellcheck="false" />
      </div>

      {#if filtered.length === 0}
        <p class="muted small">Никого не найдено.</p>
      {:else}
        <div class="u-list">
          {#each filtered as user (user.name)}
            <div class="u-row">
              <span class="dot" class:on={user.online} class:off={!user.online}></span>
              <div class="u-main">
                <div class="u-name">
                  <strong>{user.name}</strong>
                  {#if user.admin}<span class="tag admin">админ</span>{/if}
                  {#if user.banned}<span class="tag ban">бан</span>{/if}
                </div>
                <div class="u-meta">
                  {user.email || 'почта не указана'} · друзей: {user.friends} · ⭐ {user.reputation ?? 50}
                  {#if user.game} · играет: {user.game}{/if}
                </div>
              </div>
              <div class="u-actions">
                <button class="mini" title="Повысить репутацию" on:click={() => act(`Репутация ${user.name} +5`, () => adjustReputation(user.name, 5))}>⭐+5</button>
                <button class="mini" title="Понизить репутацию" on:click={() => act(`Репутация ${user.name} −5`, () => adjustReputation(user.name, -5))}>⭐−5</button>
                {#if user.online}
                  <button class="mini" on:click={() => act(`Отключён ${user.name}`, () => adminKick(user.name))}>Кик</button>
                {/if}
                <button class="mini" class:danger={!user.banned} on:click={() => act(user.banned ? `Разбанен ${user.name}` : `Забанен ${user.name}`, () => adminBan(user.name, !user.banned))}>
                  {user.banned ? 'Разбан' : 'Бан'}
                </button>
                {#if !user.admin}
                  <button class="mini" on:click={() => act(`Назначен админом ${user.name}`, () => adminSetAdmin(user.name, true))}>В админы</button>
                {:else if user.name !== $online.user}
                  <button class="mini" on:click={() => act(`Снят с админов ${user.name}`, () => adminSetAdmin(user.name, false))}>Снять</button>
                {/if}
                {#if user.name !== $online.user}
                  {#if confirmDelete === user.name}
                    <button class="mini danger" on:click={() => { adminDeleteUser(user.name); confirmDelete = null; status = `Удалён ${user.name}`; }}>Точно?</button>
                    <button class="mini" on:click={() => (confirmDelete = null)}>Нет</button>
                  {:else}
                    <button class="mini" on:click={() => (confirmDelete = user.name)}>Удалить</button>
                  {/if}
                {/if}
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </section>

    <section class="panel">
      <div class="sect-head">
        <h3>Жалобы</h3>
        <span class="muted small">{openComplaints} открытых из {complaints.length}</span>
      </div>
      {#if complaints.length === 0}
        <p class="muted small">Жалоб нет.</p>
      {:else}
        {#each complaints as complaint (complaint.id)}
          <div class="srv-row">
            <div class="srv-main">
              <strong>{complaint.target}</strong>
              <span class="muted small">от {complaint.from} · {when(complaint.ts)} · {complaint.status}</span>
              <span class="muted small">{complaint.reason}</span>
            </div>
            {#if complaint.status === 'open'}
              <div class="row-btns">
                <button class="mini danger" on:click={() => act(`Забанен ${complaint.target}`, () => resolveComplaint(complaint.id, 'ban'))}>Забанить</button>
                <button class="mini" on:click={() => act('Жалоба отклонена', () => resolveComplaint(complaint.id, 'dismiss'))}>Отклонить</button>
              </div>
            {/if}
          </div>
        {/each}
      {/if}
    </section>

    <section class="panel">
      <div class="sect-head">
        <h3>Администраторы</h3>
        <span class="muted small">{admins.length}</span>
      </div>
      {#if admins.length === 0}
        <p class="muted small">Пока никого.</p>
      {:else}
        {#each admins as adminUser (adminUser.name)}
          <div class="srv-row">
            <span class="dot" class:on={adminUser.online} class:off={!adminUser.online}></span>
            <div class="srv-main">
              <div class="u-name">
                <strong>{adminUser.name}</strong>
                {#if adminUser.name === $online.user}<span class="tag admin">вы</span>{/if}
              </div>
              <span class="muted small">
                {adminUser.online ? 'в сети' : 'не в сети'}{adminUser.email ? ' · ' + adminUser.email : ''}
              </span>
            </div>
            <span class="muted small">друзей: {adminUser.friends}</span>
          </div>
        {/each}
      {/if}
    </section>

    <div class="cols">
      <section class="panel">
        <div class="sect-head">
          <h3>Заявки на серверы</h3>
          <span class="muted small">{pending.length}</span>
        </div>
        {#if pending.length === 0}
          <p class="muted small">Очередь пуста.</p>
        {:else}
          {#each pending as p (p.id)}
            <div class="srv-row">
              <div class="srv-main">
                <strong>{p.name}</strong>
                <code class="addr">{p.address}</code>
                <span class="muted small">от {p.by}{p.game ? ' · ' + p.game : ''}</span>
              </div>
              <div class="row-btns">
                <button class="mini ok" on:click={() => act(`Одобрен ${p.name}`, () => moderateServer(p.id, 'approve'))}>✓</button>
                <button class="mini danger" on:click={() => act(`Отклонён ${p.name}`, () => moderateServer(p.id, 'reject'))}>✕</button>
              </div>
            </div>
          {/each}
        {/if}
      </section>

      <section class="panel">
        <div class="sect-head">
          <h3>Одобренные серверы</h3>
          <span class="muted small">{servers.length}</span>
        </div>
        {#if servers.length === 0}
          <p class="muted small">Список пуст.</p>
        {:else}
          {#each servers as s (s.id)}
            <div class="srv-row">
              <div class="srv-main">
                <strong>{s.name}</strong>
                <code class="addr">{s.address}</code>
                <span class="muted small">от {s.by}</span>
              </div>
              {#if confirmSrv === s.id}
                <button class="mini danger" on:click={() => { act(`Удалён ${s.name}`, () => removePublicServer(s.id)); confirmSrv = null; }}>Точно?</button>
                <button class="mini" on:click={() => (confirmSrv = null)}>Нет</button>
              {:else}
                <button class="mini danger" title="Удалить" on:click={() => (confirmSrv = s.id)}>✕</button>
              {/if}
            </div>
          {/each}
        {/if}
      </section>
    </div>

    <section class="panel">
      <div class="sect-head">
        <h3>Журнал действий</h3>
        <button class="mini" on:click={() => requestAudit()}>Обновить</button>
      </div>
      {#if audit.length === 0}
        <p class="muted small">Пока пусто.</p>
      {:else}
        <div class="audit-list">
          {#each audit as entry (`${entry.ts}-${entry.actor}-${entry.action}-${entry.target}`)}
            <div class="audit-row">
              <span class="muted small">{when(entry.ts)}</span>
              <span>
                <strong>{entry.actor}</strong>
                {actionLabel(entry.action)}
                {#if entry.target}· {entry.target}{/if}
                {#if entry.extra}· {entry.extra}{/if}
              </span>
            </div>
          {/each}
        </div>
      {/if}
    </section>

    <section class="panel">
      <div class="sect-head">
        <h3>Поддержка</h3>
        <span class="muted small">{openTickets} открытых из {supportTickets.length}</span>
      </div>
      <p class="muted small">Обращения и пожелания игроков: ответы и закрытие — в разделе поддержки.</p>
      <button class="mini" on:click={() => onOpenSupport()}>Открыть раздел</button>
    </section>
  {/if}
</div>

<style>
  .admin { display: flex; flex-direction: column; gap: 14px; padding: 20px 24px; width: 100%; max-width: none; box-sizing: border-box; }
  .adm-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
  .adm-head h2 { margin: 0; font-size: 20px; }
  .adm-head .muted { margin: 4px 0 0; }
  .muted { color: var(--muted); }
  .muted.small { font-size: 12px; }

  .panel {
    padding: 16px;
    border: 1px solid var(--line);
    border-radius: 12px;
    background: var(--panel);
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .panel h3 { margin: 0; font-size: 14px; }
  .sect-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }

  .stat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
  .stat {
    padding: 14px 16px;
    border: 1px solid var(--line);
    border-radius: 12px;
    background: var(--panel);
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .stat-val { font-size: 22px; font-weight: 700; color: var(--accent); }
.pay-list { display: flex; flex-direction: column; gap: 6px; margin-top: 12px; }
.pay-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  padding: 8px 11px;
  border: 1px solid var(--line);
  border-radius: 9px;
  background: var(--panel-2);
  font-size: 12px;
}
.pay-who { font-weight: 600; min-width: 90px; }
.pay-what { flex: 1; min-width: 120px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pay-sum { font-weight: 700; color: var(--gold); }
.pay-state {
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  background: var(--hover-2);
  color: var(--muted);
}
.pay-state.paid { background: rgba(67, 209, 122, 0.16); color: var(--ok); }
.pay-state.expired { background: rgba(255, 111, 111, 0.14); color: var(--danger); }

  .search {
    height: 32px;
    padding: 0 10px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--bg-soft);
    color: var(--text);
    font: inherit;
    font-size: 12.5px;
    min-width: 240px;
  }
  .search:focus { outline: none; border-color: var(--accent); }

  .u-list { display: flex; flex-direction: column; gap: 6px; max-height: 420px; overflow-y: auto; }
  .u-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 9px 11px;
    border: 1px solid var(--line);
    border-radius: 10px;
  }
  .u-row:hover { border-color: var(--accent); }
  .dot { width: 9px; height: 9px; flex: none; border-radius: 50%; background: #8a8f98; }
  .dot.on { background: var(--ok); box-shadow: 0 0 0 3px rgba(67, 209, 122, 0.18); }
  .dot.off { background: #5d6472; }
  .u-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .u-name { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; }
  .u-name strong { font-size: 13px; }
  .u-meta { font-size: 11.5px; color: var(--muted); overflow-wrap: anywhere; }
  .tag { padding: 1px 7px; border-radius: 999px; font-size: 10px; font-weight: 600; }
  .tag.admin { background: var(--accent-soft); color: var(--accent); }
  .tag.ban { background: rgba(239, 91, 91, 0.16); color: var(--danger); }
  .u-actions { display: flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }

  .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; align-items: start; }

  .srv-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 9px 11px;
    border: 1px solid var(--line);
    border-radius: 10px;
  }
  .srv-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .srv-main strong { font-size: 12.5px; }
  .addr { font-family: var(--mono, monospace); font-size: 11px; color: var(--accent); }
  .row-btns { display: flex; gap: 6px; }

  .mini {
    height: 28px;
    padding: 0 10px;
    border: 1px solid var(--line);
    border-radius: 7px;
    background: var(--panel-2);
    color: var(--text);
    font: inherit;
    font-size: 11.5px;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
    transition: background 0.14s ease, border-color 0.14s ease, color 0.14s ease;
  }
  .mini:hover { background: var(--panel-3); border-color: var(--muted-2); }
  .mini.danger { color: var(--danger); }
  .mini.danger:hover { border-color: var(--danger); background: rgba(239, 91, 91, 0.12); }
  .mini.ok { color: var(--ok); }
  .mini.ok:hover { border-color: var(--ok); background: rgba(67, 209, 122, 0.12); }

  .ghost {
    height: 32px;
    padding: 0 12px;
    border: 1px solid var(--line);
    border-radius: var(--radius-sm);
    background: var(--panel-2);
    color: var(--text);
    font: inherit;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
  }
  .ghost:hover { background: var(--panel-3); border-color: var(--muted-2); }

  .status { margin: 0; padding: 8px 12px; border-radius: 8px; background: var(--hover-2); font-size: 12.5px; }
  .status.err { background: rgba(239, 91, 91, 0.14); color: var(--danger); }

  .warn {
    margin: 0;
    padding: 9px 12px;
    border-radius: 8px;
    background: rgba(239, 180, 91, 0.14);
    color: #ffca7a;
    font-size: 12.5px;
  }
  .sec-box {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 10px 12px;
    border: 1px dashed var(--line);
    border-radius: 9px;
  }
  .mono {
    font-family: var(--mono, monospace);
    font-size: 12.5px;
    color: var(--accent);
    letter-spacing: 0.06em;
    overflow-wrap: anywhere;
  }
  .mono.small { font-size: 11px; letter-spacing: 0; }
  .sec-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .code {
    height: 32px;
    padding: 0 10px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--bg-soft);
    color: var(--text);
    font: inherit;
    font-size: 12.5px;
    letter-spacing: 0.14em;
    width: 200px;
  }
  .code:focus { outline: none; border-color: var(--accent); }

  .audit-list { display: flex; flex-direction: column; gap: 5px; max-height: 260px; overflow-y: auto; }
  .audit-row {
    display: flex;
    gap: 10px;
    align-items: baseline;
    padding: 6px 9px;
    border: 1px solid var(--line);
    border-radius: 8px;
    font-size: 12px;
  }
  .audit-row .muted.small { flex: none; width: 110px; }

  @media (max-width: 980px) {
    .cols { grid-template-columns: 1fr; }
    .stat-grid { grid-template-columns: 1fr; }
  }
</style>
