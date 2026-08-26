import { z } from 'zod';

export const createExampleSchema = z.object({
  title: z.string().min(1).max(200),
});

export const updateExampleSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  is_active: z.boolean().optional(),
});

export const idParamSchema = z.object({
  id: z.string().uuid(),
});
