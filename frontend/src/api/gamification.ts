import { api } from './client';
import type { CompetitionType, GamificationCompetition, GamificationEntry, GamificationScore, Hostel, ScoringDimensionConfig } from '../types';

export async function toggleHostelGamification(hostelId: string, enabled: boolean) {
  const { hostel } = await api.post<{ hostel: Hostel }>(`/gamification/hostels/${hostelId}/toggle`, { enabled });
  return hostel;
}

export async function createCompetition(input: {
  hostelId: string;
  competitionType: CompetitionType;
  name: string;
  description?: string;
  scoringDimensions: ScoringDimensionConfig[];
  eligibleScopeType: 'room' | 'floor';
  startDate: string;
  endDate: string;
  appealWindowDays?: number;
  tieBreakerRule?: string;
}) {
  const { competition } = await api.post<{ competition: GamificationCompetition }>('/gamification/competitions', input);
  return competition;
}

export async function listCompetitions(filters: { hostelId?: string; status?: string } = {}) {
  const params = new URLSearchParams(Object.entries(filters).filter(([, v]) => v) as [string, string][]).toString();
  const { competitions } = await api.get<{ competitions: GamificationCompetition[] }>(`/gamification/competitions${params ? `?${params}` : ''}`);
  return competitions;
}

export async function getCompetition(id: string) {
  return api.get<GamificationCompetition>(`/gamification/competitions/${id}`);
}

export async function generateEntries(id: string) {
  const { entries } = await api.post<{ entries: GamificationEntry[] }>(`/gamification/competitions/${id}/generate-entries`, {});
  return entries;
}

export async function openCompetition(id: string) {
  const { competition } = await api.post<{ competition: GamificationCompetition }>(`/gamification/competitions/${id}/open`, {});
  return competition;
}

export async function lockScoring(id: string) {
  const { competition } = await api.post<{ competition: GamificationCompetition }>(`/gamification/competitions/${id}/lock-scoring`, {});
  return competition;
}

export async function computeProvisionalResult(id: string) {
  const { competition } = await api.post<{ competition: GamificationCompetition }>(`/gamification/competitions/${id}/compute-result`, {});
  return competition;
}

export async function finalizeResult(id: string) {
  const { competition } = await api.post<{ competition: GamificationCompetition }>(`/gamification/competitions/${id}/finalize`, {});
  return competition;
}

export async function closeCompetition(id: string) {
  const { competition } = await api.post<{ competition: GamificationCompetition }>(`/gamification/competitions/${id}/close`, {});
  return competition;
}

export async function cancelCompetition(id: string, reason: string) {
  const { competition } = await api.post<{ competition: GamificationCompetition }>(`/gamification/competitions/${id}/cancel`, { reason });
  return competition;
}

export async function recordScore(entryId: string, input: { dimensionKey: string; score: number; evidenceReference?: string; editReason?: string }) {
  const { score } = await api.post<{ score: GamificationScore }>(`/gamification/entries/${entryId}/scores`, input);
  return score;
}

export async function listEntryScores(entryId: string) {
  const { scores } = await api.get<{ scores: GamificationScore[] }>(`/gamification/entries/${entryId}/scores`);
  return scores;
}

export async function optOutEntry(entryId: string) {
  const { entry } = await api.post<{ entry: GamificationEntry }>(`/gamification/entries/${entryId}/opt-out`, {});
  return entry;
}

export async function setAlias(entryId: string, alias: string) {
  const { entry } = await api.post<{ entry: GamificationEntry }>(`/gamification/entries/${entryId}/alias`, { alias });
  return entry;
}

export async function issueRecognition(entryId: string, rewardDescription?: string) {
  const { entry } = await api.post<{ entry: GamificationEntry }>(`/gamification/entries/${entryId}/recognize`, { rewardDescription });
  return entry;
}

export async function appealEntry(entryId: string, reason: string) {
  const { entry } = await api.post<{ entry: GamificationEntry }>(`/gamification/entries/${entryId}/appeal`, { reason });
  return entry;
}

export async function decideEntryAppeal(entryId: string, outcome: 'upheld' | 'overturned', reason: string) {
  const { entry } = await api.post<{ entry: GamificationEntry }>(`/gamification/entries/${entryId}/decide-appeal`, { outcome, reason });
  return entry;
}
