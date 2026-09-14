import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
// Self-hosted variable fonts — bundled at build time, no runtime request to
// a third-party font CDN (a real consideration for university IT/privacy
// review, not just performance). Falls back to the OS-native stack in
// tailwind.config.ts until each loads, and again if it ever fails to.
// Inter carries body text/UI chrome; Manrope is reserved for page titles
// and the login/brand panel (see tailwind.config.ts's `font-display`).
import '@fontsource-variable/inter';
import '@fontsource-variable/manrope';
import './index.css';
import { startSyncManager } from './offline/syncManager';

// Frontline/offline support (12 Sep 2026) — registered for the whole app,
// not just the Frontline screens: this is what makes /frontline/* load at
// all with zero connectivity (see public/sw.js's own comment). Guarded —
// some browsers/embedded webviews don't support service workers at all;
// the app should never fail to start because of this.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch((err) => {
      // eslint-disable-next-line no-console
      console.error('Service worker registration failed — offline app-shell loading will not work, everything else is unaffected:', err);
    });
  });
}
startSyncManager();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
