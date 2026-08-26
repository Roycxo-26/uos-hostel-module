// Re-export auth types used across this module
export type { AuthUser, OrgRole, UserPermissions } from '@uos/auth';

// ─── Module-level shared types ────────────────────────────────────────────────
// Add types shared across multiple features in this module here.

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}
