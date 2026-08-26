// HOSTEL-GAP-ANALYSIS.md D17.22 item 86 (TODO.md Batch 21).

export type NoticeScopeType = 'room' | 'floor' | 'hostel';
export type NoticeSeverity = 'normal' | 'critical';

export interface OperationalNotice {
  id: string;
  org_id: string;
  campus_id: string;
  scope_type: NoticeScopeType;
  scope_id: string;
  title: string;
  body: string | null;
  severity: NoticeSeverity;
  requires_acknowledgement: boolean;
  published_by: string | null;
  published_at: Date;
  superseded_by: string | null;
}

export interface NoticeAcknowledgement {
  id: string;
  org_id: string;
  campus_id: string;
  notice_id: string;
  student_id: string;
  delivered_at: Date;
  acknowledged_at: Date | null;
}
