<script lang="ts">
  import { iconUrl, imageCache, resolveImage, type ListBlockInfo, type PublicServer } from '../lib/online';

  $: imageFor = (url: string) => (url ? $imageCache[url] || resolveImage(url) : '');

  export let block: ListBlockInfo;
  export let servers: PublicServer[] = [];
  export let onOpen: (server: PublicServer) => void = () => {};

  const rub = (value: number) => String(value).replace('.', ',');
  const findServer = (id: string) => servers.find((item) => item.id === id) || null;
  $: filled = block.slots.filter((slot) => slot.id).length;
  $: where = block.at > 0 ? `после #${block.at}` : 'в конце списка';
</script>

<section class="pin-block">
  <header class="pin-head">
    <strong>Закреплённые</strong>
    <span class="pin-note">{where} · от {rub(block.price)} ₽/сут</span>
    <span class="pin-count">{filled}/{block.slots.length}</span>
  </header>

  <div class="pin-grid">
    {#each block.slots as slot (slot.slot)}
      {@const server = slot.id ? findServer(slot.id) : null}
      {#if server}
        <button class="pin-card filled" on:click={() => onOpen(server)} title={server.name}>
          <span class="pin-ava">
            {#if imageFor(iconUrl(server))}
              <img src={imageFor(iconUrl(server))} alt="" loading="lazy" />
            {:else}
              {server.name.slice(0, 1).toUpperCase()}
            {/if}
            <i class="pin-dot" class:on={server.online}></i>
          </span>
          <span class="pin-body">
            <strong>{server.name}</strong>
            <span>{server.online ? `${server.players}/${server.maxPlayers || '—'}` : 'не отвечает'}</span>
          </span>
          <span class="pin-place">#{slot.slot}</span>
        </button>
      {:else}
        <div class="pin-card free">
          <span class="pin-ava free">+</span>
          <span class="pin-body">
            <strong>Свободно</strong>
            <span>{rub(block.price)} ₽/день</span>
          </span>
          <span class="pin-place">#{slot.slot}</span>
        </div>
      {/if}
    {/each}
  </div>
</section>

<style>
  .pin-block {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 12px;
    margin-top: 12px;
    border: 1px solid var(--line-soft);
    border-radius: 14px;
    background: var(--panel);
  }
  .pin-head {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }
  .pin-head strong {
    font-size: 13.5px;
  }
  .pin-note {
    font-size: 11.5px;
    color: var(--muted-2);
  }
  .pin-count {
    margin-left: auto;
    min-width: 20px;
    height: 20px;
    padding: 0 6px;
    display: grid;
    place-items: center;
    border-radius: 999px;
    background: var(--hover-2, rgba(255, 255, 255, 0.06));
    color: var(--muted);
    font-size: 11px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .pin-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
  }
  .pin-card {
    position: relative;
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 10px 12px;
    border: 1px solid var(--line-soft);
    border-radius: 12px;
    background: var(--panel);
    color: var(--ink);
    font: inherit;
    text-align: left;
    min-width: 0;
    transition: border-color 0.16s ease, box-shadow 0.16s ease, transform 0.16s ease;
  }
  .pin-card.filled {
    cursor: pointer;
  }
  .pin-card.filled:hover {
    border-color: rgba(138, 180, 255, 0.45);
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.25);
    transform: translateY(-1px);
  }
  .pin-card.free {
    border-style: dashed;
    background: transparent;
    color: var(--muted);
    cursor: default;
  }
  .pin-ava {
    position: relative;
    width: 30px;
    height: 30px;
    flex: none;
    display: grid;
    place-items: center;
    border-radius: 9px;
    background: var(--hover-2, rgba(255, 255, 255, 0.06));
    color: var(--muted);
    font-size: 13px;
    font-weight: 800;
    overflow: hidden;
  }
  .pin-ava img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .pin-ava.free {
    background: transparent;
    border: 1px dashed rgba(140, 160, 190, 0.5);
    color: var(--muted-2);
    font-weight: 600;
  }
  .pin-dot {
    position: absolute;
    right: -2px;
    bottom: -2px;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #7c8698;
    border: 2px solid var(--panel);
  }
  .pin-dot.on {
    background: #5ac88c;
  }
  .pin-body {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
  }
  .pin-body strong {
    font-size: 12px;
    font-weight: 700;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .pin-body span {
    font-size: 10.5px;
    color: var(--muted-2);
  }
  .pin-place {
    margin-left: auto;
    font-size: 10.5px;
    color: var(--muted-2);
    flex: none;
  }
  @media (max-width: 1000px) {
    .pin-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
</style>
