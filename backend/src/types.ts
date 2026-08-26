// Re-export auth types used across this module
export type { AuthUser, OrgRole, UserPermissions } from '@uos/auth';

// ─── Module-level shared types ────────────────────────────────────────────────

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}
