import { writable, get } from 'svelte/store';
import { invoke } from '@tauri-apps/api/tauri';
import { online } from './online';
import { UPDATE_SERVER } from './updates';

export type GatePhase = 'checking' | 'online' | 'maintenance' | 'offline';

export interface GateState {
  phase: GatePhase;
  message: string;
  since: number;
  attempts: number;
  nextIn: number;
}

const ONLINE_DELAY = 15000;
const RETRY_DELAY = 5000;

export const gate = writable<GateState>({
  phase: 'checking',
  message: '',
  since: 0,
  attempts: 0,
  nextIn: 0,
});

let started = false;
let timer: ReturnType<typeof setTimeout> | null = null;
let countdown: ReturnType<typeof setInterval> | null = null;

function httpBase(): string {
  const raw = (get(online).server || UPDATE_SERVER || '').trim().replace(/\/+$/, '');
  if (raw.startsWith('ws://')) return 'http://' + raw.slice(5);
  if (raw.startsWith('wss://')) return 'https://' + raw.slice(6);
  return raw;
}

function schedule(ms: number) {
  if (timer) clearTimeout(timer);
  gate.update((state) => ({ ...state, nextIn: Math.round(ms / 1000) }));
  timer = setTimeout(() => {
    if (countdown) clearInterval(countdown);
    probe();
  }, ms);
}

async function probe(): Promise<void> {
  const base = httpBase();
  if (!base) {
    gate.update((state) => ({
      ...state,
      phase: 'offline',
      message: 'Адрес сервера не задан',
      attempts: state.attempts + 1,
    }));
    schedule(RETRY_DELAY);
    return;
  }

  try {
    const status = await invoke<{ maintenance?: { on?: boolean; message?: string; since?: number } }>(
      'app_status',
      { url: base + '/status' },
    );
    const maintenance = status?.maintenance || {};
    if (maintenance.on) {
      gate.update((state) => ({
        phase: 'maintenance',
        message: maintenance.message || '',
        since: maintenance.since || 0,
        attempts: 0,
        nextIn: state.nextIn,
      }));
      schedule(RETRY_DELAY);
      return;
    }
    gate.update((state) => ({
      phase: 'online',
      message: '',
      since: 0,
      attempts: 0,
      nextIn: state.nextIn,
    }));
    schedule(ONLINE_DELAY);
  } catch {
    gate.update((state) => ({
      phase: 'offline',
      message: '',
      since: state.since || Date.now(),
      attempts: state.attempts + 1,
      nextIn: state.nextIn,
    }));
    schedule(RETRY_DELAY);
  }
}

export function startGate() {
  if (started) return;
  started = true;
  gate.update((state) => ({ ...state, phase: 'checking' }));
  probe();
  if (countdown) clearInterval(countdown);
  countdown = setInterval(() => {
    gate.update((state) => ({
      ...state,
      nextIn: state.nextIn > 0 ? state.nextIn - 1 : 0,
    }));
  }, 1000);
}

export function stopGate() {
  started = false;
  if (timer) clearTimeout(timer);
  if (countdown) clearInterval(countdown);
  timer = null;
  countdown = null;
}

export function retryNow() {
  if (timer) clearTimeout(timer);
  timer = null;
  probe();
}
