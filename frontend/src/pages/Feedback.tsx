import { useEffect, useState } from 'react';
import * as feedbackApi from '../api/feedback';
import { FEEDBACK_TOPICS } from '../api/feedback';
import type {
  FeedbackAnonymityMode,
  FeedbackCampaign,
  FeedbackQuestion,
  FeedbackServiceRecoveryCase,
  FeedbackTargetScopeType,
  FeedbackTopic,
  TopicAggregate,
} from '../api/feedback';
import * as structureApi from '../api/structure';
import { useAuth } from '../context/AuthContext';
import { Alert, Button, Card, EmptyState, FieldWrapper, Input, PageHeader, PageSpinner, Select, Sheet, StatusPill, Textarea } from '../design-system';
import { AlertIcon } from '../design-system/icons';
import { errorMessage } from '../lib/errorMessage';
import { hasHostelRole, isPlatformAdmin, type Hostel, type HostelTree } from '../types';

/** D17.14 (TODO.md Batch 30, item 121) — "HOSTEL - v.1.md" §22. Not
 * staff-only: every resident sees campaigns open for their own scope and
 * responds to them. Running campaigns, seeing analytics/responses, and
 * service-recovery cases is staff-only within this same page — the
 * server enforces every one of these boundaries again regardless of what
 * this page shows (see feedback/service.ts). */

const TOPIC_LABELS: Record<FeedbackTopic, string> = {
  room_cleanliness: 'Room cleanliness',
  washroom_cleanliness: 'Washroom cleanliness',
  floor_common_area_cleanliness: 'Floor common-area cleanliness',
  housekeeping: 'Housekeeping',
  food_quality: 'Food quality',
  food_quantity: 'Food quantity',
  menu_satisfaction: 'Menu satisfaction',
  mess_hygiene: 'Mess hygiene',
  hospitality: 'Hospitality',
  hostel_facilities: 'Hostel facilities',
  warden_support: 'Warden support',
  security: 'Security',
  maintenance: 'Maintenance',
  ticket_resolution: 'Ticket resolution',
  visitor_front_desk_service: 'Visitor / front-desk service',
  checkin_checkout_experience: 'Check-in / check-out experience',
  overall_hostel_experience: 'Overall hostel experience',
  other: 'Other',
};

const ANONYMITY_LABELS: Record<FeedbackAnonymityMode, string> = {
  identified: 'Identified — staff see who responded',
  confidential: 'Confidential — identity hidden, revealable only by Head Warden with audit',
  anonymous: 'Anonymous — identity never stored',
  aggregated_only: 'Aggregated only — even staff never see individual responses',
};

export function Feedback() {
  const { me } = useAuth();
  const isStaff = isPlatformAdmin(me) || hasHostelRole(me, 'warden');
  const isHeadWarden = isPlatformAdmin(me) || hasHostelRole(me, 'head_warden');

  const [openCampaigns, setOpenCampaigns] = useState<FeedbackCampaign[]>([]);
  const [allCampaigns, setAllCampaigns] = useState<FeedbackCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [respondCampaign, setRespondCampaign] = useState<FeedbackCampaign | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [mine, all] = await Promise.all([feedbackApi.listOpenCampaignsForMe(), isStaff ? feedbackApi.listCampaigns() : Promise.resolve([])]);
      setOpenCampaigns(mine);
      setAllCampaigns(all);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStaff]);

  return (
    <div>
      <PageHeader
        title="Feedback & Surveys"
        description="Share your feedback on hostel life — cleanliness, food, staff support and more. Staff run campaigns and can't see who said what unless a campaign is marked identified."
      />
      {error && <Alert>{error}</Alert>}

      <Card className="mb-4">
        <div className="p-4 sm:p-5">
          <p className="mb-2 text-sm font-medium text-slate-900">Open for you</p>
          {loading ? (
            <PageSpinner />
          ) : openCampaigns.length === 0 ? (
            <p className="text-sm text-slate-500">No campaigns are open for you right now.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {openCampaigns.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 py-3">
                  <div>
                    <p className="text-sm font-medium text-slate-800">{c.name}</p>
                    <p className="text-xs text-slate-500">Closes {new Date(c.closeAt).toLocaleString()}</p>
                  </div>
                  <Button size="sm" onClick={() => setRespondCampaign(c)}>
                    Respond
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      {isStaff && (
        <>
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm font-medium text-slate-900">All campaigns</p>
            <Button onClick={() => setCreateOpen(true)}>New campaign</Button>
          </div>
          {!loading && allCampaigns.length === 0 ? (
            <EmptyState icon={<AlertIcon className="h-8 w-8" />} title="No campaigns yet" description="Create one above." />
          ) : (
            <Card>
              <ul className="divide-y divide-slate-100">
                {allCampaigns.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
                    <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setDetailId(c.id)}>
                      <p className="flex items-center gap-2 text-sm">
                        <span className="font-medium text-slate-800">{c.name}</span>
                        <StatusPill status={c.status} />
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {c.targetScopeType} scope — {ANONYMITY_LABELS[c.anonymityMode]} — {c.openAt.slice(0, 10)} to {c.closeAt.slice(0, 10)}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}

      <CreateCampaignSheet open={createOpen} onClose={() => setCreateOpen(false)} onCreated={load} />
      {respondCampaign && <RespondSheet campaign={respondCampaign} onClose={() => setRespondCampaign(null)} onSubmitted={load} />}
      {detailId && <CampaignDetailSheet id={detailId} isHeadWarden={isHeadWarden} onClose={() => setDetailId(null)} onChanged={load} />}
    </div>
  );
}

/** Drills a hostel down to its floors/rooms so staff can pick a target
 * scope without typing a raw uuid — same "resolve the hierarchy through
 * getHostelTree" approach used by every other module's own scope picker. */
function ScopePicker({ scopeType, value, onChange }: { scopeType: FeedbackTargetScopeType; value: string; onChange: (id: string) => void }) {
  const [hostels, setHostels] = useState<Hostel[]>([]);
  const [hostelId, setHostelId] = useState('');
  const [tree, setTree] = useState<HostelTree | null>(null);

  useEffect(() => {
    void structureApi.listHostels().then((list) => {
      setHostels(list);
      if (list[0]) setHostelId(list[0].id);
    });
  }, []);

  useEffect(() => {
    if (hostelId) void structureApi.getHostelTree(hostelId).then(setTree);
  }, [hostelId]);

  useEffect(() => {
    if (scopeType === 'hostel' && hostelId) onChange(hostelId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeType, hostelId]);

  const floors = tree?.blocks.flatMap((b) => b.floors) ?? [];
  const rooms = floors.flatMap((f) => f.rooms);

  return (
    <div className="space-y-2">
      <Select value={hostelId} onChange={(e) => setHostelId(e.target.value)}>
        {hostels.map((h) => (
          <option key={h.id} value={h.id}>
            {h.name}
          </option>
        ))}
      </Select>
      {scopeType === 'floor' && (
        <Select value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">Select a floor…</option>
          {floors.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name ?? `Floor ${f.number}`}
            </option>
          ))}
        </Select>
      )}
      {scopeType === 'room' && (
        <Select value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">Select a room…</option>
          {rooms.map((r) => (
            <option key={r.id} value={r.id}>
              {r.code}
            </option>
          ))}
        </Select>
      )}
    </div>
  );
}

function CreateCampaignSheet({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [purpose, setPurpose] = useState('');
  const [targetScopeType, setTargetScopeType] = useState<FeedbackTargetScopeType>('hostel');
  const [targetScopeId, setTargetScopeId] = useState('');
  const [topics, setTopics] = useState<FeedbackTopic[]>(['overall_hostel_experience']);
  const [anonymityMode, setAnonymityMode] = useState<FeedbackAnonymityMode>('anonymous');
  const [openAt, setOpenAt] = useState('');
  const [closeAt, setCloseAt] = useState('');
  const [triggerScore, setTriggerScore] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function toggleTopic(topic: FeedbackTopic) {
    setTopics(topics.includes(topic) ? topics.filter((t) => t !== topic) : [...topics, topic]);
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      // A single overall-rating question — the fuller §22.3 per-question
      // rating-scale builder is a named scope cut, see TODO.md.
      const questionSet: FeedbackQuestion[] = [{ key: 'overall', label: 'Overall rating', questionType: 'rating', ratingScale: 5, mandatory: true }];
      await feedbackApi.createCampaign({
        name,
        purpose: purpose || undefined,
        targetScopeType,
        targetScopeId,
        topics,
        questionSet,
        anonymityMode,
        openAt: new Date(openAt).toISOString(),
        closeAt: new Date(closeAt).toISOString(),
        serviceRecoveryTriggerScore: triggerScore ? Number(triggerScore) : undefined,
      });
      onCreated();
      onClose();
      setName('');
      setPurpose('');
      setTargetScopeId('');
      setTriggerScore('');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit = name.trim() && targetScopeId && topics.length > 0 && openAt && closeAt;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="New feedback campaign"
      footer={
        <Button fullWidth onClick={() => void handleSubmit()} disabled={submitting || !canSubmit}>
          {submitting ? 'Creating…' : 'Create — starts as draft'}
        </Button>
      }
    >
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <FieldWrapper label="Name" htmlFor="fc-name" required>
          <Input id="fc-name" value={name} onChange={(e) => setName(e.target.value)} />
        </FieldWrapper>
        <FieldWrapper label="Purpose" htmlFor="fc-purpose" hint="Optional">
          <Textarea id="fc-purpose" value={purpose} onChange={(e) => setPurpose(e.target.value)} />
        </FieldWrapper>
        <FieldWrapper label="Target scope" htmlFor="fc-scope-type">
          <Select id="fc-scope-type" value={targetScopeType} onChange={(e) => { setTargetScopeType(e.target.value as FeedbackTargetScopeType); setTargetScopeId(''); }}>
            <option value="hostel">Hostel</option>
            <option value="floor">Floor</option>
            <option value="room">Room</option>
          </Select>
        </FieldWrapper>
        <ScopePicker scopeType={targetScopeType} value={targetScopeId} onChange={setTargetScopeId} />
        <FieldWrapper label="Topics" htmlFor="fc-topics" hint="What this campaign asks about" required>
          <div className="flex flex-wrap gap-1.5">
            {FEEDBACK_TOPICS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => toggleTopic(t)}
                className={`rounded-full border px-2.5 py-1 text-xs ${topics.includes(t) ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-600'}`}
              >
                {TOPIC_LABELS[t]}
              </button>
            ))}
          </div>
        </FieldWrapper>
        <FieldWrapper label="Anonymity mode" htmlFor="fc-anonymity" required>
          <Select id="fc-anonymity" value={anonymityMode} onChange={(e) => setAnonymityMode(e.target.value as FeedbackAnonymityMode)}>
            {Object.entries(ANONYMITY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </FieldWrapper>
        <div className="grid grid-cols-2 gap-3">
          <FieldWrapper label="Opens" htmlFor="fc-open" required>
            <Input id="fc-open" type="datetime-local" value={openAt} onChange={(e) => setOpenAt(e.target.value)} />
          </FieldWrapper>
          <FieldWrapper label="Closes" htmlFor="fc-close" required>
            <Input id="fc-close" type="datetime-local" value={closeAt} onChange={(e) => setCloseAt(e.target.value)} />
          </FieldWrapper>
        </div>
        <FieldWrapper label="Service-recovery trigger score" htmlFor="fc-trigger" hint="A rating at or below this (0-10) auto-opens a service-recovery case. Optional.">
          <Input id="fc-trigger" type="number" min={0} max={10} value={triggerScore} onChange={(e) => setTriggerScore(e.target.value)} />
        </FieldWrapper>
      </div>
    </Sheet>
  );
}

function RespondSheet({ campaign, onClose, onSubmitted }: { campaign: FeedbackCampaign; onClose: () => void; onSubmitted: () => void }) {
  const [topic, setTopic] = useState<FeedbackTopic>(campaign.topics[0] ?? 'overall_hostel_experience');
  const [rating, setRating] = useState('');
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      await feedbackApi.submitResponse(campaign.id, { topic, overallRating: rating ? Number(rating) : undefined, comment: comment || undefined });
      setDone(true);
      onSubmitted();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={campaign.name}
      footer={
        !done && (
          <Button fullWidth onClick={() => void handleSubmit()} disabled={submitting}>
            {submitting ? 'Sending…' : 'Submit feedback'}
          </Button>
        )
      }
    >
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        {done ? (
          <Alert>Thank you — your feedback was recorded.</Alert>
        ) : (
          <>
            <Alert>{ANONYMITY_LABELS[campaign.anonymityMode]}</Alert>
            <FieldWrapper label="Topic" htmlFor="fr-topic" required>
              <Select id="fr-topic" value={topic} onChange={(e) => setTopic(e.target.value as FeedbackTopic)}>
                {campaign.topics.map((t) => (
                  <option key={t} value={t}>
                    {TOPIC_LABELS[t]}
                  </option>
                ))}
              </Select>
            </FieldWrapper>
            <FieldWrapper label="Overall rating (0-10)" htmlFor="fr-rating">
              <Input id="fr-rating" type="number" min={0} max={10} value={rating} onChange={(e) => setRating(e.target.value)} />
            </FieldWrapper>
            <FieldWrapper label="Comment" htmlFor="fr-comment" hint="Optional">
              <Textarea id="fr-comment" value={comment} onChange={(e) => setComment(e.target.value)} />
            </FieldWrapper>
          </>
        )}
      </div>
    </Sheet>
  );
}

function CampaignDetailSheet({ id, isHeadWarden, onClose, onChanged }: { id: string; isHeadWarden: boolean; onClose: () => void; onChanged: () => void }) {
  const [detail, setDetail] = useState<FeedbackCampaign | null>(null);
  const [responses, setResponses] = useState<feedbackApi.FeedbackResponse[] | null>(null);
  const [analytics, setAnalytics] = useState<{ totalResponses: number; topics: TopicAggregate[] } | null>(null);
  const [cases, setCases] = useState<FeedbackServiceRecoveryCase[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [revealed, setRevealed] = useState<Record<string, string>>({});

  async function refresh() {
    setDetail(await feedbackApi.getCampaign(id));
    setCases(await feedbackApi.listServiceRecoveryCases({ campaignId: id }));
    try {
      setAnalytics(await feedbackApi.getAnalytics(id));
    } catch {
      setAnalytics(null);
    }
    try {
      setResponses(await feedbackApi.listResponses(id));
    } catch {
      setResponses(null); // aggregated_only campaigns refuse this — expected, not an error to show
    }
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

  async function handleReveal(responseId: string) {
    setError(null);
    try {
      const { respondentUserId } = await feedbackApi.revealIdentity(responseId);
      setRevealed({ ...revealed, [responseId]: respondentUserId });
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  if (!detail) {
    return (
      <Sheet open onClose={onClose} title="Campaign">
        <PageSpinner />
      </Sheet>
    );
  }

  return (
    <Sheet open onClose={onClose} title={detail.name}>
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <p className="flex items-center gap-2 text-sm">
          <StatusPill status={detail.status} />
          <span className="text-slate-500">{detail.targetScopeType} scope</span>
        </p>
        <p className="text-xs text-slate-500">{ANONYMITY_LABELS[detail.anonymityMode]}</p>
        <p className="text-xs text-slate-500">
          {new Date(detail.openAt).toLocaleString()} — {new Date(detail.closeAt).toLocaleString()}
        </p>
        {detail.cancelledReason && <p className="text-xs text-slate-500">Cancelled: {detail.cancelledReason}</p>}

        <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-4">
          {detail.status === 'draft' && (
            <Button size="sm" disabled={Boolean(submitting)} onClick={() => void run('open', () => feedbackApi.openCampaign(detail.id))}>
              Open campaign
            </Button>
          )}
          {detail.status === 'open' && (
            <Button size="sm" disabled={Boolean(submitting)} onClick={() => void run('close', () => feedbackApi.closeCampaign(detail.id))}>
              Close now
            </Button>
          )}
          {detail.status === 'closed' && (
            <Button size="sm" disabled={Boolean(submitting)} onClick={() => void run('ready', () => feedbackApi.markAnalysisReady(detail.id))}>
              Mark analysis-ready
            </Button>
          )}
          {['closed', 'analysis_ready'].includes(detail.status) && (
            <Button size="sm" variant="secondary" disabled={Boolean(submitting)} onClick={() => void run('archive', () => feedbackApi.archiveCampaign(detail.id))}>
              Archive
            </Button>
          )}
          {['draft', 'open'].includes(detail.status) && (
            <div className="flex flex-1 gap-2">
              <Input placeholder="Cancel reason" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} className="flex-1" />
              <Button size="sm" variant="danger" disabled={!cancelReason.trim() || Boolean(submitting)} onClick={() => void run('cancel', () => feedbackApi.cancelCampaign(detail.id, cancelReason))}>
                Cancel
              </Button>
            </div>
          )}
        </div>

        <div className="border-t border-slate-200 pt-4">
          <p className="mb-2 text-sm font-medium text-slate-800">
            Analytics{analytics ? ` (${analytics.totalResponses} response${analytics.totalResponses === 1 ? '' : 's'})` : ''}
          </p>
          {!analytics ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : analytics.topics.length === 0 ? (
            <p className="text-sm text-slate-500">No responses yet.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {analytics.topics.map((t) => (
                <li key={t.topic} className="flex items-center justify-between">
                  <span className="text-slate-700">{TOPIC_LABELS[t.topic as FeedbackTopic] ?? t.topic}</span>
                  <span className="text-slate-500">
                    {t.suppressed
                      ? `${t.responseCount} response${t.responseCount === 1 ? '' : 's'} — below minimum, not shown`
                      : `avg ${t.averageRating} (${t.responseCount})`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {responses && (
          <div className="border-t border-slate-200 pt-4">
            <p className="mb-2 text-sm font-medium text-slate-800">Responses ({responses.length})</p>
            {responses.length === 0 ? (
              <p className="text-sm text-slate-500">None yet.</p>
            ) : (
              <ul className="space-y-2">
                {responses.map((r) => (
                  <li key={r.id} className="rounded-lg border border-slate-200 p-2.5 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-slate-800">{TOPIC_LABELS[r.topic]}</span>
                      <span className="text-xs text-slate-500">{r.overallRating ?? '—'}</span>
                    </div>
                    {r.comment && <p className="mt-1 text-xs text-slate-600">{r.comment}</p>}
                    {detail.anonymityMode === 'identified' && r.respondentUserId && <p className="mt-1 text-xs text-slate-400">{r.respondentUserId}</p>}
                    {detail.anonymityMode === 'confidential' && isHeadWarden && (
                      <div className="mt-1">
                        {revealed[r.id] ? (
                          <p className="text-xs text-amber-700">Revealed: {revealed[r.id]}</p>
                        ) : (
                          <Button size="sm" variant="secondary" onClick={() => void handleReveal(r.id)}>
                            Reveal identity (audited)
                          </Button>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="border-t border-slate-200 pt-4">
          <p className="mb-2 text-sm font-medium text-slate-800">Service-recovery cases ({cases.length})</p>
          {cases.length === 0 ? (
            <p className="text-sm text-slate-500">None.</p>
          ) : (
            <ul className="space-y-2">
              {cases.map((c) => (
                <CaseRow key={c.id} recoveryCase={c} onChanged={refresh} />
              ))}
            </ul>
          )}
        </div>
      </div>
    </Sheet>
  );
}

function CaseRow({ recoveryCase, onChanged }: { recoveryCase: FeedbackServiceRecoveryCase; onChanged: () => void }) {
  const [notes, setNotes] = useState(recoveryCase.resolutionNotes ?? '');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<string | null>(null);

  async function run(action: string, status: 'in_review' | 'case_created' | 'closed') {
    setSubmitting(action);
    setError(null);
    try {
      await feedbackApi.updateServiceRecoveryCase(recoveryCase.id, { status, resolutionNotes: notes || undefined });
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <li className="rounded-lg border border-slate-200 p-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <StatusPill status={recoveryCase.status} />
        <span className="text-xs text-slate-500">{new Date(recoveryCase.createdAt).toLocaleString()}</span>
      </div>
      <p className="mt-1 text-xs text-slate-600">{recoveryCase.triggerReason}</p>
      {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
      {recoveryCase.status !== 'closed' && (
        <div className="mt-2 space-y-1.5">
          <Input placeholder="Resolution notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          <div className="flex flex-wrap gap-1.5">
            {recoveryCase.status === 'open' && (
              <Button size="sm" variant="secondary" disabled={Boolean(submitting)} onClick={() => void run('review', 'in_review')}>
                Mark in review
              </Button>
            )}
            <Button size="sm" variant="secondary" disabled={Boolean(submitting)} onClick={() => void run('created', 'case_created')}>
              Case created elsewhere
            </Button>
            <Button size="sm" disabled={Boolean(submitting)} onClick={() => void run('close', 'closed')}>
              Close
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}
