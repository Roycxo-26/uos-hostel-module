import { Router } from 'express';
import * as controller from './controller';

// No permission gate — every authenticated user reads/manages only their
// own notifications (enforced in the service), same as /me.
export function notificationsRouter(): Router {
  const r = Router();

  r.get('/', controller.listNotifications);
  r.get('/unread-count', controller.getUnreadCount);
  r.post('/read-all', controller.markAllRead);
  r.post('/:notificationId/read', controller.markRead);

  return r;
}
