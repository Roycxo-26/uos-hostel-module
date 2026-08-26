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
export const reportCaseSchema = z.object({
  caseType: z.enum(['complaint', 'incident']).default('complaint'),
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

export const decideCaseSchema = z.object({
  decisionOutcome: z.enum(['upheld', 'dismissed', 'other']),
  decisionReason: z.string().trim().min(1).max(1000),
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
  caseType: z.enum(['complaint', 'incident']).optional(),
});
