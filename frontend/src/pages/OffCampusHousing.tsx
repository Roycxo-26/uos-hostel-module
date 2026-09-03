import { useEffect, useState } from 'react';
import * as casesApi from '../api/cases';
import * as offCampusApi from '../api/offCampus';
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
import { hasHostelRole, isPlatformAdmin, type OffCampusPlacement, type OffCampusPlacementType, type OffCampusProvider } from '../types';

/** D17.13 (TODO.md Batch 30, item 120) — "HOSTEL - v.1.md" §21, an
 * explicitly optional feature entitlement (see Settings' "Enable
 * off-campus / short-stay housing" flag). Not staff-only — a resident
 * requests and tracks their own placement; approving providers/placements
 * is staff-gated server-side. */

const PLACEMENT_TYPE_LABELS: Record<OffCampusPlacementType, string> = {
  private_accommodation: 'Private Accommodation',
  partner_residence: 'Partner Residence',
  visiting_exchange: 'Visiting / Exchange',
  emergency_temporary: 'Emergency Temporary',
  guest_short_stay: 'Guest / Short Stay',
  summer_vacation: 'Summer / Vacation',
  overflow: 'Overflow',
};

type Tab = 'placements' | 'providers';

function useResidentNames(): Record<string, string> {
  const [names, setNames] = useState<Record<string, string>>({});
  useEffect(() => {
    void casesApi.listResidentDirectory().then((residents) => {
      setNames(Object.fromEntries(residents.map((r) => [r.id, r.name])));
    });
  }, []);
  return names;
}

export function OffCampusHousing() {
  const { me } = useAuth();
  const isStaff = isPlatformAdmin(me) || hasHostelRole(me, 'warden');
  const [tab, setTab] = useState<Tab>('placements');

  const tabs: [Tab, string][] = [
    ['placements', 'Placements'],
    ...(isStaff ? ([['providers', 'Providers']] as [Tab, string][]) : []),
  ];

  return (
    <div>
      <PageHeader
        title="Off-Campus &amp; Short-Stay Housing"
        description="Approved external providers and resident placements — an optional feature, see Settings to enable it."
      />

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

      {tab === 'placements' && <PlacementsTab isStaff={isStaff} currentUserId={me?.sub} />}
      {tab === 'providers' && isStaff && <ProvidersTab />}
    </div>
  );
}

// ============================================================================
// Placements
// ============================================================================

function PlacementsTab({ isStaff, currentUserId }: { isStaff: boolean; currentUserId: string | undefined }) {
  const residentNames = useResidentNames();
  const [placements, setPlacements] = useState<OffCampusPlacement[]>([]);
  const [providers, setProviders] = useState<OffCampusProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [requestOpen, setRequestOpen] = useState(false);
  const [detailTarget, setDetailTarget] = useState<OffCampusPlacement | null>(null);

  async function load() {
    setLoading(true);
    const [p, prov] = await Promise.all([offCampusApi.listPlacements(), offCampusApi.listProviders({ complianceStatus: 'approved' })]);
    setPlacements(p);
    setProviders(prov);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  const providerName = (id: string) => providers.find((p) => p.id === id)?.providerName ?? id.slice(0, 8);

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => setRequestOpen(true)} disabled={providers.length === 0}>
          Request a placement
        </Button>
      </div>
      {providers.length === 0 && <Alert>No approved providers yet — {isStaff ? 'register one under Providers.' : 'ask a Warden to register one.'}</Alert>}

      {loading ? (
        <PageSpinner />
      ) : placements.length === 0 ? (
        <EmptyState icon={<AlertIcon className="h-8 w-8" />} title="No placements" description="Request one above." />
      ) : (
        <Card>
          <ul className="divide-y divide-slate-100">
            {placements.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setDetailTarget(p)}>
                  <p className="flex items-center gap-2 text-sm">
                    <span className="font-medium text-slate-800">{PLACEMENT_TYPE_LABELS[p.placementType]}</span>
                    <StatusPill status={p.status} />
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {isStaff && `${residentNames[p.studentId] ?? p.studentId.slice(0, 8)} — `}
                    {providerName(p.providerId)} — {p.startDate} to {p.endDate}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <RequestPlacementSheet open={requestOpen} onClose={() => setRequestOpen(false)} onRequested={load} providers={providers} />
      {detailTarget && (
        <PlacementDetailSheet
          placement={detailTarget}
          isStaff={isStaff}
          currentUserId={currentUserId}
          providerName={providerName}
          residentNames={residentNames}
          onClose={() => setDetailTarget(null)}
          onChanged={load}
        />
      )}
    </div>
  );
}

function RequestPlacementSheet({
  open,
  onClose,
  onRequested,
  providers,
}: {
  open: boolean;
  onClose: () => void;
  onRequested: () => void;
  providers: OffCampusProvider[];
}) {
  const [providerId, setProviderId] = useState('');
  const [placementType, setPlacementType] = useState<OffCampusPlacementType>('private_accommodation');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [roomBedReference, setRoomBedReference] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      await offCampusApi.requestPlacement({ providerId, placementType, startDate, endDate, roomBedReference: roomBedReference || undefined });
      onRequested();
      onClose();
      setProviderId('');
      setStartDate('');
      setEndDate('');
      setRoomBedReference('');
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
      title="Request a placement"
      footer={
        <Button fullWidth onClick={() => void handleSubmit()} disabled={submitting || !providerId || !startDate || !endDate}>
          {submitting ? 'Requesting…' : 'Request'}
        </Button>
      }
    >
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <FieldWrapper label="Provider" htmlFor="oc-provider" required>
          <Select id="oc-provider" value={providerId} onChange={(e) => setProviderId(e.target.value)}>
            <option value="">Select an approved provider…</option>
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.providerName}
              </option>
            ))}
          </Select>
        </FieldWrapper>
        <FieldWrapper label="Type" htmlFor="oc-type">
          <Select id="oc-type" value={placementType} onChange={(e) => setPlacementType(e.target.value as OffCampusPlacementType)}>
            {Object.entries(PLACEMENT_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </FieldWrapper>
        <div className="grid grid-cols-2 gap-3">
          <FieldWrapper label="Start date" htmlFor="oc-start" required>
            <Input id="oc-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </FieldWrapper>
          <FieldWrapper label="End date" htmlFor="oc-end" required>
            <Input id="oc-end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </FieldWrapper>
        </div>
        <FieldWrapper label="Room/bed reference" htmlFor="oc-roomref" hint="Optional — how the provider identifies your room">
          <Input id="oc-roomref" value={roomBedReference} onChange={(e) => setRoomBedReference(e.target.value)} />
        </FieldWrapper>
      </div>
    </Sheet>
  );
}

function PlacementDetailSheet({
  placement,
  isStaff,
  currentUserId,
  providerName,
  residentNames,
  onClose,
  onChanged,
}: {
  placement: OffCampusPlacement;
  isStaff: boolean;
  currentUserId: string | undefined;
  providerName: (id: string) => string;
  residentNames: Record<string, string>;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState(placement);
  const [decisionReason, setDecisionReason] = useState('');
  const [exitReason, setExitReason] = useState('');
  const [exitNotes, setExitNotes] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [issueRef, setIssueRef] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<string | null>(null);

  async function refresh() {
    setDetail(await offCampusApi.getPlacement(placement.id));
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
    <Sheet open onClose={onClose} title={PLACEMENT_TYPE_LABELS[detail.placementType]}>
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <p className="flex items-center gap-2 text-sm">
          <StatusPill status={detail.status} />
        </p>
        <p className="text-sm text-slate-700">
          {isStaff && `${residentNames[detail.studentId] ?? detail.studentId.slice(0, 8)} — `}
          {providerName(detail.providerId)}
        </p>
        <p className="text-xs text-slate-500">
          {detail.startDate} to {detail.endDate}
          {detail.actualExitDate && ` — exited ${detail.actualExitDate}`}
        </p>
        {detail.roomBedReference && <p className="text-xs text-slate-500">Room/bed: {detail.roomBedReference}</p>}
        {detail.decisionReason && <p className="text-xs text-slate-500">Decision: {detail.decisionReason}</p>}
        {detail.nextOccupancyConfirmationDue && <p className="text-xs text-slate-500">Next occupancy confirmation due: {detail.nextOccupancyConfirmationDue}</p>}
        {detail.issueHandoffReference && <p className="text-xs text-slate-500">Issue reference: {detail.issueHandoffReference}</p>}
        {detail.exitNotes && <p className="text-xs text-slate-500">Exit notes: {detail.exitNotes}</p>}

        {isStaff && ['requested', 'under_review'].includes(detail.status) && (
          <div className="space-y-2 border-t border-slate-200 pt-4">
            <p className="text-sm font-medium text-slate-800">Decide</p>
            <Textarea placeholder="Reason" value={decisionReason} onChange={(e) => setDecisionReason(e.target.value)} />
            <div className="flex gap-2">
              <Button size="sm" disabled={!decisionReason.trim() || Boolean(submitting)} onClick={() => void run('approve', () => offCampusApi.decidePlacement(detail.id, 'approved', decisionReason))}>
                Approve
              </Button>
              <Button size="sm" variant="danger" disabled={!decisionReason.trim() || Boolean(submitting)} onClick={() => void run('reject', () => offCampusApi.decidePlacement(detail.id, 'rejected', decisionReason))}>
                Reject
              </Button>
            </div>
          </div>
        )}

        {(isOwner || isStaff) && ['active', 'periodic_confirmation_due'].includes(detail.status) && (
          <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-4">
            <Button size="sm" disabled={Boolean(submitting)} onClick={() => void run('confirm', () => offCampusApi.confirmOccupancy(detail.id))}>
              Confirm still occupied
            </Button>
          </div>
        )}

        {(isOwner || isStaff) && ['active', 'periodic_confirmation_due'].includes(detail.status) && (
          <div className="space-y-2 border-t border-slate-200 pt-4">
            <p className="text-sm font-medium text-slate-800">Request exit</p>
            <div className="flex gap-2">
              <Input placeholder="Reason" value={exitReason} onChange={(e) => setExitReason(e.target.value)} className="flex-1" />
              <Button size="sm" variant="secondary" disabled={!exitReason.trim() || Boolean(submitting)} onClick={() => void run('exit', () => offCampusApi.requestExit(detail.id, exitReason))}>
                Request exit
              </Button>
            </div>
          </div>
        )}

        {isStaff && detail.status === 'exit_requested' && (
          <div className="space-y-2 border-t border-slate-200 pt-4">
            <p className="text-sm font-medium text-slate-800">Confirm exit</p>
            <Textarea placeholder="Exit notes (optional)" value={exitNotes} onChange={(e) => setExitNotes(e.target.value)} />
            <Button size="sm" disabled={Boolean(submitting)} onClick={() => void run('confirm-exit', () => offCampusApi.confirmExit(detail.id, exitNotes || undefined))}>
              Confirm exit
            </Button>
          </div>
        )}

        {(isOwner || isStaff) && ['requested', 'under_review', 'approved'].includes(detail.status) && (
          <div className="space-y-2 border-t border-slate-200 pt-4">
            <p className="text-sm font-medium text-slate-800">Cancel</p>
            <div className="flex gap-2">
              <Input placeholder="Reason" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} className="flex-1" />
              <Button size="sm" variant="danger" disabled={!cancelReason.trim() || Boolean(submitting)} onClick={() => void run('cancel', () => offCampusApi.cancelPlacement(detail.id, cancelReason))}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {isStaff && (
          <div className="space-y-2 border-t border-slate-200 pt-4">
            <p className="text-sm font-medium text-slate-800">Link an issue/complaint reference</p>
            <div className="flex gap-2">
              <Input placeholder="e.g. Case #1234" value={issueRef} onChange={(e) => setIssueRef(e.target.value)} className="flex-1" />
              <Button size="sm" variant="secondary" disabled={!issueRef.trim() || Boolean(submitting)} onClick={() => void run('link-issue', () => offCampusApi.linkIssueHandoff(detail.id, issueRef))}>
                Link
              </Button>
            </div>
          </div>
        )}
      </div>
    </Sheet>
  );
}

// ============================================================================
// Providers (staff-only)
// ============================================================================

function ProvidersTab() {
  const [providers, setProviders] = useState<OffCampusProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setProviders(await offCampusApi.listProviders());
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  async function decide(id: string, decision: 'approved' | 'rejected' | 'suspended') {
    setSubmitting(id);
    setError(null);
    try {
      await offCampusApi.decideProviderCompliance(id, decision, `Marked ${decision} by staff`);
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
      <div className="mb-4 flex justify-end">
        <Button onClick={() => setRegisterOpen(true)}>Register a provider</Button>
      </div>

      {loading ? (
        <PageSpinner />
      ) : providers.length === 0 ? (
        <EmptyState icon={<AlertIcon className="h-8 w-8" />} title="No providers registered" description="Register one above." />
      ) : (
        <Card>
          <ul className="divide-y divide-slate-100">
            {providers.map((p) => (
              <li key={p.id} className="space-y-1.5 px-4 py-3 sm:px-5">
                <p className="flex items-center gap-2 text-sm">
                  <span className="font-medium text-slate-800">{p.providerName}</span>
                  <StatusPill status={p.complianceStatus} />
                </p>
                <p className="text-xs text-slate-500">{p.address}</p>
                {p.complianceStatus === 'pending' && (
                  <div className="flex gap-2 pt-1">
                    <Button size="sm" disabled={Boolean(submitting)} onClick={() => void decide(p.id, 'approved')}>
                      Approve
                    </Button>
                    <Button size="sm" variant="danger" disabled={Boolean(submitting)} onClick={() => void decide(p.id, 'rejected')}>
                      Reject
                    </Button>
                  </div>
                )}
                {p.complianceStatus === 'approved' && (
                  <Button size="sm" variant="danger" disabled={Boolean(submitting)} onClick={() => void decide(p.id, 'suspended')}>
                    Suspend
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <RegisterProviderSheet open={registerOpen} onClose={() => setRegisterOpen(false)} onRegistered={load} />
    </div>
  );
}

function RegisterProviderSheet({ open, onClose, onRegistered }: { open: boolean; onClose: () => void; onRegistered: () => void }) {
  const [providerName, setProviderName] = useState('');
  const [address, setAddress] = useState('');
  const [emergencyContact, setEmergencyContact] = useState('');
  const [safetyInspectionReference, setSafetyInspectionReference] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      await offCampusApi.createProvider({ providerName, address, emergencyContact: emergencyContact || undefined, safetyInspectionReference: safetyInspectionReference || undefined });
      onRegistered();
      onClose();
      setProviderName('');
      setAddress('');
      setEmergencyContact('');
      setSafetyInspectionReference('');
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
      title="Register a provider"
      footer={
        <Button fullWidth onClick={() => void handleSubmit()} disabled={submitting || !providerName.trim() || !address.trim()}>
          {submitting ? 'Registering…' : 'Register — starts as pending compliance'}
        </Button>
      }
    >
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <FieldWrapper label="Provider name" htmlFor="pr-name" required>
          <Input id="pr-name" value={providerName} onChange={(e) => setProviderName(e.target.value)} />
        </FieldWrapper>
        <FieldWrapper label="Address" htmlFor="pr-address" required>
          <Textarea id="pr-address" value={address} onChange={(e) => setAddress(e.target.value)} />
        </FieldWrapper>
        <FieldWrapper label="Emergency contact" htmlFor="pr-emergency" hint="Optional">
          <Input id="pr-emergency" value={emergencyContact} onChange={(e) => setEmergencyContact(e.target.value)} />
        </FieldWrapper>
        <FieldWrapper label="Safety inspection reference" htmlFor="pr-safety" hint="Optional">
          <Input id="pr-safety" value={safetyInspectionReference} onChange={(e) => setSafetyInspectionReference(e.target.value)} />
        </FieldWrapper>
      </div>
    </Sheet>
  );
}
