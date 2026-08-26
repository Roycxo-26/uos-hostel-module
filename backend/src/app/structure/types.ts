// HOSTEL-GAP-ANALYSIS.md D17.01 item 43 — four-state entity lifecycle,
// shared by hostel/block/floor/room (bed keeps its own richer operational
// enum below; 'retired' etc. don't map cleanly onto an in-use bed's
// real-time state the way they do for the structural levels above it).
export type LifecycleStatus = 'active' | 'suspended' | 'deactivated' | 'retired';

export interface Hostel {
  id: string;
  org_id: string;
  campus_id: string;
  code: string;
  name: string;
  gender_policy: 'male' | 'female' | 'co-ed';
  capacity: number;
  status: LifecycleStatus;
  // UOS HOSTEL BR.md §3 — effective-dated configuration + category/
  // accessibility policy. category_policy is an open, tenant-defined list
  // (see validators.ts), not a closed enum.
  effective_from: string | null;
  effective_to: string | null;
  category_policy: string[] | null;
  accessibility_policy: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface Block {
  id: string;
  org_id: string;
  campus_id: string;
  hostel_id: string;
  code: string;
  name: string;
  warden_user_id: string | null;
  status: LifecycleStatus;
}

export interface Floor {
  id: string;
  org_id: string;
  campus_id: string;
  block_id: string;
  number: string;
  name: string | null;
  floor_incharge_user_id: string | null;
  status: LifecycleStatus;
}

export type RoomStatus = LifecycleStatus;

export interface Room {
  id: string;
  org_id: string;
  campus_id: string;
  floor_id: string;
  code: string;
  room_type: string;
  capacity: number;
  accessibility: boolean;
  // D17.01 item 45 — split from one free-text `restrictions` field into
  // three, matching the BRD's distinct fields exactly.
  permitted_population: string | null;
  occupancy_compatibility_rule: string | null;
  safety_restriction: string | null;
  status: RoomStatus;
  // D17.01 items 46/47 — reason + review date behind a suspended/
  // deactivated/retired status, queryable rather than audit-log-only.
  status_reason: string | null;
  status_review_date: string | null;
  // D17.17 item 67 — the machine-readable category behind the reason
  // above. status='suspended' + status_reason_category='safety' is what
  // actually blocks new allocation/offer on this room.
  status_reason_category: 'safety' | 'maintenance' | 'policy' | 'other' | null;
}

export type BedStatus = 'available' | 'reserved' | 'allocated' | 'occupied' | 'blocked' | 'maintenance';

export interface Bed {
  id: string;
  org_id: string;
  campus_id: string;
  room_id: string;
  code: string;
  status: BedStatus;
  // D17.01 item 46 — same reason/review-date shape as Room above.
  status_reason: string | null;
  status_review_date: string | null;
}

// D17.01 item 44 — generic old-code -> entity resolution, one table
// covering all five hierarchy levels.
export type AliasEntityType = 'hostel' | 'block' | 'floor' | 'room' | 'bed';

export interface EntityCodeAlias {
  id: string;
  org_id: string;
  campus_id: string;
  entity_type: AliasEntityType;
  entity_id: string;
  old_code: string;
  superseded_at: Date;
}
