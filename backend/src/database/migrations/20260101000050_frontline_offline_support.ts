import type { Knex } from 'knex';

// Frontline/offline mobile support (12 Sep 2026) — UOS_Final.docx audit
// §"ground and frontline worker mobile mode": scan/tap/photo, offline-
// capable, no work lost on a bad connection. Two backend pieces that
// support this:
//
// 1. `idempotency_keys` — a queued offline action can be retried by the
//    client's own sync manager if a request is interrupted mid-flight
//    (phone loses signal between sending and receiving the response); this
//    table lets a retried request with the same client-generated key
//    return the ORIGINAL result instead of applying the action twice (e.g.
//    resolving the same ticket, or logging the same room exit, again).
//    See middlewares/idempotency.ts.
//
// 2. `room_entries.entry_photo_url` / `exit_photo_url` — frontline staff
//    logging a room entry/exit can now attach a photo of room condition,
//    same "stopgap URL field" pattern already used everywhere else in this
//    schema (see applications/validators.ts's own comment on why) — a
//    compressed camera photo becomes a data: URI client-side, which is
//    still just a (longer) string in a URL-typed field.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema('hostel').createTable('idempotency_keys', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('org_id').notNullable();
    // The client-generated key (a UUID minted once when an offline action
    // is first queued, reused on every retry of that same action) plus
    // which route it was sent to — the same key sent to two different
    // routes is legitimately two different requests, not a replay.
    t.string('idempotency_key', 100).notNullable();
    t.string('route', 200).notNullable();
    t.integer('response_status').notNullable();
    t.jsonb('response_body').notNullable();
    t.timestamps(true, true);
    t.unique(['org_id', 'idempotency_key', 'route']);
  });
  // Deliberately no RLS/org isolation policy needed beyond the unique
  // constraint above — this table is never read back by a user, only by
  // the idempotency middleware itself using its own org_id + key, and it
  // holds no resident data of its own (response_body mirrors whatever the
  // real endpoint would have returned anyway, itself already RLS-correct).

  await knex.schema.withSchema('hostel').alterTable('room_entries', (t) => {
    t.text('entry_photo_url').nullable();
    t.text('exit_photo_url').nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.withSchema('hostel').alterTable('room_entries', (t) => {
    t.dropColumn('entry_photo_url');
    t.dropColumn('exit_photo_url');
  });
  await knex.schema.withSchema('hostel').dropTableIfExists('idempotency_keys');
}
