import { z } from 'zod';

export const publishNoticeSchema = z.object({
  scopeType: z.enum(['room', 'floor', 'hostel']),
  scopeId: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().max(2000).optional(),
  severity: z.enum(['normal', 'critical']).default('normal'),
  requiresAcknowledgement: z.boolean().default(false),
  // When set, this publish is an urgent update to an earlier notice —
  // the old one gets `superseded_by` pointed at this new one, never
  // deleted or edited in place (LAW-33's own wording).
  supersedesNoticeId: z.string().uuid().optional(),
});

export const acknowledgeNoticeSchema = z.object({});
