import { z } from 'zod';

// UOS HOSTEL BR.md §3: "effective-dated configuration" and "gender/category/
// accessibility policy" on the Hostel hierarchy master — TODO.md Batch 1
// items 1-2. category_policy is deliberately an open string array, not a
// closed enum: flow.md §16 lists category rules as tenant-configurable
// ("NEEDS DECISION — configure, do not hard-code"), so a fixed CHECK
// constraint here would violate the requirement it's meant to satisfy.
const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD')
  .optional();

// D17.01 item 43 — shared four-state lifecycle for hostel/block/floor/room.
const lifecycleStatus = z.enum(['active', 'suspended', 'deactivated', 'retired']);

export const createHostelSchema = z
  .object({
    campusId: z.string().uuid().optional(), // required only when campus_scope=ALL — see resolveCampusId
    code: z.string().trim().min(1).max(20),
    name: z.string().trim().min(1).max(120),
    genderPolicy: z.enum(['male', 'female', 'co-ed']),
    capacity: z.number().int().nonnegative().default(0),
    effectiveFrom: dateOnly,
    effectiveTo: dateOnly,
    categoryPolicy: z.array(z.string().trim().min(1).max(50)).max(50).optional(),
    accessibilityPolicy: z.string().trim().max(2000).optional(),
  })
  .refine((v) => !v.effectiveFrom || !v.effectiveTo || v.effectiveTo >= v.effectiveFrom, {
    message: 'effectiveTo must be on or after effectiveFrom',
    path: ['effectiveTo'],
  });

export const updateHostelSchema = createHostelSchema
  .innerType()
  .omit({ campusId: true })
  .partial()
  .extend({
    status: lifecycleStatus.optional(),
  })
  .refine((v) => !v.effectiveFrom || !v.effectiveTo || v.effectiveTo >= v.effectiveFrom, {
    message: 'effectiveTo must be on or after effectiveFrom',
    path: ['effectiveTo'],
  });

export const createBlockSchema = z.object({
  code: z.string().trim().min(1).max(20),
  name: z.string().trim().min(1).max(120),
  wardenUserId: z.string().uuid().optional(),
});

// flow.md §19 item 18 gap-closure — code/name/capacity edits, not just
// status changes. Plain `.partial()` (createBlockSchema/createFloorSchema/
// createRoomSchema below are none of them wrapped in `.refine()`, unlike
// createHostelSchema, so no `.innerType()` dance is needed to get there).
// A field's own `.default(...)` never fires on a partial/update payload —
// Zod's `.optional()` (which `.partial()` adds) short-circuits on an absent
// key before the wrapped default ever runs — so "omitted" genuinely means
// "leave this field alone," matching updateHostelSchema's own behavior.
// `status` extended on here (not on createBlockSchema) — same reasoning as
// updateHostelSchema: creation always starts 'active' (DB default), a
// lifecycle transition is exclusively an update-time action.
export const updateBlockSchema = createBlockSchema.partial().extend({ status: lifecycleStatus.optional() });

export const createFloorSchema = z.object({
  number: z.string().trim().min(1).max(10),
  name: z.string().trim().max(60).optional(),
  floorInchargeUserId: z.string().uuid().optional(),
});

export const updateFloorSchema = createFloorSchema.partial().extend({ status: lifecycleStatus.optional() });

export const createRoomSchema = z.object({
  code: z.string().trim().min(1).max(20),
  roomType: z.string().trim().min(1).max(40).default('standard'),
  capacity: z.number().int().positive().default(1),
  accessibility: z.boolean().default(false),
  // D17.01 item 45 — replaces the single `restrictions` free-text field.
  permittedPopulation: z.string().trim().max(500).optional(),
  occupancyCompatibilityRule: z.string().trim().max(500).optional(),
  safetyRestriction: z.string().trim().max(500).optional(),
});

// Deliberately excludes `status` — that's exclusively `updateRoomStatusSchema`
// below, with its own active-occupancy guard (service.ts's updateRoomStatus).
// This schema is field edits only; the two never overlap.
export const updateRoomSchema = createRoomSchema.partial();

export const createBedSchema = z.object({
  code: z.string().trim().min(1).max(10),
});

// flow.md §19 item 18 gap-closure, second pass: Block/Floor/Room all got a
// field-edit endpoint distinct from their status/occupancy actions; Bed was
// missed the first time around even though `code` is exactly the same kind
// of plain display label as Room's `code` (allocations/checkins reference
// beds by their UUID, never by `code`, so renaming one is exactly as safe
// as renaming a Room). This closes that inconsistency.
export const updateBedSchema = createBedSchema.partial();

// D17.01 item 43 — widened from ('active','inactive') to the shared
// four-state lifecycle. `reason` is mandatory whenever leaving 'active'
// (service.ts enforces this — Zod alone can't express "required unless
// status==='active'" without a `.refine`, and the room-vs-bed refine shape
// would otherwise have to be duplicated here and in updateBedStatusSchema
// below; keeping the conditional-requirement rule in one place, the
// service layer, matches how every other cross-field validation in this
// module already works, e.g. the occupancy guard itself).
export const updateRoomStatusSchema = z.object({
  status: lifecycleStatus,
  reason: z.string().trim().min(1).max(500).optional(),
  reviewDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD').optional(),
  // HOSTEL-GAP-ANALYSIS.md D17.17 item 67 — the machine-readable category
  // behind a suspension. A 'safety' category is what actually blocks new
  // allocation/offer on this room (allocations/service.ts, via
  // safety/repository.ts's findBedSafetyBlock) — 'maintenance'/'policy'/
  // 'other' don't. Optional so a plain maintenance/administrative
  // suspension doesn't need to guess a category it has no use for.
  statusReasonCategory: z.enum(['safety', 'maintenance', 'policy', 'other']).optional(),
});

export const updateBedStatusSchema = z.object({
  // Manual override only — 'allocated'/'occupied' are set by the
  // allocation/check-in workflows, not directly (flow.md §6.1).
  status: z.enum(['available', 'blocked', 'maintenance']),
  reason: z.string().trim().min(1).max(500),
  reviewDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD').optional(),
});
