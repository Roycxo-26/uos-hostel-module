import type { AuthUser } from '@uos/auth';
import { recordAudit } from '../../utils/audit';
import * as repo from './repository';

/**
 * BR §16 controls: "Exports may require stronger permission than view;
 * every sensitive export logged." Route-level permission gate handles the
 * first half (see route.ts); this call is the second half — viewing the
 * audit log is itself an auditable action, recorded here rather than
 * silently trusting the route gate alone.
 *
 * Deliberately NOT resolveCampusId(user) — that throws for an org-wide
 * (campus_scope=ALL) caller with no campusId supplied, which describes
 * exactly the platform-admin case this endpoint mainly serves. "Viewing
 * the audit log" isn't scoped to one campus the way a write is;
 * audit_log.campus_id is nullable for exactly this kind of org-wide
 * action, so this records campusId: null rather than forcing one.
 */
export async function listAuditLog(user: AuthUser, filters: { entityType?: string; action?: string; limit?: number }) {
  const rows = await repo.list(filters);

  await recordAudit({
    orgId: user.org_id,
    campusId: null,
    actorUserId: user.sub,
    action: 'audit.viewed',
    entityType: 'audit_log',
    reason: filters.entityType || filters.action ? `filters: ${JSON.stringify(filters)}` : undefined,
  });

  return rows;
}
