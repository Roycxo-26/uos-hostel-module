import { hasOrgRole, hasPermission, getPermissions, isSuperAdmin, type AuthUser } from '@uos/auth';
import type { z } from 'zod';
import { MODULE } from '../../constants';
import { db } from '../../db';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../middlewares/errorHandler';
import { redis } from '../../redis';
import { recordAudit } from '../../utils/audit';
import { resolveCampusId } from '../../utils/campusScope';
import { notify, notifyCampusStaff } from '../../utils/notify';
import * as responsibilitiesRepo from '../responsibilities/repository';
import * as roomAccessRepo from '../roomAccess/repository';
import * as safetyRepo from '../safety/repository';
import { getSettings } from '../settings/service';
import * as repo from './repository';
import { computeRoomReadiness, HOUSEKEEPING_CHECKLIST_KEYS_BY_TYPE, type HousekeepingTaskType, type RoomReadinessGates } from './types';
import type {
  addResidentCommentSchema,
  appealCleanlinessInspectionSchema,
  assignTicketSchema,
  cancelTicketSchema,
  completeHousekeepingTaskSchema,
  confirmTicketResolutionSchema,
  createReworkTaskSchema,
  decideCleanlinessAppealSchema,
  linkDuplicateTicketSchema,
  markHousekeepingMissedSchema,
  recordCleanlinessInspectionSchema,
  reportTicketSchema,
  reopenTicketSchema,
  resolveTicketSchema,
  scheduleHousekeepingTaskSchema,
  updateHousekeepingChecklistSchema,
  verifyTicketSchema,
} from './validators';

async function canManageMaintenance(user: AuthUser): Promise<boolean> {
  if (isSuperAdmin(user) || hasOrgRole(user, ['org_admin'])) return true;
  const perms = await getPermissions({ user, module: MODULE, redis });
  return hasPermission(perms, 'maintenance:manage');
}

async function findRoomForCampus(roomId: string): Promise<{ campus_id: string; floor_id: string }> {
  const row = await db('rooms').where({ id: roomId }).first('campus_id', 'floor_id');
  if (!row) throw new NotFoundError('Room');
  return row;
}

async function findResidentActiveRoomId(studentId: string): Promise<string | null> {
  const row = await db('allocations')
    .join('beds', 'beds.id', 'allocations.bed_id')
    .where({ 'allocations.student_id': studentId, 'allocations.status': 'checked_in_active' })
    .first('beds.room_id');
  return row?.room_id ?? null;
}

// ============================================================================
// D17.08 item 116 — maintenance tickets, LOCAL_FALLBACK (§16.8) since no
// D22/D13 exists. See migration's own header comment.
// ============================================================================

/**
 * §16.1: "Resident reports Hostel issue." Self-service, same pattern as
 * checkouts/movements/transfers. Staff may report on behalf of any room or
 * a location note; a resident always reports against their own active
 * room unless staff.
 */
export async function reportTicket(user: AuthUser, input: z.infer<typeof reportTicketSchema>) {
  const isStaff = await canManageMaintenance(user);
  let roomId = input.roomId ?? null;
  if (!isStaff) {
    roomId = await findResidentActiveRoomId(user.sub);
    if (!roomId && !input.locationNote) throw new ValidationError('No active room found — provide a locationNote instead');
  }

  const campusId = roomId ? (await findRoomForCampus(roomId)).campus_id : resolveCampusId(user);

  // §16.4: "Emergency bypass is mandatory for safety-critical categories."
  // Category-driven, not a caller-supplied flag — a resident can't opt
  // into (or out of) the emergency path themselves.
  const isEmergency = input.category === 'safety_emergency';
  const verificationRequired = !isEmergency;

  const row = await repo.createTicket({
    org_id: user.org_id,
    campus_id: campusId,
    room_id: roomId,
    location_note: input.locationNote ?? null,
    raised_by: user.sub,
    category: input.category,
    description: input.description,
    priority: isEmergency ? 'critical' : input.priority,
    is_emergency: isEmergency,
    evidence_photo_url: input.evidencePhotoUrl ?? null,
    status: isEmergency ? 'emergency_routed' : 'pending_verification',
    verification_required: verificationRequired,
  });

  await recordAudit({ orgId: user.org_id, campusId, actorUserId: user.sub, action: 'maintenance_ticket.reported', entityType: 'maintenance_ticket', entityId: row.id, after: row });

  if (isEmergency) {
    // §16.3: "Notify Warden, Security/Facilities and start emergency SLA."
    // No separate Security channel exists in this codebase — campus staff
    // (Warden/Head Warden) is the real, existing audience.
    await notifyCampusStaff(db, user.org_id, campusId, {
      type: 'maintenance_ticket.emergency_routed',
      title: `EMERGENCY: ${input.category.replace(/_/g, ' ')} ticket — immediate attention required`,
      body: input.description,
      link: '/maintenance',
    });
  } else {
    await notifyCampusStaff(db, user.org_id, campusId, {
      type: 'maintenance_ticket.reported',
      title: `New ${input.category.replace(/_/g, ' ')} ticket awaiting Floor Warden verification`,
      link: '/maintenance',
    });
  }

  return row;
}

export async function listTickets(user: AuthUser, filters: { status?: string; roomId?: string; raisedBy?: string }) {
  const isStaff = await canManageMaintenance(user);
  return repo.listTickets({ ...filters, raisedBy: isStaff ? filters.raisedBy : user.sub });
}

export async function getTicket(user: AuthUser, id: string) {
  const row = await repo.findTicketById(id);
  if (!row) throw new NotFoundError('Maintenance ticket');
  if (row.raised_by !== user.sub && !(await canManageMaintenance(user))) {
    throw new ForbiddenError('You can only view your own tickets');
  }
  return row;
}

/**
 * item 116 — "hooking into the existing Responsibility Assignment
 * system." Mirrors responsibilities/service.ts's own resolveDutyAuthority
 * ladder (primary Floor In-charge -> any active Head Warden -> unresolved)
 * as a local function rather than importing that one: it's a service.ts
 * function in another module, off-limits per this codebase's own
 * module-boundary rule. Repo-to-repo only, same as everywhere else.
 */
async function canVerifyForRoom(user: AuthUser, floorId: string): Promise<boolean> {
  if (isSuperAdmin(user) || hasOrgRole(user, ['org_admin'])) return true;
  if (await canManageMaintenance(user)) return true; // "responsibility-bundle fallback" — any Warden/Head Warden
  const holder = await responsibilitiesRepo.findActiveHolder('floor_incharge', 'floor', floorId);
  return holder?.assignee_user_id === user.sub || holder?.substitute_user_id === user.sub;
}

export async function verifyTicket(user: AuthUser, id: string, input: z.infer<typeof verifyTicketSchema>) {
  const before = await repo.findTicketById(id);
  if (!before) throw new NotFoundError('Maintenance ticket');
  if (before.status !== 'pending_verification') throw new ConflictError(`Cannot verify a ticket in status '${before.status}'`);

  if (before.room_id) {
    const room = await findRoomForCampus(before.room_id);
    if (!(await canVerifyForRoom(user, room.floor_id))) {
      throw new ForbiddenError("Only this room's Floor In-charge, or a Warden/Head Warden, can verify this ticket");
    }
  } else if (!(await canManageMaintenance(user))) {
    throw new ForbiddenError('Only staff can verify a ticket with no room');
  }

  const statusByDecision = { approved: 'verified', returned: 'returned_for_information', rejected: 'rejected' } as const;
  const after = await repo.updateTicket(id, {
    status: statusByDecision[input.decision],
    verifier_user_id: user.sub,
    verified_at: db.fn.now(),
    verification_decision: input.decision,
    verification_reason: input.reason,
  });

  await recordAudit({
    orgId: user.org_id,
    campusId: before.campus_id,
    actorUserId: user.sub,
    action: `maintenance_ticket.${input.decision}`,
    entityType: 'maintenance_ticket',
    entityId: id,
    before,
    after,
    reason: input.reason,
  });
  await notify({
    orgId: user.org_id,
    campusId: before.campus_id,
    userId: before.raised_by,
    type: 'maintenance_ticket.verified',
    title:
      input.decision === 'approved'
        ? 'Your maintenance ticket was verified and routed for work'
        : input.decision === 'returned'
          ? 'Your maintenance ticket needs more information'
          : 'Your maintenance ticket was rejected',
    body: input.reason,
    link: '/maintenance',
  });

  return after;
}

const ASSIGNABLE_FROM = new Set(['verified', 'emergency_routed', 'assigned']);

export async function assignTicket(user: AuthUser, id: string, input: z.infer<typeof assignTicketSchema>) {
  if (!(await canManageMaintenance(user))) throw new ForbiddenError('Only staff can assign a ticket');
  const before = await repo.findTicketById(id);
  if (!before) throw new NotFoundError('Maintenance ticket');
  if (!ASSIGNABLE_FROM.has(before.status)) throw new ConflictError(`Cannot assign a ticket in status '${before.status}'`);

  const after = await repo.updateTicket(id, {
    status: 'assigned',
    assigned_to_user_id: input.assignedToUserId ?? null,
    assigned_to_provider: input.assignedToProvider ?? null,
    manual_external_reference: input.manualExternalReference ?? null,
    due_date: input.dueDate ?? null,
  });
  await recordAudit({ orgId: user.org_id, campusId: before.campus_id, actorUserId: user.sub, action: 'maintenance_ticket.assigned', entityType: 'maintenance_ticket', entityId: id, before, after });
  return after;
}

export async function startTicketWork(user: AuthUser, id: string) {
  if (!(await canManageMaintenance(user))) throw new ForbiddenError('Only staff can start work on a ticket');
  const before = await repo.findTicketById(id);
  if (!before) throw new NotFoundError('Maintenance ticket');
  if (before.status !== 'assigned') throw new ConflictError(`Cannot start work on a ticket in status '${before.status}'`);

  const after = await repo.updateTicket(id, { status: 'in_progress' });
  await recordAudit({ orgId: user.org_id, campusId: before.campus_id, actorUserId: user.sub, action: 'maintenance_ticket.work_started', entityType: 'maintenance_ticket', entityId: id, before, after });
  return after;
}

export async function resolveTicket(user: AuthUser, id: string, input: z.infer<typeof resolveTicketSchema>) {
  if (!(await canManageMaintenance(user))) throw new ForbiddenError('Only staff can resolve a ticket');
  const before = await repo.findTicketById(id);
  if (!before) throw new NotFoundError('Maintenance ticket');
  if (!['assigned', 'in_progress'].includes(before.status)) throw new ConflictError(`Cannot resolve a ticket in status '${before.status}'`);

  const after = await repo.updateTicket(id, {
    status: 'resolved',
    resolution_notes: input.resolutionNotes,
    resolution_evidence_url: input.resolutionEvidenceUrl ?? null,
    resolved_at: db.fn.now(),
    resolved_by: user.sub,
  });
  await recordAudit({ orgId: user.org_id, campusId: before.campus_id, actorUserId: user.sub, action: 'maintenance_ticket.resolved', entityType: 'maintenance_ticket', entityId: id, before, after });
  await notify({
    orgId: user.org_id,
    campusId: before.campus_id,
    userId: before.raised_by,
    type: 'maintenance_ticket.resolved',
    title: 'Your maintenance ticket has been resolved — please confirm',
    body: input.resolutionNotes,
    link: '/maintenance',
  });
  return after;
}

/** §16.3 "Resident/Warden confirmation" -> close. The resident who raised
 * it, or staff on their behalf if the resident is unreachable. */
export async function confirmTicketResolution(user: AuthUser, id: string, _input: z.infer<typeof confirmTicketResolutionSchema>) {
  const before = await repo.findTicketById(id);
  if (!before) throw new NotFoundError('Maintenance ticket');
  if (before.status !== 'resolved') throw new ConflictError(`Cannot confirm a ticket in status '${before.status}'`);
  if (before.raised_by !== user.sub && !(await canManageMaintenance(user))) {
    throw new ForbiddenError('Only the resident who raised this, or staff, can confirm resolution');
  }

  const after = await repo.updateTicket(id, { status: 'closed', resident_confirmed_at: user.sub === before.raised_by ? db.fn.now() : before.resident_confirmed_at });
  await recordAudit({ orgId: user.org_id, campusId: before.campus_id, actorUserId: user.sub, action: 'maintenance_ticket.closed', entityType: 'maintenance_ticket', entityId: id, before, after });
  return after;
}

export async function reopenTicket(user: AuthUser, id: string, input: z.infer<typeof reopenTicketSchema>) {
  const before = await repo.findTicketById(id);
  if (!before) throw new NotFoundError('Maintenance ticket');
  if (!['closed', 'rejected'].includes(before.status)) throw new ConflictError(`Cannot reopen a ticket in status '${before.status}'`);
  if (before.raised_by !== user.sub && !(await canManageMaintenance(user))) {
    throw new ForbiddenError('Only the resident who raised this, or staff, can reopen it');
  }

  const after = await repo.updateTicket(id, { status: 'reopened', reopen_reason: input.reason });
  await recordAudit({ orgId: user.org_id, campusId: before.campus_id, actorUserId: user.sub, action: 'maintenance_ticket.reopened', entityType: 'maintenance_ticket', entityId: id, before, after, reason: input.reason });
  await notifyCampusStaff(db, user.org_id, before.campus_id, { type: 'maintenance_ticket.reopened', title: 'A maintenance ticket was reopened', body: input.reason, link: '/maintenance' });
  return after;
}

const CANCELLABLE_FROM = new Set(['reported', 'pending_verification', 'returned_for_information', 'verified', 'assigned']);

export async function cancelTicket(user: AuthUser, id: string, input: z.infer<typeof cancelTicketSchema>) {
  const before = await repo.findTicketById(id);
  if (!before) throw new NotFoundError('Maintenance ticket');
  if (!CANCELLABLE_FROM.has(before.status)) throw new ConflictError(`Cannot cancel a ticket in status '${before.status}'`);
  if (before.raised_by !== user.sub && !(await canManageMaintenance(user))) {
    throw new ForbiddenError('Only the resident who raised this, or staff, can cancel it');
  }

  const after = await repo.updateTicket(id, { status: 'cancelled', cancelled_reason: input.reason });
  await recordAudit({ orgId: user.org_id, campusId: before.campus_id, actorUserId: user.sub, action: 'maintenance_ticket.cancelled', entityType: 'maintenance_ticket', entityId: id, before, after, reason: input.reason });
  return after;
}

/** §16.4: "Duplicate detection may suggest merge/link but cannot silently
 * discard a report." Manual only — no fuzzy-match detection in this
 * build, named as a real scope boundary rather than a half-built
 * heuristic. Both tickets survive; this is a pointer, not a merge. */
export async function linkDuplicateTicket(user: AuthUser, id: string, input: z.infer<typeof linkDuplicateTicketSchema>) {
  if (!(await canManageMaintenance(user))) throw new ForbiddenError('Only staff can link a duplicate ticket');
  const before = await repo.findTicketById(id);
  if (!before) throw new NotFoundError('Maintenance ticket');
  if (id === input.duplicateOfTicketId) throw new ValidationError('A ticket cannot be a duplicate of itself');
  const original = await repo.findTicketById(input.duplicateOfTicketId);
  if (!original) throw new NotFoundError('Original ticket');

  const after = await repo.updateTicket(id, { duplicate_of_ticket_id: input.duplicateOfTicketId });
  await recordAudit({ orgId: user.org_id, campusId: before.campus_id, actorUserId: user.sub, action: 'maintenance_ticket.linked_duplicate', entityType: 'maintenance_ticket', entityId: id, before, after });
  return after;
}

// ============================================================================
// D17.08 item 117 — housekeeping tasks.
// ============================================================================

function emptyChecklist(taskType: HousekeepingTaskType): Record<string, { completed: boolean }> {
  return Object.fromEntries(HOUSEKEEPING_CHECKLIST_KEYS_BY_TYPE[taskType].map((k) => [k, { completed: false }]));
}

async function resolveScopeCampus(scopeType: 'room' | 'floor' | 'hostel', scopeId: string): Promise<{ campus_id: string }> {
  const table = scopeType === 'room' ? 'rooms' : scopeType === 'floor' ? 'floors' : 'hostels';
  const row = await db(table).where({ id: scopeId }).first('campus_id');
  if (!row) throw new NotFoundError(scopeType === 'room' ? 'Room' : scopeType === 'floor' ? 'Floor' : 'Hostel');
  return row;
}

export async function scheduleHousekeepingTask(user: AuthUser, input: z.infer<typeof scheduleHousekeepingTaskSchema>) {
  if (!(await canManageMaintenance(user))) throw new ForbiddenError('Only staff can schedule a housekeeping task');
  const scope = await resolveScopeCampus(input.scopeType, input.scopeId);

  let roomEntryId: string | null = null;
  if (input.requestRoomAccess && input.scopeType === 'room') {
    // §16.5 "room-access permission" — Batch 18's own purpose value,
    // unused until now. Repo-to-repo, not a service-to-service call.
    const entry = await roomAccessRepo.createEntry({
      org_id: user.org_id,
      campus_id: scope.campus_id,
      room_id: input.scopeId,
      purpose: 'scheduled_housekeeping',
      status: 'requested',
      requested_by: user.sub,
      notice_given: false,
    });
    roomEntryId = entry.id;
  }

  const row = await repo.createHousekeepingTask({
    org_id: user.org_id,
    campus_id: scope.campus_id,
    scope_type: input.scopeType,
    scope_id: input.scopeId,
    task_type: input.taskType,
    scheduled_date: input.scheduledDate,
    assigned_to_user_id: input.assignedToUserId ?? null,
    preferred_time: input.preferredTime ?? null,
    room_entry_id: roomEntryId,
    checklist: JSON.stringify(emptyChecklist(input.taskType)),
  });

  await recordAudit({ orgId: user.org_id, campusId: scope.campus_id, actorUserId: user.sub, action: 'housekeeping_task.scheduled', entityType: 'housekeeping_task', entityId: row.id, after: row });
  if (input.assignedToUserId) {
    await notify({
      orgId: user.org_id,
      campusId: scope.campus_id,
      userId: input.assignedToUserId,
      type: 'housekeeping_task.assigned',
      title: `You've been assigned a ${input.taskType.replace(/_/g, ' ')} housekeeping task for ${input.scheduledDate}`,
      link: '/maintenance',
    });
  }
  return row;
}

export async function listHousekeepingTasks(filters: { status?: string; scopeType?: string; scopeId?: string }) {
  return repo.listHousekeepingTasks(filters);
}

export async function getHousekeepingTask(id: string) {
  const row = await repo.findHousekeepingTaskById(id);
  if (!row) throw new NotFoundError('Housekeeping task');
  return row;
}

export async function updateHousekeepingChecklist(user: AuthUser, id: string, input: z.infer<typeof updateHousekeepingChecklistSchema>) {
  if (!(await canManageMaintenance(user))) throw new ForbiddenError('Only staff can update the housekeeping checklist');
  const before = await repo.findHousekeepingTaskById(id);
  if (!before) throw new NotFoundError('Housekeeping task');
  const validKeys = HOUSEKEEPING_CHECKLIST_KEYS_BY_TYPE[before.task_type as HousekeepingTaskType] ?? [];
  if (!validKeys.includes(input.key)) throw new ValidationError(`'${input.key}' is not a valid checklist item for task type '${before.task_type}'`);

  const checklist = { ...(before.checklist ?? {}) };
  checklist[input.key] = { completed: input.completed, completedBy: input.completed ? user.sub : undefined, completedAt: input.completed ? new Date().toISOString() : undefined, notes: input.notes };

  const after = await repo.updateHousekeepingTask(id, { checklist: JSON.stringify(checklist), status: before.status === 'scheduled' ? 'in_progress' : before.status });
  await recordAudit({ orgId: user.org_id, campusId: before.campus_id, actorUserId: user.sub, action: 'housekeeping_task.checklist_updated', entityType: 'housekeeping_task', entityId: id, before, after });
  return after;
}

export async function completeHousekeepingTask(user: AuthUser, id: string, input: z.infer<typeof completeHousekeepingTaskSchema>) {
  if (!(await canManageMaintenance(user))) throw new ForbiddenError('Only staff can complete a housekeeping task');
  const before = await repo.findHousekeepingTaskById(id);
  if (!before) throw new NotFoundError('Housekeeping task');
  if (!['scheduled', 'in_progress'].includes(before.status)) throw new ConflictError(`Cannot complete a task in status '${before.status}'`);

  const after = await repo.updateHousekeepingTask(id, {
    status: 'completed',
    completed_at: db.fn.now(),
    completed_by: user.sub,
    consumable_request_reference: input.consumableRequestReference ?? null,
  });
  await recordAudit({ orgId: user.org_id, campusId: before.campus_id, actorUserId: user.sub, action: 'housekeeping_task.completed', entityType: 'housekeeping_task', entityId: id, before, after });
  return after;
}

export async function markHousekeepingMissed(user: AuthUser, id: string, input: z.infer<typeof markHousekeepingMissedSchema>) {
  if (!(await canManageMaintenance(user))) throw new ForbiddenError('Only staff can mark a housekeeping task missed');
  const before = await repo.findHousekeepingTaskById(id);
  if (!before) throw new NotFoundError('Housekeeping task');
  if (!['scheduled', 'in_progress'].includes(before.status)) throw new ConflictError(`Cannot mark a task in status '${before.status}' as missed`);

  const after = await repo.updateHousekeepingTask(id, { status: 'missed', missed_reason: input.reason });
  await recordAudit({ orgId: user.org_id, campusId: before.campus_id, actorUserId: user.sub, action: 'housekeeping_task.missed', entityType: 'housekeeping_task', entityId: id, before, after, reason: input.reason });
  return after;
}

/** Supervisor inspection failed the task — a fresh task pointing back at
 * the one that needs redoing, not an edit of the original (that record
 * stays exactly what actually happened). */
export async function createReworkTask(user: AuthUser, id: string, input: z.infer<typeof createReworkTaskSchema>) {
  if (!(await canManageMaintenance(user))) throw new ForbiddenError('Only staff can schedule rework');
  const original = await repo.findHousekeepingTaskById(id);
  if (!original) throw new NotFoundError('Housekeeping task');

  const rework = await repo.createHousekeepingTask({
    org_id: original.org_id,
    campus_id: original.campus_id,
    scope_type: original.scope_type,
    scope_id: original.scope_id,
    task_type: original.task_type,
    scheduled_date: input.scheduledDate,
    assigned_to_user_id: input.assignedToUserId ?? original.assigned_to_user_id,
    rework_of_task_id: id,
    checklist: JSON.stringify(emptyChecklist(original.task_type as HousekeepingTaskType)),
  });
  await repo.updateHousekeepingTask(id, { status: 'rework_required' });

  await recordAudit({ orgId: user.org_id, campusId: original.campus_id, actorUserId: user.sub, action: 'housekeeping_task.rework_scheduled', entityType: 'housekeeping_task', entityId: rework.id, after: rework });
  if (rework.assigned_to_user_id) {
    await notify({
      orgId: original.org_id,
      campusId: original.campus_id,
      userId: rework.assigned_to_user_id,
      type: 'housekeeping_task.rework_assigned',
      title: `Rework needed — a ${original.task_type.replace(/_/g, ' ')} task did not pass inspection`,
      link: '/maintenance',
    });
  }
  return rework;
}

// ============================================================================
// D17.08 item 118 — cleanliness inspection.
// ============================================================================

export async function recordCleanlinessInspection(user: AuthUser, input: z.infer<typeof recordCleanlinessInspectionSchema>) {
  if (!(await canManageMaintenance(user))) throw new ForbiddenError('Only staff can record a cleanliness inspection');
  // area_type 'room'/'washroom' both key off a room_id (an attached
  // washroom shares its room's id — see migration's own comment).
  const room = await findRoomForCampus(input.scopeId);

  const row = await repo.createInspection({
    org_id: user.org_id,
    campus_id: room.campus_id,
    area_type: input.areaType,
    scope_id: input.scopeId,
    housekeeping_task_id: input.housekeepingTaskId ?? null,
    inspector_user_id: user.sub,
    cleanliness_score: input.cleanlinessScore,
    waste_segregation_ok: input.wasteSegregationOk ?? null,
    prohibited_accumulation_flag: input.prohibitedAccumulationFlag,
    safety_hazard_flag: input.safetyHazardFlag,
    maintenance_defect_noted: input.maintenanceDefectNoted,
    maintenance_defect_notes: input.maintenanceDefectNotes ?? null,
    energy_water_notes: input.energyWaterNotes ?? null,
    resident_participation_notes: input.residentParticipationNotes ?? null,
    photo_url: input.photoUrl ?? null,
    correction_deadline: input.correctionDeadline ?? null,
    reinspection_of_id: input.reinspectionOfId ?? null,
  });

  await recordAudit({ orgId: user.org_id, campusId: room.campus_id, actorUserId: user.sub, action: 'cleanliness_inspection.recorded', entityType: 'cleanliness_inspection', entityId: row.id, after: row });

  // Tell whoever's currently living there — §16.6 lists "resident
  // participation" as a real object field, meaning the resident is meant
  // to know a score exists at all, not just staff/gamification consumers.
  const occupant = await db('allocations')
    .join('beds', 'beds.id', 'allocations.bed_id')
    .where({ 'beds.room_id': input.scopeId, 'allocations.status': 'checked_in_active' })
    .first('allocations.student_id');
  if (occupant) {
    await notify({
      orgId: user.org_id,
      campusId: room.campus_id,
      userId: occupant.student_id,
      type: 'cleanliness_inspection.recorded',
      title: `Cleanliness inspection recorded for your ${input.areaType} — score ${input.cleanlinessScore}/5`,
      body: input.maintenanceDefectNoted ? 'An unresolved institutional maintenance defect was noted alongside this score.' : undefined,
      link: '/maintenance',
    });
  }

  return row;
}

/** Staff sees everything (optionally filtered); a resident is forced to
 * their own currently-occupied room, same self-vs-staff filtering shape
 * as every other list endpoint this session. */
export async function listCleanlinessInspections(user: AuthUser, filters: { areaType?: string; scopeId?: string }) {
  if (await canManageMaintenance(user)) return repo.listInspections(filters);
  const ownRoomId = await findResidentActiveRoomId(user.sub);
  if (!ownRoomId) return [];
  return repo.listInspections({ ...filters, scopeId: ownRoomId });
}

export async function getCleanlinessInspection(user: AuthUser, id: string) {
  const row = await repo.findInspectionById(id);
  if (!row) throw new NotFoundError('Cleanliness inspection');
  if (!(await canManageMaintenance(user))) {
    const occupant = await db('allocations')
      .join('beds', 'beds.id', 'allocations.bed_id')
      .where({ 'beds.room_id': row.scope_id, 'allocations.status': 'checked_in_active' })
      .first('allocations.student_id');
    if (occupant?.student_id !== user.sub) throw new ForbiddenError("You can only view your own room's inspections");
  }
  return row;
}

export async function addResidentComment(user: AuthUser, id: string, input: z.infer<typeof addResidentCommentSchema>) {
  const before = await repo.findInspectionById(id);
  if (!before) throw new NotFoundError('Cleanliness inspection');
  const room = await findRoomForCampus(before.scope_id);
  const occupant = await db('allocations')
    .join('beds', 'beds.id', 'allocations.bed_id')
    .where({ 'beds.room_id': before.scope_id, 'allocations.status': 'checked_in_active' })
    .first('allocations.student_id');
  if (occupant?.student_id !== user.sub) throw new ForbiddenError("Only this room's current occupant can comment on this inspection");

  const after = await repo.updateInspection(id, { resident_comments: input.comment });
  await recordAudit({ orgId: user.org_id, campusId: room.campus_id, actorUserId: user.sub, action: 'cleanliness_inspection.resident_commented', entityType: 'cleanliness_inspection', entityId: id, before, after });
  return after;
}

export async function appealCleanlinessInspection(user: AuthUser, id: string, input: z.infer<typeof appealCleanlinessInspectionSchema>) {
  const before = await repo.findInspectionById(id);
  if (!before) throw new NotFoundError('Cleanliness inspection');
  if (before.appeal_status !== 'none') throw new ConflictError('This inspection has already been appealed');
  const occupant = await db('allocations')
    .join('beds', 'beds.id', 'allocations.bed_id')
    .where({ 'beds.room_id': before.scope_id, 'allocations.status': 'checked_in_active' })
    .first('allocations.student_id');
  if (occupant?.student_id !== user.sub) throw new ForbiddenError("Only this room's current occupant can appeal this inspection");

  const after = await repo.updateInspection(id, { appeal_status: 'appealed', appeal_reason: input.reason });
  await recordAudit({ orgId: user.org_id, campusId: before.campus_id, actorUserId: user.sub, action: 'cleanliness_inspection.appealed', entityType: 'cleanliness_inspection', entityId: id, before, after, reason: input.reason });
  await notifyCampusStaff(db, user.org_id, before.campus_id, { type: 'cleanliness_inspection.appealed', title: 'A cleanliness inspection score was appealed', body: input.reason, link: '/maintenance' });
  return after;
}

export async function decideCleanlinessAppeal(user: AuthUser, id: string, input: z.infer<typeof decideCleanlinessAppealSchema>) {
  if (!(await canManageMaintenance(user))) throw new ForbiddenError('Only staff can decide a cleanliness appeal');
  const before = await repo.findInspectionById(id);
  if (!before) throw new NotFoundError('Cleanliness inspection');
  if (before.appeal_status !== 'appealed') throw new ConflictError(`Cannot decide an appeal in status '${before.appeal_status}'`);

  const after = await repo.updateInspection(id, {
    appeal_status: input.outcome,
    appeal_decided_by: user.sub,
    appeal_decided_at: db.fn.now(),
    appeal_decision_reason: input.reason,
  });
  await recordAudit({ orgId: user.org_id, campusId: before.campus_id, actorUserId: user.sub, action: 'cleanliness_inspection.appeal_decided', entityType: 'cleanliness_inspection', entityId: id, before, after, reason: input.reason });
  const occupant = await db('allocations')
    .join('beds', 'beds.id', 'allocations.bed_id')
    .where({ 'beds.room_id': before.scope_id, 'allocations.status': 'checked_in_active' })
    .first('allocations.student_id');
  if (occupant) {
    await notify({
      orgId: user.org_id,
      campusId: before.campus_id,
      userId: occupant.student_id,
      type: 'cleanliness_inspection.appeal_decided',
      title: `Your cleanliness inspection appeal was ${input.outcome}`,
      body: input.reason,
      link: '/maintenance',
    });
  }
  return after;
}

// ============================================================================
// D17.08 item 119 — §16.7's composite room-readiness gate.
// ============================================================================

/** Data-fetching only — the actual composition is the pure
 * computeRoomReadiness() in types.ts, safe for checkouts/service.ts to
 * call directly. This is the one function both getRoomReadiness (below,
 * a standalone staff-facing endpoint) and checkouts/service.ts's own
 * getCheckout use, so the two never compute it differently — including
 * the "Inventory/Key Clearance" gate, which looks up this room's own most
 * recent checkout itself rather than trusting a caller-supplied flag. */
export async function fetchRoomReadinessGates(roomId: string): Promise<RoomReadinessGates> {
  const room = await db('rooms').where({ id: roomId }).first('id', 'org_id');
  if (!room) throw new NotFoundError('Room');

  const [activeAllocation, bed, latestCheckout] = await Promise.all([
    db('allocations').join('beds', 'beds.id', 'allocations.bed_id').where({ 'beds.room_id': roomId, 'allocations.status': 'checked_in_active' }).first('allocations.id'),
    db('beds').where({ room_id: roomId }).first('id'),
    db('checkouts').join('beds', 'beds.id', 'checkouts.bed_id').where('beds.room_id', roomId).orderBy('checkouts.created_at', 'desc').first('checkouts.item_return_verified_at'),
  ]);

  const [housekeepingTask, inspection, hasUnresolvedCritical, safetyBlock, settings] = await Promise.all([
    repo.findLatestHousekeepingTaskForRoom(roomId),
    repo.findLatestInspectionForRoom(roomId),
    repo.hasUnresolvedCriticalTicket(roomId),
    bed ? safetyRepo.findBedSafetyBlock(bed.id) : Promise.resolve({ blocked: false }),
    getSettings(room.org_id),
  ]);

  const minScore = settings.policyDefaults.roomReadinessMinCleanlinessScore;

  return {
    physicalVacancy: !activeAllocation,
    inventoryKeyClearance: Boolean(latestCheckout?.item_return_verified_at),
    housekeepingComplete: housekeepingTask?.status === 'completed',
    inspectionPassed: Boolean(inspection && inspection.cleanliness_score >= minScore && !inspection.safety_hazard_flag),
    safetyClear: !safetyBlock.blocked,
    maintenanceClear: !hasUnresolvedCritical,
  };
}

export async function getRoomReadiness(user: AuthUser, roomId: string) {
  if (!(await canManageMaintenance(user))) throw new ForbiddenError('Only staff can view room readiness');
  const gates = await fetchRoomReadinessGates(roomId);
  return computeRoomReadiness(gates);
}
