import { getTrx } from '@uos/auth';
import type { Knex } from 'knex';

/**
 * Not part of the template — this module's own addition, per
 * uos-module-developer-bundle/FOR_YOUR_CLAUDE_CODE.md §4 step 5:
 *
 * "if you have an existing large business-logic layer that calls a
 * module-level db(...) export everywhere: rather than threading a
 * connection parameter through every function, make db a Proxy that
 * delegates every call to getTrx() at the moment it's used."
 *
 * This module's repository/service layer (app/*\/repository.ts) was built
 * against exactly that shape — a shared `db` export called as `db('table')`.
 * This Proxy lets that code keep working unchanged: every call resolves the
 * *current request's* RLS-scoped transaction from AsyncLocalStorage at the
 * moment it's used, instead of holding one static connection.
 *
 * Only usable inside a request handled by scopedRequest() — calling this
 * outside that context throws (via getTrx() itself), same as calling
 * getTrx() directly would.
 */
export const db: Knex = new Proxy(function db() {} as unknown as Knex, {
  apply(_target, _thisArg, args: unknown[]) {
    const trx = getTrx() as unknown as (...a: unknown[]) => unknown;
    return trx(...args);
  },
  get(_target, prop: string | symbol) {
    const trx = getTrx() as unknown as Record<string | symbol, unknown>;
    const value = trx[prop];
    return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(trx) : value;
  },
});
