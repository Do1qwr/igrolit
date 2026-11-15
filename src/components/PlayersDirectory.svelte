<script lang="ts">
  import { onMount } from 'svelte';
  import { online, requestPlayers } from '../lib/online';
  import Icon from './Icon.svelte';
  import banner from '../assets/directory-banner.jpg';

  export let onOpenProfile: (name: string) => void = () => {};

  const SORTS = [
    { id: 'playtime', label: 'Временем в играх' },
    { id: 'games', label: 'Коллекцией игр' },
    { id: 'followers', label: 'Подписчиками' },
    { id: 'rating', label: 'Репутацией' },
    { id: 'online', label: 'Онлайном' },
    { id: 'name', label: 'Именем' },
  ];

  const AVATAR_COLORS = ['#4f7cff', '#3fb98a', '#b06cf0', '#e06a9b', '#e0a34f', '#4fbfd0'];

  let q = '';
  let sort = 'playtime';
  let gender = '';
  let city = '';
  let country = '';
  let timer: ReturnType<typeof setTimeout> | null = null;

  function load(offset = 0) {
    requestPlayers({ q: q.trim(), sort, gender, city: city.trim(), country, limit: 30, offset });
  }

  function debounced() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => load(), 350);
  }

  function apply() {
    load();
  }

  function reset() {
    q = '';
    gender = '';
    city = '';
    country = '';
    sort = 'playtime';
    load();
  }

  onMount(() => {
    load();
  });

  $: dir = $online.directory;
  $: items = dir.items;
  $: canMore = items.length < dir.total;

  function num(n: number) {
    return (n || 0).toLocaleString('ru-RU');
  }

  function playtime(min: number) {
    if (!min) return '0 ч';
    const h = Math.floor(min / 60);
    const m = min % 60;
    return h ? `${h} ч ${m} мин` : `${m} мин`;
  }

  function initials(name: string) {
    return (name || '?').slice(0, 2).toUpperCase();
  }

  function hue(name: string) {
    let s = 0;
    for (const ch of name || '') s += ch.charCodeAt(0);
    return AVATAR_COLORS[s % AVATAR_COLORS.length];
  }
</script>

<div class="dir">
  <header class="dir-hero" style="background-image: url({banner})">
    <div class="dir-hero-in">
      <p class="dir-kicker">Сообщество лаунчера</p>
      <h1>Уже на Игротеке</h1>
      <p class="dir-sub">
        Найдите друзей по игре, городу или интересам — здесь {num(dir.total)} игроков.
      </p>
      <label class="dir-search">
        <Icon name="search" size={17} />
        <input
          placeholder="Введите никнейм"
          bind:value={q}
          on:input={debounced}
          on:keydown={(e) => e.key === 'Enter' && apply()}
        />
        {#if q}
          <button class="dir-clear" title="Очистить" on:click={() => { q = ''; apply(); }}>×</button>
        {/if}
      </label>
    </div>
  </header>

  <div class="dir-body">
    <div class="dir-main">
      <div class="dir-toolbar">
        <div class="dir-title">
          <span class="slash">/</span>
          <h2>Все игроки</h2>
          <span class="dir-total">{num(dir.total)}</span>
        </div>
        <label class="dir-sort">
          <span>Сортировать по:</span>
          <select bind:value={sort} on:change={apply}>
            {#each SORTS as s}
              <option value={s.id}>{s.label}</option>
            {/each}
          </select>
        </label>
      </div>

      {#if dir.loading && !items.length}
        <div class="dir-empty">Загружаем игроков…</div>
      {:else if !items.length}
        <div class="dir-empty">
          <strong>Никого не нашли</strong>
          <span>Попробуйте другой никнейм или сбросьте фильтры.</span>
        </div>
      {:else}
        <div class="dir-grid">
          {#each items as p (p.name)}
            <article class="pcard">
              <div class="pcard-top">
                <div class="pcard-ava" style="background: {p.avatar ? 'transparent' : hue(p.name)}">
                  {#if p.avatar}
                    <img src={p.avatar} alt="" />
                  {:else}
                    <span>{initials(p.display || p.name)}</span>
                  {/if}
                </div>
                <div class="pcard-id">
                  <strong>{p.display || p.name}</strong>
                  <span class="pill" class:on={p.online}>
                    <i></i>{p.online ? 'В сети' : 'Не в сети'}
                  </span>
                </div>
              </div>

              {#if p.hiddenProfile}
                <div class="pcard-stats hidden">
                  <div><b>—</b><span>Подписчики</span></div>
                  <div><b>—</b><span>Подписки</span></div>
                  <div><b>—</b><span>Всего игр</span></div>
                </div>
                <div class="pcard-meta locked">Профиль скрыт настройками приватности</div>
              {:else}
                <div class="pcard-stats">
                  <div><b>{num(p.followers)}</b><span>Подписчики</span></div>
                  <div><b>{num(p.following)}</b><span>Подписки</span></div>
                  <div><b>{num(p.games)}</b><span>Всего игр</span></div>
                </div>

                <div class="pcard-meta">
                  {#if p.city || p.country}
                    {p.city}{p.city && p.country ? ', ' : ''}{p.country}
                  {:else}
                    Город не указан
                  {/if}
                  {#if p.minutes}
                    <em>· {playtime(p.minutes)}</em>
                  {/if}
                </div>
              {/if}

              <button class="pcard-open" on:click={() => onOpenProfile(p.name)}>Открыть профиль</button>
            </article>
          {/each}
        </div>

        {#if canMore}
          <button class="dir-more" on:click={() => load(items.length)} disabled={dir.loading}>
            {dir.loading ? 'Загружаем…' : 'Показать ещё'}
          </button>
        {/if}
      {/if}
    </div>

    <aside class="dir-filters">
      <h3>Фильтры</h3>

      <div class="f-block">
        <p class="f-label">Пол</p>
        <label class="f-radio"><input type="radio" bind:group={gender} value="" on:change={apply} /> Любой</label>
        <label class="f-radio"><input type="radio" bind:group={gender} value="m" on:change={apply} /> Мужской</label>
        <label class="f-radio"><input type="radio" bind:group={gender} value="f" on:change={apply} /> Женский</label>
      </div>

      <div class="f-block">
        <p class="f-label">Город</p>
        <input class="f-input" placeholder="Город" bind:value={city} on:change={apply} list="dir-cities" />
        <datalist id="dir-cities">
          {#each dir.cities as c}
            <option value={c}></option>
          {/each}
        </datalist>
      </div>

      <div class="f-block">
        <p class="f-label">Страна</p>
        <select class="f-input" bind:value={country} on:change={apply}>
          <option value="">Выберите страну</option>
          {#each dir.countries as c}
            <option value={c}>{c}</option>
          {/each}
        </select>
      </div>

      <button class="f-reset" on:click={reset}>Сбросить фильтры</button>
    </aside>
  </div>
</div>

<style>
  .dir { display: flex; flex-direction: column; gap: 18px; width: 100%; }

  .dir-hero {
    position: relative;
    border: 1px solid var(--line);
    border-radius: 16px;
    overflow: hidden;
    background-size: cover;
    background-position: center;
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.04);
  }
  .dir-hero::before {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(90deg, rgba(10, 14, 24, 0.94) 0%, rgba(10, 14, 24, 0.72) 48%, rgba(10, 14, 24, 0.24) 100%);
  }
  .dir-hero-in {
    position: relative;
    padding: 30px 32px 32px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .dir-kicker {
    margin: 0;
    font-size: 11px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--muted-2);
  }
  .dir-hero h1 {
    margin: 0;
    font-size: 34px;
    line-height: 1.05;
    letter-spacing: -0.02em;
    font-weight: 800;
    color: var(--text);
  }
  .dir-sub { margin: 0; font-size: 13.5px; color: var(--muted); max-width: 620px; }

  .dir-search {
    margin-top: 6px;
    display: flex;
    align-items: center;
    gap: 10px;
    max-width: 720px;
    padding: 0 14px;
    height: 44px;
    border: 1px solid var(--line);
    border-radius: 11px;
    background: rgba(12, 17, 28, 0.82);
    color: var(--muted);
  }
  .dir-search:focus-within { border-color: var(--accent); }
  .dir-search input {
    flex: 1;
    min-width: 0;
    border: 0;
    outline: none;
    background: transparent;
    color: var(--text);
    font: inherit;
    font-size: 13.5px;
  }
  .dir-search input::placeholder { color: var(--muted-2); }
  .dir-clear {
    border: 0;
    background: transparent;
    color: var(--muted);
    font-size: 18px;
    line-height: 1;
    cursor: pointer;
    padding: 0 2px;
  }
  .dir-clear:hover { color: var(--text); }

  .dir-body {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 300px;
    gap: 18px;
    align-items: start;
  }
  .dir-main { min-width: 0; display: flex; flex-direction: column; gap: 14px; }

  .dir-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    flex-wrap: wrap;
  }
  .dir-title { display: flex; align-items: center; gap: 10px; }
  .dir-title .slash { color: var(--danger, #e05a6a); font-size: 22px; font-weight: 800; line-height: 1; }
  .dir-title h2 { margin: 0; font-size: 20px; font-weight: 750; letter-spacing: -0.01em; }
  .dir-total {
    padding: 3px 10px;
    border: 1px solid var(--line);
    border-radius: 8px;
    font-size: 12.5px;
    font-weight: 650;
    color: var(--text);
    background: var(--panel-2);
  }

  .dir-sort { display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: var(--muted); }
  .dir-sort select {
    height: 36px;
    padding: 0 34px 0 12px;
    border: 1px solid var(--line);
    border-radius: 9px;
    background: var(--panel-2) url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238a93a6' stroke-width='2.4'><path d='M5 9l7 7 7-7'/></svg>") no-repeat right 12px center;
    color: var(--text);
    font: inherit;
    font-size: 12.5px;
    appearance: none;
    cursor: pointer;
  }
  .dir-sort select:focus { outline: none; border-color: var(--accent); }

  .dir-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 14px;
  }

  .pcard {
    display: flex;
    flex-direction: column;
    border: 1px solid var(--line);
    border-radius: 13px;
    background: var(--panel);
    overflow: hidden;
  }
  .pcard-top { display: flex; align-items: center; gap: 12px; padding: 16px 16px 12px; }
  .pcard-ava {
    width: 54px;
    height: 54px;
    flex: 0 0 54px;
    border-radius: 11px;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fff;
    font-weight: 750;
    font-size: 17px;
  }
  .pcard-ava img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .pcard-id { min-width: 0; display: flex; flex-direction: column; gap: 6px; }
  .pcard-id strong {
    font-size: 14px;
    font-weight: 700;
    color: var(--text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    align-self: flex-start;
    padding: 2px 9px;
    border: 1px solid var(--line);
    border-radius: 999px;
    font-size: 11px;
    color: var(--muted);
    background: var(--panel-2);
  }
  .pill i { width: 6px; height: 6px; border-radius: 50%; background: var(--muted-2); display: block; }
  .pill.on { color: #79e0a8; border-color: rgba(63, 185, 138, 0.45); background: rgba(63, 185, 138, 0.12); }
  .pill.on i { background: #46d18c; }

  .pcard-stats {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 6px;
    padding: 4px 16px 12px;
  }
  .pcard-stats div { display: flex; flex-direction: column; gap: 2px; align-items: center; }
  .pcard-stats b { font-size: 15px; font-weight: 700; color: var(--text); }
  .pcard-stats span { font-size: 10.5px; color: var(--muted-2); text-align: center; }
  .pcard-stats.hidden b { color: var(--muted-2); }
  .pcard-meta.locked { color: var(--muted); font-style: italic; }

  .pcard-meta {
    padding: 0 16px 12px;
    font-size: 11.5px;
    color: var(--muted-2);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .pcard-meta em { font-style: normal; color: var(--muted); }

  .pcard-open {
    margin-top: auto;
    height: 38px;
    border: 0;
    border-top: 1px solid var(--line);
    background: var(--panel-2);
    color: var(--text);
    font: inherit;
    font-size: 12.5px;
    font-weight: 650;
    cursor: pointer;
  }
  .pcard-open:hover { background: var(--hover, #232c3c); color: var(--accent); }

  .dir-more {
    align-self: center;
    margin-top: 4px;
    padding: 10px 22px;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--panel-2);
    color: var(--text);
    font: inherit;
    font-size: 12.5px;
    font-weight: 650;
    cursor: pointer;
  }
  .dir-more:disabled { opacity: 0.6; cursor: default; }

  .dir-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 54px 20px;
    border: 1px dashed var(--line);
    border-radius: 13px;
    color: var(--muted);
    font-size: 13px;
  }
  .dir-empty strong { color: var(--text); font-size: 14px; }

  .dir-filters {
    position: sticky;
    top: 12px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 18px;
    border: 1px solid var(--line);
    border-radius: 14px;
    background: var(--panel);
  }
  .dir-filters h3 { margin: 0; font-size: 15px; font-weight: 700; color: var(--text); }
  .f-block { display: flex; flex-direction: column; gap: 8px; }
  .f-label { margin: 0; font-size: 12px; font-weight: 650; color: var(--muted); }
  .f-radio { display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: var(--text); cursor: pointer; }
  .f-radio input { accent-color: var(--accent); width: 14px; height: 14px; }
  .f-input {
    width: 100%;
    height: 38px;
    padding: 0 12px;
    border: 1px solid var(--line);
    border-radius: 9px;
    background: var(--panel-2);
    color: var(--text);
    font: inherit;
    font-size: 12.5px;
  }
  .f-input:focus { outline: none; border-color: var(--accent); }
  .f-input::placeholder { color: var(--muted-2); }
  .f-reset {
    height: 38px;
    border: 1px solid var(--line);
    border-radius: 9px;
    background: var(--panel-2);
    color: var(--muted);
    font: inherit;
    font-size: 12.5px;
    font-weight: 600;
    cursor: pointer;
  }
  .f-reset:hover { color: var(--text); border-color: var(--accent); }

  @media (max-width: 1240px) {
    .dir-body { grid-template-columns: minmax(0, 1fr); }
    .dir-filters { position: static; order: -1; }
  }
  @media (max-width: 900px) {
    .dir-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }
  @media (max-width: 680px) {
    .dir-grid { grid-template-columns: minmax(0, 1fr); }
    .dir-hero-in { padding: 22px; }
    .dir-hero h1 { font-size: 26px; }
  }
</style>
