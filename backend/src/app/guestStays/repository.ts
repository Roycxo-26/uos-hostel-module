import { db } from '../../db';

export function findBed(bedId: string) {
  return db('beds').where({ id: bedId }).first();
}

export function updateBedStatus(bedId: string, status: string) {
  return db('beds').where({ id: bedId }).update({ status, updated_at: db.fn.now() });
}

export function create(data: Record<string, unknown>) {
  return db('guest_stays').insert(data).returning('*').then((rows) => rows[0]);
}

export function findById(id: string) {
  return db('guest_stays').where({ id }).first();
}

export function update(id: string, data: Record<string, unknown>) {
  return db('guest_stays')
    .where({ id })
    .update({ ...data, updated_at: db.fn.now() })
    .returning('*')
    .then((rows) => rows[0]);
}

export function list(filters: { status?: string; bedId?: string }) {
  const query = db('guest_stays').orderBy('created_at', 'desc');
  if (filters.status) query.andWhere({ status: filters.status });
  if (filters.bedId) query.andWhere({ bed_id: filters.bedId });
  return query;
}
