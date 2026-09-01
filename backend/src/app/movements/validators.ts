import { z } from 'zod';

const MOVEMENT_TYPES = [
  'gate_pass',
  'leave',
  'night_out',
  'weekend_leave',
  'vacation_leave',
  'academic_field_visit',
  'official_university_movement',
  'medical_leave',
  'emergency_leave',
  'extended_leave',
  'late_return_extension',
  'mass_holiday_leave',
] as const;

export const requestMovementSchema = z
  .object({
    movementType: z.enum(MOVEMENT_TYPES).default('gate_pass'),
    destination: z.string().trim().min(1).max(200),
    purpose: z.string().trim().min(1).max(500),
    requestedOut: z.string().datetime(),
    requestedReturn: z.string().datetime(),
    // Required by policy ("guardian confirmation will be mandatory by
    // default for every Hostel outpass, night-out and leave request") — a
    // student must have registered at least one verified guardian first
    // (see addGuardianSchema below) before they can request movement at all.
    guardianId: z.string().uuid(),
  })
  .refine((v) => new Date(v.requestedReturn) > new Date(v.requestedOut), {
    message: 'requestedReturn must be after requestedOut',
    path: ['requestedReturn'],
  });

export const decideMovementSchema = z.object({
  decision: z.enum(['approved', 'rejected']),
  reason: z.string().trim().min(1).max(500),
  // Only meaningful (and only honoured) for movementType='emergency_leave' —
  // see service.ts's decideMovement for the actual gate.
  bypassGuardianConfirmation: z.boolean().optional(),
});

export const cancelMovementSchema = z.object({
  reason: z.string().trim().min(1).max(500),
});

// BR §8: "Gate records exit/entry" — no free-text body needed, the actor
// and timestamp are captured server-side (see service.ts), matching how
// checkins/service.ts records checked_in_by/checked_in_at.
export const recordExitSchema = z.object({}).strict();
export const recordReturnSchema = z.object({}).strict();

export const listMovementsQuerySchema = z.object({
  status: z.enum(['requested', 'approved', 'rejected', 'cancelled', 'out', 'returned', 'overdue']).optional(),
});

// --- D17.10 item 90 — guardian contacts and confirmation -------------------

export const addGuardianSchema = z.object({
  name: z.string().trim().min(1).max(200),
  relationship: z.string().trim().min(1).max(50),
  mobileNumber: z
    .string()
    .trim()
    .regex(/^\+?[0-9]{7,15}$/, 'Expected a plain phone number, 7-15 digits, optional leading +'),
  isPrimary: z.boolean().optional(),
});

// Staff-only — policy: "Only authorised Warden / Head Warden can record
// call confirmation" applies just as much to verifying a guardian contact
// itself as to using it during an outpass.
export const verifyGuardianSchema = z.object({}).strict();

export const verifyOtpSchema = z.object({
  code: z.string().trim().regex(/^\d{6}$/, 'Expected a 6-digit code'),
});

export const recordCallConfirmationSchema = z.object({
  guardianId: z.string().uuid(),
  outcome: z.enum(['approve', 'decline']),
  // Mandatory per policy: "Mandatory remark/reason."
  remark: z.string().trim().min(1).max(1000),
});

// --- D17.10 item 93 — extension requests ------------------------------------

export const requestExtensionSchema = z.object({
  requestedNewReturn: z.string().datetime(),
  reason: z.string().trim().min(1).max(500),
});

export const decideExtensionSchema = z.object({
  decision: z.enum(['approved', 'rejected']),
  reason: z.string().trim().min(1).max(500),
});
