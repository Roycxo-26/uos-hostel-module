import { useEffect, useState } from 'react';
import * as casesApi from '../api/cases';
import * as commonAreasApi from '../api/commonAreas';
import * as residenceLifeApi from '../api/residenceLife';
import * as structureApi from '../api/structure';
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
import { hasHostelRole, isPlatformAdmin, type CommonArea, type FacilityBooking, type Hostel, type ProgrammeType, type ResidenceProgramme } from '../types';

/** D17.24 (TODO.md Batch 30, item 125) — "HOSTEL V1.1.md" §24H. Facility
 * bookings run against Batch 19's existing common-area master, not a new
 * facility concept. Not staff-only — a resident requests a booking or
 * proposes a programme; deciding either stays staff-gated, except a
 * programme's own organiser (if they hold an active Floor In-charge
 * assignment for it) gets elevated day-to-day control — see
 * residenceLife/service.ts's canOperateThisProgramme. */

const PROGRAMME_TYPE_LABELS: Record<ProgrammeType, string> = {
  new_resident_orientation: 'New-Resident Orientation',
  floor_hostel_meeting: 'Floor / Hostel Meeting',
  safety_awareness: 'Safety Awareness',
  cleanliness_waste_conservation: 'Cleanliness / Waste / Conservation',
  peer_mentoring: 'Peer Mentoring',
  study_support_session: 'Study / Support Session',
  sports_recreation: 'Sports / Recreation',
  cultural_social: 'Cultural / Social',
  volunteer_community_service: 'Volunteer / Community Service',
  resident_committee_meeting: 'Resident Committee Meeting',
  other: 'Other',
};

type Tab = 'bookings' | 'programmes';

function useResidentNames(): Record<string, string> {
  const [names, setNames] = useState<Record<string, string>>({});
  useEffect(() => {
    void casesApi.listResidentDirectory().then((residents) => {
      setNames(Object.fromEntries(residents.map((r) => [r.id, r.name])));
    });
  }, []);
  return names;
}

export function ResidenceLife() {
  const { me } = useAuth();
  const isStaff = isPlatformAdmin(me) || hasHostelRole(me, 'warden');
  const [tab, setTab] = useState<Tab>('bookings');

  return (
    <div>
      <PageHeader title="Residence Life" description="Community programmes and shared-facility bookings." />

      <div className="mb-6 flex gap-1 border-b border-slate-200">
        {(
          [
            ['bookings', 'Facility Bookings'],
            ['programmes', 'Programmes'],
          ] as [Tab, string][]
        ).map(([value, label]) => (
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

      {tab === 'bookings' && <BookingsTab isStaff={isStaff} currentUserId={me?.sub} />}
      {tab === 'programmes' && <ProgrammesTab isStaff={isStaff} currentUserId={me?.sub} />}
    </div>
  );
}

// ============================================================================
// Facility bookings
// ============================================================================

function BookingsTab({ isStaff, currentUserId }: { isStaff: boolean; currentUserId: string | undefined }) {
  const [bookings, setBookings] = useState<FacilityBooking[]>([]);
  const [areas, setAreas] = useState<CommonArea[]>([]);
  const [loading, setLoading] = useState(true);
  const [requestOpen, setRequestOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const [b, a] = await Promise.all([residenceLifeApi.listBookings(), commonAreasApi.listCommonAreas()]);
    setBookings(b);
    setAreas(a);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  const areaName = (id: string) => areas.find((a) => a.id === id)?.name ?? id.slice(0, 8);

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => setRequestOpen(true)} disabled={areas.length === 0}>
          Request a booking
        </Button>
      </div>

      {loading ? (
        <PageSpinner />
      ) : bookings.length === 0 ? (
        <EmptyState icon={<AlertIcon className="h-8 w-8" />} title="No facility bookings" description="Request one above." />
      ) : (
        <Card>
          <ul className="divide-y divide-slate-100">
            {bookings.map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setDetailId(b.id)}>
                  <p className="flex items-center gap-2 text-sm">
                    <span className="font-medium text-slate-800">{areaName(b.commonAreaId)}</span>
                    <StatusPill status={b.status} />
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {new Date(b.startAt).toLocaleString()} – {new Date(b.endAt).toLocaleTimeString()} — {b.purpose}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <RequestBookingSheet open={requestOpen} onClose={() => setRequestOpen(false)} onRequested={load} areas={areas} />
      {detailId && <BookingDetailSheet id={detailId} isStaff={isStaff} currentUserId={currentUserId} areaName={areaName} onClose={() => setDetailId(null)} onChanged={load} />}
    </div>
  );
}

function RequestBookingSheet({ open, onClose, onRequested, areas }: { open: boolean; onClose: () => void; onRequested: () => void; areas: CommonArea[] }) {
  const [commonAreaId, setCommonAreaId] = useState('');
  const [purpose, setPurpose] = useState('');
  const [startAt, setStartAt] = useState('');
  const [endAt, setEndAt] = useState('');
  const [attendeeCount, setAttendeeCount] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      await residenceLifeApi.requestBooking({
        commonAreaId,
        purpose,
        startAt: new Date(startAt).toISOString(),
        endAt: new Date(endAt).toISOString(),
        attendeeCount: attendeeCount ? Number(attendeeCount) : undefined,
      });
      onRequested();
      onClose();
      setPurpose('');
      setStartAt('');
      setEndAt('');
      setAttendeeCount('');
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
      title="Request a facility booking"
      footer={
        <Button fullWidth onClick={() => void handleSubmit()} disabled={submitting || !commonAreaId || !purpose.trim() || !startAt || !endAt}>
          {submitting ? 'Requesting…' : 'Request'}
        </Button>
      }
    >
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <FieldWrapper label="Facility" htmlFor="fb-area" required>
          <Select id="fb-area" value={commonAreaId} onChange={(e) => setCommonAreaId(e.target.value)}>
            <option value="">Select a facility…</option>
            {areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.status})
              </option>
            ))}
          </Select>
        </FieldWrapper>
        <FieldWrapper label="Purpose" htmlFor="fb-purpose" required>
          <Textarea id="fb-purpose" value={purpose} onChange={(e) => setPurpose(e.target.value)} />
        </FieldWrapper>
        <div className="grid grid-cols-2 gap-3">
          <FieldWrapper label="Start" htmlFor="fb-start" required>
            <Input id="fb-start" type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} />
          </FieldWrapper>
          <FieldWrapper label="End" htmlFor="fb-end" required>
            <Input id="fb-end" type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} />
          </FieldWrapper>
        </div>
        <FieldWrapper label="Expected attendees" htmlFor="fb-attendees" hint="Optional">
          <Input id="fb-attendees" type="number" min={1} value={attendeeCount} onChange={(e) => setAttendeeCount(e.target.value)} />
        </FieldWrapper>
      </div>
    </Sheet>
  );
}

function BookingDetailSheet({
  id,
  isStaff,
  currentUserId,
  areaName,
  onClose,
  onChanged,
}: {
  id: string;
  isStaff: boolean;
  currentUserId: string | undefined;
  areaName: (id: string) => string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState<FacilityBooking | null>(null);
  const [decisionReason, setDecisionReason] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [damageRef, setDamageRef] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<string | null>(null);

  async function refresh() {
    setDetail(await residenceLifeApi.getBooking(id));
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
      <Sheet open onClose={onClose} title="Booking">
        <PageSpinner />
      </Sheet>
    );
  }

  const isOwner = detail.requestedBy === currentUserId;

  return (
    <Sheet open onClose={onClose} title={areaName(detail.commonAreaId)}>
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <p>
          <StatusPill status={detail.status} />
        </p>
        <p className="text-sm text-slate-700">{detail.purpose}</p>
        <p className="text-xs text-slate-500">
          {new Date(detail.startAt).toLocaleString()} – {new Date(detail.endAt).toLocaleTimeString()}
        </p>
        {detail.decisionReason && <p className="text-xs text-slate-500">Decision: {detail.decisionReason}</p>}
        {detail.damageIncidentReference && <p className="text-xs text-rose-600">Damage/incident: {detail.damageIncidentReference}</p>}

        {isStaff && detail.status === 'requested' && (
          <div className="space-y-2 border-t border-slate-200 pt-4">
            <p className="text-sm font-medium text-slate-800">Decide</p>
            <Textarea placeholder="Reason" value={decisionReason} onChange={(e) => setDecisionReason(e.target.value)} />
            <div className="flex gap-2">
              <Button size="sm" disabled={!decisionReason.trim() || Boolean(submitting)} onClick={() => void run('approve', () => residenceLifeApi.decideBooking(detail.id, 'approved', decisionReason))}>
                Approve
              </Button>
              <Button size="sm" variant="danger" disabled={!decisionReason.trim() || Boolean(submitting)} onClick={() => void run('reject', () => residenceLifeApi.decideBooking(detail.id, 'rejected', decisionReason))}>
                Reject
              </Button>
            </div>
          </div>
        )}

        {(isOwner || isStaff) && detail.status === 'approved' && (
          <div className="border-t border-slate-200 pt-4">
            <Button size="sm" disabled={Boolean(submitting)} onClick={() => void run('checkin', () => residenceLifeApi.checkInBooking(detail.id))}>
              Check in
            </Button>
          </div>
        )}

        {isStaff && detail.status === 'checked_in' && (
          <div className="border-t border-slate-200 pt-4">
            <Button size="sm" disabled={Boolean(submitting)} onClick={() => void run('complete', () => residenceLifeApi.completeBooking(detail.id))}>
              Complete
            </Button>
          </div>
        )}

        {(isOwner || isStaff) && ['requested', 'approved'].includes(detail.status) && (
          <div className="space-y-2 border-t border-slate-200 pt-4">
            <p className="text-sm font-medium text-slate-800">Cancel</p>
            <div className="flex gap-2">
              <Input placeholder="Reason" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} className="flex-1" />
              <Button size="sm" variant="danger" disabled={!cancelReason.trim() || Boolean(submitting)} onClick={() => void run('cancel', () => residenceLifeApi.cancelBooking(detail.id, cancelReason))}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {isStaff && (
          <div className="space-y-2 border-t border-slate-200 pt-4">
            <p className="text-sm font-medium text-slate-800">Record a damage/incident reference</p>
            <div className="flex gap-2">
              <Input placeholder="e.g. Case #1234" value={damageRef} onChange={(e) => setDamageRef(e.target.value)} className="flex-1" />
              <Button size="sm" variant="secondary" disabled={!damageRef.trim() || Boolean(submitting)} onClick={() => void run('damage', () => residenceLifeApi.recordDamageIncident(detail.id, damageRef))}>
                Record
              </Button>
            </div>
          </div>
        )}

        {isStaff && ['completed', 'cancelled', 'no_show'].includes(detail.status) && (
          <div className="border-t border-slate-200 pt-4">
            <Button size="sm" variant="secondary" disabled={Boolean(submitting)} onClick={() => void run('close', () => residenceLifeApi.closeBooking(detail.id))}>
              Close
            </Button>
          </div>
        )}
      </div>
    </Sheet>
  );
}

// ============================================================================
// Programmes
// ============================================================================

function ProgrammesTab({ isStaff, currentUserId }: { isStaff: boolean; currentUserId: string | undefined }) {
  const residentNames = useResidentNames();
  const [programmes, setProgrammes] = useState<ResidenceProgramme[]>([]);
  const [hostels, setHostels] = useState<Hostel[]>([]);
  const [loading, setLoading] = useState(true);
  const [proposeOpen, setProposeOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const [p, h] = await Promise.all([residenceLifeApi.listProgrammes(), structureApi.listHostels()]);
    setProgrammes(p);
    setHostels(h);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => setProposeOpen(true)}>Propose a programme</Button>
      </div>

      {loading ? (
        <PageSpinner />
      ) : programmes.length === 0 ? (
        <EmptyState icon={<AlertIcon className="h-8 w-8" />} title="No programmes" description="Propose one above." />
      ) : (
        <Card>
          <ul className="divide-y divide-slate-100">
            {programmes.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setDetailId(p.id)}>
                  <p className="flex items-center gap-2 text-sm">
                    <span className="font-medium text-slate-800">{PROGRAMME_TYPE_LABELS[p.programmeType]}</span>
                    <StatusPill status={p.status} />
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Organiser: {residentNames[p.organiserUserId] ?? p.organiserUserId.slice(0, 8)} — {new Date(p.scheduledAt).toLocaleString()}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <ProposeProgrammeSheet open={proposeOpen} onClose={() => setProposeOpen(false)} onProposed={load} hostels={hostels} />
      {detailId && (
        <ProgrammeDetailSheet id={detailId} isStaff={isStaff} currentUserId={currentUserId} residentNames={residentNames} onClose={() => setDetailId(null)} onChanged={load} />
      )}
    </div>
  );
}

function ProposeProgrammeSheet({ open, onClose, onProposed, hostels }: { open: boolean; onClose: () => void; onProposed: () => void; hostels: Hostel[] }) {
  const [programmeType, setProgrammeType] = useState<ProgrammeType>('floor_hostel_meeting');
  const [targetScopeType, setTargetScopeType] = useState<'hostel' | 'floor'>('hostel');
  const [targetScopeId, setTargetScopeId] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [location, setLocation] = useState('');
  const [registrationRequired, setRegistrationRequired] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (targetScopeType === 'hostel' && hostels[0]?.id) setTargetScopeId(hostels[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetScopeType, hostels]);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      await residenceLifeApi.proposeProgramme({
        programmeType,
        targetScopeType,
        targetScopeId,
        scheduledAt: new Date(scheduledAt).toISOString(),
        location: location || undefined,
        registrationRequired,
      });
      onProposed();
      onClose();
      setLocation('');
      setScheduledAt('');
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
      title="Propose a programme"
      footer={
        <Button fullWidth onClick={() => void handleSubmit()} disabled={submitting || !targetScopeId || !scheduledAt}>
          {submitting ? 'Proposing…' : 'Propose'}
        </Button>
      }
    >
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <FieldWrapper label="Type" htmlFor="pp-type">
          <Select id="pp-type" value={programmeType} onChange={(e) => setProgrammeType(e.target.value as ProgrammeType)}>
            {Object.entries(PROGRAMME_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </FieldWrapper>
        <FieldWrapper label="Target scope" htmlFor="pp-scopetype">
          <Select id="pp-scopetype" value={targetScopeType} onChange={(e) => setTargetScopeType(e.target.value as 'hostel' | 'floor')}>
            <option value="hostel">Whole hostel</option>
            <option value="floor">One floor</option>
          </Select>
        </FieldWrapper>
        {targetScopeType === 'hostel' ? (
          <FieldWrapper label="Hostel" htmlFor="pp-hostel" required>
            <Select id="pp-hostel" value={targetScopeId} onChange={(e) => setTargetScopeId(e.target.value)}>
              {hostels.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </Select>
          </FieldWrapper>
        ) : (
          <FieldWrapper label="Floor ID" htmlFor="pp-floor" required hint="Paste the floor's ID">
            <Input id="pp-floor" value={targetScopeId} onChange={(e) => setTargetScopeId(e.target.value)} />
          </FieldWrapper>
        )}
        <FieldWrapper label="Scheduled at" htmlFor="pp-time" required>
          <Input id="pp-time" type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
        </FieldWrapper>
        <FieldWrapper label="Location" htmlFor="pp-location" hint="Optional">
          <Input id="pp-location" value={location} onChange={(e) => setLocation(e.target.value)} />
        </FieldWrapper>
        <label className="flex min-h-touch cursor-pointer items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={registrationRequired} onChange={(e) => setRegistrationRequired(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-accent" />
          Requires registration
        </label>
      </div>
    </Sheet>
  );
}

function ProgrammeDetailSheet({
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
  const [detail, setDetail] = useState<ResidenceProgramme | null>(null);
  const [decisionReason, setDecisionReason] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [outcomeNotes, setOutcomeNotes] = useState('');
  const [attendStudentId, setAttendStudentId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<string | null>(null);

  async function refresh() {
    setDetail(await residenceLifeApi.getProgramme(id));
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
      <Sheet open onClose={onClose} title="Programme">
        <PageSpinner />
      </Sheet>
    );
  }

  const isOrganiser = detail.organiserUserId === currentUserId;
  const canOperate = isStaff || isOrganiser;
  const participants = detail.participants ?? [];

  return (
    <Sheet open onClose={onClose} title={PROGRAMME_TYPE_LABELS[detail.programmeType]}>
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <p>
          <StatusPill status={detail.status} />
        </p>
        <p className="text-xs text-slate-500">
          Organiser: {residentNames[detail.organiserUserId] ?? detail.organiserUserId.slice(0, 8)} — {new Date(detail.scheduledAt).toLocaleString()}
          {detail.location && ` — ${detail.location}`}
        </p>
        {detail.decisionReason && <p className="text-xs text-slate-500">Decision: {detail.decisionReason}</p>}
        {detail.outcomeNotes && <p className="text-xs text-slate-500">Outcome: {detail.outcomeNotes}</p>}
        {detail.registrationRequired && <p className="text-xs text-slate-500">{participants.length} registered</p>}

        {isStaff && detail.status === 'requested' && (
          <div className="space-y-2 border-t border-slate-200 pt-4">
            <p className="text-sm font-medium text-slate-800">Decide</p>
            <Textarea placeholder="Reason" value={decisionReason} onChange={(e) => setDecisionReason(e.target.value)} />
            <div className="flex gap-2">
              <Button size="sm" disabled={!decisionReason.trim() || Boolean(submitting)} onClick={() => void run('approve', () => residenceLifeApi.decideProgramme(detail.id, 'approved', decisionReason))}>
                Approve
              </Button>
              <Button size="sm" variant="danger" disabled={!decisionReason.trim() || Boolean(submitting)} onClick={() => void run('reject', () => residenceLifeApi.decideProgramme(detail.id, 'rejected', decisionReason))}>
                Reject
              </Button>
            </div>
          </div>
        )}

        {!isStaff && !isOrganiser && detail.registrationRequired && ['approved', 'in_progress'].includes(detail.status) && (
          <div className="border-t border-slate-200 pt-4">
            <Button size="sm" disabled={Boolean(submitting)} onClick={() => void run('register', () => residenceLifeApi.registerForProgramme(detail.id))}>
              Register
            </Button>
          </div>
        )}

        {canOperate && detail.status === 'approved' && (
          <div className="border-t border-slate-200 pt-4">
            <Button size="sm" disabled={Boolean(submitting)} onClick={() => void run('start', () => residenceLifeApi.startProgramme(detail.id))}>
              Start
            </Button>
          </div>
        )}

        {canOperate && detail.status === 'in_progress' && (
          <div className="space-y-2 border-t border-slate-200 pt-4">
            <p className="text-sm font-medium text-slate-800">Complete</p>
            <Textarea placeholder="Outcome notes (optional)" value={outcomeNotes} onChange={(e) => setOutcomeNotes(e.target.value)} />
            <Button size="sm" disabled={Boolean(submitting)} onClick={() => void run('complete', () => residenceLifeApi.completeProgramme(detail.id, outcomeNotes || undefined))}>
              Mark completed
            </Button>
            {detail.registrationRequired && (
              <div className="flex gap-2 pt-1">
                <Input placeholder="Resident ID to mark present" value={attendStudentId} onChange={(e) => setAttendStudentId(e.target.value)} className="flex-1" />
                <Button size="sm" variant="secondary" disabled={!attendStudentId.trim() || Boolean(submitting)} onClick={() => void run('attend', () => residenceLifeApi.markAttendance(detail.id, attendStudentId, true))}>
                  Mark present
                </Button>
              </div>
            )}
          </div>
        )}

        {(canOperate || detail.createdBy === currentUserId) && ['requested', 'approved', 'in_progress'].includes(detail.status) && (
          <div className="space-y-2 border-t border-slate-200 pt-4">
            <p className="text-sm font-medium text-slate-800">Cancel</p>
            <div className="flex gap-2">
              <Input placeholder="Reason" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} className="flex-1" />
              <Button size="sm" variant="danger" disabled={!cancelReason.trim() || Boolean(submitting)} onClick={() => void run('cancel', () => residenceLifeApi.cancelProgramme(detail.id, cancelReason))}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    </Sheet>
  );
}
