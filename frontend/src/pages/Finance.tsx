import { useEffect, useState } from 'react';
import * as casesApi from '../api/cases';
import * as financeApi from '../api/finance';
import * as responsibilityApi from '../api/responsibilities';
import type { ResidentCandidate } from '../api/responsibilities';
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
import { hasHostelRole, isPlatformAdmin, type FinancialEvent, type FinancialEventType, type FinancialSummary } from '../types';

/** D17.05 (TODO.md Batch 27) — hostel fee/deposit/lost-key/late/damage
 * charges, waivers and refunds, each carrying its own manual-evidence-vs-
 * Finance-authoritative distinction (BR-HOS-014: Hostel proposes, Finance
 * confirms). Not staff-only — a resident sees and disputes their own
 * events; only raising/confirming/reversing is staff-gated (enforced
 * server-side, see finance/service.ts). */

const EVENT_TYPE_LABELS: Record<FinancialEventType, string> = {
  hostel_fee: 'Hostel Fee',
  deposit: 'Deposit',
  mess_fee_reference: 'Mess Fee (reference only)',
  lost_key_charge: 'Lost Key Charge',
  late_fee: 'Late Fee',
  damage_charge: 'Damage Charge',
  waiver: 'Waiver',
  refund: 'Refund',
};

function useResidentNames(): Record<string, string> {
  const [names, setNames] = useState<Record<string, string>>({});
  useEffect(() => {
    void casesApi.listResidentDirectory().then((residents) => {
      setNames(Object.fromEntries(residents.map((r) => [r.id, r.name])));
    });
  }, []);
  return names;
}

export function Finance() {
  const { me } = useAuth();
  const isStaff = isPlatformAdmin(me) || hasHostelRole(me, 'warden');
  const residentNames = useResidentNames();
  const [events, setEvents] = useState<FinancialEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [raiseOpen, setRaiseOpen] = useState(false);
  const [detailTarget, setDetailTarget] = useState<FinancialEvent | null>(null);
  const [summaryStudentId, setSummaryStudentId] = useState('');
  const [summary, setSummary] = useState<FinancialSummary | null>(null);
  const [candidates, setCandidates] = useState<ResidentCandidate[]>([]);

  async function load() {
    setLoading(true);
    setEvents(await financeApi.listFinancialEvents());
    setLoading(false);
  }

  async function loadSummary(studentId: string) {
    setSummary(studentId ? await financeApi.getResidentFinancialSummary(studentId) : null);
  }

  useEffect(() => {
    void load();
    if (!isStaff && me?.sub) {
      setSummaryStudentId(me.sub);
      void loadSummary(me.sub);
    }
    if (isStaff) void responsibilityApi.listCandidates().then(setCandidates);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <PageHeader
        title="Finance"
        description="Hostel-proposed charges, deposits and refunds — each event is a projection until Finance confirms it. See BR-HOS-014."
        action={isStaff ? <Button onClick={() => setRaiseOpen(true)}>Raise a charge or credit</Button> : undefined}
      />

      {isStaff && (
        <Card className="mb-4">
          <div className="p-4 sm:p-5">
            <FieldWrapper label="Look up a resident's balance" htmlFor="fin-lookup">
              <Select
                id="fin-lookup"
                value={summaryStudentId}
                onChange={(e) => {
                  setSummaryStudentId(e.target.value);
                  void loadSummary(e.target.value);
                }}
              >
                <option value="">Select a resident…</option>
                {candidates.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.email})
                  </option>
                ))}
              </Select>
            </FieldWrapper>
          </div>
        </Card>
      )}

      {summary && (
        <Card className="mb-4">
          <div className="grid grid-cols-2 gap-4 p-4 sm:p-5">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Confirmed balance</p>
              <p className="mt-1 text-2xl font-semibold text-slate-900">₹{summary.confirmedBalance}</p>
              <p className="mt-0.5 text-xs text-slate-500">Finance-authoritative</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Pending projection</p>
              <p className="mt-1 text-2xl font-semibold text-slate-900">₹{summary.pendingProjection}</p>
              <p className="mt-0.5 text-xs text-slate-500">Proposed, not yet confirmed</p>
            </div>
          </div>
          {summary.hasUnresolvedDispute && (
            <div className="border-t border-slate-200 p-4 sm:p-5">
              <Alert tone="warning">This resident has a disputed event awaiting resolution.</Alert>
            </div>
          )}
        </Card>
      )}

      {loading ? (
        <PageSpinner />
      ) : events.length === 0 ? (
        <EmptyState icon={<AlertIcon className="h-8 w-8" />} title="No financial events" description={isStaff ? 'Raise one above.' : 'Nothing on your account yet.'} />
      ) : (
        <Card>
          <ul className="divide-y divide-slate-100">
            {events.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setDetailTarget(e)}>
                  <p className="flex items-center gap-2 text-sm">
                    {isStaff && <span className="font-medium text-slate-800">{residentNames[e.studentId] ?? e.studentId.slice(0, 8)}</span>}
                    <StatusPill status={e.status} />
                    {e.disputed && <span className="text-xs text-rose-600">Disputed</span>}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {EVENT_TYPE_LABELS[e.eventType]} — ₹{e.amount} — {e.description}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {isStaff && (
        <RaiseFinancialEventSheet
          open={raiseOpen}
          onClose={() => setRaiseOpen(false)}
          onRaised={() => {
            void load();
            if (summaryStudentId) void loadSummary(summaryStudentId);
          }}
        />
      )}
      {detailTarget && (
        <FinancialEventDetailSheet
          event={detailTarget}
          isStaff={isStaff}
          currentUserId={me?.sub}
          residentNames={residentNames}
          onClose={() => setDetailTarget(null)}
          onChanged={() => {
            void load();
            if (summaryStudentId) void loadSummary(summaryStudentId);
          }}
        />
      )}
    </div>
  );
}

function RaiseFinancialEventSheet({ open, onClose, onRaised }: { open: boolean; onClose: () => void; onRaised: () => void }) {
  const [studentId, setStudentId] = useState('');
  const [candidates, setCandidates] = useState<ResidentCandidate[]>([]);
  const [eventType, setEventType] = useState<FinancialEventType>('hostel_fee');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [evidenceNotes, setEvidenceNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    void responsibilityApi.listCandidates().then(setCandidates);
  }, [open]);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      await financeApi.raiseFinancialEvent({
        studentId,
        eventType,
        amount: Number(amount),
        description,
        evidenceNotes: evidenceNotes || undefined,
      });
      onRaised();
      onClose();
      setStudentId('');
      setAmount('');
      setDescription('');
      setEvidenceNotes('');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit = studentId && Number(amount) > 0 && description.trim();

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Raise a charge or credit"
      footer={
        <Button fullWidth onClick={() => void handleSubmit()} disabled={submitting || !canSubmit}>
          {submitting ? 'Raising…' : 'Raise — pending Finance confirmation'}
        </Button>
      }
    >
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <Alert tone="warning">This proposes the event only. It becomes authoritative once a Head Warden or Finance Officer confirms it.</Alert>
        <FieldWrapper label="Resident" htmlFor="fe-student" required>
          <Select id="fe-student" value={studentId} onChange={(e) => setStudentId(e.target.value)}>
            <option value="">Select a resident…</option>
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.email})
              </option>
            ))}
          </Select>
        </FieldWrapper>
        <FieldWrapper label="Type" htmlFor="fe-type">
          <Select id="fe-type" value={eventType} onChange={(e) => setEventType(e.target.value as FinancialEventType)}>
            {Object.entries(EVENT_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </FieldWrapper>
        <FieldWrapper label="Amount (₹)" htmlFor="fe-amount" required>
          <Input id="fe-amount" type="number" min={0.01} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </FieldWrapper>
        <FieldWrapper label="Description" htmlFor="fe-desc" required>
          <Textarea id="fe-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
        </FieldWrapper>
        <FieldWrapper label="Evidence notes" htmlFor="fe-evidence" hint="e.g. what proof was shown — a receipt screenshot, a signed form">
          <Textarea id="fe-evidence" value={evidenceNotes} onChange={(e) => setEvidenceNotes(e.target.value)} />
        </FieldWrapper>
      </div>
    </Sheet>
  );
}

function FinancialEventDetailSheet({
  event,
  isStaff,
  currentUserId,
  residentNames,
  onClose,
  onChanged,
}: {
  event: FinancialEvent;
  isStaff: boolean;
  currentUserId: string | undefined;
  residentNames: Record<string, string>;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState(event);
  const [disputeReason, setDisputeReason] = useState('');
  const [reverseReason, setReverseReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<string | null>(null);

  async function refresh() {
    setDetail(await financeApi.getFinancialEvent(event.id));
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

  const isOwner = detail.studentId === currentUserId;

  return (
    <Sheet open onClose={onClose} title={EVENT_TYPE_LABELS[detail.eventType]}>
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <p className="text-sm text-slate-600">
          {residentNames[detail.studentId] ?? detail.studentId.slice(0, 8)} — <StatusPill status={detail.status} />
        </p>
        <p className="text-sm text-slate-700">
          ₹{detail.amount} — {detail.description}
        </p>
        <p className="text-xs text-slate-500">
          Raised {new Date(detail.raisedAt).toLocaleString()} — source: {detail.source === 'finance_authoritative' ? 'Finance-confirmed' : 'Hostel manual evidence'}
        </p>
        {detail.evidenceNotes && <p className="text-xs text-slate-500">Evidence: {detail.evidenceNotes}</p>}
        {detail.linkedReferenceType && (
          <p className="text-xs text-slate-500">
            Linked to: {detail.linkedReferenceType} {detail.linkedReferenceId?.slice(0, 8)}
          </p>
        )}
        {detail.disputed && detail.disputeReason && <Alert tone="warning">Disputed: {detail.disputeReason}</Alert>}
        {detail.confirmedAt && <p className="text-xs text-emerald-600">Confirmed {new Date(detail.confirmedAt).toLocaleString()}</p>}
        {detail.reversedAt && <p className="text-xs text-rose-600">Reversed {new Date(detail.reversedAt).toLocaleString()}: {detail.reversalReason}</p>}

        {isOwner && detail.status === 'proposed' && !detail.disputed && (
          <div className="space-y-2 border-t border-slate-200 pt-4">
            <p className="text-sm font-medium text-slate-800">Dispute this event</p>
            <Textarea placeholder="Reason" value={disputeReason} onChange={(e) => setDisputeReason(e.target.value)} />
            <Button
              size="sm"
              variant="secondary"
              disabled={!disputeReason.trim() || Boolean(submitting)}
              onClick={() => void run('dispute', () => financeApi.disputeFinancialEvent(detail.id, disputeReason))}
            >
              Submit dispute
            </Button>
          </div>
        )}

        {isStaff && ['proposed', 'disputed'].includes(detail.status) && (
          <div className="space-y-2 border-t border-slate-200 pt-4">
            <p className="text-sm font-medium text-slate-800">Finance confirmation</p>
            <p className="text-xs text-slate-500">Only a Head Warden or a standing Finance Officer can confirm.</p>
            <div className="flex gap-2">
              <Button size="sm" disabled={Boolean(submitting)} onClick={() => void run('confirm', () => financeApi.confirmFinancialEvent(detail.id))}>
                Confirm
              </Button>
            </div>
          </div>
        )}

        {isStaff && detail.status !== 'reversed' && (
          <div className="space-y-2 border-t border-slate-200 pt-4">
            <p className="text-sm font-medium text-slate-800">Reverse (void) this event</p>
            <Textarea placeholder="Reason" value={reverseReason} onChange={(e) => setReverseReason(e.target.value)} />
            <Button
              size="sm"
              variant="danger"
              disabled={!reverseReason.trim() || Boolean(submitting)}
              onClick={() => void run('reverse', () => financeApi.reverseFinancialEvent(detail.id, reverseReason))}
            >
              Reverse
            </Button>
          </div>
        )}
      </div>
    </Sheet>
  );
}
