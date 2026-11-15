<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import { invoke } from '@tauri-apps/api/tauri';
  import { online, saveProfile } from '../lib/online';

  const dispatch = createEventDispatcher<{ close: void }>();

  export let gamesCount = 0;

  const PRESET_AVATARS = [
    'avatar-01-red-business.jpg',
    'avatar-02-e-girl.jpg',
    'avatar-03-medusa.jpg',
    'avatar-04-elf.jpg',
    'avatar-05-cyber.jpg',
    'avatar-06-hooded.jpg',
    'avatar-07-skeleton.jpg',
    'avatar-08-fox.jpg',
    'avatar-09-orc.jpg',
    'avatar-10-child.jpg',
    'avatar-11-punk.jpg',
    'avatar-12-redhat.jpg',
    'avatar-13-samurai.jpg',
    'avatar-14-onyx.jpg',
    'avatar-15-wizard.jpg',
    'avatar-16-signature.jpg',
  ];

  const STEPS = [
    {
      key: 'profile',
      icon: '🎨',
      title: 'Это ваш профиль',
      text: 'Кастомизируйте его: выберите аватар.',
    },
    {
      key: 'collection',
      icon: '🕹️',
      title: 'Ваша коллекция игр',
      text: 'Лаунчер собирает игры из Steam, Epic Games, GOG и ваших собственных в одном месте.',
      features: [
        'Все игры в одном окне: Steam, Epic Games, GOG и ваши собственные',
        'Умный поиск и сортировка: по названию, недавним и числу запусков',
        'Избранное, чтобы быстро находить любимые игры',
        'Статистика наигранного времени и превью при наведении',
        'Автообновление списка и распознавание новых установок',
      ],
    },
    {
      key: 'retro',
      icon: '👾',
      title: 'Классика и сети',
      text: 'Ретро-игры, эмуляция и сетевые сессии.',
      features: [
        'Категория «Классика и сети» для ретро-игр и эмуляторов',
        'Локальная сеть (LAN) для игры с друзьями по сети',
        'Сохранение и загрузка прогресса в ретро-играх',
      ],
    },
    {
      key: 'servers',
      icon: '🖥️',
      title: 'Ваши серверы',
      text: 'Добавляйте свои серверы и отслеживайте их в реальном времени.',
      features: [
        'Свои серверы с живым статусом «онлайн/офлайн» и числом игроков',
        'Мониторинг доступности и быстрый запуск любимых серверов',
        'Поддержка популярных сетевых игр',
      ],
    },
    {
      key: 'friends',
      icon: '👤',
      title: 'Профиль и друзья',
      text: 'Персональный профиль, друзья и обмен коллекцией.',
      features: [
        'Личный профиль с аватаром и кастомизацией',
        'Список друзей и обмен ссылкой на профиль',
        'Соц. функции: новости, лента и групповая активность',
      ],
    },
    {
      key: 'community',
      icon: '📡',
      title: 'Новости и сообщество',
      text: 'Оставайтесь в курсе новостей и событий.',
      features: [
        'Лента новостей и обновлений игр',
        'Группы и общение с другими игроками',
        'Поддержка и тикеты прямо из приложения',
      ],
    },
    {
      key: 'security',
      icon: '🛡️',
      title: 'Безопасность аккаунта',
      text: 'Используйте надёжный пароль и следите за активными сессиями в разделе «Безопасность».',
      features: [
        'Двухфакторная аутентификация (2FA) для защиты аккаунта',
        'Надёжный пароль — от 10 символов, буквы разного регистра и цифра',
        'Контроль активных сессий и выход со всех устройств',
        'Никому не сообщайте код и пароль, даже «поддержке»',
        'Регулярно проверяйте активные сессии в разделе «Безопасность»',
      ],
    },
  ];

  let step = 0;
  let avatarUrl = '';
  let presetSrc: Record<string, string> = {};
  let saving = true;

  $: current = STEPS[step];

  onMount(loadAvatar);

  async function loadAvatar() {
    saving = true;
    const url = $online.profile?.avatar || '';
    if (url) avatarUrl = url;
    const presets = PRESET_AVATARS;
    const loaded: Record<string, string> = {};
    for (const name of presets) {
      try {
        const bytes = await invoke<number[]>('read_preset_avatar', { name });
        loaded[name] = `data:image/jpeg;base64,${toBase64(bytes)}`;
      } catch {
        // нет такого аватара
      }
    }
    presetSrc = loaded;
    saving = false;
  }

  function toBase64(bytes: number[]): string {
    let bin = '';
    const chunk = 0x2000;
    for (let i = 0; i < bytes.length; i += chunk) {
      bin += String.fromCharCode(...bytes.slice(i, i + chunk));
    }
    return btoa(bin);
  }

  async function selectAvatar(name: string) {
    avatarUrl = prescribed(name);
    saveProfile({ avatar: avatarUrl });
  }

  function isSelected(name: string): boolean {
    return !!avatarUrl && presetSrc[name] === avatarUrl;
  }

  function prescribed(name: string): string {
    return presetSrc[name] || $online.profile?.avatar || '';
  }

  function next() {
    if (step < STEPS.length - 1) step += 1;
    else dispatch('close');
  }

  function prev() {
    if (step > 0) step -= 1;
  }

  function close() {
    dispatch('close');
  }
</script>

<div class="backdrop" role="presentation" on:keydown={() => {}}>
  <div class="panel" role="dialog" aria-modal="true" aria-label={current.title}>
    <div class="top">
      <div class="steps">
        {#each STEPS as s, i (s.key)}
          <span class="seg" class:active={i === step} class:done={i < step}></span>
        {/each}
      </div>
      <button class="close" title="Закрыть" aria-label="Закрыть" on:click={close}>✕</button>
    </div>

    <div class="body">
      {#if step === 0}
        <div class="icon-big">🎨</div>
        <h2>Это ваш профиль</h2>
        <p class="sub">Кастомизируйте его: выберите аватар.</p>

        <div class="avatar-preview" style="background: linear-gradient(140deg, #23272f, #2a2e38)">
          {#if avatarUrl}
            <img src={avatarUrl} alt="Ваш аватар" />
          {:else}
            <span class="placeholder">{($online.user || 'Г').slice(0, 1).toUpperCase()}</span>
          {/if}
        </div>

        <div class="avatars">
          {#each PRESET_AVATARS as name (name)}
            <button
              class="av"
              class:selected={isSelected(name)}
              title="Выбрать"
              on:click={() => selectAvatar(name)}
            >
              {#if presetSrc[name]}<img src={presetSrc[name]} alt="" />{:else}<span class="ld">…</span>{/if}
              {#if isSelected(name)}
                <span class="check" aria-hidden="true">✓</span>
              {/if}
            </button>
          {/each}
        </div>
      {:else}
        <div class="icon-big">{current.icon}</div>
        <h2>{current.title}</h2>
        <p class="sub">{current.text}</p>
        {#if step === 1}
          <div class="stats">
            <div class="stat"><strong>{gamesCount}</strong><span>игр в библиотеке</span></div>
            <div class="stat"><strong>Steam · Epic · GOG</strong><span>плюс свои игры</span></div>
          </div>
        {/if}
        {#if current.features}
          <ul class="tips">
            {#each current.features as f (f)}
              <li>{f}</li>
            {/each}
          </ul>
        {/if}
      {/if}
    </div>

    <div class="foot">
      {#if step > 0}
        <button class="ghost" on:click={prev}>Назад</button>
      {:else}
        <span class="spacer"></span>
      {/if}
      <button class="primary" on:click={next} disabled={saving}>
        {step === STEPS.length - 1 ? 'Готово' : 'Дальше'}
      </button>
    </div>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 250;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    background: rgba(0, 0, 0, 0.64);
    backdrop-filter: blur(6px);
  }

  .panel {
    width: 460px;
    max-width: 100%;
    padding: 18px 22px 20px;
    border: 1px solid var(--line);
    border-radius: 18px;
    background: var(--panel);
    box-shadow: 0 30px 80px rgba(0, 0, 0, 0.65);
  }

  .top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 6px;
  }
  .steps { display: flex; gap: 6px; }
  .seg {
    width: 44px;
    height: 4px;
    border-radius: 999px;
    background: var(--hover-2);
    transition: background 0.2s;
  }
  .seg.active { background: var(--accent); }
  .seg.done { background: color-mix(in srgb, var(--accent) 55%, var(--hover-2)); }

  .close {
    width: 28px;
    height: 28px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid transparent;
    border-radius: 8px;
    background: transparent;
    color: var(--muted);
    font: inherit;
    cursor: pointer;
  }
  .close:hover { background: var(--hover); color: var(--text); }

  .body { text-align: center; padding: 8px 0 4px; display: flex; flex-direction: column; align-items: center; max-height: 56vh; overflow-y: auto; }

  .icon-big {
    width: 74px;
    height: 74px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    margin: 6px auto 12px;
    border-radius: 20px;
    background: var(--accent-soft);
    border: 1px solid color-mix(in srgb, var(--accent) 40%, transparent);
    font-size: 34px;
  }

  h2 { margin: 0 0 6px; font-size: 19px; font-weight: 680; }
  .sub { margin: 0 0 16px; font-size: 13px; color: var(--muted); line-height: 1.5; max-width: 330px; }

  .avatar-preview {
    width: 104px;
    height: 104px;
    margin: 0 auto 18px;
    border-radius: 50%;
    overflow: hidden;
    border: 3px solid var(--accent);
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.45), 0 0 0 5px color-mix(in srgb, var(--accent) 20%, transparent);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .avatar-preview img { width: 100%; height: 100%; object-fit: cover; }
  .avatar-preview .placeholder { font-size: 40px; font-weight: 700; color: #fff; }

  .avatars {
    display: grid;
    grid-template-columns: repeat(8, 1fr);
    gap: 8px;
    width: 100%;
  }
  .av {
    position: relative;
    aspect-ratio: 1;
    border-radius: 10px;
    overflow: hidden;
    border: 2px solid var(--line);
    background: var(--panel-2);
    padding: 0;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .av img { width: 100%; height: 100%; object-fit: cover; }
  .av.selected { border-color: var(--accent); box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 35%, transparent); }
  .av:hover { border-color: color-mix(in srgb, var(--accent) 60%, var(--line)); }
  .ld { color: var(--muted); }
  .check {
    position: absolute;
    top: 3px;
    right: 3px;
    width: 17px;
    height: 17px;
    border-radius: 50%;
    background: var(--accent);
    color: var(--ink-on-accent);
    font-size: 11px;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.5);
  }

  .tips { list-style: none; margin: 4px 0 0; padding: 0; display: flex; flex-direction: column; gap: 8px; text-align: left; width: 100%; max-width: 380px; }
  .tips li { display: flex; gap: 8px; font-size: 12.5px; line-height: 1.45; color: var(--text); align-items: flex-start; }
  .tips li::before { content: '•'; color: var(--accent); font-weight: 700; flex-shrink: 0; }

  .stats { display: flex; gap: 10px; margin-top: 8px; width: 100%; max-width: 380px; }
  .stat {
    flex: 1;
    padding: 14px 10px;
    border: 1px solid var(--line);
    border-radius: 12px;
    background: var(--panel-2);
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .stat strong { font-size: 15px; font-weight: 680; }
  .stat span { font-size: 11.5px; color: var(--muted); }

  .foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-top: 14px;
  }
  .spacer { flex: 1; }

  .ghost {
    height: 40px;
    padding: 0 16px;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: transparent;
    color: var(--text);
    font: inherit;
    font-size: 13px;
    cursor: pointer;
  }
  .ghost:hover { background: var(--hover); }

  .primary {
    height: 40px;
    padding: 0 26px;
    border: 1px solid var(--accent);
    border-radius: 10px;
    background: var(--accent);
    color: var(--ink-on-accent);
    font: inherit;
    font-size: 13px;
    font-weight: 650;
    cursor: pointer;
  }
  .primary:hover { filter: brightness(1.08); }
  .primary:disabled { opacity: 0.6; cursor: default; }
</style>