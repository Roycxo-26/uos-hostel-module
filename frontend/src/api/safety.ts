import { api } from './client';
import type { EvacuationDrill, Hostel, SafetyProfile, SafetyStatus } from '../types';

// D17.17 items 63/64.
export async function updateSafetyStatus(
  hostelId: string,
  input: { status: SafetyStatus; owner: string; dataAsOf: string; profile?: SafetyProfile }
) {
  const { hostel } = await api.patch<{ hostel: Hostel }>(`/safety/hostels/${hostelId}/status`, input);
  return hostel;
}

// D17.17 items 65/66.
export async function planDrill(input: { hostelId: string; scopeType: 'room' | 'floor' | 'hostel'; scopeId: string; plannedDate: string; assemblyPoints?: string[] }) {
  const { drill } = await api.post<{ drill: EvacuationDrill }>('/safety/drills', input);
  return drill;
}

export async function triggerEmergencyMuster(input: { hostelId: string; scopeType: 'room' | 'floor' | 'hostel'; scopeId: string }) {
  const { drill } = await api.post<{ drill: EvacuationDrill }>('/safety/drills/emergency', input);
  return drill;
}

export async function listDrills(filters?: { hostelId?: string; status?: string }) {
  const params = new URLSearchParams();
  if (filters?.hostelId) params.set('hostelId', filters.hostelId);
  if (filters?.status) params.set('status', filters.status);
  const qs = params.toString();
  const { drills } = await api.get<{ drills: EvacuationDrill[] }>(`/safety/drills${qs ? `?${qs}` : ''}`);
  return drills;
}

export async function getDrill(id: string) {
  const { drill } = await api.get<{ drill: EvacuationDrill }>(`/safety/drills/${id}`);
  return drill;
}

export async function validateCoverage(id: string) {
  const { drill } = await api.post<{ drill: EvacuationDrill }>(`/safety/drills/${id}/validate-coverage`, {});
  return drill;
}

export async function startDrill(id: string) {
  const { drill } = await api.post<{ drill: EvacuationDrill }>(`/safety/drills/${id}/start`, {});
  return drill;
}

export async function markDrillEntry(id: string, studentId: string, status: 'accounted_for' | 'unresolved', note?: string) {
  return api.post(`/safety/drills/${id}/entries`, { studentId, status, note });
}

export async function completeDrill(id: string, findings?: string) {
  const { drill } = await api.post<{ drill: EvacuationDrill }>(`/safety/drills/${id}/complete`, { findings });
  return drill;
}

export async function cancelDrill(id: string, reason: string) {
  const { drill } = await api.post<{ drill: EvacuationDrill }>(`/safety/drills/${id}/cancel`, { reason });
  return drill;
}
