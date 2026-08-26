import { useEffect, useState } from 'react';
import * as allocApi from '../api/allocations';
import * as appApi from '../api/applications';
import * as casesApi from '../api/cases';
import * as checkinApi from '../api/checkins';
import * as responsibilityApi from '../api/responsibilities';
import type { ResidentCandidate } from '../api/responsibilities';
import * as structureApi from '../api/structure';
import * as transferApi from '../api/transfers';
import { useAuth } from '../context/AuthContext';
import { useLabel } from '../context/TenantSettingsContext';
import {
  Alert,
  BedIcon,
  Button,
  Card,
  CardBody,
  CardHeader,
  CloseIcon,
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
import type { Column } from '../design-system';
import { errorMessage } from '../lib/errorMessage';
import {
  hasHostelRole,
  isPlatformAdmin,
  type AcknowledgementType,
  type Allocation,
  type AllocationOffer,
  type AllocationStatus,
  type CheckInInventoryItem,
  type ConditionPhoto,
  type HostelApplication,
  type TransferRequest,
  type WaitlistEntry,
} from '../types';

interface AvailableBed {
  id: string;
  label: string;
}

/** `filter` defaults to "available only" (the original, still-used-everywhere
 * behavior for picking a NEW bed); pass `() => true` to get every bed
 * regardless of status — needed to resolve a resident's CURRENT bed to a
 * readable label, since an occupied bed would never show up in the
 * available-only list. One tree-walk, two use cases, instead of two
 * near-duplicate functions drifting apart. */
async function fetchBeds(filter: (status: string) => boolean = (status) => status === 'available'): Promise<AvailableBed[]> {
  const hostels = await structureApi.listHostels();
  const trees = await Promise.all(hostels.map((h) => structureApi.getHostelTree(h.id)));
  const beds: AvailableBed[] = [];
  for (const tree of trees) {
    for (const block of tree.blocks) {
      for (const floor of block.floors) {
        for (const room of floor.rooms) {
          for (const bed of room.beds) {
            if (filter(bed.status)) {
              beds.push({ id: bed.id, label: `${tree.name} / ${block.code} / Fl.${floor.number} / ${room.code} / ${bed.code}` });
            }
          }
        }
      }
    }
  }
  return beds;
}

function fetchAvailableBeds(): Promise<AvailableBed[]> {
  return fetchBeds();
}

/** Real gap, found live — every raw studentId.slice(0,8) display on this
 * page (list, no-show queue, transfer list, check-in/no-show/cancel
 * sheets, allocation-application picker) meant nobody could tell which row
 * was which resident without cross-referencing another screen. Same fix
 * already applied to DecideTransferSheet/ExecuteTransferSheet earlier (via
 * responsibilityApi.listCandidates(), staff-only) and to Cases.tsx's
 * Concerns/Room pickers — this one reuses cases/resident-directory instead
 * since it isn't staff-gated, and callers on this page are a mix of staff
 * and students. */
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

export function Allocations() {
  const { me } = useAuth();
  const isStaff = isPlatformAdmin(me) || hasHostelRole(me, 'warden');
  const residentNames = useResidentNames();

  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [noShowQueue, setNoShowQueue] = useState<Allocation[]>([]);
  const [statusFilter, setStatusFilter] = useState<AllocationStatus | ''>('');
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [checkInTarget, setCheckInTarget] = useState<Allocation | null>(null);
  const [noShowTarget, setNoShowTarget] = useState<Allocation | null>(null);

  // D17.03 — Waitlist and offers.
  const [waitlist, setWaitlist] = useState<WaitlistEntry[]>([]);
  const [myWaitlistPosition, setMyWaitlistPosition] = useState<WaitlistEntry | null>(null);
  const [offers, setOffers] = useState<AllocationOffer[]>([]);
  const [offerActionTarget, setOfferActionTarget] = useState<AllocationOffer | null>(null);
  const [priorityTarget, setPriorityTarget] = useState<WaitlistEntry | null>(null);

  // UOS HOSTEL BR.md §7 — Transfer requests, folded into this page rather
  // than a new top-level nav item (see flow.md §10A: the full navbar
  // overhaul with dedicated `/hostel/...` routes is TODO.md Batch 8, not
  // done yet). Same placement precedent Check-In already set.
  const [transfers, setTransfers] = useState<TransferRequest[]>([]);
  const [requestTransferOpen, setRequestTransferOpen] = useState(false);
  const [decideTransferTarget, setDecideTransferTarget] = useState<TransferRequest | null>(null);
  const [executeTransferTarget, setExecuteTransferTarget] = useState<TransferRequest | null>(null);
  const [cancelTransferTarget, setCancelTransferTarget] = useState<TransferRequest | null>(null);

  async function load() {
    setLoading(true);
    const [list, queue, transferList, waitlistList, myPosition, offerList] = await Promise.all([
      allocApi.listAllocations(statusFilter || undefined),
      isStaff ? allocApi.listNoShowQueue() : Promise.resolve([]),
      transferApi.listTransfers(),
      isStaff ? allocApi.listWaitlist({ status: 'active' }) : Promise.resolve([]),
      isStaff ? Promise.resolve(null) : allocApi.getMyWaitlistPosition(),
      allocApi.listOffers('pending'),
    ]);
    setAllocations(list);
    setNoShowQueue(queue);
    setTransfers(transferList);
    setWaitlist(waitlistList);
    setMyWaitlistPosition(myPosition);
    setOffers(offerList);
    setLoading(false);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const columns: Column<Allocation>[] = [
    { key: 'student', header: 'Student', primary: true, render: (a) => <span className="text-xs">{studentLabel(residentNames, a.studentId)}</span> },
    { key: 'status', header: 'Status', render: (a) => <StatusPill status={a.status} /> },
    {
      key: 'deadline',
      header: 'Check-in deadline',
      render: (a) => (a.checkInDeadline ? new Date(a.checkInDeadline).toLocaleString() : '—'),
    },
    { key: 'created', header: 'Created', render: (a) => new Date(a.createdAt).toLocaleDateString() },
  ];

  return (
    <div>
      <PageHeader
        title="Allocations"
        description="Bed assignment, check-in, transfers and no-show handling."
        action={
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button variant="secondary" onClick={() => setRequestTransferOpen(true)}>
              Request transfer
            </Button>
            {isStaff && <Button onClick={() => setCreateOpen(true)}>Allocate a bed</Button>}
          </div>
        }
      />

      {/* D17.03 item 55 — the resident's own pending offer(s), shown first
          since it's the most time-sensitive thing on this page: a real
          deadline is ticking. Staff see every pending offer instead,
          further down, with a Withdraw option. */}
      {!isStaff &&
        offers
          .filter((o) => o.studentId === me?.sub)
          .map((o) => (
            <Card key={o.id} tone="info" className="mb-5">
              <CardBody className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm">
                  <p className="font-medium text-sky-900">You've been offered a bed</p>
                  <p className="text-sky-700">Respond before {new Date(o.acceptDeadline).toLocaleString()}</p>
                </div>
                <Button size="sm" onClick={() => setOfferActionTarget(o)}>
                  Respond
                </Button>
              </CardBody>
            </Card>
          ))}

      {/* D17.03 item 57 — resident-facing waitlist transparency. */}
      {!isStaff && myWaitlistPosition && (
        <Card className="mb-5">
          <CardBody className="text-sm">
            <p className="font-medium text-slate-900">
              You're #{myWaitlistPosition.rank} on the waitlist ({myWaitlistPosition.totalActive} waiting)
            </p>
            <div className="mt-2">
              <Button size="sm" variant="danger" onClick={() => void allocApi.withdrawFromWaitlist(myWaitlistPosition.id).then(load)}>
                Withdraw from waitlist
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      {isStaff && offers.length > 0 && (
        <Card tone="info" className="mb-5">
          <CardHeader>
            <p className="text-sm font-medium text-sky-800">Pending offers ({offers.length})</p>
          </CardHeader>
          <CardBody>
            <ul className="divide-y divide-slate-100">
              {offers.map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <div>
                    <p className="text-xs text-slate-500">{studentLabel(residentNames, o.studentId)}</p>
                    <p className="text-slate-600">Expires {new Date(o.acceptDeadline).toLocaleString()}</p>
                  </div>
                  <Button size="sm" variant="danger" onClick={() => setOfferActionTarget(o)}>
                    Withdraw
                  </Button>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}

      {isStaff && waitlist.length > 0 && (
        <Card className="mb-5">
          <CardHeader>
            <p className="text-sm font-medium text-slate-900">Waitlist ({waitlist.length})</p>
          </CardHeader>
          <CardBody>
            <ul className="divide-y divide-slate-100">
              {waitlist.map((w) => (
                <li key={w.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <div>
                    <span className="mr-2 font-medium text-slate-900">#{w.rank}</span>
                    <span className="text-slate-700">{studentLabel(residentNames, w.studentId)}</span>
                    <span className="ml-2 text-xs text-slate-500">priority {w.priorityScore}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="secondary" onClick={() => setPriorityTarget(w)}>
                      Set priority
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => void allocApi.withdrawFromWaitlist(w.id).then(load)}>
                      Remove
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}

      {isStaff && noShowQueue.length > 0 && (
        <Card tone="warning" className="mb-5">
          <CardHeader className="flex items-center justify-between">
            <p className="text-sm font-medium text-amber-800">No-show review ({noShowQueue.length})</p>
          </CardHeader>
          <CardBody>
            <ul className="divide-y divide-slate-100">
              {noShowQueue.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="text-sm">
                    <p className="text-xs text-slate-500">{studentLabel(residentNames, a.studentId)}</p>
                    <p className="text-slate-600">
                      Deadline was {a.checkInDeadline ? new Date(a.checkInDeadline).toLocaleString() : '—'}
                    </p>
                  </div>
                  <Button size="sm" variant="secondary" onClick={() => setNoShowTarget(a)}>
                    Review
                  </Button>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}

      {isStaff && (
        <div className="mb-4 max-w-xs">
          <FieldWrapper label="Filter by status" htmlFor="alloc-status">
            <Select id="alloc-status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as AllocationStatus | '')}>
              <option value="">All statuses</option>
              <option value="awaiting_check_in">Awaiting Check-In</option>
              <option value="checked_in_active">Active Resident</option>
              <option value="no_show_review">No-Show Review</option>
              <option value="released">Released</option>
            </Select>
          </FieldWrapper>
        </div>
      )}

      {loading ? (
        <PageSpinner />
      ) : allocations.length === 0 ? (
        <EmptyState icon={<BedIcon className="h-8 w-8" />} title="No allocations" description="Nothing matches this filter yet." />
      ) : (
        <Card>
          <DataList
            columns={columns}
            rows={allocations}
            onRowClick={isStaff ? (row) => (row.status === 'awaiting_check_in' ? setCheckInTarget(row) : undefined) : undefined}
          />
        </Card>
      )}

      {transfers.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">Transfer requests</h2>
          <Card>
            <ul className="divide-y divide-slate-100">
              {transfers.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
                  <div className="min-w-0 text-sm">
                    <p className="flex items-center gap-2">
                      <span className="text-xs text-slate-500">{studentLabel(residentNames, t.studentId)}</span>
                      <StatusPill status={t.status} />
                      {t.transferType === 'emergency' && (
                        <span className="inline-flex items-center rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-medium text-rose-700">
                          Emergency
                        </span>
                      )}
                      {/* Real gap, found live: the return-due deadline was only ever
                          shown inside the Decide/Execute sheets — both unreachable
                          once the transfer moves past requested/approved, so it
                          became genuinely invisible for the entire time it actually
                          mattered (while waiting for auto-restore). Shown here
                          instead, on the one badge that's visible for that whole
                          window. */}
                      {t.isTemporary && (
                        <span className="inline-flex items-center rounded-full bg-sky-50 px-2.5 py-0.5 text-xs font-medium text-sky-700">
                          {t.restoredAt
                            ? 'Restored'
                            : t.restorationBlockedAt
                              ? 'Return blocked — original bed unavailable'
                              : `Temporary — auto-restores ${t.retrospectiveReviewDeadline ? new Date(t.retrospectiveReviewDeadline).toLocaleString() : ''}`}
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 truncate text-slate-600">{t.reason}</p>
                  </div>
                  {/* Real layout bug, found live: this used to be three
                      separate flex children under the row's own
                      justify-between, which spreads EVERY child evenly
                      across the row — fine with one action button, wrong
                      the moment a second (Cancel) was added, since it
                      pushed Decide/Execute toward the middle instead of
                      keeping them next to Cancel at the right edge. Grouped
                      into one flex child so justify-between only ever sees
                      two: the details block and this whole button group. */}
                  <div className="flex shrink-0 items-center gap-2">
                    {isStaff && t.status === 'requested' && (
                      <Button size="sm" variant="secondary" onClick={() => setDecideTransferTarget(t)}>
                        Decide
                      </Button>
                    )}
                    {isStaff && t.status === 'approved' && (
                      <Button size="sm" onClick={() => setExecuteTransferTarget(t)}>
                        Execute
                      </Button>
                    )}
                    {/* Real gap, found live: cancelTransfer existed end-to-end
                        (backend route + api/transfers.ts client) with no
                        button anywhere ever calling it — flow.md §19 item 17. */}
                    {(isStaff || t.studentId === me?.sub) && ['requested', 'approved'].includes(t.status) && (
                      <Button size="sm" variant="danger" onClick={() => setCancelTransferTarget(t)}>
                        Cancel
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}

      <CreateAllocationSheet open={createOpen} onClose={() => setCreateOpen(false)} onCreated={load} />
      {checkInTarget && <CheckInSheet allocation={checkInTarget} onClose={() => setCheckInTarget(null)} onCheckedIn={load} />}
      {noShowTarget && <NoShowSheet allocation={noShowTarget} onClose={() => setNoShowTarget(null)} onResolved={load} />}
      <RequestTransferSheet open={requestTransferOpen} onClose={() => setRequestTransferOpen(false)} onRequested={load} isStaff={isStaff} />
      {decideTransferTarget && (
        <DecideTransferSheet transfer={decideTransferTarget} onClose={() => setDecideTransferTarget(null)} onDecided={load} />
      )}
      {executeTransferTarget && (
        <ExecuteTransferSheet transfer={executeTransferTarget} onClose={() => setExecuteTransferTarget(null)} onExecuted={load} />
      )}
      {cancelTransferTarget && (
        <CancelTransferSheet transfer={cancelTransferTarget} onClose={() => setCancelTransferTarget(null)} onCancelled={load} />
      )}
      {offerActionTarget && (
        <OfferActionSheet
          offer={offerActionTarget}
          isStaff={isStaff}
          onClose={() => setOfferActionTarget(null)}
          onDone={load}
        />
      )}
      {priorityTarget && (
        <WaitlistPrioritySheet entry={priorityTarget} onClose={() => setPriorityTarget(null)} onSaved={load} />
      )}
    </div>
  );
}

/** D17.03 items 54/55 gap-closure — "Assign directly" is the original,
 * unchanged createAllocation call; "Send an offer" is the new path that
 * lets the resident actually accept or decline within a deadline instead
 * of being assigned outright. Same sheet, same application/bed pickers —
 * the mode toggle is the only new decision staff make, not a second form
 * to learn. */
function CreateAllocationSheet({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const residentNames = useResidentNames();
  const [readyApps, setReadyApps] = useState<HostelApplication[]>([]);
  const [beds, setBeds] = useState<AvailableBed[]>([]);
  const [applicationId, setApplicationId] = useState('');
  const [bedId, setBedId] = useState('');
  const [mode, setMode] = useState<'direct' | 'offer'>('direct');
  const [noBedInfo, setNoBedInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loadingOptions, setLoadingOptions] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoadingOptions(true);
    Promise.all([appApi.listApplications('allocation_ready'), fetchAvailableBeds()]).then(([apps, availableBeds]) => {
      setReadyApps(apps);
      setBeds(availableBeds);
      setLoadingOptions(false);
    });
  }, [open]);

  // D17.03 item 56 — when the application picker has candidates but the
  // bed picker doesn't, tell staff WHY instead of leaving an empty select
  // with no explanation.
  useEffect(() => {
    if (!applicationId || beds.length > 0) {
      setNoBedInfo(null);
      return;
    }
    void allocApi.getNoBedReason(applicationId).then(({ message }) => setNoBedInfo(message));
  }, [applicationId, beds.length]);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      if (mode === 'direct') {
        await allocApi.createAllocation({ applicationId, bedId });
      } else {
        await allocApi.createOffer({ applicationId, bedId });
      }
      onCreated();
      onClose();
      setApplicationId('');
      setBedId('');
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
      title="Allocate a bed"
      footer={
        <Button fullWidth onClick={() => void handleSubmit()} disabled={submitting || !applicationId || !bedId}>
          {submitting ? (mode === 'direct' ? 'Allocating…' : 'Sending offer…') : mode === 'direct' ? 'Confirm allocation' : 'Send offer'}
        </Button>
      }
    >
      {loadingOptions ? (
        <PageSpinner />
      ) : (
        <div className="space-y-4">
          {error && <Alert>{error}</Alert>}
          <FieldWrapper label="How should this bed be assigned?" htmlFor="alloc-mode">
            <Select id="alloc-mode" value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
              <option value="direct">Assign directly — resident is checked in right away</option>
              <option value="offer">Send an offer — resident accepts or declines first</option>
            </Select>
          </FieldWrapper>
          {readyApps.length === 0 && (
            <Alert tone="warning">No applications are in the allocation-ready queue right now.</Alert>
          )}
          {beds.length === 0 && (
            <Alert tone="warning">{noBedInfo ?? 'No beds are currently available.'}</Alert>
          )}
          <FieldWrapper label="Application" htmlFor="alloc-app" required>
            <Select id="alloc-app" value={applicationId} onChange={(e) => setApplicationId(e.target.value)}>
              <option value="">Select an application</option>
              {readyApps.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.term} — {studentLabel(residentNames, a.studentId)}
                </option>
              ))}
            </Select>
          </FieldWrapper>
          <FieldWrapper label="Bed" htmlFor="alloc-bed" required>
            <Select id="alloc-bed" value={bedId} onChange={(e) => setBedId(e.target.value)}>
              <option value="">Select a bed</option>
              {beds.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.label}
                </option>
              ))}
            </Select>
          </FieldWrapper>
        </div>
      )}
    </Sheet>
  );
}

const EMPTY_ITEM: CheckInInventoryItem = {
  itemName: '',
  itemCategory: 'furniture',
  quantity: 1,
  condition: 'good',
  residentResponse: 'accept',
};

/** D17.04 items 59/60/61/62 gap-closure — the one free-text notes field
 * became a structured per-item inventory (name/category/quantity/
 * condition/defect severity/photo, resident accept-or-dispute per item),
 * the pass/fail undertaking checkbox gained a real five-response
 * acknowledgement type alongside it, and a safety-critical item now
 * genuinely blocks submission until staff explicitly override with a
 * reason — surfaced here as a real retry step, not a silent auto-pass. */
function CheckInSheet({ allocation, onClose, onCheckedIn }: { allocation: Allocation; onClose: () => void; onCheckedIn: () => void }) {
  const residentNames = useResidentNames();
  const [undertaking, setUndertaking] = useState(false);
  const [acknowledgementType, setAcknowledgementType] = useState<AcknowledgementType>('accept_all');
  const [officerNotes, setOfficerNotes] = useState('');
  const [residentNotes, setResidentNotes] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [photos, setPhotos] = useState<ConditionPhoto[]>([]);
  const [items, setItems] = useState<CheckInInventoryItem[]>([]);
  const [draftItem, setDraftItem] = useState<CheckInInventoryItem>(EMPTY_ITEM);
  const [safetyBlock, setSafetyBlock] = useState<string | null>(null);
  const [overrideReason, setOverrideReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const refusingHandover = acknowledgementType === 'refuse_handover' || acknowledgementType === 'request_alternate_room';
  const hasSafetyCritical = items.some((i) => i.defectSeverity === 'safety_critical');

  function addPhoto() {
    if (!photoUrl.trim()) return;
    setPhotos((p) => [...p, { url: photoUrl.trim() }]);
    setPhotoUrl('');
  }

  function addItem() {
    if (!draftItem.itemName.trim()) return;
    setItems((prev) => [...prev, draftItem]);
    setDraftItem(EMPTY_ITEM);
  }

  async function handleSubmit(withOverride = false) {
    setSubmitting(true);
    setError(null);
    try {
      await checkinApi.createCheckIn({
        allocationId: allocation.id,
        undertakingAccepted: undertaking,
        acknowledgementType,
        officerNotes: officerNotes || undefined,
        residentNotes: residentNotes || undefined,
        conditionPhotos: photos,
        items,
        overrideSafetyCritical: withOverride,
        overrideReason: withOverride ? overrideReason : undefined,
      });
      onCheckedIn();
      onClose();
    } catch (err) {
      // A safety-critical defect without an override comes back as a 409
      // naming which items are blocking it — surfaced as a real retry
      // step (reason + explicit "check in anyway" action) rather than a
      // dead-end error message.
      if (hasSafetyCritical && !withOverride) {
        setSafetyBlock(errorMessage(err));
      } else {
        setError(errorMessage(err));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title="Complete check-in"
      footer={
        safetyBlock ? (
          <Button fullWidth variant="danger" onClick={() => void handleSubmit(true)} disabled={submitting || !overrideReason.trim()}>
            {submitting ? 'Checking in…' : 'Check in anyway (override)'}
          </Button>
        ) : (
          <Button fullWidth onClick={() => void handleSubmit(false)} disabled={submitting || !undertaking}>
            {submitting ? 'Checking in…' : refusingHandover ? 'Record refused handover' : 'Check in resident'}
          </Button>
        )
      }
    >
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        {safetyBlock && (
          <Alert>
            {safetyBlock}
            <div className="mt-2">
              <FieldWrapper label="Override reason" htmlFor="checkin-override-reason" required>
                <Textarea id="checkin-override-reason" value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} />
              </FieldWrapper>
            </div>
          </Alert>
        )}
        <p className="text-sm text-slate-600">
          Student <span>{studentLabel(residentNames, allocation.studentId)}</span>
        </p>

        <FieldWrapper label="Resident's response to the handover" htmlFor="checkin-ack">
          <Select id="checkin-ack" value={acknowledgementType} onChange={(e) => setAcknowledgementType(e.target.value as AcknowledgementType)}>
            <option value="accept_all">Accept all — no issues</option>
            <option value="accept_with_comments">Accept, with comments</option>
            <option value="dispute_selected_item">Dispute one or more items below</option>
            <option value="refuse_handover">Refuse the handover</option>
            <option value="request_alternate_room">Request an alternate room</option>
          </Select>
        </FieldWrapper>
        {refusingHandover && (
          <Alert tone="warning">
            The resident is not being checked in — this records the attempt, but the bed stays reserved and available for a corrected retry.
          </Alert>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FieldWrapper label="Officer notes" htmlFor="checkin-officer-notes">
            <Textarea id="checkin-officer-notes" value={officerNotes} onChange={(e) => setOfficerNotes(e.target.value)} placeholder="Staff observations" />
          </FieldWrapper>
          <FieldWrapper label="Resident notes" htmlFor="checkin-resident-notes">
            <Textarea id="checkin-resident-notes" value={residentNotes} onChange={(e) => setResidentNotes(e.target.value)} placeholder="Resident's own comments" />
          </FieldWrapper>
        </div>

        <FieldWrapper label="Room inventory" htmlFor="checkin-item-name" hint="Cot, mattress, cupboard, key, appliance… one line per item">
          <div className="space-y-2">
            {items.length > 0 && (
              <ul className="space-y-1.5">
                {items.map((it, i) => (
                  <li key={`${it.itemName}-${i}`} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm">
                    <span className="truncate text-slate-700">
                      {it.itemName} × {it.quantity} — {it.condition}
                      {it.defectSeverity && ` (${it.defectSeverity.replace('_', ' ')})`}
                      {it.residentResponse === 'dispute' && <span className="ml-1 text-rose-600">disputed</span>}
                    </span>
                    <button
                      type="button"
                      onClick={() => setItems((prev) => prev.filter((_, idx) => idx !== i))}
                      aria-label={`Remove ${it.itemName}`}
                      className="shrink-0 text-slate-400 hover:text-slate-600"
                    >
                      <CloseIcon className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="grid grid-cols-2 gap-2 rounded-lg border border-dashed border-slate-300 p-2 sm:grid-cols-6">
              <Input
                id="checkin-item-name"
                placeholder="Item name"
                value={draftItem.itemName}
                onChange={(e) => setDraftItem((d) => ({ ...d, itemName: e.target.value }))}
                className="col-span-2 sm:col-span-2"
              />
              <Select
                value={draftItem.itemCategory}
                onChange={(e) => setDraftItem((d) => ({ ...d, itemCategory: e.target.value as CheckInInventoryItem['itemCategory'] }))}
              >
                <option value="furniture">Furniture</option>
                <option value="appliance">Appliance</option>
                <option value="key">Key</option>
                <option value="fixture">Fixture</option>
                <option value="other">Other</option>
              </Select>
              <Input
                type="number"
                min={1}
                value={draftItem.quantity}
                onChange={(e) => setDraftItem((d) => ({ ...d, quantity: Number(e.target.value) || 1 }))}
              />
              <Select value={draftItem.condition} onChange={(e) => setDraftItem((d) => ({ ...d, condition: e.target.value as CheckInInventoryItem['condition'] }))}>
                <option value="good">Good</option>
                <option value="fair">Fair</option>
                <option value="damaged">Damaged</option>
                <option value="missing">Missing</option>
              </Select>
              <Button type="button" variant="secondary" size="sm" onClick={addItem} disabled={!draftItem.itemName.trim()}>
                Add
              </Button>
              {draftItem.condition !== 'good' && (
                <Select
                  value={draftItem.defectSeverity ?? ''}
                  onChange={(e) => setDraftItem((d) => ({ ...d, defectSeverity: (e.target.value || undefined) as CheckInInventoryItem['defectSeverity'] }))}
                  className="col-span-2 sm:col-span-3"
                >
                  <option value="">No defect severity set</option>
                  <option value="cosmetic">Cosmetic</option>
                  <option value="service_impacting">Service-impacting</option>
                  <option value="safety_critical">Safety-critical — blocks check-in without override</option>
                </Select>
              )}
              <label className="col-span-2 flex items-center gap-2 text-xs text-slate-600 sm:col-span-3">
                <input
                  type="checkbox"
                  checked={draftItem.residentResponse === 'dispute'}
                  onChange={(e) => setDraftItem((d) => ({ ...d, residentResponse: e.target.checked ? 'dispute' : 'accept' }))}
                  className="h-3.5 w-3.5 rounded border-slate-300 text-accent"
                />
                Resident disputes this item
              </label>
            </div>
          </div>
        </FieldWrapper>

        {/* UOS HOSTEL BR.md §10 Check-In Console: "photos" on the condition
            checklist — same reference-link pattern as Applications.tsx's
            attachments, not an in-app camera/upload. */}
        <FieldWrapper label="Condition photos" htmlFor="checkin-photo-url" hint="Link photos of pre-existing damage or the room's current state">
          <div className="space-y-2">
            {photos.length > 0 && (
              <ul className="space-y-1.5">
                {photos.map((p, i) => (
                  <li key={`${p.url}-${i}`} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm">
                    <span className="truncate text-slate-700">{p.url}</span>
                    <button
                      type="button"
                      onClick={() => setPhotos((prev) => prev.filter((_, idx) => idx !== i))}
                      aria-label="Remove photo"
                      className="shrink-0 text-slate-400 hover:text-slate-600"
                    >
                      <CloseIcon className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex gap-2">
              <Input id="checkin-photo-url" placeholder="Photo URL" value={photoUrl} onChange={(e) => setPhotoUrl(e.target.value)} className="flex-1" />
              <Button type="button" variant="secondary" size="sm" onClick={addPhoto} disabled={!photoUrl.trim()}>
                Add
              </Button>
            </div>
          </div>
        </FieldWrapper>
        <label className="flex min-h-touch cursor-pointer items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={undertaking} onChange={(e) => setUndertaking(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-accent" />
          Resident has accepted the hostel undertaking
        </label>
      </div>
    </Sheet>
  );
}

/** D17.03 item 58 gap-closure — Defer and Reassign added alongside the
 * original Extend/Release. Reassign's candidate list is the active
 * waitlist for this bed's hostel — a real, visible use for the waitlist
 * feature right where a "we need a different candidate for this bed" need
 * naturally comes up, rather than reassignment requiring staff to go
 * cross-reference a separate screen for who's waiting. */
function NoShowSheet({ allocation, onClose, onResolved }: { allocation: Allocation; onClose: () => void; onResolved: () => void }) {
  const residentNames = useResidentNames();
  const [reason, setReason] = useState('');
  const [newDeadline, setNewDeadline] = useState('');
  const [waitlist, setWaitlist] = useState<WaitlistEntry[]>([]);
  const [reassignTo, setReassignTo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<'release' | 'extend' | 'defer' | 'reassign' | null>(null);

  useEffect(() => {
    void allocApi.listWaitlist({ status: 'active' }).then(setWaitlist);
  }, []);

  async function handleRelease() {
    setSubmitting('release');
    setError(null);
    try {
      await allocApi.releaseNoShow(allocation.id, reason);
      onResolved();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(null);
    }
  }

  async function handleExtend() {
    setSubmitting('extend');
    setError(null);
    try {
      await allocApi.extendNoShow(allocation.id, reason, new Date(newDeadline).toISOString());
      onResolved();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(null);
    }
  }

  async function handleDefer() {
    setSubmitting('defer');
    setError(null);
    try {
      await allocApi.deferNoShow(allocation.id, reason);
      onResolved();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(null);
    }
  }

  async function handleReassign() {
    setSubmitting('reassign');
    setError(null);
    try {
      await allocApi.reassignNoShow(allocation.id, reassignTo);
      onResolved();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title="No-show review"
      footer={
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" fullWidth onClick={() => void handleExtend()} disabled={!reason || !newDeadline || Boolean(submitting)}>
            {submitting === 'extend' ? 'Extending…' : 'Extend deadline'}
          </Button>
          <Button variant="secondary" fullWidth onClick={() => void handleDefer()} disabled={!reason || Boolean(submitting)}>
            {submitting === 'defer' ? 'Deferring…' : 'Defer for later'}
          </Button>
          <Button variant="danger" fullWidth onClick={() => void handleRelease()} disabled={!reason || Boolean(submitting)}>
            {submitting === 'release' ? 'Releasing…' : 'Release bed'}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <p className="text-sm text-slate-600">
          Student <span>{studentLabel(residentNames, allocation.studentId)}</span> missed their check-in deadline
          {allocation.checkInDeadline ? ` of ${new Date(allocation.checkInDeadline).toLocaleString()}` : ''}.
        </p>
        <FieldWrapper label="Reason" htmlFor="noshow-reason" required hint="Used for Extend, Defer and Release">
          <Textarea id="noshow-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
        </FieldWrapper>
        <FieldWrapper label="New deadline (if extending)" htmlFor="noshow-deadline">
          <Input id="noshow-deadline" type="datetime-local" value={newDeadline} onChange={(e) => setNewDeadline(e.target.value)} />
        </FieldWrapper>
        {waitlist.length > 0 && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <FieldWrapper label="Reassign this bed to a waitlisted candidate instead" htmlFor="noshow-reassign" hint="Sends a real offer to the new candidate — doesn't assign outright">
              <div className="flex gap-2">
                <Select id="noshow-reassign" value={reassignTo} onChange={(e) => setReassignTo(e.target.value)} className="flex-1">
                  <option value="">Select a candidate…</option>
                  {waitlist.map((w) => (
                    <option key={w.id} value={w.applicationId}>
                      #{w.rank} — {studentLabel(residentNames, w.studentId)}
                    </option>
                  ))}
                </Select>
                <Button
                  variant="secondary"
                  onClick={() => void handleReassign()}
                  disabled={!reassignTo || Boolean(submitting)}
                >
                  {submitting === 'reassign' ? 'Reassigning…' : 'Reassign'}
                </Button>
              </div>
            </FieldWrapper>
          </div>
        )}
      </div>
    </Sheet>
  );
}

/** UOS HOSTEL BR.md §7 — self-service by default; staff get the extra
 * 'emergency' option, which a resident cannot declare for themselves
 * (enforced server-side in transfers/service.ts, not just hidden here). */
function RequestTransferSheet({
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
  // Real gap, found live via SELF-TEST-GUIDE.md C13 — "Head Warden" was
  // hardcoded here, same pattern as bugs #29-31.
  const headWardenLabel = useLabel('headWardenLabel', 'Head Warden');
  const [reason, setReason] = useState('');
  const [transferType, setTransferType] = useState<'normal' | 'emergency'>('normal');
  const [studentId, setStudentId] = useState('');
  const [retrospectiveReviewDeadline, setRetrospectiveReviewDeadline] = useState('');
  const [isTemporary, setIsTemporary] = useState(false);
  const [candidates, setCandidates] = useState<ResidentCandidate[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Real gap, found live: this field asked staff to paste a raw resident
  // UUID with no way to discover one, same class of issue as the Room
  // Head/Floor In-charge pickers (flow.md §19 item 15). No new endpoint
  // needed — every role that can see this field (isStaff) already holds
  // 'responsibility:assign' alongside 'transfer:decide' in the seed, so the
  // same GET /responsibilities/candidates the Structure screen uses works
  // here unchanged.
  useEffect(() => {
    if (!open || !isStaff) return;
    void responsibilityApi.listCandidates().then(setCandidates);
  }, [open, isStaff]);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      await transferApi.requestTransfer({
        reason,
        transferType,
        ...(isStaff && studentId ? { studentId } : {}),
        ...(transferType === 'emergency' && retrospectiveReviewDeadline
          ? { retrospectiveReviewDeadline: new Date(retrospectiveReviewDeadline).toISOString() }
          : {}),
        ...(transferType === 'emergency' ? { isTemporary } : {}),
      });
      onRequested();
      onClose();
      setReason('');
      setStudentId('');
      setTransferType('normal');
      setRetrospectiveReviewDeadline('');
      setIsTemporary(false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit = reason.trim() && (transferType === 'normal' || retrospectiveReviewDeadline);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Request a transfer"
      footer={
        <Button fullWidth onClick={() => void handleSubmit()} disabled={submitting || !canSubmit}>
          {submitting ? 'Submitting…' : 'Submit request'}
        </Button>
      }
    >
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        {isStaff && (
          <FieldWrapper label="Resident (staff only — leave blank to request your own)" htmlFor="tr-student">
            <Select id="tr-student" value={studentId} onChange={(e) => setStudentId(e.target.value)}>
              <option value="">— Request my own —</option>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.email})
                </option>
              ))}
            </Select>
          </FieldWrapper>
        )}
        <FieldWrapper label="Reason" htmlFor="tr-reason" required>
          <Textarea id="tr-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
        </FieldWrapper>
        {isStaff && (
          <FieldWrapper label="Type" htmlFor="tr-type">
            <Select id="tr-type" value={transferType} onChange={(e) => setTransferType(e.target.value as 'normal' | 'emergency')}>
              <option value="normal">Normal</option>
              <option value="emergency">Emergency relocation — requires {headWardenLabel} decision</option>
            </Select>
          </FieldWrapper>
        )}
        {transferType === 'emergency' && (
          <>
            <FieldWrapper
              label="Retrospective review deadline"
              htmlFor="tr-review-deadline"
              required
              hint={
                isTemporary
                  ? 'Also doubles as the return-due date — the resident is moved back to their original bed automatically once this passes'
                  : 'BR §7: an emergency relocation is provisional until reviewed by this date'
              }
            >
              <Input
                id="tr-review-deadline"
                type="datetime-local"
                value={retrospectiveReviewDeadline}
                onChange={(e) => setRetrospectiveReviewDeadline(e.target.value)}
              />
            </FieldWrapper>
            <label className="flex min-h-touch cursor-pointer items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={isTemporary}
                onChange={(e) => setIsTemporary(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-accent"
              />
              Temporary relocation — automatically move the resident back to their original bed when the deadline above passes
            </label>
          </>
        )}
      </div>
    </Sheet>
  );
}

function DecideTransferSheet({
  transfer,
  onClose,
  onDecided,
}: {
  transfer: TransferRequest;
  onClose: () => void;
  onDecided: () => void;
}) {
  // Real gap, found live via SELF-TEST-GUIDE.md C13 — same hardcoded
  // "Head Warden" pattern as bugs #29-31.
  const headWardenLabel = useLabel('headWardenLabel', 'Head Warden');
  const [decision, setDecision] = useState<'approved' | 'rejected'>('approved');
  const [reason, setReason] = useState('');
  const [newBedId, setNewBedId] = useState('');
  const [beds, setBeds] = useState<AvailableBed[]>([]);
  const [candidates, setCandidates] = useState<ResidentCandidate[]>([]);
  const [allBeds, setAllBeds] = useState<AvailableBed[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Real gap, found live: the user asked it directly — "on which basis will
  // Head Warden approve, they don't get to see the previous information."
  // Confirmed: this sheet only ever showed a truncated student UUID and the
  // reason string — not the resident's name, not which bed the transfer
  // would actually vacate, not the submission date. All of it was already
  // sitting in `transfer` (oldBedId) or one query away (resident name via
  // the same candidates endpoint the Room Head/Transfer pickers already
  // use) — same root cause as the Applications Decide sheet fix.
  useEffect(() => {
    void fetchAvailableBeds().then(setBeds);
    void responsibilityApi.listCandidates().then(setCandidates);
    void fetchBeds(() => true).then(setAllBeds);
  }, []);

  const residentLabel = candidates.find((c) => c.id === transfer.studentId);
  const currentBedLabel = allBeds.find((b) => b.id === transfer.oldBedId)?.label;

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      await transferApi.decideTransfer(transfer.id, {
        decision,
        reason,
        ...(decision === 'approved' ? { newBedId } : {}),
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
      title="Decide transfer request"
      footer={
        <Button fullWidth onClick={() => void handleSubmit()} disabled={submitting || !reason || (decision === 'approved' && !newBedId)}>
          {submitting ? 'Saving…' : 'Save decision'}
        </Button>
      }
    >
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        {transfer.transferType === 'emergency' && (
          <Alert tone="warning">Emergency relocation — this decision requires {headWardenLabel} authority (or an active delegation).</Alert>
        )}
        <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="text-slate-500">Resident</span>
            <span className="text-right text-slate-700">
              {residentLabel ? `${residentLabel.name} (${residentLabel.email})` : transfer.studentId}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-slate-500">Current bed</span>
            <span className="text-right text-slate-700">{currentBedLabel ?? '(loading…)'}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-slate-500">Requested</span>
            <span className="text-slate-700">{new Date(transfer.createdAt).toLocaleString()}</span>
          </div>
          {transfer.transferType === 'emergency' && transfer.retrospectiveReviewDeadline && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-500">{transfer.isTemporary ? 'Return-due deadline' : 'Retrospective review deadline'}</span>
              <span className="text-slate-700">{new Date(transfer.retrospectiveReviewDeadline).toLocaleString()}</span>
            </div>
          )}
          <div className="border-t border-slate-200 pt-2">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Reason</p>
            <p className="whitespace-pre-wrap text-slate-700">{transfer.reason}</p>
          </div>
        </div>
        <FieldWrapper label="Decision" htmlFor="tr-decision">
          <Select id="tr-decision" value={decision} onChange={(e) => setDecision(e.target.value as typeof decision)}>
            <option value="approved">Approve</option>
            <option value="rejected">Reject</option>
          </Select>
        </FieldWrapper>
        {decision === 'approved' && (
          <FieldWrapper label="New bed" htmlFor="tr-new-bed" required>
            <Select id="tr-new-bed" value={newBedId} onChange={(e) => setNewBedId(e.target.value)}>
              <option value="">Select an available bed…</option>
              {beds.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.label}
                </option>
              ))}
            </Select>
          </FieldWrapper>
        )}
        <FieldWrapper label="Reason" htmlFor="tr-decide-reason" required>
          <Textarea id="tr-decide-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
        </FieldWrapper>
      </div>
    </Sheet>
  );
}

function ExecuteTransferSheet({
  transfer,
  onClose,
  onExecuted,
}: {
  transfer: TransferRequest;
  onClose: () => void;
  onExecuted: () => void;
}) {
  const [undertaking, setUndertaking] = useState(false);
  const [conditionNotes, setConditionNotes] = useState('');
  const [oldRoomInspectionNotes, setOldRoomInspectionNotes] = useState('');
  const [oldBedOutcome, setOldBedOutcome] = useState<'available' | 'blocked'>('available');
  const [candidates, setCandidates] = useState<ResidentCandidate[]>([]);
  const [allBeds, setAllBeds] = useState<AvailableBed[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Same gap, same fix, as DecideTransferSheet just above — Execute is the
  // very next step in this same flow and had the identical problem.
  useEffect(() => {
    void responsibilityApi.listCandidates().then(setCandidates);
    void fetchBeds(() => true).then(setAllBeds);
  }, []);

  const residentLabel = candidates.find((c) => c.id === transfer.studentId);
  const oldBedLabel = allBeds.find((b) => b.id === transfer.oldBedId)?.label;
  const newBedLabel = allBeds.find((b) => b.id === transfer.newBedId)?.label;

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      await transferApi.executeTransfer(transfer.id, {
        undertakingAccepted: undertaking,
        conditionNotes: conditionNotes || undefined,
        oldRoomInspectionNotes: oldRoomInspectionNotes || undefined,
        oldBedOutcome,
      });
      onExecuted();
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
      title="Complete transfer"
      footer={
        <Button fullWidth onClick={() => void handleSubmit()} disabled={submitting || !undertaking}>
          {submitting ? 'Completing…' : 'Move resident now'}
        </Button>
      }
    >
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="text-slate-500">Resident</span>
            <span className="text-right text-slate-700">
              {residentLabel ? `${residentLabel.name} (${residentLabel.email})` : transfer.studentId}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-slate-500">Moving from</span>
            <span className="text-right text-slate-700">{oldBedLabel ?? '(loading…)'}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-slate-500">Moving to</span>
            <span className="text-right text-slate-700">{newBedLabel ?? '(loading…)'}</span>
          </div>
        </div>
        <p className="text-sm text-slate-600">This activates the new room and ends the old occupancy.</p>
        <FieldWrapper label="New-room condition notes" htmlFor="tr-exec-notes">
          <Textarea id="tr-exec-notes" value={conditionNotes} onChange={(e) => setConditionNotes(e.target.value)} />
        </FieldWrapper>
        <FieldWrapper label="Old-room inspection notes" htmlFor="tr-exec-old-notes">
          <Textarea id="tr-exec-old-notes" value={oldRoomInspectionNotes} onChange={(e) => setOldRoomInspectionNotes(e.target.value)} />
        </FieldWrapper>
        <FieldWrapper label="Old bed outcome" htmlFor="tr-exec-old-bed">
          <Select id="tr-exec-old-bed" value={oldBedOutcome} onChange={(e) => setOldBedOutcome(e.target.value as 'available' | 'blocked')}>
            <option value="available">Available — no issues found</option>
            <option value="blocked">Blocked — needs maintenance before reuse</option>
          </Select>
        </FieldWrapper>
        <label className="flex min-h-touch cursor-pointer items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={undertaking} onChange={(e) => setUndertaking(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-accent" />
          Resident has accepted the hostel undertaking for the new room
        </label>
      </div>
    </Sheet>
  );
}

/** flow.md §19 item 17 gap-closure — `cancelTransfer` existed end-to-end
 * (backend route + api/transfers.ts client, allowed for the requesting
 * resident or staff on a still-`requested`/`approved` transfer) with no
 * button anywhere calling it. */
function CancelTransferSheet({
  transfer,
  onClose,
  onCancelled,
}: {
  transfer: TransferRequest;
  onClose: () => void;
  onCancelled: () => void;
}) {
  const residentNames = useResidentNames();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      await transferApi.cancelTransfer(transfer.id, reason);
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
      title="Cancel transfer request"
      footer={
        <Button variant="danger" fullWidth onClick={() => void handleSubmit()} disabled={submitting || !reason.trim()}>
          {submitting ? 'Cancelling…' : 'Cancel transfer'}
        </Button>
      }
    >
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <p className="text-sm text-slate-600">
          Student <span>{studentLabel(residentNames, transfer.studentId)}</span> — {transfer.reason}
        </p>
        <FieldWrapper label="Reason" htmlFor="tr-cancel-reason" required>
          <Textarea id="tr-cancel-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
        </FieldWrapper>
      </div>
    </Sheet>
  );
}

/** D17.03 item 55 — one sheet handling both sides of an offer's lifecycle:
 * the resident accepting/declining their own offer, or staff withdrawing
 * one they created. Which buttons show depends on `isStaff`, same pattern
 * as every other role-conditional sheet on this page. */
function OfferActionSheet({
  offer,
  isStaff,
  onClose,
  onDone,
}: {
  offer: AllocationOffer;
  isStaff: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const residentNames = useResidentNames();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<'accept' | 'decline' | 'withdraw' | null>(null);

  async function handleAccept() {
    setSubmitting('accept');
    setError(null);
    try {
      await allocApi.acceptOffer(offer.id);
      onDone();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(null);
    }
  }

  async function handleDecline() {
    setSubmitting('decline');
    setError(null);
    try {
      await allocApi.declineOffer(offer.id, reason);
      onDone();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(null);
    }
  }

  async function handleWithdraw() {
    setSubmitting('withdraw');
    setError(null);
    try {
      await allocApi.withdrawOffer(offer.id, reason);
      onDone();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title="Bed offer"
      footer={
        isStaff ? (
          <Button fullWidth variant="danger" onClick={() => void handleWithdraw()} disabled={submitting !== null || !reason.trim()}>
            {submitting === 'withdraw' ? 'Withdrawing…' : 'Withdraw offer'}
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button variant="danger" fullWidth onClick={() => void handleDecline()} disabled={submitting !== null || !reason.trim()}>
              {submitting === 'decline' ? 'Declining…' : 'Decline'}
            </Button>
            <Button fullWidth onClick={() => void handleAccept()} disabled={submitting !== null}>
              {submitting === 'accept' ? 'Accepting…' : 'Accept'}
            </Button>
          </div>
        )
      }
    >
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <p className="text-sm text-slate-600">
          {isStaff ? (
            <>Offer to <span>{studentLabel(residentNames, offer.studentId)}</span></>
          ) : (
            'A bed has been offered to you.'
          )}{' '}
          Respond before {new Date(offer.acceptDeadline).toLocaleString()}.
        </p>
        <FieldWrapper label="Reason" htmlFor="offer-reason" required={isStaff || submitting === 'decline'} hint={!isStaff ? 'Required only if declining' : undefined}>
          <Textarea id="offer-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
        </FieldWrapper>
      </div>
    </Sheet>
  );
}

/** D17.03 item 53 — staff-only priority override. FIFO (created_at) is the
 * default tie-break; this lets a genuinely urgent case (e.g. an
 * accessibility need, a welfare priority) move up without needing a
 * separate escalation process. */
function WaitlistPrioritySheet({ entry, onClose, onSaved }: { entry: WaitlistEntry; onClose: () => void; onSaved: () => void }) {
  const residentNames = useResidentNames();
  const [priorityScore, setPriorityScore] = useState(String(entry.priorityScore));
  const [notes, setNotes] = useState(entry.notes ?? '');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      await allocApi.updateWaitlistPriority(entry.id, Number(priorityScore), notes || undefined);
      onSaved();
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
      title="Set waitlist priority"
      footer={
        <Button fullWidth onClick={() => void handleSubmit()} disabled={submitting}>
          {submitting ? 'Saving…' : 'Save priority'}
        </Button>
      }
    >
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <p className="text-sm text-slate-600">
          Currently #{entry.rank} — <span>{studentLabel(residentNames, entry.studentId)}</span>
        </p>
        <FieldWrapper label="Priority score" htmlFor="wl-priority" hint="Higher moves up the list; ties break by who joined first">
          <Input id="wl-priority" type="number" value={priorityScore} onChange={(e) => setPriorityScore(e.target.value)} />
        </FieldWrapper>
        <FieldWrapper label="Notes" htmlFor="wl-notes" hint="Optional — why this priority was set">
          <Textarea id="wl-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </FieldWrapper>
      </div>
    </Sheet>
  );
}
