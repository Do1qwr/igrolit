<script lang="ts">
  import { onMount } from 'svelte';
  import Icon from './Icon.svelte';
  import GroupPage from './GroupPage.svelte';
  import {
    online,
    requestGroups,
    requestNewsFeed,
    openGroup,
    subscribeGroup,
    unsubscribeGroup,
    createPost,
    togglePostLike,
    createGroup,
    type Group,
    type NewsFeedItem,
  } from '../lib/online';

  export let onOpenAuth: (mode: 'login' | 'register') => void = () => {};

  let mode: 'feed' | 'catalog' = 'feed';
  let postText = '';
  let posting = false;
  let viewGroupId: string | null = null;
  let showCreate = false;

  $: authed = $online.authed;
  $: groups = $online.groups ?? [];
  $: feed = $online.newsFeed ?? [];
  $: subscribedGroups = groups.filter((g) => g.subscribed);

  function when(ts: number): string {
    const d = new Date(ts);
    const now = Date.now();
    const diff = now - ts;
    const min = Math.floor(diff / 60000);
    if (min < 1) return 'только что';
    if (min < 60) return `${min} мин назад`;
    const h = Math.floor(min / 60);
    if (h < 24) return `${h} ч назад`;
    const day = Math.floor(h / 24);
    if (day < 7) return day === 1 ? 'вчера' : `${day} дн назад`;
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function fmt(n: number): string {
    if (n >= 1000) return (n / 1000).toFixed(1).replace('.', ',') + 'К';
    return String(n);
  }

  function titleOf(text: string): string {
    const line = text.split('\n').map((l) => l.trim()).filter(Boolean)[0] || '';
    return line.length > 90 ? line.slice(0, 87) + '…' : line;
  }

  function bodyOf(text: string): string {
    const parts = text.split('\n').map((l) => l.trim()).filter(Boolean);
    if (parts.length <= 1) return '';
    return parts.slice(1).join('\n');
  }

  function addPost(g: Group) {
    const text = postText.trim();
    if (!text || posting) return;
    posting = true;
    createPost(g.id, text);
    postText = '';
    setTimeout(() => (posting = false), 800);
  }

  function openGroupView(id: string) {
    viewGroupId = id;
    openGroup(id);
  }

  let createName = '';
  let createTagline = '';
  let createAbbrev = '';
  let createLink = '';
  let createOpen = true;
  let createErr = '';
  let showHelp: '' | 'abbrev' | 'link' = '';

  function submitCreate() {
    createErr = '';
    const name = createName.trim();
    if (!name || name.length < 2) { createErr = 'Название — минимум 2 символа'; return; }
    if (createAbbrev.trim() && createAbbrev.trim().length < 2) { createErr = 'Аббревиатура — минимум 2 символа'; return; }
    const link = createLink.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '') || slugify(name);
    if (link.length < 2) { createErr = 'Ссылка — минимум 2 символа (латиница)'; return; }
    createGroup({
      name,
      tagline: createTagline.trim(),
      abbrev: createAbbrev.trim(),
      link,
      isOpen: createOpen,
      avatar: '',
      banner: '',
    });
    createName = '';
    createTagline = '';
    createAbbrev = '';
    createLink = '';
    createOpen = true;
    showCreate = false;
  }

  function slugify(s: string): string {
    return s.toLowerCase().replace(/[^a-z0-9а-яё]+/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
      .replace(/[а-яё]/g, '') || 'group-' + Date.now().toString(36);
  }

  function toggleSub(g: Group) {
    if (!authed) return onOpenAuth('login');
    if (g.subscribed) unsubscribeGroup(g.id);
    else subscribeGroup(g.id);
  }

  onMount(() => {
    if (authed) {
      requestGroups();
      requestNewsFeed();
    }
  });

  $: if (authed) {
    requestGroups();
    requestNewsFeed();
  }
</script>

<div class="news">
  {#if !authed}
    <section class="panel">
      <h3>Новости сообщества</h3>
      <p class="muted small">
        Лента новостей от групп, которые создают игроки. Подпишитесь на группы — и их посты будут
        попадать к вам в ленту. Вход бесплатный.
      </p>
      <div class="btns">
        <button class="primary" on:click={() => onOpenAuth('login')}>Войти</button>
        <button class="ghost" on:click={() => onOpenAuth('register')}>Создать аккаунт</button>
      </div>
    </section>
  {:else if viewGroupId}
    <GroupPage groupId={viewGroupId} onBack={() => { viewGroupId = null; requestGroups(); }} />
  {:else}
    <div class="news-bar">
      <div class="sub-tabs">
        <button class:active={mode === 'feed'} on:click={() => { mode = 'feed'; requestNewsFeed(); }}>
          Лента {subscribedGroups.length > 0 ? `· ${subscribedGroups.length}` : ''}
        </button>
        <button class:active={mode === 'catalog'} on:click={() => { mode = 'catalog'; requestGroups(); }}>
          Все группы {groups.length}
        </button>
        <button class="create-g" on:click={() => (showCreate = true)}>+ Создать группу</button>
      </div>
    </div>

    <div class="news-scroll">
      {#if mode === 'feed'}
        {#if feed.length === 0}
          <section class="panel center-tip">
            <span class="tip-ic"><Icon name="bell" size={30} /></span>
            <p>В ленте пока пусто</p>
            <span class="muted small">
              Подпишитесь на группы во вкладке «Все группы» — их новости появятся здесь.
            </span>
          </section>
        {:else}
          {#each feed as item (item.g.id + item.post.id)}
            <article class="post row">
              {#if item.post.image}
                <div class="post-cover" style:background-image={`url(${item.post.image})`}></div>
              {/if}
              <div class="post-body">
                <header class="post-head">
                  <span class="post-ava">
                    {#if item.g.avatar}<img src={item.g.avatar} alt="" />{:else}{item.g.name.slice(0, 1).toUpperCase()}{/if}
                  </span>
                  <div class="post-head-txt">
                    <div class="post-title-line">
                      <strong>{item.g.name}</strong>
                      <span class="tag-fav">Избранное</span>
                    </div>
                    <span class="post-meta">НОВОСТЬ · {when(item.post.ts * 1000)}</span>
                  </div>
                </header>
                <div class="post-content" on:click={() => openGroupView(item.g.id)}>
                  {#if item.post.text}
                    <h4 class="post-title">{titleOf(item.post.text)}</h4>
                    {#if bodyOf(item.post.text)}
                      <p class="post-text">{bodyOf(item.post.text)}</p>
                    {/if}
                  {/if}
                </div>
                <footer class="post-foot">
                  <button class="like-btn" class:on={item.post.liked} on:click={() => togglePostLike(item.g.id, item.post.id)}>
                    <Icon name="heart" size={15} />
                    <span>{fmt(item.post.likes)}</span>
                  </button>
                  <span class="views"><Icon name="eye" size={15} /> {fmt(item.post.views)}</span>
                  <button class="more-btn" title="Дополнительно" on:click={() => openGroupView(item.g.id)}>
                    <span class="dots">•••</span>
                  </button>
                </footer>
              </div>
            </article>
          {/each}
        {/if}
      {:else}
        {#if groups.length === 0}
          <section class="panel center-tip">
            <p>Групп пока нет</p>
            <span class="muted small">Станьте первым — создайте свою группу.</span>
          </section>
        {:else}
          <div class="group-grid">
            {#each groups as g (g.id)}
              <div class="group-card" on:click={() => openGroupView(g.id)}>
                {#if g.banner}
                  <div class="group-banner" style:background-image={`url(${g.banner})`}></div>
                {/if}
                <div class="group-body">
                  <span class="group-ava">
                    {#if g.avatar}<img src={g.avatar} alt="" />{:else}{g.name.slice(0, 1).toUpperCase()}{/if}
                  </span>
                  <div class="group-info">
                    <strong>{g.name}</strong>
                    <span class="muted small">{g.tagline || 'нет описания'}</span>
                  </div>
                </div>
                <div class="group-meta muted small">
                  <span>{g.members} участников</span>
                  <span>· {g.posts} постов</span>
                </div>
                <button
                  class={g.subscribed ? 'ghost sub-btn' : 'primary sub-btn'}
                  on:click|stopPropagation={() => toggleSub(g)}
                >
                  {g.subscribed ? 'Вы подписаны' : 'Подписаться'}
                </button>
              </div>
            {/each}
          </div>
        {/if}
      {/if}
    </div>
  {/if}

  {#if showCreate}
    <div class="n-mask" on:click={() => (showCreate = false)}></div>
    <div class="n-modal" role="dialog" aria-label="Создать группу">
      <div class="n-modal-head">
        <h3>Создать группу</h3>
        <button class="n-close" title="Закрыть" on:click={() => (showCreate = false)}>✕</button>
      </div>
      <div class="n-field">
        <label>Название</label>
        <input bind:value={createName} maxlength="40" placeholder="Например: Мята Ретро" />
        <span class="n-hint">Видно всем, кто найдёт группу.</span>
      </div>
      <div class="n-field">
        <label>Описание</label>
        <textarea bind:value={createTagline} rows="2" maxlength="120" placeholder="Пара слов о группе"></textarea>
      </div>
      <div class="n-field">
        <label>Аббревиатура <button class="n-help" type="button" on:click={() => (showHelp = showHelp ? '' : 'abbrev')} title="Что это?">?</button></label>
        <input bind:value={createAbbrev} maxlength="20" placeholder="Например: МР" autocomplete="off" />
        <span class="n-hint">Короткая метка-идентификатор, например «МР».</span>
      </div>
      <div class="n-field">
        <label>Ссылка <button class="n-help" type="button" on:click={() => (showHelp = showHelp ? '' : 'link')} title="Что это?">?</button></label>
        <div class="n-prefix">laub://group/</div>
        <input bind:value={createLink} maxlength="60" placeholder="myta-retro" autocomplete="off" />
        <span class="n-hint">Короткий адрес группы. Латиница, цифры, _ и -.</span>
      </div>
      {#if showHelp === 'abbrev'}
        <p class="n-tip">Аббревиатура — короткая метка группы (1–20 символов). Она видна рядом с названием и помогает быстро отличить группу.</p>
      {/if}
      {#if showHelp === 'link'}
        <p class="n-tip">Ссылка — уникальный короткий адрес группы вида laub://group/ваша-ссылка. Ваши друзья могут открыть профиль группы прямо по нему.</p>
      {/if}
      <div class="n-field n-checkrow">
        <label class="n-check">
          <input type="checkbox" checked={createOpen} on:change={() => (createOpen = !createOpen)} />
          <span>Открытая группа</span>
        </label>
        <span class="n-hint">В открытую группу может вступить любой сразу. Закрытая — только по приглашению создателя.</span>
      </div>
      {#if createErr}<p class="n-err">{createErr}</p>{/if}
      <div class="n-modal-foot">
        <button class="ghost" on:click={() => (showCreate = false)}>Отмена</button>
        <button class="primary" on:click={submitCreate}>Создать группу</button>
      </div>
    </div>
  {/if}
</div>

<style>
  .news { display: flex; flex-direction: column; gap: 12px; padding: 20px 24px; width: 100%; max-width: none; box-sizing: border-box; }
  .muted { color: var(--muted); }
  .muted.small { font-size: 12px; }

  .panel {
    padding: 14px 16px;
    border: 1px solid var(--line);
    border-radius: 12px;
    background: var(--panel);
    display: flex;
    flex-direction: column;
    gap: 9px;
  }
  .panel h3 { margin: 0; font-size: 14px; }
  .btns { display: flex; gap: 8px; }
  .primary {
    display: inline-flex; align-items: center; justify-content: center;
    padding: 8px 16px; border: 1px solid var(--accent); border-radius: 9px;
    background: var(--accent); color: var(--ink-on-accent);
    font: inherit; font-size: 12.5px; font-weight: 650; cursor: pointer;
  }
  .primary:hover { filter: brightness(1.08); }
  .ghost {
    display: inline-flex; align-items: center; justify-content: center;
    padding: 8px 16px; border: 1px solid var(--line); border-radius: 9px;
    background: var(--panel-2); color: var(--text);
    font: inherit; font-size: 12.5px; font-weight: 600; cursor: pointer;
  }
  .ghost:hover { background: var(--hover); }

  .news-bar { display: flex; align-items: center; border-bottom: 1px solid var(--line); }
  .sub-tabs { display: flex; gap: 4px; }
  .sub-tabs button {
    position: relative;
    padding: 8px 14px;
    border: 0;
    background: transparent;
    color: var(--muted);
    font: inherit;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
  }
  .sub-tabs button.active { color: var(--accent); }
  .sub-tabs button.active::after { content: ''; position: absolute; left: 8px; right: 8px; bottom: -1px; height: 2px; background: var(--accent); }
  .create-g { margin-left: auto; padding: 8px 14px; border: 1px solid var(--accent); border-radius: 9px; background: var(--accent-soft); color: var(--accent); font: inherit; font-size: 12.5px; font-weight: 600; cursor: pointer; }
  .create-g:hover { background: color-mix(in srgb, var(--accent) 22%, transparent); }

  .n-mask { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.5); z-index: 60; }
  .n-modal {
    position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
    width: 420px; max-width: 92vw;
    background: var(--panel); border: 1px solid var(--line); border-radius: 16px; padding: 20px;
    z-index: 61; box-shadow: var(--shadow-lift);
    display: flex; flex-direction: column; gap: 12px;
  }
  .n-modal-head { display: flex; align-items: center; justify-content: space-between; }
  .n-modal-head h3 { margin: 0; font-size: 15px; }
  .n-close { width: 26px; height: 26px; border: 0; border-radius: 8px; background: var(--hover-2); color: var(--muted); font-size: 13px; cursor: pointer; }
  .n-field { display: flex; flex-direction: column; gap: 5px; }
  .n-field label { font-size: 12px; font-weight: 600; color: var(--muted); }
  .n-field input, .n-field textarea {
    width: 100%; border: 1px solid var(--line); border-radius: 8px;
    background: var(--bg-soft); color: var(--text); font: inherit; font-size: 13px; padding: 9px 11px; outline: none;
  }
  .n-field input:focus, .n-field textarea:focus { border-color: var(--accent); }
  .n-err { margin: 0; font-size: 12px; color: var(--danger); }
  .n-modal-foot { display: flex; justify-content: flex-end; gap: 8px; }

  .n-hint { font-size: 11px; color: var(--muted); }
  .n-help {
    display: inline-flex; align-items: center; justify-content: center;
    width: 17px; height: 17px; margin-left: 5px;
    border: 1px solid var(--line); border-radius: 50%;
    background: var(--hover-2); color: var(--muted);
    font-size: 10.5px; font-weight: 700; vertical-align: middle; cursor: pointer;
  }
  .n-help:hover { border-color: var(--accent); color: var(--accent); }
  .n-prefix {
    margin: 0 0 2px;
    font-size: 11px; color: var(--accent); font-family: var(--font-mono, monospace);
  }
  .n-tip {
    margin: -4px 0 0;
    padding: 10px 12px;
    border: 1px solid color-mix(in srgb, var(--accent) 35%, var(--line));
    border-radius: 9px;
    background: var(--accent-soft);
    font-size: 12px; line-height: 1.5; color: var(--text);
  }
  .n-checkrow { flex-direction: row; align-items: flex-start; gap: 10px; }
  .n-check { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; color: var(--text); }
  .n-check input { width: 15px; height: 15px; accent-color: var(--accent); }

  .news-scroll { display: flex; flex-direction: column; gap: 12px; }

  .center-tip { align-items: center; text-align: center; padding: 34px 16px; }
  .center-tip p { margin: 0; font-size: 14px; font-weight: 600; }
  .tip-ic { color: var(--muted); opacity: 0.6; }

  .post {
    border: 1px solid var(--line);
    border-radius: 14px;
    background: var(--panel);
    overflow: hidden;
  }
  .post.row {
    display: flex;
    align-items: stretch;
  }
  .post-cover {
    width: 260px;
    min-width: 260px;
    flex: none;
    background-size: cover;
    background-position: center;
    background-color: var(--panel-2);
    min-height: 180px;
  }
  .post-body { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .post-head { display: flex; align-items: center; gap: 10px; padding: 12px 14px 6px; }
  .post-ava { width: 30px; height: 30px; flex: none; border-radius: 50%; display: grid; place-items: center; overflow: hidden; background: var(--accent-soft); color: var(--accent); font-weight: 700; font-size: 12px; }
  .post-ava img { width: 100%; height: 100%; object-fit: cover; }
  .post-head-txt { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
  .post-title-line { display: flex; align-items: center; gap: 8px; min-width: 0; }
  .post-title-line strong { font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .tag-fav {
    padding: 1px 7px;
    border-radius: 999px;
    background: var(--hover-2);
    color: var(--muted);
    font-size: 10.5px;
    white-space: nowrap;
  }
  .post-meta { font-size: 11px; color: var(--muted); letter-spacing: 0.2px; }
  .post-content { padding: 8px 14px 4px; display: flex; flex-direction: column; gap: 4px; cursor: pointer; flex: 1; }
  .post-title { margin: 0; font-size: 16px; font-weight: 700; color: var(--text); line-height: 1.35; }
  .post-text { margin: 0; font-size: 13px; line-height: 1.55; color: var(--muted); white-space: pre-wrap; }
  .post-foot { display: flex; align-items: center; gap: 14px; padding: 8px 14px 12px; margin-top: auto; }
  .like-btn { display: inline-flex; align-items: center; gap: 6px; border: 0; background: transparent; color: var(--muted); font: inherit; font-size: 12.5px; cursor: pointer; }
  .like-btn:hover { color: var(--danger); }
  .like-btn.on { color: var(--danger); }
  .views { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; color: var(--muted); }
  .more-btn {
    margin-left: auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px; height: 28px;
    border: 0; border-radius: 8px;
    background: transparent; color: var(--muted);
    cursor: pointer;
  }
  .more-btn:hover { background: var(--hover); color: var(--text); }
  .dots { letter-spacing: 1px; font-size: 13px; line-height: 1; }

  .group-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 12px; }
  .group-card {
    border: 1px solid var(--line);
    border-radius: 14px;
    background: var(--panel);
    overflow: hidden;
    display: flex;
    flex-direction: column;
    cursor: pointer;
  }
  .group-card:hover { border-color: var(--accent); }
  .group-banner { height: 90px; background-size: cover; background-position: center; background-color: var(--panel-2); }
  .group-body { display: flex; align-items: center; gap: 11px; padding: 12px 13px 4px; }
  .group-ava { width: 44px; height: 44px; flex: none; border-radius: 12px; display: grid; place-items: center; overflow: hidden; background: var(--accent-soft); color: var(--accent); font-weight: 700; font-size: 16px; }
  .group-ava img { width: 100%; height: 100%; object-fit: cover; }
  .group-info { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .group-info strong { font-size: 13.5px; }
  .group-meta { padding: 4px 13px 6px; }
  .sub-btn { margin: 4px 12px 12px; height: 30px; font-size: 12px; }
</style>