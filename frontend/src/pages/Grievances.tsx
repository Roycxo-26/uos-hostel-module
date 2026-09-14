import { useEffect, useState } from 'react';
import * as casesApi from '../api/cases';
import * as grievancesApi from '../api/grievances';
import { useAuth } from '../context/AuthContext';
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
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
  type AcknowledgementState,
  type Grievance,
  type GrievanceScope,
  type MyRights,
  type PolicyAcknowledgement,
  type PolicyVersion,
} from '../types';

/** HOSTEL-GAP-ANALYSIS.md D17.21 (TODO.md Batch 20) — a grievance
 * challenges a DECISION (allocation, transfer, staff behaviour, damage
 * assessment…), independently reviewed on appeal by someone other than
 * the original decision-maker. Not staff-only — every resident can raise
 * and track their own; only assignment/decision actions are staff-gated. */
function useResidentNames(): Record<string, string> {
  const [names, setNames] = useState<Record<string, string>>({});
  useEffect(() => {
    void casesApi.listResidentDirectory().then((residents) => {
      setNames(Object.fromEntries(residents.map((r) => [r.id, r.name])));
    });
  }, []);
  return names;
}

const SCOPE_LABELS: Record<GrievanceScope, string> = {
  allocation: 'Allocation',
  waitlist: 'Waitlist',
  transfer: 'Transfer',
  staff_behaviour: 'Staff behaviour',
  service_quality: 'Service quality',
  privacy_room_entry: 'Privacy / room entry',
  damage_assessment: 'Damage assessment',
  fee_charge: 'Fee / charge',
  safety_sanitation: 'Safety / sanitation',
  accessibility: 'Accessibility',
  retaliation: 'Retaliation',
  other: 'Other',
};

export function Grievances() {
  const { me } = useAuth();
  const isStaff = isPlatformAdmin(me) || hasHostelRole(me, 'warden');
  const residentNames = useResidentNames();

  const [grievances, setGrievances] = useState<Grievance[]>([]);
  const [rights, setRights] = useState<MyRights | null>(null);
  const [policyVersions, setPolicyVersions] = useState<PolicyVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [raiseOpen, setRaiseOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [target, setTarget] = useState<Grievance | null>(null);
  const [versionTarget, setVersionTarget] = useState<PolicyVersion | null>(null);

  async function load() {
    setLoading(true);
    const [list, myRights, versions] = await Promise.all([
      grievancesApi.listGrievances(),
      isStaff ? Promise.resolve(null) : grievancesApi.getMyRights(),
      isStaff ? grievancesApi.listPolicyVersions() : Promise.resolve([]),
    ]);
    setGrievances(list);
    setRights(myRights);
    setPolicyVersions(versions);
    setLoading(false);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pendingAcks = rights?.policies.filter((p) => p.myAcknowledgement?.state === 'pending') ?? [];

  return (
    <div>
      <PageHeader
        title="Grievances"
        description="Challenge an allocation, transfer, staff-behaviour, or other Hostel decision — independently reviewed on appeal."
        action={
          isStaff ? (
            <Button variant="secondary" onClick={() => setPublishOpen(true)}>
              Publish a policy version
            </Button>
          ) : (
            <Button onClick={() => setRaiseOpen(true)}>Raise a grievance</Button>
          )
        }
      />

      {loading ? (
        <PageSpinner />
      ) : (
        <>
          {!isStaff && pendingAcks.length > 0 && (
            <Card tone="warning" className="mb-6">
              <CardHeader>
                <p className="text-sm font-medium text-amber-800">Policy acknowledgements needed ({pendingAcks.length})</p>
              </CardHeader>
              <CardBody>
                <ul className="divide-y divide-slate-100">
                  {pendingAcks.map(({ version }) => (
                    <li key={version.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                      <div>
                        <p className="text-slate-700">{version.title}</p>
                        <p className="text-xs text-slate-500">
                          v{version.version}
                          {version.reAckDeadline && ` — acknowledge by ${version.reAckDeadline}`}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="danger" onClick={() => void grievancesApi.declinePolicy(version.id, 'Declined by resident').then(load)}>
                          Decline
                        </Button>
                        <Button size="sm" onClick={() => void grievancesApi.acknowledgePolicy(version.id).then(load)}>
                          Accept
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          )}

          {!isStaff && rights && (
            <Card className="mb-6">
              <CardHeader>
                <p className="text-sm font-medium text-slate-900">Your rights</p>
              </CardHeader>
              <CardBody className="space-y-1.5 text-sm text-slate-600">
                <p>{rights.routes.grievance}</p>
                <p>{rights.routes.appeal}</p>
                <p>{rights.routes.correctData}</p>
              </CardBody>
            </Card>
          )}

          {/* Real gap found live via SELF-TEST-GUIDE.md Batch 20 — a
              "resident declined, needs staff follow-up" notification with
              nowhere on the page to actually see who declined or why. The
              backend's acknowledgement roster (listAcknowledgementsForVersion)
              already existed; nothing ever called it. */}
          {isStaff && policyVersions.length > 0 && (
            <Card className="mb-6">
              <CardHeader>
                <p className="text-sm font-medium text-slate-900">Policy versions</p>
              </CardHeader>
              <CardBody className="p-0">
                <ul className="divide-y divide-slate-100">
                  {policyVersions.map((v) => (
                    <li key={v.id}>
                      <button type="button" className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left sm:px-5" onClick={() => setVersionTarget(v)}>
                        <div className="text-sm">
                          <p className="text-slate-700">{v.title}</p>
                          <p className="text-xs text-slate-500">
                            v{v.version} — {v.mandatory ? 'mandatory' : 'informational'}
                            {v.reAckDeadline && ` — acknowledge by ${v.reAckDeadline}`}
                          </p>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          )}

          {grievances.length === 0 ? (
            <EmptyState icon={<AlertIcon className="h-8 w-8" />} title="No grievances" description={isStaff ? 'Nothing raised yet.' : 'Raise one above if something needs review.'} />
          ) : (
            <Card>
              <ul className="divide-y divide-slate-100">
                {grievances.map((g) => (
                  <li key={g.id}>
                    <button type="button" className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left sm:px-5" onClick={() => setTarget(g)}>
                      <div className="text-sm">
                        <p className="flex items-center gap-2">
                          <StatusPill status={g.status} />
                          <span className="text-slate-700">{SCOPE_LABELS[g.scope]}</span>
                          {isStaff && <span className="text-xs text-slate-500">{residentNames[g.raisedBy] ?? g.raisedBy.slice(0, 8)}</span>}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-slate-500">{g.description}</p>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}

      {raiseOpen && <RaiseGrievanceSheet onClose={() => setRaiseOpen(false)} onRaised={load} />}
      {publishOpen && <PublishPolicyVersionSheet onClose={() => setPublishOpen(false)} onPublished={load} />}
      {target && <GrievanceDetailSheet grievance={target} isStaff={isStaff} onClose={() => setTarget(null)} onChanged={load} />}
      {versionTarget && <PolicyVersionRosterSheet version={versionTarget} onClose={() => setVersionTarget(null)} />}
    </div>
  );
}

/** D17.21 item 81 — the backend has supported this since it was built
 * (`grievancesApi.publishPolicyVersion`), but no screen ever called it: a
 * real gap found live via SELF-TEST-GUIDE.md Batch 20, not just an
 * oversight in this pass. Staff-only (route-gated by `grievance:manage`,
 * same as every other staff action on this page). */
function PublishPolicyVersionSheet({ onClose, onPublished }: { onClose: () => void; onPublished: () => void }) {
  const [documentKey, setDocumentKey] = useState('');
  const [version, setVersion] = useState('');
  const [title, setTitle] = useState('');
  const [mandatory, setMandatory] = useState(true);
  const [reAckDeadline, setReAckDeadline] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      await grievancesApi.publishPolicyVersion({
        documentKey,
        version,
        title,
        mandatory,
        reAckDeadline: reAckDeadline || undefined,
      });
      onPublished();
      onClose();
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
      title="Publish a policy version"
      footer={
        <Button fullWidth onClick={() => void handleSubmit()} disabled={submitting || !documentKey.trim() || !version.trim() || !title.trim()}>
          {submitting ? 'Publishing…' : 'Publish — notifies residents now'}
        </Button>
      }
    >
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <FieldWrapper label="Document key" htmlFor="pv-key" required hint="A short internal id, e.g. hostel-rules or anti-ragging-policy">
          <Input id="pv-key" value={documentKey} onChange={(e) => setDocumentKey(e.target.value)} />
        </FieldWrapper>
        <FieldWrapper label="Version" htmlFor="pv-version" required hint="e.g. 2026.1">
          <Input id="pv-version" value={version} onChange={(e) => setVersion(e.target.value)} />
        </FieldWrapper>
        <FieldWrapper label="Title" htmlFor="pv-title" required hint="What residents will see, e.g. Hostel Rules & Conduct Policy">
          <Input id="pv-title" value={title} onChange={(e) => setTitle(e.target.value)} />
        </FieldWrapper>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={mandatory} onChange={(e) => setMandatory(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-accent" />
          Mandatory — residents must acknowledge, not just informational
        </label>
        <FieldWrapper label="Re-acknowledgement deadline" htmlFor="pv-deadline" hint="Optional">
          <Input id="pv-deadline" type="date" value={reAckDeadline} onChange={(e) => setReAckDeadline(e.target.value)} />
        </FieldWrapper>
      </div>
    </Sheet>
  );
}

function RaiseGrievanceSheet({ onClose, onRaised }: { onClose: () => void; onRaised: () => void }) {
  const [scope, setScope] = useState<GrievanceScope>('other');
  const [description, setDescription] = useState('');
  const [subjectUserId, setSubjectUserId] = useState('');
  const [staffOptions, setStaffOptions] = useState<{ id: string; name: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    void casesApi.listCaseStaffDirectory().then(setStaffOptions);
  }, []);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      await grievancesApi.raiseGrievance({ scope, description, subjectUserId: subjectUserId || undefined });
      onRaised();
      onClose();
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
      title="Raise a grievance"
      footer={
        <Button fullWidth onClick={() => void handleSubmit()} disabled={submitting || !description.trim()}>
          {submitting ? 'Submitting…' : 'Submit grievance'}
        </Button>
      }
    >
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <FieldWrapper label="What is this about?" htmlFor="rg-scope">
          <Select id="rg-scope" value={scope} onChange={(e) => setScope(e.target.value as GrievanceScope)}>
            {Object.entries(SCOPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </FieldWrapper>
        {
          // Real gap found live via SELF-TEST-GUIDE.md Batch 20: this used
          // to only show for 'staff_behaviour', but the backend's own
          // self-review guard (assertNoConflict in grievances/service.ts)
          // checks subjectUserId regardless of scope — an Allocation or
          // Transfer grievance is just as often "the staff member who made
          // THIS decision shouldn't review the complaint about it," and
          // with no way to name that person, the conflict-of-interest
          // check could never actually trigger for any scope but this one.
          <FieldWrapper
            label="Staff member this concerns (if known)"
            htmlFor="rg-subject"
            hint={scope === 'staff_behaviour' ? 'Optional' : 'Optional — e.g. whoever made the decision you’re disputing'}
          >
            <Select id="rg-subject" value={subjectUserId} onChange={(e) => setSubjectUserId(e.target.value)}>
              <option value="">Not sure / prefer not to say</option>
              {staffOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </FieldWrapper>
        }
        <FieldWrapper label="Description" htmlFor="rg-description" required>
          <Textarea id="rg-description" value={description} onChange={(e) => setDescription(e.target.value)} />
        </FieldWrapper>
      </div>
    </Sheet>
  );
}

const ACK_STATE_LABELS: Record<AcknowledgementState, string> = {
  pending: 'Still pending',
  accepted: 'Accepted',
  declined: 'Declined',
};

function PolicyVersionRosterSheet({ version, onClose }: { version: PolicyVersion; onClose: () => void }) {
  const residentNames = useResidentNames();
  const [rows, setRows] = useState<PolicyAcknowledgement[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void grievancesApi
      .listAcknowledgementsForVersion(version.id)
      .then(setRows)
      .catch((err) => setError(errorMessage(err)));
  }, [version.id]);

  const declined = rows?.filter((r) => r.state === 'declined') ?? [];
  const rest = rows?.filter((r) => r.state !== 'declined') ?? [];

  return (
    <Sheet open onClose={onClose} title={version.title}>
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <p className="text-sm text-slate-600">
          v{version.version} — {version.mandatory ? 'mandatory' : 'informational'}
        </p>
        {!rows ? (
          <PageSpinner />
        ) : rows.length === 0 ? (
          <p className="text-sm text-slate-500">Nobody has a pending acknowledgement yet.</p>
        ) : (
          <>
            {declined.length > 0 && (
              <div>
                <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">Declined — needs follow-up</p>
                <ul className="divide-y divide-slate-100">
                  {declined.map((r) => (
                    <li key={r.id} className="py-2 text-sm">
                      <p className="flex items-center gap-2">
                        <StatusPill status={r.state} />
                        <span className="text-slate-700">{residentNames[r.studentId] ?? r.studentId.slice(0, 8)}</span>
                      </p>
                      {r.declineReason && <p className="mt-0.5 text-xs text-slate-500">"{r.declineReason}"</p>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {rest.length > 0 && (
              <div>
                <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">Everyone else</p>
                <ul className="divide-y divide-slate-100">
                  {rest.map((r) => (
                    <li key={r.id} className="flex items-center gap-2 py-2 text-sm">
                      <StatusPill status={r.state} />
                      <span className="text-slate-700">{residentNames[r.studentId] ?? r.studentId.slice(0, 8)}</span>
                      <span className="text-xs text-slate-500">{ACK_STATE_LABELS[r.state]}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </Sheet>
  );
}

function GrievanceDetailSheet({
  grievance,
  isStaff,
  onClose,
  onChanged,
}: {
  grievance: Grievance;
  isStaff: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { me } = useAuth();
  const residentNames = useResidentNames();
  const [staffOptions, setStaffOptions] = useState<{ id: string; name: string }[]>([]);
  const [reviewerId, setReviewerId] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<string | null>(null);

  useEffect(() => {
    void casesApi.listCaseStaffDirectory().then(setStaffOptions);
  }, []);

  const isOwner = grievance.raisedBy === me?.sub;

  async function run(action: string, fn: () => Promise<unknown>) {
    setSubmitting(action);
    setError(null);
    try {
      await fn();
      onChanged();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <Sheet open onClose={onClose} title="Grievance">
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <p className="text-sm text-slate-600">
          <StatusPill status={grievance.status} /> — {SCOPE_LABELS[grievance.scope]}
        </p>
        <p className="text-sm text-slate-700">{grievance.description}</p>
        {grievance.decisionReason && <Alert tone="warning">Decision: {grievance.decisionReason}</Alert>}
        {grievance.finalDecisionReason && <Alert tone="warning">Final (independent) decision: {grievance.finalDecisionReason}</Alert>}

        {isStaff && grievance.status === 'submitted' && (
          <FieldWrapper label="Assign a reviewer" htmlFor="gd-reviewer">
            <div className="flex gap-2">
              <Select id="gd-reviewer" value={reviewerId} onChange={(e) => setReviewerId(e.target.value)} className="flex-1">
                <option value="">Select staff</option>
                {staffOptions
                  .filter((s) => s.id !== grievance.subjectUserId)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
              </Select>
              <Button size="sm" onClick={() => void run('assign', () => grievancesApi.assignReviewer(grievance.id, reviewerId))} disabled={!reviewerId || Boolean(submitting)}>
                Assign
              </Button>
            </div>
          </FieldWrapper>
        )}

        {isStaff && grievance.status === 'under_review' && (
          <>
            <FieldWrapper label="Decision" htmlFor="gd-decision">
              <Textarea id="gd-decision" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </FieldWrapper>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => void run('return', () => grievancesApi.returnForInformation(grievance.id, notes))}
                disabled={!notes.trim() || Boolean(submitting)}
              >
                Return for more info
              </Button>
              <Button size="sm" onClick={() => void run('decide', () => grievancesApi.issueDecision(grievance.id, notes))} disabled={!notes.trim() || Boolean(submitting)}>
                Issue decision
              </Button>
            </div>
          </>
        )}

        {!isStaff && isOwner && grievance.status === 'returned_for_information' && (
          <FieldWrapper label="Your response" htmlFor="gd-respond">
            <div className="flex gap-2">
              <Textarea id="gd-respond" value={notes} onChange={(e) => setNotes(e.target.value)} className="flex-1" />
            </div>
            <Button size="sm" className="mt-2" onClick={() => void run('respond', () => grievancesApi.respondToInformationRequest(grievance.id, notes))} disabled={!notes.trim() || Boolean(submitting)}>
              Send response
            </Button>
          </FieldWrapper>
        )}

        {!isStaff && isOwner && grievance.status === 'decision_issued' && (
          <FieldWrapper label="Appeal this decision" htmlFor="gd-appeal">
            <Textarea id="gd-appeal" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Why should this be independently reviewed?" />
            <Button size="sm" className="mt-2" variant="danger" onClick={() => void run('appeal', () => grievancesApi.submitAppeal(grievance.id, notes))} disabled={!notes.trim() || Boolean(submitting)}>
              Submit appeal
            </Button>
          </FieldWrapper>
        )}

        {isStaff && grievance.status === 'appeal_submitted' && (
          <FieldWrapper label="Assign an independent reviewer" htmlFor="gd-indep" hint="Must differ from both the subject and the original decider">
            <div className="flex gap-2">
              <Select id="gd-indep" value={reviewerId} onChange={(e) => setReviewerId(e.target.value)} className="flex-1">
                <option value="">Select staff</option>
                {staffOptions
                  .filter((s) => s.id !== grievance.subjectUserId && s.id !== grievance.decidedBy)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
              </Select>
              <Button size="sm" onClick={() => void run('assign-indep', () => grievancesApi.assignIndependentReviewer(grievance.id, reviewerId))} disabled={!reviewerId || Boolean(submitting)}>
                Assign
              </Button>
            </div>
          </FieldWrapper>
        )}

        {isStaff && grievance.status === 'independent_review' && (
          <FieldWrapper label="Final decision" htmlFor="gd-final">
            <Textarea id="gd-final" value={notes} onChange={(e) => setNotes(e.target.value)} />
            <Button size="sm" className="mt-2" onClick={() => void run('final', () => grievancesApi.issueFinalDecision(grievance.id, notes))} disabled={!notes.trim() || Boolean(submitting)}>
              Issue final decision
            </Button>
          </FieldWrapper>
        )}

        {isStaff && ['decision_issued', 'final_decision'].includes(grievance.status) && (
          <Button size="sm" fullWidth onClick={() => void run('resolve', () => grievancesApi.resolveGrievance(grievance.id))} disabled={Boolean(submitting)}>
            Mark resolved
          </Button>
        )}
        {isStaff && grievance.status === 'resolved' && (
          <Button size="sm" fullWidth onClick={() => void run('close', () => grievancesApi.closeGrievance(grievance.id))} disabled={Boolean(submitting)}>
            Close
          </Button>
        )}

        {!isStaff && isOwner && ['submitted', 'under_review', 'returned_for_information'].includes(grievance.status) && (
          <Button size="sm" variant="danger" fullWidth onClick={() => void run('withdraw', () => grievancesApi.withdrawGrievance(grievance.id))} disabled={Boolean(submitting)}>
            Withdraw
          </Button>
        )}
      </div>
    </Sheet>
  );
}
