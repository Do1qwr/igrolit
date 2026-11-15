<script lang="ts">
  import { onMount } from 'svelte';
  import Icon from './Icon.svelte';
  import {
    online,
    sendSupport,
    requestMyTickets,
    requestSupportAll,
    replyTicket,
    closeTicket,
    type Ticket,
  } from '../lib/online';
  import { LEGAL_DOCS, type LegalDoc } from '../lib/legal';

  export let onOpenAuth: (mode: 'login' | 'register') => void = () => {};

  let doc: LegalDoc | null = null;
  let kind = 'wish';
  let text = '';
  let status = '';
  let replyText: Record<string, string> = {};

  $: authed = $online.authed;
  $: isAdmin = $online.isAdmin;
  $: myTickets = $online.myTickets ?? [];
  $: allTickets = $online.allTickets ?? [];
  $: openTickets = allTickets.filter((ticket) => ticket.status !== 'closed');

  const KIND_LABEL: Record<string, string> = {
    problem: 'Проблема',
    wish: 'Пожелание',
    other: 'Другое',
  };

  function kindLabel(value: string): string {
    return KIND_LABEL[value] || 'Другое';
  }

  function closeDoc(event: KeyboardEvent) {
    if (event.key === 'Escape') doc = null;
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

  function submit() {
    status = '';
    if (!text.trim()) {
      status = 'Напишите сообщение';
      return;
    }
    sendSupport(kind, text);
    text = '';
    status = 'Отправляю…';
  }

  function answer(ticket: Ticket) {
    const body = (replyText[ticket.id] || '').trim();
    if (!body) {
      status = 'Введите ответ';
      return;
    }
    replyTicket(ticket.id, body);
    replyText = { ...replyText, [ticket.id]: '' };
    status = 'Ответ отправлен';
  }

  let wasAuthed = false;
  let sentSeen = $online.supportSent;

  $: if (authed && !wasAuthed) {
    wasAuthed = true;
    requestMyTickets();
    if (isAdmin) requestSupportAll();
  }
  $: if (!authed) wasAuthed = false;

  $: if ($online.supportSent !== sentSeen) {
    sentSeen = $online.supportSent;
    if (authed) status = 'Обращение отправлено';
  }

  onMount(() => {
    if ($online.authed) {
      requestMyTickets();
      if ($online.isAdmin) requestSupportAll();
    }
  });
</script>

<svelte:window on:keydown={closeDoc} />

<div class="support">
  <header class="sup-head">
    <div>
      <h2>Поддержка</h2>
      <p class="muted small">
        Опишите проблему или пришлите пожелание — администратор ответит прямо здесь.
      </p>
    </div>
    {#if authed}
      <button class="ghost" on:click={() => { requestMyTickets(); if (isAdmin) requestSupportAll(); }}>
        Обновить
      </button>
    {/if}
  </header>

  {#if status}<p class="status">{status}</p>{/if}
  {#if $online.error}<p class="status err">{$online.error}</p>{/if}

  <section class="panel">
    <div class="sect-head">
      <h3>Документы и правила</h3>
      <span class="muted small">{LEGAL_DOCS.length}</span>
    </div>
    <div class="docs-grid">
      {#each LEGAL_DOCS as item (item.id)}
        <button class="doc-btn" on:click={() => (doc = item)}>
          <span class="doc-title">{item.title}</span>
          <span class="muted small">{item.sub}</span>
        </button>
      {/each}
    </div>
  </section>

  {#if !authed}
    <section class="panel">
      <h3>Нужен вход</h3>
      <p class="muted small">Чтобы написать в поддержку, войдите в онлайн-аккаунт.</p>
      <button class="primary" on:click={() => onOpenAuth('login')}>Войти</button>
    </section>
  {:else}
    <section class="panel">
      <h3>Написать в поддержку</h3>
      <div class="form-row">
        <div class="field kind">
          <label for="sup-kind">Тема</label>
          <select id="sup-kind" bind:value={kind}>
            <option value="wish">Пожелание</option>
            <option value="problem">Проблема</option>
            <option value="other">Другое</option>
          </select>
        </div>
        <div class="field grow">
          <label for="sup-text">Сообщение</label>
          <textarea
            id="sup-text"
            bind:value={text}
            rows="4"
            maxlength="2000"
            placeholder="Что случилось или что хотелось бы улучшить"
          ></textarea>
        </div>
      </div>
      <div class="actions">
        <button class="primary" on:click={submit}>Отправить</button>
      </div>
    </section>

    <section class="panel">
      <div class="sect-head">
        <h3>Мои обращения</h3>
        <span class="muted small">{myTickets.length}</span>
      </div>
      {#if myTickets.length === 0}
        <p class="muted small">Пока нет обращений.</p>
      {:else}
        {#each myTickets as ticket (ticket.id)}
          <div class="ticket">
            <div class="ticket-head">
              <span class="tag">{kindLabel(ticket.kind)}</span>
              <span class="tag status-tag" class:closed={ticket.status === 'closed'}>
                {ticket.status === 'closed' ? 'закрыто' : 'открыто'}
              </span>
              <span class="muted small">{when(ticket.ts)}</span>
            </div>
            <p class="ticket-text">{ticket.text}</p>
            {#if ticket.replies.length > 0}
              <div class="replies">
                {#each ticket.replies as reply (reply.ts + reply.by)}
                  <div class="reply">
                    <div class="reply-head">
                      <Icon name="shield" size={13} />
                      <strong>{reply.by}</strong>
                      <span class="muted small">{when(reply.ts)}</span>
                    </div>
                    <p>{reply.text}</p>
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        {/each}
      {/if}
    </section>

    {#if isAdmin}
      <section class="panel">
        <div class="sect-head">
          <h3>Обращения игроков</h3>
          <span class="muted small">{openTickets.length} открытых из {allTickets.length}</span>
        </div>
        {#if allTickets.length === 0}
          <p class="muted small">Обращений нет.</p>
        {:else}
          {#each allTickets as ticket (ticket.id)}
            <div class="ticket admin-ticket">
              <div class="ticket-head">
                <span class="tag">{kindLabel(ticket.kind)}</span>
                <span class="tag status-tag" class:closed={ticket.status === 'closed'}>
                  {ticket.status === 'closed' ? 'закрыто' : 'открыто'}
                </span>
                <strong>{ticket.from}</strong>
                <span class="muted small">{when(ticket.ts)}</span>
              </div>
              <p class="ticket-text">{ticket.text}</p>
              {#if ticket.replies.length > 0}
                <div class="replies">
                  {#each ticket.replies as reply (reply.ts + reply.by)}
                    <div class="reply">
                      <div class="reply-head">
                        <Icon name="shield" size={13} />
                        <strong>{reply.by}</strong>
                        <span class="muted small">{when(reply.ts)}</span>
                      </div>
                      <p>{reply.text}</p>
                    </div>
                  {/each}
                </div>
              {/if}
              {#if ticket.status !== 'closed'}
                <div class="reply-form">
                  <input
                    bind:value={replyText[ticket.id]}
                    placeholder="Ответ игроку"
                    maxlength="2000"
                  />
                  <button class="primary" on:click={() => answer(ticket)}>Ответить</button>
                  <button class="ghost" on:click={() => { closeTicket(ticket.id); status = 'Обращение закрыто'; }}>
                    Закрыть
                  </button>
                </div>
              {/if}
            </div>
          {/each}
        {/if}
      </section>
    {/if}
  {/if}

  {#if doc}
    <div class="doc-overlay" role="presentation" on:click|self={() => (doc = null)}>
      <div class="doc-modal" role="dialog" aria-modal="true" aria-label={doc.title}>
        <div class="doc-head">
          <div>
            <h3>{doc.title}</h3>
            <span class="muted small">{doc.sub}</span>
          </div>
          <button class="ghost" on:click={() => (doc = null)}>Закрыть</button>
        </div>
        <div class="doc-body">
          {#each doc.blocks as block}
            {#if block.t === 'h'}
              <h4>{block.text}</h4>
            {:else if block.t === 'ul'}
              <ul>
                {#each block.items ?? [] as item}
                  <li>{item}</li>
                {/each}
              </ul>
            {:else if block.t === 'kv'}
              <table>
                {#each block.rows ?? [] as row}
                  <tr><th>{row[0]}</th><td>{row[1]}</td></tr>
                {/each}
              </table>
            {:else if block.t === 'note'}
              <div class="doc-note">{block.text}</div>
            {:else}
              <p>{block.text}</p>
            {/if}
          {/each}
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .support { display: flex; flex-direction: column; gap: 14px; padding: 20px 24px; width: 100%; max-width: none; box-sizing: border-box; }
  .sup-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
  .sup-head h2 { margin: 0; font-size: 20px; }
  .sup-head .muted { margin: 4px 0 0; }
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
  .sect-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }

  .form-row { display: flex; gap: 10px; align-items: flex-start; flex-wrap: wrap; }
  .field { display: flex; flex-direction: column; gap: 5px; }
  .field.kind { width: 180px; }
  .field.grow { flex: 1; min-width: 240px; }
  .field label { font-size: 11.5px; font-weight: 600; color: var(--muted); }
  .field select,
  .field textarea {
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--bg-soft);
    color: var(--text);
    font: inherit;
    font-size: 12.5px;
    padding: 9px 11px;
  }
  .field select { height: 36px; padding: 0 10px; }
  .field textarea { resize: vertical; min-height: 96px; }
  .field select:focus,
  .field textarea:focus { outline: none; border-color: var(--accent); }
  .actions { display: flex; justify-content: flex-end; }

  .ticket {
    display: flex;
    flex-direction: column;
    gap: 7px;
    padding: 11px 12px;
    border: 1px solid var(--line);
    border-radius: 10px;
  }
  .ticket-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .tag {
    padding: 1px 8px;
    border-radius: 999px;
    background: var(--accent-soft);
    color: var(--accent);
    font-size: 10.5px;
    font-weight: 600;
  }
  .status-tag { background: rgba(67, 209, 122, 0.15); color: var(--ok); }
  .status-tag.closed { background: var(--hover-2); color: var(--muted); }
  .ticket-text { margin: 0; font-size: 13px; white-space: pre-wrap; overflow-wrap: anywhere; }

  .replies { display: flex; flex-direction: column; gap: 6px; padding-left: 10px; border-left: 2px solid var(--line); }
  .reply { display: flex; flex-direction: column; gap: 2px; }
  .reply-head { display: flex; align-items: center; gap: 6px; color: var(--accent); font-size: 12px; }
  .reply p { margin: 0; font-size: 12.5px; color: var(--text); white-space: pre-wrap; overflow-wrap: anywhere; }

  .reply-form { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .reply-form input {
    flex: 1;
    min-width: 200px;
    height: 34px;
    padding: 0 10px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--bg-soft);
    color: var(--text);
    font: inherit;
    font-size: 12.5px;
  }
  .reply-form input:focus { outline: none; border-color: var(--accent); }

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
    transition: background 0.14s ease, border-color 0.14s ease, filter 0.14s ease;
  }
  .primary {
    border: 1px solid transparent;
    background: var(--btn-bg);
    color: var(--btn-ink);
    font-weight: 680;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.3), var(--btn-glow);
  }
  .primary:hover {
    background: var(--btn-bg-hover);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.38), 0 4px 14px rgba(90, 139, 255, 0.3);
  }
  .ghost {
    border: 1px solid var(--line);
    background: var(--panel-2);
    color: var(--text);
  }
  .ghost:hover { background: var(--panel-3); border-color: var(--muted-2); }

  .status { margin: 0; padding: 8px 12px; border-radius: 8px; background: var(--hover-2); font-size: 12.5px; }
  .status.err { background: rgba(239, 91, 91, 0.14); color: var(--danger); }

  .docs-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 7px; }
  .doc-btn {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 3px;
    text-align: left;
    padding: 9px 11px;
    border: 1px solid var(--line);
    border-radius: 9px;
    background: var(--panel-2);
    color: var(--text);
    font: inherit;
    cursor: pointer;
    transition: border-color 0.14s ease, background 0.14s ease;
  }
  .doc-btn:hover { border-color: var(--accent); background: var(--panel-3); }
  .doc-title { font-size: 12.5px; font-weight: 600; }

  .doc-overlay {
    position: fixed;
    inset: 0;
    z-index: 40;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    background: rgba(4, 6, 16, 0.72);
    backdrop-filter: blur(3px);
  }
  .doc-modal {
    width: min(760px, 100%);
    max-height: 82vh;
    display: flex;
    flex-direction: column;
    border: 1px solid var(--line);
    border-radius: 14px;
    background: var(--panel);
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.55);
    overflow: hidden;
  }
  .doc-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    padding: 14px 16px;
    border-bottom: 1px solid var(--line);
  }
  .doc-head h3 { margin: 0 0 2px; font-size: 14.5px; }
  .doc-body { padding: 14px 16px 18px; overflow-y: auto; font-size: 12.5px; line-height: 1.62; }
  .doc-body h4 { margin: 16px 0 6px; font-size: 12.5px; color: var(--text); }
  .doc-body h4:first-child { margin-top: 0; }
  .doc-body p { margin: 0 0 9px; color: var(--text); }
  .doc-body ul { margin: 0 0 10px; padding-left: 20px; }
  .doc-body li { margin-bottom: 5px; }
  .doc-body table { width: 100%; border-collapse: collapse; margin: 6px 0 12px; }
  .doc-body th,
  .doc-body td { text-align: left; padding: 6px 8px; border: 1px solid var(--line); vertical-align: top; }
  .doc-body th { width: 42%; color: var(--muted); font-weight: 600; }
  .doc-note {
    margin: 10px 0;
    padding: 9px 11px;
    border-left: 3px solid var(--gold);
    border-radius: 8px;
    background: rgba(217, 161, 59, 0.1);
  }

  @media (max-width: 860px) {
    .field.kind { width: 100%; }
    .doc-overlay { padding: 12px; }
    .doc-modal { max-height: 88vh; }
  }
</style>
