import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  // Tailwind v4 — the plugin handles scanning + CSS generation directly;
  // no postcss.config.js/autoprefixer needed any more (v4 ships its own
  // vendor-prefixing).
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      // `@/*` — the import alias shadcn's CLI-generated components use
      // (`@/components/ui/button`, `@/lib/utils`) — required for `shadcn
      // add` to work at all. Existing code keeps using its own relative
      // imports; this is additive, not a replacement for that convention.
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
  },
});
