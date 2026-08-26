import { db } from '../../db';

export function listForUser(userId: string, filters: { unreadOnly?: boolean }) {
  const query = db('notifications').where({ user_id: userId }).orderBy('created_at', 'desc').limit(50);
  if (filters.unreadOnly) query.andWhere({ read: false });
  return query;
}

export function countUnread(userId: string) {
  return db('notifications').where({ user_id: userId, read: false }).count<{ count: string }[]>('id as count').first();
}

export function findById(id: string) {
  return db('notifications').where({ id }).first();
}

export function markRead(id: string) {
  return db('notifications')
    .where({ id })
    .update({ read: true })
    .returning('*')
    .then((rows) => rows[0]);
}

export function markAllRead(userId: string) {
  return db('notifications').where({ user_id: userId, read: false }).update({ read: true });
}
