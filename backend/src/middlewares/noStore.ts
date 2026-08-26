import type { NextFunction, Request, Response } from 'express';

/**
 * Real bug, found while diagnosing "I logged out, minted a fresh token,
 * signed back in, and the dashboard still showed the previous persona."
 * Neither the frontend's token handling nor the backend's /me lookup was
 * at fault — both are correctly scoped to whatever token is actually sent.
 * The gap was that nothing ever told the browser NOT to cache the response.
 *
 * `Authorization` headers only exempt a request from *shared* caches per
 * RFC 7234 §3.2 (proxies, CDNs) — a browser's own private HTTP cache is
 * still allowed to store and replay a GET response keyed on the URL alone,
 * unless the server explicitly says not to. `GET /me` (and every other GET
 * in this module) had no `Cache-Control` header at all, so a browser that
 * had already cached one persona's `/me` response could silently replay it
 * for a different persona's token without ever hitting this server again —
 * exactly the "still shows the old user after switching tokens" symptom.
 *
 * Applied to every response, not just /me: any GET here is per-user/campus
 * (RLS-scoped), so none of it should ever be cacheable across identities.
 */
export function noStoreResponses(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader('Cache-Control', 'no-store');
  next();
}
