import { api } from './client';
import type { NoticeAcknowledgement, NoticeScopeType, NoticeSeverity, OperationalNotice, ResidentEmergencyCard } from '../types';

export async function publishNotice(input: {
  scopeType: NoticeScopeType;
  scopeId: string;
  title: string;
  body?: string;
  severity?: NoticeSeverity;
  requiresAcknowledgement?: boolean;
  supersedesNoticeId?: string;
}) {
  const { notice } = await api.post<{ notice: OperationalNotice }>('/operational-notices', input);
  return notice;
}

export async function listNotices() {
  const { notices } = await api.get<{ notices: OperationalNotice[] }>('/operational-notices');
  return notices;
}

export async function getNotice(id: string) {
  return api.get<OperationalNotice & { acknowledgements?: NoticeAcknowledgement[]; unacknowledgedCount?: number }>(`/operational-notices/${id}`);
}

export async function acknowledgeNotice(id: string) {
  const { acknowledgement } = await api.post<{ acknowledgement: NoticeAcknowledgement }>(`/operational-notices/${id}/acknowledge`, {});
  return acknowledgement;
}

export async function listMyNotices() {
  const { notices } = await api.get<{ notices: NoticeAcknowledgement[] }>('/operational-notices/mine');
  return notices;
}

export async function getResidentEmergencyCard(studentId: string) {
  return api.get<ResidentEmergencyCard>(`/operational-notices/emergency-card/${studentId}`);
}
