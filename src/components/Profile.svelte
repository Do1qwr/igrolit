<script lang="ts">
  import { onMount } from 'svelte';
  import { invoke } from '@tauri-apps/api/tauri';
  import { open } from '@tauri-apps/api/dialog';
  import Promotion from './Promotion.svelte';
  import Icon from './Icon.svelte';
  import AchIcon from './AchIcon.svelte';
import { ask } from '../lib/dialogs';
  import { gift3dUrlById, ach3dUrl } from '../lib/gift3d';
  import {
    online,
    sendComplaint,
    logout,
    saveProfile,
    changePassword,
    requestSessions,
    revokeSession,
    exportAccount,
    deleteAccount,
    acceptConsent,
    setPrivacy,
    removeFriend,
    sendFriendRequest,
    acceptFriendRequest,
    declineFriendRequest,
    cancelFriendRequest,
    requestFriendRequests,
    removePublicServer,
    recheckServer,
setServerBanner,
    clearServerBanner,
    bannerUrl,
    iconUrl,
    setServerIcon,
    clearServerIcon,
    requestOrders,
    requestOnlineNow,
    requestProfileView,
    openChat,
    voteProfile,
    requestProfileClear,
    requestGroups,
    unsubscribeGroup,
    openGroup,
    setupTotp,
    enableTotp,
    disableTotp,
    revokeAllSessions,
    requestFeed,
    createFeedPost,
    deletePost,
    likePost,
    commentPost,
votePost,
    requestGifts,
    giftBuy,
    giftSetActive,
    type PrivacySettings,
    type FeedPost,
    type PostDraft,
    type PublicServer,
    type Group,
  } from '../lib/online';

  export let gamesCount = 0;
  export let games: { id: string; name: string }[] = [];
  export let onOpenAuth: (mode: 'login' | 'register') => void = () => {};
  export let onOpenServers: () => void = () => {};
  export let onOpenPlayers: () => void = () => {};

  const COLORS = ['#3d6fd8', '#2f9e44', '#c94b4b', '#b8860b', '#7a4fa3', '#2a9d8f'];
  const STATUS_LABEL: Record<string, string> = {
    online: 'в сети',
    away: 'отошёл',
    dnd: 'не беспокоить',
    invisible: 'невидимка',
  };
const NAV: { id: string; icon: string; label: string; badge?: () => string }[] = [
    { id: 'profile', icon: 'user', label: 'Профиль' },
    { id: 'gifts', icon: 'star', label: 'Подарки' },
    { id: 'edit', icon: 'settings', label: 'Настройки' },
    { id: 'achievements', icon: 'trophy', label: 'Достижения' },
    { id: 'friends', icon: 'users', label: 'Друзья' },
    { id: 'groups', icon: 'group', label: 'Группы' },
    { id: 'servers', icon: 'server', label: 'Мои серверы' },
    { id: 'orders', icon: 'wallet', label: 'Заказы' },
    { id: 'security', icon: 'shield', label: 'Безопасность' },
    { id: 'complaint', icon: 'book', label: 'Жалоба' },
  ];

  let tab: 'profile' | 'gifts' | 'edit' | 'achievements' | 'friends' | 'groups' | 'servers' | 'orders' | 'security' | 'complaint' = 'profile';
  function openTab(id: string) {
    tab = id as typeof tab;
  }
  let ordersLoaded = false;
  let groupsLoaded = false;

  $: myGroups = (($online.groups ?? []) as Group[]).filter((g) => g.subscribed || g.mine);

  // 3D-изображение подарка по его id (cat-idx) из карты gift3d
  function giftImgFor(item: { id: string; name: string; rarity: string }): string {
    return gift3dUrlById(item.id) || '';
  }

  // 3D-изображение для достижения по метрике/id (иначе пусто → AchIcon)
  function achImgFor(ach: { id?: string; metric?: string; name?: string; rarity?: string }): string {
    return ach3dUrl((ach.metric || '') + ' ' + (ach.name || '')) || '';
  }

  let giftPick: { id: string; emoji: string; name: string; price: number; rarity: string } | null = null;
  let giftTo = '';
  let giftNote = '';
  let giftMode: 'self' | 'to' = 'self';
  let giftPanelOpen = false;

  $: ownedGifts = ($online.gifts || [])
    .flatMap((c) => c.items || [])
    .filter((g) => ($online.giftCol && $online.giftCol[g.id]) > 0);

  function openGiftCard(g: { id: string; emoji: string; name: string; price: number; rarity: string }) {
    giftPick = g;
    giftTo = '';
    giftMode = 'self';
    giftNote = '';
  }

  function confirmGift() {
    if (!giftPick) return;
    if (giftMode === 'to' && !giftTo.trim()) {
      giftNote = 'Укажите ник получателя';
      return;
    }
    giftBuy(giftPick.id, giftMode, giftMode === 'to' ? giftTo.trim() : '');
    giftNote = giftMode === 'self' ? `Покупаете «${giftPick.name}» за ${giftPick.price} монет…` : `Отправляете «${giftPick.name}» для ${giftTo.trim()} за ${giftPick.price} монет…`;
  }

  const OPTION_NAMES: Record<string, string> = {
    badge: 'плашка',
    color: 'цвет',
    large: 'крупная карточка',
    pinned: 'закрепление',
  };

  $: myOrders = $online.orders ?? [];
  let oldPass = '';
  let newPass = '';
  let newPass2 = '';
  let delPass = '';
  let delConfirm = false;
  let passError = '';
  let showOldPass = false;
  let showNewPass = false;
  let showNewPass2 = false;
  let passTouched = false;
  let passBusy = false;
  let passLastResult = '';
  let totpCode = '';
  let totpMsg = '';
  let copied = false;
  let copiedId = false;
  let sessionsLoaded = false;
  let status = '';
  let cmpTarget = '';
  let cmpReason = '';
  let cmpStatus = '';
  let color = '#3d6fd8';
  let bio = '';
  let statusText = '';
  let bioDraft = '';
  let bioFocused = false;
  let statusKind = 'online';
  let hideGame = false;
  let dFirst = '';
  let dLast = '';
  let dGender = '';
  let dCity = '';
  let dCountry = '';
  let dBirth = '';
  let dCover = '';
  let dFrame = 'none';
  let coverPickerOpen = false;
  let framePickerOpen = false;
  let coverPreview = '';
  let coverError = '';
  let coverDragging = false;
  let coverFileInput: HTMLInputElement | null = null;
  const COVER_MAX_BYTES = 12 * 1024 * 1024;
  const COVER_MIN_W = 800;
  const COVER_MIN_H = 200;
  const COVER_TARGET_W = 1920;
  const COVER_PAYLOAD_MAX = 700000;

  const COVERS: { id: string; label: string; css: string; unlock?: string }[] = [
    { id: 'aurora', label: 'Сияние', css: 'linear-gradient(135deg, #0d2438 0%, #1f6f9c 48%, #3ad0b0 100%)' },
    { id: 'sunset', label: 'Закат', css: 'linear-gradient(135deg, #2a1020 0%, #8c3a4a 50%, #f0a35c 100%)' },
    { id: 'ocean', label: 'Океан', css: 'linear-gradient(135deg, #061826 0%, #14506b 55%, #2f9cc4 100%)' },
    { id: 'forest', label: 'Лес', css: 'linear-gradient(135deg, #0b1c14 0%, #245c3c 55%, #6fbf73 100%)' },
    { id: 'nebula', label: 'Туманность', css: 'linear-gradient(135deg, #160b2b 0%, #4b1f7a 50%, #b24fd0 100%)' },
    { id: 'graphite', label: 'Графит', css: 'linear-gradient(135deg, #14161c 0%, #2b303a 60%, #4a5260 100%)' },
    { id: 'dawn', label: 'Рассвет', css: 'linear-gradient(135deg, #2a1630 0%, #b0496b 45%, #ffb46a 100%)', unlock: 'friend5' },
    { id: 'matrix', label: 'Матрица', css: 'linear-gradient(135deg, #04140a 0%, #0f5f2a 55%, #38e06a 100%)', unlock: 'games12' },
    { id: 'ice', label: 'Лёд', css: 'linear-gradient(135deg, #06222e 0%, #1f7fa3 50%, #b8f0ff 100%)', unlock: 'server1' },
    { id: 'magma', label: 'Магма', css: 'linear-gradient(135deg, #1a0606 0%, #8c1f14 55%, #ff7a2f 100%)', unlock: 'veteran180' },
  ];

  const FRAMES: { id: string; label: string; css: string; unlock?: string }[] = [
    { id: 'none', label: 'Без рамки', css: 'none' },
    { id: 'gold', label: 'Золото', css: '0 0 0 3px #e8c46a, 0 0 20px rgba(232,196,106,0.55)' },
    { id: 'ember', label: 'Уголь', css: '0 0 0 3px #ff7a45, 0 0 20px rgba(255,122,69,0.5)' },
    { id: 'frost', label: 'Лёд', css: '0 0 0 3px #7fd8ff, 0 0 20px rgba(127,216,255,0.5)' },
    { id: 'neon', label: 'Неон', css: '0 0 0 3px #b46cff, 0 0 20px rgba(180,108,255,0.55)' },
    { id: 'bronze', label: 'Бронза', css: '0 0 0 3px #cd7f32, 0 0 20px rgba(205,127,50,0.55)', unlock: 'hours100' },
    { id: 'royal', label: 'Королевская', css: '0 0 0 3px #7b5cff, 0 0 22px rgba(123,92,255,0.6)', unlock: 'hours500' },
    { id: 'void', label: 'Пустота', css: '0 0 0 3px #1b1030, 0 0 0 6px #b46cff, 0 0 22px rgba(180,108,255,0.45)', unlock: 'liked3' },
    { id: 'legend', label: 'Легенда', css: '0 0 0 3px #ffd166, 0 0 24px rgba(255,209,102,0.65)', unlock: 'rep80' },
    { id: 'toxic', label: 'Токсин', css: '0 0 0 3px #6cff8a, 0 0 22px rgba(108,255,138,0.55)', unlock: 'legend500' },
  ];

  $: doneAchievements = progress ? progress.achievements.filter((a) => a.done) : [];
  $: unlockedFrames = new Set(
    doneAchievements.filter((a) => a.reward && a.reward.kind === 'frame').map((a) => a.reward!.id),
  );
  $: unlockedCovers = new Set(
    doneAchievements.filter((a) => a.reward && a.reward.kind === 'cover').map((a) => a.reward!.id),
  );
  $: earnedBadges = doneAchievements
    .filter((a) => a.reward && a.reward.kind === 'badge')
    .map((a) => ({
      id: a.id,
      metric: a.metric,
      icon: (a.reward && a.reward.icon) || '★',
      label: (a.reward && a.reward.label) || a.name,
    }));

  function isFrameLocked(id: string) {
    const item = FRAMES.find((f) => f.id === id);
    return !!item && !!item.unlock && !unlockedFrames.has(id);
  }

  function isCoverLocked(id: string) {
    const item = COVERS.find((c) => c.id === id);
    return !!item && !!item.unlock && !unlockedCovers.has(id);
  }

  function unlockTitle(achId?: string) {
    if (!achId) return '';
    const ach = progress ? progress.achievements.find((a) => a.id === achId) : null;
    return ach ? `Откроется за достижение «${ach.name}»` : 'Закрыто';
  }

  function coverCss(id: string) {
    const found = COVERS.find((c) => c.id === id);
    return found ? found.css : 'none';
  }

  function frameCss(id: string) {
    const found = FRAMES.find((f) => f.id === id);
    return found ? found.css : 'none';
  }

  function pickCover(id: string) {
    dCover = id;
    coverPickerOpen = false;
    saveProfile({ cover: id });
  }

  function pickFrame(id: string) {
    dFrame = id;
    framePickerOpen = false;
    saveProfile({ frame: id });
  }

  function coverStyle(id: string) {
    if (!id) return '';
    if (id.startsWith('data:')) {
      return `background-image:url("${id}");background-size:cover;background-position:center;`;
    }
    return `background-image:${coverCss(id)};`;
  }

  function closeCoverDialog() {
    coverPickerOpen = false;
    coverPreview = '';
    coverError = '';
    coverDragging = false;
  }

  function readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('read'));
      reader.readAsDataURL(file);
    });
  }

  function measureImage(dataUrl: string): Promise<{ w: number; h: number } | null> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = () => resolve(null);
      img.src = dataUrl;
    });
  }

  function loadImage(dataUrl: string): Promise<HTMLImageElement | null> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = dataUrl;
    });
  }

  async function shrinkCover(dataUrl: string): Promise<string> {
    const img = await loadImage(dataUrl);
    if (!img) return '';
    const scale = Math.min(1, COVER_TARGET_W / img.naturalWidth);
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    ctx.drawImage(img, 0, 0, w, h);
    let quality = 0.9;
    let out = canvas.toDataURL('image/jpeg', quality);
    while (out.length > COVER_PAYLOAD_MAX && quality > 0.45) {
      quality -= 0.1;
      out = canvas.toDataURL('image/jpeg', quality);
    }
    return out.length <= COVER_PAYLOAD_MAX ? out : '';
  }

  async function handleCoverFile(file: File | null | undefined) {
    coverError = '';
    coverPreview = '';
    if (!file) return;
    if (!/^image\/(jpeg|jpg|png|webp|gif|bmp)$/.test(file.type)) {
      coverError = 'Поддерживаются JPG, PNG, WEBP, GIF и BMP';
      return;
    }
    if (file.size > COVER_MAX_BYTES) {
      coverError = 'Файл больше 12 МБ';
      return;
    }
    let dataUrl = '';
    try {
      dataUrl = await readFileAsDataUrl(file);
    } catch {
      coverError = 'Не удалось прочитать файл';
      return;
    }
    const size = await measureImage(dataUrl);
    if (!size) {
      coverError = 'Не удалось открыть изображение';
      return;
    }
    if (size.w < COVER_MIN_W || size.h < COVER_MIN_H) {
      coverError = `Мало разрешение: ${size.w}×${size.h}, нужно не меньше ${COVER_MIN_W}×${COVER_MIN_H} пикселей`;
      return;
    }
    const shrunk = await shrinkCover(dataUrl);
    if (!shrunk) {
      coverError = 'Не удалось подготовить изображение';
      return;
    }
    coverPreview = shrunk;
  }

  function onCoverFile(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files && input.files[0] ? input.files[0] : null;
    handleCoverFile(file);
    input.value = '';
  }

  function onCoverDrop(event: DragEvent) {
    coverDragging = false;
    const dt = event.dataTransfer;
    const file = dt && dt.files && dt.files[0] ? dt.files[0] : null;
    handleCoverFile(file);
  }

  function applyCover() {
    if (!coverPreview) return;
    dCover = coverPreview;
    saveProfile({ cover: coverPreview });
    closeCoverDialog();
  }

  let formSource: unknown = null;

  $: if ($online.profile && $online.profile !== formSource) {
    formSource = $online.profile;
    dFirst = $online.profile.firstName || '';
    dLast = $online.profile.lastName || '';
    dGender = $online.profile.gender || '';
    dCity = $online.profile.city || '';
    dCountry = $online.profile.country || '';
    dBirth = $online.profile.birthdate || '';
    dCover = $online.profile.cover || '';
    dFrame = $online.profile.frame || 'none';
  }

  function saveProfileForm() {
    saveProfile({
      firstName: dFirst.trim(),
      lastName: dLast.trim(),
      gender: dGender,
      country: dCountry.trim(),
      city: dCity.trim(),
      birthdate: dBirth,
    });
  }

  function resetProfileForm() {
    dFirst = '';
    dLast = '';
    dGender = '';
    dCountry = '';
    dCity = '';
    dBirth = '';
    saveProfile({ firstName: '', lastName: '', gender: '', country: '', city: '', birthdate: '' });
  }
  let loadedFor = '';
  let avatarUrl = '';
  let avatarError = '';
  let uploading = false;
  let avatarGalleryOpen = false;
  let presetSrc: Record<string, string> = {};
  let draft = '';
let postImages: string[] = [];
  let postGame = '';
  let postVisibility: 'public' | 'friends' | 'private' = 'friends';
  let emojiOpen = false;
  let gamePickerOpen = false;
  let pollOpen = false;
  let pollQuestion = '';
  let pollOptions: string[] = ['', ''];

  $: activeGiftEmoji =
    ($online.gifts || [])
      .flatMap((c) => c.items || [])
      .find((g) => g.id === $online.activeGift)?.emoji || '';
  let openComments: string | null = null;
  let commentDraft: Record<string, string> = {};
  let postBusy = false;
  let postDragging = false;
  const POST_MAX = 2000;
  const POST_MAX_IMAGES = 4;
  const POST_IMAGE_MAX_BYTES = 900 * 1024;
  const EMOJIS = ['🎮', '🔥', '💪', '🏆', '😎', '🤯', '👾', '🎯', '⚡', '💥', '🕹️', '🎲', '😅', '🙌', '👑', '❤️', '💀', '🚀', '👀', '✨'];
  const PRESET_AVATARS = [
    'avatar-21-knight.jpg',
    'avatar-22-hacker.jpg',
    'avatar-23-cat.jpg',
    'avatar-24-astro.jpg',
    'avatar-25-robot.jpg',
    'avatar-26-samurai.jpg',
    'avatar-27-fox.jpg',
    'avatar-28-witch.jpg',
  ];

  $: authed = $online.authed;
  $: friends = $online.friends ?? [];

  let promoFor: PublicServer | null = null;
  let srvNote = '';

  let activity: { id: string; ts: number }[] = [];
  let usage: Record<string, { count: number; last: number }> = {};

  function serverDate(ts: number) {
    return new Date(ts).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  $: myServers = (() => {
    const all = [
      ...($online.pinnedServers ?? []),
      ...($online.publicServers ?? []),
      ...($online.hiddenMine ?? []),
    ];
    const seen = new Set<string>();
    return all
      .filter((s) => s.by === $online.user)
      .filter((s) => (seen.has(s.id) ? false : (seen.add(s.id), true)))
      .sort((a, b) => (b.promoUntil || 0) - (a.promoUntil || 0) || a.name.localeCompare(b.name, 'ru'));
  })();

  $: activePromoServers = myServers.filter((s) => (s.promoUntil || 0) > Date.now());
  $: votesForMe = myServers.reduce((acc, s) => acc + (s.votes || 0), 0);
  $: paidSum = (myOrders.filter((o) => o.status === 'paid').reduce((acc, o) => acc + (o.amount || 0), 0));
  $: totalRuns = Object.values(usage).reduce((acc, u) => acc + (u.count || 0), 0);

  $: interesting = (() => {
    const seen = new Set(myServers.map((s) => s.id));
    return [...($online.publicServers ?? [])]
      .filter((s) => !seen.has(s.id))
      .sort((a, b) => (b.votes || 0) - (a.votes || 0) || (b.players || 0) - (a.players || 0))
      .slice(0, 4);
  })();

  $: gameName = (id: string) => games.find((g) => g.id === id)?.name || id;

  $: topGames = (() => {
    const counts = new Map<string, number>();
    for (const ev of activity) counts.set(ev.id, (counts.get(ev.id) || 0) + 1);
    return [...counts.entries()]
      .map(([id, count]) => ({ id, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);
  })();

  $: recentActivity = (() =>
    [...activity].sort((a, b) => b.ts - a.ts).slice(0, 8))();

  async function dropServer(s: PublicServer) {
    if (
      !(await ask({
        title: 'Удалить сервер?',
        message: `«${s.name}» исчезнет из каталога вместе с голосами.`,
        okLabel: 'Удалить',
        danger: true,
      }))
    )
      return;
    removePublicServer(s.id);
    srvNote = `Сервер «${s.name}» удалён`;
  }

  function recheckMine(s: PublicServer) {
    recheckServer(s.id);
    srvNote = `Проверяю «${s.name}»…`;
  }

let bannerInput: HTMLInputElement | null = null;
  let bannerTarget: PublicServer | null = null;

  let iconInput: HTMLInputElement | null = null;
  let iconTarget: PublicServer | null = null;

  function pickIcon(s: PublicServer) {
    iconTarget = s;
    iconInput?.click();
  }

  async function onIconPick(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files && input.files[0];
    input.value = '';
    if (!file || !iconTarget) return;
    if (!file.type.startsWith('image/')) {
      srvNote = 'Нужен файл изображения: jpg, png или webp';
      return;
    }
    const target = iconTarget;
    try {
      const dataUrl = await shrinkImage(file, 512);
      if (!setServerIcon(target.id, dataUrl)) {
        srvNote = 'Нет связи с сервером — аватар не отправлен';
        return;
      }
      srvNote = `Аватар «${target.name}» загружается…`;
    } catch (e) {
      srvNote = 'Не удалось прочитать картинку';
    }
  }

  function removeIcon(s: PublicServer) {
    if (clearServerIcon(s.id)) srvNote = `Аватар «${s.name}» снят`;
  }

  function pickBanner(s: PublicServer) {
    bannerTarget = s;
    bannerInput?.click();
  }

  function shrinkImage(file: File, maxWidth: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('read'));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('decode'));
        img.onload = () => {
          const scale = Math.min(1, maxWidth / img.width);
          const width = Math.max(1, Math.round(img.width * scale));
          const height = Math.max(1, Math.round(img.height * scale));
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) return reject(new Error('canvas'));
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', 0.82));
        };
        img.src = String(reader.result);
      };
      reader.readAsDataURL(file);
    });
  }

  async function onBannerPick(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files && input.files[0];
    input.value = '';
    if (!file || !bannerTarget) return;
    if (!file.type.startsWith('image/')) {
      srvNote = 'Нужен файл изображения: jpg, png или webp';
      return;
    }
    const target = bannerTarget;
    try {
      const dataUrl = await shrinkImage(file, 1280);
      if (!setServerBanner(target.id, dataUrl)) {
        srvNote = 'Нет связи с сервером — баннер не отправлен';
        return;
      }
      srvNote = `Баннер «${target.name}» загружается…`;
    } catch (e) {
      srvNote = 'Не удалось прочитать картинку';
    }
  }

  function removeBanner(s: PublicServer) {
    if (clearServerBanner(s.id)) srvNote = `Баннер «${s.name}» снят`;
  }
  $: profile = $online.profile ?? {
    bio: '',
    statusText: '',
    statusKind: 'online',
    hideGame: false,
    avatar: '',
  };
  $: progress = $online.progress;
  $: doneCount = progress ? progress.achievements.filter((ach) => ach.done).length : 0;
  $: totalCount = progress ? progress.achievements.length : 0;
  $: initials = (authed ? $online.user : 'Гость').slice(0, 2).toUpperCase();
  $: currentLevelXp = progress
    ? progress.levels.filter((level) => level.reached).reduce((acc, level) => Math.max(acc, level.xp), 0)
    : 0;
  $: xpPct =
    progress && progress.nextXp > currentLevelXp
      ? Math.max(
          0,
          Math.min(
            100,
            Math.round(((progress.xp - currentLevelXp) / (progress.nextXp - currentLevelXp)) * 100),
          ),
        )
      : 100;
  $: levelNumber = progress ? progress.levels.filter((level) => level.reached).length : 0;
  $: canCover = levelNumber >= 2;
  $: canFrame = levelNumber >= 3 || doneCount >= 2;

  $: if (authed && $online.user !== loadedFor) {
    loadedFor = $online.user;
    bio = profile.bio;
    statusText = profile.statusText;
    statusKind = profile.statusKind || 'online';
    hideGame = !!profile.hideGame;
    avatarUrl = profile.avatar || '';
  }

  $: if ($online.profile && !bioFocused) {
    bioDraft = $online.profile.bio || '';
  }

  function commitBio() {
    bioFocused = false;
    const next = bioDraft.trim().slice(0, 300);
    if (next === ($online.profile.bio || '')) return;
    bioDraft = next;
    saveProfile({ bio: next });
  }

  function onBioKey(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      const target = event.currentTarget as HTMLInputElement;
      target.blur();
    }
  }

  function formatBirth(value: string) {
    const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
    return parts ? `${parts[3]}.${parts[2]}.${parts[1]}` : value || '—';
  }

  function visLabel(rule: string) {
    if (rule === 'nobody') return 'скрыто';
    if (rule === 'friends') return 'только друзьям';
    return 'видно всем';
  }

  function clearBio() {
    bioFocused = false;
    if (($online.profile.bio || '') === '') return;
    bioDraft = '';
    saveProfile({ bio: '' });
  }

  $: if (tab === 'security' && authed && !sessionsLoaded) {
    sessionsLoaded = true;
    requestSessions();
  }
  $: if (tab === 'orders' && authed && !ordersLoaded) {
    ordersLoaded = true;
    requestOrders();
  }
$: if (tab === 'profile' && authed) {
    requestOnlineNow();
  }
  $: if (tab === 'gifts' && authed) {
    requestGifts();
  }
  $: if (tab === 'groups' && authed && !groupsLoaded) {
    groupsLoaded = true;
    requestGroups();
  }
  $: if (!authed) {
    sessionsLoaded = false;
    ordersLoaded = false;
    groupsLoaded = false;
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

  function privacyChange(field: keyof PrivacySettings, value: string) {
    setPrivacy({ [field]: value } as Partial<PrivacySettings>);
  }

  $: pwRules = [
    { key: 'len', label: 'Не меньше 10 символов', ok: newPass.length >= 10 },
    {
      key: 'case',
      label: 'Заглавная и строчная буква',
      ok: /[a-zа-яё]/.test(newPass) && /[A-ZА-ЯЁ]/.test(newPass),
    },
    { key: 'digit', label: 'Хотя бы одна цифра', ok: /\d/.test(newPass) },
  ];
  $: pwScore = pwRules.filter((rule) => rule.ok).length;
  $: pwStrong = newPass.length >= 10 && pwScore === pwRules.length;
  $: pwMatch = newPass.length > 0 && newPass === newPass2;
  $: passReady = !!oldPass && pwStrong && pwMatch && !passBusy;
  $: passState = pwScore <= 1 ? 'Слабый' : pwScore === 2 ? 'Средний' : 'Надёжный';

  function handlePassResult(result: string) {
    if (!result || result === passLastResult) return;
    passLastResult = result;
    passBusy = false;
    if (result === 'Пароль изменён') {
      oldPass = '';
      newPass = '';
      newPass2 = '';
      passTouched = false;
      passError = '';
      showOldPass = false;
      showNewPass = false;
      showNewPass2 = false;
    }
  }

  $: handlePassResult($online.passwordResult);

  function submitPassword() {
    passTouched = true;
    passError = '';
    if (!oldPass) {
      passError = 'Введите текущий пароль';
      return;
    }
    if (!pwStrong) {
      passError = newPass.length < 10 ? 'Новый пароль — от 10 символов' : 'Новый пароль не отвечает требованиям';
      return;
    }
    if (!pwMatch) {
      passError = 'Пароли не совпадают';
      return;
    }
    passBusy = true;
    changePassword(oldPass, newPass);
  }

  function submitDelete() {
    passError = '';
    if (!delConfirm) {
      passError = 'Подтвердите удаление';
      return;
    }
    if (!delPass) {
      passError = 'Введите пароль';
      return;
    }
    deleteAccount(delPass);
    delPass = '';
    delConfirm = false;
  }

  async function copyId() {
    if (!$online.uid) return;
    try {
      await navigator.clipboard.writeText(String($online.uid));
      copiedId = true;
      setTimeout(() => (copiedId = false), 1800);
    } catch {
      copiedId = false;
    }
  }

  async function copyExport() {
    try {
      await navigator.clipboard.writeText($online.exportJson);
      copied = true;
      setTimeout(() => (copied = false), 2000);
    } catch {
      copied = false;
    }
  }

  function friendLabel(kind?: string, onlineFlag?: boolean): string {
    if (!onlineFlag) return 'не в сети';
    return STATUS_LABEL[kind || 'online'] || 'в сети';
  }

  function rarityKey(ach: { rarity?: string; metric?: string; need: number }): string {
    if (ach.rarity) return ach.rarity;
    if (ach.metric === 'days') {
      if (ach.need >= 3650) return 'legendary';
      if (ach.need >= 1095) return 'epic';
      return 'rare';
    }
    if (ach.metric === 'reputation') return ach.need >= 100 ? 'legendary' : 'common';
    if (ach.need >= 500) return 'epic';
    if (ach.need >= 10) return 'rare';
    return 'common';
  }

  function rarityLabel(key: string): string {
    return key === 'common' ? 'Обычная' : key === 'rare' ? 'Редкая' : key === 'epic' ? 'Эпическая' : 'Легендарная';
  }

  const RARITY_PTS: Record<string, number> = { common: 10, rare: 25, epic: 60, legendary: 150 };

  $: achievementsAll = progress ? progress.achievements.slice() : [];
  $: achiScore = achievementsAll.filter((a) => a.done).reduce((acc, a) => acc + (RARITY_PTS[rarityKey(a)] || 10), 0);
  $: achiMax = achievementsAll.reduce((acc, a) => acc + (RARITY_PTS[rarityKey(a)] || 10), 0);
  $: legendaryDone = achievementsAll.filter((a) => a.done && rarityKey(a) === 'legendary').length;

  function pickColor(value: string) {
    color = value;
    try {
      localStorage.setItem('profile_color', value);
    } catch {}
  }

  function toBase64(bytes: number[]): string {
    let bin = '';
    const chunk = 0x2000;
    for (let i = 0; i < bytes.length; i += chunk) {
      bin += String.fromCharCode(...bytes.slice(i, i + chunk));
    }
    return btoa(bin);
  }

  async function pickPresetAvatar(name: string) {
    try {
      const bytes = await invoke<number[]>('read_preset_avatar', { name });
      const dataUrl = `data:image/jpeg;base64,${toBase64(bytes)}`;
      if (dataUrl.length > 400000) {
        avatarError = 'Аватар слишком большой';
        return;
      }
      avatarUrl = dataUrl;
      saveProfile({ avatar: dataUrl });
      presetSrc = { ...presetSrc, [name]: dataUrl };
      avatarGalleryOpen = false;
      status = 'Аватар обновлён';
    } catch (e) {
      avatarError = `Не удалось загрузить аватар: ${String(e)}`;
    }
  }

  async function loadPresetThumb(name: string) {
    if (presetSrc[name]) return;
    try {
      const bytes = await invoke<number[]>('read_preset_avatar', { name });
      presetSrc = { ...presetSrc, [name]: `data:image/jpeg;base64,${toBase64(bytes)}` };
    } catch {
      // нет такого аватара
    }
  }

  function loadAvatar(node: HTMLElement, name: string) {
    loadPresetThumb(name);
    return {
      destroy() {},
    };
  }

  async function pickAvatar() {
    avatarError = '';
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: 'Изображения', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
      });
      if (!selected || typeof selected !== 'string') return;
      uploading = true;
      const bytes = await invoke<number[]>('read_avatar_file', { path: selected });
      const ext = selected.split('.').pop()?.toLowerCase() || 'png';
      const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
      const dataUrl = `data:${mime};base64,${toBase64(bytes)}`;
      if (dataUrl.length > 400000) {
        avatarError = 'Фото слишком большое — выберите файл до 300 КБ';
        uploading = false;
        return;
      }
      avatarUrl = dataUrl;
      saveProfile({ avatar: dataUrl });
    } catch (e) {
      avatarError = `Не удалось загрузить фото: ${String(e)}`;
    }
    uploading = false;
  }

  function removeAvatar() {
    avatarUrl = '';
    saveProfile({ avatar: '' });
  }

  function saveTexts() {
    status = '';
    saveProfile({ bio, statusText });
    status = 'Профиль сохранён';
  }

  function changeStatus(next: string) {
    statusKind = next;
    saveProfile({ statusKind: next });
    status = `Статус: ${STATUS_LABEL[next] || next}`;
  }

  function toggleGhost() {
    hideGame = !hideGame;
    saveProfile({ hideGame });
    status = hideGame ? 'Игра скрыта от друзей' : 'Игра снова видна друзьям';
  }

  function signOut() {
    status = '';
    logout();
  }

  let friendNick = '';
  let friendNote = '';
  let friendView: 'all' | 'online' | 'requests' | 'add' = 'all';
  let friendQuery = '';

  $: onlineFriends = friends.filter((f) => f.online);
  $: friendRequests = $online.friendRequests ?? [];
  $: friendQueryLower = friendQuery.trim().toLowerCase();
  $: visibleFriends = friendView === 'online'
    ? onlineFriends.filter((f) => !friendQueryLower || f.name.toLowerCase().includes(friendQueryLower))
    : friends.filter((f) => !friendQueryLower || f.name.toLowerCase().includes(friendQueryLower));

  function submitFriend() {
    const ref = friendNick.trim();
    friendNote = '';
    if (!ref) { friendNote = 'Введите ник или ID игрока'; return; }
    const name = ref.toLowerCase();
    if (friends.some((f) => f.name.toLowerCase() === name)) { friendNote = 'Этот игрок уже в друзьях'; return; }
    if ($online.friendSent.includes(name)) { friendNote = 'Заявка уже отправлена — ждём ответа'; return; }
    sendFriendRequest(ref);
    friendNick = '';
    friendNote = /^\d+$/.test(ref) ? `Заявка по ID ${ref} отправлена` : `Заявка отправлена: ${name}`;
  }

  async function dropFriend(name: string) {
    if (
      !(await ask({
        title: 'Удалить из друзей?',
        message: `${name} больше не будет отображаться в списке друзей.`,
        okLabel: 'Удалить',
        danger: true,
      }))
    )
      return;
    removeFriend(name);
  }

  function submitComplaint() {
    cmpStatus = '';
    if (!cmpTarget.trim() || cmpReason.trim().length < 5) {
      cmpStatus = 'Укажите ник и причину (от 5 символов)';
      return;
    }
    sendComplaint(cmpTarget, cmpReason);
    cmpTarget = '';
    cmpReason = '';
    cmpStatus = 'Жалоба отправлена администратору';
  }

  function goProfile() {
    tab = 'profile';
  }

  $: viewed = $online.viewed;

  function openProfile(user: string) {
    requestProfileView(user);
  }

  function closeProfile() {
    requestProfileClear();
  }

  function submitFriendNick(name: string) {
    sendFriendRequest(name);
    status = `Заявка отправлена: ${name}`;
    setTimeout(() => { if (status.startsWith('Заявка отправлена')) status = ''; }, 4000);
  }

  function writeToViewed() {
    if (!viewed) return;
    openChat(viewed.displayName || viewed.name);
  }

  function complainAboutViewed() {
    if (!viewed) return;
    cmpTarget = viewed.displayName || viewed.name;
    cmpReason = '';
    cmpStatus = '';
    closeProfile();
    tab = 'complaint';
  }

  function editViewedProfile() {
    closeProfile();
    tab = 'edit';
  }

  function openViewedAchievements() {
    closeProfile();
    tab = 'achievements';
  }

  let feedAuthSeen = false;
  $: if (authed !== feedAuthSeen) {
    feedAuthSeen = authed;
    if (authed) requestFeed();
  }

  $: canPublish = !!draft.trim() || postImages.length > 0 || pollReady;
  $: pollReady = pollOpen && !!pollQuestion.trim() && pollOptions.filter((o) => o.trim()).length >= 2;

  function insertEmoji(emoji: string) {
    draft = (draft + emoji).slice(0, POST_MAX);
    emojiOpen = false;
  }

  function togglePoll() {
    pollOpen = !pollOpen;
    if (!pollOpen) {
      pollQuestion = '';
      pollOptions = ['', ''];
    }
  }

  function addPollOption() {
    if (pollOptions.length < 4) pollOptions = [...pollOptions, ''];
  }

  function removePollOption(index: number) {
    if (pollOptions.length <= 2) return;
    pollOptions = pollOptions.filter((_, i) => i !== index);
  }

  async function onPostFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const list = Array.from(files);
    for (const file of list) {
      if (postImages.length >= POST_MAX_IMAGES) {
        status = `Можно прикрепить до ${POST_MAX_IMAGES} фото`;
        break;
      }
      if (!/^image\/(jpeg|jpg|png|webp|gif|bmp)$/.test(file.type)) {
        status = 'Поддерживаются JPG, PNG, WEBP, GIF и BMP';
        continue;
      }
      if (file.size > POST_IMAGE_MAX_BYTES) {
        status = 'Фото больше 900 КБ';
        continue;
      }
      try {
        const dataUrl = await readFileAsDataUrl(file);
        postImages = [...postImages, dataUrl];
      } catch {
        status = 'Не удалось прочитать файл';
      }
    }
  }

  async function pickPostImages() {
    if (postImages.length >= POST_MAX_IMAGES) {
      status = `Можно прикрепить до ${POST_MAX_IMAGES} фото`;
      return;
    }
    try {
      const picked = await open({
        multiple: true,
        filters: [{ name: 'Изображения', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'] }],
      });
      if (!picked) return;
      const paths = Array.isArray(picked) ? picked : [picked];
      for (const path of paths) {
        if (postImages.length >= POST_MAX_IMAGES) break;
        try {
          const bytes = await invoke<number[]>('read_avatar_file', { path: String(path) });
          if (bytes.length > POST_IMAGE_MAX_BYTES) {
            status = 'Фото больше 900 КБ';
            continue;
          }
          const ext = String(path).split('.').pop()?.toLowerCase() || 'jpg';
          const mime = ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : ext === 'webp' ? 'image/webp' : ext === 'bmp' ? 'image/bmp' : 'image/jpeg';
          postImages = [...postImages, `data:${mime};base64,${toBase64(bytes)}`];
        } catch {
          status = 'Не удалось прочитать файл';
        }
      }
    } catch (e) {
      status = `Не удалось прикрепить фото: ${String(e)}`;
    }
  }

  function removePostImage(index: number) {
    postImages = postImages.filter((_, i) => i !== index);
  }

  function resetComposer() {
    draft = '';
    postImages = [];
    postGame = '';
    pollOpen = false;
    pollQuestion = '';
    pollOptions = ['', ''];
    emojiOpen = false;
    gamePickerOpen = false;
  }

  function publishPost() {
    if (!authed || postBusy || !canPublish) return;
    const payload: PostDraft = {
      text: draft.trim(),
      images: postImages,
      game: postGame,
      visibility: postVisibility,
      poll: pollReady
        ? { question: pollQuestion.trim(), options: pollOptions.map((o) => o.trim()).filter(Boolean) }
        : null,
    };
    postBusy = true;
    createFeedPost(payload);
    resetComposer();
    setTimeout(() => {
      postBusy = false;
      requestFeed();
    }, 900);
  }

  function removePost(post: FeedPost) {
    deletePost(post.id);
  }

  function toggleComments(id: string) {
    openComments = openComments === id ? null : id;
  }

  function sendComment(id: string) {
    const text = (commentDraft[id] || '').trim();
    if (!text) return;
    commentPost(id, text);
    commentDraft = { ...commentDraft, [id]: '' };
  }

  function visibilityLabel(value: string): string {
    if (value === 'public') return 'Все';
    if (value === 'private') return 'Только я';
    return 'Друзья';
  }

  function pollPercent(post: FeedPost, votes: number): number {
    const total = post.poll ? post.poll.total : 0;
    if (!total) return 0;
    return Math.round((votes / total) * 100);
  }

  function authorInitials(name: string): string {
    const clean = (name || '').replace(/^Вы$/, 'Вы');
    return clean.slice(0, 1).toUpperCase();
  }

  function postWhen(ts: number): string {
    const min = Math.floor((Date.now() - ts) / 60000);
    if (min < 1) return 'только что';
    if (min < 60) return `${min} мин назад`;
    const h = Math.floor(min / 60);
    if (h < 24) return `${h} ч назад`;
    const d = Math.floor(h / 24);
    if (d < 7) return d === 1 ? 'вчера' : `${d} дн назад`;
    return new Date(ts).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  }

  onMount(async () => {
    if (authed) requestFeed();
    try {
      const saved = localStorage.getItem('profile_color');
      if (saved) color = saved;
    } catch {}
    if (authed) {
      try {
        activity = await invoke<{ id: string; ts: number }[]>('get_activity');
      } catch {}
      try {
        const prefs = await invoke<{ usage: Record<string, { count: number; last: number }> }>('get_prefs');
        usage = prefs.usage || {};
      } catch {}
    }
  });
</script>

<div class="profile">
  {#if status}<p class="status">{status}</p>{/if}
  {#if $online.error}<p class="status err">{$online.error}</p>{/if}

  <div class="shell">
    <aside class="side">
      <nav class="nav-list">
        {#each NAV as item (item.id)}
          <button
            class:active={tab === item.id}
            title={item.label}
            on:click={() => openTab(item.id)}
          >
            <span class="nav-ic"><Icon name={item.icon} size={17} /></span>
            <span class="nav-label">{item.label}</span>
            {#if item.id === 'friends' && friends.length > 0}
              <span class="nav-count">{friends.length}</span>
            {:else if item.id === 'groups' && myGroups.length > 0}
              <span class="nav-count">{myGroups.length}</span>
            {:else if item.id === 'achievements' && totalCount > 0}
              <span class="nav-count">{doneCount}/{totalCount}</span>
            {:else if item.id === 'servers' && myServers.length > 0}
              <span class="nav-count">{myServers.length}</span>
            {/if}
          </button>
        {/each}
      </nav>
      {#if authed}
        <div class="side-foot">
          <button class="side-logout" on:click={signOut} title="Выйти">
            <Icon name="logout" size={16} />
            <span>Выйти</span>
          </button>
        </div>
      {/if}
    </aside>

    <main class="main">
      {#if !authed && tab !== 'profile'}
        <section class="panel intro">
          <h2>Вход в онлайн</h2>
          <p class="muted small">Войдите, чтобы настроить статус, видеть достижения и управлять серверами. Регистрация бесплатная.</p>
          <div class="btns">
            <button class="primary" on:click={() => onOpenAuth('login')}>Войти</button>
            <button class="ghost" on:click={() => onOpenAuth('register')}>Создать аккаунт</button>
          </div>
        </section>
      {:else if tab === 'gifts'}
        <section class="panel">
          <div class="ach-head">
            <h3>Подарки</h3>
            <span class="muted small">{$online.coins} монет</span>
          </div>
          <p class="muted small">Выберите стикер в подарок: себе — он появится у вашего аватара, или другому пользователю.</p>

          <div class="gift-legend">
            <span class="gl-item"><i class="gl-dot legendary"></i>Крутые</span>
            <span class="gl-item"><i class="gl-dot epic"></i>Эпические</span>
            <span class="gl-item"><i class="gl-dot rare"></i>Редкие</span>
            <span class="gl-item"><i class="gl-dot common"></i>Обычные</span>
          </div>

          {#each $online.gifts as cat (cat.id)}
            <div class="gift-cat">
              <div class="gift-cat-head">
                <span class="gift-cat-icon">{cat.icon}</span>
                <span class="gift-cat-name">{cat.name}</span>
                {#if cat.note}<span class="gift-cat-note">{cat.note}</span>{/if}
              </div>
              <div class="gifts-grid">
                {#each cat.items as g (g.id)}
                  {#if giftImgFor(g)}
                    <button
                      class="gift-card gift-card-3d"
                      class:active={$online.activeGift === g.id}
                      data-rarity={g.rarity}
                      on:click={() => openGiftCard(g)}
                    >
                      <span class="gift-3d-stage"><img src={giftImgFor(g)} alt={g.name} /></span>
                      <span class="gift-name">{g.name}</span>
                      <span class="gift-rarity">{g.rarity}</span>
                      <span class="gift-price">{g.price} монет</span>
                    </button>
                  {:else}
                    <button
                      class="gift-card"
                      class:active={$online.activeGift === g.id}
                      data-rarity={g.rarity}
                      on:click={() => openGiftCard(g)}
                    >
                      <span class="gift-emoji">{g.emoji}</span>
                      <span class="gift-name">{g.name}</span>
                      <span class="gift-price">{g.price} монет</span>
                    </button>
                  {/if}
                {/each}
              </div>
            </div>
          {/each}

          {#if $online.activeGift}
            <div class="gift-active-row">
              <span class="muted small">Активный у аватара:</span>
              <button class="btn-mini" on:click={() => giftSetActive('')}>Убрать подарок</button>
            </div>
          {/if}
        </section>
      {:else if tab === 'profile'}
        <div class="dash">
          <header class="dash-hero" style={coverStyle(dCover)}>
<div class="dash-avatar-wrap">
            <button
              class="dash-avatar"
              style="background: {color};{dFrame !== 'none' ? `box-shadow:${frameCss(dFrame)};` : ''}"
              title="Выбрать аватар"
              on:click={() => (avatarGalleryOpen = true)}
            >
              {#if avatarUrl}<img src={avatarUrl} alt="Аватар" />{:else}<span>{initials}</span>{/if}
            </button>
            {#if activeGiftEmoji}
              <span class="dash-gift" title="Полученный подарок">{activeGiftEmoji}</span>
            {/if}
          </div>
            <div class="dash-hero-main">
              {#if authed}
                <div class="dash-bio-edit">
                  <input
                    class="dash-bio-in"
                    placeholder="Расскажи о себе ;)"
                    maxlength="300"
                    bind:value={bioDraft}
                    on:focus={() => (bioFocused = true)}
                    on:blur={commitBio}
                    on:keydown={onBioKey}
                  />
                  {#if bioDraft}
                    <button
                      class="dash-bio-clear"
                      title="Очистить"
                      on:mousedown|preventDefault
                      on:click={clearBio}
                    >✕</button>
                  {/if}
                </div>
              {:else}
                <button class="dash-quick" on:click={() => onOpenAuth('login')}>Войти в онлайн</button>
              {/if}
              <span class="dash-online" class:off={!authed}><span class="dot"></span>{authed ? (STATUS_LABEL[statusKind] || 'в сети') : 'не в сети'}</span>
              <div class="dash-name">
                <strong>{authed ? $online.user : 'Гость'}</strong>
                {#if $online.isAdmin}<span class="tag admin">админ</span>{/if}
                {#each earnedBadges.slice(0, 3) as b (b.id)}
                  <span class="badge-chip" title={b.label}><AchIcon metric={b.metric} size={13} /></span>
                {/each}
              </div>
            </div>
<div class="dash-subs">
              <Icon name="users" size={16} />
              <span>Всего подписчиков: <strong>{friends.length}</strong></span>
            </div>

            {#if ownedGifts.length > 0}
              <div class="gift-rail">
                <div class="gift-rail-scroll">
                  {#each ownedGifts.slice(0, 8) as g (g.id)}
                    <button
                      class="gift-rail-item"
                      class:active={$online.activeGift === g.id}
                      title={g.name}
                      on:click={() => giftSetActive($online.activeGift === g.id ? '' : g.id)}
                    ><span class="gift-emoji">{g.emoji}</span></button>
                  {/each}
                </div>
                <button class="gift-rail-open" title="Выбрать подарок" on:click={() => (giftPanelOpen = !giftPanelOpen)}>
                  {giftPanelOpen ? '✕' : '+ {ownedGifts.length}'}
                </button>
              </div>
              {#if giftPanelOpen}
                <div class="gift-rail-panel">
                  {#each ownedGifts as g (g.id)}
                    <button
                      class="gift-rail-pick"
                      class:active={$online.activeGift === g.id}
                      on:click={() => { giftSetActive($online.activeGift === g.id ? '' : g.id); }}
                    ><span class="gift-emoji">{g.emoji}</span><span>{g.name}</span></button>
                  {/each}
                  <button class="gift-rail-pick clear" on:click={() => giftSetActive('')}>Без подарка</button>
                </div>
              {/if}
            {/if}
          </header>

          <div class="dash-stats">
            <div class="dstat c-blue"><strong>{progress ? progress.days : 0}</strong><span>дней</span><em>Стаж в гейминстале</em></div>
            <div class="dstat c-green"><strong>{progress ? progress.hours : 0}</strong><span>часов</span><em>Проведено в играх</em></div>
<div class="dstat c-purple"><strong>{gamesCount > 0 ? gamesCount : 'Пусто'}</strong><span></span><em>В коллекции</em></div>
            <div class="dstat c-pink"><strong>{$online.onlineNow.length}</strong><span></span><em>Онлайн игры</em></div>
            <div class="dstat c-gold"><strong>{$online.authed ? $online.coins : 0}</strong><span>монет</span><em>Зарабатывайте голосами и входом</em></div>
          </div>

          <div class="dash-grid">
            <div class="dash-col">
              <section class="dpanel">
                <div class="dpanel-head"><Icon name="chart" size={15} /><h3>Недавняя активность</h3></div>
                {#if recentActivity.length === 0}
                  <div class="dempty">
                    <strong>Начинай играть!</strong>
                    <p>Здесь появится твоя статистика последних запущенных игр и время, проведённое в игре</p>
                  </div>
                {:else}
                  <div class="dfeed">
                    {#each recentActivity.slice(0, 6) as ev (ev.id + ev.ts)}
                      <div class="dfeed-row"><Icon name="gamepad" size={14} /><span class="dfeed-txt">{gameName(ev.id)}</span><span class="muted small">{when(ev.ts * 1000)}</span></div>
                    {/each}
                  </div>
                {/if}
              </section>

              <section class="dpanel">
                <div class="dpanel-head"><Icon name="trophy" size={15} /><h3>Достижения</h3></div>
                {#if doneCount > 0}
                  <div class="dach-line"><strong>{doneCount}/{totalCount}</strong><span class="muted small">достижений · рейтинг {achiScore}</span></div>
                  <button class="ghost" on:click={() => (tab = 'achievements')}>Все достижения</button>
                {:else}
                  <div class="dempty"><p>Мы уже работаем над этим 😊</p></div>
                {/if}
              </section>
            </div>

            <div class="dash-col center">
              <section class="dpanel composer">
                <div class="composer-top">
                  <h3>Создать публикацию</h3>
                  <select class="vis-select" bind:value={postVisibility} title="Кто увидит публикацию">
                    <option value="public">Все</option>
                    <option value="friends">Друзья</option>
                    <option value="private">Только я</option>
                  </select>
                </div>
                {#if !authed}
                  <div class="composer-guest">
                    <p>Публикации доступны после входа в онлайн.</p>
                    <button class="ghost" on:click={() => onOpenAuth('login')}>Войти</button>
                  </div>
                {:else}
                  <div class="composer-row">
                    <span class="composer-ava">{#if avatarUrl}<img src={avatarUrl} alt="" />{:else}{initials}{/if}</span>
                    <textarea
                      id="profile-composer"
                      bind:value={draft}
                      rows="3"
                      maxlength={POST_MAX}
                      placeholder="Что у вас нового?"
                      on:dragover|preventDefault={() => (postDragging = true)}
                      on:dragleave={() => (postDragging = false)}
                      on:drop|preventDefault={(e) => { postDragging = false; onPostFiles(e.dataTransfer?.files ?? null); }}
                      class:dragging={postDragging}
                    ></textarea>
                  </div>

                  {#if postImages.length > 0}
                    <div class="composer-media">
                      {#each postImages as img, i (img.slice(-32) + i)}
                        <div class="media-item">
                          <img src={img} alt="" />
                          <button class="media-del" title="Убрать" on:click={() => removePostImage(i)}>✕</button>
                        </div>
                      {/each}
                    </div>
                  {/if}

                  {#if postGame}
                    <div class="composer-chips">
                      <span class="chip game"><Icon name="gamepad" size={12} /> {postGame}<button class="chip-x" on:click={() => (postGame = '')}>✕</button></span>
                    </div>
                  {/if}

                  {#if pollOpen}
                    <div class="poll-editor">
                      <div class="poll-editor-head">
                        <span>Опрос</span>
                        <button class="chip-x" on:click={togglePoll}>✕</button>
                      </div>
                      <input bind:value={pollQuestion} maxlength="140" placeholder="Вопрос" />
                      {#each pollOptions as _, i}
                        <div class="poll-opt-row">
                          <input bind:value={pollOptions[i]} maxlength="80" placeholder="Вариант {i + 1}" />
                          {#if pollOptions.length > 2}
                            <button class="chip-x" on:click={() => removePollOption(i)}>✕</button>
                          {/if}
                        </div>
                      {/each}
                      {#if pollOptions.length < 4}
                        <button class="ghost small" on:click={addPollOption}>+ вариант</button>
                      {/if}
                    </div>
                  {/if}

                  {#if gamePickerOpen}
                    <div class="picker game-picker">
                      {#if games.length === 0}
                        <p class="muted small">В библиотеке пока нет игр.</p>
                      {:else}
                        {#each games.slice(0, 14) as g (g.id)}
                          <button class="picker-item" on:click={() => { postGame = g.name; gamePickerOpen = false; }}>{g.name}</button>
                        {/each}
                      {/if}
                    </div>
                  {/if}

                  {#if emojiOpen}
                    <div class="picker emoji-picker">
                      {#each EMOJIS as emoji}
                        <button class="emoji-btn" on:click={() => insertEmoji(emoji)}>{emoji}</button>
                      {/each}
                    </div>
                  {/if}

                  <div class="composer-foot">
                    <div class="composer-tools">
                      <button class="tool" title="Фото" on:click={pickPostImages} disabled={postImages.length >= POST_MAX_IMAGES}>
                        <Icon name="image" size={16} />
                      </button>
                      <button class="tool" title="Эмодзи" class:on={emojiOpen} on:click={() => (emojiOpen = !emojiOpen)}>
                        <Icon name="smile" size={16} />
                      </button>
                      <button class="tool" title="Игра" class:on={gamePickerOpen} on:click={() => (gamePickerOpen = !gamePickerOpen)}>
                        <Icon name="gamepad" size={16} />
                      </button>
                      <button class="tool" title="Опрос" class:on={pollOpen} on:click={togglePoll}>
                        <Icon name="chart" size={16} />
                      </button>
                      <span class="composer-count" class:over={draft.length > POST_MAX - 100}>{draft.length}/{POST_MAX}</span>
                    </div>
                    <button class="primary" on:click={publishPost} disabled={!canPublish || postBusy}>Опубликовать</button>
                  </div>
                {/if}
              </section>

              <div class="feed-head">
                <span class="feed-title">Лента</span>
                <span class="muted small">{$online.feedLoading ? 'обновляем…' : 'вы и ваши друзья'}</span>
              </div>

              {#if $online.feed.length === 0}
                <div class="dempty big">
                  <strong>Здесь пока тихо…</strong>
                  <p>Расскажите о своих приключениях: как победили босса или какую новую игру открыли для себя.</p>
                  <button class="ghost" on:click={() => { const el = document.getElementById('profile-composer'); if (el) el.focus(); }}>Создать публикацию</button>
                </div>
              {:else}
                <div class="post-list">
                  {#each $online.feed as p (p.id)}
                    <article class="post">
                      <span class="post-ava">{#if p.avatar}<img src={p.avatar} alt="" />{:else}{authorInitials(p.author)}{/if}</span>
                      <div class="post-body">
                        <div class="post-head">
                          <strong>{p.author}</strong>
                          {#if p.game}<span class="post-game"><Icon name="gamepad" size={11} /> {p.game}</span>{/if}
                          <span class="muted small">{postWhen(p.ts)}</span>
                          <span class="vis-tag">{visibilityLabel(p.visibility)}</span>
                        </div>
                        {#if p.text}<p>{p.text}</p>{/if}
                        {#if p.images.length > 0}
                          <div class="post-media" class:one={p.images.length === 1} class:two={p.images.length === 2}>
                            {#each p.images as img, i}
                              <img src={img} alt="Вложение {i + 1}" />
                            {/each}
                          </div>
                        {/if}
                        {#if p.poll}
                          <div class="post-poll">
                            <div class="poll-question">{p.poll.question}</div>
                            {#each p.poll.options as opt, i}
                              <button class="poll-option" class:on={p.poll.voted === i} on:click={() => votePost(p.id, i)}>
                                <span class="poll-fill" style="width:{pollPercent(p, opt.votes)}%"></span>
                                <span class="poll-text">{opt.text}</span>
                                <span class="poll-num">{pollPercent(p, opt.votes)}%</span>
                              </button>
                            {/each}
                            <span class="muted small">{p.poll.total} голосов · нажмите, чтобы проголосовать</span>
                          </div>
                        {/if}
                        <div class="post-actions">
                          <button class="post-act" class:on={p.liked} on:click={() => likePost(p.id)}>
                            <Icon name={p.liked ? 'heart' : 'like'} size={14} />{p.likes > 0 ? p.likes : ''}
                          </button>
                          <button class="post-act" class:on={openComments === p.id} on:click={() => toggleComments(p.id)}>
                            <Icon name="message" size={14} />{p.commentsCount > 0 ? p.commentsCount : ''}
                          </button>
                          {#if p.mine || $online.isAdmin}
                            <button class="post-act danger" title={p.mine ? 'Удалить' : 'Удалить как админ'} on:click={() => removePost(p)}>
                              <Icon name="close" size={14} />
                            </button>
                          {/if}
                        </div>
                        {#if openComments === p.id}
                          <div class="post-comments">
                            {#if p.comments.length === 0}
                              <p class="muted small">Комментариев пока нет.</p>
                            {/if}
                            {#each p.comments as c (c.id)}
                              <div class="pcomment">
                                <span class="pc-ava">{#if c.avatar}<img src={c.avatar} alt="" />{:else}{authorInitials(c.by)}{/if}</span>
                                <div class="pc-body"><strong>{c.by}</strong><p>{c.text}</p></div>
                              </div>
                            {/each}
                            <form class="pc-form" on:submit|preventDefault={() => sendComment(p.id)}>
                              <input bind:value={commentDraft[p.id]} maxlength="500" placeholder="Комментарий…" />
                              <button class="primary small" type="submit">→</button>
                            </form>
                          </div>
                        {/if}
                      </div>
                    </article>
                  {/each}
                </div>
              {/if}
            </div>

            <div class="dash-col">
              <section class="dpanel">
                <div class="dpanel-head"><Icon name="book" size={15} /><h3>Досье</h3></div>
                <div class="dossier">
                  <div><span>Дата рождения:</span><b>{dBirth ? formatBirth(dBirth) : '—'}</b></div>
                  <div><span>Пол:</span><b>{dGender === 'm' ? 'Мужской' : dGender === 'f' ? 'Женский' : '—'}</b></div>
                  <div><span>Страна:</span><b>{dCountry || '—'}</b></div>
                  <div><span>Город:</span><b>{dCity || '—'}</b></div>
                </div>
                <button class="ghost" on:click={() => (authed ? (tab = 'edit') : onOpenAuth('login'))}>
                  <Icon name="settings" size={14} /><span>Изменить в настройках</span>
                </button>
              </section>

              <section class="dpanel">
                <div class="dpanel-head"><Icon name="users" size={15} /><h3>Мои подписки <span class="muted">{friends.length}</span></h3></div>
                {#if friends.length === 0}
                  <div class="dempty">
                    <p>Здесь пока никого…</p>
                    <span class="muted small">Пора найти интересные страницы авторов и друзей!</span>
                  </div>
                  <button class="ghost" on:click={onOpenPlayers}><Icon name="users" size={14} /> Найти игрока</button>
                {:else}
                  <div class="dfeed">
                    {#each friends.slice(0, 5) as f (f.name)}
                      <div class="dfeed-row"><Icon name="user" size={14} /><span class="dfeed-txt">{f.name}</span></div>
                    {/each}
                  </div>
                  <button class="ghost" on:click={() => (tab = 'friends')}>Все друзья</button>
                {/if}
              </section>
            </div>
          </div>
        </div>
      {:else if tab === 'edit'}
        <section class="panel pset">
          <h2>Настройки профиля</h2>
          {#if !authed}
            <p class="muted small">Войдите, чтобы изменить настройки профиля.</p>
            <button class="primary" on:click={() => onOpenAuth('login')}>Войти</button>
          {:else}
            <div class="pform">
              <label class="pf"><span>Логин</span><input class="dossier-in pf-in" readonly value={$online.user} /></label>
              <label class="pf"><span>Почта</span><input class="dossier-in pf-in" readonly value={$online.email || 'не указана'} /></label>
              <label class="pf"><span>Имя</span><input class="dossier-in pf-in" maxlength="40" placeholder="Ваше имя" bind:value={dFirst} /></label>
              <label class="pf"><span>Фамилия</span><input class="dossier-in pf-in" maxlength="40" placeholder="Ваша фамилия" bind:value={dLast} /></label>
              <label class="pf">
                <span>Пол</span>
                <select class="dossier-in pf-in" bind:value={dGender}>
                  <option value="">Выберите пол</option>
                  <option value="m">Мужской</option>
                  <option value="f">Женский</option>
                </select>
              </label>
              <label class="pf"><span>Страна</span><input class="dossier-in pf-in" maxlength="40" placeholder="Ваша страна" bind:value={dCountry} /></label>
              <label class="pf"><span>Город</span><input class="dossier-in pf-in" maxlength="40" placeholder="Ваш город" bind:value={dCity} /></label>
              <label class="pf"><span>Дата рождения</span><input class="dossier-in pf-in" type="date" bind:value={dBirth} /></label>
            </div>
            <div class="pform-actions">
              <button class="primary" on:click={saveProfileForm}>Сохранить</button>
              <button class="ghost" on:click={resetProfileForm}>Сбросить поля</button>
            </div>

            <div class="pset-block">
              <h3>Оформление профиля</h3>
              <div class="pset-actions">
                <button class="ghost" on:click={() => (avatarGalleryOpen = true)}>
                  <Icon name="user" size={14} /><span>Аватар</span>
                </button>
                <button
                  class="ghost"
                  disabled={!canCover}
                  title={canCover ? 'Сменить обложку' : 'Откроется на 2 уровне'}
                  on:click={() => { if (canCover) coverPickerOpen = true; }}
                >
                  <Icon name="book" size={14} /><span>Обложка{canCover ? '' : ' · закрыто'}</span>
                </button>
                <button
                  class="ghost"
                  disabled={!canFrame}
                  title={canFrame ? 'Сменить рамку' : 'Откроется на 3 уровне или за 2 достижения'}
                  on:click={() => { if (canFrame) framePickerOpen = true; }}
                >
                  <Icon name="star" size={14} /><span>Рамка{canFrame ? '' : ' · закрыто'}</span>
                </button>
              </div>
              <p class="pset-hint">
                Уровень {levelNumber} · достижений {doneCount}. Обложка — со 2 уровня{canCover ? ' (открыта)' : ''}.
                Рамка — с 3 уровня или за 2 достижения{canFrame ? ' (открыта)' : ''}.
              </p>
            </div>

            <div class="pset-block">
              <h3>Приватность</h3>
              <p class="pset-hint">Кто видит данные профиля. Изменения сохраняются сразу.</p>

              <div class="priv-row">
                <div class="priv-head">
                  <span>Мой профиль:</span>
                  <select class="dossier-in priv-sel" value={$online.privacy.profile} on:change={(e) => privacyChange('profile', e.currentTarget.value)}>
                    <option value="everyone">Открытый</option>
                    <option value="friends">Только друзья</option>
                    <option value="nobody">Скрытый</option>
                  </select>
                </div>
                <p class="priv-desc">Био, досье, достижения и подписки. «Скрытый» оставляет другим только ник.</p>
              </div>

              <div class="priv-row">
                <div class="priv-head">
                  <span>Доступ к игровой информации:</span>
                  <select class="dossier-in priv-sel" value={$online.privacy.game} on:change={(e) => privacyChange('game', e.currentTarget.value)}>
                    <option value="everyone">Открытый</option>
                    <option value="friends">Только друзья</option>
                    <option value="nobody">Скрытый</option>
                  </select>
                </div>
                <p class="priv-desc">Статус «во что играет» и название запущенной игры.</p>
                <label class="priv-check">
                  <input type="checkbox" checked={!!$online.profile.hideGame} on:change={() => saveProfile({ hideGame: !$online.profile.hideGame })} />
                  <span>Скрывать игру, даже если видны другие данные</span>
                </label>
              </div>

              <div class="priv-row">
                <div class="priv-head">
                  <span>Список друзей:</span>
                  <select class="dossier-in priv-sel" value={$online.privacy.friends} on:change={(e) => privacyChange('friends', e.currentTarget.value)}>
                    <option value="everyone">Открытый</option>
                    <option value="friends">Только друзья</option>
                    <option value="nobody">Скрытый</option>
                  </select>
                </div>
                <p class="priv-desc">Кому видны подписки и подписчики.</p>
              </div>

              <div class="priv-row">
                <div class="priv-head">
                  <span>Фото профиля:</span>
                  <select class="dossier-in priv-sel" value={$online.privacy.photo} on:change={(e) => privacyChange('photo', e.currentTarget.value)}>
                    <option value="everyone">Все</option>
                    <option value="friends">Только друзья</option>
                    <option value="nobody">Никто</option>
                  </select>
                </div>
                <p class="priv-desc">Аватар в профиле и карточках игроков.</p>
              </div>

              <div class="priv-row">
                <div class="priv-head">
                  <span>Последняя активность:</span>
                  <select class="dossier-in priv-sel" value={$online.privacy.lastSeen} on:change={(e) => privacyChange('lastSeen', e.currentTarget.value)}>
                    <option value="everyone">Все</option>
                    <option value="friends">Только друзья</option>
                    <option value="nobody">Никто</option>
                  </select>
                </div>
                <p class="priv-desc">Когда вы последний раз были в сети.</p>
              </div>

              <div class="priv-row">
                <div class="priv-head">
                  <span>Кто может писать:</span>
                  <select class="dossier-in priv-sel" value={$online.privacy.messages} on:change={(e) => privacyChange('messages', e.currentTarget.value)}>
                    <option value="everyone">Все</option>
                    <option value="friends">Только друзья</option>
                  </select>
                </div>
                <p class="priv-desc">Личные сообщения.</p>
              </div>

              <div class="priv-row">
                <div class="priv-head">
                  <span>Добавление в друзья:</span>
                  <select class="dossier-in priv-sel" value={$online.privacy.friendRequests} on:change={(e) => privacyChange('friendRequests', e.currentTarget.value)}>
                    <option value="everyone">Все</option>
                    <option value="nobody">Никто</option>
                  </select>
                </div>
                <p class="priv-desc">Могут ли отправлять вам заявки.</p>
              </div>

              <div class="priv-row">
                <div class="priv-head">
                  <span>Кто видит ваше имя:</span>
                  <select class="dossier-in priv-sel" value={$online.privacy.showName} on:change={(e) => privacyChange('showName', e.currentTarget.value)}>
                    <option value="everyone">Все</option>
                    <option value="friends">Только друзья</option>
                    <option value="nobody">Никто</option>
                  </select>
                </div>
                <p class="priv-desc">Если скрыть, другие увидят «Игрок N».</p>
              </div>

              <div class="pv-card">
                <p class="pv-title">Так вас видят другие игроки</p>
                <div class="pv-row"><span>Ник</span><b>{$online.privacy.showName === 'nobody' ? `Игрок ${$online.uid ?? ''}` : $online.user}</b></div>
                <div class="pv-row"><span>Аватар</span><b>{visLabel($online.privacy.photo)}</b></div>
                <div class="pv-row"><span>Профиль и досье</span><b>{visLabel($online.privacy.profile)}</b></div>
                <div class="pv-row"><span>Игра</span><b>{$online.profile.hideGame ? 'скрыта' : visLabel($online.privacy.game)}</b></div>
                <div class="pv-row"><span>Друзья и подписки</span><b>{visLabel($online.privacy.friends)}</b></div>
                <div class="pv-row"><span>Последний визит</span><b>{visLabel($online.privacy.lastSeen)}</b></div>
                <p class="pv-note">Свой профиль вы видите полностью — эти правила действуют для остальных.</p>
              </div>
            </div>
          {/if}
        </section>
      {:else if tab === 'achievements'}
        <section class="panel">
          <div class="ach-head">
            <h3>Достижения</h3>
            <span class="muted small">{doneCount} из {totalCount}</span>
          </div>
          <p class="muted small">Коллекция койнов: обычные, редкие, эпические и легендарные. Собирайте редкости, чтобы поднять рейтинг.</p>
          {#if progress}
            <div class="prestige-strip">
              <div class="prestige-item">
                <strong>{achiScore}<span class="of">/{achiMax}</span></strong>
                <span class="muted small">рейтинг</span>
              </div>
              <div class="prestige-item gold">
                <strong>{legendaryDone}</strong>
                <span class="muted small">легендарных</span>
              </div>
              <div class="prestige-item">
                <strong>{progress.achievements.filter((a) => a.done && rarityKey(a) === 'epic').length}</strong>
                <span class="muted small">эпических</span>
              </div>
              <div class="prestige-item">
                <strong>{progress.achievements.filter((a) => a.done && rarityKey(a) === 'rare').length}</strong>
                <span class="muted small">редких</span>
              </div>
            </div>
            <div class="coins-grid">
              {#each progress.achievements as ach (ach.id)}
                <div
                  class="coin big"
                  class:done={ach.done}
                  class:rare={rarityKey(ach) === 'rare'}
                  class:epic={rarityKey(ach) === 'epic'}
                  class:leg={rarityKey(ach) === 'legendary'}
                  title="{ach.name} · {rarityLabel(rarityKey(ach))} · {Math.min(ach.value, ach.need)}/{ach.need}{ach.desc ? ' · ' + ach.desc : ''}{ach.reward && ach.reward.label ? ' · Награда: ' + ach.reward.label : ''}"
                >
<span class="coin-face" class:locked={!ach.done}>
                    {#if achImgFor(ach)}
                      <span class="ach-3d-stage"><img src={achImgFor(ach)} alt={ach.name} /></span>
                    {:else}
                      <AchIcon metric={ach.metric} size={27} />
                    {/if}
                    {#if !ach.done}<span class="coin-lock"><AchIcon metric="lock" size={10} /></span>{/if}
                  </span>
                  {#if !ach.done}<span class="coin-pct">{Math.min(100, ach.pct)}%</span>{/if}
                  <span class="coin-name">{ach.name}</span>
                  <span class="coin-rarity">{rarityLabel(rarityKey(ach))}</span>
                </div>
              {/each}
            </div>
          {:else}
            <p class="muted small">Достижения появятся после входа.</p>
          {/if}
        </section>

      {:else if tab === 'friends'}
        <section class="panel">
          <div class="fsub-tabs">
            <button class:active={friendView === 'all'} on:click={() => { friendView = 'all'; }}>Друзья <span class="fcount">{friends.length}</span></button>
            <button class:active={friendView === 'online'} on:click={() => { friendView = 'online'; }}>Онлайн <span class="fcount">{onlineFriends.length}</span></button>
            <button class:active={friendView === 'requests'} on:click={() => { friendView = 'requests'; requestFriendRequests(); }}>Заявки в друзья {#if friendRequests.length > 0}<span class="fcount hot">{friendRequests.length}</span>{/if}</button>
          </div>
          <div class="fbar">
            <div class="fsearch">
              <Icon name="support" size={15} />
              <input bind:value={friendQuery} placeholder="Поиск" spellcheck="false" />
            </div>
            <button class="primary" on:click={() => { friendView = 'add' }}>+ Добавить друзей</button>
          </div>
          {#if friendNote}<p class="muted small friend-note">{friendNote}</p>{/if}

          {#if friendView === 'add'}
            <div class="fadd-panel">
              <p class="muted small">Введите ник или числовой ID игрока (например, {authed && $online.uid ? $online.uid : '289102354'}), чтобы отправить заявку в друзья.</p>
              <div class="friend-add">
                <input
                  bind:value={friendNick}
                  placeholder="ник или ID игрока"
                  spellcheck="false"
                  on:keydown={(e) => { if (e.key === 'Enter') submitFriend(); }}
                />
                <button class="primary" on:click={submitFriend}>Отправить заявку</button>
              </div>
              {#if $online.friendSent.length > 0}
                <div class="fout-block">
                  <span class="muted small">Отправленные заявки — ждём ответа</span>
                  <div class="fout-list">
                    {#each $online.friendSent as name (name)}
                      <span class="fout-chip">
                        {name}
                        <button class="chip-x" title="Отменить заявку" on:click={() => cancelFriendRequest(name)}>✕</button>
                      </span>
                    {/each}
                  </div>
                </div>
              {/if}
            </div>
          {:else if friendView === 'requests'}
            {#if friendRequests.length === 0}
              <div class="fempty">
                <span class="fempty-ic"><Icon name="users" size={34} /></span>
                <p>Входящих заявок нет</p>
                <span class="muted small">Когда кто-то добавит вас в друзья, заявка появится здесь.</span>
              </div>
            {:else}
              <div class="friends">
                {#each friendRequests as req (req.name)}
                  <div class="friend">
                    <div class="friend-avatar">{#if req.avatar}<img src={req.avatar} alt="" />{:else}{req.name.slice(0, 1).toUpperCase()}{/if}</div>
                    <span class="dot" class:on={req.online}></span>
                    <div class="friend-main">
                      <strong>{req.name}</strong>
                      <span class="muted small">хочет добавить вас в друзья</span>
                    </div>
                    <div class="freq-actions">
                      <button class="primary mini" on:click={() => acceptFriendRequest(req.name)}>Принять</button>
                      <button class="ghost danger mini" on:click={() => declineFriendRequest(req.name)}>Отклонить</button>
                    </div>
                  </div>
                {/each}
              </div>
            {/if}
          {:else}
            {#if visibleFriends.length === 0}
              <div class="fempty">
                <span class="fempty-ic"><Icon name="users" size={34} /></span>
                <p>{friendView === 'online' ? 'Сейчас никого нет в сети' : 'Вы ещё не добавили в друзья ни одного пользователя'}</p>
                <span class="muted small">Найдите игрока и отправьте ему заявку.</span>
              </div>
            {:else}
              <div class="friends">
                {#each visibleFriends as friend}
                  <div class="friend">
                    <div class="friend-avatar">
                      {#if friend.avatar}<img src={friend.avatar} alt="" />{:else}{friend.name.slice(0, 1).toUpperCase()}{/if}
                    </div>
                    <span
                      class="dot"
                      class:on={friend.online}
                      class:away={friend.online && friend.statusKind === 'away'}
                      class:dnd={friend.online && friend.statusKind === 'dnd'}
                      class:invis={friend.online && friend.statusKind === 'invisible'}
                    ></span>
                    <div class="friend-main" on:click={() => openProfile(friend.displayName || friend.name)} style="cursor:pointer;">
                      <strong>{friend.name}</strong>
                      <span class="muted small">
                        {friendLabel(friend.statusKind, friend.online)}
                        {#if friend.game} · играет: {friend.game}{/if}
                      </span>
                    </div>
                    <button class="ghost danger mini" title="Удалить из друзей" on:click={() => dropFriend(friend.displayName || friend.name)}>Удалить</button>
                  </div>
                {/each}
              </div>
            {/if}
          {/if}
        </section>

      {:else if tab === 'groups'}
        <section class="panel">
          <div class="ach-head">
            <h3>Группы</h3>
            <span class="muted small">{myGroups.length}</span>
          </div>
          <p class="muted small">Группы, в которых вы участвуете: созданные вами и те, на которые вы подписаны.</p>
          {#if myGroups.length === 0}
            <div class="fempty">
              <span class="fempty-ic"><Icon name="group" size={34} /></span>
              <p>Вы пока не состоите ни в одной группе</p>
              <span class="muted small">Создайте свою группу или подпишитесь на чужие во вкладке «Лента».</span>
            </div>
          {:else}
            <div class="groups">
              {#each myGroups as g (g.id)}
                <div class="group-row">
                  <div class="group-avatar">
                    {#if g.avatar}<img src={g.avatar} alt="" />{:else}{g.name.slice(0, 1).toUpperCase()}{/if}
                  </div>
                  <div class="group-main" on:click={() => openGroup(g.id)} style="cursor:pointer;" title="Открыть группу">
                    <div class="group-name-line">
                      <strong>{g.name}</strong>
                      {#if g.mine}<span class="tag admin">моя</span>{/if}
                      {#if g.abbrev}<span class="muted small">· {g.abbrev}</span>{/if}
                    </div>
                    <span class="muted small">
                      {g.members} уч. · {g.isOpen ? 'открытая' : 'закрытая'}
                      {#if g.tagline} · {g.tagline}{/if}
                    </span>
                    {#if g.link}<span class="muted small mono">laub://group/{g.link}</span>{/if}
                  </div>
                  <button class="ghost mini" title="Отписаться" on:click={() => unsubscribeGroup(g.id)}>Отписаться</button>
                </div>
              {/each}
            </div>
          {/if}
        </section>

      {:else if tab === 'servers'}
        <section class="panel">
          <div class="ach-head">
            <h3>Мои серверы</h3>
            <span class="muted small">{myServers.length}</span>
          </div>
          <p class="muted small">Ваш сервер в каталоге: статус, голоса, платное продвижение и срок.</p>
          {#if srvNote}<p class="note">{srvNote}</p>{/if}
          {#if myServers.length === 0}
            <p class="muted small">Своих серверов пока нет — добавьте в разделе «Ваши серверы».</p>
          {:else}
            <div class="mysrv">
              {#each myServers as s (s.id)}
<div class="mysrv-row">
                  {#if s.icon}
                    <span class="mysrv-icon"><img src={iconUrl(s)} alt="" loading="lazy" /></span>
                  {/if}
                  {#if s.banner}
                    <span class="mysrv-banner" style:background-image={`url(${bannerUrl(s)})`}></span>
                  {/if}
                  <div class="mysrv-main">
                    <strong>{s.name}</strong>
                    <span class="muted small">{s.game || 'игра не указана'} · {s.address}</span>
                    <span class="mysrv-state">
                      <span class="dot" class:on={s.online}></span>
                      {s.checkedAt ? (s.online ? 'онлайн' : 'не отвечает') : 'нет данных'}
                      · {s.votes} голосов
                      {#if s.promoUntil > 0} · продвижение до {serverDate(s.promoUntil)}{/if}
                    </span>
                  </div>
<div class="mysrv-actions">
                    <button class="primary mini" on:click={() => (promoFor = s)}>Продвинуть</button>
                    <button class="ghost mini" on:click={() => pickIcon(s)}>
                      {s.icon ? 'Сменить аватар' : 'Аватар'}
                    </button>
                    {#if s.icon}
                      <button class="ghost danger mini" on:click={() => removeIcon(s)}>Снять</button>
                    {/if}
                    <button class="ghost mini" on:click={() => pickBanner(s)}>
                      {s.banner ? 'Сменить баннер' : 'Баннер'}
                    </button>
                    {#if s.banner}
                      <button class="ghost danger mini" on:click={() => removeBanner(s)}>Снять</button>
                    {/if}
                    <button class="ghost mini" on:click={() => recheckMine(s)}>Проверить</button>
                    <button class="ghost danger mini" on:click={() => dropServer(s)}>Удалить</button>
                  </div>
                </div>
              {/each}
            </div>
<input
              class="banner-input"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              bind:this={bannerInput}
              on:change={onBannerPick}
            />
            <input
              class="banner-input"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              bind:this={iconInput}
              on:change={onIconPick}
            />
          {/if}
        </section>
        {#if promoFor}
          <Promotion server={promoFor} onClose={() => (promoFor = null)} />
        {/if}

      {:else if tab === 'orders'}
        <section class="panel">
          <div class="ach-head">
            <h3>Заказы продвижения</h3>
            <span class="muted small">{myOrders.length}</span>
          </div>
          <p class="muted small">
            История покупок оформления. Оплата в тестовом режиме — деньги не списывались.
          </p>
          {#if myOrders.length === 0}
            <p class="muted small">Заказов пока нет — оформление покупается во вкладке «Мои серверы».</p>
          {:else}
            <div class="orders">
              {#each myOrders as order (order.id)}
                <div class="order-row">
                  <div class="order-main">
                    <strong>{order.serverName}</strong>
                    <span class="muted small">
                      {(order.options || []).map((id) => OPTION_NAMES[id] || id).join(' · ') || 'без опций'}
                      · {order.days} дн.
                    </span>
                    <span class="muted small">{new Date(order.ts).toLocaleString('ru-RU')}</span>
                  </div>
                  <div class="order-side">
                    <strong>{order.amount} ₽</strong>
                    <span class="order-state {order.status}">
                      {order.status === 'paid' ? 'оплачен' : order.status === 'expired' ? 'истёк' : 'ожидает'}
                    </span>
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </section>

      {:else if tab === 'complaint'}
        <section class="panel">
          <h3>Пожаловаться на игрока</h3>
          <p class="muted small">Жалоба уйдёт администратору: укажите ник и что случилось.</p>
          <div class="complaint-row">
            <div class="field nick">
              <label for="cmp-nick">Ник</label>
              <input id="cmp-nick" bind:value={cmpTarget} placeholder="ник игрока" spellcheck="false" />
            </div>
            <div class="field grow">
              <label for="cmp-reason">Причина</label>
              <input id="cmp-reason" bind:value={cmpReason} placeholder="например: оскорбления в чате" maxlength="500" />
            </div>
            <button class="primary" on:click={submitComplaint}>Отправить</button>
          </div>
          {#if cmpStatus}<p class="status">{cmpStatus}</p>{/if}
        </section>

      {:else if tab === 'security'}
        <div class="cols">
          <section class="panel">
            <div class="ach-head">
              <h3>Двухфакторная аутентификация (2FA)</h3>
              {#if $online.twofa}
                <span class="tag ok">включена</span>
              {:else}
                <span class="tag">выключена</span>
              {/if}
            </div>
            <p class="muted small">
              При входе с нового устройства будет запрошен 6-значный код из приложения-аутентификатора
              (Google Authenticator и совместимые). Это защищает аккаунт даже при утечке пароля.
            </p>
            {#if !$online.twofa}
              <button class="primary" on:click={() => { totpMsg = ''; setupTotp(); }}>Включить 2FA</button>
            {/if}

            {#if $online.adminTotp}
              <div class="totp-box">
                <p class="muted small">Отсканируйте QR или введите секрет в приложение, затем подтвердите кодом.</p>
                <div class="totp-secret">
                  <input type="text" readonly value={$online.adminTotp.secret} />
                </div>
                {#if $online.adminTotp.otpauth}
                  <p class="muted small mono" style="word-break: break-all;">{$online.adminTotp.otpauth}</p>
                {/if}
                <div class="field">
                  <label for="sec-2fa-code">Код из приложения</label>
                  <input
                    id="sec-2fa-code"
                    type="text"
                    inputmode="numeric"
                    bind:value={totpCode}
                    placeholder="000000"
                    maxlength="6"
                    spellcheck="false"
                  />
                </div>
                <div class="foot-row">
                  <button class="primary" on:click={() => { totpMsg = ''; enableTotp(totpCode); }} disabled={totpCode.length !== 6}>
                    Подтвердить и включить
                  </button>
                </div>
              </div>
            {/if}

            {#if $online.twofa}
              <div class="foot-row">
                <span class="muted small">Отключение защищено: нужен код и задержка 1 час.</span>
                <button class="ghost danger" on:click={() => { totpMsg = ''; disableTotp(totpCode || ''); }}>
                  Отключить 2FA
                </button>
              </div>
              {#if $online.twofa}
                <p class="muted small">Уже включена — для отключения введите текущий код выше.</p>
              {/if}
            {/if}
            {#if totpMsg}<p class="status err-text">{totpMsg}</p>{/if}
          </section>

          <section class="panel">
            <h3>Смена пароля</h3>
            <p class="muted small">От 10 символов, заглавная и строчная буква, хотя бы одна цифра.</p>
            <div class="pw-form">
              <label class="pw-field" for="sec-old">
                <span>Текущий пароль</span>
                <div class="pw-input">
                  <input
                    id="sec-old"
                    type={showOldPass ? 'text' : 'password'}
                    value={oldPass}
                    on:input={(e) => (oldPass = e.currentTarget.value)}
                    autocomplete="current-password"
                    placeholder="Ваш текущий пароль"
                  />
                  <button
                    class="pw-eye"
                    type="button"
                    title={showOldPass ? 'Скрыть' : 'Показать'}
                    on:click={() => (showOldPass = !showOldPass)}
                  >
                    <Icon name="eye" size={15} />
                  </button>
                </div>
              </label>

              <label class="pw-field" for="sec-new">
                <span>Новый пароль</span>
                <div class="pw-input">
                  <input
                    id="sec-new"
                    type={showNewPass ? 'text' : 'password'}
                    value={newPass}
                    on:input={(e) => (newPass = e.currentTarget.value)}
                    placeholder="От 10 символов"
                    autocomplete="new-password"
                  />
                  <button
                    class="pw-eye"
                    type="button"
                    title={showNewPass ? 'Скрыть' : 'Показать'}
                    on:click={() => (showNewPass = !showNewPass)}
                  >
                    <Icon name="eye" size={15} />
                  </button>
                </div>
              </label>

              {#if newPass}
                <div class="pw-meter">
                  <span class="pw-bar">
                    <span
                      class="pw-fill"
                      class:weak={pwScore <= 1}
                      class:mid={pwScore === 2}
                      class:strong={pwScore >= 3}
                      style="width: {Math.round((pwScore / pwRules.length) * 100)}%"
                    ></span>
                  </span>
                  <span class="pw-state">{passState}</span>
                </div>
                <ul class="pw-rules">
                  {#each pwRules as rule (rule.key)}
                    <li class:ok={rule.ok}>{rule.label}</li>
                  {/each}
                </ul>
              {/if}

              <label class="pw-field" for="sec-new2">
                <span>Повторите новый</span>
                <div class="pw-input">
                  <input
                    id="sec-new2"
                    type={showNewPass2 ? 'text' : 'password'}
                    value={newPass2}
                    on:input={(e) => (newPass2 = e.currentTarget.value)}
                    autocomplete="new-password"
                    placeholder="Ещё раз"
                  />
                  <button
                    class="pw-eye"
                    type="button"
                    title={showNewPass2 ? 'Скрыть' : 'Показать'}
                    on:click={() => (showNewPass2 = !showNewPass2)}
                  >
                    <Icon name="eye" size={15} />
                  </button>
                </div>
              </label>
              {#if newPass2 && !pwMatch}
                <p class="pw-mismatch">Пароли не совпадают</p>
              {/if}

              {#if passTouched && passError}<p class="status err-text">{passError}</p>{/if}
              {#if $online.passwordResult}
                <p
                  class="status"
                  class:ok-text={$online.passwordResult === 'Пароль изменён'}
                  class:err-text={$online.passwordResult !== 'Пароль изменён'}
                >
                  {$online.passwordResult}
                </p>
              {/if}
              <div class="foot-row">
                <span class="muted small">Остальные устройства выйдут из аккаунта.</span>
                <button class="primary" disabled={!passReady} on:click={submitPassword}>
                  {passBusy ? 'Меняем…' : 'Сменить пароль'}
                </button>
              </div>
            </div>
          </section>

          <section class="panel">
            <div class="ach-head">
              <h3>Активные сессии</h3>
              <div class="ach-head-btns">
                <button class="ghost mini" on:click={requestSessions}>Обновить</button>
                {#if $online.sessions.length > 0}
                  <button class="ghost mini danger" on:click={revokeAllSessions}>Выйти со всех</button>
                {/if}
              </div>
            </div>
            {#if $online.sessions.length === 0}
              <p class="muted small">Нет данных — нажмите «Обновить».</p>
            {:else}
              {#each $online.sessions as session (session.id)}
                <div class="session-row">
                  <div class="session-main">
                    <strong>
                      {session.ip || 'адрес неизвестен'}
                      {#if session.current}<span class="tag">это устройство</span>{/if}
                      {#if session.newDevice}<span class="tag newdev">новое устройство</span>{/if}
                    </strong>
                    <span class="muted small">
                      {session.ua || 'клиент'} · вход {when(session.created)} · активность {when(session.lastSeen)}
                    </span>
                  </div>
                  {#if !session.current}
                    <button class="ghost mini" on:click={() => revokeSession(session.id)}>Завершить</button>
                  {/if}
                </div>
              {/each}
            {/if}
          </section>

          <section class="panel">
            <h3>Советы по безопасности</h3>
            <ul class="sec-tips">
              <li>Используйте уникальный пароль — не такой же, как на других сайтах и в почте.</li>
              <li>Надёжный пароль — от 10 символов: буквы в разных регистрах и хотя бы одна цифра.</li>
              <li>Защитите привязанную почту: включите свой пароль и двухэтапную проверку почтового сервиса.</li>
              <li>Не переходите по ссылкам из личных сообщений, даже от знакомых, — ник не сокровище, аккаунт могли взломать.</li>
              <li>Никогда никому не сообщайте пароль и коды подтверждения, в том числе «поддержке».</li>
              <li>Регулярно проверяйте список активных сессий выше и завершайте незнакомые.</li>
              <li>Держите антивирус включённым и обновлённым — он ловит кейлоггеры и подделки.</li>
            </ul>
          </section>

          <section class="panel">
            <h3>Мои данные</h3>
            <p class="muted small">Экспорт — копия данных аккаунта в JSON.</p>
            <div class="foot-row">
              <button class="ghost" on:click={exportAccount}>Экспорт данных</button>
              {#if $online.exportJson}
                <button class="ghost" on:click={copyExport}>{copied ? 'Скопировано' : 'Скопировать'}</button>
              {/if}
            </div>
            {#if $online.exportJson}
              <textarea class="export" readonly rows="7" value={$online.exportJson}></textarea>
            {/if}
          </section>

          <section class="panel">
            <h3>Удаление аккаунта</h3>
            <p class="muted small">Удаляются профиль, друзья и достижения. Отменить нельзя.</p>
            <div class="field">
              <label for="sec-del">Пароль</label>
              <input id="sec-del" type="password" bind:value={delPass} autocomplete="current-password" />
            </div>
            <label class="check">
              <input type="checkbox" bind:checked={delConfirm} />
              <span>Понимаю, что данные восстановить нельзя</span>
            </label>
            <div class="foot-row">
              <button class="primary danger" on:click={submitDelete}>Удалить аккаунт</button>
            </div>
          </section>

          <section class="panel">
            <h3>Согласие с документами</h3>
            <p class="muted small">
              Принята редакция: <strong>{$online.consent || 'нет'}</strong> · актуальная: {$online.consentVersion}
            </p>
            {#if $online.consent !== $online.consentVersion}
              <div class="foot-row">
                <span class="muted small">Опубликована новая редакция документов.</span>
                <button class="primary" on:click={acceptConsent}>Принять</button>
              </div>
            {/if}
          </section>
        </div>
      {/if}
    </main>
  </div>

  {#if avatarGalleryOpen}
    <div class="agmask" on:click={() => (avatarGalleryOpen = false)}></div>
    <div class="agallery" role="dialog" aria-label="Галерея аватаров">
      <div class="agallery-head">
        <h3>Аватары {PRESET_AVATARS.length}</h3>
        <div class="agallery-head-btns">
          <button class="ghost mini" on:click={pickAvatar}>Загрузить своё</button>
          <button class="uclose" title="Закрыть" on:click={() => (avatarGalleryOpen = false)}>✕</button>
        </div>
      </div>
      <div class="ag-grid">
        {#each PRESET_AVATARS as name (name)}
          <button
            class="ag-item"
            class:active={!!presetSrc[name] && avatarUrl === presetSrc[name]}
            title="Выбрать"
            on:click={() => pickPresetAvatar(name)}
            use:loadAvatar={name}
          >
            {#if presetSrc[name]}<img src={presetSrc[name]} alt="" />{:else}<span class="ag-loading">…</span>{/if}
            {#if presetSrc[name] && avatarUrl === presetSrc[name]}
              <span class="ag-check">✓</span>
            {/if}
          </button>
        {/each}
      </div>
    </div>
  {/if}

  {#if coverPickerOpen}
    <div class="agmask" on:click={closeCoverDialog}></div>
    <div class="cover-modal" role="dialog" aria-label="Установить обложку профиля">
      <button class="uclose" title="Закрыть" on:click={closeCoverDialog}>✕</button>
      <h3>Установить обложку профиля</h3>
      <p class="cover-hint">
        Изображение с вашего компьютера в формате JPG, PNG, WEBP, GIF или BMP, размером не более 12 МБ
        и разрешением не менее 800×200 пикселей. Большие фото сжимаются автоматически.
      </p>

      <div
        class="cover-drop"
        class:dragging={coverDragging}
        role="button"
        tabindex="0"
        on:dragover|preventDefault={() => (coverDragging = true)}
        on:dragleave={() => (coverDragging = false)}
        on:drop|preventDefault={onCoverDrop}
        on:click={() => coverFileInput?.click()}
        on:keydown={(e) => e.key === 'Enter' && coverFileInput?.click()}
      >
        {#if coverPreview}
          <img src={coverPreview} alt="Предпросмотр обложки" />
        {:else}
          <span class="cover-choose">Выберите файл</span>
          <span class="cover-or">Или просто перетащите его в эту область</span>
        {/if}
      </div>

      {#if coverError}
        <p class="cover-err">{coverError}</p>
      {/if}

      <details class="cover-presets">
        <summary>Или выберите готовую</summary>
        <div class="cover-grid">
          <button
            class="cover-item"
            class:active={dCover === ''}
            style="background: linear-gradient(135deg, #14161c, #2b303a)"
            on:click={() => pickCover('')}
          >
            <span>Без обложки</span>
          </button>
          {#each COVERS as c}
            <button
              class="cover-item"
              class:active={dCover === c.id}
              class:locked={isCoverLocked(c.id)}
              disabled={isCoverLocked(c.id)}
              title={isCoverLocked(c.id) ? unlockTitle(c.unlock) : c.label}
              style="background: {c.css}"
              on:click={() => pickCover(c.id)}
            >
              <span>{c.label}</span>
            </button>
          {/each}
        </div>
      </details>

      <div class="cover-actions">
        <button class="ghost" on:click={closeCoverDialog}>Отменить</button>
        <button class="primary" disabled={!coverPreview} on:click={applyCover}>Сохранить</button>
      </div>

      <input
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,image/bmp"
        bind:this={coverFileInput}
        on:change={onCoverFile}
        class="cover-file"
      />
    </div>
  {/if}

  {#if framePickerOpen}
    <div class="agmask" on:click={() => (framePickerOpen = false)}></div>
    <div class="agallery" role="dialog" aria-label="Рамка аватара">
      <div class="agallery-head">
        <h3>Рамка аватара</h3>
        <div class="agallery-head-btns">
          <button class="uclose" title="Закрыть" on:click={() => (framePickerOpen = false)}>✕</button>
        </div>
      </div>
      <div class="frame-grid">
        {#each FRAMES as f}
          <button
            class="frame-item"
            class:active={dFrame === f.id}
            class:locked={isFrameLocked(f.id)}
            disabled={isFrameLocked(f.id)}
            title={isFrameLocked(f.id) ? unlockTitle(f.unlock) : f.label}
            on:click={() => pickFrame(f.id)}
          >
            <i style={f.id === 'none' ? 'box-shadow: inset 0 0 0 1px var(--line)' : `box-shadow: ${f.css}`}></i>
            <span>{f.label}</span>
          </button>
        {/each}
      </div>
    </div>
  {/if}

  {#if viewed}
    <div class="viewed-overlay">
      <div class="viewed-page">
        <button class="viewed-close" title="Закрыть" on:click={closeProfile}>✕ Закрыть</button>
        <div class="dash">
          <header class="dash-hero" style={coverStyle(viewed.cover || '')}>
            <div class="dash-avatar" style="background: {color};{viewed.frame && viewed.frame !== 'none' ? `box-shadow:${frameCss(viewed.frame)};` : ''}">
              {#if viewed.avatar}<img src={viewed.avatar} alt="" />{:else}{viewed.name.slice(0, 2).toUpperCase()}{/if}
            </div>
            <div class="dash-hero-main">
              <div class="viewed-actions">
                {#if viewed.friendship === 'none'}
                  {#if $online.friendSent.includes(viewed.displayName || viewed.name)}
                    <button class="dash-quick" disabled>Заявка отправлена</button>
                  {:else}
                    <button class="dash-quick" on:click={() => submitFriendNick(viewed.displayName || viewed.name)}>Добавить в друзья</button>
                  {/if}
                  <button class="dash-quick" on:click={writeToViewed}>Написать</button>
                  <button class="dash-quick" on:click={complainAboutViewed}>Пожаловаться</button>
                {:else if viewed.friendship === 'friends'}
                  <span class="dash-quick off">Вы подписаны</span>
                  <button class="dash-quick" on:click={writeToViewed}>Написать</button>
                  <button class="dash-quick" on:click={complainAboutViewed}>Пожаловаться</button>
                {:else}
                  <span class="dash-quick off">Это вы</span>
                  <button class="dash-quick" on:click={editViewedProfile}>Редактировать профиль</button>
                  <button class="dash-quick" on:click={openViewedAchievements}>Мои достижения</button>
                {/if}
              </div>
              <span class="dash-online" class:off={!viewed.online}><span class="dot"></span>{friendLabel(viewed.statusKind, viewed.online)}</span>
              <div class="dash-name">
                <strong>{viewed.name}</strong>
                {#if viewed.isAdmin}<span class="tag admin">админ</span>{/if}
                {#each viewed.achievements.filter((a) => a.done && a.reward && a.reward.kind === 'badge').slice(0, 3) as b (b.id)}
                  <span class="badge-chip" title={(b.reward && b.reward.label) || b.name}><AchIcon metric={b.metric} size={13} /></span>
                {/each}
              </div>
              {#if viewed.statusText}<p class="dash-bio">{viewed.statusText}</p>{/if}
              {#if viewed.game}<p class="dash-bio">Играет: {viewed.game}</p>{/if}
            </div>
            <div class="dash-subs">
              <Icon name="users" size={16} />
              <span>Всего подписчиков: <strong>{viewed.followersCount ?? 0}</strong></span>
            </div>
          </header>

          <div class="dash-stats">
            <div class="dstat c-blue"><strong>{viewed.title || '—'}</strong><em>Титул</em></div>
            <div class="dstat c-green"><strong>{viewed.xp ?? 0}</strong><span>опыта</span><em>Прогресс</em></div>
            <div class="dstat c-purple"><strong>{viewed.reputation}</strong><em>Репутация</em></div>
            <div class="dstat c-pink"><strong>{viewed.achievements.filter((a) => a.done).length}/{viewed.achievements.length}</strong><em>Достижения</em></div>
            <div class="dstat c-dim"><strong>{viewed.lastSeen ? when(viewed.lastSeen * 1000) : '—'}</strong><em>Последний визит</em></div>
          </div>

          <div class="dash-grid">
            <div class="dash-col">
              <section class="dpanel">
                <div class="dpanel-head"><Icon name="user" size={15} /><h3>О себе</h3></div>
                <div class="ubio">
                  {#if viewed.bio}{viewed.bio}{:else}<span class="muted">Информация отсутствует</span>{/if}
                </div>
              </section>

              <section class="dpanel">
                <div class="dpanel-head"><Icon name="trophy" size={15} /><h3>Достижения</h3></div>
                {#if viewed.achievements.filter((a) => a.done).length > 0}
                  <div class="u-coins">
                    {#each viewed.achievements.filter((a) => a.done).slice(0, 12) as ach (ach.id)}
                      <span class="u-coin" class:rare={rarityKey(ach) === 'rare'} class:epic={rarityKey(ach) === 'epic'} class:leg={rarityKey(ach) === 'legendary'} title="{ach.name}">
                        <AchIcon metric={ach.metric} size={17} />
                      </span>
                    {/each}
                  </div>
                {:else}
                  <div class="dempty"><p>Мы уже работаем над этим 😊</p></div>
                {/if}
                {#if viewed.friendship === 'self'}
                  <button class="ghost" on:click={openViewedAchievements}><Icon name="trophy" size={14} /> Все мои достижения</button>
                {/if}
              </section>
            </div>

            <div class="dash-col center">
              <div class="feed-head">
                <span class="feed-title">Лента новостей</span>
              </div>
              <div class="dempty big">
                <strong>Здесь пока тихо…</strong>
                <p>{viewed.friendship === 'self' ? 'У вас пока нет публикаций.' : 'Публикации этого игрока недоступны.'}</p>
              </div>
              {#if viewed.friendship === 'self'}
                <button class="ghost" on:click={() => { closeProfile(); tab = 'profile'; }}><Icon name="bell" size={14} /> Создать публикацию</button>
              {/if}
            </div>

            <div class="dash-col">
              <section class="dpanel">
                <div class="dpanel-head"><Icon name="book" size={15} /><h3>Досье</h3></div>
                <div class="dossier">
                  <div><span>ID:</span><b>{viewed.uid ?? '—'}</b></div>
                  <div><span>Статус:</span><b>{friendLabel(viewed.statusKind, viewed.online)}</b></div>
                  <div><span>Репутация:</span><b>{viewed.reputation}</b></div>
                  <div><span>Последний визит:</span><b>{viewed.lastSeen ? when(viewed.lastSeen * 1000) : '—'}</b></div>
                  {#if viewed.birthdate}<div><span>Дата рождения:</span><b>{formatBirth(viewed.birthdate)}</b></div>{/if}
                  {#if viewed.gender}<div><span>Пол:</span><b>{viewed.gender === 'm' ? 'Мужской' : 'Женский'}</b></div>{/if}
                  {#if viewed.country}<div><span>Страна:</span><b>{viewed.country}</b></div>{/if}
                  {#if viewed.city}<div><span>Город:</span><b>{viewed.city}</b></div>{/if}
                </div>
                {#if viewed.friendship !== 'self'}
                  <div class="rep-vote">
                    <button
                      class="rep-btn"
                      class:active={(viewed.myVote ?? 0) === 1}
                      title="Лайк за репутацию"
                      on:click={() => voteProfile(viewed.displayName || viewed.name, 1)}
                    >
                      <Icon name="like" size={15} /><span>{viewed.likes ?? 0}</span>
                    </button>
                    <button
                      class="rep-btn dislike"
                      class:active={(viewed.myVote ?? 0) === -1}
                      title="Дизлайк за репутацию"
                      on:click={() => voteProfile(viewed.displayName || viewed.name, -1)}
                    >
                      <Icon name="dislike" size={15} /><span>{viewed.dislikes ?? 0}</span>
                    </button>
                  </div>
                {/if}
              </section>

              <section class="dpanel">
                <div class="dpanel-head"><Icon name="users" size={15} /><h3>Подписки <span class="muted">{viewed.friendsCount ?? 0}</span></h3></div>
                {#if (viewed.friendsList ?? []).length === 0}
                  <div class="dempty"><p>Пока никого…</p></div>
                {:else}
                  <div class="dfeed">
                    {#each (viewed.friendsList ?? []).slice(0, 6) as f (f.name)}
                      <button class="dfeed-row" on:click={() => openProfile(f.name)}><span class="dfeed-ava">{#if f.avatar}<img src={f.avatar} alt="" />{:else}{f.name.slice(0,1).toUpperCase()}{/if}</span><span class="dfeed-txt">{f.name}</span><span class="muted small">{f.online ? 'в сети' : 'не в сети'}</span></button>
                    {/each}
                  </div>
                {/if}
                <button class="ghost" on:click={onOpenPlayers}><Icon name="users" size={14} /> Найти игрока</button>
              </section>

              <section class="dpanel">
                <div class="dpanel-head"><Icon name="users" size={15} /><h3>Подписчики <span class="muted">{viewed.followersCount ?? 0}</span></h3></div>
                {#if (viewed.followersList ?? []).length === 0}
                  <div class="dempty"><p>Пока никого…</p></div>
                {:else}
                  <div class="dfeed">
                    {#each (viewed.followersList ?? []).slice(0, 6) as f (f.name)}
                      <button class="dfeed-row" on:click={() => openProfile(f.name)}><span class="dfeed-ava">{#if f.avatar}<img src={f.avatar} alt="" />{:else}{f.name.slice(0,1).toUpperCase()}{/if}</span><span class="dfeed-txt">{f.name}</span><span class="muted small">{f.online ? 'в сети' : 'не в сети'}</span></button>
                    {/each}
                  </div>
                {/if}
              </section>
            </div>
          </div>
        </div>
      </div>
    </div>
{/if}
</div>

{#if giftPick}
  <div class="gift-modal-mask" on:click={() => (giftPick = null)}></div>
  <div class="gift-card-modal" role="dialog" aria-label="Купить подарок">
    <div class="gcm-item">
      <span class="gift-emoji big">{giftPick.emoji}</span>
      <div>
        <div class="gift-name">{giftPick.name}</div>
        <div class="gift-price">{giftPick.price} монет</div>
      </div>
    </div>
    <div class="gift-mode-row">
      <button class="btn-mini" class:on={giftMode === 'self'} on:click={() => (giftMode = 'self')}>💠 Подарить себе</button>
      <button class="btn-mini" class:on={giftMode === 'to'} on:click={() => (giftMode = 'to')}>✉ Подарить другому</button>
    </div>
    {#if giftMode === 'to'}
      <input class="gift-recipient" placeholder="Ник получателя" bind:value={giftTo} />
    {/if}
    <div class="gift-modal-actions">
      <button class="primary" on:click={confirmGift}>Купить за {giftPick.price} монет</button>
      <button class="ghost" on:click={() => (giftPick = null)}>Отмена</button>
    </div>
    {#if giftNote}<span class="coin-status" class:ok={true}>{giftNote}</span>{/if}
  </div>
{/if}

<style>
  .profile { display: flex; flex-direction: column; gap: 12px; padding: 20px 24px; max-width: 1240px; }
  .muted { color: var(--muted); }
  .muted.small { font-size: 12px; }

  .shell { display: grid; grid-template-columns: 190px 1fr; gap: 16px; align-items: start; }

  .side {
    position: sticky;
    top: 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 8px;
    border: 1px solid var(--line);
    border-radius: 14px;
    background: var(--panel);
    min-height: 420px;
  }
  .nav-list { display: flex; flex-direction: column; gap: 3px; }
  .nav-list button {
    display: flex;
    align-items: center;
    gap: 9px;
    width: 100%;
    height: 36px;
    padding: 0 10px;
    border: 0;
    border-radius: 9px;
    background: transparent;
    color: var(--text);
    font: inherit;
    font-size: 12.5px;
    font-weight: 600;
    cursor: pointer;
  }
  .nav-list button:hover { background: var(--hover); }
  .nav-list button.active { background: var(--accent-soft); color: var(--accent); }
  .nav-ic { display: grid; place-items: center; width: 18px; flex: none; }
  .nav-label { flex: 1; text-align: left; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .nav-count {
    padding: 1px 7px;
    border-radius: 999px;
    background: var(--hover-2);
    color: var(--muted);
    font-size: 10.5px;
  }
  .nav-list button.active .nav-count { background: var(--accent); color: var(--ink-on-accent); }

  .side-foot { margin-top: auto; border-top: 1px solid var(--line); padding-top: 8px; }
  .side-logout {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    height: 34px;
    padding: 0 10px;
    border: 0;
    border-radius: 9px;
    background: transparent;
    color: var(--danger);
    font: inherit;
    font-size: 12.5px;
    font-weight: 600;
    cursor: pointer;
  }
  .side-logout:hover { background: rgba(239, 91, 91, 0.12); }

  .main { display: flex; flex-direction: column; gap: 14px; min-width: 0; }

  .panel {
    padding: 14px 16px;
    border: 1px solid var(--line);
    border-radius: 12px;
    background: var(--panel);
    display: flex;
    flex-direction: column;
    gap: 9px;
  }
  .panel h3 { margin: 0; font-size: 13.5px; }
  .card-line { display: flex; align-items: center; justify-content: space-between; gap: 10px; color: var(--muted); }
  .card-line h3 { color: var(--text); }

  .hero {
    display: flex;
    align-items: center;
    gap: 16px;
    flex-wrap: wrap;
    padding: 18px 20px;
    border: 1px solid var(--line);
    border-radius: 16px;
    background:
      radial-gradient(560px 140px at 8% 0%, color-mix(in srgb, var(--pc) 26%, transparent), transparent 70%),
      radial-gradient(420px 120px at 92% 120%, color-mix(in srgb, var(--pc) 14%, transparent), transparent 70%),
      var(--panel);
  }
  .hero-avatar {
    position: relative;
    width: 74px;
    height: 74px;
    flex: none;
    display: grid;
    place-items: center;
    border-radius: 50%;
    color: #fff;
    font-size: 22px;
    font-weight: 800;
    overflow: hidden;
    cursor: pointer;
    box-shadow: 0 6px 18px color-mix(in srgb, var(--pc) 45%, transparent);
    border: 2px solid rgba(255, 255, 255, 0.12);
  }
  .hero-avatar img { width: 100%; height: 100%; object-fit: cover; }
  .hero-avatar-edit {
    position: absolute;
    inset: auto 0 0 0;
    padding: 3px 0 5px;
    background: rgba(0, 0, 0, 0.55);
    color: #fff;
    font-size: 9.5px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    opacity: 0;
    transition: opacity 0.15s;
  }
  .hero-avatar:hover .hero-avatar-edit { opacity: 1; }
  .hero-info { flex: 1; min-width: 220px; display: flex; flex-direction: column; gap: 4px; }
  .hero-name { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .hero-name strong { font-size: 19px; }
  .hero-status { margin: 0; font-size: 13px; color: var(--text); }
  .id-line {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    width: fit-content;
    padding: 3px 9px;
    border: 1px solid var(--line);
    border-radius: 999px;
    background: var(--panel-2);
    color: var(--muted);
    font: inherit;
    font-size: 11.5px;
    cursor: pointer;
  }
  .id-line:hover { border-color: var(--accent); color: var(--accent); }
  .id-num { font-weight: 700; letter-spacing: 0.03em; }
  .id-label { font-weight: 600; }
  .hero-bio { margin: 0; font-size: 12px; color: var(--muted); }
  .hero-actions { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; }
  .tag { padding: 1px 8px; border-radius: 999px; font-size: 10.5px; font-weight: 600; }
  .tag.admin { background: var(--accent-soft); color: var(--accent); }
  .conn { font-size: 10.5px; padding: 2px 9px; border-radius: 999px; background: var(--hover-2); color: var(--muted); }
  .conn.on { background: rgba(67, 209, 122, 0.15); color: var(--ok); }
  .conn.off { background: var(--hover-2); color: var(--muted); }

  .mini { height: 26px; padding: 0 10px; font-size: 11.5px; }
  .err-text { color: var(--danger); }
  .ok-text { color: var(--ok); }

  .pw-form { display: flex; flex-direction: column; gap: 10px; max-width: 420px; }
  .pw-field { display: flex; flex-direction: column; gap: 5px; }
  .pw-field > span { font-size: 11.5px; font-weight: 600; color: var(--muted); }
  .pw-input { position: relative; display: flex; align-items: center; }
  .pw-input input {
    width: 100%;
    box-sizing: border-box;
    border: 1px solid var(--line);
    border-radius: 9px;
    background: var(--bg-soft);
    color: var(--text);
    font: inherit;
    font-size: 13px;
    padding: 8px 34px 8px 11px;
    outline: none;
  }
  .pw-input input:focus { border-color: var(--accent); }
  .pw-eye {
    position: absolute;
    right: 4px;
    width: 26px;
    height: 26px;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: 7px;
    background: transparent;
    color: var(--muted);
    cursor: pointer;
  }
  .pw-eye:hover { background: var(--hover); color: var(--text); }
  .pw-meter { display: flex; align-items: center; gap: 8px; }
  .pw-bar { flex: 1; height: 5px; border-radius: 999px; background: var(--hover-2); overflow: hidden; }
  .pw-fill { display: block; height: 100%; border-radius: 999px; transition: width 0.2s ease; }
  .pw-fill.weak { background: var(--danger); }
  .pw-fill.mid { background: var(--gold, #e2b04a); }
  .pw-fill.strong { background: var(--ok); }
  .pw-state { font-size: 11px; font-weight: 700; color: var(--muted); min-width: 64px; text-align: right; }
  .pw-rules { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 3px; }
  .pw-rules li { position: relative; padding-left: 18px; font-size: 11.5px; color: var(--muted); }
  .pw-rules li::before { content: '○'; position: absolute; left: 2px; }
  .pw-rules li.ok { color: var(--ok); }
  .pw-rules li.ok::before { content: '✓'; }
  .pw-mismatch { margin: 0; font-size: 11.5px; color: var(--danger); }

  .grid-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 12px; }

  .online-count { display: inline-flex; align-items: center; gap: 6px; font-weight: 700; color: var(--ok); font-size: 13px; }
  .live-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--ok); box-shadow: 0 0 0 3px rgba(67, 209, 122, 0.2); animation: livePulse 1.8s infinite; }
  @keyframes livePulse { 0%, 100% { box-shadow: 0 0 0 3px rgba(67, 209, 122, 0.22); } 50% { box-shadow: 0 0 0 6px rgba(67, 209, 122, 0.05); } }
  .online-grid { display: flex; flex-wrap: wrap; gap: 10px; }
  .online-ava { position: relative; display: flex; flex-direction: column; align-items: center; gap: 4px; width: 54px; cursor: pointer; }
  .online-ava:hover .online-face { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-soft); }
  .online-face {
    width: 42px;
    height: 42px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    overflow: hidden;
    font-size: 15px;
    font-weight: 700;
    color: var(--accent);
    background: var(--accent-soft);
    box-shadow: 0 3px 10px rgba(0, 0, 0, 0.35);
  }
  .online-face img { width: 100%; height: 100%; object-fit: cover; }
  .ava-dot { position: absolute; top: 4px; right: 8px; width: 10px; height: 10px; border-radius: 50%; border: 2px solid var(--panel); background: var(--ok); }
  .ava-dot.away { background: var(--gold); }
  .ava-dot.dnd { background: var(--danger); }
  .online-name { font-size: 10px; color: var(--muted); max-width: 54px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .level-card { min-height: 190px; }
  .level-num { font-size: 22px; font-weight: 800; color: var(--accent); }
  .level-body { display: flex; align-items: center; gap: 14px; }
  .level-ring { position: relative; width: 64px; height: 64px; flex: none; }
  .ring { width: 100%; height: 100%; transform: rotate(-90deg); }
  .ring-bg { fill: none; stroke: var(--hover-2); stroke-width: 3.4; }
  .ring-fg { fill: none; stroke: var(--accent); stroke-width: 3.4; stroke-linecap: round; stroke-dasharray: 0 116.2; transition: stroke-dasharray 0.4s; }
  .ring-pct {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    font-size: 12px;
    font-weight: 800;
    color: var(--accent);
  }
  .level-info { display: flex; flex-direction: column; gap: 4px; }
  .title-badge { padding: 3px 10px; border-radius: 999px; background: var(--accent-soft); color: var(--accent); font-size: 12px; font-weight: 600; width: fit-content; }
  .xp-stats { display: flex; gap: 12px; font-size: 11.5px; color: var(--muted); flex-wrap: wrap; }
  .xp-line { font-size: 12.5px; color: var(--muted); }

  .balance-card { min-height: 190px; }
  .balance-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 10px; }
  .balance-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1px;
    padding: 9px 6px;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--panel-2);
  }
  .balance-item strong { font-size: 17px; }
  .balance-item .muted { font-size: 10.5px; }

  .stat-card { min-height: 190px; }
  .stat-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; font-size: 12.5px; }
  .stat-row span { color: var(--muted); }
  .stat-row strong { font-size: 14px; }

  .promo-banner {
    flex-direction: row;
    align-items: center;
    gap: 13px;
    flex-wrap: wrap;
    border-color: color-mix(in srgb, var(--gold) 45%, var(--line));
    background:
      linear-gradient(90deg, color-mix(in srgb, var(--gold) 13%, transparent), transparent 60%),
      var(--panel);
  }
  .promo-banner-icon {
    width: 42px;
    height: 42px;
    flex: none;
    display: grid;
    place-items: center;
    border-radius: 12px;
    color: var(--gold);
    background: color-mix(in srgb, var(--gold) 16%, transparent);
  }
  .promo-banner-txt { flex: 1; min-width: 200px; display: flex; flex-direction: column; gap: 2px; }
  .promo-banner-txt strong { font-size: 13.5px; }

  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; align-items: start; }

  .feed { display: flex; flex-direction: column; gap: 5px; }
  .feed-row { display: flex; align-items: center; gap: 9px; padding: 6px 8px; border-radius: 8px; }
  .feed-row:hover { background: var(--hover); }
  .feed-icon { color: var(--accent); display: grid; place-items: center; flex: none; }
  .feed-txt { flex: 1; font-size: 12.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .top-line { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-top: 6px; }
  .top-chip { padding: 2px 8px; border-radius: 999px; background: var(--hover-2); color: var(--muted); font-size: 10.5px; }

.coins-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(128px, 1fr)); gap: 10px; }
  .prestige-strip { display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: 8px; }
  .prestige-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1px;
    padding: 10px 8px;
    border: 1px solid var(--line);
    border-radius: 12px;
    background: var(--panel-2);
  }
  .prestige-item strong { font-size: 19px; color: var(--accent); }
  .prestige-item .of { font-size: 12px; color: var(--muted); font-weight: 400; }
  .prestige-item.gold strong { color: var(--gold); }
  .prestige-item.gold { border-color: color-mix(in srgb, var(--gold) 45%, var(--line)); background: color-mix(in srgb, var(--gold) 7%, var(--panel-2)); }
  .coin {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 5px;
    padding: 10px 8px;
    border-radius: 14px;
    background: var(--panel-2);
    border: 1px solid var(--line);
    opacity: 0.55;
  }
  .coin-face {
    width: 54px;
    height: 54px;
    flex: none;
    display: grid;
    place-items: center;
    border-radius: 50%;
    font-size: 21px;
    color: var(--muted);
    background: var(--hover-2);
    border: 2px solid var(--muted-2);
    box-shadow: inset 0 2px 8px rgba(0, 0, 0, 0.35);
  }
  .coin-face svg, .u-coin svg, .badge-chip svg { display: block; }
  .coin-face { position: relative; }
  .coin-face.locked svg { opacity: 0.45; }
  .coin-lock {
    position: absolute;
    right: -2px;
    bottom: -2px;
    width: 20px;
    height: 20px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    color: #9aa3b2;
    background: #1b1f27;
    border: 1.5px solid #39404d;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.45);
  }
  .coin-pct {
    position: absolute;
    top: 12px;
    right: 12px;
    font-size: 9.5px;
    font-weight: 800;
    color: var(--muted);
    background: var(--hover-2);
    padding: 1px 5px;
    border-radius: 999px;
  }
  .coin.done { opacity: 1; border-color: rgba(67, 209, 122, 0.4); background: rgba(67, 209, 122, 0.05); }
  .coin.done .coin-face { color: #cbd5e1; background: radial-gradient(circle at 35% 30%, #3a4150, #20242b 70%); border-color: #6b7280; }
  .coin.rare.done { border-color: rgba(66, 168, 255, 0.55); background: rgba(66, 168, 255, 0.08); }
  .coin.rare.done .coin-face { border-color: #58b0ff; color: #cfeaff; background: radial-gradient(circle at 35% 30%, #23598c, #12324f 70%); box-shadow: inset 0 2px 8px rgba(0,0,0,0.4), 0 0 12px rgba(66,168,255,0.45); }
  .coin.epic.done { border-color: rgba(167, 112, 241, 0.6); background: rgba(167, 112, 241, 0.1); }
  .coin.epic.done .coin-face { border-color: #b58bf5; color: #efe2ff; background: radial-gradient(circle at 35% 30%, #563c8c, #2c2050 70%); box-shadow: inset 0 2px 8px rgba(0,0,0,0.4), 0 0 14px rgba(167,112,241,0.5); }
  .coin.leg.done { border-color: rgba(255, 184, 76, 0.65); background: rgba(255, 184, 76, 0.1); }
  .coin.leg.done .coin-face { border-color: #ffd27a; color: #fff3d6; background: radial-gradient(circle at 35% 30%, #8a5d1c, #4a3109 70%); box-shadow: inset 0 2px 8px rgba(0,0,0,0.4), 0 0 16px rgba(255,184,76,0.55); }
  .coin-name { font-size: 11px; font-weight: 700; text-align: center; color: var(--text); line-height: 1.15; }
  .coin:not(.done) .coin-name { color: var(--muted); }
  .coin-rarity { font-size: 9.5px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; color: var(--muted); }
  .coin.done .coin-rarity { color: #8a919c; }
  .coin.rare.done .coin-rarity { color: #58b0ff; }
  .coin.epic.done .coin-rarity { color: #b58bf5; }
  .coin.leg.done .coin-rarity { color: #ffd27a; }
  .coin-row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
  .coin-row .coin { padding: 8px; opacity: 0.55; }
  .coin-row .coin.done { opacity: 1; }
  .coin-row .coin-face { width: 42px; height: 42px; font-size: 17px; }
  .mini-score { display: flex; align-items: baseline; gap: 7px; padding: 7px 10px; border-radius: 10px; background: var(--panel-2); border: 1px solid var(--line); }
  .mini-score strong { font-size: 21px; color: var(--accent); }

.ach-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }

  .mysrv { display: flex; flex-direction: column; gap: 8px; margin-top: 10px; }
  .mysrv-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 12px;
    border: 1px solid var(--line);
    border-radius: 10px;
    flex-wrap: wrap;
  }
  .mysrv-main { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
  .mysrv-main strong { font-size: 13.5px; }
  .mysrv-state { display: inline-flex; align-items: center; gap: 6px; font-size: 11.5px; color: var(--muted); }
  .mysrv-actions { display: flex; gap: 6px; flex-wrap: wrap; }
.mysrv-banner {
    width: 56px;
    height: 34px;
    flex: none;
    border-radius: 7px;
    border: 1px solid var(--line);
    background-size: cover;
    background-position: center;
    background-color: var(--panel-2);
  }
  .mysrv-icon {
    width: 38px;
    height: 38px;
    flex: none;
    border-radius: 10px;
    border: 1px solid var(--line);
    background-color: var(--panel-2);
    overflow: hidden;
  }
  .mysrv-icon img { width: 100%; height: 100%; object-fit: cover; }
  .banner-input { display: none; }

  .orders { display: flex; flex-direction: column; gap: 8px; margin-top: 10px; }
  .order-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 12px;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--panel-2);
    flex-wrap: wrap;
  }
  .order-main { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
  .order-main strong { font-size: 13.5px; }
  .order-side { display: flex; align-items: center; gap: 10px; }
  .order-side strong { font-size: 14px; }
  .order-state {
    padding: 2px 9px;
    border-radius: 999px;
    font-size: 10.5px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    background: var(--hover-2);
    color: var(--muted);
  }
  .order-state.paid { background: rgba(67, 209, 122, 0.16); color: var(--ok); }
  .order-state.expired { background: rgba(255, 111, 111, 0.14); color: var(--danger); }
  .dot.on { background: var(--ok); }
  .friends { display: flex; flex-direction: column; gap: 5px; }
  .fsub-tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--line); padding-bottom: 8px; flex-wrap: wrap; }
  .fsub-tabs button {
    position: relative;
    padding: 6px 12px;
    border: 0;
    background: transparent;
    color: var(--muted);
    font: inherit;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    border-radius: 8px 8px 0 0;
  }
  .fsub-tabs button:hover { color: var(--text); background: var(--hover); }
  .fsub-tabs button.active { color: var(--ok); }
  .fsub-tabs button.active::after { content: ''; position: absolute; left: 8px; right: 8px; bottom: -9px; height: 2px; background: var(--ok); border-radius: 2px; }
  .fcount { display: inline-grid; place-items: center; min-width: 18px; height: 18px; margin-left: 4px; border-radius: 999px; background: var(--hover-2); color: var(--muted); font-size: 10.5px; padding: 0 5px; }
  .fsub-tabs button.active .fcount { background: rgba(67, 209, 122, 0.16); color: var(--ok); }
  .fcount.hot { background: var(--accent); color: var(--ink-on-accent); }

  .fbar { display: flex; align-items: center; gap: 10px; margin: 10px 0 6px; flex-wrap: wrap; }
  .fsearch {
    flex: 1;
    min-width: 180px;
    display: flex;
    align-items: center;
    gap: 8px;
    height: 34px;
    padding: 0 11px;
    background: var(--bg-soft);
    border: 1px solid var(--line);
    border-radius: 8px;
    color: var(--muted);
  }
  .fsearch:focus-within { border-color: var(--accent); }
  .fsearch input { flex: 1; background: transparent; border: 0; outline: none; color: var(--text); font: inherit; font-size: 12.5px; }

  .fadd-panel { padding: 6px 0; }
  .fempty { display: flex; flex-direction: column; align-items: center; gap: 6px; text-align: center; padding: 36px 12px; }
  .fempty-ic { color: var(--muted); opacity: 0.6; }
  .fempty p { margin: 0; font-size: 13.5px; font-weight: 600; color: var(--text); }
  .freq-actions { display: flex; gap: 6px; }

  .friend-add { display: flex; gap: 8px; margin: 4px 0 8px; }
  .friend-add input {
    flex: 1;
    height: 34px;
    padding: 0 11px;
    background: var(--bg-soft);
    border: 1px solid var(--line);
    border-radius: 8px;
    color: var(--text);
    font-size: 12.5px;
    outline: none;
  }
  .friend-add input:focus { border-color: var(--accent); }
  .fout-block { display: flex; flex-direction: column; gap: 6px; margin-top: 4px; }
  .fout-list { display: flex; flex-wrap: wrap; gap: 6px; }
  .fout-chip {
    display: inline-flex; align-items: center; gap: 5px;
    font-size: 11.5px; padding: 3px 8px; border-radius: 999px;
    border: 1px solid var(--line); background: var(--panel-2); color: var(--text);
  }
  .friend-note { margin-bottom: 8px; }
  .friend .danger { margin-left: auto; font-size: 11px; }
  .friend { display: flex; align-items: center; gap: 9px; padding: 7px 9px; border: 1px solid var(--line); border-radius: 8px; }
  .friend-main { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
  .friend-main strong { font-size: 12.5px; }
  .friend-avatar {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: var(--accent-soft);
    color: var(--accent);
    display: grid;
    place-items: center;
    font-size: 10.5px;
    font-weight: 700;
    flex: none;
    overflow: hidden;
  }
  .friend-avatar img { width: 100%; height: 100%; object-fit: cover; }
  .dot { width: 8px; height: 8px; border-radius: 50%; flex: none; background: #5d6472; }
  .dot.on { background: var(--ok); }
  .dot.away { background: var(--gold); }
  .dot.dnd { background: var(--danger); }
  .dot.invis { background: #8a8f98; }

  .groups { display: flex; flex-direction: column; gap: 6px; margin-top: 4px; }
  .group-row { display: flex; align-items: center; gap: 10px; padding: 9px 11px; border: 1px solid var(--line); border-radius: 10px; }
  .group-row:hover { border-color: var(--accent); }
  .group-avatar {
    width: 38px;
    height: 38px;
    border-radius: 10px;
    background: var(--accent-soft);
    color: var(--accent);
    display: grid;
    place-items: center;
    font-size: 15px;
    font-weight: 700;
    flex: none;
    overflow: hidden;
  }
  .group-avatar img { width: 100%; height: 100%; object-fit: cover; }
  .group-main { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
  .group-name-line { display: flex; align-items: center; gap: 6px; min-width: 0; }
  .group-name-line strong { font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .group-main .mono { font-family: "Cascadia Code", Consolas, monospace; font-size: 10.5px; }

  .complaint-row { display: flex; gap: 9px; align-items: flex-end; flex-wrap: wrap; }
  .complaint-row .field.nick { width: 170px; }
  .complaint-row .field.grow { flex: 1; min-width: 220px; }

  .session-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 8px 10px;
    border: 1px solid var(--line);
    border-radius: 8px;
  }
  .session-main { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .session-main strong { font-size: 12.5px; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .session-main .muted.small { overflow-wrap: anywhere; }
  .sec-tips {
    margin: 6px 0 0;
    padding-left: 18px;
    display: flex;
    flex-direction: column;
    gap: 5px;
    font-size: 12px;
    color: var(--muted);
    line-height: 1.45;
  }
  .sec-tips li::marker { color: var(--accent); }

  .totp-box {
    margin-top: 4px;
    padding: 12px;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--panel-2);
    display: flex;
    flex-direction: column;
    gap: 9px;
  }
  .totp-secret input {
    width: 100%;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--bg-soft);
    color: var(--text);
    font-family: "Cascadia Code", Consolas, monospace;
    font-size: 11px;
    padding: 8px 10px;
  }
  .mono { font-family: "Cascadia Code", Consolas, monospace; }
  .ach-head-btns { display: flex; gap: 6px; }
  .ghost.danger { color: var(--danger); border-color: color-mix(in srgb, var(--danger) 40%, var(--line)); }
  .ghost.danger:hover { background: color-mix(in srgb, var(--danger) 12%, transparent); }
  .tag.ok { background: color-mix(in srgb, var(--ok) 14%, transparent); color: var(--ok); }

  .export {
    width: 100%;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--bg-soft);
    color: var(--text);
    font-family: "Cascadia Code", Consolas, monospace;
    font-size: 11px;
    line-height: 1.45;
    padding: 8px 10px;
    resize: vertical;
  }

  .primary.danger {
    background: var(--btn-danger-bg);
    color: #fff;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.26), 0 2px 10px rgba(217, 86, 86, 0.22);
  }
  .primary.danger:hover { background: var(--btn-danger-hover); }

  .primary,
  .ghost {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: 32px;
    padding: 0 13px;
    border-radius: var(--radius-sm);
    font: inherit;
    font-size: 12.5px;
    font-weight: 600;
    white-space: nowrap;
    cursor: pointer;
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
  .ghost { border: 1px solid var(--line); background: var(--panel-2); color: var(--text); }
  .ghost:hover { background: var(--panel-3); border-color: var(--muted-2); }

  .status { margin: 0; padding: 7px 11px; border-radius: 8px; background: var(--hover-2); font-size: 12.5px; }
  .status.err { background: rgba(239, 91, 91, 0.14); color: var(--danger); }

  .umask { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.5); z-index: 60; }
  .agmask { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.5); z-index: 70; }
  .agallery {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 460px;
    max-width: 92vw;
    max-height: 84vh;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 16px;
    padding: 18px;
    z-index: 71;
    box-shadow: var(--shadow-lift);
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .agallery-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding-right: 34px; }
  .agallery-head h3 { margin: 0; font-size: 15px; }
  .agallery-head-btns { display: flex; align-items: center; gap: 8px; }
  .ag-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(88px, 1fr)); gap: 8px; overflow-y: auto; }
  .ag-item {
    position: relative;
    aspect-ratio: 1;
    border: 1px solid var(--line);
    border-radius: 12px;
    padding: 0;
    background: var(--panel-2);
    overflow: hidden;
    cursor: pointer;
  }
  .ag-item:hover { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-soft); }
  .ag-item.active { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent); }
  .ag-check {
    position: absolute;
    right: 4px;
    bottom: 4px;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    background: var(--accent);
    color: var(--ink-on-accent);
    font-size: 11px;
    font-weight: 800;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.45);
  }
  .ag-item img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .ag-loading { display: grid; place-items: center; width: 100%; height: 100%; color: var(--muted); font-size: 16px; }
  .cover-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
  .cover-item {
    position: relative;
    height: 62px;
    border: 1px solid var(--line);
    border-radius: 10px;
    overflow: hidden;
    padding: 0;
    cursor: pointer;
    color: #fff;
    font: inherit;
    font-size: 11.5px;
    font-weight: 650;
  }
  .cover-item span { position: absolute; left: 10px; bottom: 8px; text-shadow: 0 1px 5px rgba(0, 0, 0, 0.65); }
  .cover-item:hover { border-color: var(--accent); }
  .cover-item.active { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-soft); }
  .frame-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; }
  .frame-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 10px 4px;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--panel-2);
    color: var(--muted);
    font: inherit;
    font-size: 10.5px;
    cursor: pointer;
  }
  .frame-item i { width: 36px; height: 36px; border-radius: 10px; background: var(--panel-3); display: block; }
  .frame-item:hover { border-color: var(--accent); color: var(--text); }
  .frame-item.active { border-color: var(--accent); color: var(--text); }
  .frame-item.locked, .cover-item.locked { opacity: 0.45; cursor: not-allowed; border-style: dashed; }
  .cover-modal {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 560px;
    max-width: 94vw;
    max-height: 90vh;
    overflow-y: auto;
    padding: 22px;
    border: 1px solid var(--line);
    border-radius: 16px;
    background: var(--panel);
    box-shadow: var(--shadow-lift);
    z-index: 71;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .cover-modal h3 { margin: 0; font-size: 18px; padding-right: 30px; }
  .cover-hint { margin: 0; font-size: 12.5px; line-height: 1.5; color: var(--muted); }
  .cover-drop {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    min-height: 170px;
    padding: 18px;
    border: 1px dashed var(--line);
    border-radius: 12px;
    background: var(--panel-2);
    color: var(--muted);
    font-size: 12.5px;
    cursor: pointer;
    text-align: center;
  }
  .cover-drop:hover { border-color: var(--accent); }
  .cover-drop.dragging { border-color: var(--accent); background: var(--hover, #232c3c); color: var(--text); }
  .cover-drop img { max-width: 100%; max-height: 190px; border-radius: 9px; display: block; object-fit: cover; }
  .cover-choose {
    padding: 8px 22px;
    border-radius: 9px;
    background: var(--panel-3);
    color: var(--text);
    font-size: 12.5px;
    font-weight: 600;
  }
  .cover-or { font-size: 12px; color: var(--muted-2); }
  .cover-err { margin: 0; font-size: 12px; color: #ff7a7a; }
  .cover-presets summary { font-size: 12.5px; color: var(--muted); cursor: pointer; }
  .cover-presets[open] summary { margin-bottom: 8px; }
  .cover-actions { display: flex; justify-content: space-between; gap: 10px; margin-top: 4px; }
  .cover-actions .ghost, .cover-actions .primary { min-width: 150px; justify-content: center; }
  .cover-file { display: none; }
  .umodal {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 380px;
    max-width: 92vw;
    max-height: 86vh;
    overflow-y: auto;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 16px;
    padding: 20px;
    z-index: 61;
    box-shadow: var(--shadow-lift);
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .uclose { position: absolute; top: 10px; right: 10px; width: 26px; height: 26px; border: 0; border-radius: 8px; background: var(--hover-2); color: var(--muted); font-size: 13px; cursor: pointer; }
  .uclose:hover { color: var(--text); background: var(--hover); }
  .uhead { display: flex; gap: 14px; align-items: center; }
  .uavatar { width: 62px; height: 62px; flex: none; border-radius: 50%; display: grid; place-items: center; color: #fff; font-size: 18px; font-weight: 800; overflow: hidden; box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35); }
  .uavatar img { width: 100%; height: 100%; object-fit: cover; }
  .uinfo { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
  .uname { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .uname strong { font-size: 16px; }
  .uid-line { font-size: 11.5px; color: var(--muted); font-weight: 600; letter-spacing: 0.03em; }
  .ustatus { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text); }
  .udot { width: 8px; height: 8px; border-radius: 50%; background: #5d6472; flex: none; }
  .udot.on { background: var(--ok); }
  .udot.away { background: var(--gold); }
  .udot.dnd { background: var(--danger); }
  .ubody { display: flex; flex-direction: column; gap: 12px; }
  .usection { display: flex; flex-direction: column; gap: 6px; }
  .usection-head { display: flex; align-items: center; gap: 7px; color: var(--muted); }
  .usection-head strong { font-size: 12.5px; color: var(--text); }
  .usection-ic { display: grid; place-items: center; color: var(--accent); }
  .ubio { font-size: 12.5px; color: var(--text); line-height: 1.5; word-break: break-word; }
  .ustat-row { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; }
  .ustat { display: flex; flex-direction: column; align-items: center; gap: 1px; padding: 9px 6px; border: 1px solid var(--line); border-radius: 10px; background: var(--panel-2); }
  .ustat strong { font-size: 15px; }
  .u-coins { display: flex; flex-wrap: wrap; gap: 6px; }
  .u-coin {
    width: 34px;
    height: 34px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    font-size: 15px;
    color: #cbd5e1;
    background: radial-gradient(circle at 35% 30%, #3a4150, #20242b 70%);
    border: 2px solid #6b7280;
  }
  .u-coin.rare { border-color: #58b0ff; color: #cfeaff; background: radial-gradient(circle at 35% 30%, #23598c, #12324f 70%); }
  .u-coin.epic { border-color: #b58bf5; color: #efe2ff; background: radial-gradient(circle at 35% 30%, #563c8c, #2c2050 70%); }
  .u-coin.leg { border-color: #ffd27a; color: #fff3d6; background: radial-gradient(circle at 35% 30%, #8a5d1c, #4a3109 70%); }
  .fpills { font-size: 12px; }

  @media (max-width: 980px) {
    .shell { grid-template-columns: 1fr; }
    .side { position: static; min-height: 0; }
    .nav-list { flex-direction: row; flex-wrap: wrap; }
    .nav-list button { width: auto; }
    .side-foot { display: none; }
  }
  @media (max-width: 780px) {
    .grid-2 { grid-template-columns: 1fr; }
    .cols { grid-template-columns: 1fr; }
  }

  /* === Новый профиль (дашборд) === */
  .profile { max-width: none; width: 100%; box-sizing: border-box; }
  .shell { display: grid; grid-template-columns: 190px 1fr; gap: 16px; align-items: stretch; }
  .side {
    position: sticky;
    top: 12px;
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
    min-height: 100%;
    padding: 8px;
    overflow: visible;
  }
  .nav-list { flex-direction: column; gap: 3px; }
  .nav-list button { width: 100%; height: 36px; padding: 0 10px; border-radius: 9px; white-space: normal; }
  .nav-list button.active { background: #f2555a; color: #fff; }
  .nav-list button.active .nav-count { background: rgba(255,255,255,0.28); color: #fff; }
  .side-foot { margin-top: auto; border-top: 1px solid var(--line); padding-top: 8px; margin-left: 0; }
  .side-logout { width: 100%; }

  .dash { display: flex; flex-direction: column; gap: 16px; }
  .dash-hero {
    position: relative;
    display: flex;
    align-items: flex-end;
    gap: 16px;
    padding: 20px;
    border-radius: 16px;
    background:
      radial-gradient(circle at 12% 20%, rgba(90,110,170,0.18), transparent 45%),
      repeating-linear-gradient(135deg, rgba(255,255,255,0.03) 0 22px, transparent 22px 44px),
      linear-gradient(160deg, #1b2036, #131726 60%);
    border: 1px solid var(--line);
    overflow: hidden;
    min-height: 150px;
  }
  .dash-avatar {
    width: 92px; height: 92px; flex: none;
    border-radius: 14px; overflow: hidden;
    border: 1px solid rgba(255,255,255,0.15);
    background: var(--panel-2);
    display: grid; place-items: center;
    color: #fff; font-size: 28px; font-weight: 800;
    cursor: pointer; padding: 0;
  }
  .dash-avatar img { width: 100%; height: 100%; object-fit: cover; }
  .dash-avatar-wrap { position: relative; flex: none; }
  .dash-gift {
    position: absolute;
    right: -8px;
    bottom: -8px;
    font-size: 26px;
    line-height: 1;
    filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.6));
  }
  .dash-hero-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; align-items: flex-start; }
  .dash-quick {
    border: 1px solid var(--line); background: rgba(255,255,255,0.06); color: var(--text);
    font: inherit; font-size: 12px; padding: 6px 12px; border-radius: 9px; cursor: pointer;
  }
  .dash-quick:hover { background: rgba(255,255,255,0.12); }
  .viewed-actions { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
  .viewed-actions .dash-quick.off { cursor: default; }
  .dash-bio-edit { position: relative; display: flex; align-items: center; width: min(340px, 100%); }
  .dash-bio-in {
    width: 100%;
    height: 32px;
    padding: 0 30px 0 12px;
    border: 1px solid rgba(255, 255, 255, 0.26);
    border-radius: 9px;
    background: rgba(10, 14, 24, 0.38);
    color: var(--text);
    font: inherit;
    font-size: 12.5px;
  }
  .dash-bio-in::placeholder { color: var(--muted); }
  .dash-bio-in:focus { outline: none; border-color: var(--accent); background: rgba(10, 14, 24, 0.62); }
  .dash-bio-clear {
    position: absolute;
    right: 5px;
    display: grid;
    place-items: center;
    width: 22px;
    height: 22px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--muted);
    font-size: 12px;
    line-height: 1;
    cursor: pointer;
  }
  .dash-bio-clear:hover { color: var(--text); background: rgba(255, 255, 255, 0.1); }
  .dash-online {
    display: inline-flex; align-items: center; gap: 6px;
    font-size: 11.5px; font-weight: 600;
    padding: 3px 10px; border-radius: 999px;
    background: rgba(67,209,122,0.15); color: #43d17a;
  }
  .dash-online.off { background: var(--hover-2); color: var(--muted); }
  .dash-online .dot { width: 7px; height: 7px; border-radius: 50%; background: #43d17a; }
  .dash-online.off .dot { background: var(--muted); }
  .dash-name { display: flex; align-items: center; gap: 8px; }
  .dash-name strong { font-size: 22px; }
  .badge-chip {
    display: inline-grid;
    place-items: center;
    width: 22px;
    height: 22px;
    border-radius: 7px;
    border: 1px solid var(--line);
    background: var(--panel-2);
    color: var(--accent);
    font-size: 12px;
    line-height: 1;
    cursor: default;
  }
  .dash-bio { margin: 0; font-size: 12.5px; color: var(--muted); max-width: 520px; }
  .dash-subs { display: flex; align-items: center; gap: 7px; color: var(--muted); font-size: 12px; white-space: nowrap; }
  .dash-subs strong { color: var(--text); }

  .dash-stats { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; }
  .dstat {
    padding: 12px 14px; border: 1px solid var(--line); border-radius: 12px;
    background: var(--panel); display: flex; flex-direction: column; gap: 2px;
    border-top: 3px solid var(--line);
  }
  .dstat strong { font-size: 17px; }
  .dstat span { font-size: 12px; color: var(--text); }
  .dstat em { font-style: normal; font-size: 11px; color: var(--muted); }
  .dstat.c-blue { border-top-color: #4a86ff; }
  .dstat.c-green { border-top-color: #43d17a; }
.dstat.c-purple { border-top-color: #b58bf5; }
  .dstat.c-pink { border-top-color: #f2555a; }
  .dstat.c-gold { border-top-color: var(--gold, #e3a13b); }
  .dstat.c-dim { opacity: 0.55; }

  .dash-grid { display: grid; grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.6fr) minmax(0, 0.95fr); gap: 14px; align-items: start; }
  .dash-col { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
  .dpanel {
    padding: 14px; border: 1px solid var(--line); border-radius: 12px;
    background: var(--panel); display: flex; flex-direction: column; gap: 10px;
  }
  .dpanel-head { display: flex; align-items: center; gap: 8px; color: var(--muted); }
  .dpanel-head h3 { margin: 0; font-size: 13.5px; color: var(--text); }
  .dpanel-head h3 .muted { color: var(--muted); font-weight: 400; }

  .dempty { text-align: center; padding: 8px 4px; display: flex; flex-direction: column; gap: 6px; }
  .dempty strong { font-size: 13px; }
  .dempty p { margin: 0; font-size: 12px; color: var(--muted); line-height: 1.5; }
  .dempty.big { padding: 26px 16px; gap: 10px; }

  .dfeed { display: flex; flex-direction: column; gap: 6px; }
  .dfeed-row { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: 8px; background: var(--panel-2); font-size: 12.5px; }
  button.dfeed-row {
    width: 100%;
    border: 0;
    text-align: left;
    color: var(--text);
    font: inherit;
    font-size: 12.5px;
    cursor: pointer;
  }
  button.dfeed-row:hover { background: var(--hover, #232c3c); }
  .dfeed-txt { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .dach-line { display: flex; align-items: baseline; gap: 8px; }
  .dach-line strong { font-size: 17px; color: var(--accent); }

  .composer h3 { margin: 0; font-size: 13.5px; }
  .composer-row { display: flex; gap: 10px; align-items: flex-start; }
  .composer-ava {
    width: 34px; height: 34px; flex: none; border-radius: 9px; overflow: hidden;
    display: grid; place-items: center; background: var(--panel-2); color: var(--muted); font-size: 12px; font-weight: 700;
  }
  .composer-ava img { width: 100%; height: 100%; object-fit: cover; }
  .composer textarea {
    flex: 1; resize: vertical; min-height: 42px;
    border: 1px solid var(--line); border-radius: 9px; background: var(--bg-soft);
    color: var(--text); font: inherit; font-size: 13px; padding: 9px 11px; outline: none;
  }
  .composer textarea:focus { border-color: var(--accent); }
  .composer-foot { display: flex; justify-content: flex-end; }

  .feed-head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
  .feed-title { font-size: 15px; font-weight: 700; }
  .feed-title::before { content: '/ '; color: #f2555a; }

  .post-list { display: flex; flex-direction: column; gap: 10px; }
  .post { display: flex; gap: 10px; padding: 12px; border: 1px solid var(--line); border-radius: 12px; background: var(--panel); align-items: flex-start; }
  .post-ava { width: 34px; height: 34px; flex: none; border-radius: 9px; overflow: hidden; display: grid; place-items: center; background: var(--panel-2); color: var(--muted); font-size: 12px; font-weight: 700; }
  .post-ava img { width: 100%; height: 100%; object-fit: cover; }
  .post-body { flex: 1; min-width: 0; }
  .post-head { display: flex; align-items: baseline; gap: 8px; margin-bottom: 3px; }
  .post-head strong { font-size: 13px; }
  .post-body p { margin: 0; font-size: 12.5px; line-height: 1.5; white-space: pre-wrap; word-break: break-word; }
  .post-del { border: 0; background: transparent; color: var(--muted); cursor: pointer; font-size: 13px; padding: 2px 4px; border-radius: 6px; }
  .post-del:hover { background: var(--hover); color: var(--danger); }

  .composer-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .vis-select {
    border: 1px solid var(--line); border-radius: 8px; background: var(--panel-2);
    color: var(--text); font: inherit; font-size: 11.5px; padding: 4px 7px; cursor: pointer; outline: none;
  }
  .vis-select:focus { border-color: var(--accent); }
  .composer-guest { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
  .composer-guest p { margin: 0; font-size: 12.5px; color: var(--muted); }
  .composer textarea.dragging { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 12%, var(--bg-soft)); }
  .composer-media { display: grid; grid-template-columns: repeat(4, 1fr); gap: 7px; }
  .media-item { position: relative; aspect-ratio: 1; border-radius: 9px; overflow: hidden; border: 1px solid var(--line); background: var(--panel-2); }
  .media-item img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .media-del {
    position: absolute; top: 3px; right: 3px; width: 19px; height: 19px;
    display: grid; place-items: center; border: 0; border-radius: 50%;
    background: rgba(12, 16, 22, 0.78); color: #dfe6f3; font-size: 10px; cursor: pointer;
  }
  .media-del:hover { background: var(--danger); color: #fff; }
  .composer-chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .chip {
    display: inline-flex; align-items: center; gap: 5px; font-size: 11.5px;
    padding: 3px 7px 3px 8px; border-radius: 999px;
    border: 1px solid var(--line); background: var(--panel-2); color: var(--text);
  }
  .chip.game { border-color: color-mix(in srgb, var(--accent) 45%, var(--line)); }
  .chip-x { border: 0; background: transparent; color: var(--muted); cursor: pointer; font-size: 10px; padding: 0 1px; }
  .chip-x:hover { color: var(--danger); }
  .poll-editor {
    display: flex; flex-direction: column; gap: 6px; padding: 9px;
    border: 1px solid var(--line); border-radius: 10px; background: var(--panel-2);
  }
  .poll-editor-head { display: flex; align-items: center; justify-content: space-between; font-size: 11.5px; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; }
  .poll-editor input, .pc-form input {
    width: 100%; box-sizing: border-box;
    border: 1px solid var(--line); border-radius: 8px; background: var(--bg-soft);
    color: var(--text); font: inherit; font-size: 12.5px; padding: 7px 9px; outline: none;
  }
  .poll-editor input:focus, .pc-form input:focus { border-color: var(--accent); }
  .poll-opt-row { display: flex; align-items: center; gap: 6px; }
  .picker {
    display: flex; flex-wrap: wrap; gap: 5px; padding: 8px;
    border: 1px solid var(--line); border-radius: 10px; background: var(--panel-2);
    max-height: 148px; overflow: auto;
  }
  .picker-item {
    border: 1px solid var(--line); border-radius: 8px; background: var(--bg-soft);
    color: var(--text); font: inherit; font-size: 11.5px; padding: 5px 8px; cursor: pointer;
    max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .picker-item:hover { border-color: var(--accent); }
  .emoji-picker { gap: 2px; }
  .emoji-btn { border: 0; background: transparent; font-size: 17px; line-height: 1; padding: 3px 4px; border-radius: 7px; cursor: pointer; }
  .emoji-btn:hover { background: var(--hover); }
  .composer-tools { display: flex; align-items: center; gap: 3px; flex-wrap: wrap; }
  .tool {
    width: 28px; height: 28px; display: grid; place-items: center;
    border: 1px solid transparent; border-radius: 8px; background: transparent;
    color: var(--muted); cursor: pointer;
  }
  .tool:hover { background: var(--hover); color: var(--text); }
  .tool.on { color: var(--accent); border-color: color-mix(in srgb, var(--accent) 45%, var(--line)); background: color-mix(in srgb, var(--accent) 10%, transparent); }
  .tool:disabled { opacity: 0.4; cursor: not-allowed; }
  .composer-count { margin-left: 6px; font-size: 11px; color: var(--muted); }
  .composer-count.over { color: var(--gold, #e2b04a); }
  .composer .composer-foot { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
  .post-game {
    display: inline-flex; align-items: center; gap: 4px; font-size: 11px;
    padding: 1px 6px; border-radius: 999px; color: var(--text);
    border: 1px solid var(--line); background: var(--panel-2);
    max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .vis-tag { margin-left: auto; font-size: 10px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; }
  .post-media { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; margin-top: 7px; }
  .post-media.one { grid-template-columns: 1fr; }
  .post-media img { width: 100%; max-height: 260px; object-fit: cover; border-radius: 9px; display: block; border: 1px solid var(--line); }
  .post-poll { display: flex; flex-direction: column; gap: 5px; margin-top: 8px; }
  .poll-question { font-size: 12.5px; font-weight: 700; }
  .poll-option {
    position: relative; display: flex; align-items: center; gap: 8px;
    padding: 7px 9px; border: 1px solid var(--line); border-radius: 9px;
    background: var(--panel-2); color: var(--text); font: inherit; font-size: 12px;
    cursor: pointer; overflow: hidden; text-align: left;
  }
  .poll-option:hover { border-color: color-mix(in srgb, var(--accent) 50%, var(--line)); }
  .poll-option.on { border-color: var(--accent); }
  .poll-fill {
    position: absolute; inset: 0 auto 0 0;
    background: color-mix(in srgb, var(--accent) 18%, transparent);
    transition: width 0.25s ease;
  }
  .poll-text { position: relative; flex: 1; }
  .poll-num { position: relative; font-size: 11px; color: var(--muted); }
  .poll-option.on .poll-num { color: var(--accent); font-weight: 700; }
  .post-actions { display: flex; align-items: center; gap: 4px; margin-top: 8px; }
  .post-act {
    display: inline-flex; align-items: center; gap: 4px;
    border: 1px solid transparent; border-radius: 8px; background: transparent;
    color: var(--muted); font: inherit; font-size: 11.5px; padding: 3px 7px; cursor: pointer;
  }
  .post-act:hover { background: var(--hover); color: var(--text); }
  .post-act.on { color: var(--danger, #e5535b); }
  .post-act.danger { margin-left: auto; }
  .post-act.danger:hover { color: var(--danger); }
  .post-comments { display: flex; flex-direction: column; gap: 7px; margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--line); }
  .pcomment { display: flex; gap: 7px; align-items: flex-start; }
  .pc-ava { width: 24px; height: 24px; flex: none; border-radius: 7px; overflow: hidden; display: grid; place-items: center; background: var(--panel-2); color: var(--muted); font-size: 10px; font-weight: 700; }
  .pc-ava img { width: 100%; height: 100%; object-fit: cover; }
  .pc-body { min-width: 0; }
  .pc-body strong { font-size: 11.5px; }
  .pc-body p { margin: 1px 0 0; font-size: 12px; line-height: 1.45; white-space: pre-wrap; word-break: break-word; }
  .pc-form { display: flex; gap: 6px; }
  .pc-form .primary { padding: 0 10px; }

  .dossier { display: flex; flex-direction: column; gap: 7px; }
  .dossier div { display: flex; align-items: center; justify-content: space-between; gap: 10px; font-size: 12.5px; flex-wrap: wrap; }
  .dossier span { color: var(--muted); white-space: nowrap; }
  .dossier b { font-weight: 600; }
  .dossier-in {
    flex: 1 1 92px;
    min-width: 0;
    max-width: none;
    height: 28px;
    padding: 0 8px;
    border: 1px solid var(--line);
    border-radius: 7px;
    background: var(--panel-2);
    color: var(--text);
    font: inherit;
    font-size: 12px;
    text-align: right;
    color-scheme: dark;
  }
  .dossier-in:focus { outline: none; border-color: var(--accent); }
  .dossier-in::placeholder { color: var(--muted-2); }
  select.dossier-in { cursor: pointer; appearance: auto; }
  .dossier-actions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px; }
  .dossier-actions .ghost {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    flex: 1 1 86px;
    height: 32px;
    padding: 0 8px;
    font-size: 11.5px;
    font-weight: 600;
    white-space: nowrap;
  }
  .dossier-actions .ghost span { overflow: hidden; text-overflow: ellipsis; }
  .rep-vote { display: flex; gap: 6px; margin-top: 8px; }
  .rep-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    flex: 1;
    height: 32px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--panel-2);
    color: var(--muted);
    font: inherit;
    font-size: 12px;
    font-weight: 650;
    cursor: pointer;
  }
  .rep-btn:hover { color: var(--text); border-color: var(--accent); }
  .rep-btn.active { color: #79e0a8; border-color: rgba(63, 185, 138, 0.5); background: rgba(63, 185, 138, 0.12); }
  .rep-btn.dislike.active { color: #ff8a8a; border-color: rgba(255, 122, 122, 0.5); background: rgba(255, 122, 122, 0.12); }
  .pset h2 { margin: 0 0 4px; font-size: 18px; }
  .pform { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; margin-top: 14px; }
  .pf { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
  .pf > span { font-size: 12px; color: var(--muted); }
  .pf-in {
    flex: none;
    width: 100%;
    max-width: none;
    height: 36px;
    padding: 0 12px;
    text-align: left;
    font-size: 13px;
  }
  .pf-in:read-only { opacity: 0.65; }
  .pform-actions { display: flex; gap: 8px; margin-top: 18px; flex-wrap: wrap; }
  .pset-block {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-top: 22px;
    padding-top: 18px;
    border-top: 1px solid var(--line);
  }
  .pset-block h3 { margin: 0; font-size: 14px; }
  .pset-actions { display: flex; gap: 6px; flex-wrap: wrap; }
  .pset-actions .ghost {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    flex: 1 1 130px;
    height: 34px;
    font-size: 12px;
    font-weight: 600;
  }
  .pset-actions .ghost:disabled { opacity: 0.45; cursor: not-allowed; }
  .pset-hint { margin: 0; font-size: 11.5px; line-height: 1.5; color: var(--muted-2); }
  .priv-row {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 12px 0;
    border-top: 1px solid var(--line-soft);
  }
  .priv-row:first-of-type { border-top: 0; padding-top: 2px; }
  .priv-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; font-size: 13px; }
  .priv-head > span { color: var(--accent); }
  .priv-sel { flex: none; width: auto; min-width: 180px; height: 32px; text-align: left; }
  .priv-desc { margin: 0; font-size: 11.5px; line-height: 1.5; color: var(--muted-2); }
  .priv-check { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--muted); cursor: pointer; }
  .priv-check input { accent-color: var(--accent); width: 14px; height: 14px; }
  .pv-card {
    display: flex;
    flex-direction: column;
    gap: 7px;
    margin-top: 14px;
    padding: 14px;
    border: 1px solid var(--line);
    border-radius: 11px;
    background: var(--panel-2);
  }
  .pv-title { margin: 0 0 2px; font-size: 12.5px; font-weight: 700; color: var(--text); }
  .pv-row { display: flex; justify-content: space-between; gap: 10px; font-size: 12px; color: var(--muted); }
  .pv-row b { color: var(--text); font-weight: 600; }
  .pv-note { margin: 6px 0 0; font-size: 11px; line-height: 1.5; color: var(--muted-2); }
  @media (max-width: 760px) {
    .pform { grid-template-columns: minmax(0, 1fr); }
  }

  @media (max-width: 1100px) {
    .dash-stats { grid-template-columns: repeat(3, 1fr); }
    .dash-grid { grid-template-columns: 1fr 1fr; }
  }
  @media (max-width: 780px) {
    .dash-stats { grid-template-columns: 1fr 1fr; }
    .dash-grid { grid-template-columns: 1fr; }
    .dash-hero { flex-wrap: wrap; }
  }

  .viewed-overlay {
    position: fixed; inset: 0; z-index: 280;
    background: rgba(8,10,20,0.9);
    backdrop-filter: blur(4px);
    overflow-y: auto;
    padding: 24px;
  }
  .viewed-page {
    max-width: 1180px; margin: 0 auto;
    background: var(--bg-soft, var(--panel));
    border: 1px solid var(--line);
    border-radius: 16px;
    padding: 18px;
    position: relative;
  }
  .viewed-close {
    position: sticky; top: 0; float: right;
    margin-bottom: 8px;
    border: 1px solid var(--line); background: var(--panel-2); color: var(--text);
    font: inherit; font-size: 12px; padding: 6px 12px; border-radius: 9px; cursor: pointer; z-index: 2;
  }
  .viewed-close:hover { background: var(--hover); }
  .dash-quick.off { background: transparent; color: var(--muted); cursor: default; }
  .dfeed-ava {
    width: 24px; height: 24px; flex: none; border-radius: 6px; overflow: hidden;
    display: grid; place-items: center; background: var(--panel-3); color: var(--muted); font-size: 11px; font-weight: 700;
  }
.dfeed-ava img { width: 100%; height: 100%; object-fit: cover; }

  .gift-legend { display: flex; flex-wrap: wrap; gap: 12px; margin: 10px 0 4px; font-size: 11.5px; color: var(--muted); }
  .gl-item { display: inline-flex; align-items: center; gap: 6px; }
  .gl-dot { width: 11px; height: 11px; border-radius: 50%; display: inline-block; }
  .gl-dot.legendary { background: radial-gradient(circle at 35% 35%, #fff2c0, #e3a13b 60%, #8a5a10); box-shadow: 0 0 8px rgba(227,161,59,0.8); }
  .gl-dot.epic { background: radial-gradient(circle at 35% 35%, #e4c8ff, #8a2be2 60%, #4a0f6e); box-shadow: 0 0 8px rgba(138,43,226,0.7); }
  .gl-dot.rare { background: radial-gradient(circle at 35% 35%, #cfe4ff, #4a90e2 60%, #1f4a8a); box-shadow: 0 0 8px rgba(74,144,226,0.6); }
  .gl-dot.common { background: radial-gradient(circle at 35% 35%, #dfe4ea, #94a0b0 60%, #4a525e); }

  /* Подарки */
  .gifts-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(118px, 1fr)); gap: 10px; margin-top: 6px; perspective: 900px; }
  .gift-cat { display: flex; flex-direction: column; gap: 8px; margin-top: 10px; }
  .gift-cat-head { display: flex; align-items: center; gap: 7px; font-size: 13px; font-weight: 700; }
  .gift-cat-icon { font-size: 17px; }
  .gift-cat-note { font-size: 10.5px; color: var(--gold, #e3a13b); font-weight: 700; background: rgba(227,161,59,0.12); padding: 1px 8px; border-radius: 999px; }
  .gift-card {
    display: flex; flex-direction: column; align-items: center; gap: 3px;
    padding: 14px 8px 12px;
    border: 1px solid var(--line);
    border-radius: 14px;
    background: var(--panel);
    color: var(--text);
    cursor: pointer;
    text-align: center;
    transition: transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
  }
  .gift-card:hover { transform: translateY(-3px) scale(1.02); border-color: var(--accent); }
  .gift-card:active { transform: scale(0.97); }
  .gift-card.active { border-color: var(--accent); background: var(--accent-soft); box-shadow: 0 0 0 1px var(--accent); }
  .gift-card[data-rarity='rare'] { border-color: rgba(74, 144, 226, 0.55); }
  .gift-card[data-rarity='rare']:hover { box-shadow: 0 0 18px rgba(74, 144, 226, 0.35), 0 10px 24px rgba(0,0,0,0.3); }
  .gift-card[data-rarity='epic'] { border-color: rgba(138, 43, 226, 0.6); }
  .gift-card[data-rarity='epic']:hover { box-shadow: 0 0 22px rgba(138, 43, 226, 0.4), 0 10px 24px rgba(0,0,0,0.3); }
  .gift-card[data-rarity='legendary'] { border-color: var(--gold, #e3a13b); }
  .gift-card[data-rarity='legendary']:hover { box-shadow: 0 0 26px rgba(227,161,59,0.5), 0 12px 26px rgba(0,0,0,0.35); }
  .gift-emoji {
    display: inline-block;
    font-size: 30px; line-height: 1.1;
    transform-style: preserve-3d;
    transition: transform 0.3s ease;
  }
  .gift-card:hover .gift-emoji { transform: translateZ(24px) rotateY(12deg) scale(1.12); }
  /* Живое эмодзи на обычных карточках: лёгкое покачивание */
  .gift-card:not(.gift-card-3d) .gift-emoji { animation: giftWobble 3.5s ease-in-out infinite; }
  .gift-card[data-rarity='legendary'] .gift-emoji {
    filter: drop-shadow(0 0 8px rgba(227,161,59,0.9)) drop-shadow(0 0 16px rgba(227,161,59,0.5));
  }
  .gift-card[data-rarity='epic'] .gift-emoji {
    filter: drop-shadow(0 0 6px rgba(138, 43, 226, 0.8));
  }
  .gift-card[data-rarity='rare'] .gift-emoji {
    filter: drop-shadow(0 0 5px rgba(74, 144, 226, 0.7));
  }
  .gift-card-3d {
    padding: 12px 8px 14px; position: relative;
    background: linear-gradient(165deg, var(--panel-2), var(--panel));
    animation: giftCardFloat 4.5s ease-in-out infinite;
  }
  .gift-card-3d:hover { animation-play-state: paused; }
  @keyframes giftCardFloat {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-2px); }
  }
  .gift-card-3d[data-rarity='legendary'] { border-color: rgba(227,161,59,0.7); box-shadow: 0 0 0 1px rgba(227,161,59,0.35), 0 6px 24px rgba(227,161,59,0.18); }
  .gift-card-3d[data-rarity='epic'] { border-color: rgba(138,43,226,0.6); box-shadow: 0 0 0 1px rgba(138,43,226,0.3), 0 6px 24px rgba(138,43,226,0.16); }
  .gift-card-3d[data-rarity='rare'] { border-color: rgba(74,144,226,0.55); box-shadow: 0 0 0 1px rgba(74,144,226,0.28), 0 6px 24px rgba(74,144,226,0.14); }
  @keyframes giftWobble {
    0%, 100% { transform: rotate(0deg) translateY(0); }
    30% { transform: rotate(-4deg) translateY(-2px); }
    65% { transform: rotate(4deg) translateY(1px); }
  }
  /* Постоянное лёгкое парение объёмного предмета */
  .gift-3d-stage {
    width: 62px; height: 62px; margin-bottom: 5px; flex: none;
    border-radius: 13px; overflow: hidden; position: relative;
    background: #0a0c12; border: 1px solid #232b3a;
    display: grid; place-items: center;
    animation: giftFloat 3.5s ease-in-out infinite;
  }
  /* Светящееся кольцо за предметом (не конфликтует с transform вращения) */
  .gift-3d-stage::before {
    content: ''; position: absolute; inset: -26%;
    border-radius: 50%;
    background: radial-gradient(circle at 50% 50%, transparent 55%, rgba(120,180,255,0.18) 80%, transparent 100%);
    z-index: 0; pointer-events: none;
    animation: giftHalo 4s ease-in-out infinite;
  }
  .gift-card-3d[data-rarity='legendary'] .gift-3d-stage::before {
    background: radial-gradient(circle at 50% 50%, transparent 50%, rgba(227,161,59,0.4) 80%, transparent 100%);
    animation-duration: 2.4s;
  }
  .gift-card-3d[data-rarity='epic'] .gift-3d-stage::before {
    background: radial-gradient(circle at 50% 50%, transparent 52%, rgba(138,43,226,0.35) 80%, transparent 100%);
    animation-duration: 3s;
  }
  .gift-card-3d[data-rarity='rare'] .gift-3d-stage::before {
    background: radial-gradient(circle at 50% 50%, transparent 54%, rgba(74,144,226,0.3) 80%, transparent 100%);
    animation-duration: 3.6s;
  }
  .gift-3d-stage img {
    position: absolute; width: 118%; height: 118%; object-fit: cover;
    top: -9%; left: -9%;
    z-index: 1;
        animation: giftBreathe 7s ease-in-out infinite;
  }
  .gift-card-3d:hover .gift-3d-stage { animation-play-state: paused; }
  .gift-card-3d:hover .gift-3d-stage img { transform: scale(1.14); }
  .gift-card-3d[data-rarity='legendary'] .gift-3d-stage {
    border-color: rgba(227,161,59,0.7);
  }
  .gift-card-3d[data-rarity='epic'] .gift-3d-stage {
    border-color: rgba(138,43,226,0.65);
  }
  .gift-card-3d[data-rarity='rare'] .gift-3d-stage {
    border-color: rgba(74,144,226,0.6);
  }
  .gift-rarity {
    font-size: 9.5px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.9px;
    color: var(--gold, #e3a13b); padding: 1px 8px; border-radius: 999px;
    background: rgba(227,161,59,0.16); border: 1px solid rgba(227,161,59,0.35);
    text-shadow: 0 0 8px rgba(227,161,59,0.6);
  }
  .gift-card-3d[data-rarity='epic'] .gift-rarity { color: #e6d0ff; background: rgba(138,43,226,0.2); border-color: rgba(178,102,255,0.5); text-shadow: 0 0 8px rgba(178,102,255,0.7); }
  .gift-card-3d[data-rarity='rare'] .gift-rarity { color: #cfe4ff; background: rgba(74,144,226,0.18); border-color: rgba(110,170,255,0.5); text-shadow: 0 0 8px rgba(110,170,255,0.7); }
  .gift-card-3d .gift-name { font-weight: 700; }
  .gift-card-3d[data-rarity='legendary'] .gift-name { color: #ffe6b0; text-shadow: 0 0 10px rgba(227,161,59,0.5); }
  .gift-card-3d[data-rarity='epic'] .gift-name { color: #ecd9ff; text-shadow: 0 0 10px rgba(178,102,255,0.45); }
  .gift-card-3d[data-rarity='rare'] .gift-name { color: #d3e7ff; text-shadow: 0 0 10px rgba(110,170,255,0.45); }
  .ach-3d-stage {
    width: 50px; height: 50px; flex: none;
    border-radius: 12px; overflow: hidden; position: relative;
    background: #0a0c12; border: 1px solid #232b3a;
    display: grid; place-items: center;
    animation: giftFloat 3.5s ease-in-out infinite;
  }
  .ach-3d-stage::before {
    content: ''; position: absolute; inset: -30%;
    border-radius: 50%;
    background: radial-gradient(circle at 50% 50%, transparent 52%, rgba(120,180,255,0.15) 80%, transparent 100%);
    z-index: 0; pointer-events: none;
    animation: giftHalo 4.2s ease-in-out infinite;
  }
  .ach-3d-stage img {
    position: absolute; width: 120%; height: 120%; object-fit: cover;
    top: -10%; left: -10%;
    z-index: 1;
        animation: giftBreathe 8s ease-in-out infinite;
  }
  .coin.rare .ach-3d-stage::before {
    background: radial-gradient(circle at 50% 50%, transparent 52%, rgba(66,168,255,0.28) 80%, transparent 100%);
    animation-duration: 3.6s;
  }
  .coin.epic .ach-3d-stage::before {
    background: radial-gradient(circle at 50% 50%, transparent 52%, rgba(167,112,241,0.33) 80%, transparent 100%);
    animation-duration: 3s;
  }
  .coin.leg .ach-3d-stage::before {
    background: radial-gradient(circle at 50% 50%, transparent 50%, rgba(255,184,76,0.4) 80%, transparent 100%);
    animation-duration: 2.4s;
  }
  @keyframes giftFloat {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-4px); }
  }
  /* Дыхание картинки — живой масштаб */
  @keyframes giftBreathe {
    0%, 100% { transform: scale(1.02); }
    50% { transform: scale(1.05); }
  }
  /* Пульсация светового ореола */
  @keyframes giftHalo {
    0%, 100% { opacity: 0.65; transform: scale(0.95); }
    50% { opacity: 1; transform: scale(1.12); }
  }
  /* Бегущий блик */
  @keyframes giftShine {
    0% { left: -60%; }
    55% { left: -60%; }
    100% { left: 140%; }
  }
  .gift-name { font-size: 12.5px; font-weight: 600; }
  .gift-price { font-size: 11.5px; color: var(--gold, #e3a13b); font-weight: 700; }
  .gift-active-row { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-top: 10px; }

  .gift-modal-mask { position: fixed; inset: 0; z-index: 90; background: rgba(8,10,15,0.6); }
  .gift-card-modal {
    position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
    z-index: 91; width: min(340px, calc(100vw - 40px));
    display: flex; flex-direction: column; gap: 12px;
    padding: 16px 18px;
    border: 1px solid var(--line); border-radius: 16px;
    background: var(--panel); box-shadow: 0 24px 60px rgba(0,0,0,0.55);
  }
  .gcm-item { display: flex; align-items: center; gap: 12px; }
  .gift-emoji.big { font-size: 40px; line-height: 1.1; }
  .gift-mode-row { display: flex; gap: 8px; flex-wrap: wrap; }
  .gift-recipient {
    height: 32px; padding: 0 12px;
    border: 1px solid var(--line); border-radius: 9px;
    background: var(--panel-2); color: var(--text);
    font: inherit; font-size: 13px;
  }
  .gift-modal-actions { display: flex; gap: 8px; align-items: center; }
  .coin-status { font-size: 12px; font-weight: 600; }
  .coin-status.ok { color: var(--ok, #43d17a); }

  /* Ряд купленных подарков в шапке профиля */
  .gift-rail { display: flex; align-items: center; gap: 8px; margin-top: 12px; flex-wrap: wrap; }
  .gift-rail-scroll { display: flex; gap: 6px; flex-wrap: wrap; }
  .gift-rail-item {
    width: 40px; height: 40px; flex: none;
    display: grid; place-items: center;
    border-radius: 12px;
    border: 1px solid var(--line);
    background: var(--panel-2);
    cursor: pointer;
    font-size: 20px;
    transition: border-color 0.15s ease, transform 0.15s ease;
  }
  .gift-rail-item:hover { border-color: var(--accent); transform: translateY(-2px); }
  .gift-rail-item.active { border-color: var(--accent); background: var(--accent-soft); box-shadow: 0 0 0 2px rgba(138,180,255,0.25); }
  .gift-rail-item .gift-emoji { font-size: 20px; line-height: 1; }
  .gift-rail-open {
    height: 40px; padding: 0 12px; flex: none;
    border-radius: 12px;
    border: 1px dashed var(--line);
    background: transparent;
    color: var(--muted);
    font: inherit; font-size: 12px; font-weight: 600;
    cursor: pointer;
  }
  .gift-rail-open:hover { border-color: var(--accent); color: var(--accent); }
  .gift-rail-panel {
    display: flex; flex-wrap: wrap; gap: 8px;
    margin-top: 8px; padding: 12px;
    border: 1px solid var(--line);
    border-radius: 12px;
    background: var(--panel);
  }
  .gift-rail-pick {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 6px 10px;
    border: 1px solid var(--line);
    border-radius: 9px;
    background: var(--panel-2);
    color: var(--text);
    font: inherit; font-size: 12px;
    cursor: pointer;
  }
  .gift-rail-pick:hover { border-color: var(--accent); }
  .gift-rail-pick.active { border-color: var(--accent); background: var(--accent-soft); }
  .gift-rail-pick.clear { color: var(--muted); }
  .gift-rail-pick .gift-emoji { font-size: 18px; line-height: 1; }
</style>

