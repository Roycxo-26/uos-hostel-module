import { useEffect, useState } from 'react';
import * as casesApi from '../api/cases';
import * as headcountApi from '../api/headcount';
import * as movementApi from '../api/movements';
import * as structureApi from '../api/structure';
import { useAuth } from '../context/AuthContext';
import { useLabel } from '../context/TenantSettingsContext';
import {
  Alert,
  Button,
  Card,
  DataList,
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
import { ClipboardIcon } from '../design-system/icons';
import type { Column } from '../design-system';
import { errorMessage } from '../lib/errorMessage';
import {
  hasHostelRole,
  isPlatformAdmin,
  type HeadcountScopeType,
  type HeadcountSession,
  type MovementRequest,
  type MovementRequestDetail,
  type MovementType,
  type ResidentGuardian,
} from '../types';

// D17.10 depth (TODO.md Batch 23) — twelve BRD movement types.
const MOVEMENT_TYPE_LABELS: Record<MovementType, string> = {
  gate_pass: 'Gate pass (same-day)',
  leave: 'Leave (overnight / multi-day)',
  night_out: 'Night-out',
  weekend_leave: 'Weekend leave',
  vacation_leave: 'Vacation leave',
  academic_field_visit: 'Academic / field-visit absence',
  official_university_movement: 'Official university movement',
  medical_leave: 'Medical leave',
  emergency_leave: 'Emergency leave',
  extended_leave: 'Extended leave',
  late_return_extension: 'Late-return extension',
  mass_holiday_leave: 'Mass holiday leave',
};

/** Real gap, found live — same raw-ID display already fixed on
 * Allocations.tsx/Checkout.tsx/Cases.tsx, just hadn't reached this page's
 * movement requests / headcount entries yet (only scope labels — which
 * room/floor a session belongs to — were fixed earlier; the resident IDs
 * inside them weren't). Same per-file hook duplication this codebase
 * already uses for fetchScopeOptions/fetchRoomOptions. */
function useResidentNames(): Record<string, string> {
  const [names, setNames] = useState<Record<string, string>>({});
  useEffect(() => {
    void casesApi.listResidentDirectory().then((residents) => {
      setNames(Object.fromEntries(residents.map((r) => [r.id, r.name])));
    });
  }, []);
  return names;
}

function studentLabel(names: Record<string, string>, id: string): string {
  return names[id] ?? id.slice(0, 8);
}

/**
 * UOS HOSTEL BR.md §8 — Leave/Gate Pass and Headcount share one nav section
 * in the BR's own navigation tree (§5), so they share one page here too,
 * ahead of the full navbar overhaul (flow.md §10A, TODO.md Batch 8).
 */
export function Movement() {
  const { me } = useAuth();
  const isStaff = isPlatformAdmin(me) || hasHostelRole(me, 'warden');
  const residentNames = useResidentNames();

  const [movements, setMovements] = useState<MovementRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [requestOpen, setRequestOpen] = useState(false);
  const [decideTarget, setDecideTarget] = useState<MovementRequest | null>(null);
  const [tab, setTab] = useState<'requests' | 'gate'>('requests');

  // D17.10 item 90 — a resident's own registered guardian contacts.
  const [guardians, setGuardians] = useState<ResidentGuardian[]>([]);
  const [addGuardianOpen, setAddGuardianOpen] = useState(false);

  const [sessions, setSessions] = useState<HeadcountSession[]>([]);
  const [openSessionOpen, setOpenSessionOpen] = useState(false);
  const [sessionDetailId, setSessionDetailId] = useState<string | null>(null);
  // Real gap, found live via SELF-TEST-GUIDE.md C8 — the sessions list
  // showed every session ever opened, across every room/floor and every
  // date, all mixed together with no way to tell them apart: raw scope IDs
  // ("floor · d3e31fcd") that mean nothing without cross-referencing
  // Structure separately, no way to isolate "the one I just opened," and no
  // filter. `scopeLabels` resolves IDs to the same human-readable path
  // `fetchScopeOptions` already builds for the picker below; `scopeFilter`
  // narrows the list by scope type.
  const [scopeLabels, setScopeLabels] = useState<Record<string, string>>({});
  const [scopeFilter, setScopeFilter] = useState<'' | HeadcountScopeType>('');
  // Real gap, found live via SELF-TEST-GUIDE.md C8 — GET
  // /headcount/sessions/reconciliation existed end-to-end (backend route +
  // api/headcount.ts client) with nothing ever calling it, same
  // "wired at the API layer, dead at the UI layer" shape as
  // recordReturn/handleRecordReturn were before C7's fix. The page's own
  // subtitle already promised "daily headcount reconciliation" with no
  // reconciliation view anywhere to back it up.
  const [openIssues, setOpenIssues] = useState<Awaited<ReturnType<typeof headcountApi.listOpenIssues>>>([]);

  async function load() {
    setLoading(true);
    const [m, s, issues, labels, g] = await Promise.all([
      movementApi.listMovements(),
      headcountApi.listSessions(),
      isStaff ? headcountApi.listOpenIssues() : Promise.resolve([]),
      buildScopeLabelIndex(),
      movementApi.listMyGuardians(),
    ]);
    setMovements(m);
    setSessions(s);
    setOpenIssues(issues);
    setScopeLabels(labels);
    setGuardians(g);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  const movementColumns: Column<MovementRequest>[] = [
    { key: 'student', header: 'Student', primary: true, render: (m) => <span className="text-xs">{studentLabel(residentNames, m.studentId)}</span> },
    { key: 'destination', header: 'Destination', render: (m) => m.destination },
    { key: 'status', header: 'Status', render: (m) => <StatusPill status={m.status} domain="movement" /> },
    { key: 'out', header: 'Out', render: (m) => new Date(m.requestedOut).toLocaleString() },
    { key: 'return', header: 'Return', render: (m) => new Date(m.requestedReturn).toLocaleString() },
  ];

  if (loading) return <PageSpinner />;

  return (
    <div>
      <PageHeader
        title="Leave, Gate Pass & Headcount"
        description="Movement requests and daily headcount reconciliation."
        action={
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button variant="secondary" onClick={() => setOpenSessionOpen(true)}>
              Open headcount session
            </Button>
            <Button onClick={() => setRequestOpen(true)}>Request leave / gate pass</Button>
          </div>
        }
      />

      {/* D17.10 item 94 — the Gate console is a separate, minimal-
          disclosure tab, staff-only, not a fork of the full Movement view. */}
      {isStaff && (
        <div className="mb-6 flex gap-1 border-b border-slate-200">
          {(
            [
              ['requests', 'Requests & Headcount'],
              ['gate', 'Gate Console'],
            ] as ['requests' | 'gate', string][]
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setTab(value)}
              className={`px-3 py-2 text-sm font-medium ${tab === value ? 'border-b-2 border-accent text-accent' : 'text-slate-500 hover:text-slate-700'}`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {tab === 'gate' ? (
        <GateConsoleTab residentNames={residentNames} />
      ) : (
        <>
          <div className="mb-6 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-slate-900">My guardians</h2>
            <Button size="sm" variant="secondary" onClick={() => setAddGuardianOpen(true)}>
              Add guardian
            </Button>
          </div>
          {guardians.length === 0 ? (
            <Alert tone="warning">
              No guardian contact on file yet — add one and have staff verify it before you can submit a movement request.
            </Alert>
          ) : (
            <Card className="mb-8">
              <ul className="divide-y divide-slate-100">
                {guardians.map((g) => (
                  <li key={g.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                    <div>
                      <p className="font-medium text-slate-800">
                        {g.name} <span className="font-normal text-slate-500">({g.relationship})</span>
                        {g.isPrimary && <span className="ml-2 text-xs text-slate-500">Primary</span>}
                      </p>
                      <p className="text-xs text-slate-500">{g.mobileNumber}</p>
                    </div>
                    {g.verified ? <StatusPill status="verified" /> : <StatusPill status="pending" />}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <h2 className="mb-3 text-sm font-semibold text-slate-900">Movement requests</h2>
          {movements.length === 0 ? (
            <EmptyState icon={<ClipboardIcon className="h-8 w-8" />} title="No movement requests" description="Nothing here yet." />
          ) : (
            <Card>
              <DataList
                columns={movementColumns}
                rows={movements}
                onRowClick={(row) =>
                  (isStaff && ['requested', 'approved', 'out', 'overdue'].includes(row.status)) ||
                  (row.studentId === me?.sub && ['out', 'overdue'].includes(row.status))
                    ? setDecideTarget(row)
                    : undefined
                }
              />
            </Card>
          )}

          <div className="mb-3 mt-8 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-slate-900">Headcount sessions</h2>
            {sessions.length > 0 && (
              <div className="w-40">
                <FieldWrapper label="Filter by scope" htmlFor="hc-list-scope-filter">
                  <Select
                    id="hc-list-scope-filter"
                    value={scopeFilter}
                    onChange={(e) => setScopeFilter(e.target.value as '' | HeadcountScopeType)}
                  >
                    <option value="">All scopes</option>
                    <option value="room">Room</option>
                    <option value="floor">Floor</option>
                    <option value="hostel">Hostel</option>
                  </Select>
                </FieldWrapper>
              </div>
            )}
          </div>
          {sessions.length === 0 ? (
            <EmptyState icon={<ClipboardIcon className="h-8 w-8" />} title="No headcount sessions" description="Open one above to get started." />
          ) : (
            <Card>
              <ul className="divide-y divide-slate-100">
                {sessions
                  .filter((s) => !scopeFilter || s.scopeType === scopeFilter)
                  // Open sessions first (the ones you can still act on), most
                  // recent date first within each group — the backend already
                  // sorts by session_date desc, this just keeps closed history
                  // from burying what's actually actionable today.
                  .slice()
                  .sort((a, b) => (a.status === b.status ? 0 : a.status === 'open' ? -1 : 1))
                  .map((s) => (
                    <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
                      <div className="text-sm">
                        <p className="flex items-center gap-2">
                          <span className="font-medium text-slate-800">{scopeLabels[s.scopeId] ?? `${s.scopeType} · ${s.scopeId.slice(0, 8)}`}</span>
                          <StatusPill status={s.status} />
                          {s.sessionDate === todayDateStringClient() && (
                            <span className="inline-flex items-center rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700">Today</span>
                          )}
                        </p>
                        <p className="text-xs text-slate-500">
                          {s.scopeType} · {s.sessionDate}
                        </p>
                      </div>
                      <Button size="sm" variant="secondary" onClick={() => setSessionDetailId(s.id)}>
                        View
                      </Button>
                    </li>
                  ))}
              </ul>
            </Card>
          )}

          {isStaff && openIssues.length > 0 && (
            <>
              <h2 className="mb-3 mt-8 text-sm font-semibold text-slate-900">Reconciliation queue</h2>
              <Card>
                <ul className="divide-y divide-slate-100">
                  {openIssues.map((issue) => (
                    <li key={issue.id} className="px-4 py-3 text-sm sm:px-5">
                      <p className="flex items-center gap-2">
                        <span className="text-xs text-slate-500">{studentLabel(residentNames, issue.studentId)}</span>
                        <StatusPill status={issue.status} />
                        <span className="text-xs text-slate-500">
                          {scopeLabels[issue.scopeId] ?? `${issue.scopeType} · ${issue.scopeId.slice(0, 8)}`} · {issue.sessionDate}
                        </span>
                      </p>
                      {issue.note && <p className="mt-0.5 text-xs text-slate-500">Note: {issue.note}</p>}
                    </li>
                  ))}
                </ul>
              </Card>
            </>
          )}
        </>
      )}

      <RequestMovementSheet open={requestOpen} onClose={() => setRequestOpen(false)} onRequested={load} guardians={guardians} />
      {decideTarget && (
        <DecideMovementSheet movement={decideTarget} isStaff={isStaff} onClose={() => setDecideTarget(null)} onDecided={load} />
      )}
      <AddGuardianSheet open={addGuardianOpen} onClose={() => setAddGuardianOpen(false)} onAdded={load} />
      <OpenHeadcountSessionSheet open={openSessionOpen} onClose={() => setOpenSessionOpen(false)} onOpened={load} />
      {sessionDetailId && (
        <HeadcountSessionSheet sessionId={sessionDetailId} scopeLabels={scopeLabels} onClose={() => setSessionDetailId(null)} onChanged={load} />
      )}
    </div>
  );
}

function RequestMovementSheet({
  open,
  onClose,
  onRequested,
  guardians,
}: {
  open: boolean;
  onClose: () => void;
  onRequested: () => void;
  guardians: ResidentGuardian[];
}) {
  const [movementType, setMovementType] = useState<MovementType>('gate_pass');
  const [destination, setDestination] = useState('');
  const [purpose, setPurpose] = useState('');
  const [requestedOut, setRequestedOut] = useState('');
  const [requestedReturn, setRequestedReturn] = useState('');
  const [guardianId, setGuardianId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const verifiedGuardians = guardians.filter((g) => g.verified);

  useEffect(() => {
    if (open && !guardianId) setGuardianId(verifiedGuardians.find((g) => g.isPrimary)?.id ?? verifiedGuardians[0]?.id ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, guardians]);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      await movementApi.requestMovement({
        movementType,
        destination,
        purpose,
        requestedOut: new Date(requestedOut).toISOString(),
        requestedReturn: new Date(requestedReturn).toISOString(),
        guardianId,
      });
      onRequested();
      onClose();
      setDestination('');
      setPurpose('');
      setRequestedOut('');
      setRequestedReturn('');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit = destination.trim() && purpose.trim() && requestedOut && requestedReturn && guardianId;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Request leave / gate pass"
      footer={
        <Button fullWidth onClick={() => void handleSubmit()} disabled={submitting || !canSubmit}>
          {submitting ? 'Submitting…' : 'Submit request'}
        </Button>
      }
    >
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        {verifiedGuardians.length === 0 && (
          <Alert tone="warning">
            You need at least one verified guardian contact before you can request movement — add one above and ask staff to
            verify it.
          </Alert>
        )}
        <FieldWrapper label="Type" htmlFor="mv-type">
          <Select id="mv-type" value={movementType} onChange={(e) => setMovementType(e.target.value as MovementType)}>
            {Object.entries(MOVEMENT_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </FieldWrapper>
        <FieldWrapper label="Guardian confirmation via" htmlFor="mv-guardian" required>
          <Select id="mv-guardian" value={guardianId} onChange={(e) => setGuardianId(e.target.value)} disabled={verifiedGuardians.length === 0}>
            <option value="">Select a verified guardian…</option>
            {verifiedGuardians.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name} ({g.relationship})
              </option>
            ))}
          </Select>
        </FieldWrapper>
        <FieldWrapper label="Destination" htmlFor="mv-destination" required>
          <Input id="mv-destination" value={destination} onChange={(e) => setDestination(e.target.value)} />
        </FieldWrapper>
        <FieldWrapper label="Purpose" htmlFor="mv-purpose" required>
          <Textarea id="mv-purpose" value={purpose} onChange={(e) => setPurpose(e.target.value)} />
        </FieldWrapper>
        <div className="grid grid-cols-2 gap-3">
          <FieldWrapper label="Out" htmlFor="mv-out" required>
            <Input id="mv-out" type="datetime-local" value={requestedOut} onChange={(e) => setRequestedOut(e.target.value)} />
          </FieldWrapper>
          <FieldWrapper label="Expected return" htmlFor="mv-return" required>
            <Input id="mv-return" type="datetime-local" value={requestedReturn} onChange={(e) => setRequestedReturn(e.target.value)} />
          </FieldWrapper>
        </div>
      </div>
    </Sheet>
  );
}

function AddGuardianSheet({ open, onClose, onAdded }: { open: boolean; onClose: () => void; onAdded: () => void }) {
  const [name, setName] = useState('');
  const [relationship, setRelationship] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [isPrimary, setIsPrimary] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      await movementApi.addGuardian({ name, relationship, mobileNumber, isPrimary });
      onAdded();
      onClose();
      setName('');
      setRelationship('');
      setMobileNumber('');
      setIsPrimary(false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Add a guardian contact"
      footer={
        <Button fullWidth onClick={() => void handleSubmit()} disabled={submitting || !name.trim() || !relationship.trim() || !mobileNumber.trim()}>
          {submitting ? 'Adding…' : 'Add guardian'}
        </Button>
      }
    >
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <Alert>Staff must verify this contact before it can be used to confirm a movement request.</Alert>
        <FieldWrapper label="Name" htmlFor="ag-name" required>
          <Input id="ag-name" value={name} onChange={(e) => setName(e.target.value)} />
        </FieldWrapper>
        <FieldWrapper label="Relationship" htmlFor="ag-relationship" required hint="e.g. Father, Mother, Legal Guardian">
          <Input id="ag-relationship" value={relationship} onChange={(e) => setRelationship(e.target.value)} />
        </FieldWrapper>
        <FieldWrapper label="Mobile number" htmlFor="ag-mobile" required>
          <Input id="ag-mobile" value={mobileNumber} onChange={(e) => setMobileNumber(e.target.value)} placeholder="+91XXXXXXXXXX" />
        </FieldWrapper>
        <label className="flex min-h-touch cursor-pointer items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={isPrimary} onChange={(e) => setIsPrimary(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-accent" />
          Set as primary guardian
        </label>
      </div>
    </Sheet>
  );
}

/**
 * D17.10 depth (TODO.md Batch 23) — this sheet now covers three genuinely
 * different jobs behind one "tap a row" entry point: staff deciding a
 * request (guardian-confirmation-gated), staff running the Gate/return
 * actions, and a resident requesting their own extension while out. Kept
 * as one component (branching hard on isStaff/status) rather than three
 * separate sheets, matching the same "one sheet, branch by status" shape
 * this file already used before this batch.
 */
function DecideMovementSheet({
  movement,
  isStaff,
  onClose,
  onDecided,
}: {
  movement: MovementRequest;
  isStaff: boolean;
  onClose: () => void;
  onDecided: () => void;
}) {
  const residentNames = useResidentNames();
  const [detail, setDetail] = useState<MovementRequestDetail | null>(null);
  const [guardian, setGuardian] = useState<ResidentGuardian | null>(null);
  const [decision, setDecision] = useState<'approved' | 'rejected'>('approved');
  const [reason, setReason] = useState('');
  const [bypass, setBypass] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [callOutcome, setCallOutcome] = useState<'approve' | 'decline' | 'no_response'>('approve');
  const [callRemark, setCallRemark] = useState('');
  const [extensionReturn, setExtensionReturn] = useState('');
  const [extensionReason, setExtensionReason] = useState('');
  const [extensionDecisionReason, setExtensionDecisionReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<string | null>(null);

  async function refresh() {
    const d = await movementApi.getMovement(movement.id);
    setDetail(d);
    if (d.guardianId) setGuardian(await movementApi.getGuardian(d.guardianId));
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movement.id]);

  async function run(action: string, fn: () => Promise<unknown>, closeAfter = false) {
    setSubmitting(action);
    setError(null);
    try {
      await fn();
      await refresh();
      onDecided();
      if (closeAfter) onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(null);
    }
  }

  if (!detail) {
    return (
      <Sheet open onClose={onClose} title="Movement request">
        <PageSpinner />
      </Sheet>
    );
  }

  const isPending = detail.status === 'requested';
  const isApproved = detail.status === 'approved';
  const isOutOrOverdue = detail.status === 'out' || detail.status === 'overdue';

  const currentConfirmation = detail.confirmations.filter((c) => c.requestVersion === detail.requestVersion).slice(-1)[0] ?? null;
  const isConfirmed = currentConfirmation?.status === 'verified';
  const pendingExtension = detail.extensions.find((e) => e.status === 'pending') ?? null;

  return (
    <Sheet open onClose={onClose} title={isPending ? 'Decide movement request' : isApproved ? 'Record exit' : 'Movement in progress'}>
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <p className="text-sm text-slate-600">
          Student <span>{studentLabel(residentNames, detail.studentId)}</span> → {detail.destination}
        </p>
        <p className="text-sm text-slate-500">
          {MOVEMENT_TYPE_LABELS[detail.movementType]} — {detail.purpose}
        </p>

        {guardian && (
          <p className="text-xs text-slate-500">
            Guardian: {guardian.name} ({guardian.relationship}) — {guardian.mobileNumber}
          </p>
        )}

        {isPending && isStaff && (
          <>
            <p className="text-sm">
              Guardian confirmation:{' '}
              {currentConfirmation ? <StatusPill status={currentConfirmation.status} /> : <StatusPill status="pending" />}
              {currentConfirmation && <span className="ml-2 text-xs text-slate-500">via {currentConfirmation.method === 'otp' ? 'OTP' : 'call'}</span>}
            </p>

            {!isConfirmed && currentConfirmation?.method === 'otp' && currentConfirmation.status === 'pending' && (
              <div className="flex gap-2">
                <Input
                  placeholder="6-digit code from student"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value)}
                  maxLength={6}
                  className="flex-1"
                />
                <Button
                  size="sm"
                  onClick={() => void run('otp', () => movementApi.verifyGuardianOtp(detail.id, otpCode))}
                  disabled={otpCode.length !== 6 || Boolean(submitting)}
                >
                  Verify
                </Button>
              </div>
            )}
            {!isConfirmed && (
              <Button size="sm" variant="secondary" onClick={() => void run('resend', () => movementApi.resendGuardianOtp(detail.id))} disabled={Boolean(submitting)}>
                {submitting === 'resend' ? 'Resending…' : 'Resend OTP'}
              </Button>
            )}

            {!isConfirmed && (
              <div className="space-y-2 rounded-lg border border-slate-200 p-3">
                <p className="text-xs font-medium text-slate-700">OTP failed / unavailable — call the guardian instead</p>
                <Select value={callOutcome} onChange={(e) => setCallOutcome(e.target.value as typeof callOutcome)}>
                  <option value="approve">Call confirmed — Approve</option>
                  <option value="decline">Call confirmed — Decline</option>
                  <option value="no_response">No response — guardian did not pick up</option>
                </Select>
                <Textarea placeholder="Mandatory remark (who you spoke to, what they said)" value={callRemark} onChange={(e) => setCallRemark(e.target.value)} />
                <Button
                  size="sm"
                  fullWidth
                  onClick={() =>
                    void run('call', () =>
                      movementApi.recordGuardianCallConfirmation(detail.id, {
                        guardianId: detail.guardianId!,
                        outcome: callOutcome,
                        remark: callRemark,
                      })
                    )
                  }
                  disabled={!callRemark.trim() || !detail.guardianId || Boolean(submitting)}
                >
                  Record call confirmation
                </Button>
              </div>
            )}

            <FieldWrapper label="Decision" htmlFor="mv-decision">
              <Select id="mv-decision" value={decision} onChange={(e) => setDecision(e.target.value as typeof decision)}>
                <option value="approved">Approve</option>
                <option value="rejected">Reject</option>
              </Select>
            </FieldWrapper>
            {decision === 'approved' && !isConfirmed && detail.movementType === 'emergency_leave' && (
              <label className="flex min-h-touch cursor-pointer items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={bypass} onChange={(e) => setBypass(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-accent" />
                Provisional emergency approval without guardian confirmation (follow-up stays owed)
              </label>
            )}
            <FieldWrapper label="Reason" htmlFor="mv-decide-reason" required>
              <Textarea id="mv-decide-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
            </FieldWrapper>
            <Button
              fullWidth
              onClick={() =>
                void run('decide', () => movementApi.decideMovement(detail.id, { decision, reason, bypassGuardianConfirmation: bypass }), true)
              }
              disabled={!reason || (decision === 'approved' && !isConfirmed && !bypass) || Boolean(submitting)}
            >
              {submitting === 'decide' ? 'Saving…' : 'Save decision'}
            </Button>
          </>
        )}
        {isPending && !isStaff && <p className="text-sm text-slate-500">Awaiting guardian confirmation and Warden decision.</p>}

        {isApproved && isStaff && (
          <>
            <p className="text-sm text-slate-500">Approved — waiting for the resident to physically leave.</p>
            <Button fullWidth onClick={() => void run('exit', () => movementApi.recordExit(detail.id), true)} disabled={Boolean(submitting)}>
              {submitting === 'exit' ? 'Recording…' : 'Record actual exit now'}
            </Button>
          </>
        )}

        {isOutOrOverdue && (
          <>
            <p className="text-sm text-slate-500">
              {detail.status === 'overdue' ? 'Overdue — expected back ' : 'Out — expected back '}
              {new Date(detail.effectiveReturn ?? detail.requestedReturn).toLocaleString()}.
            </p>
            {isStaff && (
              <Button fullWidth onClick={() => void run('return', () => movementApi.recordReturn(detail.id), true)} disabled={Boolean(submitting)}>
                {submitting === 'return' ? 'Recording…' : 'Record actual return now'}
              </Button>
            )}

            {pendingExtension ? (
              <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
                <p className="text-xs font-medium text-amber-800">
                  Extension requested — new return {new Date(pendingExtension.requestedNewReturn).toLocaleString()}
                </p>
                <p className="text-xs text-amber-700">{pendingExtension.reason}</p>
                {isStaff && (
                  <>
                    <Textarea placeholder="Decision reason" value={extensionDecisionReason} onChange={(e) => setExtensionDecisionReason(e.target.value)} />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() =>
                          void run('ext-approve', () =>
                            movementApi.decideExtension(pendingExtension.id, { decision: 'approved', reason: extensionDecisionReason })
                          )
                        }
                        disabled={!extensionDecisionReason.trim() || Boolean(submitting)}
                      >
                        Approve extension
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() =>
                          void run('ext-reject', () =>
                            movementApi.decideExtension(pendingExtension.id, { decision: 'rejected', reason: extensionDecisionReason })
                          )
                        }
                        disabled={!extensionDecisionReason.trim() || Boolean(submitting)}
                      >
                        Reject
                      </Button>
                    </div>
                    <p className="text-xs text-amber-700">
                      Needs a fresh guardian confirmation before it can be approved — use the same OTP/call flow above once staff
                      resend it.
                    </p>
                  </>
                )}
              </div>
            ) : (
              !isStaff && (
                <div className="space-y-2 rounded-lg border border-slate-200 p-3">
                  <p className="text-xs font-medium text-slate-700">Request an extension</p>
                  <Input type="datetime-local" value={extensionReturn} onChange={(e) => setExtensionReturn(e.target.value)} />
                  <Textarea placeholder="Reason" value={extensionReason} onChange={(e) => setExtensionReason(e.target.value)} />
                  <Button
                    size="sm"
                    fullWidth
                    onClick={() =>
                      void run('ext-request', () =>
                        movementApi.requestExtension(detail.id, { requestedNewReturn: new Date(extensionReturn).toISOString(), reason: extensionReason })
                      )
                    }
                    disabled={!extensionReturn || !extensionReason.trim() || Boolean(submitting)}
                  >
                    Submit extension request
                  </Button>
                </div>
              )
            )}
          </>
        )}
      </div>
    </Sheet>
  );
}

/**
 * D17.10 item 94 — the Gate console. Deliberately minimal: search + OUT/IN
 * only, not the full request detail (decision reason, purpose, etc.) the
 * main Requests tab shows — matches the policy's own "simple screen" ask.
 * Reuses the same recordExit/recordReturn actions the full Movement view
 * already had; nothing here is a new state transition, only a focused
 * screen for one. Manual search stays the permanent fallback even once
 * real RFID/QR hardware is connected later, per the policy's own
 * "Security must still be able to search manually if hardware goes down"
 * rule — this screen doesn't assume a scanner exists at all.
 */
function GateConsoleTab({ residentNames }: { residentNames: Record<string, string> }) {
  const [queue, setQueue] = useState<MovementRequest[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setQueue(await movementApi.listGateQueue());
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  async function handleOut(id: string) {
    setSubmitting(id);
    setError(null);
    try {
      await movementApi.recordExit(id);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(null);
    }
  }

  async function handleIn(id: string) {
    setSubmitting(id);
    setError(null);
    try {
      await movementApi.recordReturn(id);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(null);
    }
  }

  const filtered = queue.filter((m) => {
    if (!search.trim()) return true;
    const name = studentLabel(residentNames, m.studentId).toLowerCase();
    return name.includes(search.toLowerCase()) || m.id.toLowerCase().includes(search.toLowerCase());
  });

  if (loading) return <PageSpinner />;

  return (
    <div>
      <div className="mb-4 max-w-sm">
        <FieldWrapper label="Search by name, ID or gate pass ID" htmlFor="gate-search">
          <Input id="gate-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" />
        </FieldWrapper>
      </div>
      {error && <Alert>{error}</Alert>}
      {filtered.length === 0 ? (
        <EmptyState icon={<ClipboardIcon className="h-8 w-8" />} title="Nothing pending" description="No approved or out-and-about gate passes right now." />
      ) : (
        <Card>
          <ul className="divide-y divide-slate-100">
            {filtered.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm">
                    <span className="font-medium text-slate-800">{studentLabel(residentNames, m.studentId)}</span>
                    <StatusPill status={m.status} domain="movement" />
                  </p>
                  <p className="text-xs text-slate-500">
                    Gate pass {m.id.slice(0, 8)} — expected back {new Date(m.effectiveReturn ?? m.requestedReturn).toLocaleString()}
                  </p>
                </div>
                {m.status === 'approved' ? (
                  <Button size="sm" onClick={() => void handleOut(m.id)} disabled={Boolean(submitting)}>
                    {submitting === m.id ? 'Recording…' : 'OUT'}
                  </Button>
                ) : (
                  <Button size="sm" variant="secondary" onClick={() => void handleIn(m.id)} disabled={Boolean(submitting)}>
                    {submitting === m.id ? 'Recording…' : 'IN'}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

interface ScopeOption {
  id: string;
  label: string;
}

/**
 * Real gap, found by a Student testing SELF-TEST-GUIDE.md's C3 — the
 * Structure screen shows a Room/Floor/Hostel by its `code`/`name`, never its
 * UUID, so "paste the room/floor/hostel ID" had no way to actually be
 * followed; nothing in the UI ever surfaced the ID to paste. Same fix
 * Allocations.tsx's fetchAvailableBeds() already applies to bed selection —
 * fetch the real tree and build a human-readable picker instead of asking
 * for a raw UUID nobody can discover.
 */
async function fetchScopeOptions(scopeType: HeadcountScopeType): Promise<ScopeOption[]> {
  const hostels = await structureApi.listHostels();

  if (scopeType === 'hostel') {
    return hostels.map((h) => ({ id: h.id, label: `${h.name} (${h.code})` }));
  }

  const trees = await Promise.all(hostels.map((h) => structureApi.getHostelTree(h.id)));
  const options: ScopeOption[] = [];
  for (const tree of trees) {
    for (const block of tree.blocks) {
      for (const floor of block.floors) {
        if (scopeType === 'floor') {
          options.push({ id: floor.id, label: `${tree.name} / ${block.code} / Fl.${floor.number}` });
          continue;
        }
        for (const room of floor.rooms) {
          options.push({ id: room.id, label: `${tree.name} / ${block.code} / Fl.${floor.number} / ${room.code}` });
        }
      }
    }
  }
  return options;
}

/** Same tree walk as fetchScopeOptions, but building one combined id→label
 * index across all three scope types in a single pass — the sessions list
 * needs to resolve whatever scope a past session was opened against,
 * not just the one currently selected in the "open a session" picker. */
async function buildScopeLabelIndex(): Promise<Record<string, string>> {
  const hostels = await structureApi.listHostels();
  const trees = await Promise.all(hostels.map((h) => structureApi.getHostelTree(h.id)));
  const index: Record<string, string> = {};
  hostels.forEach((h) => {
    index[h.id] = `${h.name} (${h.code})`;
  });
  for (const tree of trees) {
    for (const block of tree.blocks) {
      for (const floor of block.floors) {
        index[floor.id] = `${tree.name} / ${block.code} / Fl.${floor.number}`;
        for (const room of floor.rooms) {
          index[room.id] = `${tree.name} / ${block.code} / Fl.${floor.number} / ${room.code}`;
        }
      }
    }
  }
  return index;
}

/** Matches headcount/service.ts's own todayDateString() exactly (UTC
 * slice), so the "Today" tag lines up with what the backend actually
 * considers today when a session gets opened, not the browser's notion of
 * a calendar day. */
function todayDateStringClient(): string {
  return new Date().toISOString().slice(0, 10);
}

function OpenHeadcountSessionSheet({ open, onClose, onOpened }: { open: boolean; onClose: () => void; onOpened: () => void }) {
  // Real gap, found live via SELF-TEST-GUIDE.md C13 — this hint text was a
  // hardcoded string, never wired to the tenant's own terminology, unlike
  // every other staff-facing label in the app (see useLabel's own callers
  // elsewhere). Renaming "Room Head" in Settings had no way to ever reach
  // this specific paragraph.
  const roomHeadLabel = useLabel('roomCrLabel', 'Room Head');
  const floorInchargeLabel = useLabel('floorInchargeLabel', 'Floor In-charge');
  const [scopeType, setScopeType] = useState<HeadcountScopeType>('room');
  const [scopeId, setScopeId] = useState('');
  const [options, setOptions] = useState<ScopeOption[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoadingOptions(true);
    setScopeId('');
    void fetchScopeOptions(scopeType).then((opts) => {
      setOptions(opts);
      setLoadingOptions(false);
    });
  }, [open, scopeType]);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      await headcountApi.openSession({ scopeType, scopeId });
      onOpened();
      onClose();
      setScopeId('');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Open a headcount session"
      footer={
        <Button fullWidth onClick={() => void handleSubmit()} disabled={submitting || !scopeId}>
          {submitting ? 'Opening…' : "Open today's session"}
        </Button>
      }
    >
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <p className="text-sm text-slate-500">
          Requires an active {roomHeadLabel}/{floorInchargeLabel} assignment for this exact room/floor, or staff authority.
        </p>
        <FieldWrapper label="Scope" htmlFor="hc-scope-type">
          <Select
            id="hc-scope-type"
            value={scopeType}
            onChange={(e) => setScopeType(e.target.value as HeadcountScopeType)}
          >
            <option value="room">Room</option>
            <option value="floor">Floor</option>
            <option value="hostel">Hostel (staff only)</option>
          </Select>
        </FieldWrapper>
        <FieldWrapper label={`${scopeType[0]?.toUpperCase()}${scopeType.slice(1)}`} htmlFor="hc-scope-id">
          <Select id="hc-scope-id" value={scopeId} onChange={(e) => setScopeId(e.target.value)} disabled={loadingOptions}>
            <option value="">{loadingOptions ? 'Loading…' : `Select a ${scopeType}…`}</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </Select>
        </FieldWrapper>
        {!loadingOptions && options.length === 0 && (
          <Alert tone="warning">No {scopeType}s exist yet — set up the Structure screen first.</Alert>
        )}
      </div>
    </Sheet>
  );
}

function HeadcountSessionSheet({
  sessionId,
  scopeLabels,
  onClose,
  onChanged,
}: {
  sessionId: string;
  scopeLabels: Record<string, string>;
  onClose: () => void;
  onChanged: () => void;
}) {
  const residentNames = useResidentNames();
  const [session, setSession] = useState<HeadcountSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<string | null>(null);
  // Real bug, found live via SELF-TEST-GUIDE.md C8 — the backend correctly
  // requires a note to mark someone 'missing' over a system-computed
  // 'approved_out' prefill (service.ts's own contradiction-override check),
  // but this sheet never collected or sent one: every "Missing" click on a
  // prefilled resident was guaranteed to hit that ConflictError with no way
  // to get past it. One optional note field per entry, sent with either
  // button so a genuine override note can ride along with the click that
  // needs it.
  const [notes, setNotes] = useState<Record<string, string>>({});

  async function refresh() {
    setSession(await headcountApi.getSession(sessionId));
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  async function handleMark(studentId: string, status: 'present' | 'missing') {
    setSubmitting(studentId);
    setError(null);
    try {
      await headcountApi.markEntry(sessionId, { studentId, status, note: notes[studentId]?.trim() || undefined });
      await refresh();
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(null);
    }
  }

  async function handleClose() {
    setSubmitting('close');
    setError(null);
    try {
      await headcountApi.closeSession(sessionId);
      await refresh();
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(null);
    }
  }

  if (!session) return null;

  return (
    <Sheet
      open
      onClose={onClose}
      title={`Headcount — ${scopeLabels[session.scopeId] ?? `${session.scopeType} ${session.scopeId.slice(0, 8)}`} — ${session.sessionDate}`}
      footer={
        session.status === 'open' ? (
          <Button fullWidth variant="secondary" onClick={() => void handleClose()} disabled={submitting === 'close'}>
            {submitting === 'close' ? 'Closing…' : 'Close session'}
          </Button>
        ) : undefined
      }
    >
      <div className="space-y-3">
        {error && <Alert>{error}</Alert>}
        {(session.entries ?? []).length === 0 ? (
          <p className="text-sm text-slate-500">No active residents in this scope.</p>
        ) : (
          <ul className="space-y-2">
            {(session.entries ?? []).map((entry) => (
              <li key={entry.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2">
                <div className="min-w-0">
                  <p className="text-xs text-slate-600">{studentLabel(residentNames, entry.studentId)}</p>
                  <StatusPill status={entry.status} />
                  {entry.note && <p className="mt-0.5 text-xs text-slate-500">Note: {entry.note}</p>}
                </div>
                {session.status === 'open' && (
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <Input
                      placeholder="Note (required to override Approved Out)"
                      value={notes[entry.studentId] ?? ''}
                      onChange={(e) => setNotes((prev) => ({ ...prev, [entry.studentId]: e.target.value }))}
                      className="h-8 w-56 text-xs"
                    />
                    <div className="flex gap-1.5">
                      <Button size="sm" variant="secondary" onClick={() => void handleMark(entry.studentId, 'present')} disabled={Boolean(submitting)}>
                        Present
                      </Button>
                      <Button size="sm" variant="danger" onClick={() => void handleMark(entry.studentId, 'missing')} disabled={Boolean(submitting)}>
                        Missing
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Sheet>
  );
}
