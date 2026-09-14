import { motion } from 'framer-motion';
import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Alert, Button, FieldWrapper, Textarea } from '../design-system';
import { BedIcon, BuildingIcon, ClipboardIcon } from '../design-system/icons';
import { errorMessage } from '../lib/errorMessage';

/**
 * STANDALONE DEV MODE ONLY. There is no live auth-server in this mode (see
 * uos-module-template's README "Standalone dev mode"), so there is no
 * POST /auth/login to call — tokens come from a CLI script instead:
 *
 *   cd backend
 *   npm run dev:mint-token -- --user-id=00000000-0000-0000-0000-000000000002 --role=campus_admin   # Head Warden persona
 *   npm run dev:mint-token -- --user-id=00000000-0000-0000-0000-000000000003 --role=campus_admin   # Warden persona
 *   npm run dev:mint-token -- --user-id=00000000-0000-0000-0000-000000000004 --role=campus_admin   # Student persona
 *   npm run dev:mint-token -- --user-id=00000000-0000-0000-0000-000000000001 --role=org_admin       # Org Admin persona
 *
 * (user IDs match backend/src/database/seeds/002_standalone_dev_data.ts —
 * the Hostel-module role — Head Warden/Warden/Student — comes from that
 * seed's user_roles rows, not from the --role flag above, which is only the
 * platform-level org_role claim.)
 *
 * This screen is the live-platform follow-up's placeholder: once a real
 * auth-server exists, replace this with the actual two-token flow
 * (POST /auth/login -> bareToken -> POST /auth/select-module -> scopedToken)
 * — see project README "What's next".
 */
export function Login() {
  const { loginWithToken, loading } = useAuth();
  const [token, setTokenValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      await loginWithToken(token.trim());
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-background lg:flex">
      <div className="ambient-surface" aria-hidden="true" />
      {/* Brand panel — desktop only. A flat accent fill, not a gradient/
          photo hero: this is the one screen a white-label deploy's own
          primary colour should read as unmistakably "theirs" from across
          the room. A slow, subtle drifting radial glow is the one motion
          flourish here — restrained enough to still read as "confident
          colour field", not a marketing-site hero animation. */}
      <div className="relative hidden overflow-hidden bg-accent lg:flex lg:w-[42%] lg:flex-col lg:justify-between lg:p-10">
        <motion.div
          aria-hidden="true"
          className="pointer-events-none absolute -left-24 -top-24 h-112 w-md rounded-full bg-[rgba(255,255,255,0.08)] blur-3xl"
          animate={{ x: [0, 30, 0], y: [0, 20, 0] }}
          transition={{ duration: 16, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-32 -right-16 h-96 w-96 rounded-full bg-[rgba(255,255,255,0.06)] blur-3xl"
          animate={{ x: [0, -20, 0], y: [0, -24, 0] }}
          transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
        />

        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="relative flex items-center gap-2.5 text-accent-fg"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[rgba(255,255,255,0.15)]">
            <BuildingIcon />
          </span>
          <span className="font-display text-sm font-semibold tracking-wide">UOS Hostel Management</span>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="relative text-accent-fg"
        >
          <p className="font-display text-3xl font-bold leading-snug tracking-tight text-balance">
            One system for hostel operations, from application to check-out.
          </p>
          {/* opacity-90, not text-accent-fg/90: our accent colours come from
              a CSS variable (see index.css/applyBranding.ts), and Tailwind's
              color/alpha modifier only works on colours defined via its own
              rgb-triplet helper — on a plain var() it silently generates no
              CSS at all. The `opacity` utility works on any element
              regardless, so it's the correct tool for "this text, but
              softer" against a runtime-supplied colour. */}
          <ul className="mt-6 space-y-3 text-sm text-accent-fg opacity-90">
            <li className="flex items-center gap-2.5">
              <ClipboardIcon className="shrink-0" size={18} />
              Applications, review, and waitlisting
            </li>
            <li className="flex items-center gap-2.5">
              <BedIcon className="shrink-0" size={18} />
              Room and bed allocation with live availability
            </li>
            <li className="flex items-center gap-2.5">
              <BuildingIcon className="shrink-0" size={18} />
              One deployment, configured per campus
            </li>
          </ul>
        </motion.div>

        <p className="relative text-xs text-accent-fg opacity-70">Part of the UOS platform — university operating system</p>
      </div>

      {/* Form panel */}
      <div className="flex min-h-screen flex-1 items-center justify-center px-4 py-12 lg:min-h-0">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
          className="w-full max-w-md space-y-6"
        >
          <div className="text-center lg:text-left">
            <span className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-accent-subtle text-accent lg:hidden">
              <BuildingIcon />
            </span>
            <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">Sign in</h1>
            <p className="mt-1 text-sm text-muted-foreground">Standalone dev mode — paste a token minted via the CLI</p>
          </div>

          {error && <Alert>{error}</Alert>}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleSubmit();
            }}
            className="space-y-4 rounded-xl border border-border bg-card p-5 shadow-panel"
          >
            <FieldWrapper
              label="Token"
              htmlFor="token"
              hint="Run `npm run dev:mint-token` in backend/ and paste the output here"
            >
              <Textarea
                id="token"
                value={token}
                onChange={(e) => setTokenValue(e.target.value)}
                placeholder="eyJhbGciOi..."
                className="min-h-32 font-mono text-xs"
              />
            </FieldWrapper>
            <Button type="submit" fullWidth disabled={submitting || loading || !token.trim()}>
              {submitting || loading ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>

          <p className="text-center text-xs text-slate-400 lg:text-left">
            No live auth-server in this mode — see backend/scripts/dev-mint-token.ts
          </p>
        </motion.div>
      </div>
    </div>
  );
}
