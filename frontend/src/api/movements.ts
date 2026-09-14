import { api } from './client';
import type {
  MovementExtensionRequest,
  MovementGuardianConfirmation,
  MovementRequest,
  MovementRequestDetail,
  MovementStatus,
  MovementType,
  ResidentGuardian,
} from '../types';

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
  guardianId: string;
}) {
  const { movement } = await api.post<{ movement: MovementRequest }>('/movements', input);
  return movement;
}

export async function getMovement(id: string) {
  const { movement } = await api.get<{ movement: MovementRequestDetail }>(`/movements/${id}`);
  return movement;
}

export async function decideMovement(id: string, input: { decision: 'approved' | 'rejected'; reason: string; bypassGuardianConfirmation?: boolean }) {
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

// D17.10 item 94 — the Gate console's own minimal-disclosure queue.
export async function listGateQueue() {
  const { movements } = await api.get<{ movements: MovementRequest[] }>('/movements/gate-queue');
  return movements;
}

// --- D17.10 item 90 — guardians ---------------------------------------------

export async function listMyGuardians() {
  const { guardians } = await api.get<{ guardians: ResidentGuardian[] }>('/movements/guardians');
  return guardians;
}

export async function addGuardian(input: { name: string; relationship: string; mobileNumber: string; isPrimary?: boolean }) {
  const { guardian } = await api.post<{ guardian: ResidentGuardian }>('/movements/guardians', input);
  return guardian;
}

// Real gap found live via SELF-TEST-GUIDE.md Batch 23 — staff had no way
// to discover a guardian to verify at all; nothing on the page called
// this even though it was fully built.
export async function listAllGuardians(filters?: { verified?: boolean }) {
  const qs = filters?.verified !== undefined ? `?verified=${filters.verified}` : '';
  const { guardians } = await api.get<{ guardians: ResidentGuardian[] }>(`/movements/guardians/all${qs}`);
  return guardians;
}

export async function verifyGuardian(guardianId: string) {
  const { guardian } = await api.post<{ guardian: ResidentGuardian }>(`/movements/guardians/${guardianId}/verify`, {});
  return guardian;
}

export async function getGuardian(guardianId: string) {
  const { guardian } = await api.get<{ guardian: ResidentGuardian }>(`/movements/guardians/${guardianId}`);
  return guardian;
}

// --- D17.10 item 90 — guardian confirmation ---------------------------------

export async function verifyGuardianOtp(movementId: string, code: string) {
  const { confirmation } = await api.post<{ confirmation: MovementGuardianConfirmation }>(`/movements/${movementId}/guardian-otp/verify`, { code });
  return confirmation;
}

export async function resendGuardianOtp(movementId: string) {
  const { confirmation } = await api.post<{ confirmation: MovementGuardianConfirmation }>(`/movements/${movementId}/guardian-otp/resend`, {});
  return confirmation;
}

export async function recordGuardianCallConfirmation(
  movementId: string,
  input: { guardianId: string; outcome: 'approve' | 'decline' | 'no_response'; remark: string }
) {
  const { confirmation } = await api.post<{ confirmation: MovementGuardianConfirmation }>(`/movements/${movementId}/guardian-call-confirmation`, input);
  return confirmation;
}

// --- D17.10 item 93 — extensions ---------------------------------------------

export async function requestExtension(movementId: string, input: { requestedNewReturn: string; reason: string }) {
  const { extension } = await api.post<{ extension: MovementExtensionRequest }>(`/movements/${movementId}/extensions`, input);
  return extension;
}

export async function decideExtension(extensionId: string, input: { decision: 'approved' | 'rejected'; reason: string }) {
  const { extension } = await api.post<{ extension: MovementExtensionRequest }>(`/movements/extensions/${extensionId}/decide`, input);
  return extension;
}
