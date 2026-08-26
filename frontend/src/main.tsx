import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
// Self-hosted variable font — bundled at build time, no runtime request to a
// third-party font CDN (a real consideration for university IT/privacy
// review, not just performance). Falls back to the existing OS-native stack
// in tailwind.config.ts until it loads, and again if it ever fails to.
import '@fontsource-variable/inter';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
