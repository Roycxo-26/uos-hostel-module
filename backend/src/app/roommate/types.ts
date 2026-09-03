// HOSTEL-GAP-ANALYSIS.md D17.26 (TODO.md Batch 30, item 126). "HOSTEL
// V1.1.md" §24J / D17-LAW-37.

export type RoommateRequestStatus = 'pending' | 'accepted' | 'declined' | 'expired' | 'revoked';

export interface RoommateRequest {
  id: string;
  org_id: string;
  campus_id: string;
  requesting_student_id: string;
  requested_student_id: string;
  term: string;
  message: string | null;
  status: RoommateRequestStatus;
  expires_at: Date;
  responded_at: Date | null;
  decline_reason: string | null;
  revoked_by: string | null;
  revoked_at: Date | null;
  created_at: Date;
}

/** §24J.4: "Matching does not expose one resident's raw answers to
 * another" — the compatibility recommendation surfaced to staff is
 * deliberately this shape and nothing richer: the fact of a mutual
 * accepted match, never either resident's own preference answers. */
export interface CompatibilityRecommendation {
  hasMutualMatch: boolean;
  roommateRequestId: string | null;
  otherStudentId: string | null;
  term: string | null;
}
