import { z } from 'zod';

const CHECKOUT_TYPES = ['end_of_term', 'early_voluntary', 'disciplinary_removal', 'death_incapacity', 'abandonment'] as const;

// ux-flow.md §3.3 "Checkout screen": reason/date. studentId is staff-only
// (on behalf), same self-service-by-default pattern as
// transfers/movements/cases. D17.12 item 103 — checkoutType defaults to the
// common case; 'abandonment' additionally requires a staff caller (item
// 106, enforced in the service — a resident obviously can't self-report
// their own abandonment).
export const requestCheckoutSchema = z.object({
  studentId: z.string().uuid().optional(),
  reason: z.string().trim().min(1).max(500),
  checkoutType: z.enum(CHECKOUT_TYPES).default('end_of_term'),
});

export const inspectCheckoutSchema = z.object({
  inspectionNotes: z.string().trim().max(2000).optional(),
  damageFound: z.boolean().default(false),
  damageChargeAmount: z.number().nonnegative().optional(),
  damageDescription: z.string().trim().max(1000).optional(),
});

export const disputeDamageSchema = z.object({
  disputeReason: z.string().trim().min(1).max(1000),
});

export const recordClearanceSchema = z.object({
  deskCleared: z.boolean().optional(),
  financeCleared: z.boolean().optional(),
});

// D17.12 item 103 — which keys apply depends on checkoutType (see
// service.ts's PREREQUISITE_CHECKLIST_KEYS map); the schema itself just
// validates the shape of one item being ticked at a time, same pattern as
// every other checklist this codebase already has (Batch 22/24).
export const PREREQUISITE_CHECKLIST_KEYS_BY_TYPE: Record<string, readonly string[]> = {
  end_of_term: ['academic_clearance', 'library_clearance', 'hostel_dues_cleared'],
  early_voluntary: ['written_request_on_file', 'notice_period_served'],
  disciplinary_removal: ['case_reference_linked', 'security_notified'],
  death_incapacity: ['next_of_kin_contacted', 'institutional_authority_notified'],
  abandonment: ['contact_attempts_logged', 'waiting_period_elapsed'],
};

export const updatePrerequisiteChecklistSchema = z.object({
  key: z.string().trim().min(1).max(50),
  completed: z.boolean(),
  notes: z.string().trim().max(500).optional(),
});

// D17.12 item 104 — the three new independently-trackable milestones
// (desk_cleared/finance_cleared already existed via recordClearanceSchema
// above).
export const recordItemReturnSchema = z.object({}).strict();
export const finalizeDamageAssessmentSchema = z.object({}).strict();
export const markRoomReadyForReuseSchema = z.object({}).strict();

// BR's own Checkout override row: "Reason + unresolved clearance risks
// mandatory." Required only when clearances aren't actually complete —
// enforced in the service, not here, since that depends on the record's
// current state.
export const approveCheckoutSchema = z.object({
  overrideReason: z.string().trim().max(500).optional(),
  bedOutcome: z.enum(['available', 'blocked']).default('available'),
});

export const cancelCheckoutSchema = z.object({
  reason: z.string().trim().min(1).max(500),
});

// D17.12 item 105 — mirrors Cases' own reopenCaseSchema exactly.
export const reopenCheckoutSchema = z.object({
  reopenReason: z.string().trim().min(1).max(500),
});

export const listCheckoutsQuerySchema = z.object({
  status: z.enum(['requested', 'inspected', 'completed', 'cancelled', 'reopened']).optional(),
});

// --- D17.12 item 106 — abandonment contact attempts -------------------------

export const recordContactAttemptSchema = z.object({
  method: z.enum(['call', 'email', 'sms', 'in_person']),
  outcome: z.enum(['no_response', 'invalid_contact', 'reached']),
  notes: z.string().trim().max(1000).optional(),
});

// --- D17.12 item 107 — itemized checkout inventory --------------------------

export const addCheckoutInventoryItemSchema = z.object({
  checkinItemId: z.string().uuid().optional(),
  itemName: z.string().trim().min(1).max(100),
  itemCategory: z.enum(['furniture', 'appliance', 'key', 'fixture', 'other']).default('other'),
  conditionAtCheckout: z.enum(['good', 'fair', 'damaged', 'missing']).default('good'),
  classification: z.enum(['normal_wear', 'damage', 'not_applicable']).optional(),
  photoUrl: z.string().trim().url().max(2000).optional(),
  officerNotes: z.string().trim().max(1000).optional(),
  // Manual only — no rate card to compute this from yet (blocked on a
  // tenant policy decision + Batch 27 Finance existing). A staff member
  // who already knows the figure can still record it.
  chargeAmount: z.number().nonnegative().optional(),
});
