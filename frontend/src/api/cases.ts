import { api } from './client';
import type { Case, CaseEvidence, CaseSeverity, CaseStatus, CaseType, DecisionOutcome } from '../types';

export async function listCases(filters: { status?: CaseStatus; caseType?: CaseType } = {}) {
  const params = new URLSearchParams(filters as Record<string, string>).toString();
  const { cases } = await api.get<{ cases: Case[] }>(`/cases${params ? `?${params}` : ''}`);
  return cases;
}

export async function getCase(id: string) {
  const { case: c } = await api.get<{ case: Case }>(`/cases/${id}`);
  return c;
}

export interface ResidentDirectoryEntry {
  id: string;
  name: string;
  email: string;
}

export async function listResidentDirectory() {
  const { residents } = await api.get<{ residents: ResidentDirectoryEntry[] }>('/cases/resident-directory');
  return residents;
}

export interface CaseStaffEntry {
  id: string;
  name: string;
  email: string;
  role: string;
}

export async function listCaseStaffDirectory() {
  const { staff } = await api.get<{ staff: CaseStaffEntry[] }>('/cases/staff-directory');
  return staff;
}

export async function reportCase(input: {
  caseType: CaseType;
  category: string;
  description: string;
  roomId?: string;
  subjectUserId?: string;
  evidence?: CaseEvidence[];
  confidential?: boolean;
}) {
  const { case: c } = await api.post<{ case: Case }>('/cases', input);
  return c;
}

export async function triageCase(id: string, input: { severity: CaseSeverity; confidential?: boolean; assignedTo: string }) {
  const { case: c } = await api.post<{ case: Case }>(`/cases/${id}/triage`, input);
  return c;
}

export async function investigateCase(id: string, investigationNotes: string) {
  const { case: c } = await api.post<{ case: Case }>(`/cases/${id}/investigate`, { investigationNotes });
  return c;
}

export async function resolveCase(id: string, investigationNotes?: string) {
  const { case: c } = await api.post<{ case: Case }>(`/cases/${id}/resolve`, { investigationNotes });
  return c;
}

export async function issueNotice(id: string, noticeText: string) {
  const { case: c } = await api.post<{ case: Case }>(`/cases/${id}/issue-notice`, { noticeText });
  return c;
}

export async function decideCase(id: string, input: { decisionOutcome: DecisionOutcome; decisionReason: string }) {
  const { case: c } = await api.post<{ case: Case }>(`/cases/${id}/decide`, input);
  return c;
}

export async function appealCase(id: string, appealReason: string) {
  const { case: c } = await api.post<{ case: Case }>(`/cases/${id}/appeal`, { appealReason });
  return c;
}

export async function closeCase(id: string) {
  const { case: c } = await api.post<{ case: Case }>(`/cases/${id}/close`, {});
  return c;
}

export async function reopenCase(id: string, reopenReason: string) {
  const { case: c } = await api.post<{ case: Case }>(`/cases/${id}/reopen`, { reopenReason });
  return c;
}
