// D17.09 depth (TODO.md Batch 24) — welfare_concern/safeguarding_concern
// added, distinct routing/access tier from complaint/incident.
export type CaseType = 'complaint' | 'incident' | 'welfare_concern' | 'safeguarding_concern';
export type CaseSeverity = 'low' | 'medium' | 'high' | 'critical';
export type CaseStatus = 'reported' | 'assigned' | 'in_progress' | 'resolved' | 'notice_issued' | 'decided' | 'appealed' | 'closed' | 'reopened';
export type DecisionOutcome = 'upheld' | 'dismissed' | 'other' | 'informal_resolution' | 'warning' | 'support_plan' | 'formal_discipline';

export interface CaseEvidence {
  url: string;
  caption?: string;
}

export interface MissingResidentChecklistItem {
  completed: boolean;
  completedBy?: string;
  completedAt?: string;
  notes?: string;
}
export type MissingResidentChecklist = Record<string, MissingResidentChecklistItem>;

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
  follow_up_due_at: Date | null;
  missing_resident_checklist: MissingResidentChecklist | null;
  emergency_restriction_active: boolean;
  emergency_restriction_reason: string | null;
  emergency_restriction_imposed_by: string | null;
  emergency_restriction_imposed_at: Date | null;
  emergency_restriction_review_due_at: Date | null;
  emergency_restriction_reviewed_at: Date | null;
  emergency_restriction_reviewed_by: string | null;
  emergency_restriction_review_outcome: 'continued' | 'lifted' | null;
  created_at: Date;
}

export type CaseAccessRoleLabel = 'security_officer' | 'medical_officer' | 'dean_committee' | 'privacy_legal_auditor';

export interface CaseAccessGrant {
  id: string;
  org_id: string;
  campus_id: string;
  case_id: string;
  granted_to_user_id: string;
  role_label: CaseAccessRoleLabel;
  read_only: boolean;
  purpose: string | null;
  granted_by: string;
  granted_at: Date;
  expires_at: Date | null;
  revoked_at: Date | null;
  revoked_by: string | null;
  created_at: Date;
}
