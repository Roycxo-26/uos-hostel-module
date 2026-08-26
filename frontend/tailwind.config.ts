import type { Config } from 'tailwindcss';

// Design tokens for the whole app. Deliberately restrained: one accent
// colour (overridden per-tenant at runtime via the CSS variable it points
// to — see src/index.css and src/context/TenantSettingsContext.tsx), a
// neutral slate scale for everything else, and semantic colours reserved
// for status meaning, not decoration. No gradients, no drop-shadow-heavy
// "SaaS marketing site" styling — this reads as institutional software.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        accent: {
          DEFAULT: 'var(--color-accent)',
          fg: 'var(--color-accent-fg)',
          subtle: 'var(--color-accent-subtle)',
        },
      },
      fontFamily: {
        // Self-hosted "InterVariable" first (see src/main.tsx) — one
        // typeface rendering identically across every OS instead of
        // whatever each platform's system-UI font happens to be, which is
        // most of what makes an app read as deliberately designed rather
        // than "unstyled browser defaults". Same OS-native stack as before
        // kept as the fallback for the brief window before it loads.
        sans: [
          '"InterVariable"', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"',
          'Roboto', '"Helvetica Neue"', 'Arial', 'sans-serif',
        ],
      },
      boxShadow: {
        // One elevation step. Reserved for surfaces that sit ABOVE the page
        // rather than being part of its flow — the Sheet, dropdown menus,
        // and the login card (a floating panel over a full-bleed brand
        // field, not a card in a list). In-page content stays
        // border-separated; this is deliberately not sprinkled onto every
        // Card, which is what makes it register as elevation instead of
        // decoration when it does appear.
        panel: '0 8px 24px -4px rgb(15 23 42 / 0.12)',
      },
      minHeight: {
        touch: '2.75rem', // 44px — flow.md §10.4 "large tap targets"
      },
    },
  },
  plugins: [],
} satisfies Config;
