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
import { hasHostelRole, isPlatformAdmin, type HeadcountScopeType, type HeadcountSession, type MovementRequest } from '../types';

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
    const [m, s, issues, labels] = await Promise.all([
      movementApi.listMovements(),
      headcountApi.listSessions(),
      isStaff ? headcountApi.listOpenIssues() : Promise.resolve([]),
      buildScopeLabelIndex(),
    ]);
    setMovements(m);
    setSessions(s);
    setOpenIssues(issues);
    setScopeLabels(labels);
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

      <h2 className="mb-3 text-sm font-semibold text-slate-900">Movement requests</h2>
      {movements.length === 0 ? (
        <EmptyState icon={<ClipboardIcon className="h-8 w-8" />} title="No movement requests" description="Nothing here yet." />
      ) : (
        <Card>
          <DataList
            columns={movementColumns}
            rows={movements}
            onRowClick={
              isStaff
                ? (row) => (['requested', 'approved', 'out', 'overdue'].includes(row.status) ? setDecideTarget(row) : undefined)
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

      <RequestMovementSheet open={requestOpen} onClose={() => setRequestOpen(false)} onRequested={load} />
      {decideTarget && <DecideMovementSheet movement={decideTarget} onClose={() => setDecideTarget(null)} onDecided={load} />}
      <OpenHeadcountSessionSheet open={openSessionOpen} onClose={() => setOpenSessionOpen(false)} onOpened={load} />
      {sessionDetailId && (
        <HeadcountSessionSheet sessionId={sessionDetailId} scopeLabels={scopeLabels} onClose={() => setSessionDetailId(null)} onChanged={load} />
      )}
    </div>
  );
}

function RequestMovementSheet({ open, onClose, onRequested }: { open: boolean; onClose: () => void; onRequested: () => void }) {
  const [movementType, setMovementType] = useState<'gate_pass' | 'leave'>('gate_pass');
  const [destination, setDestination] = useState('');
  const [purpose, setPurpose] = useState('');
  const [requestedOut, setRequestedOut] = useState('');
  const [requestedReturn, setRequestedReturn] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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

  const canSubmit = destination.trim() && purpose.trim() && requestedOut && requestedReturn;

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
        <FieldWrapper label="Type" htmlFor="mv-type">
          <Select id="mv-type" value={movementType} onChange={(e) => setMovementType(e.target.value as 'gate_pass' | 'leave')}>
            <option value="gate_pass">Gate pass (same-day)</option>
            <option value="leave">Leave (overnight / multi-day)</option>
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

function DecideMovementSheet({
  movement,
  onClose,
  onDecided,
}: {
  movement: MovementRequest;
  onClose: () => void;
  onDecided: () => void;
}) {
  const residentNames = useResidentNames();
  const [decision, setDecision] = useState<'approved' | 'rejected'>('approved');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      await movementApi.decideMovement(movement.id, { decision, reason });
      onDecided();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRecordExit() {
    setSubmitting(true);
    setError(null);
    try {
      await movementApi.recordExit(movement.id);
      onDecided();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRecordReturn() {
    setSubmitting(true);
    setError(null);
    try {
      await movementApi.recordReturn(movement.id);
      onDecided();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  const isPending = movement.status === 'requested';
  const isApproved = movement.status === 'approved';
  const isOutOrOverdue = movement.status === 'out' || movement.status === 'overdue';

  /**
   * Real bug, found live via SELF-TEST-GUIDE.md C7 — this sheet used to be
   * reachable only while status === 'requested' (see the row-click gate in
   * the parent), so its own "Record actual exit now" branch for
   * status === 'approved' was dead code: nothing could ever open the sheet
   * once a request left 'requested'. recordReturn() existed in
   * api/movements.ts and was never called from anywhere. Row-click now
   * opens this sheet for requested/approved/out/overdue, and the sheet
   * branches its whole body — decide vs record-exit vs record-return — by
   * status, instead of only ever showing the decide form.
   */
  return (
    <Sheet
      open
      onClose={onClose}
      title={isPending ? 'Decide movement request' : isApproved ? 'Record exit' : 'Record return'}
      footer={
        isPending ? (
          <Button fullWidth onClick={() => void handleSubmit()} disabled={submitting || !reason}>
            {submitting ? 'Saving…' : 'Save decision'}
          </Button>
        ) : isApproved ? (
          <Button fullWidth onClick={() => void handleRecordExit()} disabled={submitting}>
            {submitting ? 'Recording…' : 'Record actual exit now'}
          </Button>
        ) : isOutOrOverdue ? (
          <Button fullWidth onClick={() => void handleRecordReturn()} disabled={submitting}>
            {submitting ? 'Recording…' : 'Record actual return now'}
          </Button>
        ) : null
      }
    >
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <p className="text-sm text-slate-600">
          Student <span>{studentLabel(residentNames, movement.studentId)}</span> → {movement.destination}
        </p>
        <p className="text-sm text-slate-500">{movement.purpose}</p>
        {isPending && (
          <>
            <FieldWrapper label="Decision" htmlFor="mv-decision">
              <Select id="mv-decision" value={decision} onChange={(e) => setDecision(e.target.value as typeof decision)}>
                <option value="approved">Approve</option>
                <option value="rejected">Reject</option>
              </Select>
            </FieldWrapper>
            <FieldWrapper label="Reason" htmlFor="mv-decide-reason" required>
              <Textarea id="mv-decide-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
            </FieldWrapper>
          </>
        )}
        {isApproved && <p className="text-sm text-slate-500">Approved — waiting for the resident to physically leave.</p>}
        {isOutOrOverdue && (
          <p className="text-sm text-slate-500">
            {movement.status === 'overdue' ? 'Overdue — expected back ' : 'Out — expected back '}
            {new Date(movement.requestedReturn).toLocaleString()}.
          </p>
        )}
      </div>
    </Sheet>
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
