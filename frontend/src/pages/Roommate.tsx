import { useEffect, useState } from 'react';
import * as casesApi from '../api/cases';
import * as roommateApi from '../api/roommate';
import type { RoommateRequest } from '../api/roommate';
import { useAuth } from '../context/AuthContext';
import { Alert, Button, Card, EmptyState, FieldWrapper, Input, PageHeader, PageSpinner, Select, Sheet, StatusPill, Textarea } from '../design-system';
import { AlertIcon } from '../design-system/icons';
import { errorMessage } from '../lib/errorMessage';
import { hasHostelRole, isPlatformAdmin } from '../types';
import type { CompatibilityRecommendation } from '../api/roommate';

/** D17.26 (TODO.md Batch 30, item 126) — "HOSTEL V1.1.md" §24J /
 * D17-LAW-37. A mutual-consent workflow, not a staff-run one: both
 * residents must agree before a roommate preference is created, and
 * accepting is only ever a recommendation for allocation staff, never a
 * guarantee. Not staff-only — this page is almost entirely resident
 * self-service. */

function useResidentNames(): Record<string, string> {
  const [names, setNames] = useState<Record<string, string>>({});
  useEffect(() => {
    void casesApi.listResidentDirectory().then((residents) => {
      setNames(Object.fromEntries(residents.map((r) => [r.id, r.name])));
    });
  }, []);
  return names;
}

export function Roommate() {
  const { me } = useAuth();
  const isStaff = isPlatformAdmin(me) || hasHostelRole(me, 'warden');
  const residentNames = useResidentNames();
  const [requests, setRequests] = useState<RoommateRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [requestOpen, setRequestOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<{ id: string; name: string; email: string }[]>([]);

  async function load() {
    setLoading(true);
    setRequests(await roommateApi.listMyRequests());
    setLoading(false);
  }

  useEffect(() => {
    void load();
    void casesApi.listResidentDirectory().then(setCandidates);
  }, []);

  return (
    <div>
      <PageHeader
        title="Roommate Preference"
        description="Request a specific roommate — both of you have to agree before it becomes a recommendation for allocation staff."
      />

      <div className="mb-4 flex justify-end">
        <Button onClick={() => setRequestOpen(true)}>Request a roommate</Button>
      </div>

      {isStaff && <CompatibilityCheckCard residentNames={residentNames} candidates={candidates} />}

      {loading ? (
        <PageSpinner />
      ) : requests.length === 0 ? (
        <EmptyState icon={<AlertIcon className="h-8 w-8" />} title="No roommate requests" description="Request one above." />
      ) : (
        <Card>
          <ul className="divide-y divide-slate-100">
            {requests.map((r) => {
              const isSender = r.requestingStudentId === me?.sub;
              const otherId = isSender ? r.requestedStudentId : r.requestingStudentId;
              return (
                <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setDetailId(r.id)}>
                    <p className="flex items-center gap-2 text-sm">
                      <span className="font-medium text-slate-800">{residentNames[otherId] ?? otherId.slice(0, 8)}</span>
                      <StatusPill status={r.status} />
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {isSender ? 'You requested' : 'Requested you'} — {r.term}
                    </p>
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <RequestRoommateSheet open={requestOpen} onClose={() => setRequestOpen(false)} onRequested={load} candidates={candidates} currentUserId={me?.sub} />
      {detailId && (
        <RequestDetailSheet id={detailId} currentUserId={me?.sub} residentNames={residentNames} onClose={() => setDetailId(null)} onChanged={load} />
      )}
    </div>
  );
}

/** §24J.3/§24J.4 — the allocation-time recommendation staff actually
 * see: whether a mutual accepted match exists, never either resident's
 * own compatibility answers. */
function CompatibilityCheckCard({ residentNames, candidates }: { residentNames: Record<string, string>; candidates: { id: string; name: string; email: string }[] }) {
  const [studentId, setStudentId] = useState('');
  const [term, setTerm] = useState('');
  const [result, setResult] = useState<CompatibilityRecommendation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  async function handleCheck() {
    setChecking(true);
    setError(null);
    setResult(null);
    try {
      setResult(await roommateApi.getCompatibilityRecommendation(studentId, term));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setChecking(false);
    }
  }

  return (
    <Card className="mb-4">
      <div className="space-y-3 p-4 sm:p-5">
        <p className="text-sm font-medium text-slate-900">Compatibility check (allocation planning)</p>
        {error && <Alert>{error}</Alert>}
        <div className="grid grid-cols-2 gap-2">
          <Select value={studentId} onChange={(e) => setStudentId(e.target.value)}>
            <option value="">Select a resident…</option>
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.email})
              </option>
            ))}
          </Select>
          <Input placeholder="Term, e.g. 2026-Fall" value={term} onChange={(e) => setTerm(e.target.value)} />
        </div>
        <Button size="sm" disabled={!studentId || !term.trim() || checking} onClick={() => void handleCheck()}>
          Check
        </Button>
        {result && (
          <p className="text-sm text-slate-700">
            {result.hasMutualMatch
              ? `Mutual accepted match with ${residentNames[result.otherStudentId ?? ''] ?? result.otherStudentId?.slice(0, 8)} — recommend placing together if shared capacity allows.`
              : 'No mutual accepted roommate match for this term.'}
          </p>
        )}
      </div>
    </Card>
  );
}

function RequestRoommateSheet({
  open,
  onClose,
  onRequested,
  candidates,
  currentUserId,
}: {
  open: boolean;
  onClose: () => void;
  onRequested: () => void;
  candidates: { id: string; name: string; email: string }[];
  currentUserId: string | undefined;
}) {
  const [requestedStudentId, setRequestedStudentId] = useState('');
  const [term, setTerm] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      await roommateApi.requestRoommate(requestedStudentId, term, message || undefined);
      onRequested();
      onClose();
      setTerm('');
      setMessage('');
      setRequestedStudentId('');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  const otherCandidates = candidates.filter((c) => c.id !== currentUserId);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Request a roommate"
      footer={
        <Button fullWidth onClick={() => void handleSubmit()} disabled={submitting || !requestedStudentId || !term.trim()}>
          {submitting ? 'Sending…' : 'Send request'}
        </Button>
      }
    >
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <Alert>Both of you need an eligible application for the same term. They'll get a private consent request — nothing happens until they accept.</Alert>
        <FieldWrapper label="Resident" htmlFor="rr-student" required>
          <Select id="rr-student" value={requestedStudentId} onChange={(e) => setRequestedStudentId(e.target.value)}>
            <option value="">Select a resident…</option>
            {otherCandidates.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.email})
              </option>
            ))}
          </Select>
        </FieldWrapper>
        <FieldWrapper label="Term" htmlFor="rr-term" required hint="Must match your own application's term, e.g. 2026-Fall">
          <Input id="rr-term" value={term} onChange={(e) => setTerm(e.target.value)} />
        </FieldWrapper>
        <FieldWrapper label="Message" htmlFor="rr-message" hint="Optional">
          <Textarea id="rr-message" value={message} onChange={(e) => setMessage(e.target.value)} />
        </FieldWrapper>
      </div>
    </Sheet>
  );
}

function RequestDetailSheet({
  id,
  currentUserId,
  residentNames,
  onClose,
  onChanged,
}: {
  id: string;
  currentUserId: string | undefined;
  residentNames: Record<string, string>;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState<RoommateRequest | null>(null);
  const [declineReason, setDeclineReason] = useState('');
  const [revokeReason, setRevokeReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<string | null>(null);

  async function refresh() {
    setDetail(await roommateApi.getRequest(id));
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
      <Sheet open onClose={onClose} title="Roommate request">
        <PageSpinner />
      </Sheet>
    );
  }

  const isRecipient = detail.requestedStudentId === currentUserId;
  const isParty = isRecipient || detail.requestingStudentId === currentUserId;
  const otherId = detail.requestingStudentId === currentUserId ? detail.requestedStudentId : detail.requestingStudentId;

  return (
    <Sheet open onClose={onClose} title={residentNames[otherId] ?? otherId.slice(0, 8)}>
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <p>
          <StatusPill status={detail.status} />
        </p>
        <p className="text-xs text-slate-500">Term: {detail.term}</p>
        {detail.message && <p className="text-sm text-slate-700">{detail.message}</p>}
        {detail.status === 'pending' && <p className="text-xs text-slate-500">Expires {new Date(detail.expiresAt).toLocaleString()}</p>}
        {detail.declineReason && <p className="text-xs text-slate-500">Declined: {detail.declineReason}</p>}
        {detail.status === 'accepted' && (
          <Alert>This is now a recommendation for allocation staff — placement together still depends on available shared capacity.</Alert>
        )}

        {isRecipient && detail.status === 'pending' && (
          <div className="space-y-2 border-t border-slate-200 pt-4">
            <p className="text-sm font-medium text-slate-800">Respond</p>
            <Input placeholder="Reason if declining (optional)" value={declineReason} onChange={(e) => setDeclineReason(e.target.value)} />
            <div className="flex gap-2">
              <Button size="sm" disabled={Boolean(submitting)} onClick={() => void run('accept', () => roommateApi.respondToRequest(detail.id, 'accepted'))}>
                Accept
              </Button>
              <Button size="sm" variant="danger" disabled={Boolean(submitting)} onClick={() => void run('decline', () => roommateApi.respondToRequest(detail.id, 'declined', declineReason || undefined))}>
                Decline
              </Button>
            </div>
          </div>
        )}

        {isParty && ['pending', 'accepted'].includes(detail.status) && (
          <div className="space-y-2 border-t border-slate-200 pt-4">
            <p className="text-sm font-medium text-slate-800">Revoke</p>
            <div className="flex gap-2">
              <Input placeholder="Reason" value={revokeReason} onChange={(e) => setRevokeReason(e.target.value)} className="flex-1" />
              <Button size="sm" variant="danger" disabled={!revokeReason.trim() || Boolean(submitting)} onClick={() => void run('revoke', () => roommateApi.revokeRequest(detail.id, revokeReason))}>
                Revoke
              </Button>
            </div>
          </div>
        )}
      </div>
    </Sheet>
  );
}
