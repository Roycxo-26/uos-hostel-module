import type { AuthUser } from '@uos/auth';
import { ForbiddenError, NotFoundError } from '../../middlewares/errorHandler';
import * as repo from './repository';

export async function listNotifications(user: AuthUser, filters: { unreadOnly?: boolean }) {
  return repo.listForUser(user.sub, filters);
}

export async function getUnreadCount(user: AuthUser) {
  const row = await repo.countUnread(user.sub);
  return Number(row?.count ?? 0);
}

export async function markRead(user: AuthUser, id: string) {
  const row = await repo.findById(id);
  if (!row) throw new NotFoundError('Notification');
  if (row.user_id !== user.sub) throw new ForbiddenError('You can only mark your own notifications as read');
  return repo.markRead(id);
}

export async function markAllRead(user: AuthUser) {
  await repo.markAllRead(user.sub);
}
