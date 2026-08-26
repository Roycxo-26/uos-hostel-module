import { z } from 'zod';

// UOS HOSTEL BR.md §10 Check-In Console: "room condition, keys/items,
// photos" — photos were the one field missing (text notes already existed).
// Same stopgap reference-array pattern as applications/validators.ts's
// attachments, not real file storage.
const conditionPhotoSchema = z.object({
  url: z.string().trim().url().max(2000),
  caption: z.string().trim().max(200).optional(),
});

// HOSTEL-GAP-ANALYSIS.md D17.04 item 59 — one structured line per handed-
// over item, replacing the single free-text notes field.
const inventoryItemSchema = z.object({
  itemName: z.string().trim().min(1).max(100),
  itemCategory: z.enum(['furniture', 'appliance', 'key', 'fixture', 'other']).default('other'),
  quantity: z.number().int().positive().default(1),
  condition: z.enum(['good', 'fair', 'damaged', 'missing']).default('good'),
  // item 62 — only meaningful when condition isn't 'good'; service.ts
  // enforces that pairing (same conditional-requirement tradeoff as
  // structure/validators.ts's updateRoomStatusSchema, rather than a
  // `.refine()` duplicated across every per-item entry here).
  defectSeverity: z.enum(['cosmetic', 'service_impacting', 'safety_critical']).optional(),
  photoUrl: z.string().trim().url().max(2000).optional(),
  officerNotes: z.string().trim().max(500).optional(),
  // Per-item resident response — distinct from the whole-checkin
  // acknowledgementType below (item 60): a resident can accept-with-
  // comments overall while still disputing one specific item.
  residentResponse: z.enum(['accept', 'dispute']).default('accept'),
  residentNotes: z.string().trim().max(500).optional(),
});

export const createCheckInSchema = z.object({
  allocationId: z.string().uuid(),
  undertakingAccepted: z
    .boolean()
    .refine((v) => v === true, { message: 'Resident must accept the hostel undertaking to check in' }),
  // D17.04 item 60 — the five distinct BRD responses, replacing the single
  // pass/fail checkbox for the room-handover decision specifically
  // (undertakingAccepted above is the separate hostel-rules undertaking).
  acknowledgementType: z.enum(['accept_all', 'accept_with_comments', 'dispute_selected_item', 'refuse_handover', 'request_alternate_room']).default('accept_all'),
  officerNotes: z.string().trim().max(1000).optional(),
  residentNotes: z.string().trim().max(1000).optional(),
  conditionPhotos: z.array(conditionPhotoSchema).max(20).default([]),
  items: z.array(inventoryItemSchema).max(50).default([]),
  // item 62 — required only when at least one item is 'safety_critical';
  // service.ts enforces the pairing (see inventoryItemSchema's own note).
  overrideSafetyCritical: z.boolean().default(false),
  overrideReason: z.string().trim().min(1).max(500).optional(),
});
