import { db } from '../../db';

// No org_id filter here on purpose — RLS (see database/migrations
// 20260101000007) restricts this to the current request's org
// automatically. Service code has no WHERE org_id = ... anywhere, per the
// template's RLS convention.
export function findRow() {
  return db('tenant_settings').first();
}
