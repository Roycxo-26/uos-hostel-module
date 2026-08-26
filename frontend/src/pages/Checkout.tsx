import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import * as casesApi from '../api/cases';
import * as checkoutApi from '../api/checkouts';
import * as responsibilityApi from '../api/responsibilities';
import type { ResidentCandidate } from '../api/responsibilities';
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
import { BedIcon } from '../design-system/icons';
import type { Column } from '../design-system';
import { errorMessage } from '../lib/errorMessage';
import { hasHostelRole, isPlatformAdmin, type Checkout } from '../types';

/** Real gap, found live — same raw-ID display already fixed on
 * Allocations.tsx/Cases.tsx, just hadn't reached this page yet. Same
 * per-file hook duplication pattern this codebase already uses for
 * fetchAvailableBeds/fetchScopeOptions/fetchRoomOptions — not shared, but
 * consistent. */
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
 * ux-flow.md §3.3 "Checkout" / §9.4 "Checkout to bed release" — this page
 * follows that exact flow: initiate -> inspection (staff) -> clearances
 * (staff, stopgap manual confirmation) -> approve (Warden if clear, Head
 * Warden if overriding incomplete clearances) -> bed released.
 */
export function Checkout() {
  const { me } = useAuth();
  const isStaff = isPlatformAdmin(me) || hasHostelRole(me, 'warden');
  const residentNames = useResidentNames();
  // ux-flow.md §3.2: arriving via the Dashboard's "Initiate checkout" hub
  // action opens the request form immediately, same one-click pattern as
  // Cases.tsx.
  const location = useLocation();
  const openRequestOnArrival = Boolean((location.state as { openRequest?: boolean } | null)?.openRequest);

  const [checkouts, setCheckouts] = useState<Checkout[]>([]);
  const [loading, setLoading] = useState(true);
  const [requestOpen, setRequestOpen] = useState(openRequestOnArrival);
  const [detailTarget, setDetailTarget] = useState<Checkout | null>(null);

  async function load() {
    setLoading(true);
    setCheckouts(await checkoutApi.listCheckouts());
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  const columns: Column<Checkout>[] = [
    { key: 'student', header: 'Student', primary: true, render: (c) => <span className="text-xs">{studentLabel(residentNames, c.studentId)}</span> },
    { key: 'reason', header: 'Reason', render: (c) => c.reason },
    { key: 'status', header: 'Status', render: (c) => <StatusPill status={c.status} /> },
    { key: 'created', header: 'Initiated', render: (c) => new Date(c.createdAt).toLocaleDateString() },
  ];

  return (
    <div>
      <PageHeader
        title="Checkout"
        description="Room inspection, dues clearance, and bed release."
        action={<Button onClick={() => setRequestOpen(true)}>Initiate checkout</Button>}
      />

      {loading ? (
        <PageSpinner />
      ) : checkouts.length === 0 ? (
        <EmptyState icon={<BedIcon className="h-8 w-8" />} title="No checkouts" description="Nothing in progress right now." />
      ) : (
        <Card>
          <DataList columns={columns} rows={checkouts} onRowClick={(row) => setDetailTarget(row)} />
        </Card>
      )}

      <RequestCheckoutSheet open={requestOpen} onClose={() => setRequestOpen(false)} onRequested={load} isStaff={isStaff} />
      {detailTarget && (
        <CheckoutDetailSheet checkout={detailTarget} isStaff={isStaff} currentUserId={me?.sub} onClose={() => setDetailTarget(null)} onChanged={load} />
      )}
    </div>
  );
}

function RequestCheckoutSheet({
  open,
  onClose,
  onRequested,
  isStaff,
}: {
  open: boolean;
  onClose: () => void;
  onRequested: () => void;
  isStaff: boolean;
}) {
  const [studentId, setStudentId] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [residentOptions, setResidentOptions] = useState<ResidentCandidate[]>([]);
  const [loadingResidents, setLoadingResidents] = useState(false);

  // Real gap, found live — this asked staff to paste a raw resident user
  // ID, same pattern already fixed for Room/Concerns/Assign-to elsewhere.
  // Uses the student-role-filtered candidate list (same one Room Head
  // assignment and DecideTransferSheet already use) rather than the
  // general resident directory, since only an actual resident can have a
  // checkout initiated on their behalf — and this field is staff-only
  // already, so the extra permission gate on that endpoint costs nothing.
  useEffect(() => {
    if (!open || !isStaff) return;
    setLoadingResidents(true);
    void responsibilityApi.listCandidates().then((candidates) => {
      setResidentOptions(candidates);
      setLoadingResidents(false);
    });
  }, [open, isStaff]);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      await checkoutApi.requestCheckout({ reason, ...(isStaff && studentId ? { studentId } : {}) });
      onRequested();
      onClose();
      setStudentId('');
      setReason('');
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
      title="Initiate checkout"
      footer={
        <Button fullWidth onClick={() => void handleSubmit()} disabled={submitting || !reason.trim()}>
          {submitting ? 'Submitting…' : 'Initiate'}
        </Button>
      }
    >
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        {isStaff && (
          <FieldWrapper label="Resident (staff only — leave blank for your own)" htmlFor="co-student">
            <Select id="co-student" value={studentId} onChange={(e) => setStudentId(e.target.value)} disabled={loadingResidents}>
              <option value="">{loadingResidents ? 'Loading…' : 'Myself (staff-as-resident, if applicable)'}</option>
              {residentOptions.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} ({r.email})
                </option>
              ))}
            </Select>
          </FieldWrapper>
        )}
        <FieldWrapper label="Reason" htmlFor="co-reason" required hint="e.g. term ending, transfer out, withdrawal">
          <Textarea id="co-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
        </FieldWrapper>
      </div>
    </Sheet>
  );
}

function CheckoutDetailSheet({
  checkout,
  isStaff,
  currentUserId,
  onClose,
  onChanged,
}: {
  checkout: Checkout;
  isStaff: boolean;
  currentUserId: string | undefined;
  onClose: () => void;
  onChanged: () => void;
}) {
  // Real gap, found live via SELF-TEST-GUIDE.md C13 — "Head Warden" was
  // hardcoded here, same pattern as the Room Head bugs (#29-31) just found
  // for the other two terminology fields.
  const headWardenLabel = useLabel('headWardenLabel', 'Head Warden');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [inspectionNotes, setInspectionNotes] = useState('');
  const [damageFound, setDamageFound] = useState(false);
  const [damageChargeAmount, setDamageChargeAmount] = useState('');
  const [damageDescription, setDamageDescription] = useState('');
  const [disputeReason, setDisputeReason] = useState('');
  const [overrideReason, setOverrideReason] = useState('');
  const [bedOutcome, setBedOutcome] = useState<'available' | 'blocked'>('available');
  const [cancelReason, setCancelReason] = useState('');

  const isResident = checkout.studentId === currentUserId;
  const allClear = checkout.deskCleared && checkout.financeCleared;

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
    <Sheet open onClose={onClose} title="Checkout detail">
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}

        <div className="space-y-1 text-sm">
          <StatusPill status={checkout.status} />
          <p className="text-slate-700">{checkout.reason}</p>
          {checkout.status !== 'requested' && (
            <>
              {/* Real gap, found live via SELF-TEST-GUIDE.md C10's own
                  "confirm the full history is still visible" check — the
                  general inspection notes (separate from the damage
                  description) were captured on submit and never displayed
                  anywhere, on a clean checkout as much as a damaged one. */}
              {checkout.inspectionNotes && <p className="text-slate-500">Inspection notes: {checkout.inspectionNotes}</p>}
              <p className="text-slate-500">
                Desk: {checkout.deskCleared ? 'Cleared' : 'Pending'} · Finance: {checkout.financeCleared ? 'Cleared' : 'Pending'}
              </p>
              {checkout.damageFound && (
                <p className="text-slate-500">
                  Damage: {checkout.damageDescription ?? '—'}
                  {checkout.damageChargeAmount ? ` (₹${checkout.damageChargeAmount})` : ''}
                  {checkout.damageDisputed && ' — disputed'}
                </p>
              )}
              {/* Real gap, found live via SELF-TEST-GUIDE.md C10 — the
                  resident's actual dispute reason came back from the API
                  (Checkout.disputeReason) and was never shown anywhere,
                  only the bare word "disputed" above. Whoever decides the
                  override (Warden attempt, then Head Warden) had no way to
                  see what the resident actually said before deciding. */}
              {checkout.damageDisputed && checkout.disputeReason && (
                <p className="text-slate-500">Dispute reason: {checkout.disputeReason}</p>
              )}
            </>
          )}
        </div>

        {/* Staff: room inspection */}
        {isStaff && checkout.status === 'requested' && (
          <div className="space-y-3 border-t border-slate-200 pt-4">
            <p className="text-sm font-medium text-slate-800">Room inspection</p>
            <FieldWrapper label="Notes" htmlFor="cd-insp-notes">
              <Textarea id="cd-insp-notes" value={inspectionNotes} onChange={(e) => setInspectionNotes(e.target.value)} />
            </FieldWrapper>
            <label className="flex min-h-touch cursor-pointer items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={damageFound} onChange={(e) => setDamageFound(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-accent" />
              Damage or missing item found
            </label>
            {damageFound && (
              <>
                <FieldWrapper label="Damage description" htmlFor="cd-damage-desc">
                  <Input id="cd-damage-desc" value={damageDescription} onChange={(e) => setDamageDescription(e.target.value)} />
                </FieldWrapper>
                <FieldWrapper label="Proposed charge (₹)" htmlFor="cd-damage-amt">
                  <Input id="cd-damage-amt" type="number" min={0} value={damageChargeAmount} onChange={(e) => setDamageChargeAmount(e.target.value)} />
                </FieldWrapper>
              </>
            )}
            <Button
              fullWidth
              disabled={submitting}
              onClick={() =>
                void run(() =>
                  checkoutApi.inspectCheckout(checkout.id, {
                    inspectionNotes: inspectionNotes || undefined,
                    damageFound,
                    damageChargeAmount: damageChargeAmount ? Number(damageChargeAmount) : undefined,
                    damageDescription: damageDescription || undefined,
                  })
                )
              }
            >
              Complete inspection
            </Button>
          </div>
        )}

        {/* Resident: dispute a damage charge */}
        {isResident && checkout.status === 'inspected' && checkout.damageFound && !checkout.damageDisputed && (
          <div className="space-y-3 border-t border-slate-200 pt-4">
            <p className="text-sm font-medium text-slate-800">Dispute this charge</p>
            <FieldWrapper label="Reason" htmlFor="cd-dispute" required>
              <Textarea id="cd-dispute" value={disputeReason} onChange={(e) => setDisputeReason(e.target.value)} />
            </FieldWrapper>
            <Button variant="secondary" fullWidth disabled={submitting || !disputeReason.trim()} onClick={() => void run(() => checkoutApi.disputeDamage(checkout.id, disputeReason))}>
              Submit dispute
            </Button>
          </div>
        )}

        {/* Staff: record clearances + approve */}
        {isStaff && checkout.status === 'inspected' && (
          <div className="space-y-3 border-t border-slate-200 pt-4">
            <p className="text-sm font-medium text-slate-800">Clearances</p>
            <div className="flex gap-2">
              <Button
                variant={checkout.deskCleared ? 'secondary' : 'primary'}
                size="sm"
                disabled={submitting}
                onClick={() => void run(() => checkoutApi.recordClearance(checkout.id, { deskCleared: !checkout.deskCleared }))}
              >
                Desk: {checkout.deskCleared ? 'Cleared ✓' : 'Mark cleared'}
              </Button>
              <Button
                variant={checkout.financeCleared ? 'secondary' : 'primary'}
                size="sm"
                disabled={submitting}
                onClick={() => void run(() => checkoutApi.recordClearance(checkout.id, { financeCleared: !checkout.financeCleared }))}
              >
                Finance: {checkout.financeCleared ? 'Cleared ✓' : 'Mark cleared'}
              </Button>
            </div>

            <p className="text-sm font-medium text-slate-800">Approve</p>
            {!allClear && (
              <Alert tone="warning">
                Clearances incomplete — approving now requires an override reason and {headWardenLabel} authority (or an active delegation).
              </Alert>
            )}
            {!allClear && (
              <FieldWrapper label="Override reason" htmlFor="cd-override" required>
                <Textarea id="cd-override" value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} />
              </FieldWrapper>
            )}
            <FieldWrapper label="Bed outcome" htmlFor="cd-bed-outcome">
              <Select id="cd-bed-outcome" value={bedOutcome} onChange={(e) => setBedOutcome(e.target.value as 'available' | 'blocked')}>
                <option value="available">Available — no issues found</option>
                <option value="blocked">Blocked — needs maintenance before reuse</option>
              </Select>
            </FieldWrapper>
            <Button
              fullWidth
              disabled={submitting || (!allClear && !overrideReason.trim())}
              onClick={() =>
                void run(() =>
                  checkoutApi.approveCheckout(checkout.id, {
                    bedOutcome,
                    ...(overrideReason ? { overrideReason } : {}),
                  })
                )
              }
            >
              Approve checkout
            </Button>
          </div>
        )}

        {/* Resident or staff: cancel */}
        {(isResident || isStaff) && ['requested', 'inspected'].includes(checkout.status) && (
          <div className="space-y-3 border-t border-slate-200 pt-4">
            <p className="text-sm font-medium text-slate-800">Cancel checkout</p>
            <FieldWrapper label="Reason" htmlFor="cd-cancel" required>
              <Textarea id="cd-cancel" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} />
            </FieldWrapper>
            <Button variant="danger" fullWidth disabled={submitting || !cancelReason.trim()} onClick={() => void run(() => checkoutApi.cancelCheckout(checkout.id, cancelReason))}>
              Cancel
            </Button>
          </div>
        )}

        {checkout.status === 'completed' && (
          <div className="border-t border-slate-200 pt-4">
            <Alert tone="warning">
              Checkout complete — bed marked {checkout.bedOutcome}. {checkout.overrideReason && `Approved via override: ${checkout.overrideReason}`}
            </Alert>
          </div>
        )}
      </div>
    </Sheet>
  );
}
