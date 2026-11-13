import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { applyTheme, loadThemeId } from './theme/engine';

// Apply the saved colour theme before the first paint
applyTheme(loadThemeId());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Offline helper for the hosted web version only. The desktop app (app://) bundles its files
// and a service worker there can't fetch them, which breaks every launch after the first.
if ('serviceWorker' in navigator) {
  if (location.protocol === 'https:' || location.protocol === 'http:') {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    });
  } else {
    navigator.serviceWorker
      .getRegistrations()
      .then((regs) => regs.forEach((r) => r.unregister()))
      .catch(() => {});
  }
}

