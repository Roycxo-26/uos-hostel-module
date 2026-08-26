export type CaseType = 'complaint' | 'incident';
export type CaseSeverity = 'low' | 'medium' | 'high' | 'critical';
export type CaseStatus = 'reported' | 'assigned' | 'in_progress' | 'resolved' | 'notice_issued' | 'decided' | 'appealed' | 'closed' | 'reopened';
export type DecisionOutcome = 'upheld' | 'dismissed' | 'other';

export interface CaseEvidence {
  url: string;
  caption?: string;
}

export interface Case {
  id: string;
  org_id: string;
  campus_id: string;
  reporter_user_id: string;
  // Who the case concerns, if different from the reporter — nullable, see
  // migration 19's own comment. Falls back to reporter_user_id wherever
  // "who does this affect" matters (notifications, discipline notices).
  subject_user_id: string | null;
  case_type: CaseType;
  category: string;
  description: string;
  room_id: string | null;
  severity: CaseSeverity | null;
  confidential: boolean;
  status: CaseStatus;
  assigned_to: string | null;
  evidence: CaseEvidence[];
  investigation_notes: string | null;
  notice_text: string | null;
  decision_outcome: DecisionOutcome | null;
  decision_reason: string | null;
  decided_by: string | null;
  decided_at: Date | null;
  appeal_reason: string | null;
  desk_ticket_reference: { status: string } | null;
  reopen_reason: string | null;
  created_at: Date;
}
