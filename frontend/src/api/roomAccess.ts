import { api } from './client';
import type {
  CustodyType,
  KeyScopeType,
  MasterKeyLog,
  PropertyCustody,
  RoomEntry,
  RoomEntryPurpose,
  SecurityEvidenceReference,
} from '../types';

// --- Room entries ---

export async function requestEntry(input: {
  roomId: string;
  purpose: RoomEntryPurpose;
  plannedWindowStart?: string;
  plannedWindowEnd?: string;
  emergencyBypassReason?: string;
  noticeGiven?: boolean;
  witnessUserId?: string;
  workReference?: string;
}) {
  const { entry } = await api.post<{ entry: RoomEntry }>('/room-access/entries', input);
  return entry;
}

export async function listEntries(filters?: { roomId?: string; status?: string }) {
  const params = new URLSearchParams();
  if (filters?.roomId) params.set('roomId', filters.roomId);
  if (filters?.status) params.set('status', filters.status);
  const qs = params.toString();
  const { entries } = await api.get<{ entries: RoomEntry[] }>(`/room-access/entries${qs ? `?${qs}` : ''}`);
  return entries;
}

export async function approveEntry(id: string, consentGiven?: boolean) {
  const { entry } = await api.post<{ entry: RoomEntry }>(`/room-access/entries/${id}/approve`, { consentGiven });
  return entry;
}

export async function markNotified(id: string) {
  const { entry } = await api.post<{ entry: RoomEntry }>(`/room-access/entries/${id}/notify`, {});
  return entry;
}

export async function recordEntry(id: string, evidenceNotes?: string) {
  const { entry } = await api.post<{ entry: RoomEntry }>(`/room-access/entries/${id}/enter`, { evidenceNotes });
  return entry;
}

export async function recordExit(id: string, evidenceNotes?: string) {
  const { entry } = await api.post<{ entry: RoomEntry }>(`/room-access/entries/${id}/exit`, { evidenceNotes });
  return entry;
}

export async function cancelEntry(id: string, reason: string) {
  const { entry } = await api.post<{ entry: RoomEntry }>(`/room-access/entries/${id}/cancel`, { reason });
  return entry;
}

// --- Master key ---

export async function issueKey(input: {
  keyIdentifier: string;
  scopeType: KeyScopeType;
  scopeId: string;
  issuedTo: string;
  purpose?: string;
  expectedReturnAt: string;
}) {
  const { key } = await api.post<{ key: MasterKeyLog }>('/room-access/keys', input);
  return key;
}

export async function listKeyLogs(filters?: { status?: string; keyIdentifier?: string }) {
  const params = new URLSearchParams();
  if (filters?.status) params.set('status', filters.status);
  if (filters?.keyIdentifier) params.set('keyIdentifier', filters.keyIdentifier);
  const qs = params.toString();
  const { keys } = await api.get<{ keys: MasterKeyLog[] }>(`/room-access/keys${qs ? `?${qs}` : ''}`);
  return keys;
}

export async function returnKey(id: string) {
  const { key } = await api.post<{ key: MasterKeyLog }>(`/room-access/keys/${id}/return`, {});
  return key;
}

export async function reportKeyLost(id: string, reason: string) {
  const { key } = await api.post<{ key: MasterKeyLog }>(`/room-access/keys/${id}/lost`, { reason });
  return key;
}

// --- Property custody ---

export async function recordCustody(input: {
  custodyType: CustodyType;
  itemDescription: string;
  studentId?: string;
  foundLocation?: string;
  conditionNotes?: string;
  storageLocation?: string;
  retentionUntil?: string;
}) {
  const { custody } = await api.post<{ custody: PropertyCustody }>('/room-access/custody', input);
  return custody;
}

export async function listCustody(filters?: { status?: string; studentId?: string }) {
  const params = new URLSearchParams();
  if (filters?.status) params.set('status', filters.status);
  if (filters?.studentId) params.set('studentId', filters.studentId);
  const qs = params.toString();
  const { custody } = await api.get<{ custody: PropertyCustody[] }>(`/room-access/custody${qs ? `?${qs}` : ''}`);
  return custody;
}

export async function addNoticeAttempt(id: string, note: string) {
  const { custody } = await api.post<{ custody: PropertyCustody }>(`/room-access/custody/${id}/notice`, { note });
  return custody;
}

export async function releaseCustody(id: string, releasedTo: string, claimantUserId?: string) {
  const { custody } = await api.post<{ custody: PropertyCustody }>(`/room-access/custody/${id}/release`, { releasedTo, claimantUserId });
  return custody;
}

export async function transferCustodyToSecurity(id: string, notes?: string) {
  const { custody } = await api.post<{ custody: PropertyCustody }>(`/room-access/custody/${id}/transfer-to-security`, { notes });
  return custody;
}

export async function disposeCustody(id: string, reason: string) {
  const { custody } = await api.post<{ custody: PropertyCustody }>(`/room-access/custody/${id}/dispose`, { reason });
  return custody;
}

// --- Security evidence references ---

export async function createEvidenceReference(input: {
  referenceId: string;
  timeRangeStart?: string;
  timeRangeEnd?: string;
  caseReference?: string;
  notes?: string;
}) {
  const { reference } = await api.post<{ reference: SecurityEvidenceReference }>('/room-access/evidence-references', input);
  return reference;
}

export async function listEvidenceReferences() {
  const { references } = await api.get<{ references: SecurityEvidenceReference[] }>('/room-access/evidence-references');
  return references;
}
