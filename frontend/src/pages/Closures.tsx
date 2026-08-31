import { useEffect, useState } from 'react';
import * as casesApi from '../api/cases';
import * as closuresApi from '../api/closures';
import * as guestStaysApi from '../api/guestStays';
import * as structureApi from '../api/structure';
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
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
import { AlertIcon, BuildingIcon } from '../design-system/icons';
import { errorMessage } from '../lib/errorMessage';
import type {
  ClosureCase,
  ClosureCaseType,
  ClosureReasonCategory,
  ClosureScopeType,
  GuestStay,
  GuestType,
  Hostel,
  HostelTree,
} from '../types';

/** HOSTEL-GAP-ANALYSIS.md D17.25 (TODO.md Batch 22) — hostel shutdown/
 * reopening, mass relocation, and guest/parent short-stay. One page, two
 * tabs — same "conceptually related, one nav item" consolidation
 * DutyRoster.tsx already applies to Duty Roster + Notices + Emergency Card.
 * Staff-only throughout (route-guarded in App.tsx). */

const REASON_CATEGORIES: ClosureReasonCategory[] = [
  'semester_vacation',
  'maintenance_renovation',
  'safety',
  'pest_treatment',
  'low_occupancy_consolidation',
  'emergency',
  'event_operational',
  'water_sanitation_failure',
  'structural_work',
  'disaster',
];

const REOPENING_CHECKLIST_LABELS: Record<string, string> = {
  facilities_safety_readiness: 'Facilities & safety readiness',
  water_electricity_sanitation: 'Water / electricity / sanitation verified',
  housekeeping_pest_readiness: 'Housekeeping & pest readiness',
  room_bed_inventory_inspection: 'Room / bed / inventory inspection',
  keys_access_prepared: 'Keys & access prepared',
  meal_service_readiness: 'Meal / service readiness',
  duty_roster_front_desk_ready: 'Duty roster / front desk ready',
  resident_return_schedule: 'Resident return schedule set',
};
const REOPENING_CHECKLIST_KEYS = Object.keys(REOPENING_CHECKLIST_LABELS);

function humanize(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

interface FlatOption {
  id: string;
  label: string;
}
interface FlatBed extends FlatOption {
  status: string;
  bedCategory: string;
}

function flattenTree(tree: HostelTree | null): { floors: FlatOption[]; rooms: FlatOption[]; beds: FlatBed[] } {
  const floors: FlatOption[] = [];
  const rooms: FlatOption[] = [];
  const beds: FlatBed[] = [];
  for (const block of tree?.blocks ?? []) {
    for (const floor of block.floors) {
      floors.push({ id: floor.id, label: `${block.code} — Floor ${floor.number}` });
      for (const room of floor.rooms) {
        rooms.push({ id: room.id, label: `${block.code}-${floor.number}-${room.code}` });
        for (const bed of room.beds) {
          beds.push({ id: bed.id, label: `${block.code}-${floor.number}-${room.code}-${bed.code}`, status: bed.status, bedCategory: bed.bedCategory });
        }
      }
    }
  }
  return { floors, rooms, beds };
}

type Tab = 'cases' | 'guest-stays';

export function Closures() {
  const [tab, setTab] = useState<Tab>('cases');
  const [hostels, setHostels] = useState<Hostel[]>([]);

  useEffect(() => {
    void structureApi.listHostels().then(setHostels);
  }, []);

  return (
    <div>
      <PageHeader title="Closures &amp; Guest Stays" description="Hostel shutdown, reopening, mass relocation, and guest/parent short-stay bookings." />

      <div className="mb-6 flex gap-1 border-b border-slate-200">
        {(
          [
            ['cases', 'Closure Cases'],
            ['guest-stays', 'Guest Stays'],
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

      {tab === 'cases' && <CasesTab hostels={hostels} />}
      {tab === 'guest-stays' && <GuestStaysTab hostels={hostels} />}
    </div>
  );
}

// ============================================================================
// Closure cases
// ============================================================================

function CasesTab({ hostels }: { hostels: Hostel[] }) {
  const [cases, setCases] = useState<ClosureCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [target, setTarget] = useState<ClosureCase | null>(null);

  async function load() {
    setLoading(true);
    setCases(await closuresApi.listClosureCases());
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => setCreateOpen(true)} disabled={hostels.length === 0}>
          Propose a case
        </Button>
      </div>

      {loading ? (
        <PageSpinner />
      ) : cases.length === 0 ? (
        <EmptyState icon={<BuildingIcon className="h-8 w-8" />} title="No closure cases" description="Propose a shutdown or mass relocation case above." />
      ) : (
        <Card>
          <ul className="divide-y divide-slate-100">
            {cases.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setTarget(c)}>
                  <p className="flex items-center gap-2 text-sm">
                    <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                      {c.caseType === 'shutdown' ? 'Shutdown' : 'Mass Relocation'}
                    </span>
                    <StatusPill status={c.status} domain="closure" />
                    <span className="text-slate-500">{c.scopeType}</span>
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">{humanize(c.reasonCategory)}</p>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {createOpen && <CreateCaseSheet hostels={hostels} onClose={() => setCreateOpen(false)} onCreated={load} />}
      {target && <CaseDetailSheet closureCase={target} onClose={() => setTarget(null)} onChanged={load} />}
    </div>
  );
}

function CreateCaseSheet({ hostels, onClose, onCreated }: { hostels: Hostel[]; onClose: () => void; onCreated: () => void }) {
  const [hostelId, setHostelId] = useState(hostels[0]?.id ?? '');
  const [tree, setTree] = useState<HostelTree | null>(null);
  const [caseType, setCaseType] = useState<ClosureCaseType>('shutdown');
  const [scopeType, setScopeType] = useState<ClosureScopeType>('hostel');
  const [scopeId, setScopeId] = useState('');
  const [reasonCategory, setReasonCategory] = useState<ClosureReasonCategory>('semester_vacation');
  const [reasonNotes, setReasonNotes] = useState('');
  const [plannedStartDate, setPlannedStartDate] = useState('');
  const [plannedEndDate, setPlannedEndDate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!hostelId) return;
    void structureApi.getHostelTree(hostelId).then((t) => {
      setTree(t);
      setScopeId(scopeType === 'hostel' ? hostelId : '');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hostelId]);

  useEffect(() => {
    setScopeId(scopeType === 'hostel' ? hostelId : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeType]);

  const { floors, rooms } = flattenTree(tree);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      await closuresApi.createClosureCase({
        hostelId,
        caseType,
        scopeType,
        scopeId,
        reasonCategory,
        reasonNotes: reasonNotes || undefined,
        plannedStartDate: plannedStartDate || undefined,
        plannedEndDate: plannedEndDate || undefined,
      });
      onCreated();
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
      title="Propose a closure case"
      footer={
        <Button fullWidth onClick={() => void handleSubmit()} disabled={submitting || !hostelId || !scopeId}>
          {submitting ? 'Proposing…' : 'Propose case'}
        </Button>
      }
    >
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <FieldWrapper label="Hostel" htmlFor="cc-hostel">
          <Select id="cc-hostel" value={hostelId} onChange={(e) => setHostelId(e.target.value)}>
            {hostels.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
          </Select>
        </FieldWrapper>
        <FieldWrapper label="Case type" htmlFor="cc-type">
          <Select id="cc-type" value={caseType} onChange={(e) => setCaseType(e.target.value as ClosureCaseType)}>
            <option value="shutdown">Shutdown (with reopening)</option>
            <option value="mass_relocation">Mass relocation</option>
          </Select>
        </FieldWrapper>
        <FieldWrapper label="Scope" htmlFor="cc-scope">
          <Select id="cc-scope" value={scopeType} onChange={(e) => setScopeType(e.target.value as ClosureScopeType)}>
            <option value="hostel">Whole hostel</option>
            <option value="floor">One floor</option>
            <option value="room">One room</option>
          </Select>
        </FieldWrapper>
        {scopeType === 'floor' && (
          <FieldWrapper label="Floor" htmlFor="cc-floor">
            <Select id="cc-floor" value={scopeId} onChange={(e) => setScopeId(e.target.value)}>
              <option value="">Select a floor…</option>
              {floors.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </Select>
          </FieldWrapper>
        )}
        {scopeType === 'room' && (
          <FieldWrapper label="Room" htmlFor="cc-room">
            <Select id="cc-room" value={scopeId} onChange={(e) => setScopeId(e.target.value)}>
              <option value="">Select a room…</option>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </Select>
          </FieldWrapper>
        )}
        <FieldWrapper label="Reason" htmlFor="cc-reason">
          <Select id="cc-reason" value={reasonCategory} onChange={(e) => setReasonCategory(e.target.value as ClosureReasonCategory)}>
            {REASON_CATEGORIES.map((r) => (
              <option key={r} value={r}>
                {humanize(r)}
              </option>
            ))}
          </Select>
        </FieldWrapper>
        <FieldWrapper label="Notes" htmlFor="cc-notes" hint="Optional">
          <Textarea id="cc-notes" value={reasonNotes} onChange={(e) => setReasonNotes(e.target.value)} />
        </FieldWrapper>
        <div className="grid grid-cols-2 gap-3">
          <FieldWrapper label="Planned start" htmlFor="cc-start" hint="Optional">
            <Input id="cc-start" type="date" value={plannedStartDate} onChange={(e) => setPlannedStartDate(e.target.value)} />
          </FieldWrapper>
          <FieldWrapper label="Planned end" htmlFor="cc-end" hint="Optional">
            <Input id="cc-end" type="date" value={plannedEndDate} onChange={(e) => setPlannedEndDate(e.target.value)} />
          </FieldWrapper>
        </div>
      </div>
    </Sheet>
  );
}

function CaseDetailSheet({ closureCase, onClose, onChanged }: { closureCase: ClosureCase; onClose: () => void; onChanged: () => void }) {
  const residentNames = useResidentNames();
  const [c, setC] = useState<ClosureCase>(closureCase);
  const [decisionReason, setDecisionReason] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [destinationBedByImpact, setDestinationBedByImpact] = useState<Record<string, string>>({});
  const [tree, setTree] = useState<HostelTree | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<string | null>(null);

  async function reload() {
    setC(await closuresApi.getClosureCase(closureCase.id));
  }

  useEffect(() => {
    void reload();
    void structureApi.getHostelTree(closureCase.hostelId).then(setTree);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closureCase.id]);

  async function run(action: string, fn: () => Promise<unknown>) {
    setSubmitting(action);
    setError(null);
    try {
      await fn();
      await reload();
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(null);
    }
  }

  const { beds } = flattenTree(tree);
  const availableResidentBeds = beds.filter((b) => b.status === 'available' && b.bedCategory === 'resident');
  const pendingImpacts = (c.impacts ?? []).filter((i) => i.outcome === 'pending');
  const checklist = c.reopeningChecklist ?? {};

  return (
    <Sheet open onClose={onClose} title={c.caseType === 'shutdown' ? 'Shutdown case' : 'Mass relocation case'}>
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <p className="text-sm text-slate-600">
          <StatusPill status={c.status} domain="closure" /> — {c.scopeType} — {humanize(c.reasonCategory)}
        </p>
        {c.reasonNotes && <p className="text-sm text-slate-700">{c.reasonNotes}</p>}

        {c.status === 'proposed' && (
          <div className="space-y-2">
            <FieldWrapper label="Decision reason" htmlFor="cd-reason">
              <Input id="cd-reason" value={decisionReason} onChange={(e) => setDecisionReason(e.target.value)} />
            </FieldWrapper>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => void run('approve', () => closuresApi.decideClosureCase(c.id, 'approved', decisionReason))}
                disabled={!decisionReason.trim() || Boolean(submitting)}
              >
                Approve
              </Button>
              <Button
                size="sm"
                variant="danger"
                onClick={() => void run('reject', () => closuresApi.decideClosureCase(c.id, 'rejected', decisionReason))}
                disabled={!decisionReason.trim() || Boolean(submitting)}
              >
                Reject
              </Button>
            </div>
          </div>
        )}

        {c.status === 'approved' && (
          <Button size="sm" onClick={() => void run('start', () => closuresApi.startClosureCase(c.id))} disabled={Boolean(submitting)}>
            {submitting === 'start' ? 'Starting…' : 'Start closure — populate affected residents'}
          </Button>
        )}

        {['proposed', 'approved'].includes(c.status) && (
          <FieldWrapper label="Cancel reason" htmlFor="cd-cancel">
            <div className="flex gap-2">
              <Input id="cd-cancel" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} className="flex-1" />
              <Button
                size="sm"
                variant="danger"
                onClick={() => void run('cancel', () => closuresApi.cancelClosureCase(c.id, cancelReason))}
                disabled={!cancelReason.trim() || Boolean(submitting)}
              >
                Cancel
              </Button>
            </div>
          </FieldWrapper>
        )}

        {['active_closure', 'reopening_planned'].includes(c.status) && (
          <>
            <p className="text-sm font-medium text-slate-900">
              Affected residents ({(c.impacts ?? []).length}) — {pendingImpacts.length} pending
            </p>
            <ul className="max-h-56 space-y-2 overflow-y-auto">
              {(c.impacts ?? []).map((impact) => (
                <li key={impact.id} className="rounded-lg border border-slate-200 p-2.5 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span>{residentNames[impact.studentId] ?? impact.studentId.slice(0, 8)}</span>
                    <StatusPill status={impact.outcome} />
                  </div>
                  {impact.outcome === 'pending' && (
                    <div className="mt-2 space-y-2">
                      <Select
                        value={destinationBedByImpact[impact.id] ?? ''}
                        onChange={(e) => setDestinationBedByImpact((prev) => ({ ...prev, [impact.id]: e.target.value }))}
                      >
                        <option value="">Select a destination bed to relocate…</option>
                        {availableResidentBeds.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.label}
                          </option>
                        ))}
                      </Select>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          disabled={!destinationBedByImpact[impact.id] || Boolean(submitting)}
                          onClick={() =>
                            void run(`resolve-${impact.id}`, () =>
                              closuresApi.resolveImpact(impact.id, { outcome: 'relocated', destinationBedId: destinationBedByImpact[impact.id] })
                            )
                          }
                        >
                          Relocate
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={Boolean(submitting)}
                          onClick={() => void run(`resolve-${impact.id}`, () => closuresApi.resolveImpact(impact.id, { outcome: 'checked_out' }))}
                        >
                          Checked out
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={Boolean(submitting)}
                          onClick={() => void run(`resolve-${impact.id}`, () => closuresApi.resolveImpact(impact.id, { outcome: 'on_leave' }))}
                        >
                          On leave
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          disabled={Boolean(submitting)}
                          onClick={() =>
                            void run(`resolve-${impact.id}`, () => closuresApi.resolveImpact(impact.id, { outcome: 'exception_no_destination' }))
                          }
                        >
                          No destination
                        </Button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>

            {c.caseType === 'shutdown' && (
              <>
                <p className="text-sm font-medium text-slate-900">Reopening checklist</p>
                <ul className="space-y-1.5">
                  {REOPENING_CHECKLIST_KEYS.map((key) => (
                    <li key={key} className="flex items-center justify-between gap-2 text-sm">
                      <label className="flex min-h-touch cursor-pointer items-center gap-2">
                        <input
                          type="checkbox"
                          checked={Boolean(checklist[key]?.completed)}
                          onChange={(e) => void run(`checklist-${key}`, () => closuresApi.updateReopeningChecklist(c.id, key, e.target.checked))}
                          disabled={Boolean(submitting)}
                          className="h-4 w-4 rounded border-slate-300 text-accent"
                        />
                        {REOPENING_CHECKLIST_LABELS[key]}
                      </label>
                    </li>
                  ))}
                </ul>
              </>
            )}

            <Button fullWidth onClick={() => void run('complete', () => closuresApi.completeClosureCase(c.id))} disabled={Boolean(submitting)}>
              {submitting === 'complete' ? 'Completing…' : c.caseType === 'shutdown' ? 'Complete reopening' : 'Complete case'}
            </Button>
          </>
        )}

        {['reopened', 'completed', 'rejected', 'cancelled'].includes(c.status) && c.decisionReason && (
          <p className="text-sm text-slate-600">{c.decisionReason}</p>
        )}
      </div>
    </Sheet>
  );
}

function useResidentNames(): Record<string, string> {
  const [names, setNames] = useState<Record<string, string>>({});
  useEffect(() => {
    void casesApi.listResidentDirectory().then((residents) => {
      setNames(Object.fromEntries(residents.map((r) => [r.id, r.name])));
    });
  }, []);
  return names;
}

// ============================================================================
// Guest stays
// ============================================================================

function GuestStaysTab({ hostels }: { hostels: Hostel[] }) {
  const [stays, setStays] = useState<GuestStay[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [target, setTarget] = useState<GuestStay | null>(null);

  async function load() {
    setLoading(true);
    setStays(await guestStaysApi.listGuestStays());
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => setCreateOpen(true)} disabled={hostels.length === 0}>
          Reserve a guest stay
        </Button>
      </div>

      {loading ? (
        <PageSpinner />
      ) : stays.length === 0 ? (
        <EmptyState
          icon={<AlertIcon className="h-8 w-8" />}
          title="No guest stays"
          description="Reserve a guest/parent short-stay above. A bed must be tagged 'guest_short_stay' in Structure first."
        />
      ) : (
        <Card>
          <ul className="divide-y divide-slate-100">
            {stays.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setTarget(s)}>
                  <p className="flex items-center gap-2 text-sm">
                    <span className="font-medium text-slate-900">{s.guestName}</span>
                    <StatusPill status={s.status} />
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {humanize(s.guestType)} — {s.arrivalDate}
                    {s.departureDate ? ` → ${s.departureDate}` : ''}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {createOpen && <CreateGuestStaySheet hostels={hostels} onClose={() => setCreateOpen(false)} onCreated={load} />}
      {target && <GuestStayDetailSheet guestStay={target} onClose={() => setTarget(null)} onChanged={load} />}
    </div>
  );
}

function CreateGuestStaySheet({ hostels, onClose, onCreated }: { hostels: Hostel[]; onClose: () => void; onCreated: () => void }) {
  const [hostelId, setHostelId] = useState(hostels[0]?.id ?? '');
  const [tree, setTree] = useState<HostelTree | null>(null);
  const [bedId, setBedId] = useState('');
  const [guestName, setGuestName] = useState('');
  const [guestType, setGuestType] = useState<GuestType>('parent');
  const [hostReference, setHostReference] = useState('');
  const [purpose, setPurpose] = useState('');
  const [arrivalDate, setArrivalDate] = useState('');
  const [departureDate, setDepartureDate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!hostelId) return;
    void structureApi.getHostelTree(hostelId).then(setTree);
  }, [hostelId]);

  const { beds } = flattenTree(tree);
  const guestBeds = beds.filter((b) => b.bedCategory === 'guest_short_stay' && b.status === 'available');

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      await guestStaysApi.createGuestStay({
        bedId,
        guestName,
        guestType,
        hostReference: hostReference || undefined,
        purpose: purpose || undefined,
        arrivalDate,
        departureDate: departureDate || undefined,
      });
      onCreated();
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
      title="Reserve a guest stay"
      footer={
        <Button fullWidth onClick={() => void handleSubmit()} disabled={submitting || !bedId || !guestName.trim() || !arrivalDate}>
          {submitting ? 'Reserving…' : 'Reserve'}
        </Button>
      }
    >
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <FieldWrapper label="Hostel" htmlFor="gs-hostel">
          <Select id="gs-hostel" value={hostelId} onChange={(e) => setHostelId(e.target.value)}>
            {hostels.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
          </Select>
        </FieldWrapper>
        <FieldWrapper label="Guest short-stay bed" htmlFor="gs-bed" hint={guestBeds.length === 0 ? 'No guest-category bed available — tag one as "guest_short_stay" in Structure first' : undefined}>
          <Select id="gs-bed" value={bedId} onChange={(e) => setBedId(e.target.value)}>
            <option value="">Select a bed…</option>
            {guestBeds.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
          </Select>
        </FieldWrapper>
        <FieldWrapper label="Guest name" htmlFor="gs-name">
          <Input id="gs-name" value={guestName} onChange={(e) => setGuestName(e.target.value)} />
        </FieldWrapper>
        <FieldWrapper label="Guest type" htmlFor="gs-type">
          <Select id="gs-type" value={guestType} onChange={(e) => setGuestType(e.target.value as GuestType)}>
            <option value="parent">Parent</option>
            <option value="visiting_faculty">Visiting faculty</option>
            <option value="other">Other</option>
          </Select>
        </FieldWrapper>
        <FieldWrapper label="Host / department reference" htmlFor="gs-host" hint="Optional">
          <Input id="gs-host" value={hostReference} onChange={(e) => setHostReference(e.target.value)} />
        </FieldWrapper>
        <FieldWrapper label="Purpose" htmlFor="gs-purpose" hint="Optional">
          <Input id="gs-purpose" value={purpose} onChange={(e) => setPurpose(e.target.value)} />
        </FieldWrapper>
        <div className="grid grid-cols-2 gap-3">
          <FieldWrapper label="Arrival" htmlFor="gs-arrival">
            <Input id="gs-arrival" type="date" value={arrivalDate} onChange={(e) => setArrivalDate(e.target.value)} />
          </FieldWrapper>
          <FieldWrapper label="Departure" htmlFor="gs-departure" hint="Optional">
            <Input id="gs-departure" type="date" value={departureDate} onChange={(e) => setDepartureDate(e.target.value)} />
          </FieldWrapper>
        </div>
      </div>
    </Sheet>
  );
}

function GuestStayDetailSheet({ guestStay, onClose, onChanged }: { guestStay: GuestStay; onClose: () => void; onChanged: () => void }) {
  const [s, setS] = useState(guestStay);
  const [keyReference, setKeyReference] = useState('');
  const [identityVerified, setIdentityVerified] = useState(false);
  const [notes, setNotes] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<string | null>(null);

  async function run(action: string, fn: () => Promise<GuestStay>) {
    setSubmitting(action);
    setError(null);
    try {
      setS(await fn());
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <Sheet open onClose={onClose} title={s.guestName}>
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <p className="text-sm text-slate-600">
          <StatusPill status={s.status} /> — {humanize(s.guestType)}
        </p>
        <Card>
          <CardHeader>
            <p className="text-sm font-medium text-slate-900">Details</p>
          </CardHeader>
          <CardBody className="space-y-1 text-sm text-slate-700">
            <p>Arrival: {s.arrivalDate}</p>
            {s.departureDate && <p>Departure: {s.departureDate}</p>}
            {s.hostReference && <p>Host: {s.hostReference}</p>}
            {s.purpose && <p>Purpose: {s.purpose}</p>}
            {s.keyReference && <p>Key: {s.keyReference}</p>}
          </CardBody>
        </Card>

        {s.status === 'reserved' && (
          <>
            <FieldWrapper label="Key reference" htmlFor="gsd-key" hint="Optional">
              <Input id="gsd-key" value={keyReference} onChange={(e) => setKeyReference(e.target.value)} />
            </FieldWrapper>
            <label className="flex min-h-touch cursor-pointer items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={identityVerified} onChange={(e) => setIdentityVerified(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-accent" />
              Identity verified (also confirms guest/visitor policy acknowledgement)
            </label>
            <Button
              fullWidth
              onClick={() => void run('checkin', () => guestStaysApi.checkInGuestStay(s.id, identityVerified, keyReference || undefined))}
              disabled={Boolean(submitting)}
            >
              {submitting === 'checkin' ? 'Checking in…' : 'Check in'}
            </Button>
            <FieldWrapper label="Cancel reason" htmlFor="gsd-cancel">
              <div className="flex gap-2">
                <Input id="gsd-cancel" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} className="flex-1" />
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => void run('cancel', () => guestStaysApi.cancelGuestStay(s.id, cancelReason))}
                  disabled={!cancelReason.trim() || Boolean(submitting)}
                >
                  Cancel
                </Button>
              </div>
            </FieldWrapper>
          </>
        )}

        {s.status === 'checked_in' && (
          <>
            <FieldWrapper label="Checkout notes" htmlFor="gsd-notes" hint="Optional">
              <Textarea id="gsd-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </FieldWrapper>
            <Button fullWidth onClick={() => void run('checkout', () => guestStaysApi.checkOutGuestStay(s.id, notes || undefined))} disabled={Boolean(submitting)}>
              {submitting === 'checkout' ? 'Checking out…' : 'Check out'}
            </Button>
          </>
        )}

        {s.status === 'checked_out' && s.checkoutNotes && <p className="text-sm text-slate-700">{s.checkoutNotes}</p>}
      </div>
    </Sheet>
  );
}
