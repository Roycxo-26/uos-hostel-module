import { db } from '../../db';
import type { Knex } from 'knex';

/**
 * The one write every producing module calls, repo-to-repo (never through
 * messKitchen/service.ts, per this codebase's own module-boundary rule) —
 * checkins/checkouts/movements' own service.ts files call this directly
 * at the point the underlying fact actually changes. Accepts an optional
 * explicit `trx` so a background job (which has no request-scoped `db`
 * proxy) can pass its own transaction, same as utils/notify.ts's
 * notify()/notifyWithTrx() split — kept as one function with an optional
 * param here since every current caller is a live request, not a job.
 */
export function recordOutboundEvent(
  data: { org_id: string; campus_id: string; student_id?: string | null; event_type: string; payload?: Record<string, unknown> },
  trx: Knex = db
) {
  return trx('mess_kitchen_outbox_events')
    .insert({
      org_id: data.org_id,
      campus_id: data.campus_id,
      student_id: data.student_id ?? null,
      event_type: data.event_type,
      payload: JSON.stringify(data.payload ?? {}),
    })
    .returning('*')
    .then((rows) => rows[0]);
}

export function listEvents(filters: { eventType?: string; studentId?: string }) {
  const query = db('mess_kitchen_outbox_events').orderBy('occurred_at', 'desc');
  if (filters.eventType) query.andWhere({ event_type: filters.eventType });
  if (filters.studentId) query.andWhere({ student_id: filters.studentId });
  return query;
}
