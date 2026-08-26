import { api } from './client';
import type { AcknowledgementType, CheckIn, CheckInInventoryItem, ConditionPhoto } from '../types';

export async function createCheckIn(input: {
  allocationId: string;
  undertakingAccepted: boolean;
  acknowledgementType?: AcknowledgementType;
  officerNotes?: string;
  residentNotes?: string;
  conditionPhotos?: ConditionPhoto[];
  items?: CheckInInventoryItem[];
  overrideSafetyCritical?: boolean;
  overrideReason?: string;
}) {
  const { checkin } = await api.post<{ checkin: CheckIn }>('/checkins', input);
  return checkin;
}

export async function getCheckInByAllocation(allocationId: string) {
  const { checkin } = await api.get<{ checkin: CheckIn | null }>(`/checkins/by-allocation/${allocationId}`);
  return checkin;
}
