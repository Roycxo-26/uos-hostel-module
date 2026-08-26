export type ApplicationStatus =
  | 'draft'
  | 'submitted'
  | 'under_review'
  | 'returned'
  | 'waitlisted'
  | 'rejected'
  | 'allocation_ready'
  | 'allocated'
  | 'closed'
  | 'cancelled'
  // D17.02 item 51
  | 'withdrawn'
  | 'reopened';

// D17.02 item 49 — ten BRD application types (HOSTEL V1.1.md §10.1),
// replacing the single implicit "generic application" every submission
// used to be.
export type ApplicationType =
  | 'new_term'
  | 'renewal'
  | 'mid_term'
  | 'short_stay'
  | 'emergency'
  | 'visiting'
  | 'staff'
  | 'accessibility_request'
  | 'hostel_transfer'
  | 'off_campus_placement';

// D17.02 item 50 — the seven-value BRD eligibility outcome (§10.5),
// additive alongside `status`, not a replacement for it.
export type EligibilityOutcome =
  | 'eligible'
  | 'conditionally_eligible'
  | 'waiting_for_evidence'
  | 'source_verification_pending'
  | 'ineligible_reconsiderable'
  | 'ineligible_final'
  | 'exception_review_required';

// §10.5's conditional-eligibility object.
export interface EligibilityConditions {
  condition: string;
  responsibleParty?: string;
  dueDate?: string;
  expiry?: string;
  effectIfUnmet?: string;
  evidenceRequirement?: string;
}

export interface ApplicationAttachment {
  name: string;
  url: string;
  uploadedAt?: string;
}

export interface HostelApplication {
  id: string;
  org_id: string;
  campus_id: string;
  student_id: string;
  term: string;
  application_type: ApplicationType;
  preferences: Record<string, unknown>;
  attachments: ApplicationAttachment[];
  status: ApplicationStatus;
  decision_reason: string | null;
  decided_by: string | null;
  decided_at: Date | null;
  eligibility_outcome: EligibilityOutcome | null;
  eligibility_conditions: EligibilityConditions | null;
  reopen_reason: string | null;
  renewal_of_allocation_id: string | null;
  created_at: Date;
}
