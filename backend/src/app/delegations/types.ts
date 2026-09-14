// UOS_Final.docx audit (12 Sep 2026), section 6.4 — the missing create/
// list/revoke surface for hostel.approver_delegations (migration 11,
// TODO.md Batch 2). The table and the checking side (utils/
// approvalResolution.ts's authorizeApproval) already existed and were
// already consumed by 6 modules; nothing could ever actually put a row in
// the table. This module is that missing surface.

export type DelegatableRole = 'warden' | 'head_warden';

export interface ApproverDelegation {
  id: string;
  campusId: string;
  role: DelegatableRole;
  delegateUserId: string;
  effectiveFrom: string;
  effectiveTo: string;
  reason: string;
  createdBy: string;
  active: boolean;
  exclusions: string[];
  revokedAt: string | null;
  revokedBy: string | null;
  revokedReason: string | null;
  createdAt: string;
  updatedAt: string;
}
