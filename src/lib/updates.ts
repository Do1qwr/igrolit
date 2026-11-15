import { invoke } from '@tauri-apps/api/tauri';

export const CHANNEL = ((import.meta.env as unknown as Record<string, string>).VITE_CHANNEL || 'release') as
  | 'dev'
  | 'release';

export const IS_DEV = CHANNEL === 'dev';

export const UPDATE_SERVER =
  ((import.meta.env as unknown as Record<string, string>).VITE_UPDATE_SERVER || 'ws://127.0.0.1:8787').trim();

export interface ReleaseMeta {
  version: string;
  notes?: string;
  url: string;
  sha256?: string;
  sig?: string;
  size?: number;
  publishedAt?: number;
}

export async function currentVersion(): Promise<string> {
  try {
    return await invoke<string>('app_version');
  } catch {
    return '0.0.0';
  }
}

export async function publishRelease(server: string, token: string, version: string, notes: string): Promise<string> {
  return invoke<string>('release_publish', { server, token, version, notes });
}

export async function fetchLatest(server: string): Promise<ReleaseMeta | null> {
  try {
    const raw = await invoke<ReleaseMeta | null>('update_check', { server });
    if (!raw || !raw.version) return null;
    return raw;
  } catch {
    return null;
  }
}

export async function installUpdate(server: string, meta: ReleaseMeta): Promise<void> {
  await invoke('update_apply', {
    server,
    url: meta.url,
    sha256: meta.sha256 || '',
    version: meta.version,
    sig: meta.sig || '',
  });
}

export function isNewer(latest: string, current: string): boolean {
  const a = String(latest).split('.').map((x) => parseInt(x, 10) || 0);
  const b = String(current).split('.').map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const x = a[i] || 0;
    const y = b[i] || 0;
    if (x > y) return true;
    if (x < y) return false;
  }
  return false;
}
