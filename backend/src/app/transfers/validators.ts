import { z } from 'zod';

// BR §7: "Residents shall request room/bed transfer" — studentId omitted
// means self-service (the caller's own active allocation). A staff caller
// (Warden/Head Warden) may pass studentId to request on a resident's
// behalf, required for transferType='emergency' (a student cannot declare
// their own emergency relocation — enforced in the service, not just here).
export const requestTransferSchema = z
  .object({
    studentId: z.string().uuid().optional(),
    reason: z.string().trim().min(1).max(500),
    transferType: z.enum(['normal', 'emergency']).default('normal'),
    retrospectiveReviewDeadline: z.string().datetime().optional(),
    // BR §7 "temporary destination + retrospective review deadline" —
    // opts an emergency relocation into the round-trip auto-restore sweep
    // (jobs/restoreTemporaryRelocations.ts). retrospectiveReviewDeadline
    // doubles as the return-due date when this is true. UAT.md Batch 10
    // gap-closure: previously every emergency transfer was a one-way move.
    isTemporary: z.boolean().default(false),
  })
  .superRefine((val, ctx) => {
    if (val.transferType === 'emergency' && !val.retrospectiveReviewDeadline) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['retrospectiveReviewDeadline'],
        message: "retrospectiveReviewDeadline is required when transferType is 'emergency' — BR §7",
      });
    }
    if (val.isTemporary && val.transferType !== 'emergency') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['isTemporary'],
        message: "isTemporary is only meaningful for transferType 'emergency' — a normal transfer has no round-trip concept",
      });
    }
  });

export const decideTransferSchema = z
  .object({
    decision: z.enum(['approved', 'rejected']),
    reason: z.string().trim().min(1).max(500),
    newBedId: z.string().uuid().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.decision === 'approved' && !val.newBedId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['newBedId'], message: 'newBedId is required when approving a transfer' });
    }
  });

const conditionPhotoSchema = z.object({
  url: z.string().trim().url().max(2000),
  caption: z.string().trim().max(200).optional(),
});

export const executeTransferSchema = z.object({
  undertakingAccepted: z
    .boolean()
    .refine((v) => v === true, { message: 'Resident must accept the hostel undertaking for the new room' }),
  conditionNotes: z.string().trim().max(1000).optional(),
  conditionPhotos: z.array(conditionPhotoSchema).max(20).default([]),
  oldRoomInspectionNotes: z.string().trim().max(1000).optional(),
  oldBedOutcome: z.enum(['available', 'blocked']).default('available'),
});

export const cancelTransferSchema = z.object({
  reason: z.string().trim().min(1).max(500),
});
