import { writable } from 'svelte/store';

export type Toast = { id: number; text: string; tone: 'info' | 'error' };

export const toasts = writable<Toast[]>([]);

let nextId = 0;

export function dismissToast(id: number) {
  toasts.update((list) => list.filter((t) => t.id !== id));
}

export function notify(text: string, tone: 'info' | 'error' = 'info') {
  const id = ++nextId;
  toasts.update((list) => [...list, { id, text: String(text), tone }]);
  setTimeout(() => dismissToast(id), 4600);
}

export type AskOptions = {
  title?: string;
  message: string;
  okLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
};

type AskState = AskOptions & { resolve: (value: boolean) => void };

export const askState = writable<AskState | null>(null);

export function ask(options: AskOptions): Promise<boolean> {
  return new Promise((resolve) => {
    askState.set({ ...options, resolve });
  });
}

export function answerAsk(value: boolean) {
  askState.update((state) => {
    if (state) state.resolve(value);
    return null;
  });
}
