import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { getMe } from '../api/me';
import { clearToken, getToken, setToken } from '../api/client';
import type { AuthUser, Me } from '../types';

interface AuthContextValue {
  user: AuthUser | null;
  me: Me | null;
  loading: boolean;
  /** Standalone dev mode has no HTTP login — tokens come from
   * `npm run dev:mint-token` (backend/scripts/dev-mint-token.ts). This
   * stores a pasted token and loads /me. The real two-token HTTP flow
   * (POST /auth/login -> bareToken -> POST /auth/select-module ->
   * scopedToken, against a live auth-server) is the live-platform
   * follow-up — see project README "What's next"; nothing here assumes
   * that flow exists yet. */
  loginWithToken: (token: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/** Decodes the JWT payload client-side for the fields needed before /me
 * resolves (sub/org_id/campus_id/etc.) — this does NOT verify the
 * signature; the backend is what actually trusts or rejects the token on
 * every request. Purely so the UI has something to render immediately
 * instead of a blank screen while /me loads. */
function decodeTokenPayload(token: string): AuthUser | null {
  try {
    const [, payload] = token.split('.'); // JWT: header.payload.signature
    if (!payload) return null;
    const claims = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as Record<string, unknown>;
    return {
      sub: String(claims.sub),
      orgId: String(claims.org_id),
      campusId: String(claims.campus_id ?? ''),
      campusScope: claims.campus_scope as AuthUser['campusScope'],
      allowedCampuses: claims.allowed_campuses as string[] | undefined,
      orgRole: String(claims.org_role),
      isSuperAdmin: Boolean(claims.is_super_admin),
      moduleId: String(claims.module_id),
      tokenType: claims.token_type as AuthUser['tokenType'],
    };
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => {
    const token = getToken();
    return token ? decodeTokenPayload(token) : null;
  });
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) {
      setMe(null);
      return;
    }
    setLoading(true);
    getMe()
      .then(setMe)
      .catch(() => {
        // Token decoded but the backend rejected it (expired, wrong
        // module, revoked) — drop back to the login screen rather than
        // leaving a half-authenticated UI up.
        clearToken();
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, [user]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      me,
      loading,
      loginWithToken: async (token: string) => {
        const decoded = decodeTokenPayload(token);
        if (!decoded) throw new Error('Could not decode this token — make sure you pasted the full value.');
        setToken(token);
        setUser(decoded);
      },
      logout: () => {
        clearToken();
        setUser(null);
        setMe(null);
      },
    }),
    [user, me, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
