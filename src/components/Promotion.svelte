<script lang="ts">
  import { onMount } from 'svelte';
  import { online, buyPromo, buyCoins, payOrder, clearLastOrder, setServerBanner, setServerBannerStyle, bannerUrl, iconUrl, setServerIcon, clearServerIcon, type PublicServer } from '../lib/online';

  export let server: PublicServer;
  export let onClose: () => void = () => {};
  export let startOption: string = '';

  type Option = { id: string; title: string; price: number; priceCoins: number; hint: string };

  const OPTIONS: Option[] = [
    {
      id: 'badge',
      title: 'Плашка',
      price: 1,
      priceCoins: 30,
      hint: 'Короткая подпись на карточке: «Новый», «Вайп», «Турнир»',
    },
    {
      id: 'color',
      title: 'Свой цвет',
      price: 2,
      priceCoins: 60,
      hint: 'Цветная рамка и подсветка карточки в списке',
    },
    {
      id: 'large',
      title: 'Крупная карточка',
      price: 3,
      priceCoins: 90,
      hint: 'Карточка больше остальных, с описанием и MOTD',
    },
    {
      id: 'pinned',
      title: 'Закрепление вверху',
      price: 5,
      priceCoins: 150,
      hint: 'Отдельный блок над рейтингом, всего 5 мест. Чем выше место — тем дороже',
    },
    {
      id: 'banner',
      title: 'Баннер на карточке',
      price: 2,
      priceCoins: 60,
      hint: 'Картинка над описанием: 468×60, 728×90, 320×100, 970×90, 300×250',
    },
    {
      id: 'catalog',
      title: 'Место в каталоге',
      price: 2,
      priceCoins: 60,
      hint: 'Блок между 10-м и 11-м сервером, всего 5 мест. Чем выше место — тем дороже',
    },
  ];

  const PIN_SLOT_PRICES = [
    { price: 3, priceCoins: 90 },
    { price: 2.5, priceCoins: 75 },
    { price: 2, priceCoins: 60 },
    { price: 1.5, priceCoins: 45 },
    { price: 1, priceCoins: 30 },
  ];

  const DAYS = [
    { days: 7, discount: 0, label: '7 дней' },
    { days: 30, discount: 10, label: '30 дней' },
    { days: 90, discount: 20, label: '90 дней' },
  ];

  let selected: string[] = [];
  let pinSlot = Number(server.pinSlot) || 0;
  let listBlockId = String(server.listBlock || '');
  let listSlotNum = Number(server.listSlot) || 0;
  let days = 30;
  let badge = 'ПРОМО';
  let color = '#e3a13b';
  let currency: 'coins' | 'rub' = 'rub';
  const BANNER_SIZES = ['468x60', '728x90', '320x100', '970x90', '300x250'];
  const BANNER_STYLES = [
    { id: 'soft', label: 'Мягкий фон', hint: 'лёгкий блюр, градиент вниз' },
    { id: 'blur', label: 'Сильный блюр', hint: 'почти ровное затемнение' },
    { id: 'full', label: 'Арт целиком', hint: 'без блюра, затемнение слева' },
  ];
  let bannerSize = (server.bannerSize as string) || '468x60';
  let bannerStyle = (server.bannerStyle as string) || 'soft';
  let bannerNote = '';
  let bannerBusy = false;

  let iconNote = '';
  let iconBusy = false;

  async function onIconPick(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files && input.files[0];
    input.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      iconNote = 'Нужен файл изображения: jpg, png или webp';
      return;
    }
    iconBusy = true;
    iconNote = 'Загружаю…';
    try {
      const dataUrl = await iconScaled(file);
      if (!setServerIcon(server.id, dataUrl)) {
        iconNote = 'Нет связи с сервером';
      } else {
        iconNote = 'Аватар сохранён';
      }
    } catch (e) {
      iconNote = 'Не удалось прочитать картинку';
    } finally {
      iconBusy = false;
    }
  }

  function iconScaled(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const scale = Math.min(1, 512 / img.width, 512 / img.height);
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(img.width * scale));
          canvas.height = Math.max(1, Math.round(img.height * scale));
          const ctx = canvas.getContext('2d');
          if (!ctx) return reject(new Error('canvas'));
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', 0.85));
        };
        img.onerror = () => reject(new Error('image'));
        img.src = String(reader.result);
      };
      reader.onerror = () => reject(new Error('read'));
      reader.readAsDataURL(file);
    });
  }

  function removeIconNow() {
    if (clearServerIcon(server.id)) iconNote = 'Аватар снят';
  }

  function pickBannerStyle(next: string) {
    bannerStyle = next;
    if (!server.banner) {
      bannerNote = 'Сначала загрузите картинку — вид применится к ней';
      return;
    }
    if (!setServerBannerStyle(server.id, next)) {
      bannerNote = 'Нет связи с сервером';
      return;
    }
    bannerNote = 'Вид баннера сохранён';
  }

  async function onBannerPick(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files && input.files[0];
    input.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      bannerNote = 'Нужен файл изображения: jpg, png или webp';
      return;
    }
    bannerBusy = true;
    bannerNote = 'Загружаю…';
    try {
      const dataUrl = await readScaled(file);
      if (!setServerBanner(server.id, dataUrl, bannerSize, bannerStyle)) {
        bannerNote = 'Нет связи с сервером';
      } else {
        bannerNote = `Баннер ${bannerSize.replace('x', '×')} сохранён`;
      }
    } catch (e) {
      bannerNote = 'Не удалось прочитать картинку';
    } finally {
      bannerBusy = false;
    }
  }

  function readScaled(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          if (!ctx) return reject(new Error('canvas'));
          ctx.drawImage(img, 0, 0);
          resolve(canvas.toDataURL('image/jpeg', 0.85));
        };
        img.onerror = () => reject(new Error('image'));
        img.src = String(reader.result);
      };
      reader.onerror = () => reject(new Error('read'));
      reader.readAsDataURL(file);
    });
  }

  const coinsAvailable = $online.coins ?? 0;

  $: discount = DAYS.find((item) => item.days === days)?.discount ?? 0;
  $: slots = $online.pinSlots.length
    ? $online.pinSlots
    : [1, 2, 3, 4, 5].map((slot) => ({
        slot,
        id: '',
        name: '',
        mine: false,
        price: PIN_SLOT_PRICES[slot - 1].price,
        priceCoins: PIN_SLOT_PRICES[slot - 1].priceCoins,
      }));
  const slotRate = (slot: number) => {
    const fromServer = $online.pinSlots.find((item) => item.slot === slot);
    if (fromServer && typeof fromServer.price === 'number') {
      return { price: fromServer.price, priceCoins: fromServer.priceCoins };
    }
    return PIN_SLOT_PRICES[slot - 1] || PIN_SLOT_PRICES[PIN_SLOT_PRICES.length - 1];
  };
  $: freeSlot = slots.find((item) => !item.id || item.mine) || slots[0];
  $: activePinSlot = pinSlot || (freeSlot ? freeSlot.slot : 1);
  $: slotPrice = slotRate(activePinSlot);
  $: slotsFree = slots.some((item) => !item.id || item.mine);
  $: slotsFull = selected.includes('pinned') && !slotsFree;
  $: listBlocks = $online.listBlocks.length
    ? $online.listBlocks
    : [
        { id: 'mid10', at: 10, label: 'После #10', price: 2, priceCoins: 60, slots: emptySlots() },
        { id: 'mid25', at: 25, label: 'После #25', price: 1.5, priceCoins: 45, slots: emptySlots() },
        { id: 'mid30', at: 30, label: 'После #30', price: 1.25, priceCoins: 38, slots: emptySlots() },
        { id: 'end', at: 0, label: 'В конце списка', price: 1, priceCoins: 30, slots: emptySlots() },
      ];
  $: activeBlock =
    listBlocks.find((item) => item.id === listBlockId) ||
    listBlocks.find((item) => item.slots.some((slot) => !slot.id || slot.mine)) ||
    listBlocks[0];
  $: blockSlots = activeBlock ? activeBlock.slots : [];
  $: freeListSlot = blockSlots.find((item) => !item.id || item.mine) || blockSlots[0];
  $: activeListAt = listSlotNum || (freeListSlot ? freeListSlot.slot : 1);
  $: listRate = activeBlock
    ? { price: activeBlock.price, priceCoins: activeBlock.priceCoins }
    : { price: 2, priceCoins: 60 };
  $: listFull =
    selected.includes('catalog') &&
    !listBlocks.some((block) => block.slots.some((item) => !item.id || item.mine));
  const slotRub = (value: number) => String(value).replace('.', ',');
  const emptySlots = () =>
    [1, 2, 3, 4, 5].map((slot) => ({ slot, id: '', name: '', mine: false }));
  $: perDay =
    OPTIONS.filter((item) => selected.includes(item.id) && item.id !== 'pinned' && item.id !== 'catalog').reduce((sum, item) => sum + item.price, 0) +
    (selected.includes('pinned') ? slotPrice.price : 0) +
    (selected.includes('catalog') ? listRate.price : 0);
  $: perDayCoins =
    OPTIONS.filter((item) => selected.includes(item.id) && item.id !== 'pinned' && item.id !== 'catalog').reduce((sum, item) => sum + item.priceCoins, 0) +
    (selected.includes('pinned') ? slotPrice.priceCoins : 0) +
    (selected.includes('catalog') ? listRate.priceCoins : 0);
  $: total = Math.round(perDay * days * (1 - discount / 100) * 100) / 100;
  $: totalCoins = Math.round(perDayCoins * days * (1 - discount / 100));
  $: order = $online.lastOrder && $online.lastOrder.server === server.id ? $online.lastOrder : null;
  $: activeUntil = server.promoUntil > Date.now() ? server.promoUntil : 0;
  $: showChip = currency === 'coins' ? (coinsAvailable >= totalCoins) : true;

  onMount(() => {
    // Счёт от другого сервера не должен всплывать в этом окне.
    if ($online.lastOrder && $online.lastOrder.server !== server.id) clearLastOrder();
    if (startOption && OPTIONS.some((item) => item.id === startOption) && !selected.includes(startOption)) {
      selected = [startOption];
      if (startOption === 'pinned' && server.pinSlot) pinSlot = Number(server.pinSlot) || 0;
    }
  });

  function toggle(id: string) {
    selected = selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id];
  }

  function createOrder() {
    if (!selected.length) return;
    buyPromo(server.id, {
      options: selected,
      days,
      currency,
      pinSlot: selected.includes('pinned') ? activePinSlot : 0,
      listBlock: selected.includes('catalog') && activeBlock ? activeBlock.id : '',
      listSlot: selected.includes('catalog') ? activeListAt : 0,
    });
  }

  function pay() {
    if (order) payOrder(order.id, { badge, color });
  }

  function formatDate(ts: number) {
    return new Date(ts).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }
</script>

<div class="promo-backdrop" role="presentation" on:click={onClose} on:keydown={() => {}}></div>
<div class="promo-modal" role="dialog" aria-modal="true" aria-label="Продвижение сервера">
  <header class="promo-head">
    <div>
      <h3>Продвижение: {server.name}</h3>
      <p class="muted small">
        Меняет только внешний вид карточки и место в блоке закреплённых. Голоса и место в рейтинге
        не продаются.
      </p>
    </div>
    <button class="ghost" on:click={onClose}>Закрыть</button>
  </header>

  <div class="promo-body">
    {#if activeUntil}
      <p class="current">
        Сейчас действует до <strong>{formatDate(activeUntil)}</strong>. Новая покупка продлит срок от
        этой даты.
      </p>
    {:else if $online.paidOrder && $online.paidOrder.server === server.id}
      <p class="current">
        Оплачено: <strong>{$online.paidOrder.amount} {($online.paidOrder.currency ?? 'rub') === 'coins' ? 'монет' : '₽'}</strong> · {$online.paidOrder.days} дн.
        Оформление включилось сразу.
      </p>
    {/if}

    <section class="promo-block avatar-block">
      <span class="block-title">Аватар сервера</span>
      <p class="muted small">Квадратная картинка вместо иконки — видна в каталоге и в блоке закреплённых. Бесплатно.</p>
      <div class="banner-actions">
        {#if server.icon}
          <img class="icon-preview" src={iconUrl(server)} alt="" />
        {/if}
        <label class="upload-btn" class:busy={iconBusy}>
          {server.icon ? 'Заменить аватар' : 'Загрузить аватар'}
          <input type="file" accept="image/png,image/jpeg,image/webp" on:change={onIconPick} />
        </label>
        {#if server.icon}
          <button class="upload-btn danger" on:click={removeIconNow}>Снять</button>
        {/if}
      </div>
      {#if iconNote}<span class="muted small">{iconNote}</span>{/if}
    </section>

    <section class="promo-block">
      <span class="block-title">Что даёт оформление</span>
      <div class="opt-grid">
        {#each OPTIONS as option (option.id)}
          <button
            class="opt"
            class:active={selected.includes(option.id)}
            on:click={() => toggle(option.id)}
          >
            <span class="opt-title">
              {option.title}
              <span class="opt-price">
                {option.id === 'pinned'
                  ? 'от ' + PIN_SLOT_PRICES[PIN_SLOT_PRICES.length - 1].price + ' до ' + PIN_SLOT_PRICES[0].price + ' ₽/день'
                  : option.id === 'catalog'
                    ? 'от ' + listBlocks[listBlocks.length - 1].price + ' до ' + listBlocks[0].price + ' ₽/день'
                    : option.price + ' ₽/день · ' + option.priceCoins + ' монет/день'}
              </span>
            </span>
            <span class="muted small">{option.hint}</span>
          </button>
        {/each}
      </div>

      {#if selected.includes('pinned')}
        <div class="slot-block">
          <span class="block-sub">Место в блоке закреплённых</span>
          <div class="slot-row">
            {#each slots as item (item.slot)}
              <button
                class="slot-chip"
                class:active={activePinSlot === item.slot}
                class:busy={!!item.id && !item.mine}
                disabled={!!item.id && !item.mine}
                title={item.id && !item.mine ? 'Занято: ' + item.name : 'Место ' + item.slot}
                on:click={() => (pinSlot = item.slot)}
              >
                <strong>#{item.slot}</strong>
                <span>{slotRub(slotRate(item.slot).price)} ₽/день</span>
                {#if item.id && !item.mine}<span class="slot-note">занято</span>{/if}
              </button>
            {/each}
          </div>
          <span class="muted small">Всего 5 мест: первое дороже, пятое дешевле. Место держится за сервером на оплаченный срок.</span>
          {#if slotsFull}
            <span class="slot-full">Все 5 мест заняты. Освободится, когда у кого-то закончится оплата.</span>
          {/if}
        </div>
      {/if}

      {#if selected.includes('catalog')}
        <div class="slot-block">
          <span class="block-sub">Где показывать</span>
          <div class="slot-row">
            {#each listBlocks as block (block.id)}
              <button
                class="slot-chip"
                class:active={activeBlock && activeBlock.id === block.id}
                class:busy={block.slots.every((item) => item.id && !item.mine)}
                on:click={() => { listBlockId = block.id; listSlotNum = 0; }}
              >
                <strong>{block.label}</strong>
                <span>{slotRub(block.price)} ₽/день</span>
                {#if block.slots.every((item) => item.id && !item.mine)}<span class="slot-note">занято</span>{/if}
              </button>
            {/each}
          </div>
          {#if activeBlock}
            <span class="block-sub">Место в блоке · {activeBlock.label}</span>
            <div class="slot-row">
              {#each blockSlots as item (item.slot)}
                <button
                  class="slot-chip"
                  class:active={activeListAt === item.slot}
                  class:busy={!!item.id && !item.mine}
                  disabled={!!item.id && !item.mine}
                  title={item.id && !item.mine ? 'Занято: ' + item.name : 'Место ' + item.slot}
                  on:click={() => (listSlotNum = item.slot)}
                >
                  <strong>место {item.slot}</strong>
                  <span>{item.id && !item.mine ? 'занято' : 'свободно'}</span>
                </button>
              {/each}
            </div>
          {/if}
          <span class="muted small">В каждом блоке 5 мест. Блок в конце списка всегда последний.</span>
          {#if listFull}
            <span class="slot-full">Все места во всех блоках заняты.</span>
          {/if}
        </div>
      {/if}

      {#if selected.includes('badge')}
        <div class="inline-field">
          <label for="promo-badge">Текст плашки</label>
          <input id="promo-badge" bind:value={badge} maxlength="16" placeholder="ПРОМО" />
        </div>
      {/if}
      {#if selected.includes('color')}
        <div class="inline-field">
          <label for="promo-color">Цвет</label>
          <input id="promo-color" type="color" bind:value={color} />
        </div>
      {/if}
      {#if selected.includes('banner')}
        <div class="banner-editor">
          <span class="block-sub">Размер баннера</span>
          <div class="size-row">
            {#each BANNER_SIZES as size (size)}
              <button class="size-chip" class:active={bannerSize === size} on:click={() => (bannerSize = size)}>
                {size.replace('x', '×')}
              </button>
            {/each}
          </div>
          <span class="block-sub">Как показывать</span>
          <div class="style-row">
            {#each BANNER_STYLES as st (st.id)}
              <button class="style-chip" class:active={bannerStyle === st.id} disabled={!server.banner} on:click={() => pickBannerStyle(st.id)}>
                <strong>{st.label}</strong>
                <span>{st.hint}</span>
              </button>
            {/each}
          </div>
          {#if server.banner}
            <img class="banner-preview" class:blur-preview={bannerStyle === 'blur'} src={bannerUrl(server)} alt="" />
          {/if}
          <div class="banner-actions">
            <label class="upload-btn" class:busy={bannerBusy}>
              {server.banner ? 'Заменить картинку' : 'Загрузить картинку'}
              <input type="file" accept="image/png,image/jpeg,image/webp" on:change={onBannerPick} />
            </label>
            <span class="muted small">png, jpg или webp до 1 МБ</span>
          </div>
          {#if bannerNote}<span class="muted small">{bannerNote}</span>{/if}
        </div>
      {/if}
    </section>

    <section class="promo-block">
      <span class="block-title">Оплата</span>
      <div class="currency-row">
        <button class="currency-chip" class:active={currency === 'rub'} on:click={() => (currency = 'rub')}>
          <strong>Рубли</strong>
          <span>оплата ₽</span>
        </button>
        <button class="currency-chip" class:active={currency === 'coins'} on:click={() => (currency = 'coins')}>
          <strong>Монеты</strong>
          <span>у вас: {coinsAvailable} монет</span>
        </button>
      </div>
      {#if currency === 'coins'}
        <p class="coin-earn-hint">
          Как заработать: голосуйте за серверы (+5 за голос), заходите каждый день (+10), новым игрокам даём 200 на старт.
        </p>
      {/if}
    </section>

    <section class="promo-block">
      <span class="block-title">Срок</span>
      <div class="days-row">
        {#each DAYS as item (item.days)}
          <button class="day-chip" class:active={days === item.days} on:click={() => (days = item.days)}>
            <strong>{item.label}</strong>
            <span>{item.discount ? `−${item.discount}%` : 'без скидки'}</span>
          </button>
        {/each}
      </div>
    </section>

    <section class="promo-block">
      <span class="block-title">Предпросмотр карточки</span>
      <div
        class="preview"
        class:large={selected.includes('large')}
        style:border-color={selected.includes('color') ? color : ''}
      >
        {#if selected.includes('badge')}
          <span class="pv-badge" style:background={color}>{badge || 'ПРОМО'}</span>
        {/if}
        <div class="pv-row">
          <div class="pv-avatar" style:color={selected.includes('color') ? color : ''}>
            {server.name.slice(0, 2).toUpperCase()}
          </div>
          <div class="pv-main">
            <strong>{server.name}</strong>
            <span class="muted small">{server.game || 'игра не указана'} · {server.address}</span>
            {#if selected.includes('large')}
              <span class="muted small">Крупная карточка: описание и MOTD под названием</span>
            {/if}
          </div>
          <div class="pv-votes">
            <strong>{server.votes}</strong>
            <span class="muted small">голосов</span>
          </div>
        </div>
      </div>
    </section>
  </div>

  <footer class="promo-foot">
    <div class="total">
      <span class="muted small">
        {selected.length ? `${selected.length} опц. · ${days} дн.${discount ? ` · −${discount}%` : ''}` : 'Ничего не выбрано'}
      </span>
      {#if currency === 'coins'}
        <strong>{totalCoins} монет</strong>
        {#if totalCoins > coinsAvailable}
          <span class="no-coins">Не хватает {totalCoins - coinsAvailable} монет.</span>
          <button class="ghost small-btn" on:click={() => buyCoins('plus')}>Пополнить на 500</button>
        {/if}
      {:else}
        <strong>{total} ₽</strong>
      {/if}
    </div>
    {#if order}
      <div class="pay-row">
        <span class="muted small">Счёт {order.amount} {(order.currency ?? 'rub') === 'coins' ? 'монет' : '₽'} · {order.days} дн.</span>
        <button class="ghost" on:click={onClose}>Позже</button>
        <button class="primary" on:click={pay}>Оплатить (тест)</button>
      </div>
    {:else}
      <button
        class="primary"
        disabled={!selected.length || slotsFull || listFull || (currency === 'coins' && totalCoins > coinsAvailable)}
        on:click={createOrder}
      >{currency === 'coins' ? 'Купить за монеты' : 'Создать счёт'}</button>
    {/if}
  </footer>

  <p class="hint">Оплата в тестовом режиме: заказ проходит целиком, деньги не списываются. Монеты начисляются за голоса за серверы и ежедневный вход.</p>
</div>

<style>
  .promo-backdrop {
    position: fixed;
    inset: 0;
    z-index: 150;
    background: rgba(4, 6, 16, 0.72);
    backdrop-filter: blur(3px);
  }
  .promo-modal {
    position: fixed;
    z-index: 151;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: min(760px, calc(100vw - 40px));
    max-height: calc(100vh - 60px);
    display: flex;
    flex-direction: column;
    border: 1px solid var(--line);
    border-radius: 16px;
    background: var(--panel);
    box-shadow: 0 30px 80px rgba(0, 0, 0, 0.6);
    overflow: hidden;
  }
  .promo-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    padding: 16px 18px;
    border-bottom: 1px solid var(--line);
  }
  .promo-head h3 { margin: 0 0 4px; font-size: 16px; }
  .promo-head p { max-width: 520px; line-height: 1.45; }
  .promo-body {
    padding: 14px 18px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .promo-block { display: flex; flex-direction: column; gap: 9px; }
  .block-title {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--muted-2);
  }
  .current {
    margin: 0;
    padding: 9px 12px;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--bg-soft);
    font-size: 12.5px;
    color: var(--muted);
  }
  .current strong { color: var(--text); }

  .opt-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 8px; }
  .opt {
    display: flex;
    flex-direction: column;
    gap: 4px;
    text-align: left;
    padding: 10px 12px;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--panel-2);
    color: var(--text);
    font: inherit;
    cursor: pointer;
    transition: border-color 0.14s ease, background 0.14s ease;
  }
  .opt:hover { border-color: var(--muted-2); }
  .opt.active { border-color: var(--accent); background: var(--accent-soft); }
  .opt-title { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 2px 8px; font-size: 12.5px; font-weight: 600; }
  .opt-title > span:first-child, .opt-title { line-height: 1.3; }
  .opt-price { color: var(--gold); font-weight: 700; white-space: nowrap; font-size: 11.5px; }

  .inline-field { display: flex; align-items: center; gap: 10px; }
  .inline-field label { font-size: 11.5px; color: var(--muted); }
  .inline-field input:not([type]) {
    height: 32px;
    padding: 0 10px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--bg-soft);
    color: var(--text);
    font: inherit;
    font-size: 12.5px;
  }
  .inline-field input[type='color'] {
    width: 44px;
    height: 28px;
    border: 1px solid var(--line);
    border-radius: 7px;
    background: transparent;
  }

  .days-row { display: flex; gap: 8px; flex-wrap: wrap; }
  .day-chip {
    display: flex;
    flex-direction: column;
    gap: 2px;
    align-items: flex-start;
    padding: 8px 14px;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--panel-2);
    color: var(--text);
    font: inherit;
    cursor: pointer;
    font-size: 12px;
  }
  .day-chip span { font-size: 10.5px; color: var(--ok); }
  .day-chip.active { border-color: var(--accent); background: var(--accent-soft); }

  .currency-row { display: flex; gap: 8px; flex-wrap: wrap; }
  .currency-chip {
    display: flex;
    flex-direction: column;
    gap: 2px;
    align-items: flex-start;
    padding: 10px 14px;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--panel-2);
    color: var(--text);
    font: inherit;
    cursor: pointer;
    font-size: 12.5px;
    text-align: left;
  }
  .currency-chip span { font-size: 11px; color: var(--muted); }
  .currency-chip.active { border-color: var(--gold); background: var(--accent-soft); }
  .currency-chip.active span { color: var(--gold); }

  .no-coins { font-size: 11px; color: var(--danger, #e5534b); }

  .coin-earn-hint {
    margin: 4px 0 0;
    padding: 8px 10px;
    border: 1px dashed var(--gold, #e3a13b);
    border-radius: 8px;
    background: var(--bg-soft);
    font-size: 11.5px;
    line-height: 1.45;
    color: var(--muted);
  }

  .preview {
    border: 1px solid var(--line);
    border-radius: 12px;
    padding: 12px;
    background: var(--bg-soft);
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .preview.large { padding: 16px; }
  .pv-badge {
    align-self: flex-start;
    padding: 2px 10px;
    border-radius: 999px;
    color: var(--ink-on-accent);
    font-size: 10.5px;
    font-weight: 700;
  }
  .pv-row { display: flex; align-items: center; gap: 12px; }
  .pv-avatar {
    width: 40px;
    height: 40px;
    border-radius: 9px;
    display: grid;
    place-items: center;
    background: var(--accent-soft);
    color: var(--accent);
    font-weight: 700;
  }
  .pv-main { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
  .pv-votes { display: flex; flex-direction: column; align-items: flex-end; }

  .slot-block { display: flex; flex-direction: column; gap: 8px; margin-top: 10px; }
  .slot-row { display: flex; gap: 8px; flex-wrap: wrap; }
  .slot-chip {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 7px 11px;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--panel-2);
    color: var(--text);
    font: inherit;
    cursor: pointer;
    transition: border-color 0.14s ease, background 0.14s ease;
  }
  .slot-chip strong { font-size: 12.5px; font-weight: 700; }
  .slot-chip span { font-size: 10.5px; color: var(--muted-2); }
  .slot-chip.active { border-color: rgba(138, 180, 255, 0.55); background: rgba(138, 180, 255, 0.12); }
  .slot-chip.busy { opacity: 0.45; cursor: not-allowed; }
  .slot-note { color: var(--danger); }
  .slot-full { font-size: 11.5px; color: var(--danger); }  .banner-editor { display: flex; flex-direction: column; gap: 8px; margin-top: 10px; }
  .avatar-block .muted.small { display: block; margin: 2px 0 8px; line-height: 1.45; }
  .block-sub { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted-2); }
  .size-row { display: flex; gap: 6px; flex-wrap: wrap; }
  .size-chip {
    height: 28px;
    padding: 0 10px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--panel-2);
    color: var(--muted);
    font: inherit;
    font-size: 11.5px;
    font-weight: 600;
    cursor: pointer;
  }
  .size-chip.active { border-color: var(--accent); color: var(--accent); background: var(--accent-soft); }
  .banner-preview { width: 100%; max-height: 110px; object-fit: cover; border-radius: 9px; border: 1px solid var(--line-soft); }
  .icon-preview {
    width: 56px;
    height: 56px;
    flex: none;
    object-fit: cover;
    border-radius: 10px;
    border: 1px solid var(--line-soft);
    background: var(--panel-2);
  }
  .banner-actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .style-row { display: flex; gap: 8px; flex-wrap: wrap; }
  .style-chip {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 7px 11px;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--panel-2);
    color: var(--text);
    font: inherit;
    text-align: left;
    cursor: pointer;
    transition: border-color 0.14s ease, background 0.14s ease;
  }
  .style-chip strong { font-size: 12px; font-weight: 600; }
  .style-chip span { font-size: 10.5px; color: var(--muted-2); }
  .style-chip:hover { border-color: rgba(138, 180, 255, 0.4); }
  .style-chip.active { border-color: rgba(217, 161, 59, 0.55); background: rgba(217, 161, 59, 0.1); }
  .style-chip.active strong { color: var(--gold); }
  .style-chip:disabled { opacity: 0.45; cursor: not-allowed; }
  .banner-preview.blur-preview { filter: blur(3px); }
  .upload-btn {
    position: relative;
    display: inline-flex;
    align-items: center;
    height: 30px;
    padding: 0 12px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--panel-2);
    color: var(--text);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
  }
  .upload-btn:hover { border-color: rgba(138, 180, 255, 0.35); }
  .upload-btn input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
  .upload-btn.busy { opacity: 0.6; pointer-events: none; }
  .upload-btn.danger { color: var(--danger); border-color: rgba(209, 85, 85, 0.4); }

  .promo-foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    flex-wrap: wrap;
    padding: 14px 18px;
    border-top: 1px solid var(--line);
  }
  .total { display: flex; flex-direction: column; gap: 2px; }
  .total strong { font-size: 18px; letter-spacing: -0.02em; }
  .pay-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .ghost,
  .primary {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: 36px;
    padding: 0 16px;
    border-radius: var(--radius-sm);
    font: inherit;
    font-size: 12.5px;
    font-weight: 600;
    cursor: pointer;
  }
  .ghost { border: 1px solid var(--line); background: var(--panel-2); color: var(--text); }
  .ghost:hover { background: var(--panel-3); border-color: var(--muted-2); }
  .primary {
    border: 1px solid transparent;
    background: var(--btn-bg);
    color: var(--btn-ink);
    font-weight: 680;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.3), var(--btn-glow);
  }
  .primary:hover:not(:disabled) { background: var(--btn-bg-hover); }
  .primary:disabled { opacity: 0.5; cursor: not-allowed; }

  .hint {
    margin: 0;
    padding: 0 18px 14px;
    font-size: 11.5px;
    color: var(--muted-2);
  }
</style>
