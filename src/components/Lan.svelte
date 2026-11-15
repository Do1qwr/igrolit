<script lang="ts">
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';
  import { invoke } from '@tauri-apps/api/tauri';
  import { listen } from '@tauri-apps/api/event';
  import type { UnlistenFn } from '@tauri-apps/api/event';
  import { ask } from '../lib/dialogs';
import ModdingWarning from './ModdingWarning.svelte';
  

  interface Game {
    id: string;
    name: string;
    platform: string;
    launch_cmd: string;
  }

  interface RetroGame {
    id: string;
    name: string;
    description: string;
    category: string;
    installed?: boolean;
  }

  interface Room {
    id: string;
    name: string;
    game_id: string;
    game_name: string;
    host: string;
    port: number;
    slots: number;
    nick: string;
  }

  interface ChatMsg {
    nick: string;
    text: string;
    system?: boolean;
  }

  interface Player {
    nick: string;
    ready: boolean;
    ping: number;
  }

  export let games: Game[] = [];
  export let usage: Record<string, { count: number; last: number }> = {};
  const dispatch = createEventDispatcher<{ launched: null }>();

  let classics: RetroGame[] = [];
  let rooms: Room[] = [];
  let unlisten: UnlistenFn | undefined;

  let nick = '';
  let roomName = '';
  let selectedGame = '';
  let port = 27015;
  let hosting: Room | null = null;
  let status = '';
  let busy = false;

  let manualAddress = '';
  let checking = false;
  let checkResult: 'ok' | 'fail' | '' = '';

  let activeRoom: Room | null = null;
  let messages: ChatMsg[] = [];
  let chatText = '';
  let chatError = '';
  let chatScroller: HTMLDivElement | null = null;

  let players: Player[] = [];
  let isReady = false;
  let startNote = '';
  let slots = 10;
  let roomLocked = false;
  const slotOptions = [2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24, 30];
  let classicsQuery = '';
  let activeCategory = 'all';
  const categoryOrder = ['Стратегии', 'Шутеры', 'Пошаговые', 'RPG', 'Экшн', 'Гонки', 'Симуляторы'];

  $: categoryChips = [
    { key: 'all', label: 'Все', count: classics.length },
    ...categoryOrder
      .map((name) => ({ key: name, label: name, count: classics.filter((g) => g.category === name).length }))
      .filter((c) => c.count > 0),
  ];

  $: filteredClassics = classics.filter((g) => {
    const q = classicsQuery.trim().toLowerCase();
    const byCategory = activeCategory === 'all' || g.category === activeCategory;
    const byText = !q || `${g.name} ${g.description}`.toLowerCase().includes(q);
    return byCategory && byText;
  });

  // Игры, для которых найден exe (installed) — «что у меня есть», тоже по фильтру.
  $: installedClassics = filteredClassics.filter((g) => g.installed);
  // Игры без найденного exe — это каталог «все игры».
  $: catalogClassics = filteredClassics.filter((g) => !g.installed);

  // Сворачиваемые группы по категориям (каталог). Используются при activeCategory === 'all'.
  let openCats: Record<string, boolean> = {};
  $: categoryGroups = categoryOrder
    .map((name) => ({
      key: name,
      label: name,
      games: classics.filter((g) => !g.installed && g.category === name),
    }))
    .filter((g) => g.games.length > 0);

  

  const retroKey = (id: string) => `retro:${id}`;
  const classicCount = (g: RetroGame) => usage[retroKey(g.id)]?.count ?? 0;
  const fmtDate = (ts: number) =>
    ts
      ? new Date(ts * 1000).toLocaleDateString('ru-RU', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        })
      : '';

  $: popularClassics = classics
    .map((game) => ({ game, count: classicCount(game), last: usage[retroKey(game.id)]?.last ?? 0 }))
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count || b.last - a.last)
    .slice(0, 6);

  $: topClassicId = popularClassics[0]?.game.id ?? '';

  $: guests = players.filter((p) => !hosting || p.nick !== hosting.nick);
  $: allReady = guests.length > 0 && guests.every((p) => p.ready);
  $: freeSlots = Math.max(0, (hosting?.slots ?? slots) - players.length);

  $: chatPort = hosting
    ? (hosting.port < 65535 ? hosting.port + 1 : hosting.port - 1)
    : activeRoom
      ? (activeRoom.port < 65535 ? activeRoom.port + 1 : activeRoom.port - 1)
      : 0;
  $: inRoom = !!(hosting || activeRoom);

  $: gameOptions = [
    ...classics.map((g) => ({ value: `retro:${g.id}`, label: g.name, kind: 'retro' as const })),
    ...games.map((g) => ({ value: `lib:${g.id}`, label: `${g.name} · ${g.platform}`, kind: 'lib' as const })),
  ];

  async function startListener() {
    if (nick.trim()) {
      try {
        await invoke('lobby_start', { nick: nick.trim() });
      } catch (e) {
        status = String(e);
      }
    }
  }

  async function saveNick() {
    localStorage.setItem('lobby_nick', nick.trim());
    await startListener();
  }

  async function createRoom() {
    if (busy) return;
    if (!nick.trim()) {
      status = 'Укажите имя игрока — его увидят в комнате';
      return;
    }
    if (!selectedGame) {
      status = 'Выберите игру для комнаты';
      return;
    }

    busy = true;
    status = '';
    try {
      localStorage.setItem('lobby_nick', nick.trim());
      const [kind, id] = selectedGame.split(':');
      const label =
        kind === 'retro'
          ? classics.find((g) => g.id === id)?.name ?? 'Классика'
          : games.find((g) => g.id === id)?.name ?? 'Игра';

      await invoke('lobby_start', { nick: nick.trim() });
      hosting = await invoke<Room>('lobby_create', {
        nick: nick.trim(),
        name: roomName,
        gameId: id,
        gameName: label,
        port: Number(port) || 27015,
        slots: Number(slots) || 10,
      });

      const chatPortValue = hosting.port < 65535 ? hosting.port + 1 : hosting.port - 1;
      messages = [];
      chatError = '';
      roomLocked = false;
      try {
        await invoke('chat_host', {
          port: chatPortValue,
          nick: nick.trim(),
          slots: hosting.slots,
        });
    } catch (e) {
      chatError = String(e);
      status = String(e);
      activeRoom = null;
      players = [];
      isReady = false;
      return;
    }

      status = 'Комната создана. Адрес передаётся игрокам в той же сети.';
    } catch (e) {
      status = String(e);
    } finally {
      busy = false;
    }
  }

  async function stopRoom() {
    try {
      await invoke('lobby_stop');
      await invoke('chat_reset');
      hosting = null;
      activeRoom = null;
      messages = [];
      status = 'Комната закрыта';
    } catch (e) {
      status = String(e);
    }
  }

  async function leaveRoom() {
    try {
      await invoke('chat_reset');
    } catch {
      /* ничего не поделать */
    }
    activeRoom = null;
    players = [];
    messages = [];
    isReady = false;
    startNote = '';
    status = 'Вы вышли из комнаты';
  }

  async function sendChat() {
    const text = chatText.trim();
    if (!text) return;
    chatError = '';
    try {
      await invoke('chat_send', { text });
      chatText = '';
      scrollChat();
    } catch (e) {
      chatError = String(e);
    }
  }

  function scrollChat() {
    setTimeout(() => {
      if (chatScroller) chatScroller.scrollTop = chatScroller.scrollHeight;
    }, 30);
  }

  function sysLine(text: string) {
    messages = [...messages, { nick: '', text, system: true }].slice(-200);
    scrollChat();
  }

  function diffPlayers(previous: Player[], next: Player[]) {
    if (previous.length === 0) return;

    for (const player of next) {
      const old = previous.find((p) => p.nick === player.nick);
      if (!old) {
        sysLine(`${player.nick} вошёл в комнату`);
      } else if (old.ready !== player.ready) {
        sysLine(player.ready ? `${player.nick} готов` : `${player.nick} больше не готов`);
      }
    }

    for (const player of previous) {
      if (!next.some((p) => p.nick === player.nick)) {
        sysLine(`${player.nick} вышел из комнаты`);
      }
    }
  }

  async function switchRoom(room: Room) {
    try {
      if (hosting) {
        await invoke('lobby_stop');
        hosting = null;
      }
      await invoke('chat_reset');
    } catch (e) {
      chatError = String(e);
    }
    activeRoom = null;
    players = [];
    messages = [];
    isReady = false;
    startNote = '';
    await join(room);
  }

  async function join(room: Room) {
    try {
      await invoke('chat_reset');
    } catch {
      /* предыдущая комната могла быть уже закрыта */
    }
    activeRoom = room;
    players = [];
    messages = [];
    isReady = false;
    startNote = '';
    chatError = '';
    status = `Проверяю ${room.host}:${room.port}…`;
    checkResult = '';

    const chatPortValue = room.port < 65535 ? room.port + 1 : room.port - 1;
    try {
      await invoke('chat_join', {
        host: room.host,
        port: chatPortValue,
        nick: nick.trim() || 'игрок',
      });
    } catch (e) {
      chatError = String(e);
    }

    try {
      const ok = await invoke<boolean>('lan_check_port', { host: room.host, port: room.port });
      if (!ok) {
        checkResult = 'fail';
        status = 'Вы в комнате. Хост не ответил по TCP — игра может работать по UDP';
        return;
      }
      checkResult = 'ok';
      if (room.game_id === 'counterstrike16') {
        status = await invoke<string>('launch_retro_connect', {
          gameId: 'counterstrike16',
          address: `${room.host}:${room.port}`,
        });
      } else {
        status = `Вы в комнате. Подключайтесь в игре по адресу ${room.host}:${room.port}`;
      }
    } catch (e) {
      status = String(e);
    }
  }

  async function checkManual() {
    const raw = manualAddress.trim();
    if (!raw) {
      checkResult = 'fail';
      status = 'Введите адрес хоста';
      return;
    }
    const [host, rawPort] = raw.split(':');
    const parsed = Number(rawPort);
    if (!host || !parsed) {
      checkResult = 'fail';
      status = 'Формат: адрес:порт';
      return;
    }

    checking = true;
    try {
      const ok = await invoke<boolean>('lan_check_port', { host, port: parsed });
      checkResult = ok ? 'ok' : 'fail';
      status = ok ? 'Хост отвечает — можно подключаться' : 'Порт закрыт или хост недоступен';
    } catch (e) {
      checkResult = 'fail';
      status = String(e);
    } finally {
      checking = false;
    }
  }

  async function toggleReady() {
    const target = !isReady;
    try {
      await invoke('chat_ready', { ready: target });
      isReady = target;
      if (hosting) {
        players = players.map((p) =>
          hosting && p.nick === hosting.nick ? { ...p, ready: target } : p
        );
      }
    } catch (e) {
      chatError = String(e);
    }
  }

  async function startGame() {
    if (!hosting) return;
    startNote = '';
    try {
      await invoke('chat_start', { gameId: hosting.game_id });
    } catch (e) {
      startNote = String(e);
    }
  }

  async function toggleLock() {
    try {
      await invoke('chat_lock', { locked: !roomLocked });
      roomLocked = !roomLocked;
      sysLine(roomLocked ? 'Вход в комнату закрыт' : 'Вход в комнату открыт');
    } catch (e) {
      chatError = String(e);
    }
  }

  async function launchByStart(gameId: string) {
    const room = hosting ?? activeRoom;
    if (!room) return;
    try {
      if (gameId === 'counterstrike16' && activeRoom) {
        startNote = await invoke<string>('launch_retro_connect', {
          gameId: 'counterstrike16',
          address: `${room.host}:${room.port}`,
        });
      } else if (!activeRoom) {
        startNote = await invoke<string>('launch_retro_game_cmd', { gameId });
      } else {
        startNote = `Хост запустил игру. Подключайтесь по адресу ${room.host}:${room.port}`;
      }
    } catch (e) {
      startNote = String(e);
    }
  }

  async function loadClassics() {
    try {
      classics = await invoke<RetroGame[]>('get_retro_games');
      if (!selectedGame && classics.length) selectedGame = `retro:${classics[0].id}`;
    } catch (e) {
      status = String(e);
    }
  }

let addModalOpen = false;

  let customName = '';

  let customExe = '';

  let customCategory = 'Стратегии';
  let addingCustom = false;

  const isCustomGame = (g: RetroGame) => g.id.startsWith('custom-');

  function openAddModal() {
    customName = '';
    customExe = '';
    customCategory = 'Стратегии';
    addModalOpen = true;
  }

  async function addCustomGame() {
    if (addingCustom) return;
    addingCustom = true;
    status = '';
    try {
      await invoke('add_retro_game_cmd', { name: customName, exePath: customExe, category: customCategory });
      addModalOpen = false;
      await loadClassics();
      dispatch('launched');
    } catch (e) {
      status = typeof e === 'string' ? e : 'Не удалось добавить игру';
    } finally {
      addingCustom = false;
    }
  }

  let editModalOpen = false;
  let editGameId = '';
  let editName = '';
  let editExe = '';
  let editCategory = '';
  let editSaving = false;

  function openEditModal(game: RetroGame) {
    editGameId = game.id;
    editName = game.name;
    editExe = '';
    editCategory = game.category || 'Стратегии';
    editModalOpen = true;
  }

  async function saveEditGame() {
    if (editSaving) return;
    editSaving = true;
    status = '';
    try {
      await invoke('update_retro_game_cmd', { id: editGameId, name: editName, exePath: editExe, category: editCategory });
      editModalOpen = false;
      await loadClassics();
      dispatch('launched');
    } catch (e) {
      status = typeof e === 'string' ? e : 'Не удалось изменить игру';
    } finally {
      editSaving = false;
    }
  }

  async function deleteCustomGame(game: RetroGame) {
    if (
      !(await ask({
        title: 'Удалить игру?',
        message: `«${game.name}» исчезнет из списка своих игр.`,
        okLabel: 'Удалить',
        danger: true,
      }))
    )
      return;
    status = '';
    try {
      await invoke('delete_retro_game_cmd', { id: game.id });
      await loadClassics();
      dispatch('launched');
    } catch (e) {
      status = typeof e === 'string' ? e : 'Не удалось удалить игру';
    }
  }

  let compatGame: RetroGame | null = null;
  let compatAdmin = false;
  let compatWindowed = false;
  let compatRun = false;

  function openCompatModal(game: RetroGame) {
    compatGame = game;
    compatAdmin = false;
    compatWindowed = false;
    compatRun = false;
  }

  let showModWarning = false;

  async function confirmRunCompat() {
    showModWarning = false;
    await runCompat();
  }

  async function runCompat() {
    if (!compatGame || compatRun) return;
    compatRun = true;
    status = '';
    try {
      status = await invoke<string>('launch_retro_compat_cmd', {
        gameId: compatGame.id,
        runAsAdmin: compatAdmin,
        windowed: compatWindowed,
      });
      dispatch('launched');
    } catch (e) {
      status = typeof e === 'string' ? e : 'Ошибка запуска с совместимостью';
    } finally {
      compatRun = false;
    }
  }

  async function playClassic(game: RetroGame) {
    try {
      status = await invoke<string>('launch_retro_game_cmd', { gameId: game.id });
      dispatch('launched');
    } catch (e) {
      status = String(e);
    }
  }

  async function chooseExe(game: RetroGame) {
    try {
      const path = await invoke<string>('choose_retro_exe', { gameId: game.id });
      status = `Путь сохранён: ${path}`;
      await loadClassics();
    } catch (e) {
      status = String(e);
    }
  }

  async function openSaves(game: RetroGame) {
    try {
      const dir = await invoke<string>('get_retro_save_dir', { gameId: game.id });
      await invoke('open_url', { url: dir });
      status = `Папка сейвов: ${dir}`;
    } catch (e) {
      status = String(e);
    }
  }

  async function addSave(game: RetroGame) {
    try {
      status = await invoke<string>('import_retro_saves', { gameId: game.id });
    } catch (e) {
      status = String(e);
    }
  }

  function openLink(url: string) {
    invoke('open_url', { url }).catch((e) => (status = String(e)));
  }

  onMount(async () => {
    nick = localStorage.getItem('lobby_nick') ?? '';
    await loadClassics();
    try {
      await invoke('lobby_start', { nick: nick.trim() });
    } catch (e) {
      status = String(e);
    }
    unlisten = await listen<Room[]>('lobby-rooms', (event) => {
      rooms = event.payload.filter((room) => room.id !== hosting?.id);
    });
    const unlistenChat = await listen<ChatMsg>('lobby-chat', (event) => {
      messages = [...messages, event.payload].slice(-200);
      scrollChat();
    });
    const unlistenState = await listen<{ players: Player[]; slots: number; locked: boolean }>(
      'lobby-state',
      (event) => {
        const next = event.payload.players ?? [];
        diffPlayers(players, next);
        players = next;
        if (typeof event.payload.slots === 'number' && event.payload.slots > 0) {
          slots = event.payload.slots;
        }
        roomLocked = !!event.payload.locked;
        const me = next.find((p) => p.nick === nick.trim());
        if (me) isReady = me.ready;
      }
    );
    const unlistenStart = await listen<{ game_id: string }>('lobby-start', (event) => {
      sysLine('Хост запустил игру');
      launchByStart(event.payload.game_id);
    });
    const previous = unlisten;
    unlisten = () => {
      previous?.();
      unlistenChat();
      unlistenState();
      unlistenStart();
    };
  });

  onDestroy(() => {
    unlisten?.();
  });
</script>

<div class="lan">
  <header class="head">
    <div>
      <h1>Сетевая игра</h1>
      <p class="lead">
        Комнаты видны всем лаунчерам в одной сети — без регистрации и сторонних программ.
        Только легальные копии игр.
      </p>
    </div>
    <div class="nick">
      <label for="nick">Ваше имя</label>
      <input id="nick" bind:value={nick} on:blur={saveNick} placeholder="ник" maxlength="20" />
    </div>
  </header>

  {#if !inRoom}
    <section class="card">
      <div class="card-head">
        <h2>Подключиться по адресу</h2>
      </div>
      <p class="muted">Если комната в другой сети, введите адрес, который прислал хост.</p>
      <div class="manual">
        <input bind:value={manualAddress} placeholder="203.0.113.5:27015" spellcheck="false" />
        <button class="ghost" on:click={checkManual} disabled={checking}>
          {checking ? 'Проверяю…' : 'Проверить связь'}
        </button>
      </div>
    </section>
  {/if}

  {#if status}
    <p class="status" class:ok={checkResult === 'ok'} class:bad={checkResult === 'fail'}>{status}</p>
  {/if}

  {#if inRoom}
    <section class="card room-card">
      <div class="card-head">
        <div class="room-title">
          <h2>{hosting ? hosting.name : activeRoom?.name}</h2>
          <span class="muted small">
            {hosting ? hosting.game_name : activeRoom?.game_name} ·
            {hosting ? `вы хост · ${hosting.host}:${hosting.port}` : `${activeRoom?.host}:${activeRoom?.port}`}
          </span>
        </div>
        {#if hosting}
          <button class="ghost" on:click={stopRoom}>Закрыть комнату</button>
        {:else}
          <button class="ghost" on:click={leaveRoom}>Выйти</button>
        {/if}
      </div>

      <div class="players">
        {#each players as player (player.nick)}
          <div class="player">
            <span class="avatar">{player.nick.slice(0, 1).toUpperCase()}</span>
            <div class="player-meta">
              <span class="player-nick">
                {player.nick}
                {#if hosting && player.nick === hosting.nick}<em>хост</em>{/if}
              </span>
              <span class="player-ping">{player.ping ? `${player.ping} мс` : '—'}</span>
            </div>
            <span class="ready-dot" class:on={player.ready} title={player.ready ? 'готов' : 'не готов'}></span>
          </div>
        {/each}
      </div>

      <div class="room-actions">
        {#if hosting}
          <button class="primary" on:click={startGame} disabled={!allReady}>
            {allReady ? 'Старт' : 'Ждём готовности'}
          </button>
          <span class="muted small">{guests.filter((p) => p.ready).length} из {guests.length} готовы</span>
          <span class="muted small">свободно {freeSlots} из {hosting.slots}</span>
          <button class="ghost" on:click={toggleLock}>
            {roomLocked ? 'Открыть вход' : 'Закрыть вход'}
          </button>
        {:else}
          <button class:primary={!isReady} class:ghost={isReady} on:click={toggleReady}>
            {isReady ? 'Вы готовы' : 'Готов'}
          </button>
          {#if roomLocked}<span class="muted small">хост закрыл вход</span>{/if}
        {/if}
        {#if startNote}<span class="muted small">{startNote}</span>{/if}
      </div>
    </section>

    <section class="card chat-card">
      <div class="card-head">
        <h2>Чат комнаты</h2>
        <span class="muted small">сообщения видят все в комнате</span>
      </div>

      <div class="chat" bind:this={chatScroller}>
        {#if messages.length === 0}
          <p class="muted small">Сообщений пока нет — напишите первым.</p>
        {:else}
          {#each messages as msg, index (index)}
            {#if msg.system}
              <div class="sys">{msg.text}</div>
            {:else}
              <div class="msg">
                <span class="msg-nick">{msg.nick}</span>
                <span class="msg-text">{msg.text}</span>
              </div>
            {/if}
          {/each}
        {/if}
      </div>

      {#if chatError}
        <p class="bad">{chatError}</p>
      {/if}

      <form class="chat-form" on:submit|preventDefault={sendChat}>
        <input bind:value={chatText} placeholder="Сообщение" maxlength="300" />
        <button class="primary" type="submit">Отправить</button>
      </form>
    </section>

    {#if rooms.length}
      <section class="card">
        <div class="card-head">
          <h2>Другие комнаты</h2>
          <span class="counter">{rooms.length}</span>
        </div>
        <div class="rooms">
          {#each rooms as room (room.id)}
            <div class="room">
              <div class="room-meta">
                <strong>{room.name}</strong>
                <span class="muted small">{room.game_name} · {room.nick}</span>
              </div>
              <button class="ghost" on:click={() => switchRoom(room)}>Перейти</button>
            </div>
          {/each}
        </div>
        <p class="hint">Переход сразу отключит вас от текущей комнаты.</p>
      </section>
    {/if}
  {:else}
  <div class="columns">
    <section class="card">
      <div class="card-head">
          <h2>Комнаты</h2>
          <span class="counter">{rooms.length}</span>
        </div>

      {#if hosting}
        <div class="own">
          <div class="own-meta">
            <strong>{hosting.name}</strong>
            <span class="muted small">{hosting.game_name} · вы хост</span>
          </div>
          <button class="ghost" on:click={stopRoom}>Закрыть</button>
        </div>
      {/if}

      {#if rooms.length === 0}
        <div class="empty">
          <p>Пока никого нет</p>
          <span class="muted small">
            Создайте комнату или попросите друга запустить лаунчер в этой же сети.
          </span>
        </div>
      {:else}
        <div class="rooms">
          {#each rooms as room (room.id)}
            <div class="room">
              <div class="room-meta">
                <strong>{room.name}</strong>
                <span class="muted small">{room.game_name} · {room.nick} · до {room.slots} мест</span>
              </div>
              <code class="addr">{room.host}:{room.port}</code>
              <button class="primary" on:click={() => join(room)}>Войти</button>
            </div>
          {/each}
        </div>
      {/if}
    </section>

    <section class="card">
      <div class="card-head">
        <h2>Создать комнату</h2>
      </div>

      {#if hosting}
        <p class="muted">
          Ваша комната <strong>{hosting.name}</strong> уже в списке. Передайте друзьям адрес
          <code>{hosting.host}:{hosting.port}</code>.
        </p>
      {:else}
        <div class="field">
          <label for="rname">Название</label>
          <input id="rname" bind:value={roomName} placeholder="Например: вечер в Warcraft" maxlength="32" />
        </div>

        <div class="field">
          <label for="game">Игра</label>
          <select id="game" bind:value={selectedGame}>
            {#each gameOptions as option}
              <option value={option.value}>{option.label}</option>
            {/each}
          </select>
        </div>

        <div class="field">
          <label for="rport">Порт</label>
          <input id="rport" type="number" min="1" max="65535" bind:value={port} />
        </div>

        <div class="field">
          <label for="slots">Мест в комнате</label>
          <select id="slots" bind:value={slots}>
            {#each slotOptions as option}
              <option value={option}>{option} мест</option>
            {/each}
          </select>
          <span class="hint">2 — один на один, 10 — пять на пять</span>
        </div>

        <button class="primary" on:click={createRoom} disabled={busy}>
          {busy ? 'Создаю…' : 'Создать комнату'}
        </button>
      {/if}

      <p class="hint">
        Комнаты ищутся широковещательными пакетами в локальной сети. Через интернет подключение
        идёт по адресу — он указан в карточке комнаты.
      </p>
    </section>
  </div>

  {#if !inRoom && popularClassics.length > 0}
    <section class="card">
      <div class="card-head">
        <h2>Часто запускаемые</h2>
        <span class="counter">{popularClassics.length}</span>
      </div>
      <div class="popular">
        {#each popularClassics as item (item.game.id)}
          <div class="popular-item">
            <div class="popular-meta">
              <strong>{item.game.name}</strong>
              <span class="muted small">
                Запусков: {item.count}{#if item.last} · последний {fmtDate(item.last)}{/if}
              </span>
            </div>
            <button class="primary" on:click={() => playClassic(item.game)}>Играть</button>
          </div>
        {/each}
      </div>
    </section>
  {/if}

  <section class="card">
    <div class="card-head">
      <h2>Классика</h2>
      <span class="counter">{filteredClassics.length}</span>
      <button class="ghost" on:click={openAddModal}>+ Своя игра</button>
    </div>
    <input
      class="classics-search"
      bind:value={classicsQuery}
      placeholder="Поиск игры — например, Warcraft или стратегия"
      spellcheck="false"
    />
    <div class="classic-cats">
      <button
        class="cat"
        class:active={activeCategory === 'all'}
        on:click={() => (activeCategory = 'all')}
      >
        Все<span class="cat-count">{classics.length}</span>
      </button>
      {#each categoryChips as c (c.key)}
        {#if c.key !== 'all'}
          <button
            class="cat"
            class:active={activeCategory === c.key}
            on:click={() => (activeCategory = c.key)}
          >
            {c.label}<span class="cat-count">{c.count}</span>
          </button>
        {/if}
      {/each}
    </div>
    {#if classics.length === 0}
      <p class="muted">Список классики пуст.</p>
    {:else if filteredClassics.length === 0 && installedClassics.length === 0}
      <p class="muted">Ничего не нашлось по запросу «{classicsQuery}».</p>
    {:else}
      {#if installedClassics.length > 0}
        <div class="section-label">Что у меня есть</div>
        <div class="classics">
          {#each installedClassics as game (game.id)}
            <div class="classic">
              {#if game.id === topClassicId}<span class="top-badge">Популярное</span>{/if}
              <div class="classic-meta">
                <strong>{game.name}</strong>
                <span class="muted small">{game.description} <span class="installed-badge">установлено</span></span>
                {#if classicCount(game) > 0}
                  <span class="classic-stats">Запусков: {classicCount(game)} · последний {fmtDate(usage[retroKey(game.id)]?.last ?? 0)}</span>
                {/if}
              </div>
              <div class="classic-actions">
                {#if isCustomGame(game)}
                  <button class="ghost" title="Изменить" on:click={() => openEditModal(game)}>Изменить</button>
                  <button class="ghost danger" title="Удалить" on:click={() => deleteCustomGame(game)}>Удалить</button>
                {/if}
                <button class="primary" on:click={() => playClassic(game)}>Играть</button>
                <details class="extra-toggle">
                  <summary>Дополнительно</summary>
                  <div class="extra-actions">
                    <button class="ghost" title="Совместимость со старыми системами" on:click={() => openCompatModal(game)}>Совместимость</button>
                    <button class="ghost" on:click={() => chooseExe(game)}>Папка</button>
                    <button class="ghost" on:click={() => addSave(game)}>+ Сейв</button>
                  </div>
                </details>
              </div>
            </div>
          {/each}
        </div>
      {/if}
      {#if activeCategory === 'all'}
        {#each categoryGroups as group (group.key)}
          <details class="cat-group" bind:open={openCats[group.key]} on:toggle={() => (openCats = { ...openCats })}>
            <summary>
              <span class="cat-group-label">{group.label}</span>
              <span class="cat-group-count">{group.games.length}</span>
              <span class="cat-group-caret">▾</span>
            </summary>
            <div class="classics">
              {#each group.games as game (game.id)}
                <div class="classic">
                  {#if game.id === topClassicId}<span class="top-badge">Популярное</span>{/if}
                  <div class="classic-meta">
                    <strong>{game.name}</strong>
                    <span class="muted small">{game.description}</span>
                    {#if classicCount(game) > 0}
                      <span class="classic-stats">Запусков: {classicCount(game)} · последний {fmtDate(usage[retroKey(game.id)]?.last ?? 0)}</span>
                    {/if}
                  </div>
                  <div class="classic-actions">
                    {#if isCustomGame(game)}
                      <button class="ghost" title="Изменить" on:click={() => openEditModal(game)}>Изменить</button>
                      <button class="ghost danger" title="Удалить" on:click={() => deleteCustomGame(game)}>Удалить</button>
                    {/if}
                    <button class="ghost" title="Указать, где установлена игра" on:click={() => chooseExe(game)}>Папка</button>
                    <button class="ghost" title="Совместимость со старыми системами" on:click={() => openCompatModal(game)}>Совместимость</button>
                    <button class="ghost" on:click={() => addSave(game)}>+ Сейв</button>
                  </div>
                </div>
              {/each}
            </div>
          </details>
        {/each}
      {:else}
        {#if catalogClassics.length > 0}
          <div class="classics">
            {#each catalogClassics as game (game.id)}
              <div class="classic">
                {#if game.id === topClassicId}<span class="top-badge">Популярное</span>{/if}
                <div class="classic-meta">
                  <strong>{game.name}</strong>
                  <span class="muted small">{game.description}</span>
                  {#if classicCount(game) > 0}
                    <span class="classic-stats">Запусков: {classicCount(game)} · последний {fmtDate(usage[retroKey(game.id)]?.last ?? 0)}</span>
                  {/if}
                </div>
                <div class="classic-actions">
                  {#if isCustomGame(game)}
                    <button class="ghost" title="Изменить" on:click={() => openEditModal(game)}>Изменить</button>
                    <button class="ghost danger" title="Удалить" on:click={() => deleteCustomGame(game)}>Удалить</button>
                  {/if}
                  <button class="ghost" title="Указать, где установлена игра" on:click={() => chooseExe(game)}>Папка</button>
                  <button class="ghost" title="Совместимость со старыми системами" on:click={() => openCompatModal(game)}>Совместимость</button>
                  <button class="ghost" on:click={() => addSave(game)}>+ Сейв</button>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      {/if}
    {/if}
  </section>

  <section class="fallback">
    <div class="fallback-text">
      <strong>Не получается соединиться?</strong>
      <span class="muted small">
        Если провайдер прячет вас за NAT и прямой адрес не работает — подключитесь через
        сторонние программы виртуальной сети.
      </span>
    </div>
    <div class="fallback-actions">
      <button class="ghost" on:click={() => openLink('https://www.gameranger.com')}>GameRanger</button>
      <button class="ghost" on:click={() => openLink('https://www.zerotier.com/download/')}>ZeroTier</button>
    </div>
  </section>
  {/if}

  {#if addModalOpen}
    <div class="add-backdrop" on:click={() => (addModalOpen = false)} on:keydown={() => {}} role="presentation"></div>
    <div class="add-modal" role="dialog" aria-modal="true" aria-label="Добавить свою игру">
      <h3>Добавить свою игру</h3>
      <p class="muted">Нет в списке? Укажите название и путь к запускаемому файлу.</p>
      <div class="field">
        <label for="custom-name">Название</label>
        <input id="custom-name" bind:value={customName} placeholder="Например: Half-Life" maxlength="60" />
      </div>
      <div class="field">
        <label for="custom-exe">Путь к .exe</label>
        <input
          id="custom-exe"
          bind:value={customExe}
          placeholder="C:\Games\Half-Life\hl.exe"
          spellcheck="false"
        />
      </div>
      <div class="field">
        <label for="custom-category">Категория</label>
        <select id="custom-category" bind:value={customCategory}>
          {#each categoryOrder as c (c)}
            <option value={c}>{c}</option>
          {/each}
        </select>
      </div>
      <div class="add-actions">
        <button class="ghost" on:click={() => (addModalOpen = false)} disabled={addingCustom}>Отмена</button>
        <button class="primary" on:click={addCustomGame} disabled={addingCustom || !customName.trim() || !customExe.trim()}>
          {addingCustom ? 'Добавляю…' : 'Добавить'}
        </button>
      </div>
    </div>
  {/if}

  {#if editModalOpen}
    <div class="add-backdrop" on:click={() => (editModalOpen = false)} on:keydown={() => {}} role="presentation"></div>
    <div class="add-modal" role="dialog" aria-modal="true" aria-label="Изменить свою игру">
      <h3>Изменить игру</h3>
      <p class="muted">Поменяйте название или укажите новый путь. Пустые поля не изменяются.</p>
      <div class="field">
        <label for="edit-name">Название</label>
        <input id="edit-name" bind:value={editName} placeholder="Название" maxlength="60" />
      </div>
      <div class="field">
        <label for="edit-exe">Путь к .exe</label>
        <input
          id="edit-exe"
          bind:value={editExe}
          placeholder="C:\Games\Half-Life\hl.exe"
          spellcheck="false"
        />
      </div>
      <div class="field">
        <label for="edit-category">Категория</label>
        <select id="edit-category" bind:value={editCategory}>
          {#each categoryOrder as c (c)}
            <option value={c}>{c}</option>
          {/each}
        </select>
      </div>
      <div class="add-actions">
        <button class="ghost" on:click={() => (editModalOpen = false)} disabled={editSaving}>Отмена</button>
        <button class="primary" on:click={saveEditGame} disabled={editSaving || !editName.trim()}>
          {editSaving ? 'Сохраняю…' : 'Сохранить'}
        </button>
      </div>
    </div>
  {/if}

{#if compatGame}
    <div class="add-backdrop" on:click={() => (compatGame = null)} on:keydown={() => {}} role="presentation"></div>
    <div class="add-modal" role="dialog" aria-modal="true" aria-label="Запуск с совместимостью">
      <h3>Запустить «{compatGame.name}» с совместимостью</h3>
      <p class="muted">Подойдёт для старых игр, которые не открываются на новой Windows.</p>
      <label class="compat-opt">
        <input type="checkbox" bind:checked={compatAdmin} />
        <span><strong>От имени администратора</strong><em class="muted small"> для игр, которым нужны права записи</em></span>
      </label>
      <label class="compat-opt">
        <input type="checkbox" bind:checked={compatWindowed} />
        <span><strong>Оконный режим</strong><em class="muted small"> добавить -windowed при запуске</em></span>
      </label>
      <div class="add-actions">
        <button class="ghost" on:click={() => (compatGame = null)}>Отмена</button>
        <button class="primary" on:click={() => (showModWarning = true)} disabled={compatRun}>Запустить</button>
      </div>
    </div>
  {/if}

  {#if showModWarning && compatGame}
    <ModdingWarning
      gameName={compatGame.name}
      onConfirm={confirmRunCompat}
      onCancel={() => (showModWarning = false)}
    />
  {/if}
</div>

<style>
  .lan {
    padding: 26px 30px;
    width: 100%;
    max-width: none;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .head { display: flex; align-items: flex-start; gap: 16px; }
  .head > div:first-child { flex: 1; display: flex; flex-direction: column; gap: 6px; }
  h1 { margin: 0; font-size: 22px; }
  .lead { margin: 0; font-size: 12.5px; color: var(--muted); line-height: 1.5; }

  .nick { display: flex; flex-direction: column; gap: 5px; width: 150px; }
  .nick label { font-size: 11px; color: var(--muted); }

  .columns { display: grid; grid-template-columns: 1.35fr 1fr; gap: 12px; align-items: start; }

  .card {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 16px;
    border: 1px solid var(--line);
    border-radius: 12px;
    background: var(--panel);
  }
  .card-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
  h2 { margin: 0; font-size: 14px; font-weight: 650; }
  .counter {
    min-width: 22px;
    height: 20px;
    padding: 0 7px;
    display: grid;
    place-items: center;
    border-radius: 999px;
    background: var(--hover-2);
    color: var(--muted);
    font-size: 11px;
  }

  .muted { margin: 0; font-size: 11.5px; color: var(--muted-2); line-height: 1.45; }
  .small { font-size: 11px; }
  .hint { margin: 0; font-size: 11px; color: var(--muted-2); line-height: 1.45; }

  .empty {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 22px 14px;
    border: 1px dashed var(--line);
    border-radius: 10px;
    text-align: center;
  }
  .empty p { margin: 0; font-size: 12.5px; color: var(--muted); }

  .rooms { display: flex; flex-direction: column; gap: 6px; }
  .room {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 9px 11px;
    border: 1px solid var(--line);
    border-radius: 10px;
  }
  .room:hover { border-color: var(--accent); }
  .room-meta { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .room-meta strong { font-size: 12.5px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .addr { font-size: 11px; color: var(--muted); }

  .own {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 9px 11px;
    border: 1px solid var(--accent);
    border-radius: 10px;
    background: color-mix(in srgb, var(--accent) 8%, transparent);
  }
  .own-meta { flex: 1; display: flex; flex-direction: column; gap: 2px; }

  .field { display: flex; flex-direction: column; gap: 5px; }
  label { font-size: 11px; color: var(--muted); }

  input,
  select {
    height: 32px;
    padding: 0 9px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--bg-soft);
    color: var(--text);
    font: inherit;
    font-size: 12px;
  }
  input:focus,
  select:focus { outline: none; border-color: var(--accent); }

  .manual { display: flex; gap: 8px; }
  .manual input { flex: 1; }

  .primary,
  .ghost {
    height: 30px;
    padding: 0 12px;
    border-radius: 8px;
    font: inherit;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
  }
  .primary { border: 1px solid var(--accent); background: var(--accent); color: var(--ink-on-accent); }
  .primary:disabled { opacity: 0.6; cursor: progress; }
  .ghost { border: 1px solid var(--line); background: transparent; color: var(--text); }
  .ghost:hover { background: var(--hover-2); }
  .danger { border-color: color-mix(in srgb, var(--danger) 45%, var(--line)); color: var(--danger); }
  .danger:hover { background: rgba(224, 85, 85, 0.12); color: var(--danger); }

  .add-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(5, 8, 16, 0.55);
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
  .add-modal input {
    width: 100%;
    height: 38px;
    padding: 0 11px;
    background: var(--bg-soft);
    border: 1px solid var(--line);
    border-radius: var(--radius-sm);
    color: var(--text);
    font: inherit;
    font-size: 13px;
    box-sizing: border-box;
  }
  .add-modal input:focus { outline: none; border-color: var(--accent); }
  .add-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 4px;
  }

  .add-modal input[type="checkbox"] {
    width: 16px;
    height: 16px;
    padding: 0;
    accent-color: var(--accent);
    flex: none;
  }
  .compat-opt {
    display: flex;
    align-items: flex-start;
    gap: 9px;
    cursor: pointer;
  }
  .compat-opt span { display: flex; flex-direction: column; gap: 2px; }
  .compat-opt strong { font-size: 12.5px; }

  .status {
    margin: 0;
    padding: 10px 12px;
    border: 1px solid var(--line);
    border-radius: 9px;
    background: var(--bg-soft);
    font-size: 12px;
  }
  .status.ok { border-color: #3f7a52; color: #8fe1a0; }
  .status.bad { border-color: #7a3f3f; color: var(--danger); }

  .chat-card { gap: 12px; }

  .players { display: flex; flex-direction: column; gap: 6px; }
  .player {
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 7px 11px 7px 7px;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--bg-soft);
  }
  .player:first-child { border-color: color-mix(in srgb, var(--accent) 45%, var(--line)); }
  .avatar {
    width: 26px;
    height: 26px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: color-mix(in srgb, var(--accent) 22%, transparent);
    color: var(--accent);
    font-size: 11.5px;
    font-weight: 700;
  }
  .player-meta { display: flex; flex-direction: column; gap: 1px; }
  .player-nick { font-size: 12px; font-weight: 600; display: flex; align-items: center; gap: 6px; }
  .player-nick em { font-style: normal; font-size: 10px; color: var(--muted-2); }
  .player-ping { font-size: 10.5px; color: var(--muted-2); }
  .ready-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #5b6270;
    box-shadow: 0 0 0 3px color-mix(in srgb, #5b6270 25%, transparent);
  }
  .ready-dot.on { background: #57c777; box-shadow: 0 0 0 3px color-mix(in srgb, #57c777 25%, transparent); }

  .room-actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }

  .chat {
    height: 180px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 10px;
    border: 1px solid var(--line);
    border-radius: 9px;
    background: var(--bg-soft);
  }
  .msg { display: flex; gap: 8px; font-size: 12px; line-height: 1.45; }
  .msg-nick { flex-shrink: 0; color: var(--accent); font-weight: 600; }
  .msg-text { color: var(--text); word-break: break-word; }
  .sys {
    align-self: center;
    padding: 3px 10px;
    border-radius: 999px;
    background: var(--hover-2);
    color: var(--muted-2);
    font-size: 11px;
  }

  .chat-form { display: flex; gap: 8px; }
  .chat-form input { flex: 1; }

  .fallback {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px 16px;
    border: 1px dashed var(--line);
    border-radius: 12px;
  }
  .fallback-text { flex: 1; display: flex; flex-direction: column; gap: 4px; }
  .fallback-text strong { font-size: 12.5px; font-weight: 650; }
  .fallback-actions { display: flex; gap: 8px; }

  .classics {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(390px, 1fr));
    gap: 12px;
  }
  .classics-search {
    height: 34px;
    padding: 0 11px;
    border: 1px solid var(--line);
    border-radius: 9px;
    background: var(--bg-soft);
    color: var(--text);
    font: inherit;
    font-size: 12.5px;
  }
  .classics-search:focus { outline: none; border-color: var(--accent); }
  .classic-cats {
    display: flex;
    flex-wrap: wrap;
    gap: 7px;
  }
  .cat-group {
    border: 1px solid var(--line);
    border-radius: 12px;
    background: var(--panel);
    overflow: hidden;
  }
  .cat-group > summary {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 14px;
    cursor: pointer;
    list-style: none;
    user-select: none;
  }
  .cat-group > summary::-webkit-details-marker { display: none; }
  .cat-group > summary:hover { background: var(--hover-2); }
  .cat-group-label { font-size: 13.5px; font-weight: 650; flex: 1; }
  .cat-group-count {
    padding: 1px 9px;
    border-radius: 999px;
    background: var(--hover-2);
    color: var(--muted);
    font-size: 11px;
  }
  .cat-group-caret {
    font-size: 10px;
    color: var(--muted-2);
    transition: transform 0.15s;
  }
  .cat-group[open] > summary .cat-group-caret { transform: rotate(180deg); }
  .cat-group .classics {
    border-top: 1px solid var(--line);
    padding: 12px;
    grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
  }
  .cat {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    height: 30px;
    padding: 0 12px;
    border: 1px solid var(--line);
    border-radius: 999px;
    background: var(--bg-soft);
    color: var(--muted);
    font: inherit;
    font-size: 12px;
    cursor: pointer;
    transition: border-color 0.15s, color 0.15s, background 0.15s;
  }
  .cat:hover { color: var(--text); border-color: var(--line-strong, var(--line)); }
  .cat.active {
    background: var(--accent);
    border-color: var(--accent);
    color: #0b1220;
    font-weight: 600;
  }
  .cat-count {
    font-size: 11px;
    opacity: 0.65;
  }
  .cat.active .cat-count { opacity: 0.75; }
  .popular {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: 10px;
  }
  .popular-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 14px;
    border: 1px solid var(--line);
    border-radius: 12px;
    background: var(--bg-soft);
  }
  .popular-meta {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }
  .popular-meta strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .classic { position: relative; }
  .top-badge {
    position: absolute;
    top: 10px;
    right: 12px;
    padding: 2px 8px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--accent) 18%, transparent);
    color: var(--accent);
    font-size: 10.5px;
    font-weight: 600;
    letter-spacing: 0.02em;
  }
  .classic-stats {
    margin-top: 2px;
    font-size: 11.5px;
    color: var(--muted);
  }
  .classic {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: 12px;
    padding: 16px 18px;
    border: 1px solid var(--line);
    border-radius: 14px;
    background: var(--panel);
    min-height: 116px;
    transition: border-color 0.16s ease, transform 0.16s ease;
  }
  .classic:hover { border-color: var(--accent); transform: translateY(-1px); }
  .classic-meta { flex: 1 1 100%; display: flex; flex-direction: column; gap: 5px; min-width: 0; }
  .classic-meta strong { font-size: 14.5px; font-weight: 650; letter-spacing: 0.1px; }
  .classic-meta .small { font-size: 12px; line-height: 1.5; }
  .section-label {
    margin: 2px 0 -2px;
    font-size: 12px;
    font-weight: 650;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    color: var(--accent);
  }
  .installed-badge {
    display: inline-block;
    margin-left: 6px;
    padding: 1px 8px;
    border-radius: 999px;
    background: rgba(46, 160, 67, 0.15);
    color: #3fb950;
    font-size: 10.5px;
    font-weight: 600;
    vertical-align: 1px;
  }
  .classic-actions { display: flex; gap: 8px; margin-left: auto; }
  .classic-actions :global(button) { height: 34px; padding: 0 15px; font-size: 12.5px; }
  .classic-actions .extra-toggle {
    position: relative;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: transparent;
  }
  .classic-actions .extra-toggle summary {
    height: 34px;
    padding: 0 15px;
    font-size: 12.5px;
    line-height: 34px;
    cursor: pointer;
    list-style: none;
    color: var(--muted);
    white-space: nowrap;
  }
  .classic-actions .extra-toggle summary::-webkit-details-marker { display: none; }
  .extra-actions {
    position: absolute;
    right: 0;
    top: calc(100% + 6px);
    z-index: 30;
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 180px;
    padding: 8px;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--panel);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
  }
  .extra-actions :global(button) { width: 100%; justify-content: flex-start; }

  code { color: var(--accent); }

  @media (max-width: 940px) {
    .columns { grid-template-columns: 1fr; }
  }
</style>
