// HOSTEL-GAP-ANALYSIS.md D17.16 (TODO.md Batch 30, item 123). "HOSTEL -
// v.1.md" §24.4's exact outbound event catalogue. Two of the eight are
// deliberately not wired to a producer yet, named rather than silently
// missing: 'd17.visitor-meal-approved.v1' (Batch 28's visitor requests
// have no "requires a meal" concept to trigger it from) and
// 'd17.temporary-absence-updated.v1' (Batch 22's closure-case temporary
// relocations don't have one clean single point this build wires safely
// without risking that already-shipped flow).
export type OutboundEventType =
  | 'd17.occupancy-started.v1'
  | 'd17.occupancy-ended.v1'
  | 'd17.outpass-departed.v1'
  | 'd17.outpass-returned.v1'
  | 'd17.leave-approved.v1'
  | 'd17.leave-cancelled.v1'
  | 'd17.visitor-meal-approved.v1'
  | 'd17.temporary-absence-updated.v1';

export type DeliveryStatus = 'queued' | 'delivered' | 'failed';

export interface OutboxEvent {
  id: string;
  org_id: string;
  campus_id: string;
  student_id: string | null;
  event_type: OutboundEventType;
  payload: Record<string, unknown>;
  occurred_at: Date;
  delivery_status: DeliveryStatus;
  created_at: Date;
}

// §24.2's own required display states — never show a stale menu as
// current without warning.
export type MenuStatus = 'MENU_NOT_PUBLISHED' | 'STALE' | 'D18_DISCONNECTED' | 'UPDATED';

export interface MessKitchenConnectionStatus {
  menuStatus: MenuStatus;
  d18Connected: boolean;
  lastKnownMenuAt: string | null;
  note: string;
}
