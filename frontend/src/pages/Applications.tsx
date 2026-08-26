import { useEffect, useState } from 'react';
import * as api from '../api/applications';
import * as casesApi from '../api/cases';
import { useAuth } from '../context/AuthContext';
import {
  Alert,
  Button,
  Card,
  ClipboardIcon,
  CloseIcon,
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
import { errorMessage } from '../lib/errorMessage';
import {
  hasHostelRole,
  isPlatformAdmin,
  type ApplicationAttachment,
  type ApplicationStatus,
  type ApplicationType,
  type EligibilityOutcome,
  type HostelApplication,
} from '../types';

const STATUS_FILTERS: { value: ApplicationStatus | ''; label: string }[] = [
  { value: '', label: 'All statuses' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'under_review', label: 'Under Review' },
  { value: 'returned', label: 'Returned for Correction' },
  { value: 'waitlisted', label: 'Waitlisted' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'allocation_ready', label: 'Allocation Ready' },
  { value: 'allocated', label: 'Allocated' },
  { value: 'closed', label: 'Closed' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'withdrawn', label: 'Withdrawn' },
  { value: 'reopened', label: 'Reopened' },
];

// D17.02 item 49.
const APPLICATION_TYPE_LABELS: Record<ApplicationType, string> = {
  new_term: 'New term',
  renewal: 'Renewal',
  mid_term: 'Mid-term',
  short_stay: 'Short-stay',
  emergency: 'Emergency',
  visiting: 'Visiting',
  staff: 'Staff',
  accessibility_request: 'Accessibility request',
  hostel_transfer: 'Hostel transfer',
  off_campus_placement: 'Off-campus placement',
};

const DECIDABLE = new Set(['submitted', 'under_review', 'reopened']);
const CANCELLABLE = new Set(['submitted', 'under_review', 'returned', 'waitlisted', 'allocation_ready']);
const REOPENABLE = new Set(['rejected', 'closed', 'cancelled', 'withdrawn']);
const WITHDRAWABLE = new Set(['draft', 'submitted', 'under_review', 'returned', 'waitlisted']);

/** Real gap, found live — same raw-ID display already fixed on
 * Allocations.tsx/Checkout.tsx/Movement.tsx/Cases.tsx. Same per-file hook
 * duplication this codebase already uses for these small directory
 * lookups. */
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
 * UOS HOSTEL BR.md BR-HOS-002: document attachment on the application.
 * Stopgap reference editor — records a name + URL the student already has
 * (e.g. a link to a file uploaded elsewhere), not an in-app file upload;
 * see backend/src/app/applications/validators.ts's own comment on why.
 */
function AttachmentsEditor({ value, onChange }: { value: ApplicationAttachment[]; onChange: (next: ApplicationAttachment[]) => void }) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');

  function add() {
    if (!name.trim() || !url.trim()) return;
    onChange([...value, { name: name.trim(), url: url.trim(), uploadedAt: new Date().toISOString() }]);
    setName('');
    setUrl('');
  }

  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <ul className="space-y-1.5">
          {value.map((a, i) => (
            <li key={`${a.url}-${i}`} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm">
              <span className="truncate text-slate-700">{a.name}</span>
              <button
                type="button"
                onClick={() => onChange(value.filter((_, idx) => idx !== i))}
                aria-label={`Remove ${a.name}`}
                className="shrink-0 text-slate-400 hover:text-slate-600"
              >
                <CloseIcon className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <Input placeholder="Document name" value={name} onChange={(e) => setName(e.target.value)} className="flex-1" />
        <Input placeholder="URL" value={url} onChange={(e) => setUrl(e.target.value)} className="flex-1" />
        <Button type="button" variant="secondary" size="sm" onClick={add} disabled={!name.trim() || !url.trim()}>
          Add
        </Button>
      </div>
    </div>
  );
}

export function Applications() {
  const { me } = useAuth();
  const isStaff = isPlatformAdmin(me) || hasHostelRole(me, 'warden');
  const residentNames = useResidentNames();

  const [apps, setApps] = useState<HostelApplication[]>([]);
  const [statusFilter, setStatusFilter] = useState<ApplicationStatus | ''>('');
  const [loading, setLoading] = useState(true);
  const [applySheetOpen, setApplySheetOpen] = useState(false);
  const [decideTarget, setDecideTarget] = useState<HostelApplication | null>(null);
  const [resubmitTarget, setResubmitTarget] = useState<HostelApplication | null>(null);
  const [cancelTarget, setCancelTarget] = useState<HostelApplication | null>(null);
  const [reopenTarget, setReopenTarget] = useState<HostelApplication | null>(null);
  const [withdrawTarget, setWithdrawTarget] = useState<HostelApplication | null>(null);

  async function load() {
    setLoading(true);
    setApps(await api.listApplications(statusFilter || undefined));
    setLoading(false);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  return (
    <div>
      <PageHeader
        title="Hostel Applications"
        description={isStaff ? 'Review and decide on resident applications.' : 'Your hostel application history.'}
        action={!isStaff ? <Button onClick={() => setApplySheetOpen(true)}>New Application</Button> : undefined}
      />

      {isStaff && (
        <div className="mb-4 max-w-xs">
          <FieldWrapper label="Filter by status" htmlFor="status-filter">
            <Select id="status-filter" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as ApplicationStatus | '')}>
              {STATUS_FILTERS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </Select>
          </FieldWrapper>
        </div>
      )}

      {loading ? (
        <PageSpinner />
      ) : apps.length === 0 ? (
        <EmptyState
          icon={<ClipboardIcon className="h-8 w-8" />}
          title="No applications"
          description={!isStaff ? 'Submit an application to get started.' : 'Nothing matches this filter yet.'}
        />
      ) : (
        <Card>
          {/* D17.02 item 51 gap-closure — Withdraw/Cancel/Reopen are all
              new actions alongside the existing Decide/Resubmit, and more
              than one can legitimately apply to the same row (e.g. a
              student's own 'returned' application is both resubmittable
              and withdrawable). DataList's row is one big <button> on
              mobile (design-system/DataList.tsx) with no room for a second
              interactive element inside it, so — same fix Allocations.tsx
              already applied to its own multi-action Transfer rows — this
              is a plain row list instead, not DataList. */}
          <ul className="divide-y divide-slate-100">
            {apps.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5">
                <div className="min-w-0 text-sm">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-slate-900">{a.term}</span>
                    <StatusPill status={a.status} />
                    <span className="text-xs text-slate-500">{APPLICATION_TYPE_LABELS[a.applicationType]}</span>
                    {isStaff && <span className="text-xs text-slate-500">{studentLabel(residentNames, a.studentId)}</span>}
                  </p>
                  <p className="mt-0.5 text-slate-500">Submitted {new Date(a.createdAt).toLocaleDateString()}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {isStaff && DECIDABLE.has(a.status) && (
                    <Button size="sm" variant="secondary" onClick={() => setDecideTarget(a)}>
                      Decide
                    </Button>
                  )}
                  {!isStaff && a.studentId === me?.sub && a.status === 'returned' && (
                    <Button size="sm" onClick={() => setResubmitTarget(a)}>
                      Resubmit
                    </Button>
                  )}
                  {isStaff && CANCELLABLE.has(a.status) && (
                    <Button size="sm" variant="danger" onClick={() => setCancelTarget(a)}>
                      Cancel
                    </Button>
                  )}
                  {isStaff && REOPENABLE.has(a.status) && (
                    <Button size="sm" variant="secondary" onClick={() => setReopenTarget(a)}>
                      Reopen
                    </Button>
                  )}
                  {!isStaff && a.studentId === me?.sub && WITHDRAWABLE.has(a.status) && (
                    <Button size="sm" variant="danger" onClick={() => setWithdrawTarget(a)}>
                      Withdraw
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <ApplySheet open={applySheetOpen} onClose={() => setApplySheetOpen(false)} onSubmitted={load} />
      {decideTarget && (
        <DecideSheet application={decideTarget} onClose={() => setDecideTarget(null)} onDecided={load} />
      )}
      {resubmitTarget && (
        <ResubmitSheet application={resubmitTarget} onClose={() => setResubmitTarget(null)} onResubmitted={load} />
      )}
      {cancelTarget && (
        <CancelSheet application={cancelTarget} onClose={() => setCancelTarget(null)} onCancelled={load} />
      )}
      {reopenTarget && (
        <ReopenSheet application={reopenTarget} onClose={() => setReopenTarget(null)} onReopened={load} />
      )}
      {withdrawTarget && (
        <WithdrawSheet application={withdrawTarget} onClose={() => setWithdrawTarget(null)} onWithdrawn={load} />
      )}
    </div>
  );
}

function ApplySheet({ open, onClose, onSubmitted }: { open: boolean; onClose: () => void; onSubmitted: () => void }) {
  const [term, setTerm] = useState('');
  const [applicationType, setApplicationType] = useState<ApplicationType>('new_term');
  const [notes, setNotes] = useState('');
  const [attachments, setAttachments] = useState<ApplicationAttachment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      await api.submitApplication({ term, applicationType, preferences: notes ? { notes } : undefined, attachments });
      onSubmitted();
      onClose();
      setTerm('');
      setApplicationType('new_term');
      setNotes('');
      setAttachments([]);
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
      title="New Hostel Application"
      footer={
        <Button fullWidth onClick={() => void handleSubmit()} disabled={submitting || !term}>
          {submitting ? 'Submitting…' : 'Submit application'}
        </Button>
      }
    >
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <FieldWrapper label="Term" htmlFor="apply-term" required hint="e.g. 2026-Fall">
          <Input id="apply-term" value={term} onChange={(e) => setTerm(e.target.value)} />
        </FieldWrapper>
        <FieldWrapper label="Application type" htmlFor="apply-type">
          <Select id="apply-type" value={applicationType} onChange={(e) => setApplicationType(e.target.value as ApplicationType)}>
            {Object.entries(APPLICATION_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </FieldWrapper>
        <FieldWrapper label="Notes / preferences" htmlFor="apply-notes">
          <Textarea id="apply-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any room or accessibility preferences" />
        </FieldWrapper>
        <FieldWrapper label="Attachments" htmlFor="apply-attachments" hint="Link any required documents (ID proof, income certificate, etc.)">
          <AttachmentsEditor value={attachments} onChange={setAttachments} />
        </FieldWrapper>
      </div>
    </Sheet>
  );
}

function DecideSheet({
  application,
  onClose,
  onDecided,
}: {
  application: HostelApplication;
  onClose: () => void;
  onDecided: () => void;
}) {
  const [decision, setDecision] = useState<'approved' | 'waitlisted' | 'rejected' | 'returned'>('approved');
  const [reason, setReason] = useState('');
  // D17.02 item 50 — structured, optional alongside the workflow decision
  // above; '' means "don't set/change it this round."
  const [eligibilityOutcome, setEligibilityOutcome] = useState<EligibilityOutcome | ''>('');
  const [condition, setCondition] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const reasonRequired = decision !== 'approved';
  const isConditional = eligibilityOutcome === 'conditionally_eligible';

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      await api.decideApplication(application.id, {
        decision,
        reason: reason || undefined,
        eligibilityOutcome: eligibilityOutcome || undefined,
        eligibilityConditions: isConditional && condition ? { condition, dueDate: dueDate || undefined } : undefined,
      });
      onDecided();
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
      title={`Decide — Term ${application.term}`}
      footer={
        <Button fullWidth onClick={() => void handleSubmit()} disabled={submitting || (reasonRequired && !reason)}>
          {submitting ? 'Saving…' : 'Save decision'}
        </Button>
      }
    >
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <ApplicationDetails application={application} />
        <FieldWrapper label="Decision" htmlFor="decision">
          <Select id="decision" value={decision} onChange={(e) => setDecision(e.target.value as typeof decision)}>
            <option value="approved">Approve — send to allocation queue</option>
            <option value="waitlisted">Waitlist</option>
            <option value="returned">Return for correction — student can fix and resubmit</option>
            <option value="rejected">Reject</option>
          </Select>
        </FieldWrapper>
        <FieldWrapper
          label="Reason"
          htmlFor="reason"
          required={reasonRequired}
          hint={reasonRequired ? undefined : 'Optional for approvals'}
        >
          <Textarea id="reason" value={reason} onChange={(e) => setReason(e.target.value)} />
        </FieldWrapper>
        <FieldWrapper label="Eligibility outcome" htmlFor="eligibility" hint="Optional — a more structured judgement alongside the decision above">
          <Select id="eligibility" value={eligibilityOutcome} onChange={(e) => setEligibilityOutcome(e.target.value as typeof eligibilityOutcome)}>
            <option value="">Not set</option>
            <option value="eligible">Eligible</option>
            <option value="conditionally_eligible">Conditionally eligible</option>
            <option value="waiting_for_evidence">Waiting for evidence</option>
            <option value="source_verification_pending">Source verification pending</option>
            <option value="ineligible_reconsiderable">Ineligible — reconsiderable</option>
            <option value="ineligible_final">Ineligible — final</option>
            <option value="exception_review_required">Exception review required</option>
          </Select>
        </FieldWrapper>
        {isConditional && (
          <>
            <FieldWrapper label="Condition" htmlFor="eligibility-condition" required>
              <Textarea id="eligibility-condition" value={condition} onChange={(e) => setCondition(e.target.value)} placeholder="What the applicant must do or provide" />
            </FieldWrapper>
            <FieldWrapper label="Due date" htmlFor="eligibility-due" hint="Optional">
              <Input id="eligibility-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </FieldWrapper>
          </>
        )}
      </div>
    </Sheet>
  );
}

/**
 * Real bug, found live: the Decide sheet only ever rendered Decision +
 * Reason — the student's Notes/preferences and Attachments were already
 * sitting in the `application` object passed into this sheet (the list
 * endpoint returns the full row, not a summary), just never displayed. A
 * Warden had no way to see what was actually submitted before deciding.
 * Read-only, no new API call — the data was always there.
 */
function ApplicationDetails({ application }: { application: HostelApplication }) {
  const residentNames = useResidentNames();
  const { roomType, accessibilityNeed, notes } = application.preferences;
  const hasPreferences = Boolean(roomType || accessibilityNeed || notes);

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
      <div className="flex items-center justify-between">
        <span className="text-slate-500">Student</span>
        <span className="text-xs text-slate-700">{studentLabel(residentNames, application.studentId)}</span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-slate-500">Type</span>
        <span className="text-slate-700">{APPLICATION_TYPE_LABELS[application.applicationType]}</span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-slate-500">Submitted</span>
        <span className="text-slate-700">{new Date(application.createdAt).toLocaleString()}</span>
      </div>
      {application.eligibilityOutcome && (
        <div className="flex items-center justify-between">
          <span className="text-slate-500">Eligibility</span>
          <span className="text-slate-700">{application.eligibilityOutcome.replace(/_/g, ' ')}</span>
        </div>
      )}
      {application.eligibilityConditions && (
        <p className="text-slate-700">
          Condition: {application.eligibilityConditions.condition}
          {application.eligibilityConditions.dueDate && ` (due ${application.eligibilityConditions.dueDate})`}
        </p>
      )}
      {application.reopenReason && (
        <p className="text-slate-700">Reopened because: {application.reopenReason}</p>
      )}

      {hasPreferences && (
        <div className="border-t border-slate-200 pt-3">
          <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">Preferences</p>
          {roomType && <p className="text-slate-700">Room type: {roomType}</p>}
          {accessibilityNeed && <p className="text-slate-700">Accessibility need: {accessibilityNeed}</p>}
          {notes && <p className="whitespace-pre-wrap text-slate-700">{notes}</p>}
        </div>
      )}

      <div className="border-t border-slate-200 pt-3">
        <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">
          Attachments {application.attachments.length === 0 && <span className="normal-case text-slate-400">— none provided</span>}
        </p>
        {application.attachments.length > 0 && (
          <ul className="space-y-1">
            {application.attachments.map((a, i) => (
              <li key={`${a.url}-${i}`}>
                <a href={a.url} target="_blank" rel="noreferrer" className="text-accent underline underline-offset-2">
                  {a.name}
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ResubmitSheet({
  application,
  onClose,
  onResubmitted,
}: {
  application: HostelApplication;
  onClose: () => void;
  onResubmitted: () => void;
}) {
  const [notes, setNotes] = useState(application.preferences.notes ?? '');
  const [attachments, setAttachments] = useState<ApplicationAttachment[]>(application.attachments);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      await api.resubmitApplication(application.id, {
        preferences: { ...application.preferences, notes: notes || undefined },
        attachments,
      });
      onResubmitted();
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
      title={`Resubmit — Term ${application.term}`}
      footer={
        <Button fullWidth onClick={() => void handleSubmit()} disabled={submitting}>
          {submitting ? 'Resubmitting…' : 'Resubmit application'}
        </Button>
      }
    >
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        {application.decisionReason && (
          <Alert tone="warning">Returned for correction: {application.decisionReason}</Alert>
        )}
        <FieldWrapper label="Notes / preferences" htmlFor="resubmit-notes">
          <Textarea id="resubmit-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </FieldWrapper>
        <FieldWrapper label="Attachments" htmlFor="resubmit-attachments">
          <AttachmentsEditor value={attachments} onChange={setAttachments} />
        </FieldWrapper>
      </div>
    </Sheet>
  );
}

// D17.02 item 51 — three small, near-identical confirm-with-reason sheets.
// Kept separate rather than one generic "confirm action" component: the
// reason-required-ness differs (Withdraw's is optional, Cancel/Reopen's
// are mandatory) and each calls a different endpoint — the duplication is
// small enough that a shared abstraction would cost more to read than it
// saves.

function CancelSheet({
  application,
  onClose,
  onCancelled,
}: {
  application: HostelApplication;
  onClose: () => void;
  onCancelled: () => void;
}) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      await api.cancelApplication(application.id, reason);
      onCancelled();
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
      title={`Cancel application — Term ${application.term}`}
      footer={
        <Button fullWidth variant="danger" onClick={() => void handleSubmit()} disabled={submitting || !reason.trim()}>
          {submitting ? 'Cancelling…' : 'Cancel application'}
        </Button>
      }
    >
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <Alert tone="warning">This ends the application on the institution's authority — the applicant will be notified.</Alert>
        <FieldWrapper label="Reason" htmlFor="cancel-reason" required>
          <Textarea id="cancel-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
        </FieldWrapper>
      </div>
    </Sheet>
  );
}

function ReopenSheet({
  application,
  onClose,
  onReopened,
}: {
  application: HostelApplication;
  onClose: () => void;
  onReopened: () => void;
}) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      await api.reopenApplication(application.id, reason);
      onReopened();
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
      title={`Reopen application — Term ${application.term}`}
      footer={
        <Button fullWidth onClick={() => void handleSubmit()} disabled={submitting || !reason.trim()}>
          {submitting ? 'Reopening…' : 'Reopen for review'}
        </Button>
      }
    >
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <ApplicationDetails application={application} />
        <Alert tone="warning">The prior decision stays on record — this doesn't overwrite it, just resumes review.</Alert>
        <FieldWrapper label="Reason" htmlFor="reopen-reason" required>
          <Textarea id="reopen-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
        </FieldWrapper>
      </div>
    </Sheet>
  );
}

function WithdrawSheet({
  application,
  onClose,
  onWithdrawn,
}: {
  application: HostelApplication;
  onClose: () => void;
  onWithdrawn: () => void;
}) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      await api.withdrawApplication(application.id, reason || undefined);
      onWithdrawn();
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
      title={`Withdraw application — Term ${application.term}`}
      footer={
        <Button fullWidth variant="danger" onClick={() => void handleSubmit()} disabled={submitting}>
          {submitting ? 'Withdrawing…' : 'Withdraw application'}
        </Button>
      }
    >
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <FieldWrapper label="Reason" htmlFor="withdraw-reason" hint="Optional">
          <Textarea id="withdraw-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
        </FieldWrapper>
      </div>
    </Sheet>
  );
}
