import { api } from './client';
import type { ConditionPhoto, TransferRequest, TransferStatus, TransferType } from '../types';

export async function listTransfers(status?: TransferStatus) {
  const { transfers } = await api.get<{ transfers: TransferRequest[] }>(`/transfers${status ? `?status=${status}` : ''}`);
  return transfers;
}

export async function getTransfer(id: string) {
  const { transfer } = await api.get<{ transfer: TransferRequest }>(`/transfers/${id}`);
  return transfer;
}

export async function requestTransfer(input: {
  studentId?: string;
  reason: string;
  transferType?: TransferType;
  retrospectiveReviewDeadline?: string;
  isTemporary?: boolean;
}) {
  const { transfer } = await api.post<{ transfer: TransferRequest }>('/transfers', input);
  return transfer;
}

export async function decideTransfer(id: string, input: { decision: 'approved' | 'rejected'; reason: string; newBedId?: string }) {
  const { transfer } = await api.post<{ transfer: TransferRequest }>(`/transfers/${id}/decide`, input);
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
