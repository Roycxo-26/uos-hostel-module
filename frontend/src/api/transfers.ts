import { api } from './client';
import type { ChangeCategory, ConditionPhoto, DestinationCampus, TransferRequest, TransferStatus, TransferType } from '../types';

export async function listTransfers(status?: TransferStatus) {
  const { transfers } = await api.get<{ transfers: TransferRequest[] }>(`/transfers${status ? `?status=${status}` : ''}`);
  return transfers;
}

export async function getTransfer(id: string) {
  const { transfer } = await api.get<{ transfer: TransferRequest }>(`/transfers/${id}`);
  return transfer;
}

// D17.07 item 101 — every other campus in the org, for the destination
// picker on a cross-campus transfer request.
export async function listDestinationCampuses() {
  const { campuses } = await api.get<{ campuses: DestinationCampus[] }>('/transfers/campuses');
  return campuses;
}

export async function requestTransfer(input: {
  studentId?: string;
  reason: string;
  transferType?: TransferType;
  retrospectiveReviewDeadline?: string;
  isTemporary?: boolean;
  changeCategory?: ChangeCategory;
  destinationCampusId?: string;
}) {
  const { transfer } = await api.post<{ transfer: TransferRequest }>('/transfers', input);
  return transfer;
}

export async function decideTransfer(id: string, input: { decision: 'approved' | 'rejected'; reason: string; newBedId?: string }) {
  const { transfer } = await api.post<{ transfer: TransferRequest }>(`/transfers/${id}/decide`, input);
  return transfer;
}

// D17.07 item 101 — the destination campus's own acceptance step.
export async function acceptDestinationTransfer(id: string, credentialRemappingNotes?: string) {
  const { transfer } = await api.post<{ transfer: TransferRequest }>(`/transfers/${id}/accept-destination`, { credentialRemappingNotes });
  return transfer;
}

export async function executeTransfer(
  id: string,
  input: {
    undertakingAccepted: boolean;
    conditionNotes?: string;
    conditionPhotos?: ConditionPhoto[];
    oldRoomInspectionNotes?: string;
    oldBedOutcome: 'available' | 'blocked';
  }
) {
  const { transfer } = await api.post<{ transfer: TransferRequest }>(`/transfers/${id}/execute`, input);
  return transfer;
}

export async function cancelTransfer(id: string, reason: string) {
  const { transfer } = await api.post<{ transfer: TransferRequest }>(`/transfers/${id}/cancel`, { reason });
  return transfer;
}
