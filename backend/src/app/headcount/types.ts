export type HeadcountScopeType = 'room' | 'floor' | 'hostel';
export type HeadcountSessionStatus = 'open' | 'closed';
export type HeadcountEntryStatus = 'present' | 'approved_out' | 'missing' | 'unknown';

export interface HeadcountSession {
  id: string;
  org_id: string;
  campus_id: string;
  scope_type: HeadcountScopeType;
  scope_id: string;
  session_date: string;
  status: HeadcountSessionStatus;
  opened_by: string;
  opened_at: Date;
  closed_by: string | null;
  closed_at: Date | null;
  created_at: Date;
}

export interface HeadcountEntry {
  id: string;
  org_id: string;
  campus_id: string;
  session_id: string;
  student_id: string;
  status: HeadcountEntryStatus;
  note: string | null;
  recorded_by: string | null;
  recorded_at: Date | null;
}
