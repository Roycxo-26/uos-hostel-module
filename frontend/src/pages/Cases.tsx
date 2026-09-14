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
import { hasHostelRole, isPlatformAdmin, type Case, type CaseAccessRoleLabel, type CaseEvidence, type CaseStatus, type CaseType } from '../types';

const WELFARE_CASE_TYPES = new Set<CaseType>(['welfare_concern', 'safeguarding_concern']);

const CASE_ACCESS_ROLE_LABELS: Record<CaseAccessRoleLabel, string> = {
  security_officer: 'Security/Safety Officer',
  medical_officer: 'Medical Officer',
  dean_committee: 'Dean/Registrar/Committee (referral)',
  privacy_legal_auditor: 'Privacy/Legal/Auditor (read-only)',
};

const MISSING_RESIDENT_CHECKLIST_LABELS: Record<string, string> = {
  roommate_check: 'Roommate check',
  medical_reference_check: 'Medical reference check',
};

function caseTypeLabel(caseType: CaseType): string {
  switch (caseType) {
    case 'incident':
      return 'Incident';
    case 'welfare_concern':
      return 'Welfare Concern';
    case 'safeguarding_concern':
      return 'Safeguarding Concern';
    default:
      return 'Complaint';
  }
}

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
    // Real gap found live via SELF-TEST-GUIDE.md Batch 24: the "Report"
    // form on either page lets you pick a welfare/safeguarding type
    // regardless of which page you're on, but this page's own list used
    // to filter strictly by sectionType — so a welfare/safeguarding case
    // (a type that's neither "complaint" nor "incident") had no page it
    // could ever show up on, for the reporter or for safeguarding-team
    // staff alike. There's no dedicated "welfare cases" section anywhere
    // else in the app to fall back to. Fixed by always merging those two
    // types into whichever tab you're on — safe to do for every caller,
    // staff included: the backend's own listCases visibility check
    // (canManageWelfareCase) still independently decides who can actually
    // see a given welfare case, this only changes which TYPES are asked
    // for, not who's allowed to see them. (An earlier version of this fix
    // special-cased `isStaff` here, which depends on the auth context's
    // `me` — still loading for a moment right after a hard refresh — and
    // caused exactly the flicker this comment now avoids: showing the
    // case ONLY in that narrow window before `me` resolved, then hiding it
    // again on the next navigation once it had. Not staff-specific at all,
    // so no such timing dependency now.)
    const all = await casesApi.listCases({ ...(statusFilter ? { status: statusFilter } : {}) });
    setCases(sectionType ? all.filter((c) => c.caseType === sectionType || WELFARE_CASE_TYPES.has(c.caseType)) : all);
    setLoading(false);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, sectionType]);

  const columns: Column<Case>[] = [
    { key: 'category', header: 'Category', primary: true, render: (c) => c.category },
    { key: 'type', header: 'Type', render: (c) => caseTypeLabel(c.caseType) },
    { key: 'status', header: 'Status', render: (c) => <StatusPill status={c.status} /> },
    { key: 'created', header: 'Reported', render: (c) => new Date(c.createdAt).toLocaleDateString() },
  ];

  return (
    <div>
      <PageHeader title={pageTitle} description={pageDescription} action={<Button onClick={() => setReportOpen(true)}>Report</Button>} />

      {sectionType === 'incident' && (
        <div className="mb-4">
          <Alert tone="warning">
            Emergency / SOS reporting (BR §5.1 `/hostel/emergency`) isn't built yet — for anything urgent, contact hostel
            staff directly rather than filing an incident report here.
          </Alert>
        </div>
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
        subjectUserId: caseType !== 'complaint' && subjectUserId ? subjectUserId : undefined,
        evidence,
        confidential: WELFARE_CASE_TYPES.has(caseType) ? true : confidential,
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
            <option value="welfare_concern">Welfare concern</option>
            <option value="safeguarding_concern">Safeguarding concern</option>
          </Select>
        </FieldWrapper>
        {WELFARE_CASE_TYPES.has(caseType) && (
          <Alert>
            This goes to a small, restricted safeguarding team only — not the general Warden pool — and stays visible to you
            and them throughout.
          </Alert>
        )}
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
        {caseType !== 'complaint' && (
          <FieldWrapper
            label="Concerns (optional)"
            htmlFor="case-subject"
            hint="If this is about someone other than you, name them here — they, not you, will see any disciplinary notice/decision"
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

  // D17.09 depth (TODO.md Batch 24) — the row passed in from the list is
  // the pre-access-check shape; welfare/safeguarding cases need the real
  // per-case `canManage`/`readOnly`/`accessGrants` the single-GET endpoint
  // now returns, so this sheet always re-fetches on open rather than
  // trusting the row it was handed.
  const [detail, setDetail] = useState<Case>(caseItem);
  const isRestricted = WELFARE_CASE_TYPES.has(detail.caseType);
  const canManage = isRestricted ? Boolean(detail.canManage) : isStaff;
  const isReadOnly = Boolean(detail.readOnly);

  async function refresh() {
    setDetail(await casesApi.getCase(caseItem.id));
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseItem.id]);

  // Staff triage fields
  const [severity, setSeverity] = useState<'low' | 'medium' | 'high' | 'critical'>('medium');
  const [assignedTo, setAssignedTo] = useState('');
  const [staffOptions, setStaffOptions] = useState<casesApi.CaseStaffEntry[]>([]);
  const [loadingStaff, setLoadingStaff] = useState(false);

  // UOS_Final.docx audit (12 Sep 2026) — real gap: the case's own assignee
  // (set during triage, `assignedTo` below) was never shown anywhere once
  // triage was done, because this fetch used to only run while still at
  // the 'reported' triage step — staffOptions was empty by the time
  // there was actually an assignee to resolve a name for. Fetching
  // whenever the sheet can manage the case (not gated on status) makes
  // staffOptions double as a general staff-name lookup, used below to
  // show who a case is actually assigned to.
  useEffect(() => {
    if (!canManage) return;
    setLoadingStaff(true);
    void casesApi.listCaseStaffDirectory().then((staff) => {
      setStaffOptions(staff);
      setLoadingStaff(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManage]);
  // Investigation / resolution / notice / decision / appeal / reopen fields
  const [notes, setNotes] = useState('');
  const [noticeText, setNoticeText] = useState('');
  const [decisionOutcome, setDecisionOutcome] = useState<
    'upheld' | 'dismissed' | 'other' | 'informal_resolution' | 'warning' | 'support_plan' | 'formal_discipline'
  >('upheld');
  const [decisionReason, setDecisionReason] = useState('');
  const [followUpDueAt, setFollowUpDueAt] = useState('');
  const [appealReason, setAppealReason] = useState('');
  const [reopenReason, setReopenReason] = useState('');

  // D17.09 items 96/99 — restricted-tier access grants
  const [grantUserId, setGrantUserId] = useState('');
  const [grantRole, setGrantRole] = useState<CaseAccessRoleLabel>('security_officer');
  const [grantReadOnly, setGrantReadOnly] = useState(false);
  const [grantPurpose, setGrantPurpose] = useState('');
  const [grantExpiresAt, setGrantExpiresAt] = useState('');
  const [residentOptions, setResidentOptions] = useState<casesApi.ResidentDirectoryEntry[]>([]);

  useEffect(() => {
    if (!isRestricted || !canManage) return;
    void casesApi.listResidentDirectory().then(setResidentOptions);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRestricted, canManage]);

  // D17.09 item 99 — emergency privilege restriction
  const [restrictionReason, setRestrictionReason] = useState('');
  const [restrictionReviewHours, setRestrictionReviewHours] = useState('24');
  const [reviewOutcome, setReviewOutcome] = useState<'continued' | 'lifted'>('lifted');
  const [reviewNotes, setReviewNotes] = useState('');

  const isReporter = detail.reporterUserId === currentUserId;
  // Same fix as the backend's appealCase — a decision concerns the subject
  // of an incident, not just whoever reported it; both can appeal.
  const isSubject = detail.subjectUserId === currentUserId;

  async function run(action: () => Promise<unknown>, closeAfter = true) {
    setSubmitting(true);
    setError(null);
    try {
      await action();
      onChanged();
      if (closeAfter) onClose();
      else await refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  const caseItemForRender = detail;

  return (
    <Sheet open onClose={onClose} title={caseItemForRender.category}>
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}

        <div className="space-y-1 text-sm">
          <div className="flex items-center gap-2">
            <StatusPill status={caseItemForRender.status} />
            <span className="text-slate-500">{caseTypeLabel(caseItemForRender.caseType)}</span>
            {caseItemForRender.confidential && <span className="text-xs font-medium text-rose-600">Confidential</span>}
            {isReadOnly && <span className="text-xs font-medium text-amber-600">Read-only access</span>}
          </div>
          <p className="text-slate-700">{caseItemForRender.description}</p>
          {caseItemForRender.deskTicketReference && (
            <p className="text-slate-500">Desk ticket: {caseItemForRender.deskTicketReference.status} (stub reference — no live Desk system yet)</p>
          )}
          {caseItemForRender.severity && <p className="text-slate-500">Severity: {caseItemForRender.severity}</p>}
          {/* Real gap, found via the UOS_Final.docx audit (12 Sep 2026) —
              "owner should always be visible on an open item". The
              assignee was captured at triage (assignCase/triageCase) and
              stored the whole time, just never shown here. */}
          {caseItemForRender.assignedTo && (
            <p className="text-slate-500">
              Assigned to: {staffOptions.find((s) => s.id === caseItemForRender.assignedTo)?.name ?? caseItemForRender.assignedTo.slice(0, 8)}
            </p>
          )}
          {caseItemForRender.investigationNotes && <p className="text-slate-500">Notes: {caseItemForRender.investigationNotes}</p>}
          {caseItemForRender.noticeText && <p className="text-slate-500">Notice: {caseItemForRender.noticeText}</p>}
          {caseItemForRender.decisionOutcome && (
            <p className="text-slate-500">
              Decision: {caseItemForRender.decisionOutcome.replace(/_/g, ' ')} — {caseItemForRender.decisionReason}
              {caseItemForRender.followUpDueAt && ` (follow-up due ${new Date(caseItemForRender.followUpDueAt).toLocaleDateString()})`}
            </p>
          )}
          {caseItemForRender.appealReason && <p className="text-slate-500">Appeal: {caseItemForRender.appealReason}</p>}
          {caseItemForRender.reopenReason && <p className="text-slate-500">Reopened: {caseItemForRender.reopenReason}</p>}
        </div>

        {isRestricted && !canManage && (
          <Alert>You can see this case because you reported it or it concerns you. Only the safeguarding team can act on it.</Alert>
        )}

        {isRestricted && detail.missingResidentChecklist && (
          <div className="space-y-2 rounded-lg border border-slate-200 p-3">
            <p className="text-xs font-medium text-slate-700">Missing-resident checklist</p>
            {Object.entries(MISSING_RESIDENT_CHECKLIST_LABELS).map(([key, label]) => (
              <label key={key} className="flex min-h-touch cursor-pointer items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={Boolean(detail.missingResidentChecklist?.[key]?.completed)}
                  disabled={!canManage || isReadOnly || Boolean(submitting)}
                  onChange={(e) =>
                    void run(() => casesApi.updateMissingResidentChecklist(detail.id, key, e.target.checked), false)
                  }
                  className="h-4 w-4 rounded border-slate-300 text-accent"
                />
                {label}
              </label>
            ))}
          </div>
        )}

        {isRestricted && detail.emergencyRestrictionActive && (
          <Alert tone="warning">
            Emergency restriction active: {detail.emergencyRestrictionReason}
            {detail.emergencyRestrictionReviewDueAt && ` — review due ${new Date(detail.emergencyRestrictionReviewDueAt).toLocaleString()}`}
          </Alert>
        )}
        {isRestricted && !detail.emergencyRestrictionActive && detail.emergencyRestrictionReviewOutcome && (
          <p className="text-xs text-slate-500">
            Last restriction review: {detail.emergencyRestrictionReviewOutcome} (
            {detail.emergencyRestrictionReviewedAt && new Date(detail.emergencyRestrictionReviewedAt).toLocaleString()})
          </p>
        )}
        {isRestricted && canManage && !isReadOnly && !detail.emergencyRestrictionActive && (
          <div className="space-y-2 rounded-lg border border-rose-200 bg-rose-50 p-3">
            <p className="text-xs font-medium text-rose-800">Impose emergency privilege restriction</p>
            <Textarea placeholder="Reason" value={restrictionReason} onChange={(e) => setRestrictionReason(e.target.value)} />
            <Input
              type="number"
              min={1}
              max={720}
              value={restrictionReviewHours}
              onChange={(e) => setRestrictionReviewHours(e.target.value)}
              placeholder="Mandatory review, hours from now"
            />
            <Button
              size="sm"
              variant="danger"
              fullWidth
              disabled={!restrictionReason.trim() || Boolean(submitting)}
              onClick={() =>
                void run(
                  () => casesApi.imposeEmergencyRestriction(detail.id, restrictionReason, Number(restrictionReviewHours)),
                  false
                )
              }
            >
              Impose restriction
            </Button>
          </div>
        )}
        {isRestricted && canManage && !isReadOnly && detail.emergencyRestrictionActive && (
          <div className="space-y-2 rounded-lg border border-rose-200 bg-rose-50 p-3">
            <p className="text-xs font-medium text-rose-800">Mandatory restriction review</p>
            <Select value={reviewOutcome} onChange={(e) => setReviewOutcome(e.target.value as typeof reviewOutcome)}>
              <option value="lifted">Lift restriction</option>
              <option value="continued">Continue restriction</option>
            </Select>
            <Textarea placeholder="Review notes" value={reviewNotes} onChange={(e) => setReviewNotes(e.target.value)} />
            <Button
              size="sm"
              fullWidth
              disabled={!reviewNotes.trim() || Boolean(submitting)}
              onClick={() => void run(() => casesApi.reviewEmergencyRestriction(detail.id, reviewOutcome, reviewNotes), false)}
            >
              Record review
            </Button>
          </div>
        )}

        {isRestricted && canManage && (
          <div className="space-y-2 rounded-lg border border-slate-200 p-3">
            <p className="text-xs font-medium text-slate-700">Case team access</p>
            {(detail.accessGrants ?? []).length === 0 ? (
              <p className="text-xs text-slate-500">Nobody else has been granted access yet.</p>
            ) : (
              <ul className="space-y-1.5">
                {(detail.accessGrants ?? []).map((g) => (
                  <li key={g.id} className="flex items-center justify-between gap-2 text-xs">
                    <span className={g.revokedAt ? 'text-slate-400 line-through' : 'text-slate-700'}>
                      {CASE_ACCESS_ROLE_LABELS[g.roleLabel]} — {g.grantedToUserId.slice(0, 8)}
                      {g.expiresAt && ` (until ${new Date(g.expiresAt).toLocaleDateString()})`}
                    </span>
                    {!g.revokedAt && !isReadOnly && (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={Boolean(submitting)}
                        onClick={() => void run(() => casesApi.revokeCaseAccess(g.id, 'Revoked from case detail'), false)}
                      >
                        Revoke
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {!isReadOnly && (
              <div className="space-y-1.5 border-t border-slate-200 pt-2">
                <Select value={grantUserId} onChange={(e) => setGrantUserId(e.target.value)}>
                  <option value="">Grant access to…</option>
                  {residentOptions.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({r.email})
                    </option>
                  ))}
                </Select>
                <Select value={grantRole} onChange={(e) => setGrantRole(e.target.value as CaseAccessRoleLabel)}>
                  {Object.entries(CASE_ACCESS_ROLE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
                <Input placeholder="Purpose (required)" value={grantPurpose} onChange={(e) => setGrantPurpose(e.target.value)} />
                <Input type="datetime-local" value={grantExpiresAt} onChange={(e) => setGrantExpiresAt(e.target.value)} placeholder="Expires (optional)" />
                <label className="flex min-h-touch cursor-pointer items-center gap-2 text-xs text-slate-700">
                  <input type="checkbox" checked={grantReadOnly} onChange={(e) => setGrantReadOnly(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-accent" />
                  Read-only
                </label>
                <Button
                  size="sm"
                  fullWidth
                  disabled={!grantUserId || !grantPurpose.trim() || Boolean(submitting)}
                  onClick={() =>
                    void run(
                      () =>
                        casesApi.grantCaseAccess(detail.id, {
                          userId: grantUserId,
                          roleLabel: grantRole,
                          readOnly: grantReadOnly,
                          purpose: grantPurpose,
                          expiresAt: grantExpiresAt ? new Date(grantExpiresAt).toISOString() : undefined,
                        }),
                      false
                    )
                  }
                >
                  Grant access
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Staff: triage a freshly reported OR reopened case — a reopened
            case goes through the same re-triage step, severity/assignee
            both reconsidered rather than assumed still valid (see
            TRIAGEABLE_FROM's own comment in cases/service.ts) */}
        {canManage && !isReadOnly && (detail.status === 'reported' || detail.status === 'reopened') && (
          <div className="space-y-3 border-t border-slate-200 pt-4">
            <p className="text-sm font-medium text-slate-800">Triage{detail.status === 'reopened' ? ' (reopened)' : ''}</p>
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
            <Button fullWidth disabled={submitting || !assignedTo.trim()} onClick={() => void run(() => casesApi.triageCase(detail.id, { severity, assignedTo }))}>
              Assign
            </Button>
          </div>
        )}

        {/* Start investigation */}
        {canManage && !isReadOnly && detail.status === 'assigned' && (
          <div className="space-y-3 border-t border-slate-200 pt-4">
            <p className="text-sm font-medium text-slate-800">Start investigation</p>
            <FieldWrapper label="Notes" htmlFor="cd-notes" required>
              <Textarea id="cd-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </FieldWrapper>
            <Button fullWidth disabled={submitting || !notes.trim()} onClick={() => void run(() => casesApi.investigateCase(detail.id, notes))}>
              Begin investigation
            </Button>
          </div>
        )}

        {/* Resolve, or move to discipline */}
        {canManage && !isReadOnly && detail.status === 'in_progress' && (
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
            {/* Real bug, found live via SELF-TEST-GUIDE.md Batch 24 — this
                used to be a single row (`flex gap-2`) with both buttons set
                to fullWidth (`w-full`). Every button in the app also has
                `shrink-0` and `whitespace-nowrap` on it (so its label never
                silently wraps mid-word) — put two `w-full` buttons in one
                row and each one demands the ENTIRE row's width for itself,
                and neither is allowed to give up its text's natural width
                either. "Issue disciplinary notice" is long enough that the
                pair simply doesn't fit side by side in a sheet this narrow,
                so it was pushed out of the visible sheet. Stacking them
                (one per row) is the same "full width, mobile-first" style
                already used by every other button in this app; it just
                also happens to be the fix. */}
            <div className="flex flex-col gap-2">
              <Button variant="secondary" fullWidth disabled={submitting} onClick={() => void run(() => casesApi.resolveCase(detail.id, notes || undefined))}>
                Resolve
              </Button>
              <Button fullWidth disabled={submitting || !noticeText.trim()} onClick={() => void run(() => casesApi.issueNotice(detail.id, noticeText))}>
                Issue disciplinary notice
              </Button>
            </div>
          </div>
        )}

        {/* Decide (notice_issued or appealed) — backend requires Head Warden authority */}
        {canManage && !isReadOnly && (detail.status === 'notice_issued' || detail.status === 'appealed') && (
          <div className="space-y-3 border-t border-slate-200 pt-4">
            <Alert tone="warning">Discipline decision — requires {headWardenLabel} authority (or an active delegation).</Alert>
            <FieldWrapper label="Outcome" htmlFor="cd-outcome">
              <Select id="cd-outcome" value={decisionOutcome} onChange={(e) => setDecisionOutcome(e.target.value as typeof decisionOutcome)}>
                <option value="upheld">Upheld</option>
                <option value="dismissed">Dismissed</option>
                <option value="informal_resolution">Informal resolution</option>
                <option value="warning">Warning</option>
                <option value="support_plan">Support plan (needs a follow-up date)</option>
                <option value="formal_discipline">Formal discipline</option>
                <option value="other">Other</option>
              </Select>
            </FieldWrapper>
            {decisionOutcome === 'support_plan' && (
              <FieldWrapper label="Follow-up review due" htmlFor="cd-followup" required>
                <Input id="cd-followup" type="datetime-local" value={followUpDueAt} onChange={(e) => setFollowUpDueAt(e.target.value)} />
              </FieldWrapper>
            )}
            <FieldWrapper label="Reason" htmlFor="cd-reason" required>
              <Textarea id="cd-reason" value={decisionReason} onChange={(e) => setDecisionReason(e.target.value)} />
            </FieldWrapper>
            <Button
              fullWidth
              disabled={submitting || !decisionReason.trim() || (decisionOutcome === 'support_plan' && !followUpDueAt)}
              onClick={() =>
                void run(() =>
                  casesApi.decideCase(detail.id, {
                    decisionOutcome,
                    decisionReason,
                    followUpDueAt: decisionOutcome === 'support_plan' ? new Date(followUpDueAt).toISOString() : undefined,
                  })
                )
              }
            >
              Record decision
            </Button>
          </div>
        )}

        {/* Reporter or subject: appeal a decision — the subject is who a
            discipline decision actually concerns, not just whoever reported it */}
        {(isReporter || isSubject) && detail.status === 'decided' && (
          <div className="space-y-3 border-t border-slate-200 pt-4">
            <p className="text-sm font-medium text-slate-800">Appeal this decision</p>
            <FieldWrapper label="Reason" htmlFor="cd-appeal" required>
              <Textarea id="cd-appeal" value={appealReason} onChange={(e) => setAppealReason(e.target.value)} />
            </FieldWrapper>
            <Button fullWidth disabled={submitting || !appealReason.trim()} onClick={() => void run(() => casesApi.appealCase(detail.id, appealReason))}>
              Submit appeal
            </Button>
          </div>
        )}

        {/* Reporter: acknowledge a resolution -> closes it (ux-flow.md §3.3) */}
        {isReporter && !canManage && detail.status === 'resolved' && (
          <div className="border-t border-slate-200 pt-4">
            <Button fullWidth disabled={submitting} onClick={() => void run(() => casesApi.closeCase(detail.id))}>
              Acknowledge resolution
            </Button>
          </div>
        )}

        {/* Staff: administrative close */}
        {canManage && !isReadOnly && (detail.status === 'resolved' || detail.status === 'decided') && (
          <div className="border-t border-slate-200 pt-4">
            <Button variant="secondary" fullWidth disabled={submitting} onClick={() => void run(() => casesApi.closeCase(detail.id))}>
              Close case
            </Button>
          </div>
        )}

        {/* Reporter or staff: reopen */}
        {(isReporter || (canManage && !isReadOnly)) && detail.status === 'closed' && (
          <div className="space-y-3 border-t border-slate-200 pt-4">
            <p className="text-sm font-medium text-slate-800">Reopen</p>
            <FieldWrapper label="Reason" htmlFor="cd-reopen" required>
              <Textarea id="cd-reopen" value={reopenReason} onChange={(e) => setReopenReason(e.target.value)} />
            </FieldWrapper>
            <Button variant="danger" fullWidth disabled={submitting || !reopenReason.trim()} onClick={() => void run(() => casesApi.reopenCase(detail.id, reopenReason))}>
              Reopen
            </Button>
          </div>
        )}
      </div>
    </Sheet>
  );
}
