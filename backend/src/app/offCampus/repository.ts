import { db } from '../../db';

// --- Providers ---------------------------------------------------------------

export function createProvider(data: Record<string, unknown>) {
  return db('off_campus_providers').insert(data).returning('*').then((rows) => rows[0]);
}

export function findProviderById(id: string) {
  return db('off_campus_providers').where({ id }).first();
}

export function updateProvider(id: string, data: Record<string, unknown>) {
  return db('off_campus_providers')
    .where({ id })
    .update({ ...data, updated_at: db.fn.now() })
    .returning('*')
    .then((rows) => rows[0]);
}

export function listProviders(filters: { complianceStatus?: string }) {
  const query = db('off_campus_providers').orderBy('created_at', 'desc');
  if (filters.complianceStatus) query.andWhere({ compliance_status: filters.complianceStatus });
  return query;
}

// --- Placements ----------------------------------------------------------------

export function createPlacement(data: Record<string, unknown>) {
  return db('off_campus_placements').insert(data).returning('*').then((rows) => rows[0]);
}

export function findPlacementById(id: string) {
  return db('off_campus_placements').where({ id }).first();
}

export function updatePlacement(id: string, data: Record<string, unknown>) {
  return db('off_campus_placements')
    .where({ id })
    .update({ ...data, updated_at: db.fn.now() })
    .returning('*')
    .then((rows) => rows[0]);
}

export function listPlacements(filters: { status?: string; studentId?: string; providerId?: string }) {
  const query = db('off_campus_placements').orderBy('created_at', 'desc');
  if (filters.status) query.andWhere({ status: filters.status });
  if (filters.studentId) query.andWhere({ student_id: filters.studentId });
  if (filters.providerId) query.andWhere({ provider_id: filters.providerId });
  return query;
}
