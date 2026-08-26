import type { Knex } from 'knex';

// UOS HOSTEL BR.md gap-closure — TODO.md Batch 1 items 3, 4, 6. Additive
// only, against already-live tables (migration 5), so a new migration
// rather than editing that one.
//
//   - BR §6's Application state machine includes RETURNED ("correction
//     needed") looping back to resubmission — flow.md §6.3 (revised). The
//     original CHECK constraint didn't have it; Postgres has no
//     ALTER-constraint, so this drops and recreates it.
//   - BR-HOS-002 requires document attachment on applications; BR §10
//     Check-In Console requires photos on the condition checklist. Both are
//     stopgap jsonb reference arrays (`[{name, url, uploadedAt}]`), not real
//     file storage — there's no UOS-126 Documents integration to upload
//     into yet. Replace with real document references the moment that
//     integration exists; don't build a parallel file-storage system here.
// Migration 5 created this via the unnamed t.check(...) form, so Postgres
// auto-named it — reliably `hostel_applications_status_check` per Postgres's
// own single-column CHECK naming convention, but looked up dynamically
// rather than hardcoded: this migration never ran against the live DB it's
// about to alter, so trusting a guessed name over the DB's own catalog is
// the wrong tradeoff.
async function findStatusCheckConstraintName(knex: Knex): Promise<string> {
  const row = await knex('pg_constraint')
    .select('conname')
    .whereRaw("conrelid = 'hostel.hostel_applications'::regclass")
    .andWhere('contype', 'c')
    .andWhereRaw("pg_get_constraintdef(oid) ILIKE '%status%'")
    .first();
  if (!row) throw new Error('Could not find the status CHECK constraint on hostel.hostel_applications — inspect pg_constraint manually before proceeding');
  return row.conname;
}

export async function up(knex: Knex): Promise<void> {
  const constraintName = await findStatusCheckConstraintName(knex);
  await knex.raw(`ALTER TABLE hostel.hostel_applications DROP CONSTRAINT ??`, [constraintName]);
  await knex.raw(`
    ALTER TABLE hostel.hostel_applications
      ADD CONSTRAINT hostel_applications_status_check
      CHECK (status IN ('draft','submitted','under_review','returned','waitlisted','rejected','allocation_ready','allocated','closed','cancelled'))
  `);

  await knex.schema.withSchema('hostel').alterTable('hostel_applications', (t) => {
    t.jsonb('attachments').notNullable().defaultTo('[]');
  });

  await knex.schema.withSchema('hostel').alterTable('checkins', (t) => {
    t.jsonb('condition_photos').notNullable().defaultTo('[]');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.withSchema('hostel').alterTable('checkins', (t) => {
    t.dropColumn('condition_photos');
  });
  await knex.schema.withSchema('hostel').alterTable('hostel_applications', (t) => {
    t.dropColumn('attachments');
  });

  await knex.raw('ALTER TABLE hostel.hostel_applications DROP CONSTRAINT hostel_applications_status_check');
  await knex.raw(`
    ALTER TABLE hostel.hostel_applications
      ADD CONSTRAINT hostel_applications_status_check
      CHECK (status IN ('draft','submitted','under_review','waitlisted','rejected','allocation_ready','allocated','closed','cancelled'))
  `);
}
