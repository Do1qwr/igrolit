<script lang="ts">
  import { online, voteServer, bannerUrl, iconUrl, updateServer } from '../lib/online';
  import type { PublicServer } from '../lib/online';

  export let server: PublicServer;
  export let onBack: () => void = () => {};

  let nick = '';
  let note = '';
  let copied = '';

  let editOpen = false;
  let editName = '';
  let editAddress = '';
  let editGame = '';
  let editDesc = '';
  let editNote = '';
  let editSlots = 0;
  let editAdded = '';

  const GAME_CHOICES = [
    'Counter-Strike 1.6',
    'Counter-Strike: Source',
    'Counter-Strike: Global Offensive',
    'Counter-Strike 2',
    'Minecraft',
    'Rust',
    "Garry's Mod",
    'DayZ',
    'GTA / SA-MP',
    'Lineage II',
    'World of Warcraft',
    'MU Online',
    'Team Fortress 2',
    'Другая игра',
  ];

  $: canEdit = !!($online.user && (server.by === $online.user || $online.isAdmin));

  function openEdit() {
    editName = server.name;
    editAddress = server.address;
    editGame = server.game || 'Counter-Strike 1.6';
    editDesc = server.desc || '';
    editSlots = server.maxPlayers || 0;
    editAdded = server.added ? new Date(server.added).toISOString().slice(0, 10) : '';
    editNote = '';
    editOpen = true;
  }

  function saveEdit() {
    if (!editName.trim() || !editAddress.trim()) {
      editNote = 'Укажите название и адрес';
      return;
    }
    const addedTs = editAdded ? Date.parse(`${editAdded}T12:00:00`) : NaN;
    updateServer(server.id, {
      name: editName.trim(),
      address: editAddress.trim(),
      game: editGame.trim(),
      desc: editDesc.trim(),
      maxPlayers: Number(editSlots) || 0,
      added: Number.isFinite(addedTs) && addedTs > 0 ? addedTs : undefined,
    });

    // Обновляем страницу сразу, чтобы новые числа были видны без перезагрузки.
    server.name = editName.trim();
    server.address = editAddress.trim();
    server.game = editGame.trim();
    server.desc = editDesc.trim();
    if (Number(editSlots) > 0) server.maxPlayers = Number(editSlots);
    if (Number.isFinite(addedTs) && addedTs > 0) server.added = addedTs;

    editOpen = false;
    note = 'Изменения сохранены. Игроки, пинг и голоса считаются автоматически.';
  }

  function plural(n: number, one: string, few: string, many: string) {
    const d10 = n % 10;
    const d100 = n % 100;
    if (d10 === 1 && d100 !== 11) return one;
    if (d10 >= 2 && d10 <= 4 && !(d100 >= 12 && d100 <= 14)) return few;
    return many;
  }

  function ago(ts: number) {
    if (!ts) return '—';
    const min = Math.floor((Date.now() - ts) / 60000);
    if (min < 1) return 'только что';
    if (min < 60) return `${min} ${plural(min, 'минуту', 'минуты', 'минут')} назад`;
    const h = Math.floor(min / 60);
    if (h < 24) return `${h} ${plural(h, 'час', 'часа', 'часов')} назад`;
    const d = Math.floor(h / 24);
    return `${d} ${plural(d, 'день', 'дня', 'дней')} назад`;
  }

  function dateOf(ts: number) {
    if (!ts) return '—';
    return new Date(ts).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  function copy(text: string, tag: string) {
    navigator.clipboard.writeText(text).then(() => {
      copied = tag;
      setTimeout(() => { if (copied === tag) copied = ''; }, 1600);
    }).catch(() => {});
  }

  function doVote() {
    note = '';
    if (!server.canVote) {
      note = `Следующий голос через ${Math.max(1, Math.ceil(server.voteWait / 3600))} ч`;
      return;
    }
    voteServer(server.id, nick.trim());
    note = 'Голос отправлен — спасибо!';
    nick = '';
  }

  $: initials = server.name.replace(/[^A-Za-zА-Яа-я0-9 ]/g, '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');

  $: history = (server.history || []).filter((p) => typeof p.players === 'number');
  $: maxPlayersSeen = history.reduce((m, p) => Math.max(m, p.players), 0);
  $: avgPlayers = history.length ? Math.round(history.reduce((s, p) => s + p.players, 0) / history.length) : 0;
  $: onlineShare = history.length
    ? Math.round((history.filter((p) => p.online).length / history.length) * 100)
    : 0;
  $: fillPct = server.maxPlayers ? Math.min(100, Math.round((server.players / server.maxPlayers) * 100)) : 0;

  function buildPath(points: { players: number }[], width: number, height: number) {
    if (points.length < 2) return '';
    const max = Math.max(1, ...points.map((p) => p.players));
    const stepX = width / (points.length - 1);
    return points.map((p, i) => {
      const x = i * stepX;
      const y = height - (p.players / max) * (height - 8) - 4;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
  }

  $: chartPath = buildPath(history, 560, 120);
</script>

<div class="sp">
  <button class="back" on:click={onBack}>‹ Все серверы</button>

  <section class="hero" class:has-banner={!!server.banner} style:--tint={server.highlight || ''}>
    {#if server.banner}
      <div class="hero-banner" style:background-image={`url(${bannerUrl(server)})`} aria-hidden="true"></div>
    {/if}
    <div class="head">
      {#if iconUrl(server)}
        <div class="logo img"><img src={iconUrl(server)} alt="" /></div>
      {:else}
        <div class="logo">{initials || 'SRV'}</div>
      {/if}
      <div class="head-main">
        <h1>{server.name}</h1>
        <div class="tags">
          <span class="tag strong">{server.game || 'Игра не указана'}</span>
          {#if server.version}<span class="tag">версия {server.version}</span>{/if}
          {#if server.map}<span class="tag">карта {server.map}</span>{/if}
          <span class="tag" class:ok={server.online} class:bad={server.checkedAt > 0 && !server.online}>
            {server.checkedAt ? (server.online ? 'онлайн' : 'не отвечает') : 'нет данных'}
          </span>
          {#if server.badge}<span class="tag promo">{server.badge}</span>{/if}
          {#if server.promoUntil > 0}<span class="tag promo">продвижение</span>{/if}
        </div>
      </div>
      <div class="head-actions">
        {#if canEdit}
          <button class="ghost" on:click={openEdit}>Редактировать</button>
        {/if}
        <button class="ghost" on:click={() => copy(server.address, 'head')}>
          {copied === 'head' ? 'адрес скопирован' : 'скопировать адрес'}
        </button>
      </div>
    </div>
  </section>

  <section class="facts">
    <div class="fact"><strong>{server.place > 0 ? '#' + server.place : '—'}</strong><span>место в рейтинге</span></div>
    <div class="fact"><strong>{server.votes}</strong><span>{plural(server.votes, 'голос', 'голоса', 'голосов')} за 2 года</span></div>
    <div class="fact"><strong>{server.votesMonth}</strong><span>{plural(server.votesMonth, 'голос', 'голоса', 'голосов')} за месяц</span></div>
    <div class="fact"><strong>{server.players}{server.maxPlayers ? ' из ' + server.maxPlayers : ''}</strong><span>игроков сейчас</span></div>
    <div class="fact"><strong>{maxPlayersSeen || '—'}</strong><span>пик за сбор наблюдений</span></div>
    <div class="fact"><strong>{server.ping ? server.ping + ' мс' : '—'}</strong><span>отклик</span></div>
    <div class="fact"><strong>{dateOf(server.added)}</strong><span>в каталоге с</span></div>
    <div class="fact"><strong>{ago(server.checkedAt)}</strong><span>последняя проверка</span></div>
  </section>

  {#if server.motd}
    <section class="panel motd">
      <span class="label">MOTD</span>
      <p>{server.motd}</p>
    </section>
  {/if}

  <div class="cols">
    <div class="main-col">
      <section class="panel">
        <h2>Голос за сервер</h2>
        <p class="muted">Один голос в сутки. Голоса учитываются в рейтинге 2 года.</p>
        <div class="vote-row">
          <input bind:value={nick} placeholder="Ник в игре (необязательно)" spellcheck="false" />
          <button class="primary" on:click={doVote} disabled={!server.canVote}>
            {server.canVote ? 'Голосовать' : 'Голос учтён'}
          </button>
        </div>
        {#if note}<p class="note">{note}</p>{/if}
        {#if $online.authed === false}<p class="muted small">Войдите в онлайн-раздел, чтобы голосовать.</p>{/if}
      </section>

      <section class="panel">
        <div class="panel-head">
          <h2>История онлайна</h2>
          <span class="muted small">наблюдения каждые 5 минут</span>
        </div>
        {#if history.length < 2}
          <div class="empty">Данных пока мало — график появится, когда накопится несколько проверок.</div>
        {:else}
          <svg class="chart" viewBox="0 0 560 120" preserveAspectRatio="none" role="img" aria-label="График онлайна">
            <path d={chartPath + ` L560,120 L0,120 Z`} class="area" />
            <path d={chartPath} class="line" />
          </svg>
          <div class="chart-facts">
            <div><strong>{maxPlayersSeen}</strong><span>пик</span></div>
            <div><strong>{avgPlayers}</strong><span>в среднем</span></div>
            <div><strong>{onlineShare}%</strong><span>проверок онлайн</span></div>
            <div><strong>{history.length}</strong><span>точек</span></div>
          </div>
        {/if}
      </section>

      <section class="panel">
        <h2>Журнал голосов</h2>
        {#if (server.votesLog || []).length === 0}
          <div class="empty">Голосов пока нет — станьте первым.</div>
        {:else}
          <div class="votes-list">
            {#each server.votesLog as v}
              <div class="vote-item"><span>{v.name}</span><span class="muted small">{ago(v.ts)}</span></div>
            {/each}
          </div>
        {/if}
      </section>
    </div>

    <aside class="side-col">
      <section class="panel">
        <h2>Адрес подключения</h2>
        <div class="addr-row">
          <code>{server.address}</code>
          <button class="ghost mini" on:click={() => copy(server.address, 'side')}>
            {copied === 'side' ? 'ок' : 'копировать'}
          </button>
        </div>
        <p class="muted small">Скопируйте адрес и вставьте его в игре в поле подключения.</p>
      </section>

      <section class="panel">
        <h2>Паспорт сервера</h2>
        <dl class="specs">
          <div><dt>Игра</dt><dd>{server.game || '—'}</dd></div>
          <div><dt>Версия</dt><dd>{server.version || '—'}</dd></div>
          <div><dt>Карта</dt><dd>{server.map || '—'}</dd></div>
          <div><dt>Слоты</dt><dd>{server.maxPlayers || '—'}</dd></div>
          <div><dt>Заполнено</dt><dd>{fillPct}%</dd></div>
          <div><dt>Отклик</dt><dd>{server.ping ? server.ping + ' мс' : '—'}</dd></div>
          <div><dt>Владелец</dt><dd>{server.by || '—'}</dd></div>
          <div><dt>Добавлен</dt><dd>{dateOf(server.added)}</dd></div>
          {#if server.promoUntil > 0}
            <div><dt>Продвижение</dt><dd>до {dateOf(server.promoUntil)}</dd></div>
          {/if}
        </dl>
      </section>

      <section class="panel" class:live={server.online}>
        <div class="panel-head">
          <h2>Проверки</h2>
          <span class="state" class:ok={server.online} class:bad={!server.online && server.checkedAt > 0}>
            {server.checkedAt ? (server.online ? 'сервер отвечает' : 'не отвечает') : 'нет данных'}
          </span>
        </div>
        <dl class="specs">
          <div><dt>Проверен</dt><dd>{ago(server.checkedAt)}</dd></div>
          <div><dt>Игроков</dt><dd>{server.players} / {server.maxPlayers || '—'}</dd></div>
          <div><dt>Отклик</dt><dd>{server.ping ? server.ping + ' мс' : '—'}</dd></div>
        </dl>
        <p class="muted small">Опрос идёт каждые 5 минут, пока сервер отвечает. Если он замолчал, повторные проверки становятся реже.</p>
      </section>
    </aside>
  </div>
</div>

{#if editOpen}
  <div class="edit-backdrop" on:click={() => (editOpen = false)} on:keydown={() => {}} role="presentation"></div>
  <div class="edit-modal" role="dialog" aria-modal="true" aria-label="Редактировать сервер">
    <h3>Редактировать сервер</h3>
    <p class="edit-note">Меняются только ваши данные. Онлайн, пинг, голоса и проверки считаются автоматически.</p>

    <label class="edit-field">
      <span>Название</span>
      <input bind:value={editName} maxlength="60" />
    </label>
    <label class="edit-field">
      <span>Адрес</span>
      <input bind:value={editAddress} spellcheck="false" />
    </label>
    <label class="edit-field">
      <span>Игра (категория)</span>
      <select bind:value={editGame}>
        {#each GAME_CHOICES as option (option)}
          <option value={option}>{option}</option>
        {/each}
      </select>
    </label>
    <label class="edit-field">
      <span>Слоты (игроков)</span>
      <input type="number" min="2" max="256" bind:value={editSlots} />
    </label>
    <label class="edit-field">
      <span>Дата добавления</span>
      <input type="date" bind:value={editAdded} />
    </label>
    <label class="edit-field">
      <span>Описание</span>
      <input bind:value={editDesc} maxlength="200" />
    </label>

    <div class="edit-auto">
      <span class="edit-auto-title">Считается автоматически</span>
      <span>игроки {server.players}{server.maxPlayers ? '/' + server.maxPlayers : ''}</span>
      <span>{server.checkedAt ? (server.online ? 'онлайн' : 'не отвечает') : 'нет данных'}</span>
      <span>голоса {server.votes}</span>
      <span>проверка {ago(server.checkedAt)}</span>
    </div>

    {#if editNote}<p class="edit-error">{editNote}</p>{/if}

    <div class="edit-actions">
      <button class="ghost" on:click={() => (editOpen = false)}>Отмена</button>
      <button class="primary" on:click={saveEdit}>Сохранить</button>
    </div>
  </div>
{/if}

<style>
  .primary {
    height: 38px;
    padding: 0 16px;
    border: 1px solid transparent;
    border-radius: 10px;
    background: var(--btn-bg);
    color: var(--btn-ink);
    font: inherit;
    font-size: 13px;
    font-weight: 680;
    cursor: pointer;
    white-space: nowrap;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.3), var(--btn-glow);
  }
  .primary:hover:not(:disabled) {
    background: var(--btn-bg-hover);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.38), 0 4px 14px rgba(90, 139, 255, 0.3);
  }
  .primary:disabled { opacity: 0.5; cursor: not-allowed; }
  .ghost {
    height: 34px;
    padding: 0 12px;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--panel);
    color: var(--text);
    font: inherit;
    font-size: 12px;
    cursor: pointer;
    white-space: nowrap;
  }
  .ghost:hover { background: var(--panel-2); }
  .ghost.mini { height: 26px; padding: 0 9px; font-size: 11px; }
  .sp { display: flex; flex-direction: column; gap: 14px; padding-bottom: 20px; }
  .back { align-self: flex-start; background: transparent; border: none; color: var(--muted); font: inherit; font-size: 12.5px; cursor: pointer; padding: 2px 0; }
  .back:hover { color: var(--accent); }

  .hero {
    position: relative;
    border: 1px solid var(--line);
    border-radius: 16px;
    background: var(--surface);
    overflow: hidden;
  }
  .hero::before {
    content: "";
    position: absolute;
    inset: 0 auto 0 0;
    width: 4px;
    background: var(--tint, var(--accent));
  }
  .hero-banner {
    position: absolute;
    inset: 0;
    background-size: cover;
    background-position: center;
    opacity: 0.9;
  }
  .hero-banner::after {
    content: "";
    position: absolute;
    inset: 0;
    background: linear-gradient(
      90deg,
      rgba(10, 14, 22, 0.9) 0%,
      rgba(10, 14, 22, 0.62) 46%,
      rgba(10, 14, 22, 0.28) 100%
    );
  }
  .hero.has-banner .head { padding: 26px 18px 26px; }
  .hero > *:not(.hero-banner) { position: relative; z-index: 1; }
  .head { display: flex; align-items: center; gap: 14px; padding: 14px 16px 16px; }
  .logo {
    width: 62px; height: 62px; flex: none;
    display: grid; place-items: center;
    border-radius: 14px;
    background: var(--panel-2);
    border: 1px solid var(--line);
    font-weight: 800; font-size: 20px; color: var(--accent);
  }
  .logo.img { padding: 3px; }
  .logo.img img {
    width: 100%; height: 100%;
    object-fit: cover;
    border-radius: 10px;
  }
  .head-main { flex: 1; min-width: 0; }
  h1 { font-size: 19px; font-weight: 750; margin-bottom: 7px; display: flex; align-items: center; gap: 7px; }
  .tags { display: flex; flex-wrap: wrap; gap: 6px; }
  .tag { padding: 2px 9px; border-radius: 999px; border: 1px solid var(--line); font-size: 11px; color: var(--muted); }
  .tag.strong { color: var(--text); font-weight: 600; }
  .tag.ok { color: var(--ok); border-color: rgba(67, 209, 122, 0.4); }
  .tag.bad { color: var(--danger); border-color: rgba(209, 85, 85, 0.4); }
  .tag.promo { color: var(--gold); border-color: rgba(227, 161, 59, 0.45); }
  .head-actions { flex: none; }

  .facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; }
  .fact { border: 1px solid var(--line); border-radius: 12px; padding: 12px 13px; background: var(--surface); display: flex; flex-direction: column; gap: 5px; }
  .fact strong { font-size: 17px; font-weight: 750; }
  .fact span { font-size: 10.5px; letter-spacing: 0.04em; text-transform: uppercase; color: var(--muted); }

  .panel { border: 1px solid var(--line); border-radius: 14px; padding: 15px 16px; background: var(--surface); }
  .panel.live { border-color: rgba(67, 209, 122, 0.45); }
  .panel h2 { font-size: 14.5px; font-weight: 700; margin-bottom: 8px; }
  .panel-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 8px; flex-wrap: wrap; }
  .panel-head h2 { margin-bottom: 0; }
  .muted { color: var(--muted); }
  .small { font-size: 11.5px; }
  .label { display: inline-block; font-size: 10px; letter-spacing: 0.08em; color: var(--muted); border: 1px solid var(--line); border-radius: 999px; padding: 1px 8px; margin-bottom: 8px; }
  .motd p { font-family: var(--mono, monospace); font-size: 12.5px; color: var(--text); white-space: pre-wrap; }

  .cols { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 14px; align-items: start; }
  .main-col, .side-col { display: flex; flex-direction: column; gap: 14px; }

  .vote-row { display: flex; gap: 8px; margin: 10px 0 6px; }
  .vote-row input { flex: 1; height: 38px; padding: 0 12px; background: var(--bg-soft); border: 1px solid var(--line); border-radius: 10px; color: var(--text); font: inherit; font-size: 12.5px; outline: none; }
  .vote-row input:focus { border-color: var(--accent); }
  .note { font-size: 12px; color: var(--accent); }

  .chart { width: 100%; height: 120px; display: block; }
  .chart .line { fill: none; stroke: var(--gold); stroke-width: 2; vector-effect: non-scaling-stroke; }
  .chart .area { fill: rgba(227, 161, 59, 0.16); stroke: none; }
  .chart-facts { display: flex; gap: 22px; flex-wrap: wrap; margin-top: 10px; }
  .chart-facts div { display: flex; flex-direction: column; gap: 3px; }
  .chart-facts strong { font-size: 15px; }
  .chart-facts span { font-size: 10.5px; text-transform: uppercase; color: var(--muted); }

  .votes-list { display: flex; flex-direction: column; }
  .vote-item { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 7px 0; border-bottom: 1px solid var(--line-soft, rgba(255,255,255,0.06)); font-size: 12.5px; }
  .vote-item:last-child { border-bottom: none; }

  .addr-row { display: flex; gap: 8px; align-items: center; }
  .addr-row code { flex: 1; min-width: 0; padding: 8px 10px; border: 1px solid var(--line); border-radius: 9px; background: var(--bg-soft); font-family: var(--mono, monospace); font-size: 12px; color: var(--accent); overflow: hidden; text-overflow: ellipsis; }

  .specs { margin: 0; display: flex; flex-direction: column; }
  .specs div { display: flex; justify-content: space-between; gap: 12px; padding: 6px 0; border-bottom: 1px solid var(--line-soft, rgba(255,255,255,0.06)); font-size: 12.5px; }
  .specs div:last-child { border-bottom: none; }
  .specs dt { color: var(--muted); }
  .specs dd { margin: 0; font-weight: 600; text-align: right; }

  .state { font-size: 11px; padding: 2px 9px; border-radius: 999px; border: 1px solid var(--line); color: var(--muted); }
  .state.ok { color: var(--ok); border-color: rgba(67, 209, 122, 0.45); }
  .state.bad { color: var(--danger); border-color: rgba(209, 85, 85, 0.45); }

  .empty { padding: 22px 10px; text-align: center; color: var(--muted); font-size: 12.5px; border: 1px dashed var(--line); border-radius: 10px; }

  @media (max-width: 980px) {
    .cols { grid-template-columns: 1fr; }
  }

  .edit-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.55);
    z-index: 70;
  }
  .edit-modal {
    position: fixed;
    left: 50%;
    top: 46%;
    transform: translate(-50%, -50%);
    width: 440px;
    max-width: calc(100vw - 40px);
    max-height: calc(100vh - 60px);
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 22px;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: var(--radius, 14px);
    box-shadow: 0 22px 60px rgba(0, 0, 0, 0.55);
    z-index: 71;
  }
  .edit-modal h3 { margin: 0; font-size: 16px; }
  .edit-note { margin: 0; font-size: 12px; line-height: 1.45; color: var(--muted); }
  .edit-field { display: flex; flex-direction: column; gap: 5px; }
  .edit-field span { font-size: 11.5px; font-weight: 600; color: var(--muted); }
  .edit-field input,
  .edit-field select {
    height: 34px;
    padding: 0 11px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--bg-soft);
    color: var(--text);
    font: inherit;
    font-size: 12.5px;
  }
  .edit-field select { cursor: pointer; }
  .edit-field input:focus,
  .edit-field select:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 0 2px var(--accent-soft);
  }
  .edit-auto {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 10px;
    padding: 10px 12px;
    border: 1px dashed var(--line);
    border-radius: 10px;
    font-size: 11.5px;
    color: var(--muted);
  }
  .edit-auto-title {
    flex-basis: 100%;
    font-size: 10.5px;
    font-weight: 700;
    letter-spacing: 0.6px;
    text-transform: uppercase;
    color: var(--muted-2);
  }
  .edit-error { margin: 0; font-size: 12px; color: var(--danger); }
  .edit-actions { display: flex; gap: 8px; }
  .edit-actions button { flex: 1 1 0; }
</style>
