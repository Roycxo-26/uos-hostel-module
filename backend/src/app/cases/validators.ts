import { z } from 'zod';

// Same stopgap reference-array pattern as applications.attachments /
// checkins.condition_photos — see those files' own comments on why.
const evidenceSchema = z.object({
  url: z.string().trim().url().max(2000),
  caption: z.string().trim().max(200).optional(),
});

// ux-flow.md §3.3 "Hostel Complaint form": category, description, location
// auto-fill, photo/video. Old rule book §10 "Incident Report" adds
// severity/confidentiality at report time for incidents (a complaint
// reporter doesn't set severity — that's triage's job, BR §9).
// D17.09 depth (TODO.md Batch 24) — welfare_concern/safeguarding_concern
// route into the restricted case team, not the general case-managing
// staff pool — see service.ts's canManageThisCase.
export const reportCaseSchema = z.object({
  caseType: z.enum(['complaint', 'incident', 'welfare_concern', 'safeguarding_concern']).default('complaint'),
  category: z.string().trim().min(1).max(100),
  description: z.string().trim().min(1).max(2000),
  roomId: z.string().uuid().optional(),
  // BR §9: who a discipline case concerns, when that's someone other than
  // the reporter (e.g. reporting another resident's conduct). Absent =
  // falls back to the reporter — see cases/service.ts.
  subjectUserId: z.string().uuid().optional(),
  evidence: z.array(evidenceSchema).max(20).default([]),
  confidential: z.boolean().default(false),
});

// BR §9: "Triage category, severity, confidentiality" + "Assign owner and
// SLA" — collapsed into one action (see migration's own comment), same
// precedent as createAllocation.
export const triageCaseSchema = z.object({
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  confidential: z.boolean().optional(),
  assignedTo: z.string().uuid(),
});

export const investigateCaseSchema = z.object({
  investigationNotes: z.string().trim().min(1).max(2000),
});

export const resolveCaseSchema = z.object({
  investigationNotes: z.string().trim().max(2000).optional(),
});

// BR §9: "Notice and fair response opportunity" before a disciplinary
// decision — the resident must see this before decideCase can be called.
export const issueNoticeSchema = z.object({
  noticeText: z.string().trim().min(1).max(1000),
});

// D17.09 item 97 — four new outcome types alongside the original three.
// 'support_plan' carries its own "different downstream effect": a
// mandatory follow-up review date, enforced by the refine below rather
// than left to the caller to remember.
export const decideCaseSchema = z
  .object({
    decisionOutcome: z.enum(['upheld', 'dismissed', 'other', 'informal_resolution', 'warning', 'support_plan', 'formal_discipline']),
    decisionReason: z.string().trim().min(1).max(1000),
    followUpDueAt: z.string().datetime().optional(),
  })
  .refine((v) => v.decisionOutcome !== 'support_plan' || Boolean(v.followUpDueAt), {
    message: 'followUpDueAt is required when decisionOutcome is "support_plan"',
    path: ['followUpDueAt'],
  });

export const appealCaseSchema = z.object({
  appealReason: z.string().trim().min(1).max(1000),
});

// ux-flow.md §3.3: "Student acknowledges resolution" -> Closed. Also usable
// by staff for an administrative close (e.g. after a decided disciplinary
// case, where there's no separate "acknowledge" step in BR §9's flow).
export const closeCaseSchema = z.object({}).strict();

export const reopenCaseSchema = z.object({
  reopenReason: z.string().trim().min(1).max(500),
});

export const listCasesQuerySchema = z.object({
  status: z
    .enum(['reported', 'assigned', 'in_progress', 'resolved', 'notice_issued', 'decided', 'appealed', 'closed', 'reopened'])
    .optional(),
  caseType: z.enum(['complaint', 'incident', 'welfare_concern', 'safeguarding_concern']).optional(),
});

// --- D17.09 items 96/99 — case-specific, time-bound access grants ---------

export const grantCaseAccessSchema = z.object({
  userId: z.string().uuid(),
  roleLabel: z.enum(['security_officer', 'medical_officer', 'dean_committee', 'privacy_legal_auditor']),
  readOnly: z.boolean().optional(),
  purpose: z.string().trim().min(1).max(500),
  expiresAt: z.string().datetime().optional(),
});

export const revokeCaseAccessSchema = z.object({
  reason: z.string().trim().min(1).max(500),
});

// --- D17.09 item 98 — missing-resident checklist ----------------------------

export const MISSING_RESIDENT_CHECKLIST_KEYS = ['roommate_check', 'medical_reference_check'] as const;

export const updateMissingResidentChecklistSchema = z.object({
  key: z.enum(MISSING_RESIDENT_CHECKLIST_KEYS),
  completed: z.boolean(),
  notes: z.string().trim().max(500).optional(),
});

// --- D17.09 item 99 — emergency privilege restriction -----------------------

export const imposeEmergencyRestrictionSchema = z.object({
  reason: z.string().trim().min(1).max(1000),
  reviewDueInHours: z.number().int().positive().max(720),
});

export const reviewEmergencyRestrictionSchema = z.object({
  outcome: z.enum(['continued', 'lifted']),
  notes: z.string().trim().min(1).max(1000),
});
