import { useEffect, useState } from 'react';
import * as casesApi from '../api/cases';
import * as maintenanceApi from '../api/maintenance';
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
import {
  hasHostelRole,
  isPlatformAdmin,
  type CleanlinessAreaType,
  type CleanlinessInspection,
  type Hostel,
  type HousekeepingTask,
  type HousekeepingTaskType,
  type MaintenanceCategory,
  type MaintenancePriority,
  type MaintenanceTicket,
} from '../types';

/** D17.08 (TODO.md Batch 29). "HOSTEL - v.1.md" §16. Every ticket here is
 * a LOCAL_FALLBACK ticket (§16.8) — no D22/Desk system exists to hand
 * this off to, so D17 runs the whole thing end to end and says so. Not
 * staff-only — a resident reports and tracks their own tickets and views
 * their own room's cleanliness inspections; verifying/assigning/
 * resolving/scheduling is staff-gated server-side. */

const CATEGORY_LABELS: Record<MaintenanceCategory, string> = {
  electrical: 'Electrical',
  plumbing: 'Plumbing',
  water_supply: 'Water Supply',
  furniture: 'Furniture',
  room_appliance: 'Room Appliance',
  washroom: 'Washroom',
  housekeeping: 'Housekeeping',
  pest_control: 'Pest Control',
  internet_it: 'Internet / IT',
  security: 'Security',
  access_credential: 'Access / Credential',
  food_mess_service: 'Food / Mess Service',
  safety_emergency: 'Safety / Emergency',
  common_area_issue: 'Common Area Issue',
  other: 'Other',
};

const TASK_TYPE_LABELS: Record<HousekeepingTaskType, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  checkout_deep_clean: 'Checkout Deep Clean',
};

type Tab = 'tickets' | 'housekeeping' | 'inspections';

function useResidentNames(): Record<string, string> {
  const [names, setNames] = useState<Record<string, string>>({});
  useEffect(() => {
    void casesApi.listResidentDirectory().then((residents) => {
      setNames(Object.fromEntries(residents.map((r) => [r.id, r.name])));
    });
  }, []);
  return names;
}

/** Flattened "Block / Floor / Room code" options for a hostel — a staff
 * picker doesn't need the full nested tree, just a readable path per room. */
function useRoomOptions(hostelId: string): { id: string; label: string }[] {
  const [options, setOptions] = useState<{ id: string; label: string }[]>([]);
  useEffect(() => {
    if (!hostelId) {
      setOptions([]);
      return;
    }
    void structureApi.getHostelTree(hostelId).then((tree) => {
      setOptions(
        tree.blocks.flatMap((b) => b.floors.flatMap((f) => f.rooms.map((r) => ({ id: r.id, label: `${b.name} / Floor ${f.number} / ${r.code}` }))))
      );
    });
  }, [hostelId]);
  return options;
}

export function Maintenance() {
  const { me } = useAuth();
  const isStaff = isPlatformAdmin(me) || hasHostelRole(me, 'warden');
  const [tab, setTab] = useState<Tab>('tickets');
  const [hostels, setHostels] = useState<Hostel[]>([]);
  const [hostelId, setHostelId] = useState('');

  useEffect(() => {
    void structureApi.listHostels().then((list) => {
      setHostels(list);
      if (list[0]?.id) setHostelId(list[0].id);
    });
  }, []);

  const tabs: [Tab, string][] = [
    ['tickets', 'Tickets'],
    ...(isStaff ? ([['housekeeping', 'Housekeeping']] as [Tab, string][]) : []),
    ['inspections', 'Inspections'],
  ];

  return (
    <div>
      <PageHeader
        title="Maintenance &amp; Housekeeping"
        description="Report an issue, track Floor Warden verification, housekeeping schedule and room cleanliness inspections."
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

      {tab === 'tickets' && <TicketsTab isStaff={isStaff} currentUserId={me?.sub} hostelId={hostelId} hostels={hostels} setHostelId={setHostelId} />}
      {tab === 'housekeeping' && isStaff && <HousekeepingTab hostelId={hostelId} hostels={hostels} setHostelId={setHostelId} />}
      {tab === 'inspections' && <InspectionsTab isStaff={isStaff} hostelId={hostelId} hostels={hostels} setHostelId={setHostelId} />}
    </div>
  );
}

function HostelPicker({ hostelId, hostels, setHostelId }: { hostelId: string; hostels: Hostel[]; setHostelId: (id: string) => void }) {
  if (hostels.length === 0) return null;
  return (
    <div className="mb-4 max-w-xs">
      <FieldWrapper label="Hostel" htmlFor="mt-hostel">
        <Select id="mt-hostel" value={hostelId} onChange={(e) => setHostelId(e.target.value)}>
          {hostels.map((h) => (
            <option key={h.id} value={h.id}>
              {h.name}
            </option>
          ))}
        </Select>
      </FieldWrapper>
    </div>
  );
}

// ============================================================================
// Tickets
// ============================================================================

function TicketsTab({
  isStaff,
  currentUserId,
  hostelId,
  hostels,
  setHostelId,
}: {
  isStaff: boolean;
  currentUserId: string | undefined;
  hostelId: string;
  hostels: Hostel[];
  setHostelId: (id: string) => void;
}) {
  const residentNames = useResidentNames();
  const roomOptions = useRoomOptions(hostelId);
  const [tickets, setTickets] = useState<MaintenanceTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [reportOpen, setReportOpen] = useState(false);
  const [detailTarget, setDetailTarget] = useState<MaintenanceTicket | null>(null);

  async function load() {
    setLoading(true);
    setTickets(await maintenanceApi.listTickets());
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => setReportOpen(true)}>Report an issue</Button>
      </div>

      {loading ? (
        <PageSpinner />
      ) : tickets.length === 0 ? (
        <EmptyState icon={<AlertIcon className="h-8 w-8" />} title="No maintenance tickets" description="Report one above." />
      ) : (
        <Card>
          <ul className="divide-y divide-slate-100">
            {tickets.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setDetailTarget(t)}>
                  <p className="flex items-center gap-2 text-sm">
                    <span className="font-medium text-slate-800">{CATEGORY_LABELS[t.category]}</span>
                    <StatusPill status={t.status} />
                    {t.isEmergency && <span className="text-xs text-rose-600">Emergency</span>}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-slate-500">
                    {isStaff && `${residentNames[t.raisedBy] ?? t.raisedBy.slice(0, 8)} — `}
                    {t.description}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <ReportTicketSheet
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        onReported={load}
        isStaff={isStaff}
        hostelId={hostelId}
        hostels={hostels}
        setHostelId={setHostelId}
        roomOptions={roomOptions}
      />
      {detailTarget && (
        <TicketDetailSheet
          ticket={detailTarget}
          isStaff={isStaff}
          currentUserId={currentUserId}
          residentNames={residentNames}
          onClose={() => setDetailTarget(null)}
          onChanged={load}
        />
      )}
    </div>
  );
}

function ReportTicketSheet({
  open,
  onClose,
  onReported,
  isStaff,
  hostelId,
  hostels,
  setHostelId,
  roomOptions,
}: {
  open: boolean;
  onClose: () => void;
  onReported: () => void;
  isStaff: boolean;
  hostelId: string;
  hostels: Hostel[];
  setHostelId: (id: string) => void;
  roomOptions: { id: string; label: string }[];
}) {
  const [category, setCategory] = useState<MaintenanceCategory>('other');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<MaintenancePriority>('normal');
  const [roomId, setRoomId] = useState('');
  const [locationNote, setLocationNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      await maintenanceApi.reportTicket({
        category,
        description,
        priority,
        roomId: isStaff && roomId ? roomId : undefined,
        locationNote: locationNote || undefined,
      });
      onReported();
      onClose();
      setDescription('');
      setLocationNote('');
      setRoomId('');
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
      title="Report an issue"
      footer={
        <Button fullWidth onClick={() => void handleSubmit()} disabled={submitting || !description.trim()}>
          {submitting ? 'Reporting…' : 'Report'}
        </Button>
      }
    >
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <Alert tone="warning">A "safety / emergency" category skips routine verification and notifies staff immediately.</Alert>
        <FieldWrapper label="Category" htmlFor="mt-category">
          <Select id="mt-category" value={category} onChange={(e) => setCategory(e.target.value as MaintenanceCategory)}>
            {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </FieldWrapper>
        <FieldWrapper label="Description" htmlFor="mt-desc" required>
          <Textarea id="mt-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
        </FieldWrapper>
        <FieldWrapper label="Priority" htmlFor="mt-priority">
          <Select id="mt-priority" value={priority} onChange={(e) => setPriority(e.target.value as MaintenancePriority)}>
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </Select>
        </FieldWrapper>
        {isStaff ? (
          <>
            <HostelPicker hostelId={hostelId} hostels={hostels} setHostelId={setHostelId} />
            <FieldWrapper label="Room" htmlFor="mt-room" hint="Optional — leave blank and describe the location instead">
              <Select id="mt-room" value={roomId} onChange={(e) => setRoomId(e.target.value)}>
                <option value="">Not a specific room</option>
                {roomOptions.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </Select>
            </FieldWrapper>
          </>
        ) : null}
        <FieldWrapper label="Location note" htmlFor="mt-location" hint={isStaff ? 'Required if no room selected above' : 'Optional — for a common-area issue not in your own room'}>
          <Input id="mt-location" value={locationNote} onChange={(e) => setLocationNote(e.target.value)} />
        </FieldWrapper>
      </div>
    </Sheet>
  );
}

function TicketDetailSheet({
  ticket,
  isStaff,
  currentUserId,
  residentNames,
  onClose,
  onChanged,
}: {
  ticket: MaintenanceTicket;
  isStaff: boolean;
  currentUserId: string | undefined;
  residentNames: Record<string, string>;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState(ticket);
  const [verifyReason, setVerifyReason] = useState('');
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [reopenReason, setReopenReason] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<string | null>(null);

  async function refresh() {
    setDetail(await maintenanceApi.getTicket(ticket.id));
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

  const isOwner = detail.raisedBy === currentUserId;

  return (
    <Sheet open onClose={onClose} title={CATEGORY_LABELS[detail.category]}>
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <p className="flex items-center gap-2 text-sm">
          <StatusPill status={detail.status} />
          {detail.isLocalFallback && <span className="text-xs text-slate-400">LOCAL_FALLBACK</span>}
        </p>
        <p className="text-sm text-slate-700">{detail.description}</p>
        <p className="text-xs text-slate-500">
          {isStaff && `Raised by ${residentNames[detail.raisedBy] ?? detail.raisedBy.slice(0, 8)} — `}
          Priority: {detail.priority}
        </p>
        {detail.verificationReason && <p className="text-xs text-slate-500">Verification: {detail.verificationReason}</p>}
        {detail.assignedToUserId && <p className="text-xs text-slate-500">Assigned to {residentNames[detail.assignedToUserId] ?? detail.assignedToUserId.slice(0, 8)}</p>}
        {detail.assignedToProvider && <p className="text-xs text-slate-500">Provider: {detail.assignedToProvider}</p>}
        {detail.resolutionNotes && <p className="text-xs text-slate-500">Resolution: {detail.resolutionNotes}</p>}
        {detail.reopenReason && <p className="text-xs text-amber-600">Reopened: {detail.reopenReason}</p>}

        {isStaff && detail.status === 'pending_verification' && (
          <div className="space-y-2 border-t border-slate-200 pt-4">
            <p className="text-sm font-medium text-slate-800">Floor Warden verification</p>
            <Textarea placeholder="Reason" value={verifyReason} onChange={(e) => setVerifyReason(e.target.value)} />
            <div className="flex flex-wrap gap-2">
              <Button size="sm" disabled={!verifyReason.trim() || Boolean(submitting)} onClick={() => void run('approve', () => maintenanceApi.verifyTicket(detail.id, 'approved', verifyReason))}>
                Approve
              </Button>
              <Button size="sm" variant="secondary" disabled={!verifyReason.trim() || Boolean(submitting)} onClick={() => void run('return', () => maintenanceApi.verifyTicket(detail.id, 'returned', verifyReason))}>
                Return for information
              </Button>
              <Button size="sm" variant="danger" disabled={!verifyReason.trim() || Boolean(submitting)} onClick={() => void run('reject', () => maintenanceApi.verifyTicket(detail.id, 'rejected', verifyReason))}>
                Reject
              </Button>
            </div>
          </div>
        )}

        {isStaff && ['verified', 'emergency_routed'].includes(detail.status) && (
          <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-4">
            <Button size="sm" disabled={Boolean(submitting)} onClick={() => void run('assign', () => maintenanceApi.assignTicket(detail.id, {}))}>
              Assign (unspecified)
            </Button>
          </div>
        )}

        {isStaff && detail.status === 'assigned' && (
          <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-4">
            <Button size="sm" disabled={Boolean(submitting)} onClick={() => void run('start', () => maintenanceApi.startTicketWork(detail.id))}>
              Start work
            </Button>
          </div>
        )}

        {isStaff && ['assigned', 'in_progress'].includes(detail.status) && (
          <div className="space-y-2 border-t border-slate-200 pt-4">
            <p className="text-sm font-medium text-slate-800">Resolve</p>
            <Textarea placeholder="Resolution notes" value={resolutionNotes} onChange={(e) => setResolutionNotes(e.target.value)} />
            <Button size="sm" disabled={!resolutionNotes.trim() || Boolean(submitting)} onClick={() => void run('resolve', () => maintenanceApi.resolveTicket(detail.id, resolutionNotes))}>
              Mark resolved
            </Button>
          </div>
        )}

        {(isOwner || isStaff) && detail.status === 'resolved' && (
          <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-4">
            <Button size="sm" disabled={Boolean(submitting)} onClick={() => void run('confirm', () => maintenanceApi.confirmTicketResolution(detail.id))}>
              Confirm — close ticket
            </Button>
          </div>
        )}

        {(isOwner || isStaff) && ['closed', 'rejected'].includes(detail.status) && (
          <div className="space-y-2 border-t border-slate-200 pt-4">
            <p className="text-sm font-medium text-slate-800">Reopen</p>
            <div className="flex gap-2">
              <Input placeholder="Reason" value={reopenReason} onChange={(e) => setReopenReason(e.target.value)} className="flex-1" />
              <Button size="sm" variant="secondary" disabled={!reopenReason.trim() || Boolean(submitting)} onClick={() => void run('reopen', () => maintenanceApi.reopenTicket(detail.id, reopenReason))}>
                Reopen
              </Button>
            </div>
          </div>
        )}

        {(isOwner || isStaff) && ['reported', 'pending_verification', 'returned_for_information', 'verified', 'assigned'].includes(detail.status) && (
          <div className="space-y-2 border-t border-slate-200 pt-4">
            <p className="text-sm font-medium text-slate-800">Cancel</p>
            <div className="flex gap-2">
              <Input placeholder="Reason" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} className="flex-1" />
              <Button size="sm" variant="danger" disabled={!cancelReason.trim() || Boolean(submitting)} onClick={() => void run('cancel', () => maintenanceApi.cancelTicket(detail.id, cancelReason))}>
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
// Housekeeping (staff-only)
// ============================================================================

function HousekeepingTab({ hostelId, hostels, setHostelId }: { hostelId: string; hostels: Hostel[]; setHostelId: (id: string) => void }) {
  const roomOptions = useRoomOptions(hostelId);
  const [tasks, setTasks] = useState<HousekeepingTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setTasks(await maintenanceApi.listHousekeepingTasks());
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

  const roomLabel = (roomId: string) => roomOptions.find((r) => r.id === roomId)?.label ?? roomId.slice(0, 8);

  return (
    <div>
      {error && <Alert>{error}</Alert>}
      <div className="mb-4 flex justify-end">
        <Button onClick={() => setScheduleOpen(true)}>Schedule a task</Button>
      </div>

      {loading ? (
        <PageSpinner />
      ) : tasks.length === 0 ? (
        <EmptyState icon={<AlertIcon className="h-8 w-8" />} title="No housekeeping tasks" description="Schedule one above." />
      ) : (
        <Card>
          <ul className="divide-y divide-slate-100">
            {tasks.map((t) => {
              const checklistEntries = Object.entries(t.checklist ?? {});
              return (
                <li key={t.id} className="space-y-1.5 px-4 py-3 sm:px-5">
                  <p className="flex items-center gap-2 text-sm">
                    <span className="font-medium text-slate-800">{TASK_TYPE_LABELS[t.taskType]}</span>
                    <StatusPill status={t.status} />
                  </p>
                  <p className="text-xs text-slate-500">
                    {t.scopeType === 'room' ? roomLabel(t.scopeId) : `${t.scopeType} scope`} — {t.scheduledDate}
                  </p>
                  {checklistEntries.length > 0 && ['scheduled', 'in_progress'].includes(t.status) && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {checklistEntries.map(([key, item]) => (
                        <label key={key} className="flex items-center gap-1.5 text-xs text-slate-700">
                          <input
                            type="checkbox"
                            checked={item.completed}
                            disabled={Boolean(submitting)}
                            onChange={(e) => void run(t.id, `chk-${key}`, () => maintenanceApi.updateHousekeepingChecklist(t.id, key, e.target.checked))}
                            className="h-3.5 w-3.5 rounded border-slate-300 text-accent"
                          />
                          {key.replace(/_/g, ' ')}
                        </label>
                      ))}
                    </div>
                  )}
                  {['scheduled', 'in_progress'].includes(t.status) && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button size="sm" disabled={Boolean(submitting)} onClick={() => void run(t.id, 'complete', () => maintenanceApi.completeHousekeepingTask(t.id))}>
                        Complete
                      </Button>
                      <Button size="sm" variant="danger" disabled={Boolean(submitting)} onClick={() => void run(t.id, 'missed', () => maintenanceApi.markHousekeepingMissed(t.id, 'Not completed'))}>
                        Mark missed
                      </Button>
                    </div>
                  )}
                  {['missed', 'rework_required'].includes(t.status) && (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={Boolean(submitting)}
                      onClick={() => void run(t.id, 'rework', () => maintenanceApi.createReworkTask(t.id, new Date(Date.now() + 86400000).toISOString().slice(0, 10)))}
                    >
                      Schedule rework (tomorrow)
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <ScheduleHousekeepingSheet open={scheduleOpen} onClose={() => setScheduleOpen(false)} onScheduled={load} hostelId={hostelId} hostels={hostels} setHostelId={setHostelId} roomOptions={roomOptions} />
    </div>
  );
}

function ScheduleHousekeepingSheet({
  open,
  onClose,
  onScheduled,
  hostelId,
  hostels,
  setHostelId,
  roomOptions,
}: {
  open: boolean;
  onClose: () => void;
  onScheduled: () => void;
  hostelId: string;
  hostels: Hostel[];
  setHostelId: (id: string) => void;
  roomOptions: { id: string; label: string }[];
}) {
  const [roomId, setRoomId] = useState('');
  const [taskType, setTaskType] = useState<HousekeepingTaskType>('daily');
  const [scheduledDate, setScheduledDate] = useState('');
  const [requestRoomAccess, setRequestRoomAccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      await maintenanceApi.scheduleHousekeepingTask({ scopeType: 'room', scopeId: roomId, taskType, scheduledDate, requestRoomAccess });
      onScheduled();
      onClose();
      setRoomId('');
      setScheduledDate('');
      setRequestRoomAccess(false);
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
      title="Schedule a housekeeping task"
      footer={
        <Button fullWidth onClick={() => void handleSubmit()} disabled={submitting || !roomId || !scheduledDate}>
          {submitting ? 'Scheduling…' : 'Schedule'}
        </Button>
      }
    >
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <HostelPicker hostelId={hostelId} hostels={hostels} setHostelId={setHostelId} />
        <FieldWrapper label="Room" htmlFor="hk-room" required>
          <Select id="hk-room" value={roomId} onChange={(e) => setRoomId(e.target.value)}>
            <option value="">Select a room…</option>
            {roomOptions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </Select>
        </FieldWrapper>
        <FieldWrapper label="Task type" htmlFor="hk-type">
          <Select id="hk-type" value={taskType} onChange={(e) => setTaskType(e.target.value as HousekeepingTaskType)}>
            {Object.entries(TASK_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </FieldWrapper>
        <FieldWrapper label="Scheduled date" htmlFor="hk-date" required>
          <Input id="hk-date" type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} />
        </FieldWrapper>
        <label className="flex min-h-touch cursor-pointer items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={requestRoomAccess} onChange={(e) => setRequestRoomAccess(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-accent" />
          Request room access (creates a linked room entry)
        </label>
      </div>
    </Sheet>
  );
}

// ============================================================================
// Cleanliness inspections
// ============================================================================

function InspectionsTab({ isStaff, hostelId, hostels, setHostelId }: { isStaff: boolean; hostelId: string; hostels: Hostel[]; setHostelId: (id: string) => void }) {
  const roomOptions = useRoomOptions(hostelId);
  const [inspections, setInspections] = useState<CleanlinessInspection[]>([]);
  const [loading, setLoading] = useState(true);
  const [recordOpen, setRecordOpen] = useState(false);
  const [detailTarget, setDetailTarget] = useState<CleanlinessInspection | null>(null);

  async function load() {
    setLoading(true);
    setInspections(await maintenanceApi.listCleanlinessInspections());
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  const roomLabel = (roomId: string) => roomOptions.find((r) => r.id === roomId)?.label ?? roomId.slice(0, 8);

  return (
    <div>
      {isStaff && (
        <div className="mb-4 flex justify-end">
          <Button onClick={() => setRecordOpen(true)}>Record an inspection</Button>
        </div>
      )}

      {loading ? (
        <PageSpinner />
      ) : inspections.length === 0 ? (
        <EmptyState
          icon={<AlertIcon className="h-8 w-8" />}
          title="No inspections recorded"
          description={isStaff ? 'Record one above.' : 'Nothing recorded for your room yet.'}
        />
      ) : (
        <Card>
          <ul className="divide-y divide-slate-100">
            {inspections.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setDetailTarget(i)}>
                  <p className="flex items-center gap-2 text-sm">
                    <span className="font-medium text-slate-800">
                      {i.areaType === 'room' ? 'Room' : 'Washroom'}
                      {isStaff && ` — ${roomLabel(i.scopeId)}`}
                    </span>
                    <span className="text-xs text-slate-500">{i.cleanlinessScore}/5</span>
                    {i.appealStatus !== 'none' && <StatusPill status={i.appealStatus} />}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">{new Date(i.inspectedAt).toLocaleString()}</p>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {isStaff && <RecordInspectionSheet open={recordOpen} onClose={() => setRecordOpen(false)} onRecorded={load} hostelId={hostelId} hostels={hostels} setHostelId={setHostelId} roomOptions={roomOptions} />}
      {detailTarget && <InspectionDetailSheet inspection={detailTarget} isStaff={isStaff} onClose={() => setDetailTarget(null)} onChanged={load} />}
    </div>
  );
}

function RecordInspectionSheet({
  open,
  onClose,
  onRecorded,
  hostelId,
  hostels,
  setHostelId,
  roomOptions,
}: {
  open: boolean;
  onClose: () => void;
  onRecorded: () => void;
  hostelId: string;
  hostels: Hostel[];
  setHostelId: (id: string) => void;
  roomOptions: { id: string; label: string }[];
}) {
  const [areaType, setAreaType] = useState<CleanlinessAreaType>('room');
  const [scopeId, setScopeId] = useState('');
  const [cleanlinessScore, setCleanlinessScore] = useState(5);
  const [wasteSegregationOk, setWasteSegregationOk] = useState(true);
  const [safetyHazardFlag, setSafetyHazardFlag] = useState(false);
  const [maintenanceDefectNoted, setMaintenanceDefectNoted] = useState(false);
  const [maintenanceDefectNotes, setMaintenanceDefectNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      await maintenanceApi.recordCleanlinessInspection({
        areaType,
        scopeId,
        cleanlinessScore,
        wasteSegregationOk,
        safetyHazardFlag,
        maintenanceDefectNoted,
        maintenanceDefectNotes: maintenanceDefectNotes || undefined,
      });
      onRecorded();
      onClose();
      setScopeId('');
      setCleanlinessScore(5);
      setMaintenanceDefectNoted(false);
      setMaintenanceDefectNotes('');
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
      title="Record a cleanliness inspection"
      footer={
        <Button fullWidth onClick={() => void handleSubmit()} disabled={submitting || !scopeId}>
          {submitting ? 'Recording…' : 'Record'}
        </Button>
      }
    >
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <HostelPicker hostelId={hostelId} hostels={hostels} setHostelId={setHostelId} />
        <FieldWrapper label="Area" htmlFor="ci-area">
          <Select id="ci-area" value={areaType} onChange={(e) => setAreaType(e.target.value as CleanlinessAreaType)}>
            <option value="room">Room</option>
            <option value="washroom">Attached washroom</option>
          </Select>
        </FieldWrapper>
        <FieldWrapper label="Room" htmlFor="ci-room" required>
          <Select id="ci-room" value={scopeId} onChange={(e) => setScopeId(e.target.value)}>
            <option value="">Select a room…</option>
            {roomOptions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </Select>
        </FieldWrapper>
        <FieldWrapper label="Cleanliness score (1-5)" htmlFor="ci-score">
          <Input id="ci-score" type="number" min={1} max={5} value={cleanlinessScore} onChange={(e) => setCleanlinessScore(Number(e.target.value))} />
        </FieldWrapper>
        <label className="flex min-h-touch cursor-pointer items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={wasteSegregationOk} onChange={(e) => setWasteSegregationOk(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-accent" />
          Waste segregation OK
        </label>
        <label className="flex min-h-touch cursor-pointer items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={safetyHazardFlag} onChange={(e) => setSafetyHazardFlag(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-accent" />
          Safety hazard present
        </label>
        <label className="flex min-h-touch cursor-pointer items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={maintenanceDefectNoted} onChange={(e) => setMaintenanceDefectNoted(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-accent" />
          Unresolved institutional maintenance defect present
        </label>
        {maintenanceDefectNoted && (
          <FieldWrapper label="Defect notes" htmlFor="ci-defect" hint="This score may unfairly reflect an institution-owned, unresolved defect — recorded so it isn't held against the resident.">
            <Textarea id="ci-defect" value={maintenanceDefectNotes} onChange={(e) => setMaintenanceDefectNotes(e.target.value)} />
          </FieldWrapper>
        )}
      </div>
    </Sheet>
  );
}

function InspectionDetailSheet({
  inspection,
  isStaff,
  onClose,
  onChanged,
}: {
  inspection: CleanlinessInspection;
  isStaff: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState(inspection);
  const [appealReason, setAppealReason] = useState('');
  const [decisionReason, setDecisionReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<string | null>(null);

  async function refresh() {
    setDetail(await maintenanceApi.getCleanlinessInspection(inspection.id));
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

  return (
    <Sheet open onClose={onClose} title={`${detail.areaType === 'room' ? 'Room' : 'Washroom'} inspection`}>
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <p className="text-sm text-slate-700">Score: {detail.cleanlinessScore}/5</p>
        <p className="text-xs text-slate-500">{new Date(detail.inspectedAt).toLocaleString()}</p>
        {detail.maintenanceDefectNoted && <Alert tone="warning">An unresolved institutional maintenance defect was noted: {detail.maintenanceDefectNotes}</Alert>}
        {detail.safetyHazardFlag && <Alert>Safety hazard flagged.</Alert>}
        {detail.residentComments && <p className="text-xs text-slate-500">Resident comment: {detail.residentComments}</p>}
        {detail.appealStatus !== 'none' && (
          <p className="flex items-center gap-2 text-sm">
            <StatusPill status={detail.appealStatus} />
            {detail.appealReason && <span className="text-xs text-slate-500">{detail.appealReason}</span>}
          </p>
        )}

        {!isStaff && detail.appealStatus === 'none' && (
          <div className="space-y-2 border-t border-slate-200 pt-4">
            <p className="text-sm font-medium text-slate-800">Appeal this score</p>
            <Textarea placeholder="Reason" value={appealReason} onChange={(e) => setAppealReason(e.target.value)} />
            <Button size="sm" disabled={!appealReason.trim() || Boolean(submitting)} onClick={() => void run('appeal', () => maintenanceApi.appealCleanlinessInspection(detail.id, appealReason))}>
              Appeal
            </Button>
          </div>
        )}

        {isStaff && detail.appealStatus === 'appealed' && (
          <div className="space-y-2 border-t border-slate-200 pt-4">
            <p className="text-sm font-medium text-slate-800">Decide appeal</p>
            <Textarea placeholder="Reason" value={decisionReason} onChange={(e) => setDecisionReason(e.target.value)} />
            <div className="flex gap-2">
              <Button size="sm" disabled={!decisionReason.trim() || Boolean(submitting)} onClick={() => void run('overturn', () => maintenanceApi.decideCleanlinessAppeal(detail.id, 'overturned', decisionReason))}>
                Overturn
              </Button>
              <Button size="sm" variant="secondary" disabled={!decisionReason.trim() || Boolean(submitting)} onClick={() => void run('uphold', () => maintenanceApi.decideCleanlinessAppeal(detail.id, 'upheld', decisionReason))}>
                Uphold
              </Button>
            </div>
          </div>
        )}
      </div>
    </Sheet>
  );
}
