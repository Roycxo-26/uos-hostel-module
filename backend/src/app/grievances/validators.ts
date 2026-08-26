import { z } from 'zod';

const GRIEVANCE_SCOPES = [
  'allocation',
  'waitlist',
  'transfer',
  'staff_behaviour',
  'service_quality',
  'privacy_room_entry',
  'damage_assessment',
  'fee_charge',
  'safety_sanitation',
  'accessibility',
  'retaliation',
  'other',
] as const;

export const raiseGrievanceSchema = z.object({
  scope: z.enum(GRIEVANCE_SCOPES),
  description: z.string().trim().min(1).max(2000),
  subjectUserId: z.string().uuid().optional(),
  linkedEntityType: z.string().trim().max(30).optional(),
  linkedEntityId: z.string().uuid().optional(),
});

export const assignReviewerSchema = z.object({
  reviewerId: z.string().uuid(),
});

export const returnForInformationSchema = z.object({
  notes: z.string().trim().min(1).max(1000),
});

export const respondToInformationRequestSchema = z.object({
  response: z.string().trim().min(1).max(2000),
});

export const issueDecisionSchema = z.object({
  decisionReason: z.string().trim().min(1).max(2000),
  remedyNotes: z.string().trim().max(1000).optional(),
});

export const submitAppealSchema = z.object({
  appealReason: z.string().trim().min(1).max(2000),
});

export const assignIndependentReviewerSchema = z.object({
  reviewerId: z.string().uuid(),
});

export const issueFinalDecisionSchema = z.object({
  reason: z.string().trim().min(1).max(2000),
});

export const resolveGrievanceSchema = z.object({
  remediationNotes: z.string().trim().max(1000).optional(),
});

export const closeGrievanceSchema = z.object({});

export const reopenGrievanceSchema = z.object({
  reason: z.string().trim().min(1).max(500),
});

export const withdrawGrievanceSchema = z.object({});

export const setInterimActionSchema = z.object({
  notes: z.string().trim().min(1).max(1000),
});

export const setReferralSchema = z.object({
  referredTo: z.string().trim().min(1).max(200),
});

// --- Policy acknowledgement (item 81) ------------------------------------

export const publishPolicyVersionSchema = z.object({
  documentKey: z.string().trim().min(1).max(60),
  version: z.string().trim().min(1).max(30),
  title: z.string().trim().min(1).max(200),
  contentHash: z.string().trim().max(200).optional(),
  mandatory: z.boolean().default(true),
  reAckDeadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD').optional(),
});

export const acknowledgePolicySchema = z.object({
  signatureMethod: z.enum(['checkbox', 'otp', 'physical']).default('checkbox'),
});

export const declinePolicySchema = z.object({
  reason: z.string().trim().min(1).max(500),
});
