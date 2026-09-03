import { api } from './client';
import type { OffCampusPlacement, OffCampusPlacementType, OffCampusProvider } from '../types';

// --- Providers -----------------------------------------------------------------

export async function createProvider(input: {
  providerName: string;
  address: string;
  emergencyContact?: string;
  safetyInspectionReference?: string;
  defaultContractReference?: string;
}) {
  const { provider } = await api.post<{ provider: OffCampusProvider }>('/off-campus/providers', input);
  return provider;
}

export async function listProviders(filters: { complianceStatus?: string } = {}) {
  const params = new URLSearchParams(Object.entries(filters).filter(([, v]) => v) as [string, string][]).toString();
  const { providers } = await api.get<{ providers: OffCampusProvider[] }>(`/off-campus/providers${params ? `?${params}` : ''}`);
  return providers;
}

export async function decideProviderCompliance(id: string, decision: 'approved' | 'rejected' | 'suspended', reason: string) {
  const { provider } = await api.post<{ provider: OffCampusProvider }>(`/off-campus/providers/${id}/decide-compliance`, { decision, reason });
  return provider;
}

// --- Placements ------------------------------------------------------------------

export async function requestPlacement(input: {
  studentId?: string;
  providerId: string;
  placementType: OffCampusPlacementType;
  startDate: string;
  endDate: string;
  roomBedReference?: string;
  contractReference?: string;
  paymentOwnerReference?: string;
}) {
  const { placement } = await api.post<{ placement: OffCampusPlacement }>('/off-campus/placements', input);
  return placement;
}

export async function listPlacements(filters: { status?: string; studentId?: string; providerId?: string } = {}) {
  const params = new URLSearchParams(Object.entries(filters).filter(([, v]) => v) as [string, string][]).toString();
  const { placements } = await api.get<{ placements: OffCampusPlacement[] }>(`/off-campus/placements${params ? `?${params}` : ''}`);
  return placements;
}

export async function getPlacement(id: string) {
  const { placement } = await api.get<{ placement: OffCampusPlacement }>(`/off-campus/placements/${id}`);
  return placement;
}

export async function decidePlacement(id: string, decision: 'approved' | 'rejected', reason: string) {
  const { placement } = await api.post<{ placement: OffCampusPlacement }>(`/off-campus/placements/${id}/decide`, { decision, reason });
  return placement;
}

export async function confirmOccupancy(id: string) {
  const { placement } = await api.post<{ placement: OffCampusPlacement }>(`/off-campus/placements/${id}/confirm-occupancy`, {});
  return placement;
}

export async function requestExit(id: string, reason: string) {
  const { placement } = await api.post<{ placement: OffCampusPlacement }>(`/off-campus/placements/${id}/request-exit`, { reason });
  return placement;
}

export async function confirmExit(id: string, exitNotes?: string) {
  const { placement } = await api.post<{ placement: OffCampusPlacement }>(`/off-campus/placements/${id}/confirm-exit`, { exitNotes });
  return placement;
}

export async function cancelPlacement(id: string, reason: string) {
  const { placement } = await api.post<{ placement: OffCampusPlacement }>(`/off-campus/placements/${id}/cancel`, { reason });
  return placement;
}

export async function linkIssueHandoff(id: string, issueHandoffReference: string) {
  const { placement } = await api.post<{ placement: OffCampusPlacement }>(`/off-campus/placements/${id}/link-issue`, { issueHandoffReference });
  return placement;
}
