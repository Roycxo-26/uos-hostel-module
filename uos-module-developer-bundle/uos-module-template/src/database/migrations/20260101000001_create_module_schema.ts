import type { Knex } from 'knex';

// 'desk' is a placeholder — rename every occurrence of it across this whole
// migrations directory to your module's real schema name (matching
// MODULE_SCHEMA in .env) before you write your first real migration.
export async function up(knex: Knex): Promise<void> {
  await knex.raw('CREATE SCHEMA IF NOT EXISTS desk');
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP SCHEMA IF EXISTS desk CASCADE');
}
