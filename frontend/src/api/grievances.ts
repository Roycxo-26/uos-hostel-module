import { api } from './client';
import type { Grievance, GrievanceScope, MyRights, PolicyAcknowledgement, PolicyVersion } from '../types';

export async function raiseGrievance(input: { scope: GrievanceScope; description: string; subjectUserId?: string }) {
  const { grievance } = await api.post<{ grievance: Grievance }>('/grievances', input);
  return grievance;
}

export async function listGrievances(status?: string) {
  const { grievances } = await api.get<{ grievances: Grievance[] }>(`/grievances${status ? `?status=${status}` : ''}`);
  return grievances;
}

export async function getGrievance(id: string) {
  const { grievance } = await api.get<{ grievance: Grievance }>(`/grievances/${id}`);
  return grievance;
}

export async function assignReviewer(id: string, reviewerId: string) {
  const { grievance } = await api.post<{ grievance: Grievance }>(`/grievances/${id}/assign`, { reviewerId });
  return grievance;
}

export async function returnForInformation(id: string, notes: string) {
  const { grievance } = await api.post<{ grievance: Grievance }>(`/grievances/${id}/return-for-information`, { notes });
  return grievance;
}

export async function respondToInformationRequest(id: string, response: string) {
  const { grievance } = await api.post<{ grievance: Grievance }>(`/grievances/${id}/respond`, { response });
  return grievance;
}

export async function issueDecision(id: string, decisionReason: string, remedyNotes?: string) {
  const { grievance } = await api.post<{ grievance: Grievance }>(`/grievances/${id}/decide`, { decisionReason, remedyNotes });
  return grievance;
}

export async function submitAppeal(id: string, appealReason: string) {
  const { grievance } = await api.post<{ grievance: Grievance }>(`/grievances/${id}/appeal`, { appealReason });
  return grievance;
}

export async function assignIndependentReviewer(id: string, reviewerId: string) {
  const { grievance } = await api.post<{ grievance: Grievance }>(`/grievances/${id}/assign-independent-reviewer`, { reviewerId });
  return grievance;
}

export async function issueFinalDecision(id: string, reason: string) {
  const { grievance } = await api.post<{ grievance: Grievance }>(`/grievances/${id}/final-decision`, { reason });
  return grievance;
}

export async function resolveGrievance(id: string, remediationNotes?: string) {
  const { grievance } = await api.post<{ grievance: Grievance }>(`/grievances/${id}/resolve`, { remediationNotes });
  return grievance;
}

export async function closeGrievance(id: string) {
  const { grievance } = await api.post<{ grievance: Grievance }>(`/grievances/${id}/close`, {});
  return grievance;
}

export async function reopenGrievance(id: string, reason: string) {
  const { grievance } = await api.post<{ grievance: Grievance }>(`/grievances/${id}/reopen`, { reason });
  return grievance;
}

export async function withdrawGrievance(id: string) {
  const { grievance } = await api.post<{ grievance: Grievance }>(`/grievances/${id}/withdraw`, {});
  return grievance;
}

// --- Policy versions / acknowledgement / rights ---

export async function publishPolicyVersion(input: { documentKey: string; version: string; title: string; mandatory?: boolean; reAckDeadline?: string }) {
  const { version } = await api.post<{ version: PolicyVersion }>('/grievances/policy-versions', input);
  return version;
}

export async function listPolicyVersions() {
  const { versions } = await api.get<{ versions: PolicyVersion[] }>('/grievances/policy-versions');
  return versions;
}

export async function acknowledgePolicy(versionId: string) {
  const { acknowledgement } = await api.post<{ acknowledgement: PolicyAcknowledgement }>(`/grievances/policy-versions/${versionId}/acknowledge`, {});
  return acknowledgement;
}

export async function declinePolicy(versionId: string, reason: string) {
  const { acknowledgement } = await api.post<{ acknowledgement: PolicyAcknowledgement }>(`/grievances/policy-versions/${versionId}/decline`, { reason });
  return acknowledgement;
}

export async function getMyRights() {
  return api.get<MyRights>('/grievances/my-rights');
}
