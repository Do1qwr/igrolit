<script lang="ts">
  import { onMount } from 'svelte';
  import { online, requestPublicServers, submitServer, requestPendingServers, moderateServer, removePublicServer, requestOffers, sendOffer, dismissOffer, voteServer, refreshServers, recheckServer, setServerPromo, bannerUrl, iconUrl, imageCache, resolveImage } from '../lib/online';
  import type { PublicServer, ServerOffer } from '../lib/online';
  import { invoke } from '@tauri-apps/api/tauri';
  import Icon from './Icon.svelte';
  import AdBlock from './AdBlock.svelte';
  import Promotion from './Promotion.svelte';
  import ServerPage from './ServerPage.svelte';
  import { ask } from '../lib/dialogs';


  let submitOpen = false;
  let pubName = '';
  let pubAddress = '';
  let pubGame = 'Counter-Strike 1.6';
  let pubDesc = '';
  let status = '';
  let pubQuery = '';
  let offerTo = '';
  let offerName = '';
  let offerAddress = '';
  let offerGame = '';
  let offerNote = '';
  let addingOffer = '';

  $: offers = $online.offers ?? [];
  $: friends = $online.friends ?? [];
  $: if ($online.authed && !offerTo && friends.length) offerTo = friends[0].name;

  let sentSeen = $online.offersSent;
  $: if ($online.offersSent !== sentSeen) {
    sentSeen = $online.offersSent;
    if ($online.authed) {
      status = `Адрес отправлен игроку ${offerTo}`;
      offerName = '';
      offerAddress = '';
      offerGame = '';
      offerNote = '';
    }
  }

  let gameFilter = 'all';
  let voteTarget: PublicServer | null = null;
  let promoServer: PublicServer | null = null;
  let promoStart = '';

  // Картинки идут с внешнего сервера по http — тянем через Rust и отдаём data URL.
  $: imageFor = (url: string) => (url ? $imageCache[url] || resolveImage(url) : '');
  let openServer: PublicServer | null = null;
  let voteNick = '';
  let voteNote = '';

  function openVote(server: PublicServer) {
    if (!server.canVote) return;
    voteTarget = server;
    voteNick = $online.user || '';
    voteNote = '';
  }

  function ratioOf(size?: string): string {
    const m = /^(\d+)x(\d+)$/.exec(String(size || ''));
    if (!m) return '468 / 60';
    return `${m[1]} / ${m[2]}`;
  }

  function submitVote() {
    if (!voteTarget) return;
    voteServer(voteTarget.id, voteNick.trim());
    voteTarget = null;
  }

  const GAME_OPTIONS = [
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

  const GAME_FILTERS: { id: string; label: string; test: RegExp }[] = [
    { id: 'minecraft', label: 'Minecraft', test: /minecraft|майнкрафт/i },
    { id: 'lineage', label: 'Lineage II', test: /lineage|лайнейдж/i },
    { id: 'wow', label: 'World of Warcraft', test: /warcraft|\bwow\b|варкрафт/i },
    { id: 'mu', label: 'MU Online', test: /mu\s*online|\bmu\b/i },
    { id: 'cs', label: 'Counter-Strike', test: /counter-?strike|\bcs\s*1\.6|\bcs2\b|контр-?страйк/i },
    { id: 'rust', label: 'Rust', test: /\brust\b|раст/i },
    { id: 'samp', label: 'GTA / SAMP', test: /samp|sa-mp|\bgta\b|\bmta\b/i },
    { id: 'dayz', label: 'DayZ', test: /dayz|дейз/i },
    { id: 'gmod', label: "Garry's Mod", test: /garry|gmod|гари/i },
  ];

  function matchesGame(server: PublicServer): boolean {
    if (gameFilter === 'all') return true;
    const cat = GAME_FILTERS.find((item) => item.id === gameFilter);
    if (!cat) return true;
    const haystack = `${server.name} ${server.game} ${server.desc}`;
    return cat.test.test(haystack);
  }

  let sortBy: 'top' | 'week' | 'month' | 'online' | 'new' | 'name' = 'top';


  $: activeGame = GAME_FILTERS.find((item) => item.id === gameFilter) || null;

  $: offlineCount = ($online.publicServers ?? []).filter(
    (s) => s.checkedAt > 0 && !s.online,
  ).length;

  function matchesAnyCategory(server: PublicServer) {
    const haystack = `${server.name} ${server.game} ${server.desc}`;
    return GAME_FILTERS.some((filter) => filter.test.test(haystack));
  }

  $: gameCounts = (() => {
    const list = $online.publicServers ?? [];
    const counts: Record<string, number> = {
      all: list.length,
      other: list.filter((s) => !matchesAnyCategory(s)).length,
    };
    for (const filter of GAME_FILTERS) {
      counts[filter.id] = list.filter((s) =>
        filter.test.test(`${s.name} ${s.game} ${s.desc}`),
      ).length;
    }
    return counts;
  })();

  $: otherCount = gameCounts.other;

  $: filteredPublic = ($online.publicServers ?? [])
    .filter((s) => {
      const offline = s.checkedAt > 0 && !s.online;
      if (gameFilter === 'all') return true;
      if (gameFilter === 'offline') return offline;
      return true;
    })
    .filter((s) => {
      if (gameFilter === 'all' || gameFilter === 'offline') return true;
      if (gameFilter === 'other') return !matchesAnyCategory(s);
      return activeGame ? activeGame.test.test(`${s.name} ${s.game} ${s.desc}`) : true;
    })
    .filter((s) => {
      const q = pubQuery.trim().toLowerCase();
      if (!q) return true;
      return `${s.name} ${s.game} ${s.address} ${s.desc}`.toLowerCase().includes(q);
    })
    .filter((s) => !(s.listSlot || 0))
    .slice()
    .sort((a, b) => {
      if (sortBy === 'new') return (b.added || 0) - (a.added || 0);
      if (sortBy === 'online') {
        return (
          (Number(b.online) - Number(a.online)) ||
          (b.players || 0) - (a.players || 0) ||
          (a.added || 0) - (b.added || 0)
        );
      }
      if (sortBy === 'name') return a.name.localeCompare(b.name, 'ru');
      if (sortBy === 'week') {
        return (b.votesWeek || 0) - (a.votesWeek || 0) || (a.added || 0) - (b.added || 0);
      }
      if (sortBy === 'month') {
        return (b.votesMonth ?? 0) - (a.votesMonth ?? 0) || (a.added || 0) - (b.added || 0);
      }
      return (
        (Number(b.online) - Number(a.online)) ||
        (b.votes || 0) - (a.votes || 0) ||
        (a.added || 0) - (b.added || 0)
      );
    })
    .map((server, index) => ({ ...server, place: index + 1 }));

  // Рекламные блоки в каталоге: после #10, #25, #30 и постоянный в конце списка.
  $: adBlocks = $online.listBlocks ?? [];

  function applySearch(event: Event) {
    event.preventDefault();
    requestPublicServers();
  }

  function loadServers() {
    requestPublicServers();
    if ($online.isAdmin) requestPendingServers();
  }

  function submit() {
    if (!$online.authed) {
      status = 'Войдите в онлайн-раздел, чтобы добавить сервер';
      return;
    }
    if (!pubName.trim() || !pubAddress.trim()) {
      status = 'Укажите название и адрес';
      return;
    }
    if (!pubGame.trim()) {
      status = 'Выберите игру из списка';
      return;
    }
    submitServer({
      name: pubName.trim(),
      address: pubAddress.trim(),
      game: pubGame.trim(),
      desc: pubDesc.trim(),
    });
    submitOpen = false;
    pubName = '';
    pubAddress = '';
    pubDesc = '';
    status = 'Отправляю заявку на модерацию…';
    setTimeout(() => {
      status = $online.error ? '' : 'Заявка отправлена на модерацию';
      if ($online.isAdmin) requestPendingServers();
    }, 900);
    setTimeout(requestPublicServers, 300);
  }

  function moderate(id: string, action: 'approve' | 'reject') {
    if (!$online.isAdmin) return;
    moderateServer(id, action);
    setTimeout(() => { requestPendingServers(); requestPublicServers(); }, 350);
  }

  function launch(srv: PublicServer) {
    if (/cs\s*1\.6|counter-?strike|counterstrike/i.test(srv.game)) {
      launchRetroConnect(srv.address);
    } else {
      status = `Подключитесь в игре по адресу ${srv.address}`;
    }
  }

  async function launchRetroConnect(address: string) {
    status = 'Запускаю Counter-Strike 1.6…';
    try {
      status = await invoke<string>('launch_retro_connect', { gameId: 'counterstrike16', address });
    } catch (e) {
      status = String(e);
    }
  }

  // ---- Личные серверы (локальный мониторинг) ----
  interface ServerEntry { id: string; name: string; address: string; }

  let mine: ServerEntry[] = [];
  let mineStatus: Record<string, boolean | null> = {};
  let mineChecked: Record<string, number> = {};
  let copiedAddr = '';
  let copiedSrv = '';
  let checkingMine = false;
  let myName = '';
  let myAddress = '';
  let myModalOpen = false;

  async function checkMine() {
    if (checkingMine) return;
    const active = mine.filter((s) => mineStatus[s.id] !== false);
    if (active.length === 0) return;
    checkingMine = true;
    try {
      const results = await Promise.allSettled(
        active.map(async (s) => {
          let online = false;
          try { online = await invoke<boolean>('check_server_cmd', { address: s.address }); } catch (e) { online = false; }
          return { id: s.id, online };
        }),
      );
      for (const r of results) {
        if (r.status === 'fulfilled') {
          mineStatus[r.value.id] = r.value.online;
          mineChecked[r.value.id] = Date.now();
        }
      }
    } finally {
      checkingMine = false;
    }
  }

  $: mineSorted = [...mine].sort((a, b) => {
    const rank = (id: string) => (mineStatus[id] === true ? 0 : mineStatus[id] === null || mineStatus[id] === undefined ? 1 : 2);
    const diff = rank(a.id) - rank(b.id);
    return diff !== 0 ? diff : a.name.localeCompare(b.name, 'ru');
  });

  $: mineWorking = mine.filter((s) => mineStatus[s.id] === true).length;
  $: mineDown = mine.filter((s) => mineStatus[s.id] === false).length;

  function copyAddr(address: string) {
    navigator.clipboard.writeText(address).then(() => {
      copiedAddr = address;
      setTimeout(() => { if (copiedAddr === address) copiedAddr = ''; }, 1600);
    }).catch(() => {});
  }

  function promoDate(ts: number) {
    return new Date(ts).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  function promoDays(ts: number) {
    const d = Math.ceil((ts - Date.now()) / 86400000);
    if (d <= 0) return 'истекает';
    const tail = d % 10 === 1 && d % 100 !== 11 ? 'день' : [2, 3, 4].includes(d % 10) && ![12, 13, 14].includes(d % 100) ? 'дня' : 'дней';
    return `${d} ${tail}`;
  }

  function plural(n: number, one: string, few: string, many: string) {
    const d10 = n % 10;
    const d100 = n % 100;
    if (d10 === 1 && d100 !== 11) return one;
    if (d10 >= 2 && d10 <= 4 && !(d100 >= 12 && d100 <= 14)) return few;
    return many;
  }

  function loadPct(players?: number, max?: number) {
    const p = Number(players) || 0;
    const m = Number(max) || 0;
    if (!m) return 0;
    return Math.max(0, Math.min(100, Math.round((p / m) * 100)));
  }

  function stripText(value?: string) {
    return String(value || '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\^x[0-9a-fA-F]{6}/g, ' ')
      .replace(/\^\d/g, ' ')
      .replace(/\{[^{}]*\}/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function looksLikeMap(value?: string) {
    const v = stripText(value);
    return v.length > 0 && v.length <= 32 && /^[a-z0-9_.+\-]+$/i.test(v) && v === v.toLowerCase();
  }

  function looksLikeVersion(value?: string) {
    const v = stripText(value);
    return /^\d[0-9a-zA-Z.\-_+ ]{0,23}$/.test(v);
  }

  function checkedAgo(ts?: number) {
    if (!ts) return '';
    const min = Math.floor((Date.now() - ts) / 60000);
    if (min < 1) return 'только что';
    if (min < 60) return `${min} мин назад`;
    const hours = Math.floor(min / 60);
    if (hours < 24) return `${hours} ч назад`;
    return `${Math.floor(hours / 24)} дн назад`;
  }

  function copyServerAddr(address: string) {
    navigator.clipboard.writeText(address).then(() => {
      copiedSrv = address;
      setTimeout(() => { if (copiedSrv === address) copiedSrv = ''; }, 1500);
    }).catch(() => {});
  }

  function checkedLabel(id: string) {
    const ts = mineChecked[id];
    if (!ts) return '';
    const d = new Date(ts);
    return `проверено ${d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`;
  }

  async function loadMine() {
    try {
      mine = await invoke<ServerEntry[]>('list_retro_servers');
      for (const s of mine) if (!(s.id in mineStatus)) mineStatus[s.id] = null;
      await checkMine();
    } catch (e) {
      status = typeof e === 'string' ? e : 'Не удалось загрузить мои серверы';
    }
  }

  function openMyModal() { myName = ''; myAddress = ''; myModalOpen = true; }

  async function addMine() {
    if (!myName.trim() || !myAddress.trim()) { status = 'Укажите название и адрес'; return; }
    try {
      await invoke('add_retro_server_cmd', { name: myName, address: myAddress });
      myModalOpen = false;
      await loadMine();
    } catch (e) {
      status = typeof e === 'string' ? e : 'Не удалось добавить сервер';
    }
  }

  async function deleteMine(id: string) {
    if (
      !(await ask({
        title: 'Удалить сервер?',
        message: 'Сервер исчезнет из вашего списка и из каталога. Вернуть его можно повторным добавлением.',
        okLabel: 'Удалить',
        danger: true,
      }))
    )
      return;
    try {
      await invoke('delete_retro_server_cmd', { id });
      await loadMine();
    } catch (e) {
      status = typeof e === 'string' ? e : 'Не удалось удалить сервер';
    }
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

  async function addToMine(offer: ServerOffer) {
    addingOffer = offer.id;
    status = '';
    try {
      await invoke('add_retro_server_cmd', { name: offer.name, address: offer.address });
      dismissOffer(offer.id);
      await loadMine();
      status = `Добавлено в «Мои серверы»: ${offer.name}`;
    } catch (e) {
      status = `Не удалось добавить: ${String(e)}`;
    }
    addingOffer = '';
  }

  function submitOffer() {
    if (!offerTo) {
      status = 'Сначала добавьте друга в «Классика и сети»';
      return;
    }
    if (!offerName.trim() || !offerAddress.trim()) {
      status = 'Укажите название и адрес';
      return;
    }
    status = '';
    sendOffer({
      to: offerTo,
      name: offerName,
      address: offerAddress,
      game: offerGame,
      note: offerNote,
    });
  }

  onMount(() => {
    loadServers();
    loadMine();
    if ($online.authed) requestOffers();
  });
</script>

<svelte:window on:keydown={(e) => { if (e.key === 'Escape') { submitOpen = false; myModalOpen = false; voteTarget = null; } }} />

<div class="svc">
  {#if openServer}
    <ServerPage server={openServer} onBack={() => (openServer = null)} />
  {:else}
  <header class="svc-head">
    <div>
      <h2>Ваши серверы</h2>
      <p class="muted">Публичные серверы игроков. Добавьте свой — после проверки модератором его увидят все.</p>
    </div>
    <button class="ghost" on:click={loadServers}>Обновить список</button>
  </header>

  {#if status}<p class="status">{status}</p>{/if}
  {#if $online.error}<p class="status err">{$online.error}</p>{/if}

  <section class="hero">
    <div class="hero-text">
      <h1>Рейтинг и мониторинг <span>игровых серверов</span></h1>
      <p>Лучшие серверы игроков: честный топ по голосам, свои адреса и быстрый запуск.</p>
      <div class="hero-actions">
        <button class="primary hero-cta" on:click={() => (submitOpen = true)}>
          Добавить свой сервер <span class="free">бесплатно</span>
        </button>
        <button class="ghost" on:click={refreshServers}>Обновить данные</button>
      </div>
    </div>
    <div class="hero-stats">
      <div><strong>{$online.serverStats?.servers ?? 0}</strong><span>серверов в топе</span></div>
        <div><strong>{$online.serverStats?.online ?? 0}</strong><span>{plural($online.serverStats?.online ?? 0, 'игрок онлайн', 'игрока онлайн', 'игроков онлайн')}</span></div>
      <div><strong>{$online.serverStats?.votes ?? 0}</strong><span>голосов</span></div>
      <div><strong>{$online.serverStats?.games ?? 0}</strong><span>игр</span></div>
    </div>
  </section>

  <section class="panel mine-panel">
    <div class="svc-mod-head">
      <div>
        <h3>Мои серверы</h3>
        <p class="muted small">Ваши личные серверы — точка показывает статус (зелёная «работает», красная «не отвечает»).</p>
      </div>
      <div class="svc-btns">
        <button class="ghost" on:click={checkMine} disabled={checkingMine}>{checkingMine ? 'Проверяю…' : 'Обновить'}</button>
        <button class="primary" on:click={openMyModal}>+ Добавить</button>
      </div>
    </div>
    {#if mine.length > 0}
      <p class="mine-summary">
        Всего: <strong>{mine.length}</strong> · работает: <strong class="up">{mineWorking}</strong>
        {#if mineDown > 0}· не отвечает: <strong class="down">{mineDown}</strong>{/if}
      </p>
    {/if}
    {#if mine.length === 0}
      <p class="muted small">Своих серверов пока нет. Нажмите «+ Добавить», чтобы отслеживать свой сервер.</p>
    {:else}
      <div class="mine-list">
        {#each mineSorted as server (server.id)}
          <div class="mine-row">
            <span
              class="dot"
              class:on={mineStatus[server.id] === true}
              class:off={mineStatus[server.id] === false}
              title={mineStatus[server.id] === true ? 'Работает' : mineStatus[server.id] === false ? 'Не отвечает' : 'Статус неизвестен'}
            ></span>
            <div class="mine-meta">
              <strong>{server.name}</strong>
              <div class="mine-line">
                <code class="addr">{server.address}</code>
                <button class="ghost mini copy" title="Скопировать адрес" on:click={() => copyAddr(server.address)}>
                  {copiedAddr === server.address ? 'Скопировано' : 'Копировать'}
                </button>
              </div>
              <span class="srv-status" class:up={mineStatus[server.id] === true} class:down={mineStatus[server.id] === false}>
                {mineStatus[server.id] === true ? '● работает' : mineStatus[server.id] === false ? '● не отвечает' : '… проверка'}
                {#if checkedLabel(server.id)}<span class="mine-checked">· {checkedLabel(server.id)}</span>{/if}
              </span>
            </div>
            <button class="ghost danger" title="Удалить" on:click={() => deleteMine(server.id)}>✕</button>
          </div>
        {/each}
      </div>
    {/if}
  </section>

  <div class="offers-cols">
    <section class="panel">
      <div class="svc-mod-head">
        <h3>Входящие адреса</h3>
        {#if $online.authed}
          <button class="ghost" on:click={() => requestOffers()}>Обновить</button>
        {/if}
      </div>

      {#if !$online.authed}
        <p class="muted small">Адреса приходят от друзей. Войдите в онлайн, чтобы получать их.</p>
      {:else if offers.length === 0}
        <div class="off-empty">
          <p>Адресов пока нет</p>
          <span class="muted small">
            Попросите друга прислать адрес сервера — он появится здесь и добавится в «Мои серверы»
            одним нажатием.
          </span>
        </div>
      {:else}
        {#each offers as offer (offer.id)}
          <div class="offer-row">
            <div class="offer-main">
              <div class="offer-title">
                <strong>{offer.name}</strong>
                {#if offer.game}<span class="badge">{offer.game}</span>{/if}
              </div>
              <code class="addr">{offer.address}</code>
              {#if offer.note}<span class="note">{offer.note}</span>{/if}
              <span class="muted small">от {offer.from} · {when(offer.ts)}</span>
            </div>
            <div class="offer-actions">
              <button class="primary" disabled={addingOffer === offer.id} on:click={() => addToMine(offer)}>
                {addingOffer === offer.id ? 'Добавляю…' : 'Добавить'}
              </button>
              <button class="ghost icon" title="Удалить" on:click={() => dismissOffer(offer.id)}>✕</button>
            </div>
          </div>

        {/each}
      {/if}
    </section>

    <aside class="panel">
      <h3>Прислать адрес другу</h3>
      {#if !$online.authed}
        <p class="muted small">Нужно войти в онлайн и добавить друга.</p>
      {:else if friends.length === 0}
        <p class="muted small">Сначала добавьте друга в разделе «Классика и сети».</p>
      {:else}
        <div class="field">
          <label for="of-to">Кому</label>
          <select id="of-to" bind:value={offerTo}>
            {#each friends as friend}
              <option value={friend.name}>{friend.name}{friend.online ? ' — в сети' : ''}</option>
            {/each}
          </select>
        </div>
        <div class="field">
          <label for="of-name">Название</label>
          <input id="of-name" bind:value={offerName} placeholder="Сервер друга" maxlength="60" />
        </div>
        <div class="field">
          <label for="of-addr">Адрес</label>
          <input id="of-addr" bind:value={offerAddress} placeholder="1.2.3.4:27015" spellcheck="false" />
        </div>
        <div class="field">
          <label for="of-game">Игра</label>
          <input id="of-game" bind:value={offerGame} placeholder="Counter-Strike 1.6" maxlength="40" />
        </div>
        <div class="field">
          <label for="of-note">Заметка</label>
          <input id="of-note" bind:value={offerNote} placeholder="Например: вечером там народ" maxlength="120" />
        </div>
        <button class="primary" on:click={submitOffer}>Отправить</button>
      {/if}
    </aside>
  </div>

  <div class="game-chips">
    <button type="button" class="game-chip" class:active={gameFilter === 'all'} on:click={() => (gameFilter = 'all')}>
      <Icon name="gamepad" size={14} />
      Все игры
      <span class="chip-count">{gameCounts.all ?? 0}</span>
    </button>
    {#if offlineCount > 0}
      <button
        type="button"
        class="game-chip offline-chip"
        class:active={gameFilter === 'offline'}
        title="Серверы, которые не ответили на проверку"
        on:click={() => (gameFilter = 'offline')}
      >
        Не отвечают
        <span class="chip-count">{offlineCount}</span>
      </button>
    {/if}
    {#if otherCount > 0}
      <button
        type="button"
        class="game-chip"
        class:active={gameFilter === 'other'}
        title="Серверы игр вне списка категорий"
        on:click={() => (gameFilter = 'other')}
      >
        Прочее
        <span class="chip-count">{otherCount}</span>
      </button>
    {/if}
    {#each GAME_FILTERS as filter (filter.id)}
      <button
        type="button"
        class="game-chip"
        class:active={gameFilter === filter.id}
        class:zero={(gameCounts[filter.id] ?? 0) === 0}
        on:click={() => (gameFilter = filter.id)}
      >{filter.label}<span class="chip-count">{gameCounts[filter.id] ?? 0}</span></button>
    {/each}
  </div>

  <p class="chips-note">
            В списке все серверы: доступные поднимаются наверх, неотвечающие помечены и остаются в каталоге.
  </p>

  <div class="svc-cols">

    <section class="svc-list">
      {#if $online.pinnedServers.length > 0}
        <div class="pinned-block">
          <div class="pinned-head">
            <span class="pin-badge">Закреплено</span>
            <span class="pinned-head-note">платное размещение — на рейтинг не влияет</span>
            <span class="pinned-count">{$online.pinnedServers.length}</span>
          </div>
          {#each $online.pinnedServers as srv, i (srv.id)}
            <div
              class="pinned-card"
              class:hero={!!srv.banner}
              class:st-blur={srv.bannerStyle === 'blur'}
              class:st-full={srv.bannerStyle === 'full'}
            >
              {#if srv.banner && imageFor(bannerUrl(srv))}
                <span
                  class="pinned-bg"
                  style:background-image={`url(${imageFor(bannerUrl(srv))})`}
                  aria-hidden="true"
                ></span>
              {/if}
              <div class="pinned-body">
                <span class="pinned-place" class:r1={i === 0} class:r2={i === 1} class:r3={i === 2} class:r4={i > 2}>
                  <em><Icon name="crown" size={13} /></em>
                  <b>#{i + 1}</b>
                </span>
                {#if imageFor(iconUrl(srv))}
                  <span class="pinned-avatar img" class:live={srv.online}>
                    <img src={imageFor(iconUrl(srv))} alt="" loading="lazy" />
                  </span>
                {:else}
                  <span class="pinned-avatar" class:live={srv.online}>
                    <Icon name={/cs/i.test(srv.game) ? 'rocket' : 'server'} size={17} />
                  </span>
                {/if}
                <div class="pinned-id">
                  <strong class="pinned-name" title={stripText(srv.name)}>{stripText(srv.name)}</strong>
                  <span class="pinned-line">
                    {#if srv.game}<span class="badge">{srv.game}</span>{/if}
                    <span class="srv-status" class:on={srv.online}>
                      <span class="mini-dot" class:online={srv.online} class:off={srv.online === false && srv.checkedAt > 0}></span>
                      {#if srv.online}
                        <strong>{srv.players}</strong>/{srv.maxPlayers || '—'} игроков
                      {:else}
                        {srv.checkedAt ? 'не отвечает' : 'нет данных'}
                      {/if}
                    </span>
                    <button class="srv-addr" title="Скопировать адрес" on:click={() => copyServerAddr(srv.address)}>
                      {copiedSrv === srv.address ? 'скопировано' : srv.address}
                    </button>
                    {#if srv.online && looksLikeMap(srv.map)}<span class="meta-item" title="Карта">{stripText(srv.map)}</span>{/if}
                    {#if srv.online && looksLikeVersion(srv.version)}<span class="meta-item" title="Версия">{stripText(srv.version)}</span>{/if}
                  </span>
                </div>
                <span class="pinned-votes" title="Голосов за 2 года"><span class="vote-icon">▲</span>{srv.votes}</span>
                <button class="play-btn pinned-play" on:click={() => launch(srv)} title="Подключиться к серверу">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.4v13.2L18.6 12z" /></svg>
                  Играть
                </button>
              </div>
              {#if srv.promoUntil > 0}
                <span class="promo-term pinned-term">Оплачено до {promoDate(srv.promoUntil)} · осталось {promoDays(srv.promoUntil)}</span>
              {/if}
            </div>
          {/each}
        </div>
      {/if}

      {#if $online.hiddenMine.length > 0}
        <div class="hidden-block">
          <span class="muted small">Скрыты из каталога — сервер не отвечает</span>
          {#each $online.hiddenMine as srv (srv.id)}
            <div class="hidden-row">
              <span>{srv.name}</span>
              <button class="ghost mini" on:click={() => recheckServer(srv.id)}>Проверить снова</button>
            </div>
          {/each}
        </div>
      {/if}

      <div class="srv-toolbar">
        <div class="srv-searchrow">
          <input class="srv-search" bind:value={pubQuery} placeholder="Поиск по названию, игре или адресу…" spellcheck="false" />
          <button class="ghost" type="button" on:click={applySearch}>Найти</button>
        </div>
        <span class="srv-count muted small">Серверов: {filteredPublic.length}</span>
      </div>

      <div class="sort-chips">
        <button type="button" class:active={sortBy === 'top'} on:click={() => (sortBy = 'top')}>Топ по голосам</button>
        <button type="button" class:active={sortBy === 'week'} on:click={() => (sortBy = 'week')}>За неделю</button>
        <button type="button" class:active={sortBy === 'month'} on:click={() => (sortBy = 'month')}>За месяц</button>
        <button type="button" class:active={sortBy === 'online'} on:click={() => (sortBy = 'online')}>По онлайну</button>
        <button type="button" class:active={sortBy === 'new'} on:click={() => (sortBy = 'new')}>Новые</button>
        <button type="button" class:active={sortBy === 'name'} on:click={() => (sortBy = 'name')}>По названию</button>
      </div>

      {#if filteredPublic.length === 0}
        <div class="empty">
          <p>{pubQuery.trim() ? 'Ничего не найдено' : 'Пока нет одобренных серверов'}</p>
          <span class="muted small">{pubQuery.trim() ? 'Попробуйте другой запрос.' : 'Первым делом добавьте свой сервер справа — он появится здесь после одобрения.'}</span>
        </div>
      {:else}
        {#each filteredPublic as srv, i (srv.id)}
          <div
            class="srv-card"
            class:top={srv.place === 1}
            class:promo-large={srv.promoSize === 'large'}
            style:border-color={srv.highlight || ''}
          >
            {#if srv.banner && imageFor(bannerUrl(srv))}
              <img
                class="srv-banner"
                src={imageFor(bannerUrl(srv))}
                alt=""
                loading="lazy"
                style:aspect-ratio={ratioOf(srv.bannerSize)}
              />
            {/if}

            <span
              class="srv-place"
              class:p1={srv.place === 1}
              class:p2={srv.place === 2}
              class:p3={srv.place === 3}
              class:p4={srv.place === 4}
            >
              <em><Icon name="crown" size={13} /></em>
              <b>#{srv.place}</b>
            </span>

            {#if imageFor(iconUrl(srv))}
              <span class="srv-avatar img" class:live={srv.online}>
                <img src={imageFor(iconUrl(srv))} alt="" loading="lazy" />
              </span>
            {:else}
              <span class="srv-avatar" class:live={srv.online}>
                <Icon name={/cs/i.test(srv.game) ? 'rocket' : 'server'} size={18} />
              </span>
            {/if}

            <div class="srv-body">
              <div class="srv-title">
                <button class="srv-open" on:click={() => (openServer = srv)} title={stripText(srv.name)}>
                  <strong>{stripText(srv.name)}</strong>
                </button>
                {#if srv.badge}<span class="promo-badge">{srv.badge}</span>{/if}
                {#if /cs/i.test(srv.game)}<span class="badge small-badge">CS 1.6</span>{:else if srv.game}<span class="badge neutral small-badge">{srv.game}</span>{/if}
              </div>
              <div class="srv-meta">
                <span class="srv-status" class:on={srv.online}>
                  <span class="mini-dot" class:online={srv.online} class:off={srv.online === false && srv.checkedAt > 0}></span>
                  {#if srv.online}
                    <strong>{srv.players}</strong>/{srv.maxPlayers || '—'}
                  {:else}
                    {srv.checkedAt ? 'не отвечает' : 'нет данных'}
                  {/if}
                </span>
                {#if srv.online}
                  <span class="load-track" title="заполнено {loadPct(srv.players, srv.maxPlayers)}%">
                    <i style:width={`${loadPct(srv.players, srv.maxPlayers)}%`} class:high={loadPct(srv.players, srv.maxPlayers) >= 80}></i>
                  </span>
                  {#if looksLikeMap(srv.map)}<span class="meta-item" title="Карта">{stripText(srv.map)}</span>{/if}
                  {#if looksLikeVersion(srv.version)}<span class="meta-item" title="Версия">{stripText(srv.version)}</span>{/if}
                  {#if srv.ping}<span class="meta-item">{srv.ping} мс</span>{/if}
                {/if}
                <button class="srv-addr" title="Скопировать адрес" on:click={() => copyServerAddr(srv.address)}>
                  {copiedSrv === srv.address ? 'скопировано' : srv.address}
                </button>
                {#if srv.promoUntil > 0}
                  <span class="promo-term">Продвижение до {promoDate(srv.promoUntil)} · осталось {promoDays(srv.promoUntil)}</span>
                {/if}
              </div>
            </div>

            <div class="srv-actions">
              <button
                class="vote"
                class:voted={srv.voted}
                disabled={!srv.canVote}
                title={!srv.canVote
                  ? `Следующий голос через ${Math.max(1, Math.ceil(srv.voteWait / 3600))} ч`
                  : $online.authed
                    ? 'Голосовать (раз в сутки)'
                    : 'Войдите, чтобы голосовать'}
                on:click={() => openVote(srv)}
              >
                <span class="vote-icon">▲</span>
                <span class="vote-count">{srv.votes}</span>
              </button>
              {#if $online.authed && (srv.by === $online.user || $online.isAdmin)}
                <button class="ghost mini icon-only" title="Продвижение" on:click={() => { promoStart = ''; promoServer = srv; }}>
                  <Icon name="rocket" size={14} />
                </button>
                <button
                  class="ghost mini icon-only"
                  class:on={srv.pinned}
                  title={srv.pinned ? 'Место в блоке закреплённых занято — продлить или сменить' : 'Закрепить вверху: 5 мест, первое дороже'}
                  on:click={() => { promoStart = 'pinned'; promoServer = srv; }}
                >
                  <Icon name="pin" size={14} />
                </button>
              {/if}
              {#if $online.isAdmin}
                <button
                  class="ghost mini icon-only"
                  class:on={srv.pinned}
                  title={srv.pinned ? 'Открепить от блока закреплённых' : 'Закрепить вверху'}
                  on:click={() => setServerPromo(srv.id, { pinned: !srv.pinned, badge: srv.pinned ? '' : 'закреплено' })}
                >
                  <Icon name="star" size={14} />
                </button>
              {/if}
              <button class="play-btn" on:click={() => launch(srv)} title="Подключиться к серверу">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.4v13.2L18.6 12z" /></svg>
                Играть
              </button>
            </div>
          </div>
          {#each adBlocks.filter((item) => item.at === i + 1) as block (block.id)}
            <AdBlock {block} servers={$online.publicServers ?? []} onOpen={(server) => (openServer = server)} />
          {/each}
        {/each}

      {#each adBlocks.filter((item) => item.at === 0) as block (block.id)}
        <AdBlock {block} servers={$online.publicServers ?? []} onOpen={(server) => (openServer = server)} />
      {/each}
      {/if}
    </section>

  {#if $online.pendingMine.length > 0 || $online.isAdmin}
    <aside class="svc-side">

      {#if $online.pendingMine.length > 0}
        <div class="panel">
          <div class="svc-mod-head">
            <h3>Мои заявки</h3>
            <span class="muted small">{$online.pendingMine.length}</span>
          </div>
          {#each $online.pendingMine as p (p.id)}
            <div class="pending-row">
              <div class="pending-meta">
                <strong>{p.name}</strong>
                <code class="addr">{p.address}</code>
                <span class="muted small">на модерации{p.game ? ' · ' + p.game : ''}</span>
              </div>
            </div>
          {/each}
        </div>
      {/if}



      {#if $online.isAdmin}
        <div class="panel">
          <div class="svc-mod-head">
            <h3>Модерация</h3>
            <button class="ghost" on:click={loadServers}>Обновить</button>
          </div>
          {#if $online.pendingServers.length === 0}
            <p class="muted small">Очередь пуста.</p>
          {:else}
            {#each $online.pendingServers as p (p.id)}
              <div class="pending-row">
                <div class="pending-meta">
                  <strong>{p.name}</strong>
                  <code class="addr">{p.address}</code>
                  <span class="muted small">от {p.by}{p.game ? ' · ' + p.game : ''}</span>
                </div>
                <div class="svc-btns">
                  <button class="ghost" title="Одобрить" on:click={() => moderate(p.id, 'approve')}>✓</button>
                  <button class="ghost danger" title="Отклонить" on:click={() => moderate(p.id, 'reject')}>✕</button>
                </div>
              </div>
            {/each}
          {/if}
        </div>
      {/if}
    </aside>
  {/if}
  </div>
  {/if}

  {#if myModalOpen}
    <div class="add-backdrop" on:click={() => (myModalOpen = false)} on:keydown={() => {}} role="presentation"></div>
    <div class="add-modal" role="dialog" aria-modal="true" aria-label="Добавить мой сервер">
      <h3>Добавить мой сервер</h3>
      <p class="muted">Личный сервер для отслеживания статуса (точка в списке).</p>
      <div class="field">
        <label for="my-name">Название</label>
        <input id="my-name" bind:value={myName} placeholder="Например: Мой CS" maxlength="60" />
      </div>
      <div class="field">
        <label for="my-address">Адрес</label>
        <input id="my-address" bind:value={myAddress} placeholder="1.2.3.4:27015" spellcheck="false" />
      </div>
      <div class="svc-btns">
        <button class="ghost" on:click={() => (myModalOpen = false)}>Отмена</button>
        <button class="primary" on:click={addMine} disabled={!myName.trim() || !myAddress.trim()}>Добавить</button>
      </div>
    </div>
  {/if}

  {#if submitOpen}
    <div class="add-backdrop" on:click={() => (submitOpen = false)} on:keydown={() => {}} role="presentation"></div>
    <div class="add-modal" role="dialog" aria-modal="true" aria-label="Добавить сервер">
      <h3>Добавить сервер</h3>
      <p class="muted">Заявка уйдёт на модерацию.</p>
      <div class="field">
        <label for="svm-name">Название</label>
        <input id="svm-name" bind:value={pubName} placeholder="Мой CS 1.6" maxlength="60" />
      </div>
      <div class="field">
        <label for="svm-addr">Адрес</label>
        <input id="svm-addr" bind:value={pubAddress} placeholder="1.2.3.4:27015" spellcheck="false" />
      </div>
      <div class="field">
        <label for="svm-game">Игра (категория)</label>
        <select id="svm-game" bind:value={pubGame}>
          {#each GAME_OPTIONS as option (option)}
            <option value={option}>{option}</option>
          {/each}
        </select>
        <span class="field-hint">Категория уточнится автоматически по ответу сервера.</span>
      </div>
      <div class="field">
        <label for="svm-desc">Описание</label>
        <input id="svm-desc" bind:value={pubDesc} placeholder="Коротко о сервере" maxlength="200" />
      </div>
      <div class="svc-btns">
        <button class="ghost" on:click={() => (submitOpen = false)}>Отмена</button>
        <button class="primary" on:click={submit}>Отправить</button>
      </div>
    </div>
  {/if}

  {#if voteTarget}
    <div class="add-backdrop" on:click={() => (voteTarget = null)} on:keydown={() => {}} role="presentation"></div>
    <div class="add-modal" role="dialog" aria-modal="true" aria-label="Голос за сервер">      <h3>Голос за сервер</h3>
      <p class="muted">{voteTarget.name} · один голос в сутки</p>
      <div class="field">
        <label for="vote-nick">Игровой ник</label>
        <input id="vote-nick" bind:value={voteNick} placeholder="для награды в игре" maxlength="32" />
      </div>
      <p class="muted small">Голос нельзя отменить. Накрутка не учитывается: сервер снимают с публикации.</p>
      <div class="svc-btns">
        <button class="ghost" on:click={() => (voteTarget = null)}>Отмена</button>
        <button class="primary" on:click={submitVote}>Голосовать</button>
      </div>
    </div>
  {/if}

  {#if promoServer}
    <Promotion server={promoServer} startOption={promoStart} onClose={() => { promoServer = null; promoStart = ''; }} />
  {/if}
</div>


<style>
  .muted { color: var(--muted); }
  .muted.small { font-size: 12px; }

  /* ---------- Кнопки ---------- */
  .primary,
  .ghost {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    height: 34px;
    padding: 0 14px;
    border-radius: var(--radius-sm);
    font: inherit;
    font-size: 12.5px;
    font-weight: 600;
    white-space: nowrap;
    cursor: pointer;
    transition: background 0.14s ease, border-color 0.14s ease, filter 0.14s ease, transform 0.14s ease;
  }
  .primary {
    border: 1px solid transparent;
    background: var(--btn-bg);
    color: var(--btn-ink);
    font-weight: 680;
    letter-spacing: 0.1px;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.3), var(--btn-glow);
  }
  .primary:hover:not(:disabled) {
    background: var(--btn-bg-hover);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.38), 0 4px 14px rgba(90, 139, 255, 0.3);
  }
  .primary:active:not(:disabled) { transform: translateY(1px); box-shadow: inset 0 1px 3px rgba(5, 10, 20, 0.35); }
  .primary:disabled { opacity: 0.5; cursor: not-allowed; }
  .ghost {
    border: 1px solid var(--line);
    background: var(--panel-2);
    color: var(--text);
  }
  .ghost:hover:not(:disabled) { background: var(--panel-3); border-color: var(--muted-2); }
  .ghost:disabled { opacity: 0.5; cursor: not-allowed; }
  .ghost.danger { color: var(--danger); }
  .ghost.danger:hover:not(:disabled) { border-color: var(--danger); background: rgba(239, 91, 91, 0.12); }
  .primary:focus-visible,
  .ghost:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  /* ---------- Поля ввода ---------- */
  .field { display: flex; flex-direction: column; gap: 5px; }
  .field label { font-size: 11.5px; font-weight: 600; color: var(--muted); }
  .field input,
  .field select {
    height: 34px;
    padding: 0 11px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--bg-soft);
    color: var(--text);
    font: inherit;
    font-size: 12.5px;
  }
  .field select { cursor: pointer; }
  .field input::placeholder { color: var(--muted-2); }
  .field input:focus,
  .field select:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 0 2px var(--accent-soft);
  }
  .field-hint {
    font-size: 11px;
    line-height: 1.35;
    color: var(--muted-2);
  }
  .addr { font-family: var(--mono, monospace); font-size: 11px; color: var(--accent); }

  .svc { display: flex; flex-direction: column; gap: 14px; padding: 20px 24px; width: 100%; max-width: none; box-sizing: border-box; }
  .svc-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
  .svc-head h2 { margin: 0; font-size: 20px; }
  .svc-head .muted { margin: 4px 0 0; font-size: 12.5px; color: var(--muted); }
  .status { margin: 0; padding: 8px 12px; border-radius: 8px; background: var(--hover-2); font-size: 12.5px; }
  .status.err { color: var(--danger); background: rgba(255, 92, 92, 0.1); border: 1px solid rgba(255, 92, 92, 0.28); }
  .svc-cols { display: grid; grid-template-columns: 1fr 300px; gap: 14px; align-items: start; order: 1; }
  .svc-list { display: flex; flex-direction: column; gap: 10px; }
  .srv-search {
    height: 36px;
    padding: 0 12px;
    border: 1px solid var(--line);
    border-radius: 9px;
    background: var(--bg-soft);
    color: var(--text);
    font: inherit;
    font-size: 12.5px;
  }
  .srv-search:focus { outline: none; border-color: var(--accent); }

  .hero {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 24px;
    flex-wrap: wrap;
    padding: 22px 24px;
    border: 1px solid var(--line);
    border-radius: 14px;
    background:
      radial-gradient(700px 240px at 85% -20%, rgba(138, 180, 255, 0.16), transparent 65%),
      linear-gradient(180deg, #0e1428, #0b1026);
  }
  .hero-text h1 { margin: 0 0 8px; font-size: 22px; letter-spacing: -0.02em; }
  .hero-text h1 span { color: var(--accent-2); }
  .hero-text p { margin: 0 0 14px; color: var(--muted); font-size: 12.5px; max-width: 520px; }
  .hero-actions { display: flex; gap: 8px; flex-wrap: wrap; }
  .hero-cta { height: 38px; padding: 0 16px; font-size: 13px; }
  .hero-cta .free {
    padding: 2px 7px;
    border-radius: 6px;
    background: rgba(7, 14, 30, 0.14);
    font-size: 11px;
    font-weight: 720;
    letter-spacing: 0.2px;
  }
  .hero-stats { display: flex; gap: 26px; flex-wrap: wrap; }
  .hero-stats div { display: flex; flex-direction: column; gap: 2px; }
  .hero-stats strong { font-size: 20px; letter-spacing: -0.02em; }
  .hero-stats span { font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted-2); }

  .pinned-block {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 12px;
    border: 1px solid var(--line-soft);
    border-radius: 14px;
    background: var(--panel);
  }
  .pinned-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .pinned-head-note { font-size: 11.5px; color: var(--muted-2); }
  .pinned-count {
    margin-left: auto;
    min-width: 20px;
    height: 20px;
    padding: 0 6px;
    display: grid;
    place-items: center;
    border-radius: 999px;
    background: var(--hover-2);
    color: var(--muted);
    font-size: 11px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .pin-badge {
    padding: 2px 9px;
    border-radius: 999px;
    background: var(--hover-2);
    border: 1px solid var(--line);
    color: var(--muted);
    font-size: 10.5px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .pinned-card {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 0;
    padding: 10px 12px 9px;
    border: 1px solid var(--line-soft);
    border-radius: 12px;
    overflow: hidden;
    background: var(--panel);
    transition: border-color 0.16s ease, box-shadow 0.16s ease, transform 0.16s ease;
  }
  .pinned-card:hover {
    border-color: rgba(138, 180, 255, 0.34);
    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.22);
    transform: translateY(-1px);
  }
  .pinned-card.hero { padding-top: 0; }
  .pinned-card:not(.hero) {
    background: var(--panel);
    min-height: 92px;
    justify-content: center;
  }
  .pinned-bg {
    position: absolute;
    inset: 0;
    z-index: 0;
    background-size: cover;
    background-position: center;
    filter: blur(7px) saturate(1.2) brightness(0.95);
    transform: scale(1.12);
    pointer-events: none;
  }
  .pinned-card.hero::before {
    content: '';
    position: absolute;
    inset: 0;
    z-index: 1;
    pointer-events: none;
    background: linear-gradient(180deg, rgba(9, 12, 18, 0.28), rgba(9, 12, 18, 0.78));
  }
  .pinned-card.hero { padding: 16px 12px 0; }
  .pinned-card.st-blur .pinned-bg {
    filter: blur(16px) saturate(1.25) brightness(0.85);
    transform: scale(1.15);
  }
  .pinned-card.st-blur::before {
    background: rgba(9, 12, 18, 0.52);
  }
  .pinned-card.st-full .pinned-bg {
    filter: none;
    transform: none;
  }
  .pinned-card.st-full::before {
    background: linear-gradient(90deg, rgba(9, 12, 18, 0.9) 0%, rgba(9, 12, 18, 0.72) 45%, rgba(9, 12, 18, 0.5) 100%);
  }
  .pinned-card.hero .pinned-body { position: relative; z-index: 2; padding-bottom: 12px; min-height: 62px; }
  .pinned-card.hero .pinned-term { position: relative; z-index: 2; margin-top: 0; }
  .pinned-card.hero .badge { background: rgba(138, 180, 255, 0.28); color: #dbe6ff; }
  .pinned-card.hero .srv-status { background: rgba(138, 180, 255, 0.22); color: #dbe6ff; }
  .pinned-card.hero .srv-addr { background: rgba(0, 0, 0, 0.4); }
  .pinned-card.hero .pinned-votes { background: rgba(0, 0, 0, 0.42); border-color: rgba(255, 255, 255, 0.16); }
  .pinned-card.hero .pinned-name { text-shadow: 0 1px 10px rgba(0, 0, 0, 0.75); }
  .pinned-place {
    flex: none;
    width: 30px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    color: var(--muted);
  }
  .pinned-place em {
    width: 22px;
    height: 22px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.06);
    color: inherit;
    font-style: normal;
  }
  .pinned-place b {
    font-size: 12px;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    color: inherit;
  }
  .pinned-place.r1 { color: #63c8ff; }
  .pinned-place.r1 em {
    background: radial-gradient(circle at 50% 45%, rgba(99, 200, 255, 0.32), rgba(99, 200, 255, 0.12));
    box-shadow: 0 0 16px rgba(99, 200, 255, 0.42), 0 0 34px rgba(99, 200, 255, 0.16);
  }
  .pinned-place.r1 b { text-shadow: 0 0 10px rgba(99, 200, 255, 0.5); }
  .pinned-place.r2 { color: #f2c14e; }
  .pinned-place.r2 em { background: rgba(242, 193, 78, 0.16); box-shadow: 0 0 12px rgba(242, 193, 78, 0.28); }
  .pinned-place.r2 b { text-shadow: 0 0 10px rgba(242, 193, 78, 0.4); }
  .pinned-place.r3 { color: #c6cede; }
  .pinned-place.r3 em { background: rgba(198, 206, 222, 0.14); }
  .pinned-place.r4 { color: #d08b4c; }
  .pinned-place.r4 em { background: rgba(208, 139, 76, 0.16); }

  .pinned-body { display: flex; align-items: center; gap: 10px; min-width: 0; }
  .pinned-avatar {
    width: 34px;
    height: 34px;
    flex: none;
    display: grid;
    place-items: center;
    border-radius: 10px;
    border: 1px solid var(--line-soft);
    background: var(--panel-2);
    color: var(--muted);
  }
  .pinned-avatar.live { color: var(--accent-2); border-color: rgba(138, 180, 255, 0.35); background: rgba(138, 180, 255, 0.12); }
  .pinned-avatar.img { padding: 2px; border-color: var(--line); background: var(--panel-2); }
  .pinned-avatar.img img { width: 100%; height: 100%; object-fit: cover; border-radius: 8px; display: block; }
  .pinned-id { display: flex; flex-direction: column; gap: 4px; min-width: 0; flex: 1; }
  .pinned-name {
    font-size: 13.5px;
    font-weight: 700;
    color: var(--text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .pinned-line { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; min-width: 0; font-size: 11.5px; }
  .pinned-line .srv-addr { max-width: 190px; font-size: 11.5px; }
  .pinned-card .pinned-votes {
    flex: none;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 8px;
    border-radius: 999px;
    background: var(--hover-2);
    border: 1px solid var(--line-soft);
    font-size: 11.5px;
    color: var(--muted);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .play-btn.pinned-play { height: 30px; padding: 0 13px; font-size: 12px; flex: none; }
  .hidden-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; font-size: 12.5px; }

  .vote:disabled { opacity: 0.55; cursor: not-allowed; }

  .wallet-bal { display: inline-flex; align-items: baseline; gap: 5px; font-size: 14px; font-weight: 700; color: var(--text); font-variant-numeric: tabular-nums; }
  .wallet-bal span { font-size: 10.5px; font-weight: 600; color: var(--muted-2); text-transform: uppercase; letter-spacing: 0.04em; }
  .wallet .muted { margin: 2px 0 8px; line-height: 1.45; }
  .wallet-packs { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
  .pack {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 6px;
    padding: 7px 10px;
    border: 1px solid var(--line);
    border-radius: 9px;
    background: var(--panel-2);
    color: var(--text);
    font: inherit;
    cursor: pointer;
    transition: border-color 0.15s ease, background 0.15s ease;
  }
  .pack strong { font-size: 12.5px; font-variant-numeric: tabular-nums; }
  .pack span { font-size: 11px; color: var(--muted); }
  .pack:hover:not(:disabled) { border-color: rgba(138, 180, 255, 0.35); background: rgba(138, 180, 255, 0.08); }
  .pack:disabled { opacity: 0.5; cursor: not-allowed; }
  .mini { height: 26px; padding: 0 9px; font-size: 11px; }
  .game-chips { display: flex; gap: 6px; flex-wrap: wrap; }
  .chips-note { margin: 4px 0 0; font-size: 11.5px; color: var(--muted-2); }
  .game-chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 31px;
    padding: 0 9px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--panel);
    color: var(--text);
    font: inherit;
    font-size: 11.5px;
    font-weight: 600;
    cursor: pointer;
    transition: border-color 0.14s ease, background 0.14s ease;
  }
  .game-chip:hover { border-color: var(--muted-2); }
  .game-chip.active {
    background: #101733;
    border-color: #33406f;
    color: #fff;
    box-shadow: inset 0 0 0 1px rgba(63, 108, 240, 0.25);
  }
  .chip-count {
    min-width: 18px;
    margin-left: 5px;
    padding: 0 5px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.08);
    color: var(--muted);
    font-size: 10.5px;
    font-variant-numeric: tabular-nums;
    line-height: 16px;
    text-align: center;
  }
  .game-chip.active .chip-count {
    background: rgba(138, 180, 255, 0.2);
    color: var(--accent-2);
  }
  .offline-chip { color: var(--muted); }
  .offline-chip.active { color: var(--text); }
  .game-chip.zero { opacity: 0.5; }
  .game-chip.zero.active { opacity: 1; }

  .srv-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    flex-wrap: wrap;
  }
  .srv-searchrow { display: flex; gap: 8px; }
  .srv-searchrow .srv-search { flex: 1; min-width: 0; }
  .srv-toolbar .srv-searchrow { flex: 1 1 340px; }

  .sort-chips { display: flex; gap: 6px; flex-wrap: wrap; }
  .sort-chips button {
    height: 28px;
    padding: 0 11px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--panel-2);
    color: var(--muted);
    font: inherit;
    font-size: 11.5px;
    font-weight: 600;
    cursor: pointer;
  }
  .sort-chips button:hover { color: var(--text); border-color: var(--muted-2); }
  .sort-chips button.active { border-color: var(--accent); background: var(--accent-soft); color: var(--accent); }
  .empty {
    padding: 26px 18px;
    border: 1px dashed var(--line);
    border-radius: 12px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .empty p { margin: 0; font-size: 14px; font-weight: 600; }
  .srv-card {
    display: grid;
    grid-template-columns: auto auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 12px 14px;
    padding: 12px 14px;
    border: 1px solid var(--line-soft);
    border-radius: var(--radius);
    background: var(--panel);
    transition: border-color 0.16s ease, background 0.16s ease, transform 0.16s ease, box-shadow 0.16s ease;
  }
  .srv-card:hover {
    border-color: rgba(138, 180, 255, 0.34);
    background: linear-gradient(180deg, rgba(138, 180, 255, 0.045), transparent 62%), var(--panel);
    transform: translateY(-1px);
    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.22);
  }
  .srv-banner {
    grid-column: 1 / -1;
    width: 100%;
    max-height: 140px;
    object-fit: cover;
    display: block;
    border-radius: 10px;
    border: 1px solid var(--line-soft);
    background: var(--panel-2);
  }
  .srv-place {
    width: 30px;
    flex: none;
    align-self: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    color: var(--muted);
  }
  .srv-place em {
    width: 22px;
    height: 22px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.06);
    color: inherit;
    font-style: normal;
  }
  .srv-place b { font-size: 12px; font-weight: 800; font-variant-numeric: tabular-nums; color: inherit; }
  .srv-place.p1 { color: #63c8ff; }
  .srv-place.p1 em { background: rgba(99, 200, 255, 0.16); box-shadow: 0 0 12px rgba(99, 200, 255, 0.32); }
  .srv-place.p1 b { text-shadow: 0 0 10px rgba(99, 200, 255, 0.5); }
  .srv-place.p2 { color: #f2c14e; }
  .srv-place.p2 em { background: rgba(242, 193, 78, 0.16); box-shadow: 0 0 12px rgba(242, 193, 78, 0.26); }
  .srv-place.p2 b { text-shadow: 0 0 10px rgba(242, 193, 78, 0.4); }
  .srv-place.p3 { color: #c6cede; }
  .srv-place.p3 em { background: rgba(198, 206, 222, 0.14); }
  .srv-place.p4 { color: #d08b4c; }
  .srv-place.p4 em { background: rgba(208, 139, 76, 0.16); }
  .srv-avatar {
    width: 38px;
    height: 38px;
    flex: none;
    display: grid;
    place-items: center;
    border-radius: 10px;
    background: var(--panel-2);
    border: 1px solid var(--line-soft);
    color: var(--muted);
  }
  .srv-avatar.live { color: var(--accent-2); border-color: rgba(138, 180, 255, 0.25); }
  .srv-avatar.img { padding: 2px; }
  .srv-avatar.img img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: 7px;
  }
  .srv-actions {
    display: flex;
    align-items: center;
    gap: 6px;
    flex: none;
    justify-content: flex-end;
  }
  .srv-actions .ghost.mini { height: 30px; padding: 0 10px; font-size: 11.5px; }
  .srv-actions .ghost.mini.icon-only { width: 30px; padding: 0; display: grid; place-items: center; color: var(--muted); }
  .srv-actions .ghost.mini.icon-only:hover { color: var(--accent); border-color: rgba(138, 180, 255, 0.4); }
  .srv-actions .ghost.mini.icon-only.on { color: var(--accent-2); border-color: rgba(138, 180, 255, 0.45); background: rgba(138, 180, 255, 0.12); }
  .srv-actions .play-btn { height: 30px; min-width: 96px; justify-content: center; }
  .play-btn {
    height: 34px;
    padding: 0 14px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border: 1px solid rgba(138, 180, 255, 0.35);
    border-radius: var(--radius-sm);
    background: rgba(138, 180, 255, 0.1);
    color: var(--accent-2);
    font-size: 12.5px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.16s ease, border-color 0.16s ease, color 0.16s ease;
  }
  .play-btn svg { width: 11px; height: 11px; fill: currentColor; flex: none; }
  .play-btn:hover {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--ink-on-accent);
  }
  .meta-item {
    flex: none;
    padding: 1px 7px;
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.04);
    font-size: 11.5px;
    color: var(--muted);
    max-width: 220px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .meta-item.muted { color: var(--muted-2); }
  .srv-card.promo-large { padding: 12px 14px; }
  .srv-card.promo-large .srv-title strong { font-size: 16px; }
  .promo-term { flex-basis: 100%; font-size: 11px; color: var(--muted-2); }
  .pinned-term { display: block; margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--line-soft); font-size: 11.5px; color: var(--muted-2); }
  .promo-badge {
    padding: 1px 8px;
    border-radius: 999px;
    background: var(--accent);
    color: var(--ink-on-accent);
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
    .srv-card.top { border-color: rgba(138, 180, 255, 0.4); background: linear-gradient(90deg, rgba(138, 180, 255, 0.07), transparent 55%), var(--panel); }

  .vote {
    display: flex;
    align-items: center;
    gap: 5px;
    height: 32px;
    padding: 0 9px;
    border: 1px solid var(--line);
    border-radius: var(--radius-sm);
    background: var(--panel-2);
    color: var(--muted);
    font: inherit;
    cursor: pointer;
    transition: border-color 0.14s ease, background 0.14s ease, color 0.14s ease;
  }
  .vote:hover { border-color: var(--accent); color: var(--text); }
  .vote.voted { border-color: var(--accent); background: var(--accent-soft); color: var(--accent); }
  .vote-icon { font-size: 12px; line-height: 1; }
  .vote-count { font-size: 12px; font-weight: 700; }

  .srv-body { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
  .srv-title { display: flex; align-items: center; gap: 8px; min-width: 0; flex-wrap: nowrap; }
  .srv-title .badge { flex: none; max-width: 190px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .srv-title strong { font-size: 14px; font-weight: 650; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
  .srv-open { background: none; border: none; padding: 0; color: inherit; font: inherit; cursor: pointer; text-align: left; min-width: 0; display: flex; }
  .srv-open:hover strong { color: var(--accent); }
  .badge {
    padding: 1px 8px;
    border-radius: 999px;
    background: rgba(138, 180, 255, 0.14);
    color: var(--accent-2);
    font-size: 10.5px;
    font-weight: 600;
  }
  .badge.neutral {
    background: var(--hover-2);
    color: var(--muted);
  }
  .srv-meta { display: flex; align-items: center; flex-wrap: wrap; gap: 5px 9px; font-size: 12px; color: var(--muted); min-width: 0; }
  .srv-addr {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 1px 7px;
    border: 1px solid transparent;
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.04);
    font-family: var(--mono, monospace);
    font-size: 11.5px;
    color: var(--accent);
    cursor: pointer;
    white-space: nowrap;
    transition: border-color 0.14s ease, background 0.14s ease;
  }
  .srv-addr:hover { border-color: rgba(138, 180, 255, 0.3); background: rgba(138, 180, 255, 0.08); }
  .mini-dot { width: 7px; height: 7px; border-radius: 50%; background: #8a8f98; }
  .mini-dot.online { background: var(--accent); }
  .mini-dot.off { background: var(--danger); }
  .badge.small-badge { font-size: 10.5px; padding: 1px 7px; }
  .srv-status {
    padding: 1px 8px;
    border-radius: 999px;
    background: var(--hover-2);
    color: var(--muted);
    font-size: 10.5px;
    font-weight: 600;
  }
  .srv-status.on { background: rgba(138, 180, 255, 0.14); color: var(--accent-2); }
  .copy-addr { padding: 0 6px; font-size: 10px; height: 18px; opacity: 0.75; }
  .copy-addr:hover { opacity: 1; }
  .load-track {
    width: 72px;
    height: 5px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.09);
    overflow: hidden;
    display: inline-block;
  }
  .load-track i {
    display: block;
    height: 100%;
    background: linear-gradient(90deg, rgba(138, 180, 255, 0.85), var(--accent));
    border-radius: 999px;
  }
  .load-track i.high { background: var(--accent-2); }
  .srv-players { font-size: 12px; color: var(--text); }
  .srv-players strong { font-weight: 700; }
  .desc { color: var(--muted-2); }
  .svc-side { display: flex; flex-direction: column; gap: 12px; position: sticky; top: 12px; }
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
  .offers-cols { display: grid; grid-template-columns: 1fr 320px; gap: 14px; align-items: start; }
  .off-empty {
    padding: 18px 16px;
    border: 1px dashed var(--line);
    border-radius: 12px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .off-empty p { margin: 0; font-size: 14px; font-weight: 600; }
  .offer-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 11px 12px;
    border: 1px solid var(--line);
    border-radius: 10px;
  }
  .offer-row:hover { border-color: var(--accent); }
  .offer-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
  .offer-title { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .offer-title strong { font-size: 13px; }
  .note { font-size: 12px; color: var(--muted); overflow-wrap: anywhere; }
  .offer-actions { display: flex; gap: 8px; align-items: center; }
  .offer-actions .ghost.icon { width: 30px; height: 30px; padding: 0; font-size: 13px; }
  .svc-mod-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
  .mine-panel { margin-bottom: 4px; order: 2; }
  .offers-cols { order: 3; }
  .mine-list { display: flex; flex-direction: column; gap: 6px; }
  .mine-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 9px 11px;
    border: 1px solid var(--line);
    border-radius: 10px;
  }
  .mine-row:hover { border-color: var(--accent); }
  .dot { width: 10px; height: 10px; flex: none; border-radius: 50%; background: #8a8f98; }
  .dot.on { background: var(--accent); box-shadow: 0 0 0 3px rgba(138, 180, 255, 0.18); }
  .dot.off { background: var(--danger); }
  .mine-summary { margin: 2px 0 10px; font-size: 12px; color: var(--muted); display: flex; gap: 6px; align-items: baseline; }
  .mine-summary strong { color: var(--text, #e8edf7); }
  .mine-summary strong.up { color: var(--accent-2); }
  .mine-summary strong.down { color: var(--danger); }
  .mine-line { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .mine-line .copy { padding: 1px 8px; font-size: 10.5px; }
  .mine-checked { color: var(--muted); margin-left: 6px; }
  .mine-meta { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .mine-meta strong { font-size: 12.5px; font-weight: 600; }
  .mine-meta code { font-size: 11px; color: var(--accent); }
  .srv-status { font-size: 11px; color: var(--muted); }
  .srv-status.up { color: var(--accent-2); }
  .srv-status.down { color: var(--danger); }
  .add-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: 60;
  }
  .add-modal {
    position: fixed;
    left: 50%;
    top: 40%;
    transform: translate(-50%, -50%);
    width: 420px;
    max-width: calc(100vw - 40px);
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 14px;
    padding: 22px;
    box-shadow: 0 18px 50px rgba(0, 0, 0, 0.5);
    z-index: 61;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .add-modal h3 { margin: 0; font-size: 16px; }
  .svc-btns { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .svc-btns { flex: none; }
  .svc-btns button { white-space: nowrap; }
  .svc-btns :global(button) { flex: none; }
  .svc-mod-head .svc-btns :global(button) { height: 32px; padding: 0 12px; white-space: nowrap; min-width: 112px; flex: none; overflow: visible; }
.add-modal > .svc-btns :global(button) { flex: 1 1 0; }
  .pending-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px;
    border: 1px solid var(--line);
    border-radius: 10px;
  }
  .pending-meta { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .pending-meta strong { font-size: 12.5px; }
  .pending-row .svc-btns :global(button) {
    flex: none;
    width: 30px;
    height: 30px;
    padding: 0;
    font-size: 13px;
  }
  .mine-row > .ghost {
    flex: none;
    width: 30px;
    height: 30px;
    padding: 0;
    font-size: 13px;
  }
  @media (max-width: 900px) { .svc-cols { grid-template-columns: 1fr; } .offers-cols { grid-template-columns: 1fr; } }
</style>