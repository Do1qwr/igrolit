<script lang="ts">
  import { onMount } from 'svelte';
  import Icon from './Icon.svelte';
  import {
    online,
    subscribeGroup,
    unsubscribeGroup,
    createPost,
    publishPost,
    applyJoin,
    resolveApply,
    togglePostLike,
    sendComplaint,
    type Group,
  } from '../lib/online';

  export let groupId: string;
  export let onBack: () => void = () => {};

  let postText = '';
  let posting = false;
  let showComposer = false;
  let draftMode = false;
  let adminTab: 'posts' | 'members' | 'apply' = 'posts';

  $: group = $online.groupView && $online.groupView.id === groupId ? $online.groupView : null;
  $: managed = !!group && (group.mine || $online.isAdmin);

  function when(ts: number): string {
    const d = new Date(ts);
    const min = Math.floor((Date.now() - ts) / 60000);
    if (min < 1) return 'только что';
    if (min < 60) return `${min} мин назад`;
    const h = Math.floor(min / 60);
    if (h < 24) return `${h} ч назад`;
    const day = Math.floor(h / 24);
    if (day < 7) return day === 1 ? 'вчера' : `${day} дн назад`;
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  }

  function createdDate(ts: number): string {
    return new Date(ts).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
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

  function addPost(published = true) {
    if (!group) return;
    const text = postText.trim();
    if (!text || posting) return;
    posting = true;
    createPost(group.id, text, '', published);
    postText = '';
    draftMode = false;
    setTimeout(() => (posting = false), 800);
  }

  function changePublish(post: string, published: boolean) {
    if (!group) return;
    publishPost(group.id, post, published);
  }

  function apply() {
    if (!group) return;
    applyJoin(group.id);
  }

  function resolve(target: string, accept: boolean) {
    if (!group) return;
    resolveApply(group.id, target, accept);
  }

  function toggleSub() {
    if (!group) return;
    if (group.subscribed) unsubscribeGroup(group.id);
    else subscribeGroup(group.id);
  }

  function report() {
    if (!group) return;
    sendComplaint(group.by || group.name, 'группа');
  }

  onMount(() => {
    import('../lib/online').then((m) => m.openGroup(groupId));
  });
</script>

{#if group}
  <div class="gp">
    <button class="ghost back-btn" on:click={onBack}>‹ Назад</button>

    <div class="gp-grid">
      <div class="gp-main">
        <header class="gp-hero">
          {#if group.banner}<div class="gp-banner" style:background-image={`url(${group.banner})`}></div>{/if}
          <div class="gp-head">
            <span class="gp-ava">{#if group.avatar}<img src={group.avatar} alt="" />{:else}{group.name.slice(0, 2).toUpperCase()}{/if}</span>
            <div class="gp-title">
              <div class="gp-name-line">
                <strong>{group.name}</strong>
                {#if group.abbrev}<span class="gp-abbrev">{group.abbrev}</span>{/if}
                {#if group.mine}<span class="tag admin">моя</span>{/if}
              </div>
              <span class="muted small">{group.isOpen ? 'Открытая группа' : 'Закрытая группа'}</span>
              <span class="muted small">Создана {group.by} · {createdDate(group.created)}</span>
            </div>
          </div>
          <p class="gp-tagline">{group.tagline || 'Описание группы отсутствует'}</p>
        </header>

        <section class="panel discussions">
          <div class="sec-head">
            <h3>{managed ? 'Объявления' : 'Популярные обсуждения'}</h3>
            <div class="sec-actions">
              <span class="muted small">{managed ? `${group.posts.filter(p => !p.published).length} черновиков` : ''}</span>
              {#if managed}
                <button
                  class="primary small-btn"
                  on:click={() => { adminTab = 'posts'; showComposer = !showComposer; }}>Сделать объявление</button>
              {/if}
            </div>
          </div>
          {#if group.posts.length === 0}
            <p class="muted small">{managed ? 'Объявлений нет. Сделайте первое.' : 'Обсуждений пока нет. Загляните позже.'}</p>
          {:else}
            <div class="disc-list">
              {#each group.posts as post (post.id)}
                <div class="disc">
                  <div class="disc-main">
                    <div class="disc-title-line">
                      <strong class="disc-title">{titleOf(post.text) || 'Без заголовка'}</strong>
                      {#if !post.published}
                        <span class="tag draft">черновик</span>
                      {/if}
                    </div>
                    {#if bodyOf(post.text)}<span class="disc-body">{bodyOf(post.text)}</span>{/if}
                    <span class="disc-meta muted small">{post.by} · {when(post.ts * 1000)}</span>
                  </div>
                  <div class="disc-stats">
                    {#if managed}
                      <button class="pub-toggle" class:on={post.published} on:click={() => changePublish(post.id, !post.published)} title={post.published ? 'Скрыть (черновик)' : 'Опубликовать'}>
                        {post.published ? 'Опубликовано' : 'Скрыто'}
                      </button>
                    {/if}
                    <button class="like-btn" class:on={post.liked} on:click={() => togglePostLike(group.id, post.id)} title="Нравится">
                      <Icon name="heart" size={14} />
                      <span>{fmt(post.likes)}</span>
                    </button>
                    <span class="views"><Icon name="eye" size={14} /> {fmt(post.views)}</span>
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </section>
      </div>

      <aside class="gp-side">
        {#if managed}
          <section class="side-card manage">
            <h3>Управление</h3>
            <button
              class="ghost w"
              class:tab-active={adminTab === 'posts'}
              on:click={() => { adminTab = 'posts'; showComposer = false; }}>Объявления</button>
            <button
              class="ghost w"
              class:tab-active={adminTab === 'members'}
              on:click={() => { adminTab = 'members'; }}>Участники</button>
            <button class="ghost w" class:tab-active={adminTab === 'apply'} on:click={() => { adminTab = 'apply'; }}>
              Заявки{group.applyCount ? ` (${group.applyCount})` : ''}
            </button>
            <button class="ghost w" on:click={onBack}>Назад к ленте</button>
          </section>
        {/if}

        <section class="side-card stats">
          <h3>Участники</h3>
          <div class="stat-row"><strong>{group.members}</strong><span class="muted small">участников</span></div>
          <div class="stat-row"><strong>{group.posts.length}</strong><span class="muted small">обсуждений</span></div>
          {#if group.isOpen}
            <span class="pill open">Открытая</span>
          {:else}
            <span class="pill closed">Закрытая</span>
          {/if}
        </section>

        <section class="side-card actions">
          {#if group.subscribed}
            <button class="ghost sub" on:click={toggleSub}>Покинуть группу</button>
          {:else if group.applicant}
            <button class="ghost sub" disabled>Заявка отправлена</button>
          {:else}
            <button class="primary sub" on:click={apply}>Подать заявку</button>
          {/if}
          {#if !managed}
            <button class="ghost report w" on:click={report}>Пожаловаться</button>
          {/if}
        </section>
      </aside>
    </div>

    {#if managed && adminTab === 'posts' && showComposer}
      <section class="panel composer">
        <h3>Новое объявление</h3>
        <textarea
          bind:value={postText}
          rows="3"
          placeholder="Напишите новость для своей группы…"
          maxlength="3000"
        ></textarea>
        <label class="draft-toggle">
          <input type="checkbox" bind:checked={draftMode} />
          Сохранить как скрытый черновик (опубликуется позже)
        </label>
        <div class="composer-foot right">
          <button class="ghost" on:click={() => { showComposer = false; postText = ''; }}>Отмена</button>
          <button class="primary" on:click={() => addPost(!draftMode)} disabled={!postText.trim() || posting}>
            {posting ? 'Сохраняем…' : draftMode ? 'Сохранить черновик' : 'Опубликовать'}
          </button>
        </div>
      </section>
    {/if}

    {#if managed && adminTab === 'members'}
      <section class="panel admin-panel">
        <h3>Участники ({group.members})</h3>
        {#if !group.membersList || group.membersList.length === 0}
          <p class="muted small">Участников пока нет.</p>
        {:else}
          <div class="member-list">
            {#each group.membersList as m (m.name)}
              <div class="member-row">
                <span class="member-ava">{#if m.avatar}<img src={m.avatar} alt="" />{:else}<Icon name="user" size={16} />{/if}</span>
                <span class="member-name">{m.name}</span>
                {#if m.name === group.by}
                  <span class="pill owner">владелец</span>
                {/if}
              </div>
            {/each}
          </div>
        {/if}
      </section>
    {/if}

    {#if managed && adminTab === 'apply'}
      <section class="panel admin-panel">
        <h3>Заявки на вступление ({group.applyCount})</h3>
        {#if group.applyCount === 0}
          <p class="muted small">Новых заявок нет.</p>
        {:else}
          <div class="apply-list">
            {#if group.applicantsList}
              {#each group.applicantsList as a (a.name)}
                <div class="member-row apply-row">
                  <span class="member-ava">{#if a.avatar}<img src={a.avatar} alt="" />{:else}<Icon name="user" size={16} />{/if}</span>
                  <span class="member-name">{a.name}</span>
                  <div class="apply-btns">
                    <button class="small ok" on:click={() => resolve(a.name, true)}>Принять</button>
                    <button class="small bad" on:click={() => resolve(a.name, false)}>Отклонить</button>
                  </div>
                </div>
              {/each}
            {/if}
          </div>
        {/if}
      </section>
    {/if}
  </div>
{:else}
  <div class="gp"><section class="panel">Загрузка группы…</section></div>
{/if}

<style>
  .gp { display: flex; flex-direction: column; gap: 12px; padding: 18px 24px; width: 100%; max-width: none; box-sizing: border-box; }
  .muted { color: var(--muted); }
  .muted.small { font-size: 12px; }

  .back-btn { width: fit-content; height: 30px; font-size: 12px; }

  .gp-grid { display: grid; grid-template-columns: 1fr 260px; gap: 14px; align-items: start; }
  .gp-main { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
  .gp-side { display: flex; flex-direction: column; gap: 12px; position: sticky; top: 12px; }

  .gp-hero {
    display: flex;
    flex-direction: column;
    gap: 10px;
    border: 1px solid var(--line);
    border-radius: 16px;
    background: var(--panel);
    overflow: hidden;
    padding-bottom: 16px;
  }
  .gp-banner { height: 130px; background-size: cover; background-position: center; background-color: var(--panel-2); }
  .gp-head { display: flex; align-items: center; gap: 13px; padding: 6px 16px 2px; }
  .gp-ava { width: 60px; height: 60px; flex: none; border-radius: 16px; display: grid; place-items: center; overflow: hidden; background: var(--accent-soft); color: var(--accent); font-size: 20px; font-weight: 800; box-shadow: 0 4px 14px rgba(0,0,0,0.35); }
  .gp-ava img { width: 100%; height: 100%; object-fit: cover; }
  .gp-title { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .gp-name-line { display: flex; align-items: center; gap: 8px; min-width: 0; }
  .gp-name-line strong { font-size: 20px; }
  .gp-abbrev {
    padding: 1px 8px;
    border-radius: 999px;
    background: var(--hover-2);
    color: var(--muted);
    font-size: 11px;
    font-weight: 600;
    white-space: nowrap;
  }
  .gp-tagline { margin: 0; padding: 4px 16px 0; font-size: 13px; color: var(--text); line-height: 1.55; white-space: pre-wrap; }

  .tag.admin { padding: 1px 8px; border-radius: 999px; font-size: 10.5px; font-weight: 600; background: var(--accent-soft); color: var(--accent); width: fit-content; }

  .panel {
    padding: 14px 16px;
    border: 1px solid var(--line);
    border-radius: 12px;
    background: var(--panel);
    display: flex;
    flex-direction: column;
    gap: 9px;
  }
  .sec-head { display: flex; align-items: center; justify-content: space-between; }
  .sec-head h3 { margin: 0; font-size: 14px; }
  .sec-actions { display: flex; align-items: center; gap: 8px; }
  .small-btn { height: 30px; padding: 0 12px; font-size: 12px; border-radius: 8px; }
  .disc-title-line { display: flex; align-items: center; gap: 7px; min-width: 0; }
  .tag.draft { padding: 1px 7px; border-radius: 999px; font-size: 10px; font-weight: 700; background: rgba(255,193,7,0.16); color: #e6b800; white-space: nowrap; }
  .pub-toggle {
    border: 1px solid var(--line);
    border-radius: 7px;
    background: var(--panel-2);
    color: var(--muted);
    font: inherit;
    font-size: 11px;
    padding: 3px 8px;
    cursor: pointer;
  }
  .pub-toggle.on { color: var(--ok); border-color: color-mix(in srgb, var(--ok) 50%, var(--line)); }

  .tab-active { border-color: var(--accent) !important; color: var(--accent) !important; }

  .draft-toggle { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--muted); cursor: pointer; }
  .draft-toggle input { accent-color: var(--accent); }
  .composer-foot.right { justify-content: flex-end; gap: 8px; }

  .admin-panel { border-top: 2px solid var(--accent); }
  .admin-panel h3 { margin: 0; font-size: 14px; }

  .member-list, .apply-list { display: flex; flex-direction: column; gap: 6px; }
  .member-row {
    display: flex; align-items: center; gap: 10px;
    padding: 8px 10px;
    border: 1px solid var(--line);
    border-radius: 10px;
  }
  .member-ava {
    width: 30px; height: 30px; flex: none; border-radius: 50%; overflow: hidden;
    display: grid; place-items: center; background: var(--panel-3); color: var(--muted);
  }
  .member-ava img { width: 100%; height: 100%; object-fit: cover; }
  .member-name { flex: 1; font-size: 13px; }
  .pill.owner { padding: 1px 8px; border-radius: 999px; font-size: 10.5px; font-weight: 600; background: var(--accent-soft); color: var(--accent); }
  .apply-btns { display: flex; gap: 6px; }
  .apply-row { flex-wrap: wrap; }
  .small { height: 27px; padding: 0 10px; border: 1px solid var(--line); border-radius: 8px; font: inherit; font-size: 11.5px; font-weight: 600; cursor: pointer; }
  .small.ok { background: rgba(67,209,122,0.15); color: var(--ok); border-color: color-mix(in srgb, var(--ok) 45%, transparent); }
  .small.bad { background: rgba(229,57,53,0.12); color: var(--danger); border-color: color-mix(in srgb, var(--danger) 45%, transparent); }

  .disc-list { display: flex; flex-direction: column; gap: 6px; }
  .disc {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border: 1px solid var(--line);
    border-radius: 10px;
  }
  .disc:hover { border-color: var(--accent); }
  .disc-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .disc-title { font-size: 13.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .disc-body { font-size: 12px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .disc-meta { font-size: 11px; }
  .disc-stats { display: flex; align-items: center; gap: 12px; flex: none; }
  .like-btn { display: inline-flex; align-items: center; gap: 5px; border: 0; background: transparent; color: var(--muted); font: inherit; font-size: 12px; cursor: pointer; }
  .like-btn.on { color: var(--danger); }
  .views { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; color: var(--muted); }

  .side-card {
    padding: 12px 13px;
    border: 1px solid var(--line);
    border-radius: 12px;
    background: var(--panel);
    display: flex;
    flex-direction: column;
    gap: 9px;
  }
  .side-card h3 { margin: 0; font-size: 13px; }
  .side-card .w { width: 100%; }

  .stat-row { display: flex; align-items: baseline; gap: 7px; }
  .stat-row strong { font-size: 16px; color: var(--accent); }

  .pill {
    align-self: flex-start;
    padding: 3px 10px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 600;
  }
  .pill.open { background: rgba(67, 209, 122, 0.15); color: var(--ok); }
  .pill.closed { background: var(--hover-2); color: var(--muted); }

  .actions { gap: 7px; }
  .sub { width: 100%; height: 34px; }
  .report { height: 30px; font-size: 12px; }

  .composer { border-top: 2px solid var(--accent); }
  .composer h3 { margin: 0; font-size: 14px; }
  .composer textarea {
    width: 100%;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--bg-soft);
    color: var(--text);
    font: inherit;
    font-size: 13px;
    padding: 10px 12px;
    resize: vertical;
    outline: none;
  }
  .composer textarea:focus { border-color: var(--accent); }
  .composer-foot { display: flex; justify-content: flex-end; }

  .primary, .ghost {
    display: inline-flex; align-items: center; justify-content: center;
    border-radius: var(--radius-sm); font: inherit; font-weight: 600; cursor: pointer;
  }
  .primary { border: 1px solid transparent; background: var(--btn-bg); color: var(--btn-ink); box-shadow: inset 0 1px 0 rgba(255,255,255,0.3), var(--btn-glow); }
  .primary:hover { background: var(--btn-bg-hover); }
  .primary:disabled { opacity: 0.5; cursor: default; }
  .ghost { border: 1px solid var(--line); background: var(--panel-2); color: var(--text); }
  .ghost:hover { background: var(--panel-3); }

  @media (max-width: 760px) {
    .gp-grid { grid-template-columns: 1fr; }
    .gp-side { position: static; }
  }
</style>