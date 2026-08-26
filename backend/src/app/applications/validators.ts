import { z } from 'zod';

// UOS HOSTEL BR.md BR-HOS-002: "attach required documents" — stopgap
// reference array, not real file storage (see the migration's own comment).
// The upload itself happens through whatever object-storage endpoint the
// frontend already has (or a future UOS-126 Documents integration); this
// only records the resulting reference.
const attachmentSchema = z.object({
  name: z.string().trim().min(1).max(200),
  url: z.string().trim().url().max(2000),
  uploadedAt: z.string().datetime().optional(),
});

// D17.02 item 49 — ten BRD application types (HOSTEL V1.1.md §10.1).
const applicationTypeEnum = z.enum([
  'new_term',
  'renewal',
  'mid_term',
  'short_stay',
  'emergency',
  'visiting',
  'staff',
  'accessibility_request',
  'hostel_transfer',
  'off_campus_placement',
]);

export const submitApplicationSchema = z.object({
  term: z.string().trim().min(1).max(40),
  applicationType: applicationTypeEnum.default('new_term'),
  // D17.02 item 52 — only meaningful when applicationType === 'renewal';
  // service.ts enforces that pairing rather than duplicating the
  // conditional-requirement dance validators.ts already uses elsewhere
  // (see updateRoomStatusSchema's own comment on this same tradeoff).
  renewalOfAllocationId: z.string().uuid().optional(),
  preferences: z
    .object({
      hostelId: z.string().uuid().optional(),
      roomType: z.string().trim().max(40).optional(),
      accessibilityNeed: z.string().trim().max(500).optional(),
      notes: z.string().trim().max(1000).optional(),
    })
    .default({}),
  attachments: z.array(attachmentSchema).max(20).default([]),
});

// D17.02 item 50 — the seven-value BRD eligibility outcome + its
// conditional-eligibility object (HOSTEL V1.1.md §10.5), settable
// alongside a decision. Still entirely the reviewer's manual judgement —
// no eligibility source is consulted automatically.
const eligibilityOutcomeEnum = z.enum([
  'eligible',
  'conditionally_eligible',
  'waiting_for_evidence',
  'source_verification_pending',
  'ineligible_reconsiderable',
  'ineligible_final',
  'exception_review_required',
]);

const eligibilityConditionsSchema = z.object({
  condition: z.string().trim().min(1).max(500),
  responsibleParty: z.string().trim().max(200).optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD').optional(),
  expiry: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD').optional(),
  effectIfUnmet: z.string().trim().max(500).optional(),
  evidenceRequirement: z.string().trim().max(500).optional(),
});

// BR §6: RETURNED loops the student back to correct and resubmit — Approved
// is still the only outcome that doesn't need a written reason.
export const decideApplicationSchema = z
  .object({
    decision: z.enum(['approved', 'waitlisted', 'rejected', 'returned']),
    reason: z.string().trim().min(1).max(500).optional(),
    eligibilityOutcome: eligibilityOutcomeEnum.optional(),
    eligibilityConditions: eligibilityConditionsSchema.optional(),
  })
  .superRefine((val, ctx) => {
    if (val.decision !== 'approved' && !val.reason) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['reason'],
        message: `A reason is required when decision is '${val.decision}'`,
      });
    }
    if (val.eligibilityConditions && val.eligibilityOutcome !== 'conditionally_eligible') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['eligibilityConditions'],
        message: `eligibilityConditions only applies when eligibilityOutcome is 'conditionally_eligible'`,
      });
    }
  });

// D17.02 item 51.
export const withdrawApplicationSchema = z.object({
  reason: z.string().trim().min(1).max(500).optional(),
});

export const cancelApplicationSchema = z.object({
  reason: z.string().trim().min(1).max(500),
});

export const reopenApplicationSchema = z.object({
  reason: z.string().trim().min(1).max(500),
});

// BR §6: a RETURNED application resubmits with corrections — preferences/
// attachments may change, term may not (resubmitting under a different term
// isn't a correction, it's a new application).
export const resubmitApplicationSchema = z.object({
  preferences: submitApplicationSchema.shape.preferences.optional(),
  attachments: z.array(attachmentSchema).max(20).optional(),
});

export const listApplicationsQuerySchema = z.object({
  status: z
    .enum([
      'submitted',
      'under_review',
      'returned',
      'approved',
      'waitlisted',
      'rejected',
      'allocation_ready',
      'allocated',
      'closed',
      'cancelled',
      'withdrawn',
      'reopened',
    ])
    .optional(),
});
