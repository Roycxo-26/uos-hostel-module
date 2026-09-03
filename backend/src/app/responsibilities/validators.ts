import { z } from 'zod';

export const createAssignmentSchema = z
  .object({
    assigneeUserId: z.string().uuid(),
    privilegeType: z.enum(['room_head', 'floor_incharge']), // attendance_taker/verifier stay reserved for the future Headcount module (Batch 5) — not assignable through this endpoint yet
    scopeType: z.enum(['room', 'floor']),
    scopeId: z.string().uuid(),
    effectiveFrom: z.string().datetime().optional(),
    effectiveTo: z.string().datetime().optional(),
    // flow.md §5A's delegation/escalation/bypass framework, applied to this
    // table's own long-dormant substitute_user_id column (present since
    // migration 6, never wired up until now — UAT.md Batch 10 gap-closure:
    // "no substitute/fallback if an assigned Room Head/Floor In-charge is
    // unavailable"). An active substitute may act for this exact scope
    // exactly like the primary assignee — see headcount/service.ts's
    // canActOnScope.
    substituteUserId: z.string().uuid().optional(),
  })
  .refine((v) => (v.privilegeType === 'room_head') === (v.scopeType === 'room'), {
    message: "room_head must scope to 'room'; floor_incharge must scope to 'floor'",
    path: ['scopeType'],
  })
  .refine((v) => !v.effectiveTo || !v.effectiveFrom || v.effectiveTo > v.effectiveFrom, {
    message: 'effectiveTo must be after effectiveFrom',
    path: ['effectiveTo'],
  })
  .refine((v) => v.substituteUserId !== v.assigneeUserId, {
    message: 'A substitute cannot be the same person as the primary assignee',
    path: ['substituteUserId'],
  });

export const revokeAssignmentSchema = z.object({
  reason: z.string().trim().min(1).max(500),
});

// Set or clear the substitute on an already-active assignment — the
// realistic case ("today's Room Head is unavailable, name a stand-in now"),
// not just at creation time.
export const setSubstituteSchema = z.object({
  substituteUserId: z.string().uuid().nullable(),
});

export const listAssignmentsQuerySchema = z.object({
  scopeType: z.enum(['room', 'floor', 'hostel']).optional(),
  scopeId: z.string().uuid().optional(),
  assigneeUserId: z.string().uuid().optional(),
  status: z.enum(['draft', 'active', 'expired', 'revoked']).optional(),
});

// D17.22 item 83 — a separate schema from createAssignmentSchema above,
// deliberately: that one's privilegeType<->scopeType pairing is a fixed
// room_head/room, floor_incharge/floor rule specific to those two roles,
// and duty-roster roles don't share it (a Duty Warden or Front Desk
// Shift is typically hostel-scoped, not room/floor). Reuses the exact
// same underlying table via the same repository, not a parallel one.
export const createDutyAssignmentSchema = z
  .object({
    assigneeUserId: z.string().uuid(),
    privilegeType: z.enum(['duty_warden', 'floor_duty_officer', 'front_desk_shift', 'security_contact', 'emergency_contact']),
    scopeType: z.enum(['room', 'floor', 'hostel']),
    scopeId: z.string().uuid(),
    // Unlike Room Head/Floor In-charge (open-ended by default), a duty
    // shift always has a defined window — that's what makes it a shift.
    effectiveFrom: z.string().datetime(),
    effectiveTo: z.string().datetime(),
    substituteUserId: z.string().uuid().optional(),
  })
  .refine((v) => v.effectiveTo > v.effectiveFrom, {
    message: 'effectiveTo must be after effectiveFrom',
    path: ['effectiveTo'],
  })
  .refine((v) => v.substituteUserId !== v.assigneeUserId, {
    message: 'A substitute cannot be the same person as the primary assignee',
    path: ['substituteUserId'],
  });

// D17.09 depth (TODO.md Batch 24) — a third schema, deliberately: the four
// standing safeguarding roles are open-ended standing appointments (like
// Room Head/Floor In-charge above), not a defined-window shift (like the
// duty-roster roles just above), but they're campus-wide authority (like
// the duty-roster roles), not room/floor-scoped (like Room Head/Floor
// In-charge) — neither existing schema's pairing rule fits.
export const createSafeguardingAssignmentSchema = z
  .object({
    assigneeUserId: z.string().uuid(),
    privilegeType: z.enum(['safeguarding_lead', 'safeguarding_deputy', 'welfare_officer', 'counsellor']),
    scopeType: z.literal('hostel'),
    scopeId: z.string().uuid(),
    effectiveFrom: z.string().datetime().optional(),
    effectiveTo: z.string().datetime().optional(),
  })
  .refine((v) => !v.effectiveTo || !v.effectiveFrom || v.effectiveTo > v.effectiveFrom, {
    message: 'effectiveTo must be after effectiveFrom',
    path: ['effectiveTo'],
  });

// D17.05 (TODO.md Batch 27) — the standing Finance Officer role. A fourth
// schema, deliberately: same open-ended/campus-wide shape as the
// safeguarding one just above, but a genuinely separate role family (see
// finance/service.ts's canConfirmFinance) — kept its own schema rather than
// widening createSafeguardingAssignmentSchema's own enum, same reasoning
// that schema's own comment gives for not sharing with the room/floor or
// duty-roster ones.
export const createFinanceRoleAssignmentSchema = z
  .object({
    assigneeUserId: z.string().uuid(),
    privilegeType: z.literal('finance_officer'),
    scopeType: z.literal('hostel'),
    scopeId: z.string().uuid(),
    effectiveFrom: z.string().datetime().optional(),
    effectiveTo: z.string().datetime().optional(),
  })
  .refine((v) => !v.effectiveTo || !v.effectiveFrom || v.effectiveTo > v.effectiveFrom, {
    message: 'effectiveTo must be after effectiveFrom',
    path: ['effectiveTo'],
  });
