import { api } from './client';
import type {
  CommonArea,
  CommonAreaType,
  OutageScopeType,
  OutageSeverity,
  OutageType,
  PestControlTreatment,
  PestScopeType,
  SanitationInspection,
  UtilityOutage,
} from '../types';

// --- Common areas ---

export async function createCommonArea(input: { hostelId: string; floorId?: string; areaType: CommonAreaType; name: string; openingHours?: string; capacity?: number }) {
  const { area } = await api.post<{ area: CommonArea }>('/common-areas/areas', input);
  return area;
}

export async function listCommonAreas(filters?: { hostelId?: string }) {
  const qs = filters?.hostelId ? `?hostelId=${filters.hostelId}` : '';
  const { areas } = await api.get<{ areas: CommonArea[] }>(`/common-areas/areas${qs}`);
  return areas;
}

export async function getCommonArea(id: string) {
  const { area } = await api.get<{ area: CommonArea }>(`/common-areas/areas/${id}`);
  return area;
}

export async function updateCommonAreaStatus(id: string, status: 'operational' | 'closed' | 'under_maintenance', reason?: string) {
  const { area } = await api.patch<{ area: CommonArea }>(`/common-areas/areas/${id}/status`, { status, reason });
  return area;
}

// --- Sanitation inspections ---

export async function recordInspection(input: {
  commonAreaId: string;
  cleanlinessScore: number;
  odourVentilationOk?: boolean;
  waterAvailabilityOk?: boolean;
  drainageOk?: boolean;
  lightingOk?: boolean;
  accessibilityOk?: boolean;
  privacyLatchOk?: boolean;
  pestIndicator?: boolean;
  correctiveActionNeeded?: boolean;
  correctiveActionNotes?: string;
  safetyHazardNotes?: string;
}) {
  const { inspection } = await api.post<{ inspection: SanitationInspection }>('/common-areas/inspections', input);
  return inspection;
}

// --- Utility outages ---

export async function reportOutage(input: {
  hostelId: string;
  scopeType: OutageScopeType;
  scopeId: string;
  outageType: OutageType;
  severity: OutageSeverity;
  estimatedRestorationAt?: string;
  alternativeArrangement?: string;
}) {
  const { outage } = await api.post<{ outage: UtilityOutage }>('/common-areas/outages', input);
  return outage;
}

export async function listOutages(filters?: { hostelId?: string; status?: string }) {
  const params = new URLSearchParams();
  if (filters?.hostelId) params.set('hostelId', filters.hostelId);
  if (filters?.status) params.set('status', filters.status);
  const qs = params.toString();
  const { outages } = await api.get<{ outages: UtilityOutage[] }>(`/common-areas/outages${qs ? `?${qs}` : ''}`);
  return outages;
}

export async function getOutage(id: string) {
  const { outage } = await api.get<{ outage: UtilityOutage }>(`/common-areas/outages/${id}`);
  return outage;
}

export async function updateOutageEta(id: string, estimatedRestorationAt: string) {
  const { outage } = await api.patch<{ outage: UtilityOutage }>(`/common-areas/outages/${id}/eta`, { estimatedRestorationAt });
  return outage;
}

export async function setAlternativeArrangement(id: string, alternativeArrangement: string) {
  const { outage } = await api.post<{ outage: UtilityOutage }>(`/common-areas/outages/${id}/alternative-arrangement`, { alternativeArrangement });
  return outage;
}

export async function restoreOutage(id: string) {
  const { outage } = await api.post<{ outage: UtilityOutage }>(`/common-areas/outages/${id}/restore`, {});
  return outage;
}

export async function verifyOutage(id: string, notes?: string) {
  const { outage } = await api.post<{ outage: UtilityOutage }>(`/common-areas/outages/${id}/verify`, { notes });
  return outage;
}

export async function closeOutage(id: string, notes?: string) {
  const { outage } = await api.post<{ outage: UtilityOutage }>(`/common-areas/outages/${id}/close`, { notes });
  return outage;
}

// --- Pest control ---

export async function reportPestFinding(input: { scopeType: PestScopeType; scopeId: string; findingNotes: string }) {
  const { treatment } = await api.post<{ treatment: PestControlTreatment }>('/common-areas/pest-treatments', input);
  return treatment;
}

export async function listPestTreatments(filters?: { status?: string }) {
  const qs = filters?.status ? `?status=${filters.status}` : '';
  const { treatments } = await api.get<{ treatments: PestControlTreatment[] }>(`/common-areas/pest-treatments${qs}`);
  return treatments;
}

export async function schedulePestTreatment(id: string, input: { scheduledAt: string; treatmentMethod?: string; chemicalReference?: string }) {
  const { treatment } = await api.post<{ treatment: PestControlTreatment }>(`/common-areas/pest-treatments/${id}/schedule`, input);
  return treatment;
}

export async function notifyResidentsForPest(id: string) {
  const { treatment } = await api.post<{ treatment: PestControlTreatment }>(`/common-areas/pest-treatments/${id}/notify-residents`, {});
  return treatment;
}

export async function recordPestTreatment(id: string, reEntrySafeAt?: string) {
  const { treatment } = await api.post<{ treatment: PestControlTreatment }>(`/common-areas/pest-treatments/${id}/treat`, { reEntrySafeAt });
  return treatment;
}

export async function reinspectPest(id: string, result: string, passed: boolean) {
  const { treatment } = await api.post<{ treatment: PestControlTreatment }>(`/common-areas/pest-treatments/${id}/reinspect`, { result, passed });
  return treatment;
}
