/**
 * Reads the scoped token the platform shell hands over.
 *
 * The shell — not this app — logs the person in. It calls /auth/login and then
 * /auth/select-module itself, both of which need credentials or a bare token
 * this app deliberately never holds, and then redirects here:
 *
 *   http://localhost:5180/sso-callback#token=<scopedToken>[&returnTo=/some/path]
 *
 * A **fragment**, not a query string, and that is the whole point: fragments are
 * never sent to a server, so the token stays out of access logs and out of the
 * Referer header of whatever loads next. This reads `hash` and nothing else — a
 * fallback to `?token=` would silently give back the leak the fragment prevents.
 */
export function extractTokenFromFragment(hash: string): string | null {
  // Refuses a query string outright. URLSearchParams strips a leading '?' as
  // happily as a '#', so passing location.search here would parse cleanly and
  // lose the property above without anything appearing to go wrong.
  if (hash.startsWith('?')) return null;

  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!raw) return null;

  const token = new URLSearchParams(raw).get('token')?.trim();
  if (!token) return null;

  // A JWT is three dot-separated segments. Checked only so a malformed link
  // fails here with a clear message instead of reaching the API and coming back
  // as a generic 401.
  return token.split('.').length === 3 ? token : null;
}

/**
 * Optional destination to resume at, from the same fragment.
 *
 * Only root-relative paths are honoured. Anything absolute or protocol-relative
 * would let a crafted link bounce a freshly authenticated user off-origin, so it
 * is discarded rather than cleaned up — a path cannot express another origin at
 * all, which makes the guarantee structural rather than a comparison that can be
 * got wrong.
 */
export function extractReturnPath(hash: string): string | null {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!raw) return null;

  const next = new URLSearchParams(raw).get('returnTo');
  if (!next) return null;

  // '//evil.com' is protocol-relative and navigates off-origin, so a second
  // leading slash disqualifies it too. Backslashes are rejected because some
  // browsers normalise them to forward slashes.
  if (!next.startsWith('/') || next.startsWith('//') || next.includes('\\')) return null;

  return next;
}
