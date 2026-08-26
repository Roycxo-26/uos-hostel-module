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
    <div className="min-h-screen bg-slate-50 lg:flex">
      {/* Brand panel — desktop only. Deliberately a flat accent fill, not a
          gradient/photo hero: this is the one screen a white-label deploy's
          own primary colour should read as unmistakably "theirs" from across
          the room, and a flat, confident colour field does that more than a
          stock-photo campus hero would. */}
      <div className="relative hidden overflow-hidden bg-accent lg:flex lg:w-[42%] lg:flex-col lg:justify-between lg:p-10">
        <div className="flex items-center gap-2.5 text-accent-fg">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/15">
            <BuildingIcon />
          </span>
          <span className="text-sm font-semibold tracking-wide">UOS Hostel Management</span>
        </div>

        <div className="text-accent-fg">
          <p className="text-2xl font-semibold leading-snug">
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
              <ClipboardIcon className="shrink-0" />
              Applications, review, and waitlisting
            </li>
            <li className="flex items-center gap-2.5">
              <BedIcon className="shrink-0" />
              Room and bed allocation with live availability
            </li>
            <li className="flex items-center gap-2.5">
              <BuildingIcon className="shrink-0" />
              One deployment, configured per campus
            </li>
          </ul>
        </div>

        <p className="text-xs text-accent-fg opacity-70">Part of the UOS platform — university operating system</p>
      </div>

      {/* Form panel */}
      <div className="flex min-h-screen flex-1 items-center justify-center px-4 py-12 lg:min-h-0">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center lg:text-left">
            <span className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-accent-subtle text-accent lg:hidden">
              <BuildingIcon />
            </span>
            <h1 className="text-xl font-semibold text-slate-900">Sign in</h1>
            <p className="mt-1 text-sm text-slate-500">Standalone dev mode — paste a token minted via the CLI</p>
          </div>

          {error && <Alert>{error}</Alert>}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleSubmit();
            }}
            className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-panel"
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
                className="min-h-[8rem] font-mono text-xs"
              />
            </FieldWrapper>
            <Button type="submit" fullWidth disabled={submitting || loading || !token.trim()}>
              {submitting || loading ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>

          <p className="text-center text-xs text-slate-400 lg:text-left">
            No live auth-server in this mode — see backend/scripts/dev-mint-token.ts
          </p>
        </div>
      </div>
    </div>
  );
}
