// D17.05 (TODO.md Batch 27, items 108-110).

export type FinancialEventType = 'hostel_fee' | 'deposit' | 'mess_fee_reference' | 'lost_key_charge' | 'late_fee' | 'damage_charge' | 'waiver' | 'refund';
export type FinancialEventStatus = 'proposed' | 'finance_confirmed' | 'disputed' | 'reversed';
export type FinancialEventSource = 'hostel_manual' | 'finance_authoritative';

export interface FinancialEvent {
  id: string;
  org_id: string;
  campus_id: string;
  student_id: string;
  event_type: FinancialEventType;
  amount: string;
  status: FinancialEventStatus;
  source: FinancialEventSource;
  description: string;
  evidence_notes: string | null;
  linked_reference_type: string | null;
  linked_reference_id: string | null;
  disputed: boolean;
  dispute_reason: string | null;
  raised_by: string;
  raised_at: Date;
  confirmed_by: string | null;
  confirmed_at: Date | null;
  reversed_by: string | null;
  reversed_at: Date | null;
  reversal_reason: string | null;
  created_at: Date;
}

// item 108 — charges add to what a resident owes; credits reduce it.
// mess_fee_reference is informational only (Mess owns that fee, per BR.md
// §2's own module ownership table) — it never counts toward Hostel's own
// projected balance.
export const CHARGE_EVENT_TYPES: readonly FinancialEventType[] = ['hostel_fee', 'deposit', 'lost_key_charge', 'late_fee', 'damage_charge'];
export const CREDIT_EVENT_TYPES: readonly FinancialEventType[] = ['waiver', 'refund'];

export interface FinancialSummary {
  studentId: string;
  // Finance-authoritative — only events this tenant's own confirm action
  // (or, eventually, a real Finance integration) has actually confirmed.
  confirmedBalance: string;
  // Hostel's own proposal, not yet Finance-confirmed — a projection, per
  // item 108's own name, not a number anyone should treat as owed.
  pendingProjection: string;
  hasUnresolvedDispute: boolean;
  events: FinancialEvent[];
}

/** Pure — no db access — so it's safe for another module's service.ts to
 * import directly (this codebase's rule is "no service.ts imports another
 * module's service.ts", not its types.ts). checkouts/service.ts's
 * getCheckout uses this to show a resident's real balance next to the
 * finance_cleared toggle, item 109's "replacing Checkout's single
 * undifferentiated boolean" — see TODO.md Batch 27's own write-up for why
 * finance_cleared itself stays the operational gate rather than being
 * deleted outright. */
export function computeBalances(events: FinancialEvent[]): { confirmedBalance: string; pendingProjection: string; hasUnresolvedDispute: boolean } {
  let confirmedBalance = 0;
  let pendingProjection = 0;
  let hasUnresolvedDispute = false;

  for (const event of events) {
    const amount = Number(event.amount);
    const sign = CHARGE_EVENT_TYPES.includes(event.event_type) ? 1 : CREDIT_EVENT_TYPES.includes(event.event_type) ? -1 : 0;
    if (event.status === 'finance_confirmed') {
      confirmedBalance += sign * amount;
    } else if (event.status === 'proposed' || event.status === 'disputed') {
      pendingProjection += sign * amount;
      if (event.disputed) hasUnresolvedDispute = true;
    }
  }

  return { confirmedBalance: confirmedBalance.toFixed(2), pendingProjection: pendingProjection.toFixed(2), hasUnresolvedDispute };
}
