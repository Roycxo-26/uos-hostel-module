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
import { hasHostelRole, isPlatformAdmin, type Checkout, type CheckoutType } from '../types';

// D17.12 depth (TODO.md Batch 26).
const CHECKOUT_TYPE_LABELS: Record<CheckoutType, string> = {
  end_of_term: 'End of term',
  early_voluntary: 'Early voluntary',
  disciplinary_removal: 'Disciplinary removal',
  death_incapacity: 'Death / incapacity',
  abandonment: 'Abandonment (no-contact)',
};

const PREREQUISITE_CHECKLIST_LABELS: Record<string, string> = {
  academic_clearance: 'Academic clearance',
  library_clearance: 'Library clearance',
  hostel_dues_cleared: 'Hostel dues cleared',
  written_request_on_file: 'Written request on file',
  notice_period_served: 'Notice period served',
  case_reference_linked: 'Case reference linked',
  security_notified: 'Security notified',
  next_of_kin_contacted: 'Next of kin contacted',
  institutional_authority_notified: 'Institutional authority notified',
  contact_attempts_logged: 'Contact attempts logged',
  waiting_period_elapsed: 'Waiting period elapsed',
};

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
  const [checkoutType, setCheckoutType] = useState<CheckoutType>('end_of_term');
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
      await checkoutApi.requestCheckout({ reason, checkoutType, ...(isStaff && studentId ? { studentId } : {}) });
      onRequested();
      onClose();
      setStudentId('');
      setReason('');
      setCheckoutType('end_of_term');
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
        {isStaff && (
          <FieldWrapper label="Type" htmlFor="co-type" hint={checkoutType === 'abandonment' ? 'Starts the legal waiting period immediately — see the checkout detail once created' : undefined}>
            <Select id="co-type" value={checkoutType} onChange={(e) => setCheckoutType(e.target.value as CheckoutType)}>
              {Object.entries(CHECKOUT_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </FieldWrapper>
        )}
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
  const [submitting, setSubmitting] = useState<string | null>(null);

  // D17.12 depth (TODO.md Batch 26) — the row passed in from the list is
  // the pre-detail shape; the checklist/inventory/contact-attempt data only
  // comes back from the single-GET endpoint, so this always re-fetches on
  // open, same pattern Movement.tsx/Cases.tsx already use for their own
  // detail sheets.
  const [detail, setDetail] = useState<Checkout>(checkout);

  async function refresh() {
    setDetail(await checkoutApi.getCheckout(checkout.id));
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkout.id]);

  const [inspectionNotes, setInspectionNotes] = useState('');
  const [damageFound, setDamageFound] = useState(false);
  const [damageChargeAmount, setDamageChargeAmount] = useState('');
  const [damageDescription, setDamageDescription] = useState('');
  const [disputeReason, setDisputeReason] = useState('');
  const [overrideReason, setOverrideReason] = useState('');
  const [bedOutcome, setBedOutcome] = useState<'available' | 'blocked'>('available');
  const [cancelReason, setCancelReason] = useState('');
  const [reopenReason, setReopenReason] = useState('');

  // D17.12 item 106 — contact attempt form
  const [contactMethod, setContactMethod] = useState<'call' | 'email' | 'sms' | 'in_person'>('call');
  const [contactOutcome, setContactOutcome] = useState<'no_response' | 'invalid_contact' | 'reached'>('no_response');
  const [contactNotes, setContactNotes] = useState('');

  // D17.12 item 107 — inventory item form
  const [itemCheckinItemId, setItemCheckinItemId] = useState('');
  const [itemName, setItemName] = useState('');
  const [itemCondition, setItemCondition] = useState<'good' | 'fair' | 'damaged' | 'missing'>('good');
  const [itemClassification, setItemClassification] = useState<'normal_wear' | 'damage' | 'not_applicable' | ''>('');
  const [itemNotes, setItemNotes] = useState('');
  const [itemCharge, setItemCharge] = useState('');

  const isResident = detail.studentId === currentUserId;
  const checklistKeys = Object.keys(detail.prerequisiteChecklist ?? {});
  const fiveMilestonesClear = Boolean(
    detail.deskCleared && detail.financeCleared && detail.itemReturnVerifiedAt && detail.damageAssessmentFinalizedAt && detail.roomReadyForReuseAt
  );
  const editableNow = ['inspected', 'reopened'].includes(detail.status);

  async function run(action: string, fn: () => Promise<unknown>, closeAfter = false) {
    setSubmitting(action);
    setError(null);
    try {
      await fn();
      await refresh();
      onChanged();
      if (closeAfter) onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <Sheet open onClose={onClose} title="Checkout detail">
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}

        <div className="space-y-1 text-sm">
          <p className="flex items-center gap-2">
            <StatusPill status={detail.status} />
            <span className="text-slate-500">{CHECKOUT_TYPE_LABELS[detail.checkoutType]}</span>
          </p>
          <p className="text-slate-700">{detail.reason}</p>
          {detail.status !== 'requested' && (
            <>
              {/* Real gap, found live via SELF-TEST-GUIDE.md C10's own
                  "confirm the full history is still visible" check — the
                  general inspection notes (separate from the damage
                  description) were captured on submit and never displayed
                  anywhere, on a clean checkout as much as a damaged one. */}
              {detail.inspectionNotes && <p className="text-slate-500">Inspection notes: {detail.inspectionNotes}</p>}
              <p className="text-slate-500">
                Desk: {detail.deskCleared ? 'Cleared' : 'Pending'} · Finance: {detail.financeCleared ? 'Cleared' : 'Pending'} · Items:{' '}
                {detail.itemReturnVerifiedAt ? 'Verified' : 'Pending'} · Damage assessment: {detail.damageAssessmentFinalizedAt ? 'Finalized' : 'Pending'} · Room:{' '}
                {detail.roomReadyForReuseAt ? 'Ready' : 'Pending'}
              </p>
              {detail.damageFound && (
                <p className="text-slate-500">
                  Damage: {detail.damageDescription ?? '—'}
                  {detail.damageChargeAmount ? ` (₹${detail.damageChargeAmount})` : ''}
                  {detail.damageDisputed && ' — disputed'}
                </p>
              )}
              {/* Real gap, found live via SELF-TEST-GUIDE.md C10 — the
                  resident's actual dispute reason came back from the API
                  (Checkout.disputeReason) and was never shown anywhere,
                  only the bare word "disputed" above. Whoever decides the
                  override (Warden attempt, then Head Warden) had no way to
                  see what the resident actually said before deciding. */}
              {detail.damageDisputed && detail.disputeReason && (
                <p className="text-slate-500">Dispute reason: {detail.disputeReason}</p>
              )}
              {detail.reopenReason && <p className="text-slate-500">Reopen reason: {detail.reopenReason}</p>}
            </>
          )}
          {detail.checkoutType === 'abandonment' && detail.legalWaitingPeriodEndsAt && (
            <p className="text-slate-500">Legal waiting period ends {new Date(detail.legalWaitingPeriodEndsAt).toLocaleString()}</p>
          )}
        </div>

        {isStaff && checklistKeys.length > 0 && editableNow && (
          <div className="space-y-2 rounded-lg border border-slate-200 p-3">
            <p className="text-xs font-medium text-slate-700">Prerequisite checklist ({CHECKOUT_TYPE_LABELS[detail.checkoutType]})</p>
            {checklistKeys.map((key) => (
              <label key={key} className="flex min-h-touch cursor-pointer items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={Boolean(detail.prerequisiteChecklist?.[key]?.completed)}
                  disabled={Boolean(submitting)}
                  onChange={(e) => void run(`chk-${key}`, () => checkoutApi.updatePrerequisiteChecklist(detail.id, key, e.target.checked))}
                  className="h-4 w-4 rounded border-slate-300 text-accent"
                />
                {PREREQUISITE_CHECKLIST_LABELS[key] ?? key}
              </label>
            ))}
          </div>
        )}

        {isStaff && detail.checkoutType === 'abandonment' && (
          <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="text-xs font-medium text-amber-800">Contact attempts ({(detail.contactAttempts ?? []).length})</p>
            <ul className="space-y-1 text-xs text-amber-700">
              {(detail.contactAttempts ?? []).map((a) => (
                <li key={a.id}>
                  {new Date(a.attemptedAt).toLocaleString()} — {a.method} — {a.outcome}
                  {a.notes && `: ${a.notes}`}
                </li>
              ))}
            </ul>
            {editableNow && (
              <div className="space-y-1.5">
                <div className="grid grid-cols-2 gap-1.5">
                  <Select value={contactMethod} onChange={(e) => setContactMethod(e.target.value as typeof contactMethod)}>
                    <option value="call">Call</option>
                    <option value="email">Email</option>
                    <option value="sms">SMS</option>
                    <option value="in_person">In person</option>
                  </Select>
                  <Select value={contactOutcome} onChange={(e) => setContactOutcome(e.target.value as typeof contactOutcome)}>
                    <option value="no_response">No response</option>
                    <option value="invalid_contact">Invalid contact</option>
                    <option value="reached">Reached</option>
                  </Select>
                </div>
                <Input placeholder="Notes (optional)" value={contactNotes} onChange={(e) => setContactNotes(e.target.value)} />
                <Button
                  size="sm"
                  fullWidth
                  disabled={Boolean(submitting)}
                  onClick={() =>
                    void run('contact', () => checkoutApi.recordContactAttempt(detail.id, { method: contactMethod, outcome: contactOutcome, notes: contactNotes || undefined }))
                  }
                >
                  Log attempt
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Staff: room inspection */}
        {isStaff && ['requested', 'reopened'].includes(detail.status) && (
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
              disabled={Boolean(submitting)}
              onClick={() =>
                void run('inspect', () =>
                  checkoutApi.inspectCheckout(detail.id, {
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
        {isResident && detail.status === 'inspected' && detail.damageFound && !detail.damageDisputed && (
          <div className="space-y-3 border-t border-slate-200 pt-4">
            <p className="text-sm font-medium text-slate-800">Dispute this charge</p>
            <FieldWrapper label="Reason" htmlFor="cd-dispute" required>
              <Textarea id="cd-dispute" value={disputeReason} onChange={(e) => setDisputeReason(e.target.value)} />
            </FieldWrapper>
            <Button variant="secondary" fullWidth disabled={submitting !== null || !disputeReason.trim()} onClick={() => void run('dispute', () => checkoutApi.disputeDamage(detail.id, disputeReason))}>
              Submit dispute
            </Button>
          </div>
        )}

        {/* Staff: itemized inventory (D17.12 item 107) */}
        {isStaff && (editableNow || (detail.inventoryItems ?? []).length > 0) && (
          <div className="space-y-2 border-t border-slate-200 pt-4">
            <p className="text-sm font-medium text-slate-800">Itemized inventory</p>
            {(detail.inventoryItems ?? []).length > 0 && (
              <ul className="space-y-1 text-xs text-slate-600">
                {(detail.inventoryItems ?? []).map((it) => (
                  <li key={it.id}>
                    {it.itemName} — {it.conditionAtCheckout}
                    {it.classification && it.classification !== 'not_applicable' && ` (${it.classification.replace('_', ' ')})`}
                    {it.chargeAmount ? ` — ₹${it.chargeAmount}` : ''}
                    {it.officerNotes && `: ${it.officerNotes}`}
                  </li>
                ))}
              </ul>
            )}
            {editableNow && (
              <div className="space-y-1.5 rounded-lg border border-slate-200 p-3">
                {(detail.checkinItems ?? []).length > 0 && (
                  <Select
                    value={itemCheckinItemId}
                    onChange={(e) => {
                      setItemCheckinItemId(e.target.value);
                      const matched = (detail.checkinItems ?? []).find((c) => c.id === e.target.value);
                      if (matched) setItemName(matched.itemName);
                    }}
                  >
                    <option value="">Link to a check-in item (optional)</option>
                    {(detail.checkinItems ?? []).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.itemName}
                      </option>
                    ))}
                  </Select>
                )}
                <Input placeholder="Item name" value={itemName} onChange={(e) => setItemName(e.target.value)} />
                <div className="grid grid-cols-2 gap-1.5">
                  <Select value={itemCondition} onChange={(e) => setItemCondition(e.target.value as typeof itemCondition)}>
                    <option value="good">Good</option>
                    <option value="fair">Fair</option>
                    <option value="damaged">Damaged</option>
                    <option value="missing">Missing</option>
                  </Select>
                  <Select value={itemClassification} onChange={(e) => setItemClassification(e.target.value as typeof itemClassification)}>
                    <option value="">Classification (optional)</option>
                    <option value="normal_wear">Normal wear</option>
                    <option value="damage">Damage</option>
                    <option value="not_applicable">Not applicable</option>
                  </Select>
                </div>
                {/* Manual-entry-only charge — no rate-card computation yet.
                    Blocked on a policy decision + Batch 27 (Finance); see
                    TODO.md Batch 26 write-up. */}
                <Input placeholder="Charge amount ₹ (optional, manual only)" type="number" min={0} value={itemCharge} onChange={(e) => setItemCharge(e.target.value)} />
                <Input placeholder="Officer notes (optional)" value={itemNotes} onChange={(e) => setItemNotes(e.target.value)} />
                <Button
                  size="sm"
                  fullWidth
                  disabled={Boolean(submitting) || !itemName.trim()}
                  onClick={() =>
                    void run('add-item', async () => {
                      await checkoutApi.addCheckoutInventoryItem(detail.id, {
                        checkinItemId: itemCheckinItemId || undefined,
                        itemName,
                        conditionAtCheckout: itemCondition,
                        classification: itemClassification || undefined,
                        chargeAmount: itemCharge ? Number(itemCharge) : undefined,
                        officerNotes: itemNotes || undefined,
                      });
                      setItemCheckinItemId('');
                      setItemName('');
                      setItemCondition('good');
                      setItemClassification('');
                      setItemCharge('');
                      setItemNotes('');
                    })
                  }
                >
                  Add item
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Staff: three new milestones (D17.12 item 104), alongside clearances */}
        {isStaff && ['inspected', 'reopened'].includes(detail.status) && (
          <div className="space-y-3 border-t border-slate-200 pt-4">
            <p className="text-sm font-medium text-slate-800">Clearances &amp; milestones</p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant={detail.deskCleared ? 'secondary' : 'primary'}
                size="sm"
                disabled={Boolean(submitting)}
                onClick={() => void run('desk', () => checkoutApi.recordClearance(detail.id, { deskCleared: !detail.deskCleared }))}
              >
                Desk: {detail.deskCleared ? 'Cleared ✓' : 'Mark cleared'}
              </Button>
              <Button
                variant={detail.financeCleared ? 'secondary' : 'primary'}
                size="sm"
                disabled={Boolean(submitting)}
                onClick={() => void run('finance', () => checkoutApi.recordClearance(detail.id, { financeCleared: !detail.financeCleared }))}
              >
                Finance: {detail.financeCleared ? 'Cleared ✓' : 'Mark cleared'}
              </Button>
              <Button
                variant={detail.itemReturnVerifiedAt ? 'secondary' : 'primary'}
                size="sm"
                disabled={Boolean(submitting) || Boolean(detail.itemReturnVerifiedAt)}
                onClick={() => void run('item-return', () => checkoutApi.recordItemReturn(detail.id))}
              >
                Items: {detail.itemReturnVerifiedAt ? 'Verified ✓' : 'Verify return'}
              </Button>
              <Button
                variant={detail.damageAssessmentFinalizedAt ? 'secondary' : 'primary'}
                size="sm"
                disabled={Boolean(submitting) || Boolean(detail.damageAssessmentFinalizedAt)}
                onClick={() => void run('damage-final', () => checkoutApi.finalizeDamageAssessment(detail.id))}
              >
                Damage assessment: {detail.damageAssessmentFinalizedAt ? 'Finalized ✓' : 'Finalize'}
              </Button>
              <Button
                variant={detail.roomReadyForReuseAt ? 'secondary' : 'primary'}
                size="sm"
                disabled={Boolean(submitting) || Boolean(detail.roomReadyForReuseAt)}
                onClick={() => void run('room-ready', () => checkoutApi.markRoomReadyForReuse(detail.id))}
              >
                Room: {detail.roomReadyForReuseAt ? 'Ready ✓' : 'Mark ready'}
              </Button>
            </div>

            <p className="text-sm font-medium text-slate-800">Approve</p>
            {!fiveMilestonesClear && (
              <Alert tone="warning">
                Milestones incomplete — approving now requires an override reason and {headWardenLabel} authority (or an active delegation).
                {detail.checkoutType === 'abandonment' &&
                  ' Abandonment also requires at least one logged contact attempt and the legal waiting period to have passed — this cannot be overridden.'}
              </Alert>
            )}
            {!fiveMilestonesClear && (
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
              disabled={Boolean(submitting) || (!fiveMilestonesClear && !overrideReason.trim())}
              onClick={() =>
                void run(
                  'approve',
                  () =>
                    checkoutApi.approveCheckout(detail.id, {
                      bedOutcome,
                      ...(overrideReason ? { overrideReason } : {}),
                    }),
                  true
                )
              }
            >
              Approve checkout
            </Button>
          </div>
        )}

        {/* Resident or staff: cancel */}
        {(isResident || isStaff) && ['requested', 'inspected'].includes(detail.status) && (
          <div className="space-y-3 border-t border-slate-200 pt-4">
            <p className="text-sm font-medium text-slate-800">Cancel checkout</p>
            <FieldWrapper label="Reason" htmlFor="cd-cancel" required>
              <Textarea id="cd-cancel" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} />
            </FieldWrapper>
            <Button
              variant="danger"
              fullWidth
              disabled={submitting !== null || !cancelReason.trim()}
              onClick={() => void run('cancel', () => checkoutApi.cancelCheckout(detail.id, cancelReason), true)}
            >
              Cancel
            </Button>
          </div>
        )}

        {/* Staff: reopen (D17.12 item 105) */}
        {isStaff && detail.status === 'completed' && (
          <div className="space-y-3 border-t border-slate-200 pt-4">
            <p className="text-sm font-medium text-slate-800">Reopen checkout</p>
            <p className="text-xs text-slate-500">
              Only possible if the bed hasn't already changed state since this checkout completed (e.g. a new resident hasn't moved in).
            </p>
            <FieldWrapper label="Reason" htmlFor="cd-reopen" required>
              <Textarea id="cd-reopen" value={reopenReason} onChange={(e) => setReopenReason(e.target.value)} />
            </FieldWrapper>
            <Button
              variant="secondary"
              fullWidth
              disabled={submitting !== null || !reopenReason.trim()}
              onClick={() => void run('reopen', () => checkoutApi.reopenCheckout(detail.id, reopenReason))}
            >
              Reopen
            </Button>
          </div>
        )}

        {detail.status === 'completed' && (
          <div className="border-t border-slate-200 pt-4">
            <Alert tone="warning">
              Checkout complete — bed marked {detail.bedOutcome}. {detail.overrideReason && `Approved via override: ${detail.overrideReason}`}
            </Alert>
          </div>
        )}
      </div>
    </Sheet>
  );
}
