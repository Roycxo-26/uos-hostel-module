// HOSTEL-GAP-ANALYSIS.md D17.15 (TODO.md Batch 30, item 122). "HOSTEL -
// v.1.md" §23.

// §23.2's own list, plus 'other' for "tenant-defined award."
export type CompetitionType =
  | 'best_room_of_the_week'
  | 'best_room_of_the_month'
  | 'best_floor_wing'
  | 'most_responsible_room'
  | 'most_proactive_student_or_team'
  | 'cleanest_common_area_team'
  | 'best_waste_management'
  | 'best_energy_water_conservation'
  | 'best_community_participation'
  | 'other';

export type CompetitionStatus = 'draft' | 'open' | 'scoring_locked' | 'provisional_result' | 'appeal_window' | 'final_result' | 'closed' | 'cancelled';

export interface ScoringDimensionConfig {
  key: string;
  label: string;
  weight: number;
  scoreMin: number;
  scoreMax: number;
  evidenceRequired: boolean;
  minimumInspections: number;
  /** §23.5: "Missing inspection is not automatically zero unless the
   * published rule says so." False (the default) excludes a missing
   * dimension from that entry's weighted average instead of zeroing it. */
  treatMissingAsZero: boolean;
}

export interface Competition {
  id: string;
  org_id: string;
  campus_id: string;
  hostel_id: string;
  competition_type: CompetitionType;
  name: string;
  description: string | null;
  status: CompetitionStatus;
  scoring_dimensions: ScoringDimensionConfig[];
  eligible_scope_type: 'room' | 'floor';
  start_date: string;
  end_date: string;
  appeal_window_days: number;
  tie_breaker_rule: string | null;
  created_by: string;
  cancelled_reason: string | null;
  created_at: Date;
}

export type AppealStatus = 'none' | 'appealed' | 'upheld' | 'overturned';

export interface Entry {
  id: string;
  org_id: string;
  campus_id: string;
  competition_id: string;
  scope_type: 'room' | 'floor';
  scope_id: string;
  alias: string | null;
  total_score: string | null;
  rank: number | null;
  is_winner: boolean;
  recognition_status: 'none' | 'issued';
  reward_description: string | null;
  opted_out: boolean;
  appeal_status: AppealStatus;
  appeal_reason: string | null;
  appeal_decided_by: string | null;
  appeal_decided_at: Date | null;
  appeal_decision_reason: string | null;
  created_at: Date;
}

export interface Score {
  id: string;
  org_id: string;
  campus_id: string;
  entry_id: string;
  dimension_key: string;
  score: string;
  scored_by: string;
  scored_at: Date;
  evidence_reference: string | null;
  supersedes_score_id: string | null;
  edit_reason: string | null;
  created_at: Date;
}

/**
 * Pure — no db access — the weighted-average + dense-ranking computation
 * §23.4's PROVISIONAL_RESULT transition needs. Safe for any caller to use
 * directly since it only touches already-fetched data; kept here rather
 * than inline in service.ts so the rule ("missing dimension excluded from
 * the average unless treatMissingAsZero") has one tested home.
 */
export function computeEntryTotal(dimensions: ScoringDimensionConfig[], latestScoreByDimension: Map<string, number>): number | null {
  let weightedSum = 0;
  let weightTotal = 0;
  for (const dim of dimensions) {
    const raw = latestScoreByDimension.get(dim.key);
    if (raw === undefined) {
      if (!dim.treatMissingAsZero) continue; // excluded, not zeroed
      weightedSum += 0;
      weightTotal += dim.weight;
      continue;
    }
    weightedSum += raw * dim.weight;
    weightTotal += dim.weight;
  }
  if (weightTotal === 0) return null;
  return weightedSum / weightTotal;
}

/** Dense ranking (ties share a rank, no gap after) — §23.5's "Ties use a
 * published tie-breaker or shared recognition"; this build always uses
 * shared recognition (the simpler of the two named options — a free-text
 * tie_breaker_rule isn't machine-interpretable). Opted-out entries are
 * excluded entirely, per §23.7. */
export function rankEntries(entries: { id: string; totalScore: number | null; optedOut: boolean }[]): Map<string, number> {
  const ranks = new Map<string, number>();
  const ranked = entries.filter((e) => !e.optedOut && e.totalScore !== null).sort((a, b) => (b.totalScore ?? 0) - (a.totalScore ?? 0));
  let rank = 0;
  let lastScore: number | null = null;
  for (const entry of ranked) {
    if (entry.totalScore !== lastScore) rank += 1;
    ranks.set(entry.id, rank);
    lastScore = entry.totalScore;
  }
  return ranks;
}
