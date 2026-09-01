import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { extractTokenFromFragment, extractReturnPath } from '../features/auth/ssoCallback';

/**
 * Where the platform shell lands a user after they pick Hostel from the module
 * launcher: `/sso-callback#token=<scopedToken>`.
 *
 * Without this route the shell's handoff arrived at an app that only ever read
 * localStorage, found nothing, and showed its own paste-a-token screen — so the
 * launcher looked broken even though both sides were working.
 */
export function SsoCallback() {
  const { loginWithToken } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  // React mounts effects twice in development. Without this the token is
  // consumed and the fragment cleared on the first pass, and the second finds
  // nothing and reports a failure that did not happen.
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    const hash = window.location.hash;
    const token = extractTokenFromFragment(hash);
    const returnTo = extractReturnPath(hash);

    if (!token) {
      setError('This sign-in link did not carry a token.');
      return;
    }

    // Cleared before anything else runs. A scoped token left in the fragment
    // stays in browser history and in the Referer of whatever loads next;
    // replaceState avoids adding a history entry of its own.
    window.history.replaceState(null, '', window.location.pathname);

    loginWithToken(token)
      .then(() => navigate(returnTo ?? '/', { replace: true }))
      .catch(() => setError('That sign-in link could not be used. Ask the platform to send you again.'));
  }, [loginWithToken, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-sm text-center">
        {error ? (
          <>
            <p className="text-base font-medium text-slate-900">Could not sign you in</p>
            <p className="mt-2 text-sm text-slate-600">{error}</p>
            <button
              type="button"
              onClick={() => navigate('/', { replace: true })}
              className="mt-6 text-sm font-medium text-accent underline"
            >
              Continue to Hostel
            </button>
          </>
        ) : (
          <p className="text-sm text-slate-600">Signing you in…</p>
        )}
      </div>
    </div>
  );
}
