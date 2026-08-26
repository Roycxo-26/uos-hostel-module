import { getPermissions, hasOrgRole, hasPermission, isSuperAdmin, type AuthUser } from '@uos/auth';
import type { z } from 'zod';
import { MODULE } from '../../constants';
import { db } from '../../db';
import { ConflictError, ForbiddenError, NotFoundError } from '../../middlewares/errorHandler';
import { redis } from '../../redis';
import { recordAudit } from '../../utils/audit';
import * as dutyRepo from '../responsibilities/repository';
import * as repo from './repository';
import type { publishNoticeSchema } from './validators';

async function canManage(user: AuthUser): Promise<boolean> {
  if (isSuperAdmin(user) || hasOrgRole(user, ['org_admin'])) return true;
  const perms = await getPermissions({ user, module: MODULE, redis });
  return hasPermission(perms, 'operational_notice:manage');
}

/**
 * D17.22 item 86 — delivery and acknowledgement are genuinely distinct:
 * publishing creates one acknowledgement row per resident IMMEDIATELY
 * ("delivered"), but `acknowledged_at` only ever gets set by the
 * resident's own explicit action (acknowledgeNotice below). A critical
 * notice's target set is frozen at this exact moment too — LAW-33's own
 * "target set is frozen/versioned at publish time" requirement,
 * satisfied by the fact these rows are never regenerated later.
 */
export async function publishNotice(user: AuthUser, input: z.infer<typeof publishNoticeSchema>) {
  if (!(await canManage(user))) throw new ForbiddenError('Only staff can publish an operational notice');

  const scopeTable = { room: 'rooms', floor: 'floors', hostel: 'hostels' }[input.scopeType];
  const scope = await db(scopeTable).where({ id: input.scopeId }).first('campus_id');
  if (!scope) throw new NotFoundError('Scope');

  const notice = await repo.createNotice({
    org_id: user.org_id,
    campus_id: scope.campus_id,
    scope_type: input.scopeType,
    scope_id: input.scopeId,
    title: input.title,
    body: input.body ?? null,
    severity: input.severity,
    requires_acknowledgement: input.requiresAcknowledgement,
    published_by: user.sub,
  });

  // "Urgent updates supersede but do not erase previous notices" — the
  // OLD notice gets pointed at the new one; nothing about the old row is
  // deleted or rewritten.
  if (input.supersedesNoticeId) {
    const old = await repo.findNoticeById(input.supersedesNoticeId);
    if (old) await repo.updateNotice(old.id, { superseded_by: notice.id });
  }

  const occupants = await repo.listOccupantsInScope(input.scopeType, input.scopeId);
  for (const occupant of occupants) {
    await repo.createAcknowledgement({
      org_id: user.org_id,
      campus_id: scope.campus_id,
      notice_id: notice.id,
      student_id: occupant.student_id,
    });
  }

  await recordAudit({
    orgId: user.org_id,
    campusId: scope.campus_id,
    actorUserId: user.sub,
    action: 'operational_notice.published',
    entityType: 'operational_notice',
    entityId: notice.id,
    after: { ...notice, recipientCount: occupants.length },
  });

  return { ...notice, recipientCount: occupants.length };
}

export async function acknowledgeNotice(user: AuthUser, noticeId: string) {
  const ack = await repo.findAcknowledgement(noticeId, user.sub);
  if (!ack) throw new NotFoundError('This notice was not addressed to you');
  if (ack.acknowledged_at) throw new ConflictError('Already acknowledged');

  const after = await repo.updateAcknowledgement(ack.id, { acknowledged_at: db.fn.now() });
  await recordAudit({
    orgId: user.org_id,
    campusId: ack.campus_id,
    actorUserId: user.sub,
    action: 'operational_notice.acknowledged',
    entityType: 'operational_notice_acknowledgement',
    entityId: ack.id,
    before: ack,
    after,
  });
  return after;
}

export async function listNotices(filters: { scopeType?: string; scopeId?: string }) {
  return repo.listNotices(filters);
}

export async function getNotice(user: AuthUser, id: string) {
  const notice = await repo.findNoticeById(id);
  if (!notice) throw new NotFoundError('Operational notice');
  if (!(await canManage(user))) return notice;
  const acknowledgements = await repo.listAcknowledgementsForNotice(id);
  const unacknowledged = acknowledgements.filter((a) => !a.acknowledged_at);
  return { ...notice, acknowledgements, unacknowledgedCount: unacknowledged.length };
}

export async function listMyNotices(user: AuthUser) {
  return repo.listAcknowledgementsForStudent(user.sub);
}

// ============================================================================
// D17.22 item 86 — resident emergency card. Purpose-restricted (staff-
// only) minimum-necessary information: identity, current room/bed,
// current outpass/leave status, and who's on duty for their scope right
// now. No welfare/medical field exists in this schema for this to leak,
// on purpose — see repository.ts's own comment.
// ============================================================================

export async function getResidentEmergencyCard(user: AuthUser, studentId: string) {
  if (!(await canManage(user))) throw new ForbiddenError('Only staff can view a resident emergency card');

  const occupancy = await repo.findCurrentOccupancy(studentId);
  const movement = await repo.findCurrentMovement(studentId);

  let dutyWarden = null;
  if (occupancy) {
    const holder = await dutyRepo.findActiveHolder('duty_warden', 'hostel', occupancy.hostel_id);
    dutyWarden = holder?.assignee_user_id ?? null;
  }

  return {
    studentId,
    occupancy: occupancy ?? null,
    currentMovementStatus: movement ? movement.status : 'on_premises',
    dutyWardenUserId: dutyWarden,
    dataAsOf: new Date().toISOString(),
  };
}
