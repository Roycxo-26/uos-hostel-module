import { api } from './client';

export type FeedbackAnonymityMode = 'identified' | 'confidential' | 'anonymous' | 'aggregated_only';
export type FeedbackTargetScopeType = 'hostel' | 'floor' | 'room';
export type FeedbackCampaignStatus = 'draft' | 'open' | 'closed' | 'analysis_ready' | 'archived' | 'cancelled';
export type FeedbackServiceRecoveryStatus = 'open' | 'in_review' | 'case_created' | 'closed';

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

export interface FeedbackQuestion {
  key: string;
  label: string;
  questionType: 'rating' | 'text' | 'choice';
  ratingScale?: number;
  mandatory: boolean;
}

export interface FeedbackCampaign {
  id: string;
  name: string;
  purpose: string | null;
  targetScopeType: FeedbackTargetScopeType;
  targetScopeId: string;
  topics: FeedbackTopic[];
  questionSet: FeedbackQuestion[];
  anonymityMode: FeedbackAnonymityMode;
  openAt: string;
  closeAt: string;
  recurrence: string | null;
  minimumResponseThreshold: number;
  reminderSent: boolean;
  language: string;
  serviceRecoveryTriggerScore: string | null;
  status: FeedbackCampaignStatus;
  cancelledReason: string | null;
  createdAt: string;
}

export interface FeedbackResponse {
  id: string;
  campaignId: string;
  respondentUserId: string | null;
  topic: FeedbackTopic;
  answers: Record<string, unknown>;
  overallRating: string | null;
  comment: string | null;
  flaggedForReview: boolean;
  createdAt: string;
}

export interface FeedbackServiceRecoveryCase {
  id: string;
  campaignId: string;
  responseId: string | null;
  triggerReason: string;
  status: FeedbackServiceRecoveryStatus;
  linkedReferenceType: string | null;
  linkedReferenceId: string | null;
  assignedTo: string | null;
  resolutionNotes: string | null;
  closedAt: string | null;
  createdAt: string;
}

export interface TopicAggregate {
  topic: string;
  responseCount: number;
  averageRating: string | null;
  suppressed: boolean;
}

export async function createCampaign(input: {
  name: string;
  purpose?: string;
  targetScopeType: FeedbackTargetScopeType;
  targetScopeId: string;
  topics: FeedbackTopic[];
  questionSet: FeedbackQuestion[];
  anonymityMode: FeedbackAnonymityMode;
  openAt: string;
  closeAt: string;
  minimumResponseThreshold?: number;
  serviceRecoveryTriggerScore?: number;
}) {
  const { campaign } = await api.post<{ campaign: FeedbackCampaign }>('/feedback/campaigns', input);
  return campaign;
}

export async function listCampaigns(status?: string) {
  const { campaigns } = await api.get<{ campaigns: FeedbackCampaign[] }>(`/feedback/campaigns${status ? `?status=${status}` : ''}`);
  return campaigns;
}

export async function listOpenCampaignsForMe() {
  const { campaigns } = await api.get<{ campaigns: FeedbackCampaign[] }>('/feedback/campaigns/open');
  return campaigns;
}

export async function getCampaign(id: string) {
  const { campaign } = await api.get<{ campaign: FeedbackCampaign }>(`/feedback/campaigns/${id}`);
  return campaign;
}

export async function openCampaign(id: string) {
  const { campaign } = await api.post<{ campaign: FeedbackCampaign }>(`/feedback/campaigns/${id}/open`, {});
  return campaign;
}

export async function closeCampaign(id: string) {
  const { campaign } = await api.post<{ campaign: FeedbackCampaign }>(`/feedback/campaigns/${id}/close`, {});
  return campaign;
}

export async function cancelCampaign(id: string, reason: string) {
  const { campaign } = await api.post<{ campaign: FeedbackCampaign }>(`/feedback/campaigns/${id}/cancel`, { reason });
  return campaign;
}

export async function markAnalysisReady(id: string) {
  const { campaign } = await api.post<{ campaign: FeedbackCampaign }>(`/feedback/campaigns/${id}/analysis-ready`, {});
  return campaign;
}

export async function archiveCampaign(id: string) {
  const { campaign } = await api.post<{ campaign: FeedbackCampaign }>(`/feedback/campaigns/${id}/archive`, {});
  return campaign;
}

export async function submitResponse(campaignId: string, input: { topic: FeedbackTopic; answers?: Record<string, unknown>; overallRating?: number; comment?: string }) {
  const { response } = await api.post<{ response: FeedbackResponse }>(`/feedback/campaigns/${campaignId}/responses`, input);
  return response;
}

export async function listResponses(campaignId: string) {
  const { responses } = await api.get<{ responses: FeedbackResponse[] }>(`/feedback/campaigns/${campaignId}/responses`);
  return responses;
}

export async function getAnalytics(campaignId: string) {
  return api.get<{ totalResponses: number; topics: TopicAggregate[] }>(`/feedback/campaigns/${campaignId}/analytics`);
}

export async function revealIdentity(responseId: string) {
  return api.post<{ respondentUserId: string }>(`/feedback/responses/${responseId}/reveal-identity`, {});
}

export async function createServiceRecoveryCase(input: { campaignId: string; responseId?: string; triggerReason: string }) {
  const { case: recoveryCase } = await api.post<{ case: FeedbackServiceRecoveryCase }>('/feedback/cases', input);
  return recoveryCase;
}

export async function listServiceRecoveryCases(filters: { status?: string; campaignId?: string } = {}) {
  const params = new URLSearchParams(Object.entries(filters).filter(([, v]) => v) as [string, string][]).toString();
  const { cases } = await api.get<{ cases: FeedbackServiceRecoveryCase[] }>(`/feedback/cases${params ? `?${params}` : ''}`);
  return cases;
}

export async function getServiceRecoveryCase(id: string) {
  const { case: recoveryCase } = await api.get<{ case: FeedbackServiceRecoveryCase }>(`/feedback/cases/${id}`);
  return recoveryCase;
}

export async function updateServiceRecoveryCase(
  id: string,
  input: { status?: FeedbackServiceRecoveryStatus; linkedReferenceType?: string; linkedReferenceId?: string; assignedTo?: string; resolutionNotes?: string }
) {
  const { case: recoveryCase } = await api.patch<{ case: FeedbackServiceRecoveryCase }>(`/feedback/cases/${id}`, input);
  return recoveryCase;
}
