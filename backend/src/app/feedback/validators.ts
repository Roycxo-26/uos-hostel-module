import { z } from 'zod';
import { FEEDBACK_TOPICS } from './types';

const topicEnum = z.enum(FEEDBACK_TOPICS);

const questionSchema = z.object({
  key: z.string().trim().min(1).max(60),
  label: z.string().trim().min(1).max(300),
  questionType: z.enum(['rating', 'text', 'choice']),
  ratingScale: z.number().int().min(2).max(10).optional(),
  mandatory: z.boolean(),
});

export const createCampaignSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    purpose: z.string().trim().max(1000).optional(),
    targetScopeType: z.enum(['hostel', 'floor', 'room']),
    targetScopeId: z.string().uuid(),
    topics: z.array(topicEnum).min(1),
    questionSet: z.array(questionSchema).min(1),
    anonymityMode: z.enum(['identified', 'confidential', 'anonymous', 'aggregated_only']),
    openAt: z.coerce.date(),
    closeAt: z.coerce.date(),
    recurrence: z.string().trim().max(100).optional(),
    // §22.3: a campaign may set its own, overriding the tenant-wide
    // policyDefaults.feedbackMinimumResponseThreshold default.
    minimumResponseThreshold: z.number().int().min(1).optional(),
    language: z.string().trim().max(10).optional(),
    serviceRecoveryTriggerScore: z.number().min(0).max(10).optional(),
  })
  .refine((v) => v.closeAt > v.openAt, { message: 'The closing time must be after the opening time.', path: ['closeAt'] });

export const cancelCampaignSchema = z.object({
  reason: z.string().trim().min(1).max(500),
});

export const submitResponseSchema = z.object({
  topic: topicEnum,
  answers: z.record(z.unknown()).optional(),
  overallRating: z.number().min(0).max(10).optional(),
  comment: z.string().trim().max(2000).optional(),
});

export const createServiceRecoveryCaseSchema = z.object({
  campaignId: z.string().uuid(),
  responseId: z.string().uuid().optional(),
  triggerReason: z.string().trim().min(1).max(1000),
});

export const updateServiceRecoveryCaseSchema = z.object({
  status: z.enum(['in_review', 'case_created', 'closed']).optional(),
  linkedReferenceType: z.string().trim().max(30).optional(),
  linkedReferenceId: z.string().uuid().optional(),
  assignedTo: z.string().uuid().optional(),
  resolutionNotes: z.string().trim().max(2000).optional(),
});

export const listCampaignsQuerySchema = z.object({
  status: z.enum(['draft', 'open', 'closed', 'analysis_ready', 'archived', 'cancelled']).optional(),
});

export const listCasesQuerySchema = z.object({
  status: z.enum(['open', 'in_review', 'case_created', 'closed']).optional(),
  campaignId: z.string().uuid().optional(),
});
