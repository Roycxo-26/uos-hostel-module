type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

const toneClasses: Record<Tone, string> = {
  neutral: 'bg-slate-100 text-slate-700',
  info: 'bg-sky-50 text-sky-700',
  success: 'bg-emerald-50 text-emerald-700',
  warning: 'bg-amber-50 text-amber-800',
  danger: 'bg-rose-50 text-rose-700',
};

// One lookup for every status value across the app, keyed exactly as the
// API returns it (flow.md §6 state machines). Centralising this is what
// keeps "awaiting_check_in" from silently drifting into three different
// colours across three different screens over time.
const STATUS_MAP: Record<string, { label: string; tone: Tone }> = {
  // Hostel application (flow.md §9)
  draft: { label: 'Draft', tone: 'neutral' },
  submitted: { label: 'Submitted', tone: 'info' },
  under_review: { label: 'Under Review', tone: 'info' },
  returned: { label: 'Returned for Correction', tone: 'warning' },
  waitlisted: { label: 'Waitlisted', tone: 'warning' },
  rejected: { label: 'Rejected', tone: 'danger' },
  allocation_ready: { label: 'Allocation Ready', tone: 'info' },
  allocated: { label: 'Allocated', tone: 'success' },
  closed: { label: 'Closed', tone: 'neutral' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },

  // Allocation (flow.md §6.2)
  proposed: { label: 'Proposed', tone: 'info' },
  bed_locked: { label: 'Bed Locked', tone: 'info' },
  confirmed: { label: 'Confirmed', tone: 'info' },
  awaiting_check_in: { label: 'Awaiting Check-In', tone: 'warning' },
  checked_in_active: { label: 'Active Resident', tone: 'success' },
  no_show_review: { label: 'No-Show Review', tone: 'danger' },
  released: { label: 'Released', tone: 'neutral' },
  extended_hold: { label: 'Extended Hold', tone: 'warning' },
  transfer_pending: { label: 'Transfer Pending', tone: 'warning' },
  checkout_pending: { label: 'Checkout Pending', tone: 'warning' },
  ended: { label: 'Ended', tone: 'neutral' },

  // Bed (flow.md §6.1)
  available: { label: 'Available', tone: 'success' },
  reserved: { label: 'Reserved', tone: 'info' },
  occupied: { label: 'Occupied', tone: 'neutral' },
  blocked: { label: 'Blocked', tone: 'danger' },
  maintenance: { label: 'Maintenance', tone: 'warning' },

  // Hostel/Block/Floor/Room lifecycle (HOSTEL-GAP-ANALYSIS.md D17.01 item 43
  // — four states shared across all four structural levels; 'inactive' kept
  // for any stale cached data, not written anywhere new).
  active: { label: 'Active', tone: 'success' },
  inactive: { label: 'Inactive', tone: 'neutral' },
  suspended: { label: 'Suspended', tone: 'warning' },
  deactivated: { label: 'Deactivated', tone: 'neutral' },
  retired: { label: 'Retired', tone: 'danger' },

  // Transfer request (UOS HOSTEL BR.md §7) — 'rejected'/'cancelled' reuse
  // the application status entries above.
  requested: { label: 'Requested', tone: 'info' },
  approved: { label: 'Approved', tone: 'info' },
  completed: { label: 'Completed', tone: 'success' },

  // Movement request (UOS HOSTEL BR.md §8) — 'approved'/'rejected'/
  // 'cancelled' reuse entries above. 'returned' collides with the
  // Application status of the same name ("Returned for Correction") above —
  // a real ambiguity (TypeScript's duplicate-key check caught it, not a
  // style nitpick), resolved via the optional `domain` prop below rather
  // than picking one meaning and silently breaking the other.
  out: { label: 'Out', tone: 'info' },
  'movement:returned': { label: 'Returned', tone: 'success' },
  overdue: { label: 'Overdue', tone: 'danger' },

  // Headcount entry (UOS HOSTEL BR.md §8) — the exact four BR categories.
  present: { label: 'Present', tone: 'success' },
  approved_out: { label: 'Approved Out', tone: 'info' },
  missing: { label: 'Missing', tone: 'danger' },
  unknown: { label: 'Unknown', tone: 'warning' },

  // Headcount session
  open: { label: 'Open', tone: 'info' },

  // Case: Complaint/Incident/Discipline (UOS HOSTEL BR.md §9) —
  // 'closed'/'cancelled' reuse entries above.
  reported: { label: 'Reported', tone: 'info' },
  assigned: { label: 'Assigned', tone: 'info' },
  in_progress: { label: 'In Progress', tone: 'warning' },
  resolved: { label: 'Resolved', tone: 'success' },
  notice_issued: { label: 'Notice Issued', tone: 'warning' },
  decided: { label: 'Decided', tone: 'info' },
  appealed: { label: 'Appealed', tone: 'warning' },
  reopened: { label: 'Reopened', tone: 'danger' },

  // Checkout (UOS HOSTEL BR.md §10) — 'requested'/'completed'/'cancelled'
  // reuse entries above.
  inspected: { label: 'Inspected', tone: 'warning' },

  // D17.17 Safety status (HOSTEL-GAP-ANALYSIS.md, TODO.md Batch 16) —
  // tone-coded so a critical finding actually reads as urgent, not just
  // humanized text in the same neutral grey as everything else.
  NOT_ASSESSED: { label: 'Not Assessed', tone: 'neutral' },
  COMPLIANT_CURRENT: { label: 'Compliant — Current', tone: 'success' },
  INSPECTION_DUE: { label: 'Inspection Due', tone: 'warning' },
  FINDING_OPEN_NON_CRITICAL: { label: 'Finding Open (Non-Critical)', tone: 'warning' },
  FINDING_OPEN_CRITICAL: { label: 'Finding Open (Critical)', tone: 'danger' },
  SAFETY_RESTRICTION_ACTIVE: { label: 'Safety Restriction Active', tone: 'danger' },
  EVACUATION_READINESS_DEGRADED: { label: 'Evacuation Readiness Degraded', tone: 'danger' },
  CERTIFICATE_EXPIRED_OR_UNKNOWN: { label: 'Certificate Expired/Unknown', tone: 'warning' },
  MANUAL_VERIFICATION_REQUIRED: { label: 'Manual Verification Required', tone: 'warning' },
  CLOSED_FOR_SAFETY: { label: 'Closed For Safety', tone: 'danger' },

  // Evacuation drill / emergency muster
  planned: { label: 'Planned', tone: 'neutral' },
  coverage_validated: { label: 'Coverage Validated', tone: 'info' },
  notified: { label: 'Notified', tone: 'info' },
  accounted_for: { label: 'Accounted For', tone: 'success' },
  unresolved: { label: 'Unresolved', tone: 'danger' },
  excused_on_leave: { label: 'Excused (On Leave)', tone: 'neutral' },

  // Occupancy verification presence (HOSTEL-GAP-ANALYSIS.md D17.18,
  // TODO.md Batch 17) — 'observed'/'not_observed' distinct from Headcount's
  // 'present'/'missing' since this is a walk-and-check, not a roll call.
  observed: { label: 'Observed', tone: 'success' },
  not_observed: { label: 'Not Observed', tone: 'warning' },
  refused: { label: 'Refused', tone: 'danger' },
  unavailable: { label: 'Unavailable', tone: 'neutral' },

  // Room entry (D17.20, TODO.md Batch 18) — 'requested'/'approved'/
  // 'completed'/'cancelled' reuse entries above.
  entered: { label: 'Entered', tone: 'warning' },

  // Master key log — domain-scoped ('key:...') because plain 'returned'
  // already means "Returned for Correction" for an Application above; a
  // bare STATUS_MAP['returned'] lookup would show the wrong label here.
  'key:issued': { label: 'Issued', tone: 'warning' },
  'key:returned': { label: 'Returned', tone: 'success' },
  'key:overdue': { label: 'Overdue', tone: 'danger' },
  'key:lost': { label: 'Lost', tone: 'danger' },

  // Property custody — 'released' above already fits (neutral, generic);
  // the rest are domain-scoped for the same collision-avoidance reason.
  'custody:in_custody': { label: 'In Custody', tone: 'warning' },
  'custody:claimed': { label: 'Claimed', tone: 'success' },
  'custody:released': { label: 'Released', tone: 'success' },
  'custody:transferred_to_security': { label: 'Transferred to Security', tone: 'info' },
  'custody:disposed': { label: 'Disposed', tone: 'neutral' },

  // Legal hold status
  hold: { label: 'Legal Hold', tone: 'danger' },

  // Common areas / utility outages / pest control (D17.19, TODO.md
  // Batch 19) — everything else in these three lifecycles reads fine
  // through the humanize() fallback below; these are the ones worth a
  // deliberate tone.
  operational: { label: 'Operational', tone: 'success' },
  under_maintenance: { label: 'Under Maintenance', tone: 'warning' },
  restored: { label: 'Restored', tone: 'success' },
  verified: { label: 'Verified', tone: 'success' },
};

function humanize(status: string): string {
  return status
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function StatusPill({ status, domain }: { status: string; domain?: 'movement' | 'key' | 'custody' }) {
  const entry = (domain && STATUS_MAP[`${domain}:${status}`]) || STATUS_MAP[status] || { label: humanize(status), tone: 'neutral' as Tone };
  return (
    <span
      className={[
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        toneClasses[entry.tone],
      ].join(' ')}
    >
      {entry.label}
    </span>
  );
}
