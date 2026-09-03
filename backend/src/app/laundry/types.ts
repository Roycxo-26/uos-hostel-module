// HOSTEL-GAP-ANALYSIS.md D17.23 (TODO.md Batch 30, item 124). "HOSTEL
// V1.1.md" §24G / D17-LAW-41.

export type LaundryServiceType =
  | 'linen_exchange'
  | 'garment_laundry'
  | 'scheduled_floor_pickup'
  | 'drop_counter'
  | 'token_bag'
  | 'self_service_washer'
  | 'outsourced_vendor'
  | 'emergency_linen_replacement'
  | 'paid_premium';

export type LaundryOrderStatus =
  | 'requested'
  | 'accepted'
  | 'picked_up'
  | 'in_process'
  | 'ready_for_return'
  | 'returned'
  | 'resident_acknowledged'
  | 'closed'
  | 'count_dispute'
  | 'lost_item'
  | 'damaged_item'
  | 'unclaimed_return'
  | 'cancelled'
  | 'reopened';

export interface LaundryOrder {
  id: string;
  org_id: string;
  campus_id: string;
  student_id: string;
  service_type: LaundryServiceType;
  pickup_drop_location: string | null;
  bag_token_id: string | null;
  status: LaundryOrderStatus;
  requested_pickup_at: Date | null;
  actual_pickup_at: Date | null;
  pickup_count: number | null;
  pickup_weight: string | null;
  item_categories: string[] | null;
  condition_exceptions_at_handoff: string | null;
  provider_reference: string | null;
  sla_hours: number;
  sla_breached_at: Date | null;
  returned_count: number | null;
  returned_condition_notes: string | null;
  returned_at: Date | null;
  resident_acknowledged_at: Date | null;
  exception_reason: string | null;
  resolved_by: string | null;
  resolved_at: Date | null;
  resolution_notes: string | null;
  charge_entitlement_reference: string | null;
  complaint_reference: string | null;
  cancelled_reason: string | null;
  reopen_reason: string | null;
  created_by: string;
  created_at: Date;
}
