import { Knex } from 'knex';
import {
  ExampleItem,
  CreateExampleBody,
  UpdateExampleBody,
} from './exampleTypes';

// All service functions accept the RLS-scoped transaction from getTrx().
// RLS on the DB ensures users can only see rows for their org + campus.

export async function findAll(trx: Knex.Transaction): Promise<ExampleItem[]> {
  return trx<ExampleItem>('example_items').select('*').where('is_active', true);
}

export async function findById(
  trx: Knex.Transaction,
  id: string
): Promise<ExampleItem | undefined> {
  return trx<ExampleItem>('example_items').where({ id }).first();
}

export async function create(
  trx: Knex.Transaction,
  data: CreateExampleBody,
  orgId: string,
  campusId: string
): Promise<ExampleItem> {
  const [row] = await trx<ExampleItem>('example_items')
    .insert({ ...data, org_id: orgId, campus_id: campusId })
    .returning('*');
  return row;
}

export async function update(
  trx: Knex.Transaction,
  id: string,
  data: UpdateExampleBody
): Promise<ExampleItem | undefined> {
  const [row] = await trx<ExampleItem>('example_items')
    .where({ id })
    .update({ ...data, updated_at: new Date() })
    .returning('*');
  return row;
}

export async function remove(trx: Knex.Transaction, id: string): Promise<void> {
  await trx<ExampleItem>('example_items').where({ id }).delete();
}
