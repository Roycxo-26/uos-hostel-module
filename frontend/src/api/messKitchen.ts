import { api } from './client';
import type { MessKitchenConnectionStatus, MessKitchenOutboxEvent } from '../types';

export async function getConnectionStatus() {
  return api.get<MessKitchenConnectionStatus>('/mess-kitchen/status');
}

export async function listEvents(filters: { eventType?: string; studentId?: string } = {}) {
  const params = new URLSearchParams(Object.entries(filters).filter(([, v]) => v) as [string, string][]).toString();
  const { events } = await api.get<{ events: MessKitchenOutboxEvent[] }>(`/mess-kitchen/events${params ? `?${params}` : ''}`);
  return events;
}
