<script lang="ts">
  import { onMount } from 'svelte';
  import { listen, emit } from '@tauri-apps/api/event';
  import { online, applyRemoteState } from '../lib/online';

  interface Friend {
    name: string;
    online: boolean;
    game: string | null;
  }

  let query = '';
  let chatWith: string | null = null;
  let draft = '';
  let groupHint = '';
  let listEl: HTMLDivElement;

  $: friends = $online.friends;
  $: filtered = friends.filter((friend) => friend.name.includes(query.trim().toLowerCase()));
  $: inGame = filtered.filter((friend) => friend.online && friend.game);
  $: onlineNow = filtered.filter((friend) => friend.online && !friend.game);
  $: offline = filtered.filter((friend) => !friend.online);
  $: messages = chatWith ? $online.threads[chatWith] ?? [] : [];

  function initials(value: string): string {
    return (value || '?').slice(0, 2).toUpperCase();
  }

  function open(friend: string) {
    chatWith = friend;
    emit('online:action', { type: 'openChat', name: friend }).catch(() => {});
  }

  function back() {
    if (chatWith) emit('online:action', { type: 'closeChat', name: chatWith }).catch(() => {});
    chatWith = null;
  }

  function submit() {
    if (!chatWith || !draft.trim()) return;
    emit('online:action', { type: 'sendChat', to: chatWith, text: draft.trim() }).catch(() => {});
    draft = '';
  }

  function doLogout() {
    emit('online:action', { type: 'logout' }).catch(() => {});
  }

  function time(ts: number): string {
    return new Date(ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  }

  onMount(() => {
    try {
      const raw = localStorage.getItem('online_state');
      if (raw) applyRemoteState(JSON.parse(raw));
    } catch {}
    listen('online:state', (event) => {
      if (event.payload) applyRemoteState(event.payload as typeof $online);
    });
    return () => {};
  });

  afterUpdateScroll();
  function afterUpdateScroll() {}
</script>

<div class="friends">
  {#if !$online.authed}
    <div class="state">
      <h2>Р”СЂСѓР·СЊСЏ</h2>
      <p>Р’РѕР№РґРёС‚Рµ РІ РѕРЅР»Р°Р№РЅ РІ РіР»Р°РІРЅРѕРј РѕРєРЅРµ Р»Р°СѓРЅС‡РµСЂР° вЂ” СЃРїРёСЃРѕРє РїРѕСЏРІРёС‚СЃСЏ Р·РґРµСЃСЊ.</p>
    </div>
  {:else if chatWith}
    <header class="chat-head">
      <button class="back" on:click={back} aria-label="РќР°Р·Р°Рґ">в†ђ</button>
      <span class="chat-avatar" class:on={friends.find((f) => f.name === chatWith)?.online}>
        {initials(chatWith)}
      </span>
      <span class="chat-meta">
        <span class="chat-name">{chatWith}</span>
        <span class="chat-status">
          {friends.find((f) => f.name === chatWith)?.online ? 'Р’ СЃРµС‚Рё' : 'РќРµ РІ СЃРµС‚Рё'}
        </span>
      </span>
    </header>

    <div class="messages" bind:this={listEl}>
      {#each messages as msg}
        <div class="msg" class:mine={msg.mine}>
          <span class="bubble">{msg.text}</span>
          <span class="time">{time(msg.ts)}</span>
        </div>
      {/each}
      {#if messages.length === 0}
        <p class="muted">РќР°С‡РЅРёС‚Рµ РїРµСЂРµРїРёСЃРєСѓ</p>
      {/if}
    </div>

    <form class="compose" on:submit|preventDefault={submit}>
      <input bind:value={draft} placeholder="РЎРѕРѕР±С‰РµРЅРёРµвЂ¦" />
      <button class="send" type="submit" aria-label="РћС‚РїСЂР°РІРёС‚СЊ">вћ¤</button>
    </form>
  {:else}
    <header class="me-head">
      <span class="avatar big">{$online.user ? $online.user.slice(0, 1).toUpperCase() : '?'}</span>
      <span class="me-meta">
        <span class="me-name">{$online.user}</span>
        <span class="me-status">Р’ СЃРµС‚Рё</span>
      </span>
    </header>

    <div class="search">
      <span class="search-icon">вЊ•</span>
      <input bind:value={query} placeholder="РџРѕРёСЃРє" />
    </div>

    <div class="list">
      {#if inGame.length}
        <p class="section">Р’ РёРіСЂРµ</p>
        {#each inGame as friend (friend.displayName || friend.name)}
          <button class="row" on:click={() => open(friend.displayName || friend.name)}>
            <span class="avatar" class:on={true}>{initials(friend.name)}</span>
            <span class="meta">
              <span class="name">{friend.name}</span>
              <span class="sub game">{friend.game}</span>
            </span>
            {#if $online.unread[friend.displayName || friend.name]}
              <span class="badge">{$online.unread[friend.displayName || friend.name]}</span>
            {/if}
          </button>
        {/each}
      {/if}

      <p class="section">Р’ СЃРµС‚Рё ({onlineNow.length})</p>
      {#each onlineNow as friend (friend.displayName || friend.name)}
        <button class="row" on:click={() => open(friend.displayName || friend.name)}>
          <span class="avatar on">{initials(friend.name)}</span>
          <span class="meta">
            <span class="name">{friend.name}</span>
            <span class="sub on">Р’ СЃРµС‚Рё</span>
          </span>
          {#if $online.unread[friend.displayName || friend.name]}
            <span class="badge">{$online.unread[friend.displayName || friend.name]}</span>
          {/if}
        </button>
      {/each}

      <p class="section">РќРµ РІ СЃРµС‚Рё ({offline.length})</p>
      {#each offline as friend (friend.displayName || friend.name)}
        <button class="row" on:click={() => open(friend.displayName || friend.name)}>
          <span class="avatar">{initials(friend.name)}</span>
          <span class="meta">
            <span class="name">{friend.name}</span>
            <span class="sub">РќРµ РІ СЃРµС‚Рё</span>
          </span>
          {#if $online.unread[friend.displayName || friend.name]}
            <span class="badge">{$online.unread[friend.displayName || friend.name]}</span>
          {/if}
        </button>
      {/each}

      {#if friends.length === 0}
        <p class="muted">Р”СЂСѓР·РµР№ РїРѕРєР° РЅРµС‚ вЂ” РґРѕР±Р°РІСЊС‚Рµ РїРѕ РЅРёРєСѓ РІ СЂР°Р·РґРµР»Рµ В«РћРЅР»Р°Р№РЅВ».</p>
      {/if}
      {#if groupHint}
        <p class="muted">{groupHint}</p>
      {/if}
    </div>

    <footer>
      <button class="group" on:click={() => (groupHint = 'Р“СЂСѓРїРїРѕРІС‹Рµ С‡Р°С‚С‹ вЂ” СЃРєРѕСЂРѕ')}>
        Р“Р РЈРџРџРћР’Р«Р• Р§РђРўР«
      </button>
      <button class="logout" on:click={doLogout}>Р’С‹Р№С‚Рё</button>
    </footer>
  {/if}
</div>

<style>
  .friends { display: flex; flex-direction: column; height: 100%; background: var(--bg); color: var(--text); }

  .state { margin: auto; padding: 24px; text-align: center; }
  .state h2 { margin: 0 0 8px; font-size: 16px; }
  .state p { margin: 0; font-size: 12px; color: var(--muted); line-height: 1.5; }

  .me-head { display: flex; align-items: center; gap: 10px; padding: 12px; border-bottom: 1px solid var(--line); }
  .avatar.big { width: 38px; height: 38px; border-radius: 10px; font-size: 15px; }
  .me-meta { display: flex; flex-direction: column; }
  .me-name { font-size: 13.5px; font-weight: 650; }
  .me-status { font-size: 11px; color: #8fe1a0; }

  .search { display: flex; align-items: center; gap: 6px; padding: 8px 10px; border-bottom: 1px solid var(--line); }
  .search-icon { color: var(--muted-2); font-size: 14px; }
  .search input {
    flex: 1; height: 28px; padding: 0 8px; border: 1px solid var(--line); border-radius: 7px;
    background: var(--bg-soft); color: var(--text); font: inherit; font-size: 12px;
  }
  .search input:focus { outline: none; border-color: var(--accent); }

  .list { flex: 1; overflow-y: auto; padding: 4px 6px 8px; }
  .section {
    margin: 10px 6px 4px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.7px;
    color: var(--muted-2); font-weight: 650;
  }

  .row {
    width: 100%; display: flex; align-items: center; gap: 8px; padding: 6px 7px;
    border: 0; border-radius: 7px; background: transparent; color: inherit; font: inherit;
    text-align: left; cursor: pointer;
  }
  .row:hover { background: var(--hover-2); }
  .avatar {
    width: 26px; height: 26px; border-radius: 7px; flex: none;
    display: flex; align-items: center; justify-content: center;
    font-size: 9.5px; font-weight: 700; background: var(--bg-soft); color: var(--muted);
    border: 1px solid var(--line);
  }
  .avatar.on { color: var(--accent); border-color: rgba(110, 168, 255, 0.4); }
  .meta { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .name { font-size: 12px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .sub { font-size: 10px; color: var(--muted-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .sub.on { color: #8fe1a0; }
  .sub.game { color: #9fc4ff; }
  .badge {
    min-width: 16px; height: 16px; padding: 0 4px; border-radius: 999px;
    background: var(--accent); color: var(--ink-on-accent); font-size: 10px; font-weight: 700;
    display: flex; align-items: center; justify-content: center;
  }
  .muted { margin: 12px; font-size: 11px; color: var(--muted-2); line-height: 1.4; }

  footer { display: flex; gap: 8px; padding: 8px 10px; border-top: 1px solid var(--line); }
  .group, .logout {
    height: 26px; border: 1px solid var(--line); border-radius: 7px; background: transparent;
    color: var(--muted); font: inherit; font-size: 10px; letter-spacing: 0.4px; cursor: pointer;
  }
  .group { flex: 1; text-align: left; padding: 0 8px; }
  .logout { padding: 0 10px; }
  .group:hover, .logout:hover { color: var(--text); border-color: var(--muted-2); }

  .chat-head { display: flex; align-items: center; gap: 8px; padding: 10px; border-bottom: 1px solid var(--line); }
  .back { width: 24px; height: 24px; border: 0; border-radius: 6px; background: transparent; color: var(--muted); font-size: 15px; cursor: pointer; }
  .back:hover { background: var(--hover-2); color: var(--text); }
  .chat-avatar {
    width: 26px; height: 26px; border-radius: 7px; display: flex; align-items: center; justify-content: center;
    font-size: 9.5px; font-weight: 700; background: var(--bg-soft); color: var(--muted); border: 1px solid var(--line);
  }
  .chat-avatar.on { color: var(--accent); }
  .chat-meta { display: flex; flex-direction: column; }
  .chat-name { font-size: 12.5px; font-weight: 650; }
  .chat-status { font-size: 10px; color: var(--muted-2); }

  .messages { flex: 1; padding: 10px; display: flex; flex-direction: column; gap: 6px; overflow-y: auto; }
  .msg { display: flex; flex-direction: column; gap: 2px; max-width: 80%; }
  .msg.mine { align-self: flex-end; align-items: flex-end; }
  .bubble { padding: 6px 9px; border-radius: 9px; background: var(--bg-soft); font-size: 12px; line-height: 1.4; word-break: break-word; }
  .msg.mine .bubble { background: var(--accent); color: var(--ink-on-accent); }
  .time { font-size: 9px; color: var(--muted-2); }

  .compose { display: flex; gap: 6px; padding: 8px 10px; border-top: 1px solid var(--line); }
  .compose input {
    flex: 1; height: 28px; padding: 0 8px; border: 1px solid var(--line); border-radius: 7px;
    background: var(--bg-soft); color: var(--text); font: inherit; font-size: 12px;
  }
  .compose input:focus { outline: none; border-color: var(--accent); }
  .send { width: 28px; height: 28px; border: 1px solid var(--accent); border-radius: 7px; background: var(--accent); color: var(--ink-on-accent); cursor: pointer; }
</style>

