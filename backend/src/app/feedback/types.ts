// HOSTEL-GAP-ANALYSIS.md D17.14 (TODO.md Batch 30, item 121). "HOSTEL -
// v.1.md" §22. See migration 20260101000048's own header comment for the
// full anonymity-mode/lifecycle-collapse reasoning — this file just
// mirrors its column names into TypeScript, plus the one pure aggregation
// helper the analytics endpoint needs (same "no db access, safe for any
// caller" shape as finance/types.ts's computeBalances and checkouts/
// types.ts's computeRoomReadiness).

export const FEEDBACK_TOPICS = [
  'room_cleanliness',
  'washroom_cleanliness',
  'floor_common_area_cleanliness',
  'housekeeping',
  'food_quality',
  'food_quantity',
  'menu_satisfaction',
  'mess_hygiene',
  'hospitality',
  'hostel_facilities',
  'warden_support',
  'security',
  'maintenance',
  'ticket_resolution',
  'visitor_front_desk_service',
  'checkin_checkout_experience',
  'overall_hostel_experience',
  'other',
] as const;

export type FeedbackTopic = (typeof FEEDBACK_TOPICS)[number];

export type FeedbackAnonymityMode = 'identified' | 'confidential' | 'anonymous' | 'aggregated_only';
export type FeedbackTargetScopeType = 'hostel' | 'floor' | 'room';
export type FeedbackCampaignStatus = 'draft' | 'open' | 'closed' | 'analysis_ready' | 'archived' | 'cancelled';
export type FeedbackServiceRecoveryStatus = 'open' | 'in_review' | 'case_created' | 'closed';

export interface FeedbackQuestion {
  key: string;
  label: string;
  questionType: 'rating' | 'text' | 'choice';
  ratingScale?: number;
  mandatory: boolean;
}

export interface FeedbackCampaign {
  id: string;
  org_id: string;
  campus_id: string;
  name: string;
  purpose: string | null;
  target_scope_type: FeedbackTargetScopeType;
  target_scope_id: string;
  topics: FeedbackTopic[];
  question_set: FeedbackQuestion[];
  anonymity_mode: FeedbackAnonymityMode;
  open_at: Date;
  close_at: Date;
  recurrence: string | null;
  minimum_response_threshold: number;
  reminder_sent: boolean;
  language: string;
  service_recovery_trigger_score: string | null;
  status: FeedbackCampaignStatus;
  created_by: string;
  cancelled_reason: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface FeedbackResponse {
  id: string;
  org_id: string;
  campus_id: string;
  campaign_id: string;
  respondent_user_id: string | null;
  submission_hash: string;
  topic: FeedbackTopic;
  answers: Record<string, unknown>;
  overall_rating: string | null;
  comment: string | null;
  flagged_for_review: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface FeedbackServiceRecoveryCase {
  id: string;
  org_id: string;
  campus_id: string;
  campaign_id: string;
  response_id: string | null;
  trigger_reason: string;
  status: FeedbackServiceRecoveryStatus;
  linked_reference_type: string | null;
  linked_reference_id: string | null;
  assigned_to: string | null;
  resolution_notes: string | null;
  closed_at: Date | null;
  created_by: string;
  created_at: Date;
  updated_at: Date;
}

export interface TopicAggregate {
  topic: string;
  responseCount: number;
  averageRating: string | null;
  suppressed: boolean;
}

/**
 * §22.4's minimum-response-threshold suppression rule, implemented as a
 * real branch rather than left as a comment: a topic only gets an average
 * once at least `threshold` responses exist for it. Below that, the topic
 * still appears (so staff can see feedback is coming in) but with
 * `suppressed: true` and no number attached — so a lone response, or two,
 * can never be singled out and reverse-identified from a small-group
 * average.
 */
export function computeTopicAggregates(responses: Pick<FeedbackResponse, 'topic' | 'overall_rating'>[], threshold: number): TopicAggregate[] {
  const byTopic = new Map<string, { count: number; sum: number; rated: number }>();
  for (const r of responses) {
    const bucket = byTopic.get(r.topic) ?? { count: 0, sum: 0, rated: 0 };
    bucket.count += 1;
    if (r.overall_rating !== null && r.overall_rating !== undefined) {
      bucket.sum += Number(r.overall_rating);
      bucket.rated += 1;
    }
    byTopic.set(r.topic, bucket);
  }

  return Array.from(byTopic.entries())
    .map(([topic, bucket]) => {
      const suppressed = bucket.count < threshold;
      return {
        topic,
        responseCount: bucket.count,
        averageRating: !suppressed && bucket.rated > 0 ? (bucket.sum / bucket.rated).toFixed(2) : null,
        suppressed,
      };
    })
    .sort((a, b) => a.topic.localeCompare(b.topic));
}
