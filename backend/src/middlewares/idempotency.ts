import type { NextFunction, Request, Response } from 'express';
import { db } from '../db';

type Handler = (req: Request, res: Response, next: NextFunction) => Promise<void> | void;

/**
 * Frontline/offline support (12 Sep 2026) — a queued offline action can be
 * retried by the client's own sync manager if a request is interrupted
 * mid-flight (signal drops between the phone sending the request and
 * receiving the response) — without this, a retry could double-apply an
 * action (e.g. resolve the same maintenance ticket twice). Wraps a route
 * handler, not registered as ordinary Express middleware, because it
 * needs to run its own DB write (the idempotency-key record) inside the
 * SAME request-scoped transaction the handler itself used (see db.ts's
 * own comment — `db` only resolves inside the current request's
 * AsyncLocalStorage context).
 *
 * REAL BUG, found live testing this the first time: the idempotency-key
 * insert originally ran AFTER `await handler(...)` returned — which looks
 * right, but @uos/auth's own scopedRequest holds `res.end()` and only
 * resolves/commits the request's transaction at the moment the handler
 * calls it (see that file's own comment: "Commit BEFORE the response
 * reaches the client, not after" — deliberately NOT res.on('finish'),
 * which used to let a client read its own write as missing). So by the
 * time `await handler(...)` had returned here, the transaction had
 * typically ALREADY committed and closed — the insert then failed against
 * a closed transaction ("Transaction query already complete"), which
 * errorHandler.ts correctly generalises to a 500 rather than leaking the
 * raw message, so the *symptom* looked like an unrelated internal error
 * even though the real business action had already genuinely succeeded.
 * Fix: do the insert INSIDE the res.json override, before calling through
 * to the real res.json/res.end — i.e. before scopedRequest's commit point,
 * not after it. Nothing in this codebase's controllers awaits or chains
 * off res.json's own return value, so making it async here is safe.
 *
 * A request with no `Idempotency-Key` header behaves exactly as before —
 * this is opt-in per request, not a route-level requirement. Ordinary
 * browser traffic (this app's own desktop/office screens) never sends
 * this header and is completely unaffected.
 *
 * Deliberately does NOT prevent a genuinely repeated action from a second,
 * DIFFERENT key (e.g. a user manually clicking "Resolve" twice) — that's
 * what each service function's own status-transition guard already
 * handles (a ticket already 'resolved' rejects a second resolveTicket
 * call with a real ConflictError). This only replays the exact same
 * previous response for the exact same key, so a retried request that
 * already actually succeeded doesn't look like a failure to the client
 * and doesn't fail confusingly against a transition guard.
 */
export function withIdempotency(routeName: string, handler: Handler): Handler {
  return async (req, res, next) => {
    const key = req.header('Idempotency-Key');
    if (!key) {
      await handler(req, res, next);
      return;
    }
    try {
      const orgId = req.user.org_id;
      const existing = await db('idempotency_keys').where({ org_id: orgId, idempotency_key: key, route: routeName }).first();
      if (existing) {
        res.status(existing.response_status).json(existing.response_body);
        return;
      }

      const originalJson = res.json.bind(res);
      res.json = (async (body: unknown) => {
        // Only a genuine success gets remembered — a failed attempt
        // (4xx/5xx) should be free to actually retry against the real
        // handler again, not get stuck replaying its own error forever.
        // Deliberately swallows its own failure (logged, not thrown): the
        // real business action already succeeded by this point, and
        // nothing here awaits res.json's own return value (see this
        // file's own comment above) — an uncaught rejection here would
        // become an unhandled promise rejection instead of ever reaching
        // a client who's already getting their real, correct response.
        // Worst case on a failed insert: a future retry of this exact key
        // re-executes the handler instead of replaying — safe, since
        // every wrapped action already has its own status-transition
        // guard (or, for markDrillEntry, is safe to reapply by design).
        if (res.statusCode < 400) {
          try {
            await db('idempotency_keys').insert({
              org_id: orgId,
              idempotency_key: key,
              route: routeName,
              response_status: res.statusCode,
              response_body: JSON.stringify(body),
            });
          } catch (insertErr) {
            // eslint-disable-next-line no-console
            console.error(`[idempotency] failed to record key for ${routeName}:`, insertErr);
          }
        }
        return originalJson(body);
      }) as unknown as typeof res.json;

      await handler(req, res, next);
    } catch (err) {
      next(err);
    }
  };
}
