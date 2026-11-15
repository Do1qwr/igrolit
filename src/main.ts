import './style.css';
import { getCurrent } from '@tauri-apps/api/window';
import { initLocale } from './lib/i18n';
import App from './App.svelte';
import Curtain from './Curtain.svelte';
import Palette from './Palette.svelte';
import FriendsWindow from './components/FriendsWindow.svelte';

initLocale();

const label = getCurrent().label;
const isCurtain = label === 'curtain';
const isPalette = label === 'palette';
const isFriends = label === 'friends';

if (isCurtain) {
  document.body.classList.add('curtain-window');
}

if (isPalette) {
  document.body.classList.add('palette-window');
}

if (isFriends) {
  document.body.classList.add('friends-window');
}

const DARK_THEMES = ['amoled', 'midnight', 'forest', 'garnet', 'ocean'];

try {
  const raw = localStorage.getItem('gameLauncherSettings');
  const stored: string | null = raw ? JSON.parse(raw).theme : null;
  const fromQuery = new URLSearchParams(window.location.search).get('theme');
  const source = fromQuery ?? stored;

  const isStandard = source === 'standard' || source === 'system';
  const resolved = isStandard
    ? window.matchMedia('(prefers-color-scheme: light)').matches
      ? 'light'
      : 'graphite'
    : DARK_THEMES.includes(source ?? '')
      ? (source as string)
      : 'graphite';

  if (resolved !== 'graphite') {
    document.body.classList.add('theme-' + resolved);
  }
} catch (e) {
  console.error('Не удалось применить тему', e);
}

const Root: typeof App = isCurtain
  ? (Curtain as unknown as typeof App)
  : isPalette
    ? (Palette as unknown as typeof App)
    : isFriends
      ? (FriendsWindow as unknown as typeof App)
      : App;

const app = new Root({
  target: document.getElementById('app')!,
});

export default app;
