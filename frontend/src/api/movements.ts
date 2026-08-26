import { api } from './client';
import type { MovementRequest, MovementStatus, MovementType } from '../types';

export async function listMovements(status?: MovementStatus) {
  const { movements } = await api.get<{ movements: MovementRequest[] }>(`/movements${status ? `?status=${status}` : ''}`);
  return movements;
}

export async function requestMovement(input: {
  movementType: MovementType;
  destination: string;
  purpose: string;
  requestedOut: string;
  requestedReturn: string;
}) {
  const { movement } = await api.post<{ movement: MovementRequest }>('/movements', input);
  return movement;
}

export async function decideMovement(id: string, input: { decision: 'approved' | 'rejected'; reason: string }) {
  const { movement } = await api.post<{ movement: MovementRequest }>(`/movements/${id}/decide`, input);
  return movement;
}

export async function cancelMovement(id: string, reason: string) {
  const { movement } = await api.post<{ movement: MovementRequest }>(`/movements/${id}/cancel`, { reason });
  return movement;
}

export async function recordExit(id: string) {
  const { movement } = await api.post<{ movement: MovementRequest }>(`/movements/${id}/record-exit`, {});
  return movement;
}

export async function recordReturn(id: string) {
  const { movement } = await api.post<{ movement: MovementRequest }>(`/movements/${id}/record-return`, {});
  return movement;
}
