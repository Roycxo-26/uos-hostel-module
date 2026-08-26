import { useEffect, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import * as casesApi from '../api/cases';
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
import { AlertIcon, CloseIcon } from '../design-system/icons';
import type { Column } from '../design-system';
import { errorMessage } from '../lib/errorMessage';
import { hasHostelRole, isPlatformAdmin, type Case, type CaseEvidence, type CaseStatus, type CaseType } from '../types';

/**
 * ux-flow.md §3.3 "Hostel Complaint form" / "Complaint tracker", §9.3
 * "Complaint to resolution", and the old rule book's §10 "Incident Report".
 * One page/data model covers both case types (see backend/src/app/cases's
 * migration comment on why) — but the BR's own nav tree (§5) treats "Help
 * Desk / Complaints" and "Safety / Incidents / Discipline / Emergency" as
 * two SEPARATE sections. TODO.md Batch 8: reconciled by keeping one page
 * but two nav entries/routes (`?type=complaint` / `?type=incident`), each
 * with its own title, default report type, and (for Safety) an Emergency
 * placeholder note — not by splitting the backend, which would duplicate a
 * workflow that's genuinely identical either way.
 */
export function Cases() {
  const { me } = useAuth();
  const isStaff = isPlatformAdmin(me) || hasHostelRole(me, 'warden');
  // ux-flow.md §3.2: "Raise a Complaint" is a direct spoke off the
  // Dashboard hub — arriving here via that action opens the form
  // immediately instead of landing on the tracker first.
  const location = useLocation();
  const openReportOnArrival = Boolean((location.state as { openReport?: boolean } | null)?.openReport);

  const [searchParams] = useSearchParams();
  const sectionType = searchParams.get('type') === 'incident' ? 'incident' : searchParams.get('type') === 'complaint' ? 'complaint' : null;
  const pageTitle = sectionType === 'incident' ? 'Safety, Incidents & Discipline' : sectionType === 'complaint' ? 'Help Desk / Complaints' : 'Complaints & Incidents';
  const pageDescription =
    sectionType === 'incident'
      ? 'Incidents, discipline cases, and appeals.'
      : sectionType === 'complaint'
        ? 'Room/service complaints, linked to Desk.'
        : 'Room/service complaints, hostel incidents, and discipline cases.';

  const [cases, setCases] = useState<Case[]>([]);
  const [statusFilter, setStatusFilter] = useState<CaseStatus | ''>('');
  const [loading, setLoading] = useState(true);
  const [reportOpen, setReportOpen] = useState(openReportOnArrival);
  const [detailTarget, setDetailTarget] = useState<Case | null>(null);

  async function load() {
    setLoading(true);
    setCases(await casesApi.listCases({ ...(statusFilter ? { status: statusFilter } : {}), ...(sectionType ? { caseType: sectionType } : {}) }));
    setLoading(false);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, sectionType]);

  const columns: Column<Case>[] = [
    { key: 'category', header: 'Category', primary: true, render: (c) => c.category },
    { key: 'type', header: 'Type', render: (c) => (c.caseType === 'incident' ? 'Incident' : 'Complaint') },
    { key: 'status', header: 'Status', render: (c) => <StatusPill status={c.status} /> },
    { key: 'created', header: 'Reported', render: (c) => new Date(c.createdAt).toLocaleDateString() },
  ];

  return (
    <div>
      <PageHeader title={pageTitle} description={pageDescription} action={<Button onClick={() => setReportOpen(true)}>Report</Button>} />

      {sectionType === 'incident' && (
        <Alert tone="warning">
          Emergency / SOS reporting (BR §5.1 `/hostel/emergency`) isn't built yet — for anything urgent, contact hostel staff
          directly rather than filing an incident report here.
        </Alert>
      )}

      {isStaff && (
        <div className="mb-4 max-w-xs">
          <FieldWrapper label="Filter by status" htmlFor="case-status">
            <Select id="case-status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as CaseStatus | '')}>
              <option value="">All statuses</option>
              <option value="reported">Reported</option>
              <option value="assigned">Assigned</option>
              <option value="in_progress">In Progress</option>
              <option value="notice_issued">Notice Issued</option>
              <option value="decided">Decided</option>
              <option value="appealed">Appealed</option>
              <option value="resolved">Resolved</option>
              <option value="closed">Closed</option>
              <option value="reopened">Reopened</option>
            </Select>
          </FieldWrapper>
        </div>
      )}

      {loading ? (
        <PageSpinner />
      ) : cases.length === 0 ? (
        <EmptyState
          icon={<AlertIcon className="h-8 w-8" />}
          title="Nothing here"
          description={isStaff ? 'No complaints or incidents match this filter.' : 'Report a complaint or incident if something needs attention.'}
        />
      ) : (
        <Card>
          <DataList columns={columns} rows={cases} onRowClick={(row) => setDetailTarget(row)} />
        </Card>
      )}

      {/* key={sectionType} forces a remount when navigating between the
          Help Desk and Safety nav entries — without it, defaultCaseType's
          initial useState value would go stale on a same-route
          search-param-only navigation, which doesn't remount by default. */}
      <ReportCaseSheet key={sectionType} open={reportOpen} onClose={() => setReportOpen(false)} onReported={load} defaultCaseType={sectionType ?? 'complaint'} />
      {detailTarget && (
        <CaseDetailSheet
          caseItem={detailTarget}
          isStaff={isStaff}
          currentUserId={me?.sub}
          onClose={() => setDetailTarget(null)}
          onChanged={load}
        />
      )}
    </div>
  );
}

function EvidenceEditor({ value, onChange }: { value: CaseEvidence[]; onChange: (next: CaseEvidence[]) => void }) {
  const [url, setUrl] = useState('');

  function add() {
    if (!url.trim()) return;
    onChange([...value, { url: url.trim() }]);
    setUrl('');
  }

  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <ul className="space-y-1.5">
          {value.map((e, i) => (
            <li key={`${e.url}-${i}`} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm">
              <span className="truncate text-slate-700">{e.url}</span>
              <button type="button" onClick={() => onChange(value.filter((_, idx) => idx !== i))} aria-label="Remove" className="shrink-0 text-slate-400 hover:text-slate-600">
                <CloseIcon className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <Input placeholder="Photo/video URL" value={url} onChange={(e) => setUrl(e.target.value)} className="flex-1" />
        <Button type="button" variant="secondary" size="sm" onClick={add} disabled={!url.trim()}>
          Add
        </Button>
      </div>
    </div>
  );
}

interface RoomOption {
  id: string;
  label: string;
}

/** Real gap, found live — "Room (optional)" asked the reporter to paste a
 * raw room UUID with no way to discover one, the exact pattern already
 * fixed for bed/scope pickers elsewhere in this app (Allocations.tsx,
 * Movement.tsx). Fetch the real tree and build a human-readable picker
 * instead. */
async function fetchRoomOptions(): Promise<RoomOption[]> {
  const hostels = await structureApi.listHostels();
  const trees = await Promise.all(hostels.map((h) => structureApi.getHostelTree(h.id)));
  const options: RoomOption[] = [];
  for (const tree of trees) {
    for (const block of tree.blocks) {
      for (const floor of block.floors) {
        for (const room of floor.rooms) {
          options.push({ id: room.id, label: `${tree.name} / ${block.code} / Fl.${floor.number} / ${room.code}` });
        }
      }
    }
  }
  return options;
}

function ReportCaseSheet({
  open,
  onClose,
  onReported,
  defaultCaseType,
}: {
  open: boolean;
  onClose: () => void;
  onReported: () => void;
  defaultCaseType: CaseType;
}) {
  const { me } = useAuth();
  const [caseType, setCaseType] = useState<CaseType>(defaultCaseType);
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [roomId, setRoomId] = useState('');
  const [roomOptions, setRoomOptions] = useState<RoomOption[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [subjectUserId, setSubjectUserId] = useState('');
  const [residentOptions, setResidentOptions] = useState<casesApi.ResidentDirectoryEntry[]>([]);
  const [loadingResidents, setLoadingResidents] = useState(false);
  const [confidential, setConfidential] = useState(false);
  const [evidence, setEvidence] = useState<CaseEvidence[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoadingRooms(true);
    void fetchRoomOptions().then((opts) => {
      setRoomOptions(opts);
      setLoadingRooms(false);
    });
    setLoadingResidents(true);
    void casesApi.listResidentDirectory().then((residents) => {
      setResidentOptions(residents);
      setLoadingResidents(false);
    });
  }, [open]);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      await casesApi.reportCase({
        caseType,
        category,
        description,
        roomId: roomId || undefined,
        subjectUserId: caseType === 'incident' && subjectUserId ? subjectUserId : undefined,
        evidence,
        confidential,
      });
      onReported();
      onClose();
      setCategory('');
      setDescription('');
      setRoomId('');
      setSubjectUserId('');
      setConfidential(false);
      setEvidence([]);
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
      title={caseType === 'incident' ? 'Report an Incident' : 'Raise a Complaint'}
      footer={
        <Button fullWidth onClick={() => void handleSubmit()} disabled={submitting || !category.trim() || !description.trim()}>
          {submitting ? 'Submitting…' : 'Submit'}
        </Button>
      }
    >
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <FieldWrapper label="Type" htmlFor="case-type">
          <Select id="case-type" value={caseType} onChange={(e) => setCaseType(e.target.value as CaseType)}>
            <option value="complaint">Room / service complaint</option>
            <option value="incident">Incident / safety concern</option>
          </Select>
        </FieldWrapper>
        <FieldWrapper label="Category" htmlFor="case-category" required hint="e.g. plumbing, electrical, noise, safety, discipline">
          <Input id="case-category" value={category} onChange={(e) => setCategory(e.target.value)} />
        </FieldWrapper>
        <FieldWrapper label="Description" htmlFor="case-description" required>
          <Textarea id="case-description" value={description} onChange={(e) => setDescription(e.target.value)} />
        </FieldWrapper>
        <FieldWrapper label="Room (optional)" htmlFor="case-room" hint="Only if this is location-specific">
          <Select id="case-room" value={roomId} onChange={(e) => setRoomId(e.target.value)} disabled={loadingRooms}>
            <option value="">{loadingRooms ? 'Loading…' : 'No specific room'}</option>
            {roomOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </Select>
        </FieldWrapper>
        <FieldWrapper label="Evidence" htmlFor="case-evidence" hint="Photo or video links">
          <EvidenceEditor value={evidence} onChange={setEvidence} />
        </FieldWrapper>
        {caseType === 'incident' && (
          <FieldWrapper
            label="Concerns (optional)"
            htmlFor="case-subject"
            hint="If this incident is about someone other than you, name them here — they, not you, will see any disciplinary notice/decision"
          >
            <Select id="case-subject" value={subjectUserId} onChange={(e) => setSubjectUserId(e.target.value)} disabled={loadingResidents}>
              <option value="">{loadingResidents ? 'Loading…' : 'Nobody in particular'}</option>
              {/* Can't name yourself as a "Concern" about your own report —
                  the directory itself now returns everyone (Allocations.tsx
                  needs to resolve the caller's own name too), so that
                  exclusion lives here instead, specific to this one picker's
                  intent rather than baked into the shared endpoint. */}
              {residentOptions
                .filter((r) => r.id !== me?.sub)
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({r.email})
                  </option>
                ))}
            </Select>
          </FieldWrapper>
        )}
        {caseType === 'incident' && (
          <label className="flex min-h-touch cursor-pointer items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={confidential} onChange={(e) => setConfidential(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-accent" />
            Mark as confidential (restricted, need-to-know access)
          </label>
        )}
      </div>
    </Sheet>
  );
}

function CaseDetailSheet({
  caseItem,
  isStaff,
  currentUserId,
  onClose,
  onChanged,
}: {
  caseItem: Case;
  isStaff: boolean;
  currentUserId: string | undefined;
  onClose: () => void;
  onChanged: () => void;
}) {
  // Real gap, found live via SELF-TEST-GUIDE.md C13 — "Warden"/"Head
  // Warden" were hardcoded in three places below, same pattern as bugs
  // #29-31.
  const wardenLabel = useLabel('wardenLabel', 'Warden');
  const headWardenLabel = useLabel('headWardenLabel', 'Head Warden');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Staff triage fields
  const [severity, setSeverity] = useState<'low' | 'medium' | 'high' | 'critical'>('medium');
  const [assignedTo, setAssignedTo] = useState('');
  const [staffOptions, setStaffOptions] = useState<casesApi.CaseStaffEntry[]>([]);
  const [loadingStaff, setLoadingStaff] = useState(false);

  useEffect(() => {
    if (!isStaff || caseItem.status !== 'reported') return;
    setLoadingStaff(true);
    void casesApi.listCaseStaffDirectory().then((staff) => {
      setStaffOptions(staff);
      setLoadingStaff(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStaff, caseItem.status]);
  // Investigation / resolution / notice / decision / appeal / reopen fields
  const [notes, setNotes] = useState('');
  const [noticeText, setNoticeText] = useState('');
  const [decisionOutcome, setDecisionOutcome] = useState<'upheld' | 'dismissed' | 'other'>('upheld');
  const [decisionReason, setDecisionReason] = useState('');
  const [appealReason, setAppealReason] = useState('');
  const [reopenReason, setReopenReason] = useState('');

  const isReporter = caseItem.reporterUserId === currentUserId;
  // Same fix as the backend's appealCase — a decision concerns the subject
  // of an incident, not just whoever reported it; both can appeal.
  const isSubject = caseItem.subjectUserId === currentUserId;

  async function run(action: () => Promise<unknown>) {
    setSubmitting(true);
    setError(null);
    try {
      await action();
      onChanged();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Sheet open onClose={onClose} title={caseItem.category}>
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}

        <div className="space-y-1 text-sm">
          <div className="flex items-center gap-2">
            <StatusPill status={caseItem.status} />
            <span className="text-slate-500">{caseItem.caseType === 'incident' ? 'Incident' : 'Complaint'}</span>
            {caseItem.confidential && <span className="text-xs font-medium text-rose-600">Confidential</span>}
          </div>
          <p className="text-slate-700">{caseItem.description}</p>
          {caseItem.deskTicketReference && (
            <p className="text-slate-500">Desk ticket: {caseItem.deskTicketReference.status} (stub reference — no live Desk system yet)</p>
          )}
          {caseItem.severity && <p className="text-slate-500">Severity: {caseItem.severity}</p>}
          {caseItem.investigationNotes && <p className="text-slate-500">Notes: {caseItem.investigationNotes}</p>}
          {caseItem.noticeText && <p className="text-slate-500">Notice: {caseItem.noticeText}</p>}
          {caseItem.decisionOutcome && (
            <p className="text-slate-500">
              Decision: {caseItem.decisionOutcome} — {caseItem.decisionReason}
            </p>
          )}
          {caseItem.appealReason && <p className="text-slate-500">Appeal: {caseItem.appealReason}</p>}
          {caseItem.reopenReason && <p className="text-slate-500">Reopened: {caseItem.reopenReason}</p>}
        </div>

        {/* Staff: triage a freshly reported OR reopened case — a reopened
            case goes through the same re-triage step, severity/assignee
            both reconsidered rather than assumed still valid (see
            TRIAGEABLE_FROM's own comment in cases/service.ts) */}
        {isStaff && (caseItem.status === 'reported' || caseItem.status === 'reopened') && (
          <div className="space-y-3 border-t border-slate-200 pt-4">
            <p className="text-sm font-medium text-slate-800">Triage{caseItem.status === 'reopened' ? ' (reopened)' : ''}</p>
            <FieldWrapper label="Severity" htmlFor="cd-severity">
              <Select id="cd-severity" value={severity} onChange={(e) => setSeverity(e.target.value as typeof severity)}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </Select>
            </FieldWrapper>
            <FieldWrapper label="Assign to" htmlFor="cd-assignee">
              <Select id="cd-assignee" value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} disabled={loadingStaff}>
                <option value="">{loadingStaff ? 'Loading…' : `Select a ${wardenLabel}/${headWardenLabel}…`}</option>
                {staffOptions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.email}) — {s.role === 'head_warden' ? headWardenLabel : wardenLabel}
                  </option>
                ))}
              </Select>
            </FieldWrapper>
            <Button fullWidth disabled={submitting || !assignedTo.trim()} onClick={() => void run(() => casesApi.triageCase(caseItem.id, { severity, assignedTo }))}>
              Assign
            </Button>
          </div>
        )}

        {/* Staff: start investigation */}
        {isStaff && caseItem.status === 'assigned' && (
          <div className="space-y-3 border-t border-slate-200 pt-4">
            <p className="text-sm font-medium text-slate-800">Start investigation</p>
            <FieldWrapper label="Notes" htmlFor="cd-notes" required>
              <Textarea id="cd-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </FieldWrapper>
            <Button fullWidth disabled={submitting || !notes.trim()} onClick={() => void run(() => casesApi.investigateCase(caseItem.id, notes))}>
              Begin investigation
            </Button>
          </div>
        )}

        {/* Staff: resolve, or move to discipline */}
        {isStaff && caseItem.status === 'in_progress' && (
          <div className="space-y-3 border-t border-slate-200 pt-4">
            <p className="text-sm font-medium text-slate-800">Outcome</p>
            <FieldWrapper label="Notes (if resolving)" htmlFor="cd-notes2">
              <Textarea id="cd-notes2" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </FieldWrapper>
            {/* Real bug, found live via SELF-TEST-GUIDE.md C9 — this field
                used to sit BELOW the button row, but "Issue disciplinary
                notice" stays disabled until it has text. Reading top to
                bottom, a user hit the buttons before ever seeing the field
                that enables one of them — "Resolve" (always enabled) was
                the only thing that looked actionable, so that's what got
                clicked, silently steering a discipline case down the
                complaint-resolution path instead. Moved above the buttons
                so the field that gates a button's enabled state is visible
                before that button is. */}
            <FieldWrapper label="Notice text (if issuing a disciplinary notice)" htmlFor="cd-notice">
              <Textarea id="cd-notice" value={noticeText} onChange={(e) => setNoticeText(e.target.value)} />
            </FieldWrapper>
            <div className="flex gap-2">
              <Button variant="secondary" fullWidth disabled={submitting} onClick={() => void run(() => casesApi.resolveCase(caseItem.id, notes || undefined))}>
                Resolve
              </Button>
              <Button fullWidth disabled={submitting || !noticeText.trim()} onClick={() => void run(() => casesApi.issueNotice(caseItem.id, noticeText))}>
                Issue disciplinary notice
              </Button>
            </div>
          </div>
        )}

        {/* Decide (notice_issued or appealed) — backend requires Head Warden authority */}
        {isStaff && (caseItem.status === 'notice_issued' || caseItem.status === 'appealed') && (
          <div className="space-y-3 border-t border-slate-200 pt-4">
            <Alert tone="warning">Discipline decision — requires {headWardenLabel} authority (or an active delegation).</Alert>
            <FieldWrapper label="Outcome" htmlFor="cd-outcome">
              <Select id="cd-outcome" value={decisionOutcome} onChange={(e) => setDecisionOutcome(e.target.value as typeof decisionOutcome)}>
                <option value="upheld">Upheld</option>
                <option value="dismissed">Dismissed</option>
                <option value="other">Other</option>
              </Select>
            </FieldWrapper>
            <FieldWrapper label="Reason" htmlFor="cd-reason" required>
              <Textarea id="cd-reason" value={decisionReason} onChange={(e) => setDecisionReason(e.target.value)} />
            </FieldWrapper>
            <Button
              fullWidth
              disabled={submitting || !decisionReason.trim()}
              onClick={() => void run(() => casesApi.decideCase(caseItem.id, { decisionOutcome, decisionReason }))}
            >
              Record decision
            </Button>
          </div>
        )}

        {/* Reporter or subject: appeal a decision — the subject is who a
            discipline decision actually concerns, not just whoever reported it */}
        {(isReporter || isSubject) && caseItem.status === 'decided' && (
          <div className="space-y-3 border-t border-slate-200 pt-4">
            <p className="text-sm font-medium text-slate-800">Appeal this decision</p>
            <FieldWrapper label="Reason" htmlFor="cd-appeal" required>
              <Textarea id="cd-appeal" value={appealReason} onChange={(e) => setAppealReason(e.target.value)} />
            </FieldWrapper>
            <Button fullWidth disabled={submitting || !appealReason.trim()} onClick={() => void run(() => casesApi.appealCase(caseItem.id, appealReason))}>
              Submit appeal
            </Button>
          </div>
        )}

        {/* Reporter: acknowledge a resolution -> closes it (ux-flow.md §3.3) */}
        {isReporter && !isStaff && caseItem.status === 'resolved' && (
          <div className="border-t border-slate-200 pt-4">
            <Button fullWidth disabled={submitting} onClick={() => void run(() => casesApi.closeCase(caseItem.id))}>
              Acknowledge resolution
            </Button>
          </div>
        )}

        {/* Staff: administrative close */}
        {isStaff && (caseItem.status === 'resolved' || caseItem.status === 'decided') && (
          <div className="border-t border-slate-200 pt-4">
            <Button variant="secondary" fullWidth disabled={submitting} onClick={() => void run(() => casesApi.closeCase(caseItem.id))}>
              Close case
            </Button>
          </div>
        )}

        {/* Reporter or staff: reopen */}
        {(isReporter || isStaff) && caseItem.status === 'closed' && (
          <div className="space-y-3 border-t border-slate-200 pt-4">
            <p className="text-sm font-medium text-slate-800">Reopen</p>
            <FieldWrapper label="Reason" htmlFor="cd-reopen" required>
              <Textarea id="cd-reopen" value={reopenReason} onChange={(e) => setReopenReason(e.target.value)} />
            </FieldWrapper>
            <Button variant="danger" fullWidth disabled={submitting || !reopenReason.trim()} onClick={() => void run(() => casesApi.reopenCase(caseItem.id, reopenReason))}>
              Reopen
            </Button>
          </div>
        )}
      </div>
    </Sheet>
  );
}
