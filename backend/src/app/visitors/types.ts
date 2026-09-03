// HOSTEL-GAP-ANALYSIS.md D17.06 (TODO.md Batch 28). "HOSTEL - v.1.md" §14.5
// lists 17 visitor states; this build collapses three of them (named below)
// rather than modelling every one as a stored status — a deliberate,
// documented simplification, not a silent drop.
//
//   DRAFT is skipped — requests are created directly into 'requested'. A
//   host who wants to fix details before submitting just doesn't submit
//   from the UI yet; there's no separate stored draft-edit step.
//   UNDER_REVIEW folds into 'requested' — this codebase's other approval
//   workflows (transfer, checkout, movement) don't model a distinct
//   "someone has claimed this for review" state either.
//   CREDENTIAL_PENDING and PASS_ISSUED collapse into one 'pass_issued' —
//   D19 (the real credential system) doesn't exist, so credential issue is
//   DEV-SIMULATED and instantaneous at approval time; there's nothing to
//   be "pending" on.
//   ACTIVE_VISIT folds into 'entered' — same meaning, visitor is on-site.
//   INCIDENT_REVIEW is not a stored state at all — an incident during a
//   visit is raised as an ordinary Case in the existing Cases module (not
//   auto-linked; cases/service.ts can't be imported from here per this
//   codebase's own module-boundary rule, and repo.create would bypass its
//   audit/notify logic), named as a real, deliberate scope boundary rather
//   than a half-wired cross-reference.
export type VisitorRequestStatus =
  | 'requested'
  | 'returned_for_information'
  | 'approved'
  | 'denied'
  | 'cancelled'
  | 'pass_issued'
  | 'entered'
  | 'exited'
  | 'overstay'
  | 'expired'
  | 'closed'
  | 'reopened';

// §14.1's authorised-host list.
export type VisitorHostType = 'resident' | 'day_scholar' | 'faculty' | 'staff' | 'department' | 'campus_office' | 'other';
export type VisitorCategory = 'family' | 'friend' | 'vendor' | 'official' | 'delivery' | 'other';

export interface VisitorRequest {
  id: string;
  org_id: string;
  campus_id: string;
  host_user_id: string;
  host_type: VisitorHostType;
  visitor_name: string;
  visitor_phone: string;
  visitor_photo_url: string | null;
  visitor_id_reference: string | null;
  visitor_category: VisitorCategory | null;
  purpose: string;
  requested_visit_start: Date;
  requested_visit_end: Date;
  approved_zone_scope: string | null;
  emergency_contact: string | null;
  status: VisitorRequestStatus;
  decided_by: string | null;
  decided_at: Date | null;
  decision_reason: string | null;
  credential_id: string | null;
  credential_valid_from: Date | null;
  credential_valid_until: Date | null;
  credential_hotlisted: boolean;
  credential_hotlisted_reason: string | null;
  entered_at: Date | null;
  entered_by: string | null;
  exited_at: Date | null;
  exited_by: string | null;
  closed_at: Date | null;
  closed_by: string | null;
  reopen_reason: string | null;
  cancelled_reason: string | null;
  cancelled_by: string | null;
  created_at: Date;
}

export interface ShiftHandover {
  activeVisitors: VisitorRequest[];
  expectedArrivals: VisitorRequest[];
  outstandingKeys: unknown[];
  uncollectedPackages: unknown[];
  residentsOverdue: unknown[];
}
