import { z } from 'zod';

// Roles this module actually has permissions seeded for — see
// database/seeds/001_hostel_permissions.ts. Kept as an explicit list rather
// than z.string() so a typo in an admin request fails validation instead of
// silently creating an unusable role assignment.
export const HOSTEL_ROLES = ['head_warden', 'warden', 'student'] as const;

export const grantRoleSchema = z.object({
  role: z.enum(HOSTEL_ROLES),
  campusId: z.string().uuid(),
});
