import { useEffect, useState } from 'react';
import * as casesApi from '../api/cases';
import * as roomAccessApi from '../api/roomAccess';
import * as visitorsApi from '../api/visitors';
import type { VisitorRequestInput } from '../api/visitors';
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
  type PropertyCustody,
  type ShiftHandover,
  type VisitorCategory,
  type VisitorHostType,
  type VisitorRequest,
} from '../types';

/** D17.06 (TODO.md Batch 28) — the first-ever frontend page for this
 * capability (item 115). Not staff-only — a host requests/tracks their own
 * visitor; deciding, gate entry/exit, closing/reopening, hotlisting and the
 * shift handover are all staff-gated server-side (see visitors/service.ts). */

const HOST_TYPE_LABELS: Record<VisitorHostType, string> = {
  resident: 'Resident',
  day_scholar: 'Day Scholar',
  faculty: 'Faculty',
  staff: 'Staff',
  department: 'Department',
  campus_office: 'Campus Office',
  other: 'Other',
};

const VISITOR_CATEGORY_LABELS: Record<VisitorCategory, string> = {
  family: 'Family',
  friend: 'Friend',
  vendor: 'Vendor',
  official: 'Official',
  delivery: 'Delivery',
  other: 'Other',
};

type Tab = 'visitors' | 'packages' | 'handover';

function useResidentNames(): Record<string, string> {
  const [names, setNames] = useState<Record<string, string>>({});
  useEffect(() => {
    void casesApi.listResidentDirectory().then((residents) => {
      setNames(Object.fromEntries(residents.map((r) => [r.id, r.name])));
    });
  }, []);
  return names;
}

export function Visitors() {
  const { me } = useAuth();
  const isStaff = isPlatformAdmin(me) || hasHostelRole(me, 'warden');
  const [tab, setTab] = useState<Tab>('visitors');

  const tabs: [Tab, string][] = [
    ['visitors', 'Visitors'],
    ['packages', 'Packages'],
    ...(isStaff ? ([['handover', 'Shift Handover']] as [Tab, string][]) : []),
  ];

  return (
    <div>
      <PageHeader title="Visitors &amp; Front Desk" description="Visitor requests, temporary passes, package custody and the front-desk shift handover." />

      <div className="mb-6 flex gap-1 border-b border-slate-200">
        {tabs.map(([value, label]) => (
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

      {tab === 'visitors' && <VisitorsTab isStaff={isStaff} currentUserId={me?.sub} />}
      {tab === 'packages' && <PackagesTab isStaff={isStaff} />}
      {tab === 'handover' && isStaff && <HandoverTab />}
    </div>
  );
}

// ============================================================================
// Visitors
// ============================================================================

function VisitorsTab({ isStaff, currentUserId }: { isStaff: boolean; currentUserId: string | undefined }) {
  const residentNames = useResidentNames();
  const [visitors, setVisitors] = useState<VisitorRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [requestOpen, setRequestOpen] = useState(false);
  const [detailTarget, setDetailTarget] = useState<VisitorRequest | null>(null);

  async function load() {
    setLoading(true);
    setVisitors(await visitorsApi.listVisitorRequests());
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => setRequestOpen(true)}>Request a visitor</Button>
      </div>

      {loading ? (
        <PageSpinner />
      ) : visitors.length === 0 ? (
        <EmptyState icon={<AlertIcon className="h-8 w-8" />} title="No visitor requests" description="Request one above." />
      ) : (
        <Card>
          <ul className="divide-y divide-slate-100">
            {visitors.map((v) => (
              <li key={v.id} className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setDetailTarget(v)}>
                  <p className="flex items-center gap-2 text-sm">
                    <span className="font-medium text-slate-800">{v.visitorName}</span>
                    <StatusPill status={v.status} domain={v.status === 'reopened' ? 'visitor' : undefined} />
                    {v.credentialHotlisted && <span className="text-xs text-rose-600">Hotlisted</span>}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {isStaff && `Host: ${residentNames[v.hostUserId] ?? v.hostUserId.slice(0, 8)} — `}
                    {new Date(v.requestedVisitStart).toLocaleString()}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <RequestVisitorSheet open={requestOpen} onClose={() => setRequestOpen(false)} onRequested={load} />
      {detailTarget && (
        <VisitorDetailSheet visitor={detailTarget} isStaff={isStaff} currentUserId={currentUserId} residentNames={residentNames} onClose={() => setDetailTarget(null)} onChanged={load} />
      )}
    </div>
  );
}

function VisitorRequestFields({
  input,
  setInput,
}: {
  input: VisitorRequestInput;
  setInput: (input: VisitorRequestInput) => void;
}) {
  return (
    <>
      <FieldWrapper label="Host type" htmlFor="vr-hosttype">
        <Select id="vr-hosttype" value={input.hostType ?? 'resident'} onChange={(e) => setInput({ ...input, hostType: e.target.value as VisitorHostType })}>
          {Object.entries(HOST_TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </FieldWrapper>
      <FieldWrapper label="Visitor name" htmlFor="vr-name" required>
        <Input id="vr-name" value={input.visitorName} onChange={(e) => setInput({ ...input, visitorName: e.target.value })} />
      </FieldWrapper>
      <FieldWrapper label="Visitor phone" htmlFor="vr-phone" required>
        <Input id="vr-phone" value={input.visitorPhone} onChange={(e) => setInput({ ...input, visitorPhone: e.target.value })} />
      </FieldWrapper>
      <FieldWrapper label="Category" htmlFor="vr-category">
        <Select
          id="vr-category"
          value={input.visitorCategory ?? ''}
          onChange={(e) => setInput({ ...input, visitorCategory: (e.target.value || undefined) as VisitorCategory | undefined })}
        >
          <option value="">Not specified</option>
          {Object.entries(VISITOR_CATEGORY_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </FieldWrapper>
      <FieldWrapper label="Purpose" htmlFor="vr-purpose" required>
        <Textarea id="vr-purpose" value={input.purpose} onChange={(e) => setInput({ ...input, purpose: e.target.value })} />
      </FieldWrapper>
      <div className="grid grid-cols-2 gap-3">
        <FieldWrapper label="Visit start" htmlFor="vr-start" required>
          <Input id="vr-start" type="datetime-local" value={input.requestedVisitStart} onChange={(e) => setInput({ ...input, requestedVisitStart: e.target.value })} />
        </FieldWrapper>
        <FieldWrapper label="Visit end" htmlFor="vr-end" required>
          <Input id="vr-end" type="datetime-local" value={input.requestedVisitEnd} onChange={(e) => setInput({ ...input, requestedVisitEnd: e.target.value })} />
        </FieldWrapper>
      </div>
      <FieldWrapper label="Emergency contact" htmlFor="vr-emergency" hint="Optional">
        <Input id="vr-emergency" value={input.emergencyContact ?? ''} onChange={(e) => setInput({ ...input, emergencyContact: e.target.value || undefined })} />
      </FieldWrapper>
    </>
  );
}

const EMPTY_VISITOR_INPUT: VisitorRequestInput = {
  hostType: 'resident',
  visitorName: '',
  visitorPhone: '',
  purpose: '',
  requestedVisitStart: '',
  requestedVisitEnd: '',
};

function RequestVisitorSheet({ open, onClose, onRequested }: { open: boolean; onClose: () => void; onRequested: () => void }) {
  const [input, setInput] = useState<VisitorRequestInput>(EMPTY_VISITOR_INPUT);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      await visitorsApi.requestVisitor({
        ...input,
        requestedVisitStart: new Date(input.requestedVisitStart).toISOString(),
        requestedVisitEnd: new Date(input.requestedVisitEnd).toISOString(),
      });
      onRequested();
      onClose();
      setInput(EMPTY_VISITOR_INPUT);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit = input.visitorName.trim() && input.visitorPhone.trim() && input.purpose.trim() && input.requestedVisitStart && input.requestedVisitEnd;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Request a visitor"
      footer={
        <Button fullWidth onClick={() => void handleSubmit()} disabled={submitting || !canSubmit}>
          {submitting ? 'Submitting…' : 'Submit request'}
        </Button>
      }
    >
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <VisitorRequestFields input={input} setInput={setInput} />
      </div>
    </Sheet>
  );
}

function VisitorDetailSheet({
  visitor,
  isStaff,
  currentUserId,
  residentNames,
  onClose,
  onChanged,
}: {
  visitor: VisitorRequest;
  isStaff: boolean;
  currentUserId: string | undefined;
  residentNames: Record<string, string>;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState(visitor);
  const [decisionReason, setDecisionReason] = useState('');
  const [resubmitInput, setResubmitInput] = useState<VisitorRequestInput>({
    hostType: visitor.hostType,
    visitorName: visitor.visitorName,
    visitorPhone: visitor.visitorPhone,
    visitorCategory: visitor.visitorCategory ?? undefined,
    purpose: visitor.purpose,
    requestedVisitStart: visitor.requestedVisitStart.slice(0, 16),
    requestedVisitEnd: visitor.requestedVisitEnd.slice(0, 16),
    emergencyContact: visitor.emergencyContact ?? undefined,
  });
  const [cancelReason, setCancelReason] = useState('');
  const [reopenReason, setReopenReason] = useState('');
  const [hotlistReason, setHotlistReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<string | null>(null);

  async function refresh() {
    setDetail(await visitorsApi.getVisitorRequest(visitor.id));
  }

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

  const isHost = detail.hostUserId === currentUserId;

  return (
    <Sheet open onClose={onClose} title={detail.visitorName}>
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <p className="flex items-center gap-2 text-sm">
          <StatusPill status={detail.status} domain={detail.status === 'reopened' ? 'visitor' : undefined} />
          {detail.credentialHotlisted && <span className="text-xs text-rose-600">Credential hotlisted: {detail.credentialHotlistedReason}</span>}
        </p>
        <p className="text-sm text-slate-700">{detail.purpose}</p>
        <p className="text-xs text-slate-500">
          Host: {residentNames[detail.hostUserId] ?? detail.hostUserId.slice(0, 8)} ({HOST_TYPE_LABELS[detail.hostType]}) · {detail.visitorPhone}
        </p>
        <p className="text-xs text-slate-500">
          Requested {new Date(detail.requestedVisitStart).toLocaleString()} – {new Date(detail.requestedVisitEnd).toLocaleString()}
        </p>
        {detail.decisionReason && <p className="text-xs text-slate-500">Decision: {detail.decisionReason}</p>}
        {detail.credentialId && (
          <p className="text-xs text-slate-500">
            Pass {detail.credentialId} — valid {detail.credentialValidFrom && new Date(detail.credentialValidFrom).toLocaleString()} to{' '}
            {detail.credentialValidUntil && new Date(detail.credentialValidUntil).toLocaleString()}
          </p>
        )}
        {detail.enteredAt && <p className="text-xs text-emerald-600">Entered {new Date(detail.enteredAt).toLocaleString()}</p>}
        {detail.exitedAt && <p className="text-xs text-slate-500">Exited {new Date(detail.exitedAt).toLocaleString()}</p>}
        {detail.reopenReason && <p className="text-xs text-amber-600">Reopened: {detail.reopenReason}</p>}

        {isStaff && detail.status === 'requested' && (
          <div className="space-y-2 border-t border-slate-200 pt-4">
            <p className="text-sm font-medium text-slate-800">Decide</p>
            <Textarea placeholder="Reason" value={decisionReason} onChange={(e) => setDecisionReason(e.target.value)} />
            <div className="flex flex-wrap gap-2">
              <Button size="sm" disabled={!decisionReason.trim() || Boolean(submitting)} onClick={() => void run('approve', () => visitorsApi.decideVisitorRequest(detail.id, 'approved', decisionReason))}>
                Approve
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={!decisionReason.trim() || Boolean(submitting)}
                onClick={() => void run('return', () => visitorsApi.decideVisitorRequest(detail.id, 'returned_for_information', decisionReason))}
              >
                Return for information
              </Button>
              <Button size="sm" variant="danger" disabled={!decisionReason.trim() || Boolean(submitting)} onClick={() => void run('deny', () => visitorsApi.decideVisitorRequest(detail.id, 'denied', decisionReason))}>
                Deny
              </Button>
            </div>
          </div>
        )}

        {isHost && detail.status === 'returned_for_information' && (
          <div className="space-y-2 border-t border-slate-200 pt-4">
            <p className="text-sm font-medium text-slate-800">Resubmit</p>
            <VisitorRequestFields input={resubmitInput} setInput={setResubmitInput} />
            <Button
              size="sm"
              fullWidth
              disabled={Boolean(submitting)}
              onClick={() =>
                void run('resubmit', () =>
                  visitorsApi.resubmitVisitorRequest(detail.id, {
                    ...resubmitInput,
                    requestedVisitStart: new Date(resubmitInput.requestedVisitStart).toISOString(),
                    requestedVisitEnd: new Date(resubmitInput.requestedVisitEnd).toISOString(),
                  })
                )
              }
            >
              Resubmit for review
            </Button>
          </div>
        )}

        {isStaff && detail.status === 'pass_issued' && (
          <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-4">
            <Button size="sm" disabled={Boolean(submitting)} onClick={() => void run('enter', () => visitorsApi.recordVisitorEntry(detail.id))}>
              Record entry
            </Button>
          </div>
        )}

        {isStaff && ['entered', 'overstay'].includes(detail.status) && (
          <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-4">
            <Button size="sm" disabled={Boolean(submitting)} onClick={() => void run('exit', () => visitorsApi.recordVisitorExit(detail.id))}>
              Record exit
            </Button>
          </div>
        )}

        {isStaff && detail.status === 'exited' && (
          <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-4">
            <Button size="sm" variant="secondary" disabled={Boolean(submitting)} onClick={() => void run('close', () => visitorsApi.closeVisitorRequest(detail.id))}>
              Close
            </Button>
          </div>
        )}

        {isStaff && ['pass_issued', 'entered', 'overstay'].includes(detail.status) && !detail.credentialHotlisted && (
          <div className="space-y-2 border-t border-slate-200 pt-4">
            <p className="text-sm font-medium text-slate-800">Hotlist credential</p>
            <div className="flex gap-2">
              <Input placeholder="Reason" value={hotlistReason} onChange={(e) => setHotlistReason(e.target.value)} className="flex-1" />
              <Button size="sm" variant="danger" disabled={!hotlistReason.trim() || Boolean(submitting)} onClick={() => void run('hotlist', () => visitorsApi.hotlistCredential(detail.id, hotlistReason))}>
                Hotlist
              </Button>
            </div>
          </div>
        )}

        {isStaff && detail.status === 'closed' && (
          <div className="space-y-2 border-t border-slate-200 pt-4">
            <p className="text-sm font-medium text-slate-800">Reopen</p>
            <div className="flex gap-2">
              <Input placeholder="Reason" value={reopenReason} onChange={(e) => setReopenReason(e.target.value)} className="flex-1" />
              <Button size="sm" variant="secondary" disabled={!reopenReason.trim() || Boolean(submitting)} onClick={() => void run('reopen', () => visitorsApi.reopenVisitorRequest(detail.id, reopenReason))}>
                Reopen
              </Button>
            </div>
          </div>
        )}

        {(isHost || isStaff) && ['requested', 'returned_for_information', 'approved', 'pass_issued'].includes(detail.status) && (
          <div className="space-y-2 border-t border-slate-200 pt-4">
            <p className="text-sm font-medium text-slate-800">Cancel</p>
            <div className="flex gap-2">
              <Input placeholder="Reason" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} className="flex-1" />
              <Button size="sm" variant="danger" disabled={!cancelReason.trim() || Boolean(submitting)} onClick={() => void run('cancel', () => visitorsApi.cancelVisitorRequest(detail.id, cancelReason))}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    </Sheet>
  );
}

// ============================================================================
// Packages
// ============================================================================

function PackagesTab({ isStaff }: { isStaff: boolean }) {
  const residentNames = useResidentNames();
  const [packages, setPackages] = useState<PropertyCustody[]>([]);
  const [loading, setLoading] = useState(true);
  const [recordOpen, setRecordOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setPackages(await roomAccessApi.listCustody({ custodyType: 'package_delivery' }));
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  async function run(id: string, action: string, fn: () => Promise<unknown>) {
    setSubmitting(`${id}-${action}`);
    setError(null);
    try {
      await fn();
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <div>
      {error && <Alert>{error}</Alert>}
      {isStaff && (
        <div className="mb-4 flex justify-end">
          <Button onClick={() => setRecordOpen(true)}>Record a package</Button>
        </div>
      )}

      {loading ? (
        <PageSpinner />
      ) : packages.length === 0 ? (
        <EmptyState icon={<AlertIcon className="h-8 w-8" />} title="No packages on record" description={isStaff ? 'Record one above.' : 'Nothing waiting for you at the front desk.'} />
      ) : (
        <Card>
          <ul className="divide-y divide-slate-100">
            {packages.map((p) => (
              <li key={p.id} className="space-y-1.5 px-4 py-3 sm:px-5">
                <p className="flex items-center gap-2 text-sm">
                  <span className="font-medium text-slate-800">{p.itemDescription}</span>
                  <StatusPill status={p.status} domain="custody" />
                </p>
                <p className="text-xs text-slate-500">
                  {p.studentId && `For: ${residentNames[p.studentId] ?? p.studentId.slice(0, 8)} — `}
                  {p.carrier && `${p.carrier} `}
                  {p.trackingNumber && `#${p.trackingNumber}`}
                  {p.notificationAttempts > 0 && ` — notified ${p.notificationAttempts}×`}
                </p>
                {isStaff && p.status === 'in_custody' && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button size="sm" variant="secondary" disabled={Boolean(submitting)} onClick={() => void run(p.id, 'remind', () => roomAccessApi.sendPackageReminder(p.id))}>
                      Send reminder
                    </Button>
                    <CollectPackageControl packageId={p.id} disabled={Boolean(submitting)} onCollected={load} onError={setError} />
                  </div>
                )}
                {p.identityVerificationNotes && <p className="text-xs text-slate-500">Collected — ID check: {p.identityVerificationNotes}</p>}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <RecordPackageSheet open={recordOpen} onClose={() => setRecordOpen(false)} onRecorded={load} />
    </div>
  );
}

function CollectPackageControl({
  packageId,
  disabled,
  onCollected,
  onError,
}: {
  packageId: string;
  disabled: boolean;
  onCollected: () => void;
  onError: (msg: string) => void;
}) {
  const [releasedTo, setReleasedTo] = useState('');
  const [identityNotes, setIdentityNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleCollect() {
    setSubmitting(true);
    try {
      await roomAccessApi.releaseCustody(packageId, releasedTo, undefined, identityNotes || undefined);
      onCollected();
    } catch (err) {
      onError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-1 flex-wrap gap-2">
      <Input placeholder="Collected by (name)" value={releasedTo} onChange={(e) => setReleasedTo(e.target.value)} className="flex-1" />
      <Input placeholder="ID check notes" value={identityNotes} onChange={(e) => setIdentityNotes(e.target.value)} className="flex-1" />
      <Button size="sm" disabled={disabled || submitting || !releasedTo.trim()} onClick={() => void handleCollect()}>
        Mark collected
      </Button>
    </div>
  );
}

function RecordPackageSheet({ open, onClose, onRecorded }: { open: boolean; onClose: () => void; onRecorded: () => void }) {
  const [studentId, setStudentId] = useState('');
  const [candidates, setCandidates] = useState<{ id: string; name: string; email: string }[]>([]);
  const [itemDescription, setItemDescription] = useState('');
  const [carrier, setCarrier] = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [restrictedItemFlag, setRestrictedItemFlag] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    void casesApi.listResidentDirectory().then((residents) => setCandidates(residents));
  }, [open]);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      await roomAccessApi.recordCustody({
        custodyType: 'package_delivery',
        itemDescription,
        studentId: studentId || undefined,
        carrier: carrier || undefined,
        trackingNumber: trackingNumber || undefined,
        restrictedItemFlag,
      });
      onRecorded();
      onClose();
      setStudentId('');
      setItemDescription('');
      setCarrier('');
      setTrackingNumber('');
      setRestrictedItemFlag(false);
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
      title="Record a package"
      footer={
        <Button fullWidth onClick={() => void handleSubmit()} disabled={submitting || !itemDescription.trim()}>
          {submitting ? 'Recording…' : 'Record — notifies the resident'}
        </Button>
      }
    >
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <FieldWrapper label="Recipient" htmlFor="pk-student" hint="Optional — leave blank if unknown">
          <Select id="pk-student" value={studentId} onChange={(e) => setStudentId(e.target.value)}>
            <option value="">Not specified</option>
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.email})
              </option>
            ))}
          </Select>
        </FieldWrapper>
        <FieldWrapper label="Description" htmlFor="pk-desc" required>
          <Input id="pk-desc" value={itemDescription} onChange={(e) => setItemDescription(e.target.value)} />
        </FieldWrapper>
        <div className="grid grid-cols-2 gap-3">
          <FieldWrapper label="Carrier" htmlFor="pk-carrier" hint="Optional">
            <Input id="pk-carrier" value={carrier} onChange={(e) => setCarrier(e.target.value)} />
          </FieldWrapper>
          <FieldWrapper label="Tracking number" htmlFor="pk-tracking" hint="Optional">
            <Input id="pk-tracking" value={trackingNumber} onChange={(e) => setTrackingNumber(e.target.value)} />
          </FieldWrapper>
        </div>
        <label className="flex min-h-touch cursor-pointer items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={restrictedItemFlag} onChange={(e) => setRestrictedItemFlag(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-accent" />
          Restricted item (requires extra handling)
        </label>
      </div>
    </Sheet>
  );
}

// ============================================================================
// Shift Handover
// ============================================================================

function HandoverTab() {
  const residentNames = useResidentNames();
  const [handover, setHandover] = useState<ShiftHandover | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    void visitorsApi.getShiftHandover().then((h) => {
      setHandover(h);
      setLoading(false);
    });
  }, []);

  if (loading || !handover) return <PageSpinner />;

  return (
    <div className="space-y-6">
      <Card>
        <div className="p-4 sm:p-5">
          <p className="mb-2 text-sm font-medium text-slate-900">Active visitors ({handover.activeVisitors.length})</p>
          {handover.activeVisitors.length === 0 ? (
            <p className="text-sm text-slate-500">None on-site right now.</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {handover.activeVisitors.map((v) => (
                <li key={v.id} className="flex items-center justify-between">
                  <span className="text-slate-700">
                    {v.visitorName} — host {residentNames[v.hostUserId] ?? v.hostUserId.slice(0, 8)}
                  </span>
                  <StatusPill status={v.status} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      <Card>
        <div className="p-4 sm:p-5">
          <p className="mb-2 text-sm font-medium text-slate-900">Expected arrivals ({handover.expectedArrivals.length})</p>
          {handover.expectedArrivals.length === 0 ? (
            <p className="text-sm text-slate-500">None expected.</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {handover.expectedArrivals.map((v) => (
                <li key={v.id} className="text-slate-700">
                  {v.visitorName} — pass {v.credentialId}, valid until {v.credentialValidUntil && new Date(v.credentialValidUntil).toLocaleString()}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      <Card>
        <div className="p-4 sm:p-5">
          <p className="mb-2 text-sm font-medium text-slate-900">Outstanding keys ({handover.outstandingKeys.length})</p>
          {handover.outstandingKeys.length === 0 ? (
            <p className="text-sm text-slate-500">None outstanding.</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {handover.outstandingKeys.map((k) => (
                <li key={k.id} className="flex items-center justify-between">
                  <span className="text-slate-700">{k.keyIdentifier}</span>
                  <StatusPill status={k.status} domain="key" />
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      <Card>
        <div className="p-4 sm:p-5">
          <p className="mb-2 text-sm font-medium text-slate-900">Uncollected packages ({handover.uncollectedPackages.length})</p>
          {handover.uncollectedPackages.length === 0 ? (
            <p className="text-sm text-slate-500">None waiting.</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {handover.uncollectedPackages.map((p) => (
                <li key={p.id} className="text-slate-700">
                  {p.itemDescription} {p.studentId && `— ${residentNames[p.studentId] ?? p.studentId.slice(0, 8)}`}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      <Card>
        <div className="p-4 sm:p-5">
          <p className="text-sm font-medium text-slate-900">Residents overdue on movement ({handover.residentsOverdue.length})</p>
          <p className="mt-1 text-xs text-slate-500">See the Leave &amp; Headcount page's own Gate console for detail.</p>
        </div>
      </Card>
    </div>
  );
}
