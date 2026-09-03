import { useEffect, useState } from 'react';
import * as gamificationApi from '../api/gamification';
import * as structureApi from '../api/structure';
import { useAuth } from '../context/AuthContext';
import {
  Alert,
  Button,
  Card,
  EmptyState,
  FieldWrapper,
  Input,
  PageHeader,
  PageSpinner,
  Select,
  Sheet,
  StatusPill,
  Textarea,
} from '../design-system';
import { AlertIcon } from '../design-system/icons';
import { errorMessage } from '../lib/errorMessage';
import {
  hasHostelRole,
  isPlatformAdmin,
  type CompetitionType,
  type GamificationCompetition,
  type GamificationEntry,
  type Hostel,
  type ScoringDimensionConfig,
} from '../types';

/** D17.15 (TODO.md Batch 30, item 122) — "HOSTEL - v.1.md" §23. An
 * engagement/recognition feature, not disciplinary — §23.7: gamification
 * status never touches allocation, fees, outpass or discipline. A
 * per-hostel entitlement (§23.1), distinct from every other optional
 * workflow's tenant-wide Settings flag. */

const COMPETITION_TYPE_LABELS: Record<CompetitionType, string> = {
  best_room_of_the_week: 'Best Room of the Week',
  best_room_of_the_month: 'Best Room of the Month',
  best_floor_wing: 'Best Floor / Wing',
  most_responsible_room: 'Most Responsible Room',
  most_proactive_student_or_team: 'Most Proactive Student / Team',
  cleanest_common_area_team: 'Cleanest Common Area Team',
  best_waste_management: 'Best Waste-Management Practice',
  best_energy_water_conservation: 'Best Energy / Water Conservation',
  best_community_participation: 'Best Community Participation',
  other: 'Other (Tenant-Defined)',
};

export function Gamification() {
  const { me } = useAuth();
  const isStaff = isPlatformAdmin(me) || hasHostelRole(me, 'warden');
  const isHeadWarden = isPlatformAdmin(me) || hasHostelRole(me, 'head_warden');
  const [hostels, setHostels] = useState<Hostel[]>([]);
  const [hostelId, setHostelId] = useState('');
  const [competitions, setCompetitions] = useState<GamificationCompetition[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toggling, setToggling] = useState(false);

  const hostel = hostels.find((h) => h.id === hostelId);

  async function loadHostels() {
    const list = await structureApi.listHostels();
    setHostels(list);
    if (list[0]?.id) setHostelId(list[0].id);
  }

  async function loadCompetitions(id: string) {
    if (!id) return;
    setLoading(true);
    setCompetitions(await gamificationApi.listCompetitions({ hostelId: id }));
    setLoading(false);
  }

  useEffect(() => {
    void loadHostels();
  }, []);

  useEffect(() => {
    void loadCompetitions(hostelId);
  }, [hostelId]);

  async function handleToggle() {
    if (!hostel) return;
    setToggling(true);
    setError(null);
    try {
      await gamificationApi.toggleHostelGamification(hostel.id, !hostel.gamificationEnabled);
      await loadHostels();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setToggling(false);
    }
  }

  return (
    <div>
      <PageHeader title="Cleanliness Gamification" description="Recognition and rewards — an engagement feature, never tied to allocation, fees or discipline." />

      {error && <Alert>{error}</Alert>}

      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="max-w-xs flex-1">
          <FieldWrapper label="Hostel" htmlFor="gm-hostel">
            <Select id="gm-hostel" value={hostelId} onChange={(e) => setHostelId(e.target.value)}>
              {hostels.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </Select>
          </FieldWrapper>
        </div>
        <div className="flex gap-2">
          {isHeadWarden && hostel && (
            <Button variant="secondary" disabled={toggling} onClick={() => void handleToggle()}>
              {hostel.gamificationEnabled ? 'Disable for this hostel' : 'Enable for this hostel'}
            </Button>
          )}
          {isStaff && (
            <Button onClick={() => setCreateOpen(true)} disabled={!hostel?.gamificationEnabled}>
              New competition
            </Button>
          )}
        </div>
      </div>

      {hostel && !hostel.gamificationEnabled && (
        <Alert tone="warning">Gamification is not enabled for {hostel.name}. {isHeadWarden ? 'Enable it above to create a competition.' : 'Ask a Head Warden to enable it.'}</Alert>
      )}

      {loading ? (
        <PageSpinner />
      ) : competitions.length === 0 ? (
        <EmptyState icon={<AlertIcon className="h-8 w-8" />} title="No competitions" description={isStaff ? 'Create one above once gamification is enabled.' : 'None running right now.'} />
      ) : (
        <Card>
          <ul className="divide-y divide-slate-100">
            {competitions.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setDetailId(c.id)}>
                  <p className="flex items-center gap-2 text-sm">
                    <span className="font-medium text-slate-800">{c.name}</span>
                    <StatusPill status={c.status} />
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {COMPETITION_TYPE_LABELS[c.competitionType]} — {c.startDate} to {c.endDate}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {hostel && <CreateCompetitionSheet open={createOpen} onClose={() => setCreateOpen(false)} onCreated={() => loadCompetitions(hostelId)} hostelId={hostel.id} />}
      {detailId && <CompetitionDetailSheet id={detailId} isStaff={isStaff} currentUserId={me?.sub} onClose={() => setDetailId(null)} onChanged={() => loadCompetitions(hostelId)} />}
    </div>
  );
}

function CreateCompetitionSheet({ open, onClose, onCreated, hostelId }: { open: boolean; onClose: () => void; onCreated: () => void; hostelId: string }) {
  const [competitionType, setCompetitionType] = useState<CompetitionType>('best_room_of_the_week');
  const [name, setName] = useState('');
  const [eligibleScopeType, setEligibleScopeType] = useState<'room' | 'floor'>('room');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [dimensions, setDimensions] = useState<ScoringDimensionConfig[]>([
    { key: 'cleanliness', label: 'Cleanliness score', weight: 1, scoreMin: 1, scoreMax: 5, evidenceRequired: false, minimumInspections: 1, treatMissingAsZero: false },
  ]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function updateDimension(index: number, patch: Partial<ScoringDimensionConfig>) {
    setDimensions(dimensions.map((d, i) => (i === index ? { ...d, ...patch } : d)));
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      await gamificationApi.createCompetition({ hostelId, competitionType, name, scoringDimensions: dimensions, eligibleScopeType, startDate, endDate });
      onCreated();
      onClose();
      setName('');
      setStartDate('');
      setEndDate('');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit = name.trim() && startDate && endDate && dimensions.every((d) => d.key.trim() && d.label.trim());

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="New competition"
      footer={
        <Button fullWidth onClick={() => void handleSubmit()} disabled={submitting || !canSubmit}>
          {submitting ? 'Creating…' : 'Create — starts as draft'}
        </Button>
      }
    >
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <Alert>Rules and weights are locked in once you generate entries and open the competition — set them carefully now.</Alert>
        <FieldWrapper label="Type" htmlFor="gc-type">
          <Select id="gc-type" value={competitionType} onChange={(e) => setCompetitionType(e.target.value as CompetitionType)}>
            {Object.entries(COMPETITION_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </FieldWrapper>
        <FieldWrapper label="Name" htmlFor="gc-name" required>
          <Input id="gc-name" value={name} onChange={(e) => setName(e.target.value)} />
        </FieldWrapper>
        <FieldWrapper label="Entrants" htmlFor="gc-scope">
          <Select id="gc-scope" value={eligibleScopeType} onChange={(e) => setEligibleScopeType(e.target.value as 'room' | 'floor')}>
            <option value="room">Rooms</option>
            <option value="floor">Floors</option>
          </Select>
        </FieldWrapper>
        <div className="grid grid-cols-2 gap-3">
          <FieldWrapper label="Start date" htmlFor="gc-start" required>
            <Input id="gc-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </FieldWrapper>
          <FieldWrapper label="End date" htmlFor="gc-end" required>
            <Input id="gc-end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </FieldWrapper>
        </div>
        <p className="text-sm font-medium text-slate-800">Scoring dimensions</p>
        {dimensions.map((d, i) => (
          <div key={i} className="space-y-1.5 rounded-lg border border-slate-200 p-3">
            <Input placeholder="Label (e.g. Cleanliness)" value={d.label} onChange={(e) => updateDimension(i, { label: e.target.value, key: e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '_') })} />
            <div className="grid grid-cols-3 gap-1.5">
              <Input type="number" placeholder="Weight" value={d.weight} onChange={(e) => updateDimension(i, { weight: Number(e.target.value) })} />
              <Input type="number" placeholder="Min" value={d.scoreMin} onChange={(e) => updateDimension(i, { scoreMin: Number(e.target.value) })} />
              <Input type="number" placeholder="Max" value={d.scoreMax} onChange={(e) => updateDimension(i, { scoreMax: Number(e.target.value) })} />
            </div>
          </div>
        ))}
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              setDimensions([...dimensions, { key: '', label: '', weight: 1, scoreMin: 0, scoreMax: 5, evidenceRequired: false, minimumInspections: 1, treatMissingAsZero: false }])
            }
          >
            Add dimension
          </Button>
          {dimensions.length > 1 && (
            <Button size="sm" variant="secondary" onClick={() => setDimensions(dimensions.slice(0, -1))}>
              Remove last
            </Button>
          )}
        </div>
      </div>
    </Sheet>
  );
}

function CompetitionDetailSheet({
  id,
  isStaff,
  currentUserId,
  onClose,
  onChanged,
}: {
  id: string;
  isStaff: boolean;
  currentUserId: string | undefined;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState<GamificationCompetition | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  async function refresh() {
    setDetail(await gamificationApi.getCompetition(id));
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function run(action: string, fn: () => Promise<unknown>) {
    setSubmitting(action);
    setError(null);
    try {
      await fn();
      await refresh();
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(null);
    }
  }

  if (!detail) {
    return (
      <Sheet open onClose={onClose} title="Competition">
        <PageSpinner />
      </Sheet>
    );
  }

  const entries = detail.entries ?? [];

  return (
    <Sheet open onClose={onClose} title={detail.name}>
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <p className="flex items-center gap-2 text-sm">
          <StatusPill status={detail.status} />
          <span className="text-slate-500">{COMPETITION_TYPE_LABELS[detail.competitionType]}</span>
        </p>
        <p className="text-xs text-slate-500">
          {detail.startDate} to {detail.endDate} — entrants: {detail.eligibleScopeType}s
        </p>
        <div className="text-xs text-slate-500">
          Dimensions: {detail.scoringDimensions.map((d) => `${d.label} (×${d.weight})`).join(', ')}
        </div>

        {isStaff && (
          <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-4">
            {detail.status === 'draft' && (
              <>
                <Button size="sm" variant="secondary" disabled={Boolean(submitting)} onClick={() => void run('gen', () => gamificationApi.generateEntries(detail.id))}>
                  Generate entries ({entries.length})
                </Button>
                <Button size="sm" disabled={Boolean(submitting) || entries.length === 0} onClick={() => void run('open', () => gamificationApi.openCompetition(detail.id))}>
                  Open competition
                </Button>
              </>
            )}
            {detail.status === 'open' && (
              <Button size="sm" disabled={Boolean(submitting)} onClick={() => void run('lock', () => gamificationApi.lockScoring(detail.id))}>
                Lock scoring
              </Button>
            )}
            {detail.status === 'scoring_locked' && (
              <Button size="sm" disabled={Boolean(submitting)} onClick={() => void run('result', () => gamificationApi.computeProvisionalResult(detail.id))}>
                Compute results &amp; open appeals
              </Button>
            )}
            {detail.status === 'appeal_window' && (
              <Button size="sm" disabled={Boolean(submitting)} onClick={() => void run('finalize', () => gamificationApi.finalizeResult(detail.id))}>
                Finalize results
              </Button>
            )}
            {detail.status === 'final_result' && (
              <Button size="sm" disabled={Boolean(submitting)} onClick={() => void run('close', () => gamificationApi.closeCompetition(detail.id))}>
                Close competition
              </Button>
            )}
            {!['closed', 'cancelled'].includes(detail.status) && (
              <div className="flex flex-1 gap-2">
                <Input placeholder="Cancel reason" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} className="flex-1" />
                <Button size="sm" variant="danger" disabled={!cancelReason.trim() || Boolean(submitting)} onClick={() => void run('cancel', () => gamificationApi.cancelCompetition(detail.id, cancelReason))}>
                  Cancel
                </Button>
              </div>
            )}
          </div>
        )}

        <p className="border-t border-slate-200 pt-4 text-sm font-medium text-slate-800">Entries ({entries.length})</p>
        {entries.length === 0 ? (
          <p className="text-sm text-slate-500">None yet.</p>
        ) : (
          <ul className="space-y-2">
            {entries
              .slice()
              .sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999))
              .map((e) => (
                <EntryRow key={e.id} entry={e} competition={detail} isStaff={isStaff} currentUserId={currentUserId} onChanged={refresh} />
              ))}
          </ul>
        )}
      </div>
    </Sheet>
  );
}

function EntryRow({
  entry,
  competition,
  isStaff,
  currentUserId,
  onChanged,
}: {
  entry: GamificationEntry;
  competition: GamificationCompetition;
  isStaff: boolean;
  currentUserId: string | undefined;
  onChanged: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [dimensionKey, setDimensionKey] = useState(competition.scoringDimensions[0]?.key ?? '');
  const [scoreValue, setScoreValue] = useState('');
  const [evidenceReference, setEvidenceReference] = useState('');
  const [appealReason, setAppealReason] = useState('');
  const [decisionReason, setDecisionReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<string | null>(null);

  async function run(action: string, fn: () => Promise<unknown>) {
    setSubmitting(action);
    setError(null);
    try {
      await fn();
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <li className="rounded-lg border border-slate-200 p-3 text-sm">
      <button type="button" className="flex w-full items-center justify-between gap-2 text-left" onClick={() => setExpanded(!expanded)}>
        <span className="font-medium text-slate-800">
          {entry.rank ? `#${entry.rank} ` : ''}
          {entry.alias ?? entry.scopeId.slice(0, 8)}
          {entry.isWinner && ' 🏆'}
        </span>
        <span className="flex items-center gap-2 text-xs text-slate-500">
          {entry.totalScore ?? '—'}
          {entry.optedOut && 'opted out'}
          {entry.appealStatus !== 'none' && <StatusPill status={entry.appealStatus} />}
        </span>
      </button>
      {expanded && (
        <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
          {error && <Alert>{error}</Alert>}
          {entry.rewardDescription && <p className="text-xs text-slate-500">Reward: {entry.rewardDescription}</p>}
          {entry.appealReason && <p className="text-xs text-slate-500">Appeal: {entry.appealReason}</p>}

          {isStaff && competition.status === 'open' && (
            <div className="space-y-1.5">
              <div className="grid grid-cols-2 gap-1.5">
                <Select value={dimensionKey} onChange={(e) => setDimensionKey(e.target.value)}>
                  {competition.scoringDimensions.map((d) => (
                    <option key={d.key} value={d.key}>
                      {d.label}
                    </option>
                  ))}
                </Select>
                <Input type="number" placeholder="Score" value={scoreValue} onChange={(e) => setScoreValue(e.target.value)} />
              </div>
              <Input placeholder="Evidence reference (optional)" value={evidenceReference} onChange={(e) => setEvidenceReference(e.target.value)} />
              <Button
                size="sm"
                disabled={!scoreValue || Boolean(submitting)}
                onClick={() =>
                  void run('score', () => gamificationApi.recordScore(entry.id, { dimensionKey, score: Number(scoreValue), evidenceReference: evidenceReference || undefined }))
                }
              >
                Record score
              </Button>
            </div>
          )}

          {isStaff && competition.status === 'final_result' && entry.recognitionStatus === 'none' && (
            <Button size="sm" disabled={Boolean(submitting)} onClick={() => void run('recognize', () => gamificationApi.issueRecognition(entry.id, 'Recognized'))}>
              Issue recognition
            </Button>
          )}

          {competition.status === 'appeal_window' && entry.appealStatus === 'none' && (
            <div className="flex gap-2">
              <Input placeholder="Appeal reason" value={appealReason} onChange={(e) => setAppealReason(e.target.value)} className="flex-1" />
              <Button size="sm" variant="secondary" disabled={!appealReason.trim() || Boolean(submitting)} onClick={() => void run('appeal', () => gamificationApi.appealEntry(entry.id, appealReason))}>
                Appeal
              </Button>
            </div>
          )}

          {isStaff && entry.appealStatus === 'appealed' && (
            <div className="space-y-1.5">
              <Textarea placeholder="Decision reason" value={decisionReason} onChange={(e) => setDecisionReason(e.target.value)} />
              <div className="flex gap-2">
                <Button size="sm" disabled={!decisionReason.trim() || Boolean(submitting)} onClick={() => void run('overturn', () => gamificationApi.decideEntryAppeal(entry.id, 'overturned', decisionReason))}>
                  Overturn
                </Button>
                <Button size="sm" variant="secondary" disabled={!decisionReason.trim() || Boolean(submitting)} onClick={() => void run('uphold', () => gamificationApi.decideEntryAppeal(entry.id, 'upheld', decisionReason))}>
                  Uphold
                </Button>
              </div>
            </div>
          )}

          {!entry.optedOut && !isStaff && ['draft', 'open'].includes(competition.status) && (
            <Button size="sm" variant="secondary" disabled={Boolean(submitting)} onClick={() => void run('optout', () => gamificationApi.optOutEntry(entry.id))}>
              Opt out
            </Button>
          )}
        </div>
      )}
    </li>
  );
}
