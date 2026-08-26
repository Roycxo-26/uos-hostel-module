import { api } from './client';

export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  createdAt: string;
}

export async function listNotifications(unreadOnly = false) {
  const { notifications } = await api.get<{ notifications: Notification[] }>(`/notifications${unreadOnly ? '?unreadOnly=true' : ''}`);
  return notifications;
}

export async function getUnreadCount() {
  const { count } = await api.get<{ count: number }>('/notifications/unread-count');
  return count;
}

export async function markRead(id: string) {
  const { notification } = await api.post<{ notification: Notification }>(`/notifications/${id}/read`, {});
  return notification;
}

export async function markAllRead() {
  await api.post('/notifications/read-all', {});
}
