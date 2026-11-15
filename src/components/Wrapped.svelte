<script lang="ts">
  import { onMount, tick, createEventDispatcher } from 'svelte';
  import { invoke } from '@tauri-apps/api/tauri';
  import { t } from '../lib/i18n';
  import { notify } from '../lib/dialogs';

  interface Game {
    id: string;
    name: string;
    platform: string;
    launch_cmd: string;
  }

  interface Usage {
    count: number;
    last: number;
  }

  interface Event {
    id: string;
    ts: number;
  }

  export let games: Game[] = [];
  export let usage: Record<string, Usage> = {};

  const dispatch = createEventDispatcher();

  let activity: Event[] = [];
  let loading = true;
  let saved = '';
  let saving = false;
  let canvas: HTMLCanvasElement;

  const DAY = 86_400_000;

  function nameOf(id: string): string {
    return games.find((game) => game.id === id)?.name ?? id;
  }

  function dayKey(ts: number): string {
    const d = new Date(ts * 1000);
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  }

  $: total = activity.length
    ? activity.length
    : Object.values(usage).reduce((sum, item) => sum + (item.count || 0), 0);

  $: unique = new Set(activity.map((event) => event.id)).size || Object.keys(usage).length;

  $: activeDays = new Set(activity.map((event) => dayKey(event.ts))).size;

  $: top = Object.entries(
    activity.reduce<Record<string, number>>((acc, event) => {
      acc[event.id] = (acc[event.id] || 0) + 1;
      return acc;
    }, {}),
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  $: fallbackTop = Object.entries(usage)
    .sort((a, b) => (b[1].count || 0) - (a[1].count || 0))
    .slice(0, 5);

  $: rows = top.length ? top : fallbackTop;

  $: bars = (() => {
    const out: { label: string; value: number }[] = [];
    for (let i = 13; i >= 0; i -= 1) {
      const start = new Date(Date.now() - i * DAY);
      const key = dayKey(Math.floor(start.getTime() / 1000));
      const value = activity.filter((event) => dayKey(event.ts) === key).length;
      out.push({ label: String(start.getDate()), value });
    }
    return out;
  })();

  function draw() {
    if (!canvas || total === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = 1200;
    const H = 675;
    canvas.width = W;
    canvas.height = H;

    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#0b0f16');
    bg.addColorStop(1, '#121b2c');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    const glow = ctx.createRadialGradient(W * 0.82, H * 0.12, 0, W * 0.82, H * 0.12, 460);
    glow.addColorStop(0, 'rgba(110, 168, 255, 0.30)');
    glow.addColorStop(1, 'rgba(110, 168, 255, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = '#8ea0bb';
    ctx.font = '600 22px "Segoe UI", sans-serif';
    ctx.fillText($t('wrap.kicker'), 72, 96);

    ctx.fillStyle = '#eef3fb';
    ctx.font = '700 52px "Segoe UI", sans-serif';
    ctx.fillText($t('wrap.headline'), 72, 158);

    const stats = [
      { value: String(total), label: $t('wrap.launches') },
      { value: String(unique), label: $t('wrap.games') },
      { value: String(activeDays), label: $t('wrap.days') },
    ];
    stats.forEach((stat, index) => {
      const x = 72 + index * 250;
      ctx.fillStyle = '#6ea8ff';
      ctx.font = '700 64px "Segoe UI", sans-serif';
      ctx.fillText(stat.value, x, 286);
      ctx.fillStyle = '#8ea0bb';
      ctx.font = '500 18px "Segoe UI", sans-serif';
      ctx.fillText(stat.label, x, 318);
    });

    ctx.fillStyle = '#8ea0bb';
    ctx.font = '600 18px "Segoe UI", sans-serif';
    ctx.fillText($t('wrap.top'), 72, 400);

    rows.slice(0, 5).forEach(([id, count], index) => {
      const y = 440 + index * 42;
      ctx.fillStyle = '#dfe7f5';
      ctx.font = '500 20px "Segoe UI", sans-serif';
      const name = nameOf(id);
      ctx.fillText(name.length > 42 ? name.slice(0, 41) + '…' : name, 72, y);
      ctx.fillStyle = '#6ea8ff';
      ctx.font = '600 18px "Segoe UI", sans-serif';
      ctx.fillText(String(count), 640, y);
    });

    const maxBar = Math.max(1, ...bars.map((bar) => bar.value));
    const baseY = 620;
    const barW = 26;
    const gap = 12;
    const startX = 760;

    bars.forEach((bar, index) => {
      const h = Math.round((bar.value / maxBar) * 120);
      const x = startX + index * (barW + gap);
      ctx.fillStyle = bar.value ? 'rgba(110, 168, 255, 0.75)' : 'rgba(255, 255, 255, 0.08)';
      ctx.fillRect(x, baseY - Math.max(4, h), barW, Math.max(4, h));
      ctx.fillStyle = '#5d6b82';
      ctx.font = '400 12px "Segoe UI", sans-serif';
      ctx.fillText(bar.label, x + 6, baseY + 20);
    });

    ctx.fillStyle = '#5d6b82';
    ctx.font = '500 16px "Segoe UI", sans-serif';
    ctx.fillText('Game Launcher', 72, 646);
  }

  async function save() {
    if (!canvas || saving) return;
    saving = true;
    saved = '';
    try {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('Не удалось собрать картинку');
      const bytes = new Uint8Array(await blob.arrayBuffer());
      saved = await invoke<string>('export_wrapped', { png: Array.from(bytes) });
    } catch (e) {
      notify(`Не удалось сохранить: ${e}`);
    } finally {
      saving = false;
    }
  }

  onMount(async () => {
    try {
      activity = await invoke<Event[]>('get_activity');
    } catch (e) {
      console.error('Не удалось прочитать журнал запусков', e);
    } finally {
      loading = false;
    }
    await tick();
    draw();
  });
</script>

<div class="backdrop" role="presentation" on:click={() => dispatch('close')} on:keydown={() => {}}>
  <div class="panel" role="presentation" on:click|stopPropagation on:keydown={() => {}}>
    <header>
      <h2>{$t('wrap.title')}</h2>
      <button class="x" on:click={() => dispatch('close')} aria-label="Закрыть">×</button>
    </header>

    {#if loading}
      <p class="empty">{$t('wrap.loading')}</p>
    {:else if total === 0}
      <p class="empty">{$t('wrap.empty')}</p>
    {:else}
      <canvas bind:this={canvas} class="card"></canvas>

      <div class="actions">
        <button class="ghost" on:click={save} disabled={saving}>
          {saving ? $t('wrap.saving') : $t('wrap.save')}
        </button>
        <button class="primary" on:click={() => dispatch('close')}>{$t('wrap.close')}</button>
      </div>

      {#if saved}
        <p class="path">{$t('wrap.saved')}: {saved}</p>
      {/if}
    {/if}
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 220;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    background: rgba(0, 0, 0, 0.58);
    backdrop-filter: blur(5px);
  }

  .panel {
    width: 920px;
    max-width: 100%;
    padding: 16px;
    border: 1px solid var(--line);
    border-radius: 16px;
    background: var(--panel);
    box-shadow: 0 28px 80px rgba(0, 0, 0, 0.65);
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
  }
  h2 { margin: 0; font-size: 15px; font-weight: 650; }
  .x {
    width: 26px;
    height: 26px;
    border: 0;
    border-radius: 7px;
    background: var(--panel-2);
    color: var(--muted);
    font-size: 16px;
    cursor: pointer;
  }
  .x:hover { background: var(--hover-2); color: var(--text); }

  .card {
    display: block;
    width: 100%;
    height: auto;
    border-radius: 12px;
    border: 1px solid var(--line-soft);
  }

  .actions { display: flex; gap: 8px; margin-top: 12px; }
  .ghost, .primary {
    flex: 1;
    height: 36px;
    border-radius: 9px;
    font: inherit;
    font-size: 12.5px;
    font-weight: 600;
    cursor: pointer;
  }
  .ghost { border: 1px solid var(--line); background: transparent; color: var(--text); }
  .ghost:hover { background: var(--hover-2); }
  .primary { border: 1px solid var(--accent); background: var(--accent); color: var(--ink-on-accent); }
  .primary:hover { filter: brightness(1.08); }
  .ghost:disabled { cursor: progress; opacity: 0.7; }

  .path { margin: 10px 2px 0; font-size: 10.5px; color: var(--muted-2); word-break: break-all; }
  .empty { padding: 40px 10px; text-align: center; font-size: 12.5px; color: var(--muted-2); }
</style>
