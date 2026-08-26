import { api } from './client';
import type {
  ApplicationAttachment,
  ApplicationStatus,
  ApplicationType,
  EligibilityConditions,
  EligibilityOutcome,
  HostelApplication,
} from '../types';

export async function listApplications(status?: ApplicationStatus) {
  const { applications } = await api.get<{ applications: HostelApplication[] }>(`/applications${status ? `?status=${status}` : ''}`);
  return applications;
}

export async function getApplication(id: string) {
  const { application } = await api.get<{ application: HostelApplication }>(`/applications/${id}`);
  return application;
}

export async function submitApplication(input: {
  term: string;
  applicationType?: ApplicationType;
  renewalOfAllocationId?: string;
  preferences?: Record<string, string>;
  attachments?: ApplicationAttachment[];
}) {
  const { application } = await api.post<{ application: HostelApplication }>('/applications', input);
  return application;
}

export async function decideApplication(
  id: string,
  input: {
    decision: 'approved' | 'waitlisted' | 'rejected' | 'returned';
    reason?: string;
    eligibilityOutcome?: EligibilityOutcome;
    eligibilityConditions?: EligibilityConditions;
  }
) {
  const { application } = await api.post<{ application: HostelApplication }>(`/applications/${id}/decide`, input);
  return application;
}

// UOS HOSTEL BR.md §6: RETURNED -> resubmit loop.
export async function resubmitApplication(
  id: string,
  input: { preferences?: HostelApplication['preferences']; attachments?: ApplicationAttachment[] }
) {
  const { application } = await api.post<{ application: HostelApplication }>(`/applications/${id}/resubmit`, input);
  return application;
}

// D17.02 item 51.
export async function withdrawApplication(id: string, reason?: string) {
  const { application } = await api.post<{ application: HostelApplication }>(`/applications/${id}/withdraw`, { reason });
  return application;
}

export async function cancelApplication(id: string, reason: string) {
  const { application } = await api.post<{ application: HostelApplication }>(`/applications/${id}/cancel`, { reason });
  return application;
}

export async function reopenApplication(id: string, reason: string) {
  const { application } = await api.post<{ application: HostelApplication }>(`/applications/${id}/reopen`, { reason });
  return application;
}
