import { db } from '../db';

interface AuditEntry {
  orgId: string;
  campusId?: string | null;
  actorUserId?: string;
  action: string;
  entityType: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
  reason?: string;
}

/**
 * flow.md §13: "create/change/approve/reject/return/override/export/
 * sensitive-view ... actions logged." `db` here resolves to the current
 * request's RLS-scoped transaction (src/db.ts) — the same one every other
 * write in the request goes through — so this insert is atomic with
 * whatever business change it's recording without needing an explicit
 * nested transaction (scopedRequest already wraps the whole request in one).
 */
export async function recordAudit(entry: AuditEntry): Promise<void> {
  await db('audit_log').insert({
    org_id: entry.orgId,
    campus_id: entry.campusId ?? null,
    actor_user_id: entry.actorUserId ?? null,
    action: entry.action,
    entity_type: entry.entityType,
    entity_id: entry.entityId ?? null,
    before_state: entry.before ? JSON.stringify(entry.before) : null,
    after_state: entry.after ? JSON.stringify(entry.after) : null,
    reason: entry.reason ?? null,
  });
}
