<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import Icon from './Icon.svelte';
  import Logo from './Logo.svelte';
  import { online, login, submitTwofa, resetTwofa } from '../lib/online';
  import { LEGAL_DOCS, type LegalDoc } from '../lib/legal';

  export let initialMode: 'login' | 'register' = 'login';

  const dispatch = createEventDispatcher<{ close: void }>();

  let mode: 'login' | 'register' = initialMode;
  let srv = $online.server || 'ws://127.0.0.1:8787';
  let user = '';
  let pass = '';
  let pass2 = '';
  let email = '';
  let email2 = '';
  let remember = true;
  let consent = false;
  let openDoc: LegalDoc | null = null;
  let notRobot = false;
  let serverOpen = false;
  let status = '';
  let closing = false;
  let code2fa = '';

  $: authed = $online.authed;
  $: busy = $online.busy;
  $: need2fa = $online.auth2fa;
  $: if (authed && !closing) {
    closing = true;
    setTimeout(() => dispatch('close'), 300);
  }

  function switchMode(next: 'login' | 'register') {
    mode = next;
    status = '';
    pass2 = '';
    email = '';
    email2 = '';
  }

  function submit() {
    status = '';
    if (!srv.trim()) {
      status = 'Укажите адрес сервера';
      return;
    }
    if (!user.trim()) {
      status = 'Укажите имя аккаунта';
      return;
    }
    if (!/^[A-Za-zА-Яа-яЁё0-9_]{3,20}$/.test(user.trim())) {
      status = 'Имя аккаунта: 3–20 символов, русские или латинские буквы, цифры или _';
      return;
    }
    if (!pass) {
      status = 'Введите пароль';
      return;
    }
    if (pass.length < 8) {
      status = 'Пароль — от 8 символов';
      return;
    }
    if (mode === 'register') {
      if (email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email.trim())) {
        status = 'Проверьте адрес эл. почты';
        return;
      }
      if (email.trim() && email.trim() !== email2.trim()) {
        status = 'Адреса эл. почты не совпадают';
        return;
      }
      if (pass !== pass2) {
        status = 'Пароли не совпадают';
        return;
      }
      if (!consent) {
        status = 'Примите соглашение и политику обработки данных';
        return;
      }
      if (!notRobot) {
        status = 'Отметьте «Я не робот»';
        return;
      }
    }
    login(mode, srv, user, pass, {
      email: mode === 'register' ? email.trim() : undefined,
      remember,
      consent: mode === 'register' ? consent : undefined,
    });
  }

  function docById(id: string): LegalDoc {
    return LEGAL_DOCS.find((item) => item.id === id) ?? LEGAL_DOCS[0];
  }

  function provider(name: string) {
    status = `Вход через ${name} не настроен: нужны OAuth-ключи на сервере. Создайте обычный аккаунт — это бесплатно.`;
  }

  function closeOnBackdrop(event: MouseEvent) {
    if (event.target === event.currentTarget) dispatch('close');
  }

  function closeDocOnBackdrop(event: MouseEvent) {
    if (event.target === event.currentTarget) openDoc = null;
  }

</script>

<svelte:window
  on:keydown={(event) => {
    if (event.key !== 'Escape') return;
    if (openDoc) openDoc = null;
    else dispatch('close');
  }}
/>

<button
  type="button"
  class="auth-backdrop"
  aria-label="Закрыть окно входа"
  on:click={closeOnBackdrop}
>
  <div
    class="auth-panel"
    role="dialog"
    aria-modal="true"
    aria-label={mode === 'login' ? 'Вход' : 'Создание аккаунта'}
  >
    <div class="auth-top">
      <button class="back" title="Назад" aria-label="Закрыть" on:click={() => dispatch('close')}>‹</button>
      <span class="logo" aria-hidden="true"><Logo size={20} /></span>
      <strong>Igrolit</strong>
    </div>

    {#if need2fa}
      <h2 class="auth-title">Подтверждение входа</h2>
      <p class="hint">Введите 6-значный код из приложения-аутентификатора.</p>
      <div class="field">
        <label for="af-2fa">Код</label>
        <input
          id="af-2fa"
          bind:value={code2fa}
          placeholder="000000"
          maxlength="6"
          inputmode="numeric"
          spellcheck="false"
        />
      </div>
      {#if $online.error}<p class="msg err">{$online.error}</p>{/if}
      <button class="primary big" disabled={busy} on:click={() => submitTwofa(code2fa)}>
        {busy ? 'Проверяю…' : 'Подтвердить'}
      </button>
      <div class="foot">
        <button class="link" on:click={() => { code2fa = ''; resetTwofa(); }}>Назад ко входу</button>
      </div>
    {:else}
    <h2 class="auth-title">
      {mode === 'login' ? 'Войдите, используя имя аккаунта' : 'Создание аккаунта'}
    </h2>

    {#if mode === 'register'}
      <p class="hint">Бесплатно. Письмо с подтверждением не отправляется — аккаунт работает сразу.</p>

      <div class="field">
        <label for="af-email">Адрес эл. почты</label>
        <input id="af-email" bind:value={email} placeholder="можно оставить пустым" spellcheck="false" autocomplete="email" />
      </div>
      <div class="field">
        <label for="af-email2">Подтвердите адрес эл. почты</label>
        <input id="af-email2" bind:value={email2} placeholder="повторите адрес" spellcheck="false" autocomplete="email" />
      </div>
    {/if}

    <div class="field">
      <label for="af-user">Имя аккаунта</label>
      <input
        id="af-user"
        bind:value={user}
        placeholder="3–20 символов, русские или латинские"
        maxlength="20"
        spellcheck="false"
        autocomplete="username"
      />
    </div>

    <div class="field">
      <label for="af-pass">Пароль</label>
      <input
        id="af-pass"
        type="password"
        bind:value={pass}
        placeholder="от 8 символов"
        autocomplete={mode === 'login' ? 'current-password' : 'new-password'}
      />
    </div>

    {#if mode === 'register'}
      <div class="field">
        <label for="af-pass2">Повторите пароль</label>
        <input id="af-pass2" type="password" bind:value={pass2} placeholder="ещё раз" autocomplete="new-password" />
      </div>

      <label class="check">
        <input type="checkbox" bind:checked={consent} />
        <span>
          Я принимаю <button type="button" class="link inline" on:click={() => (openDoc = docById('agreement'))}>соглашение</button>
          и <button type="button" class="link inline" on:click={() => (openDoc = docById('privacy'))}>политику обработки данных</button>
        </span>
      </label>
      <label class="check">
        <input type="checkbox" bind:checked={notRobot} />
        <span>Я не робот</span>
      </label>
    {:else}
      <div class="row">
        <label class="check">
          <input type="checkbox" bind:checked={remember} />
          <span>Запомнить меня</span>
        </label>
        <button class="link" on:click={() => (serverOpen = !serverOpen)}>
          {serverOpen ? 'Скрыть сервер' : 'Сменить сервер'}
        </button>
      </div>
    {/if}

    {#if serverOpen || mode === 'register'}
      <div class="field">
        <label for="af-srv">Сервер</label>
        <input id="af-srv" bind:value={srv} placeholder="ws://127.0.0.1:8787" spellcheck="false" />
      </div>
    {/if}

    {#if status}<p class="msg err">{status}</p>{/if}
    {#if $online.error}<p class="msg err">{$online.error}</p>{/if}

    <button class="primary big" disabled={busy || authed} on:click={submit}>
      {busy ? 'Подключение…' : mode === 'login' ? 'Войти' : 'Создать аккаунт'}
    </button>

    <div class="providers">
      <div class="or"><span>или</span></div>
      <button class="ghost prov" on:click={() => provider('Яндексом')}>
        <span class="prov-badge ya">Я</span>
        Продолжить с Яндексом
      </button>
      <button class="ghost prov" on:click={() => provider('Google')}>
        <span class="prov-badge go">G</span>
        Продолжить с Google
      </button>
    </div>

    <div class="foot">
      {#if mode === 'login'}
        <button class="link" on:click={() => switchMode('register')}>Нет аккаунта? Создать</button>
      {:else}
        <button class="link" on:click={() => switchMode('login')}>Уже есть аккаунт? Войти</button>
      {/if}
    </div>
    {/if}
  </div>
</button>

{#if openDoc}
  <button
    type="button"
    class="doc-backdrop"
    aria-label="Закрыть документ"
    on:click={closeDocOnBackdrop}
  >
    <div
      class="doc-panel"
      role="dialog"
      aria-modal="true"
      aria-label={openDoc.title}
    >
      <div class="doc-head">
        <strong>{openDoc.title}</strong>
        <button class="link" on:click={() => (openDoc = null)}>Закрыть</button>
      </div>
      <div class="doc-body">
        {#each openDoc.blocks as block}
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
  </button>
{/if}


<style>
  .auth-backdrop {
    position: fixed;
    inset: 0;
    z-index: 200;
    display: grid;
    place-items: center;
    padding: 24px;
    border: 0;
    font: inherit;
    color: inherit;
    text-align: left;
    cursor: default;
    background: rgba(6, 8, 12, 0.72);
    backdrop-filter: blur(3px);
  }
  .auth-panel {
    width: 460px;
    max-width: 100%;
    max-height: calc(100vh - 48px);
    overflow-y: auto;
    padding: 24px 26px 20px;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 14px;
    box-shadow: 0 24px 64px rgba(0, 0, 0, 0.6);
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .auth-top { display: flex; align-items: center; gap: 10px; }
  .back {
    width: 30px;
    height: 30px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--panel-2);
    color: var(--text);
    font-size: 18px;
    line-height: 1;
    cursor: pointer;
  }
  .back:hover { background: var(--panel-3); }
  .logo {
    width: 30px;
    height: 30px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: var(--accent-soft);
    color: var(--accent);
  }
  .auth-top strong { font-size: 16px; letter-spacing: 0.4px; }
  .auth-title {
    margin: 6px 0 2px;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.09em;
    text-transform: uppercase;
    color: var(--accent);
  }
  .hint { margin: 0 0 2px; font-size: 12px; color: var(--muted); }

  .field { display: flex; flex-direction: column; gap: 6px; }
  .field label {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .field input {
    height: 42px;
    padding: 0 12px;
    border: 1px solid var(--line);
    border-radius: 7px;
    background: var(--panel-2);
    color: var(--text);
    font: inherit;
    font-size: 13px;
    width: 100%;
  }
  .field input::placeholder { color: var(--muted-2); }
  .field input:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 0 2px var(--accent-soft);
  }

  .row { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
  .check {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    font-size: 12px;
    color: var(--muted);
    cursor: pointer;
    line-height: 1.35;
  }
  .check input { margin-top: 2px; accent-color: var(--accent); width: 15px; height: 15px; flex: none; }

  .primary,
  .ghost {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    border-radius: var(--radius-sm);
    font: inherit;
    font-size: 12.5px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.14s ease, border-color 0.14s ease, filter 0.14s ease, transform 0.14s ease;
  }
  .primary {
    border: 1px solid transparent;
    background: var(--btn-bg);
    color: var(--btn-ink);
    font-weight: 680;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.3), var(--btn-glow);
  }
  .primary:hover:not(:disabled) {
    background: var(--btn-bg-hover);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.38), 0 4px 14px rgba(90, 139, 255, 0.3);
  }
  .primary:active:not(:disabled) { transform: translateY(1px); }
  .primary:disabled { opacity: 0.5; cursor: not-allowed; }
  .primary.big { height: 46px; width: 100%; font-size: 14px; font-weight: 650; }

  .ghost {
    border: 1px solid var(--line);
    background: var(--panel-2);
    color: var(--text);
  }
  .ghost:hover:not(:disabled) { background: var(--panel-3); border-color: var(--muted-2); }

  .link {
    border: none;
    background: transparent;
    color: var(--muted);
    font: inherit;
    font-size: 12px;
    text-decoration: underline;
    cursor: pointer;
    padding: 0;
  }
  .link:hover { color: var(--text); }

  .providers { display: flex; flex-direction: column; gap: 8px; margin-top: 2px; }
  .or {
    display: flex;
    align-items: center;
    gap: 10px;
    color: var(--muted-2);
    font-size: 11px;
  }
  .or::before,
  .or::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--line);
  }
  .prov { height: 38px; justify-content: flex-start; padding: 0 12px; }
  .prov-badge {
    width: 20px;
    height: 20px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    font-size: 12px;
    font-weight: 700;
    flex: none;
  }
  .prov-badge.ya { background: #fc3f1d; color: #fff; }
  .prov-badge.go { background: #fff; color: #1a1a1a; }

  .msg { margin: 0; padding: 8px 11px; border-radius: 8px; font-size: 12.5px; }
  .msg.err { background: rgba(239, 91, 91, 0.14); color: var(--danger); }

  .foot { display: flex; justify-content: space-between; margin-top: 4px; }

  .link.inline {
    display: inline;
    font-size: inherit;
    color: var(--accent);
    text-decoration-color: var(--accent);
  }

  .doc-backdrop {
    position: fixed;
    inset: 0;
    z-index: 210;
    display: grid;
    place-items: center;
    padding: 24px;
    border: 0;
    font: inherit;
    color: inherit;
    text-align: left;
    cursor: default;
    background: rgba(4, 6, 12, 0.78);
    backdrop-filter: blur(3px);
  }
  .doc-panel {
    width: 620px;
    max-width: 100%;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 14px;
    box-shadow: 0 24px 64px rgba(0, 0, 0, 0.6);
    overflow: hidden;
  }
  .doc-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 14px 18px;
    border-bottom: 1px solid var(--line);
  }
  .doc-head strong { font-size: 14px; }
  .doc-body {
    padding: 14px 18px 18px;
    overflow-y: auto;
    font-size: 12.5px;
    line-height: 1.6;
  }
  .doc-body h4 { margin: 14px 0 5px; font-size: 12.5px; }
  .doc-body h4:first-child { margin-top: 0; }
  .doc-body p { margin: 0 0 8px; }
  .doc-body ul { margin: 0 0 10px; padding-left: 20px; }
  .doc-body li { margin-bottom: 4px; }
  .doc-body table { width: 100%; border-collapse: collapse; margin: 6px 0 12px; }
  .doc-body th,
  .doc-body td { text-align: left; padding: 6px 8px; border: 1px solid var(--line); }
  .doc-body th { width: 42%; color: var(--muted); font-weight: 600; }
  .doc-note {
    margin: 10px 0;
    padding: 9px 11px;
    border-left: 3px solid var(--gold);
    border-radius: 8px;
    background: rgba(217, 161, 59, 0.1);
  }

</style>
