import { db } from '../../db';

// --- Hostel entitlement --------------------------------------------------------

export function findHostel(id: string) {
  return db('hostels').where({ id }).first();
}

export function setHostelGamificationEnabled(id: string, enabled: boolean) {
  return db('hostels')
    .where({ id })
    .update({ gamification_enabled: enabled, updated_at: db.fn.now() })
    .returning('*')
    .then((rows) => rows[0]);
}

// --- Competitions ----------------------------------------------------------------

export function createCompetition(data: Record<string, unknown>) {
  return db('gamification_competitions').insert(data).returning('*').then((rows) => rows[0]);
}

export function findCompetitionById(id: string) {
  return db('gamification_competitions').where({ id }).first();
}

export function updateCompetition(id: string, data: Record<string, unknown>) {
  return db('gamification_competitions')
    .where({ id })
    .update({ ...data, updated_at: db.fn.now() })
    .returning('*')
    .then((rows) => rows[0]);
}

export function listCompetitions(filters: { hostelId?: string; status?: string }) {
  const query = db('gamification_competitions').orderBy('created_at', 'desc');
  if (filters.hostelId) query.andWhere({ hostel_id: filters.hostelId });
  if (filters.status) query.andWhere({ status: filters.status });
  return query;
}

// --- Entries -----------------------------------------------------------------

export function createEntry(data: Record<string, unknown>) {
  return db('gamification_entries').insert(data).returning('*').then((rows) => rows[0]);
}

export function findEntryById(id: string) {
  return db('gamification_entries').where({ id }).first();
}

export function updateEntry(id: string, data: Record<string, unknown>) {
  return db('gamification_entries')
    .where({ id })
    .update({ ...data, updated_at: db.fn.now() })
    .returning('*')
    .then((rows) => rows[0]);
}

export function listEntriesForCompetition(competitionId: string) {
  return db('gamification_entries').where({ competition_id: competitionId }).orderBy('rank', 'asc');
}

export function findEntryForScope(competitionId: string, scopeType: string, scopeId: string) {
  return db('gamification_entries').where({ competition_id: competitionId, scope_type: scopeType, scope_id: scopeId }).first();
}

// --- Scores ----------------------------------------------------------------------

export function createScore(data: Record<string, unknown>) {
  return db('gamification_scores').insert(data).returning('*').then((rows) => rows[0]);
}

export function listScoresForEntry(entryId: string) {
  return db('gamification_scores').where({ entry_id: entryId }).orderBy('scored_at', 'asc');
}

/** Every score row currently in force for an entry (i.e. not itself
 * superseded by a later correction) — one per dimension_key at most,
 * always the newest. Computed in JS rather than a recursive SQL query:
 * the row count per entry is small (one per configured dimension) and
 * this keeps the "latest wins" rule readable in one place. */
export async function findCurrentScoresForEntry(entryId: string): Promise<Map<string, number>> {
  const rows = await listScoresForEntry(entryId);
  const superseded = new Set(rows.map((r) => r.supersedes_score_id).filter(Boolean));
  const current = rows.filter((r) => !superseded.has(r.id));
  const byDimension = new Map<string, { score: number; scoredAt: Date }>();
  for (const row of current) {
    const existing = byDimension.get(row.dimension_key);
    if (!existing || row.scored_at > existing.scoredAt) {
      byDimension.set(row.dimension_key, { score: Number(row.score), scoredAt: row.scored_at });
    }
  }
  return new Map([...byDimension.entries()].map(([k, v]) => [k, v.score]));
}
