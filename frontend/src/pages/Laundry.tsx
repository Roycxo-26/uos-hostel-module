import { useEffect, useState } from 'react';
import * as casesApi from '../api/cases';
import * as laundryApi from '../api/laundry';
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
import { hasHostelRole, isPlatformAdmin, type LaundryOrder, type LaundryServiceType } from '../types';

/** D17.23 (TODO.md Batch 30, item 124) — "HOSTEL V1.1.md" §24G /
 * D17-LAW-41. Hostel owns the service order and handoff only — never
 * stock, vendor contract or a wallet/ledger entry. Not staff-only — a
 * resident requests and tracks their own order. */

const SERVICE_TYPE_LABELS: Record<LaundryServiceType, string> = {
  linen_exchange: 'Linen Exchange',
  garment_laundry: 'Garment Laundry',
  scheduled_floor_pickup: 'Scheduled Floor Pickup',
  drop_counter: 'Drop Counter',
  token_bag: 'Token/QR Bag',
  self_service_washer: 'Self-Service Washer',
  outsourced_vendor: 'Outsourced Vendor',
  emergency_linen_replacement: 'Emergency Linen Replacement',
  paid_premium: 'Paid Premium Service',
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

export function Laundry() {
  const { me } = useAuth();
  const isStaff = isPlatformAdmin(me) || hasHostelRole(me, 'warden');
  const residentNames = useResidentNames();
  const [orders, setOrders] = useState<LaundryOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [requestOpen, setRequestOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setOrders(await laundryApi.listOrders());
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <div>
      <PageHeader title="Laundry &amp; Linen" description="Service orders and handoff only — vendor, stock and payment stay owned elsewhere (D17-LAW-41)." />

      <div className="mb-4 flex justify-end">
        <Button onClick={() => setRequestOpen(true)}>Request a service</Button>
      </div>

      {loading ? (
        <PageSpinner />
      ) : orders.length === 0 ? (
        <EmptyState icon={<AlertIcon className="h-8 w-8" />} title="No laundry orders" description="Request one above." />
      ) : (
        <Card>
          <ul className="divide-y divide-slate-100">
            {orders.map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setDetailId(o.id)}>
                  <p className="flex items-center gap-2 text-sm">
                    <span className="font-medium text-slate-800">{SERVICE_TYPE_LABELS[o.serviceType]}</span>
                    <StatusPill status={o.status} domain={['returned', 'reopened'].includes(o.status) ? 'laundry' : undefined} />
                    {o.slaBreachedAt && <span className="text-xs text-rose-600">SLA breached</span>}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {isStaff && `${residentNames[o.studentId] ?? o.studentId.slice(0, 8)} — `}
                    {new Date(o.createdAt).toLocaleDateString()}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <RequestOrderSheet open={requestOpen} onClose={() => setRequestOpen(false)} onRequested={load} isStaff={isStaff} />
      {detailId && <OrderDetailSheet id={detailId} isStaff={isStaff} currentUserId={me?.sub} residentNames={residentNames} onClose={() => setDetailId(null)} onChanged={load} />}
    </div>
  );
}

function RequestOrderSheet({ open, onClose, onRequested, isStaff }: { open: boolean; onClose: () => void; onRequested: () => void; isStaff: boolean }) {
  const [serviceType, setServiceType] = useState<LaundryServiceType>('garment_laundry');
  const [pickupDropLocation, setPickupDropLocation] = useState('');
  const [bagTokenId, setBagTokenId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      await laundryApi.requestOrder({ serviceType, pickupDropLocation: pickupDropLocation || undefined, bagTokenId: bagTokenId || undefined });
      onRequested();
      onClose();
      setPickupDropLocation('');
      setBagTokenId('');
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
      title="Request a laundry service"
      footer={
        <Button fullWidth onClick={() => void handleSubmit()} disabled={submitting}>
          {submitting ? 'Requesting…' : 'Request'}
        </Button>
      }
    >
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        {!isStaff && <Alert>Institution-owned linen stock, vendor arrangements and any charge stay outside this request — this only tracks your own order.</Alert>}
        <FieldWrapper label="Service type" htmlFor="lo-type">
          <Select id="lo-type" value={serviceType} onChange={(e) => setServiceType(e.target.value as LaundryServiceType)}>
            {Object.entries(SERVICE_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </FieldWrapper>
        <FieldWrapper label="Pickup/drop location" htmlFor="lo-location" hint="Optional">
          <Input id="lo-location" value={pickupDropLocation} onChange={(e) => setPickupDropLocation(e.target.value)} />
        </FieldWrapper>
        <FieldWrapper label="Bag/token/QR ID" htmlFor="lo-bag" hint="Optional — if your hostel uses tagged bags">
          <Input id="lo-bag" value={bagTokenId} onChange={(e) => setBagTokenId(e.target.value)} />
        </FieldWrapper>
      </div>
    </Sheet>
  );
}

function OrderDetailSheet({
  id,
  isStaff,
  currentUserId,
  residentNames,
  onClose,
  onChanged,
}: {
  id: string;
  isStaff: boolean;
  currentUserId: string | undefined;
  residentNames: Record<string, string>;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState<LaundryOrder | null>(null);
  const [pickupCount, setPickupCount] = useState('');
  const [returnedCount, setReturnedCount] = useState('');
  const [exceptionReason, setExceptionReason] = useState('');
  const [resolveNotes, setResolveNotes] = useState('');
  const [compensation, setCompensation] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [reopenReason, setReopenReason] = useState('');
  const [complaintRef, setComplaintRef] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<string | null>(null);

  async function refresh() {
    setDetail(await laundryApi.getOrder(id));
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
      <Sheet open onClose={onClose} title="Laundry order">
        <PageSpinner />
      </Sheet>
    );
  }

  const isOwner = detail.studentId === currentUserId;

  return (
    <Sheet open onClose={onClose} title={SERVICE_TYPE_LABELS[detail.serviceType]}>
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <p className="flex items-center gap-2 text-sm">
          <StatusPill status={detail.status} domain={['returned', 'reopened'].includes(detail.status) ? 'laundry' : undefined} />
          {detail.slaBreachedAt && <span className="text-xs text-rose-600">SLA breached {new Date(detail.slaBreachedAt).toLocaleString()}</span>}
        </p>
        <p className="text-xs text-slate-500">
          {isStaff && `${residentNames[detail.studentId] ?? detail.studentId.slice(0, 8)} — `}
          {detail.pickupDropLocation && `Location: ${detail.pickupDropLocation} — `}
          {detail.bagTokenId && `Bag: ${detail.bagTokenId}`}
        </p>
        {detail.pickupCount !== null && <p className="text-xs text-slate-500">Picked up: {detail.pickupCount} item(s){detail.conditionExceptionsAtHandoff && ` — ${detail.conditionExceptionsAtHandoff}`}</p>}
        {detail.returnedCount !== null && <p className="text-xs text-slate-500">Returned: {detail.returnedCount} item(s){detail.returnedConditionNotes && ` — ${detail.returnedConditionNotes}`}</p>}
        {detail.exceptionReason && <p className="text-xs text-amber-600">Exception: {detail.exceptionReason}</p>}
        {detail.resolutionNotes && <p className="text-xs text-slate-500">Resolution: {detail.resolutionNotes}</p>}
        {detail.complaintReference && <p className="text-xs text-slate-500">Complaint reference: {detail.complaintReference}</p>}

        {isStaff && detail.status === 'requested' && (
          <div className="border-t border-slate-200 pt-4">
            <Button size="sm" disabled={Boolean(submitting)} onClick={() => void run('accept', () => laundryApi.acceptOrder(detail.id))}>
              Accept
            </Button>
          </div>
        )}

        {isStaff && detail.status === 'accepted' && (
          <div className="space-y-2 border-t border-slate-200 pt-4">
            <p className="text-sm font-medium text-slate-800">Record pickup</p>
            <Input type="number" placeholder="Item count" value={pickupCount} onChange={(e) => setPickupCount(e.target.value)} />
            <Button size="sm" disabled={!pickupCount || Boolean(submitting)} onClick={() => void run('pickup', () => laundryApi.recordPickup(detail.id, { pickupCount: Number(pickupCount) }))}>
              Record pickup
            </Button>
          </div>
        )}

        {isStaff && detail.status === 'picked_up' && (
          <div className="border-t border-slate-200 pt-4">
            <Button size="sm" disabled={Boolean(submitting)} onClick={() => void run('process', () => laundryApi.startProcessing(detail.id))}>
              Start processing
            </Button>
          </div>
        )}

        {isStaff && detail.status === 'in_process' && (
          <div className="border-t border-slate-200 pt-4">
            <Button size="sm" disabled={Boolean(submitting)} onClick={() => void run('ready', () => laundryApi.markReadyForReturn(detail.id))}>
              Mark ready for return
            </Button>
          </div>
        )}

        {isStaff && detail.status === 'ready_for_return' && (
          <div className="space-y-2 border-t border-slate-200 pt-4">
            <p className="text-sm font-medium text-slate-800">Record return</p>
            <Input type="number" placeholder="Item count" value={returnedCount} onChange={(e) => setReturnedCount(e.target.value)} />
            <div className="flex flex-wrap gap-2">
              <Button size="sm" disabled={!returnedCount || Boolean(submitting)} onClick={() => void run('return', () => laundryApi.recordReturn(detail.id, Number(returnedCount)))}>
                Record return
              </Button>
              <Button size="sm" variant="secondary" disabled={Boolean(submitting)} onClick={() => void run('unclaimed', () => laundryApi.markUnclaimed(detail.id))}>
                Mark unclaimed
              </Button>
            </div>
          </div>
        )}

        {isOwner && detail.status === 'returned' && (
          <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-4">
            <Button size="sm" disabled={Boolean(submitting)} onClick={() => void run('ack', () => laundryApi.acknowledgeReturn(detail.id))}>
              Confirm count is correct
            </Button>
          </div>
        )}

        {isStaff && detail.status === 'resident_acknowledged' && (
          <div className="border-t border-slate-200 pt-4">
            <Button size="sm" disabled={Boolean(submitting)} onClick={() => void run('close', () => laundryApi.closeOrder(detail.id))}>
              Close
            </Button>
          </div>
        )}

        {(isOwner || isStaff) && ['returned', 'ready_for_return', 'in_process'].includes(detail.status) && (
          <div className="space-y-2 border-t border-slate-200 pt-4">
            <p className="text-sm font-medium text-slate-800">Report a problem</p>
            <Input placeholder="Reason" value={exceptionReason} onChange={(e) => setExceptionReason(e.target.value)} />
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" disabled={!exceptionReason.trim() || Boolean(submitting)} onClick={() => void run('dispute', () => laundryApi.disputeCount(detail.id, exceptionReason))}>
                Dispute count
              </Button>
              <Button size="sm" variant="danger" disabled={!exceptionReason.trim() || Boolean(submitting)} onClick={() => void run('lost', () => laundryApi.reportLostItem(detail.id, exceptionReason))}>
                Report lost
              </Button>
              <Button size="sm" variant="danger" disabled={!exceptionReason.trim() || Boolean(submitting)} onClick={() => void run('damaged', () => laundryApi.reportDamagedItem(detail.id, exceptionReason))}>
                Report damaged
              </Button>
            </div>
          </div>
        )}

        {isStaff && ['count_dispute', 'lost_item', 'damaged_item'].includes(detail.status) && (
          <div className="space-y-2 border-t border-slate-200 pt-4">
            <p className="text-sm font-medium text-slate-800">Resolve exception</p>
            <Textarea placeholder="Resolution notes" value={resolveNotes} onChange={(e) => setResolveNotes(e.target.value)} />
            <Input type="number" placeholder="Compensation amount ₹ (optional — raises a Finance refund)" value={compensation} onChange={(e) => setCompensation(e.target.value)} />
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                disabled={!resolveNotes.trim() || Boolean(submitting)}
                onClick={() => void run('resolve-fwd', () => laundryApi.resolveException(detail.id, 'resolved_forward', resolveNotes, compensation ? Number(compensation) : undefined))}
              >
                Resolve — continue order
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={!resolveNotes.trim() || Boolean(submitting)}
                onClick={() => void run('resolve-close', () => laundryApi.resolveException(detail.id, 'resolved_cancelled', resolveNotes, compensation ? Number(compensation) : undefined))}
              >
                Resolve — close order
              </Button>
            </div>
          </div>
        )}

        {(isOwner || isStaff) && ['requested', 'accepted'].includes(detail.status) && (
          <div className="space-y-2 border-t border-slate-200 pt-4">
            <p className="text-sm font-medium text-slate-800">Cancel</p>
            <div className="flex gap-2">
              <Input placeholder="Reason" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} className="flex-1" />
              <Button size="sm" variant="danger" disabled={!cancelReason.trim() || Boolean(submitting)} onClick={() => void run('cancel', () => laundryApi.cancelOrder(detail.id, cancelReason))}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {isStaff && detail.status === 'closed' && (
          <div className="space-y-2 border-t border-slate-200 pt-4">
            <p className="text-sm font-medium text-slate-800">Reopen</p>
            <div className="flex gap-2">
              <Input placeholder="Reason" value={reopenReason} onChange={(e) => setReopenReason(e.target.value)} className="flex-1" />
              <Button size="sm" variant="secondary" disabled={!reopenReason.trim() || Boolean(submitting)} onClick={() => void run('reopen', () => laundryApi.reopenOrder(detail.id, reopenReason))}>
                Reopen
              </Button>
            </div>
          </div>
        )}

        {isStaff && (
          <div className="space-y-2 border-t border-slate-200 pt-4">
            <p className="text-sm font-medium text-slate-800">Link a complaint/service-recovery reference</p>
            <div className="flex gap-2">
              <Input placeholder="e.g. Case #1234" value={complaintRef} onChange={(e) => setComplaintRef(e.target.value)} className="flex-1" />
              <Button size="sm" variant="secondary" disabled={!complaintRef.trim() || Boolean(submitting)} onClick={() => void run('link', () => laundryApi.linkComplaint(detail.id, complaintRef))}>
                Link
              </Button>
            </div>
          </div>
        )}
      </div>
    </Sheet>
  );
}
