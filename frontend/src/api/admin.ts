import { api } from './client';
import type { AdminUserRole, HostelRole } from '../types';

// Required @uos/auth admin endpoints (backend/src/app/admin) — org_admin
// only. Not wired into a dedicated UI page yet (see project README "What's
// next"); the standalone dev seed assigns test-persona roles directly for
// now. Exposed here so that page is a small addition later, not a rewrite.

export function listAdminUsers() {
  return api.get<AdminUserRole[]>('/api/admin/users');
}

export function getAdminUser(userId: string) {
  return api.get<AdminUserRole[]>(`/api/admin/users/${userId}`);
}

export function grantHostelRole(userId: string, input: { role: HostelRole; campusId: string }) {
  return api.post<AdminUserRole[]>(`/api/admin/users/${userId}/roles`, input);
}

export function revokeHostelRole(userId: string, role: HostelRole, campusId?: string) {
  return api.delete<AdminUserRole[]>(`/api/admin/users/${userId}/roles/${role}${campusId ? `?campusId=${campusId}` : ''}`);
}
