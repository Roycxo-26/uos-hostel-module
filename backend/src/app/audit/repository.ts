import { db } from '../../db';

export function list(filters: { entityType?: string; action?: string; limit?: number }) {
  const query = db('audit_log')
    .orderBy('created_at', 'desc')
    .limit(Math.min(filters.limit ?? 100, 200)); // BR §16: "reports must show as_of, filters" — bounded, not an unlimited export
  if (filters.entityType) query.andWhere({ entity_type: filters.entityType });
  if (filters.action) query.andWhere({ action: filters.action });
  return query;
}
