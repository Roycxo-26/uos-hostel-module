import { db } from '../../db';

export function createNotice(data: Record<string, unknown>) {
  return db('operational_notices').insert(data).returning('*').then((rows) => rows[0]);
}

export function findNoticeById(id: string) {
  return db('operational_notices').where({ id }).first();
}

export function updateNotice(id: string, data: Record<string, unknown>) {
  return db('operational_notices')
    .where({ id })
    .update({ ...data, updated_at: db.fn.now() })
    .returning('*')
    .then((rows) => rows[0]);
}

export function listNotices(filters: { scopeType?: string; scopeId?: string }) {
  const query = db('operational_notices').orderBy('published_at', 'desc');
  if (filters.scopeType) query.andWhere({ scope_type: filters.scopeType });
  if (filters.scopeId) query.andWhere({ scope_id: filters.scopeId });
  return query;
}

export function createAcknowledgement(data: Record<string, unknown>) {
  return db('operational_notice_acknowledgements').insert(data).returning('*').then((rows) => rows[0]);
}

export function findAcknowledgement(noticeId: string, studentId: string) {
  return db('operational_notice_acknowledgements').where({ notice_id: noticeId, student_id: studentId }).first();
}

export function updateAcknowledgement(id: string, data: Record<string, unknown>) {
  return db('operational_notice_acknowledgements')
    .where({ id })
    .update({ ...data, updated_at: db.fn.now() })
    .returning('*')
    .then((rows) => rows[0]);
}

export function listAcknowledgementsForNotice(noticeId: string) {
  return db('operational_notice_acknowledgements').where({ notice_id: noticeId });
}

/** The BRD's own "unread/failed delivery appears in an exception queue"
 * rule — every delivered-but-not-yet-acknowledged row for a notice that
 * actually requires one. */
export function listUnacknowledged(noticeId: string) {
  return db('operational_notice_acknowledgements').where({ notice_id: noticeId }).whereNull('acknowledged_at');
}

export function listAcknowledgementsForStudent(studentId: string) {
  return db('operational_notice_acknowledgements').where({ student_id: studentId });
}

/** Same room/floor/hostel occupant join this session's other new modules
 * each carry their own copy of — see utils/notify.ts's
 * notifyOccupantsInScope for the consolidated version used for plain
 * notifications; this module needs the actual student ids (not just a
 * notify loop) to create one acknowledgement row per resident. */
export function listOccupantsInScope(scopeType: 'room' | 'floor' | 'hostel', scopeId: string) {
  const base = db('allocations').join('beds', 'beds.id', 'allocations.bed_id').where('allocations.status', 'checked_in_active');
  if (scopeType === 'room') {
    return base.andWhere('beds.room_id', scopeId).select('allocations.student_id');
  }
  if (scopeType === 'floor') {
    return base.join('rooms', 'rooms.id', 'beds.room_id').andWhere('rooms.floor_id', scopeId).select('allocations.student_id');
  }
  return base
    .join('rooms', 'rooms.id', 'beds.room_id')
    .join('floors', 'floors.id', 'rooms.floor_id')
    .join('blocks', 'blocks.id', 'floors.block_id')
    .andWhere('blocks.hostel_id', scopeId)
    .select('allocations.student_id');
}

// --- Resident emergency card (item 86 second half) -------------------------

/** The current hostel/room/bed for a resident, plus their current
 * movement (out/in) status — the "minimum necessary information" the
 * emergency card shows, purpose-restricted to staff (service.ts enforces
 * that). Deliberately excludes anything welfare/medical — this schema
 * has no such field to leak in the first place. */
export function findCurrentOccupancy(studentId: string) {
  return db('allocations')
    .join('beds', 'beds.id', 'allocations.bed_id')
    .join('rooms', 'rooms.id', 'beds.room_id')
    .join('floors', 'floors.id', 'rooms.floor_id')
    .join('blocks', 'blocks.id', 'floors.block_id')
    .join('hostels', 'hostels.id', 'blocks.hostel_id')
    .where('allocations.student_id', studentId)
    .andWhere('allocations.status', 'checked_in_active')
    .select(
      'hostels.id as hostel_id',
      'hostels.name as hostel_name',
      'blocks.code as block_code',
      'floors.number as floor_number',
      'rooms.id as room_id',
      'rooms.code as room_code',
      'beds.code as bed_code'
    )
    .first();
}

export function findCurrentMovement(studentId: string) {
  return db('movement_requests').where({ student_id: studentId }).whereIn('status', ['out', 'overdue']).first();
}
