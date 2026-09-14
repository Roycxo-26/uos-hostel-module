import { useEffect, useRef, useState } from 'react';
import * as casesApi from '../api/cases';
import * as maintenanceApi from '../api/maintenance';
import * as roomAccessApi from '../api/roomAccess';
import * as safetyApi from '../api/safety';
import { useAuth } from '../context/AuthContext';
import { Alert, Button, Card, CardBody, EmptyState, PageHeader, PageSpinner, Textarea } from '../design-system';
import { AlertIcon, CameraIcon, ChevronRightIcon, DoorIcon, OfflineIcon, WrenchIcon } from '../design-system/icons';
import { errorMessage } from '../lib/errorMessage';
import { compressImageToDataUrl } from '../offline/compressImage';
import { getCache, setCache } from '../offline/db';
import type { OutboxAction } from '../offline/db';
import { discardOutboxAction, enqueue, retryOutboxAction, subscribe, trySync } from '../offline/syncManager';
import type { EvacuationDrill, MaintenanceTicket, RoomEntry } from '../types';

/**
 * UOS_Final.docx audit (12 Sep 2026) §"ground and frontline worker mobile
 * mode": simple, large-tap-target, offline-capable screens for staff
 * walking around a building, as opposed to this app's other (desk-
 * oriented) staff pages. One hub + one flow per domain, each flow doing
 * only the single most common on-the-move action for that domain
 * (Maintenance: accept + resolve a job; Room Access: record entry/exit;
 * Safety: check residents off during a live drill) — everything else
 * about those tickets/entries/drills stays on the regular desk pages.
 *
 * Gated the same way every other staff page in this app is (`isStaff` —
 * see AppShell.tsx's own StaffOnly wrapper) as a known simplification:
 * the BRD's "Floor Incharge" role is a time-bound responsibility layered
 * on the Student base role, not a distinct login role this app's role
 * catalogue has — Warden/Head Warden already hold every permission these
 * three actions need, and are the realistic first users of this screen.
 * Narrowing this to actual Floor Incharge holders is a real follow-up,
 * not solved here.
 */
export function Frontline() {
  const [domain, setDomain] = useState<'hub' | 'maintenance' | 'roomAccess' | 'safety'>('hub');
  const [outbox, setOutbox] = useState<OutboxAction[]>([]);

  useEffect(() => subscribe(setOutbox), []);

  const pendingCount = (d: OutboxAction['domain']) => outbox.filter((a) => a.domain === d && (a.status === 'pending' || a.status === 'syncing')).length;
  const attentionCount = (d: OutboxAction['domain']) => outbox.filter((a) => a.domain === d && (a.status === 'conflict' || a.status === 'failed')).length;

  return (
    <div className="mx-auto max-w-md">
      <PageHeader title="Frontline" description="Walk-around jobs — works offline, syncs when you're back in signal." />
      <OfflineBanner outbox={outbox} />

      {domain === 'hub' && (
        <div className="space-y-3">
          <FrontlineTile
            icon={<WrenchIcon />}
            title="Maintenance jobs"
            subtitle="Accept and resolve tickets assigned to you"
            pending={pendingCount('maintenance')}
            attention={attentionCount('maintenance')}
            onClick={() => setDomain('maintenance')}
          />
          <FrontlineTile
            icon={<DoorIcon />}
            title="Room entries"
            subtitle="Record entry / exit for an approved room visit"
            pending={pendingCount('roomAccess')}
            attention={attentionCount('roomAccess')}
            onClick={() => setDomain('roomAccess')}
          />
          <FrontlineTile
            icon={<AlertIcon />}
            title="Drill check-in"
            subtitle="Check residents off during a live evacuation drill"
            pending={pendingCount('safety')}
            attention={attentionCount('safety')}
            onClick={() => setDomain('safety')}
          />
        </div>
      )}

      {domain === 'maintenance' && <MaintenanceFrontline onBack={() => setDomain('hub')} outbox={outbox} />}
      {domain === 'roomAccess' && <RoomAccessFrontline onBack={() => setDomain('hub')} outbox={outbox} />}
      {domain === 'safety' && <SafetyFrontline onBack={() => setDomain('hub')} outbox={outbox} />}
    </div>
  );
}

function FrontlineTile({
  icon,
  title,
  subtitle,
  pending,
  attention,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  pending: number;
  attention: number;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} className="w-full text-left">
      <Card interactive>
        <CardBody className="flex items-center gap-4 py-5">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-accent-subtle text-accent">{icon}</span>
          <div className="min-w-0 flex-1">
            <p className="text-base font-semibold text-slate-900">{title}</p>
            <p className="text-sm text-slate-500">{subtitle}</p>
            {(pending > 0 || attention > 0) && (
              <p className="mt-1 text-xs font-medium">
                {pending > 0 && <span className="text-amber-600">{pending} waiting to sync</span>}
                {pending > 0 && attention > 0 && ' — '}
                {attention > 0 && <span className="text-rose-600">{attention} need your attention</span>}
              </p>
            )}
          </div>
          <ChevronRightIcon className="shrink-0 text-slate-400" />
        </CardBody>
      </Card>
    </button>
  );
}

// ============================================================================
// Offline banner — always visible, on the hub and inside every domain flow
// ============================================================================

function OfflineBanner({ outbox }: { outbox: OutboxAction[] }) {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  const pending = outbox.filter((a) => a.status === 'pending' || a.status === 'syncing').length;
  const attention = outbox.filter((a) => a.status === 'conflict' || a.status === 'failed').length;

  if (online && pending === 0 && attention === 0) return null;

  return (
    <Alert tone={!online ? 'warning' : attention > 0 ? 'danger' : 'info'}>
      <div className="flex items-center gap-2">
        {!online && <OfflineIcon className="h-4 w-4 shrink-0" />}
        <span>
          {!online && "You're offline — "}
          {pending > 0 && `${pending} action${pending === 1 ? '' : 's'} waiting to sync. `}
          {attention > 0 && `${attention} need${attention === 1 ? 's' : ''} your attention.`}
          {online && pending === 0 && attention === 0 && 'All caught up.'}
        </span>
      </div>
    </Alert>
  );
}

/** Small, reusable list of a domain's own outbox entries — shown at the
 * bottom of each flow so a pending/failed action is never invisible just
 * because you've navigated away from the screen you made it on. */
function PendingActionsList({ outbox, domain }: { outbox: OutboxAction[]; domain: OutboxAction['domain'] }) {
  const mine = outbox.filter((a) => a.domain === domain);
  if (mine.length === 0) return null;
  return (
    <div className="mt-4 space-y-2">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Pending sync</p>
      {mine.map((a) => (
        <Card key={a.localId}>
          <CardBody className="flex items-center justify-between gap-2 py-2.5 text-sm">
            <div className="min-w-0">
              <p className="truncate text-slate-700">{a.label}</p>
              <p className={`text-xs ${a.status === 'conflict' || a.status === 'failed' ? 'text-rose-600' : 'text-slate-400'}`}>
                {a.status === 'pending' && 'Waiting for signal…'}
                {a.status === 'syncing' && 'Sending…'}
                {a.status === 'conflict' && (a.errorMessage ?? 'Someone else already changed this.')}
                {a.status === 'failed' && (a.errorMessage ?? 'This failed.')}
              </p>
            </div>
            {(a.status === 'conflict' || a.status === 'failed') && (
              <div className="flex shrink-0 gap-1.5">
                <Button size="sm" variant="secondary" onClick={() => void retryOutboxAction(a.localId)}>
                  Retry
                </Button>
                <Button size="sm" variant="danger" onClick={() => void discardOutboxAction(a.localId)}>
                  Discard
                </Button>
              </div>
            )}
          </CardBody>
        </Card>
      ))}
    </div>
  );
}

// ============================================================================
// Maintenance — accept a job, then resolve it with notes + a photo
// ============================================================================

const MAINTENANCE_CACHE_KEY = 'frontline:maintenance:my-jobs';

function MaintenanceFrontline({ onBack, outbox }: { onBack: () => void; outbox: OutboxAction[] }) {
  const { me } = useAuth();
  const [tickets, setTickets] = useState<MaintenanceTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<MaintenanceTicket | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [assigned, inProgress] = await Promise.all([maintenanceApi.listTickets({ status: 'assigned' }), maintenanceApi.listTickets({ status: 'in_progress' })]);
      const mine = [...assigned, ...inProgress].filter((t) => t.assignedToUserId === me?.sub);
      setTickets(mine);
      await setCache(MAINTENANCE_CACHE_KEY, mine);
    } catch (err) {
      // Offline (or the request otherwise failed) — fall back to whatever
      // was last successfully loaded, so the screen still shows real jobs
      // instead of going blank the moment signal drops.
      const cached = await getCache<MaintenanceTicket[]>(MAINTENANCE_CACHE_KEY);
      if (cached) {
        setTickets(cached.data);
      } else {
        setError(errorMessage(err));
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-load once a queued action for this domain finishes syncing, so a
  // job that just moved from 'assigned' to 'in_progress' on the server
  // moves to the right section here too, not just in the optimistic patch.
  const prevOutboxLen = useRef(outbox.filter((a) => a.domain === 'maintenance').length);
  useEffect(() => {
    const len = outbox.filter((a) => a.domain === 'maintenance').length;
    if (len < prevOutboxLen.current) void load();
    prevOutboxLen.current = len;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outbox]);

  function patchTicket(id: string, patch: Partial<MaintenanceTicket>) {
    setTickets((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    setSelected((prev) => (prev && prev.id === id ? { ...prev, ...patch } : prev));
  }

  async function handleStart(ticket: MaintenanceTicket) {
    await enqueue({
      domain: 'maintenance',
      label: `Start work — ${ticket.category} (${ticket.locationNote ?? 'room ticket'})`,
      method: 'POST',
      path: `/maintenance/tickets/${ticket.id}/start`,
      body: {},
    });
    patchTicket(ticket.id, { status: 'in_progress' });
  }

  async function handleResolve(ticket: MaintenanceTicket, notes: string, photoUrl: string | null) {
    await enqueue({
      domain: 'maintenance',
      label: `Resolve — ${ticket.category} (${ticket.locationNote ?? 'room ticket'})`,
      method: 'POST',
      path: `/maintenance/tickets/${ticket.id}/resolve`,
      body: { resolutionNotes: notes, ...(photoUrl ? { resolutionEvidenceUrl: photoUrl } : {}) },
    });
    patchTicket(ticket.id, { status: 'resolved', resolutionNotes: notes });
    setSelected(null);
  }

  const toStart = tickets.filter((t) => t.status === 'assigned');
  const toResolve = tickets.filter((t) => t.status === 'in_progress');

  return (
    <div>
      <BackRow onBack={onBack} />
      {error && <Alert>{error}</Alert>}
      {loading ? (
        <PageSpinner />
      ) : selected ? (
        <MaintenanceJobDetail ticket={selected} onBack={() => setSelected(null)} onStart={handleStart} onResolve={handleResolve} />
      ) : tickets.length === 0 ? (
        <EmptyState icon={<WrenchIcon className="h-8 w-8" />} title="No jobs assigned to you" description="Jobs assigned to you by staff will show up here." />
      ) : (
        <div className="space-y-4">
          {toResolve.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">In progress — ready to resolve</p>
              <div className="space-y-2">
                {toResolve.map((t) => (
                  <JobRow key={t.id} ticket={t} onClick={() => setSelected(t)} />
                ))}
              </div>
            </div>
          )}
          {toStart.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Assigned — tap to start</p>
              <div className="space-y-2">
                {toStart.map((t) => (
                  <JobRow key={t.id} ticket={t} onClick={() => setSelected(t)} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      <PendingActionsList outbox={outbox} domain="maintenance" />
    </div>
  );
}

function JobRow({ ticket, onClick }: { ticket: MaintenanceTicket; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="w-full text-left">
      <Card interactive>
        <CardBody className="flex items-center justify-between gap-3 py-4">
          <div className="min-w-0">
            <p className="font-medium capitalize text-slate-900">{ticket.category.replace(/_/g, ' ')}</p>
            <p className="truncate text-sm text-slate-500">{ticket.locationNote ?? ticket.description}</p>
          </div>
          {ticket.isEmergency && <span className="shrink-0 text-xs font-medium text-rose-600">Emergency</span>}
        </CardBody>
      </Card>
    </button>
  );
}

function MaintenanceJobDetail({
  ticket,
  onBack,
  onStart,
  onResolve,
}: {
  ticket: MaintenanceTicket;
  onBack: () => void;
  onStart: (t: MaintenanceTicket) => Promise<void>;
  onResolve: (t: MaintenanceTicket, notes: string, photoUrl: string | null) => Promise<void>;
}) {
  const [notes, setNotes] = useState('');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [compressing, setCompressing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handlePhoto(file: File | undefined) {
    if (!file) return;
    setCompressing(true);
    try {
      setPhotoUrl(await compressImageToDataUrl(file));
    } finally {
      setCompressing(false);
    }
  }

  return (
    <div>
      <BackRow onBack={onBack} label="Back to jobs" />
      <Card>
        <CardBody className="space-y-3 py-4">
          <p className="text-lg font-semibold capitalize text-slate-900">{ticket.category.replace(/_/g, ' ')}</p>
          <p className="text-sm text-slate-600">{ticket.locationNote ?? ticket.description}</p>
          <p className="text-sm text-slate-500">{ticket.description}</p>
        </CardBody>
      </Card>

      {ticket.status === 'assigned' && (
        <Button
          fullWidth
          className="mt-4 min-h-16 text-base"
          disabled={submitting}
          onClick={() =>
            void (async () => {
              setSubmitting(true);
              await onStart(ticket);
              setSubmitting(false);
            })()
          }
        >
          {submitting ? 'Starting…' : 'Start work'}
        </Button>
      )}

      {ticket.status === 'in_progress' && (
        <div className="mt-4 space-y-3">
          <Textarea placeholder="What did you do?" value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} />
          <label className="block">
            <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => void handlePhoto(e.target.files?.[0])} />
            <span className="flex min-h-16 w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 text-sm font-medium text-slate-600">
              <CameraIcon className="h-5 w-5" />
              {compressing ? 'Processing photo…' : photoUrl ? 'Photo attached — tap to retake' : 'Add a photo (optional)'}
            </span>
          </label>
          {photoUrl && <img src={photoUrl} alt="Job evidence" className="max-h-48 w-full rounded-lg object-cover" />}
          <Button
            fullWidth
            className="min-h-16 text-base"
            disabled={submitting || !notes.trim() || compressing}
            onClick={() =>
              void (async () => {
                setSubmitting(true);
                await onResolve(ticket, notes, photoUrl);
                setSubmitting(false);
              })()
            }
          >
            {submitting ? 'Resolving…' : 'Resolve'}
          </Button>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Room Access — record entry, then record exit
// ============================================================================

const ROOM_ACCESS_CACHE_KEY = 'frontline:roomAccess:actionable';

function RoomAccessFrontline({ onBack, outbox }: { onBack: () => void; outbox: OutboxAction[] }) {
  const [entries, setEntries] = useState<RoomEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<RoomEntry | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [approved, notified, entered] = await Promise.all([
        roomAccessApi.listEntries({ status: 'approved' }),
        roomAccessApi.listEntries({ status: 'notified' }),
        roomAccessApi.listEntries({ status: 'entered' }),
      ]);
      const all = [...approved, ...notified, ...entered];
      setEntries(all);
      await setCache(ROOM_ACCESS_CACHE_KEY, all);
    } catch (err) {
      const cached = await getCache<RoomEntry[]>(ROOM_ACCESS_CACHE_KEY);
      if (cached) {
        setEntries(cached.data);
      } else {
        setError(errorMessage(err));
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const prevOutboxLen = useRef(outbox.filter((a) => a.domain === 'roomAccess').length);
  useEffect(() => {
    const len = outbox.filter((a) => a.domain === 'roomAccess').length;
    if (len < prevOutboxLen.current) void load();
    prevOutboxLen.current = len;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outbox]);

  function patchEntry(id: string, patch: Partial<RoomEntry>) {
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
    setSelected((prev) => (prev && prev.id === id ? { ...prev, ...patch } : prev));
  }

  async function handleEnter(entry: RoomEntry, notes: string, photoUrl: string | null) {
    await enqueue({
      domain: 'roomAccess',
      label: `Record entry — ${entry.purpose.replace(/_/g, ' ')}`,
      method: 'POST',
      path: `/room-access/entries/${entry.id}/enter`,
      body: { ...(notes ? { evidenceNotes: notes } : {}), ...(photoUrl ? { entryPhotoUrl: photoUrl } : {}) },
    });
    patchEntry(entry.id, { status: 'entered' });
  }

  async function handleExit(entry: RoomEntry, notes: string, photoUrl: string | null) {
    await enqueue({
      domain: 'roomAccess',
      label: `Record exit — ${entry.purpose.replace(/_/g, ' ')}`,
      method: 'POST',
      path: `/room-access/entries/${entry.id}/exit`,
      body: { ...(notes ? { evidenceNotes: notes } : {}), ...(photoUrl ? { exitPhotoUrl: photoUrl } : {}) },
    });
    patchEntry(entry.id, { status: 'completed' });
    setSelected(null);
  }

  const toEnter = entries.filter((e) => e.status === 'approved' || e.status === 'notified');
  const toExit = entries.filter((e) => e.status === 'entered');

  return (
    <div>
      <BackRow onBack={onBack} />
      {error && <Alert>{error}</Alert>}
      {loading ? (
        <PageSpinner />
      ) : selected ? (
        <RoomEntryDetail entry={selected} onBack={() => setSelected(null)} onEnter={handleEnter} onExit={handleExit} />
      ) : entries.length === 0 ? (
        <EmptyState icon={<DoorIcon className="h-8 w-8" />} title="No approved room entries right now" description="Approved room-entry requests waiting to happen will show up here." />
      ) : (
        <div className="space-y-4">
          {toExit.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Inside — ready to record exit</p>
              <div className="space-y-2">
                {toExit.map((e) => (
                  <EntryRow key={e.id} entry={e} onClick={() => setSelected(e)} />
                ))}
              </div>
            </div>
          )}
          {toEnter.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Approved — tap to record entry</p>
              <div className="space-y-2">
                {toEnter.map((e) => (
                  <EntryRow key={e.id} entry={e} onClick={() => setSelected(e)} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      <PendingActionsList outbox={outbox} domain="roomAccess" />
    </div>
  );
}

function EntryRow({ entry, onClick }: { entry: RoomEntry; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="w-full text-left">
      <Card interactive>
        <CardBody className="py-4">
          <p className="font-medium capitalize text-slate-900">{entry.purpose.replace(/_/g, ' ')}</p>
          {/* Real, known simplification: room name resolution needs a
              hostel-tree fetch this quick walk-around screen doesn't do —
              see this file's own header comment. A raw id prefix is still
              enough for staff to match against the request they were
              just notified about. */}
          <p className="text-sm text-slate-500">Room {entry.roomId.slice(0, 8)}</p>
        </CardBody>
      </Card>
    </button>
  );
}

function RoomEntryDetail({
  entry,
  onBack,
  onEnter,
  onExit,
}: {
  entry: RoomEntry;
  onBack: () => void;
  onEnter: (e: RoomEntry, notes: string, photoUrl: string | null) => Promise<void>;
  onExit: (e: RoomEntry, notes: string, photoUrl: string | null) => Promise<void>;
}) {
  const [notes, setNotes] = useState('');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [compressing, setCompressing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const isExitStep = entry.status === 'entered';

  async function handlePhoto(file: File | undefined) {
    if (!file) return;
    setCompressing(true);
    try {
      setPhotoUrl(await compressImageToDataUrl(file));
    } finally {
      setCompressing(false);
    }
  }

  return (
    <div>
      <BackRow onBack={onBack} label="Back to entries" />
      <Card>
        <CardBody className="space-y-2 py-4">
          <p className="text-lg font-semibold capitalize text-slate-900">{entry.purpose.replace(/_/g, ' ')}</p>
          <p className="text-sm text-slate-500">Room {entry.roomId.slice(0, 8)}</p>
          {entry.emergencyBypassReason && <Alert tone="warning">Emergency bypass: {entry.emergencyBypassReason}</Alert>}
        </CardBody>
      </Card>

      <div className="mt-4 space-y-3">
        <Textarea placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
        <label className="block">
          <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => void handlePhoto(e.target.files?.[0])} />
          <span className="flex min-h-16 w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 text-sm font-medium text-slate-600">
            <CameraIcon className="h-5 w-5" />
            {compressing ? 'Processing photo…' : photoUrl ? 'Photo attached — tap to retake' : `Photo of room condition (${isExitStep ? 'on exit' : 'on entry'}, optional)`}
          </span>
        </label>
        {photoUrl && <img src={photoUrl} alt="Room condition" className="max-h-48 w-full rounded-lg object-cover" />}
        <Button
          fullWidth
          className="min-h-16 text-base"
          disabled={submitting || compressing}
          onClick={() =>
            void (async () => {
              setSubmitting(true);
              if (isExitStep) await onExit(entry, notes, photoUrl);
              else await onEnter(entry, notes, photoUrl);
              setSubmitting(false);
            })()
          }
        >
          {submitting ? 'Recording…' : isExitStep ? 'Record exit' : 'Record entry'}
        </Button>
      </div>
    </div>
  );
}

// ============================================================================
// Safety — check residents off during a live drill
// ============================================================================

const SAFETY_CACHE_KEY = 'frontline:safety:active-drills';

function SafetyFrontline({ onBack, outbox }: { onBack: () => void; outbox: OutboxAction[] }) {
  const [drills, setDrills] = useState<EvacuationDrill[]>([]);
  const [selected, setSelected] = useState<EvacuationDrill | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [residentNames, setResidentNames] = useState<Record<string, string>>({});

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const list = await safetyApi.listDrills({ status: 'in_progress' });
      setDrills(list);
      await setCache(SAFETY_CACHE_KEY, list);
    } catch (err) {
      const cached = await getCache<EvacuationDrill[]>(SAFETY_CACHE_KEY);
      if (cached) {
        setDrills(cached.data);
      } else {
        setError(errorMessage(err));
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    void casesApi.listResidentDirectory().then((residents) => {
      setResidentNames(Object.fromEntries(residents.map((r) => [r.id, r.name])));
    });
  }, []);

  // A live drill is exactly the case where staying current matters most —
  // re-sync (and re-fetch, once entries land) aggressively while this
  // screen is open, not just when the outbox shrinks.
  useEffect(() => {
    const interval = setInterval(() => void trySync(), 5000);
    return () => clearInterval(interval);
  }, []);

  async function refreshSelected(drillId: string) {
    const full = await safetyApi.getDrill(drillId).catch(() => null);
    if (full) setSelected(full);
  }

  const prevOutboxLen = useRef(outbox.filter((a) => a.domain === 'safety').length);
  useEffect(() => {
    const len = outbox.filter((a) => a.domain === 'safety').length;
    if (len < prevOutboxLen.current && selected) void refreshSelected(selected.id);
    prevOutboxLen.current = len;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outbox]);

  async function handleMark(drill: EvacuationDrill, studentId: string, status: 'accounted_for' | 'unresolved') {
    await enqueue({
      domain: 'safety',
      label: `Mark ${residentNames[studentId] ?? studentId.slice(0, 8)} ${status === 'accounted_for' ? 'accounted for' : 'unresolved'}`,
      method: 'POST',
      path: `/safety/drills/${drill.id}/entries`,
      body: { studentId, status },
    });
    // Optimistic — same reasoning as the other two flows.
    setSelected((prev) =>
      prev && prev.id === drill.id
        ? { ...prev, entries: (prev.entries ?? []).map((e) => (e.studentId === studentId ? { ...e, status, recordedAt: new Date().toISOString() } : e)) }
        : prev
    );
  }

  return (
    <div>
      <BackRow onBack={onBack} />
      {error && <Alert>{error}</Alert>}
      {loading ? (
        <PageSpinner />
      ) : selected ? (
        <DrillRoster drill={selected} residentNames={residentNames} onBack={() => setSelected(null)} onMark={handleMark} />
      ) : drills.length === 0 ? (
        <EmptyState icon={<AlertIcon className="h-8 w-8" />} title="No drill in progress" description="A drill started from the Safety page will show up here to check residents off." />
      ) : (
        <div className="space-y-2">
          {drills.map((d) => (
            <button key={d.id} type="button" onClick={() => setSelected(d)} className="w-full text-left">
              <Card interactive>
                <CardBody className="flex items-center justify-between gap-3 py-4">
                  <div>
                    <p className="font-medium capitalize text-slate-900">{d.drillType.replace(/_/g, ' ')} drill</p>
                    <p className="text-sm text-slate-500">
                      {(d.entries ?? []).filter((e) => e.status === 'accounted_for').length} of {(d.entries ?? []).length} accounted for
                    </p>
                  </div>
                  {d.unresolvedCount > 0 && <span className="shrink-0 text-xs font-medium text-rose-600">{d.unresolvedCount} unresolved</span>}
                </CardBody>
              </Card>
            </button>
          ))}
        </div>
      )}
      <PendingActionsList outbox={outbox} domain="safety" />
    </div>
  );
}

function DrillRoster({
  drill,
  residentNames,
  onBack,
  onMark,
}: {
  drill: EvacuationDrill;
  residentNames: Record<string, string>;
  onBack: () => void;
  onMark: (drill: EvacuationDrill, studentId: string, status: 'accounted_for' | 'unresolved') => Promise<void>;
}) {
  const entries = drill.entries ?? [];
  const unresolved = entries.filter((e) => e.status !== 'accounted_for');
  const accounted = entries.filter((e) => e.status === 'accounted_for');

  return (
    <div>
      <BackRow onBack={onBack} label="Back to drills" />
      <p className="mb-3 text-sm text-slate-500">
        {accounted.length} of {entries.length} accounted for — tap a name once you've physically seen them at the assembly point.
      </p>
      <div className="space-y-4">
        {unresolved.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-rose-600">Not yet accounted for</p>
            <div className="space-y-2">
              {unresolved.map((e) => (
                <ResidentRow key={e.id} name={residentNames[e.studentId] ?? e.studentId.slice(0, 8)} onTap={() => void onMark(drill, e.studentId, 'accounted_for')} accounted={false} />
              ))}
            </div>
          </div>
        )}
        {accounted.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-emerald-600">Accounted for</p>
            <div className="space-y-2">
              {accounted.map((e) => (
                <ResidentRow key={e.id} name={residentNames[e.studentId] ?? e.studentId.slice(0, 8)} onTap={() => void onMark(drill, e.studentId, 'unresolved')} accounted />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ResidentRow({ name, accounted, onTap }: { name: string; accounted: boolean; onTap: () => void }) {
  return (
    <button type="button" onClick={onTap} className="w-full text-left">
      <Card className={accounted ? 'border-emerald-200 bg-emerald-50' : undefined}>
        <CardBody className="flex min-h-16 items-center justify-between gap-3 py-3">
          <span className={`font-medium ${accounted ? 'text-emerald-800' : 'text-slate-900'}`}>{name}</span>
          <span className={`text-xs font-medium ${accounted ? 'text-emerald-600' : 'text-slate-400'}`}>{accounted ? 'Tap to undo' : 'Tap when found'}</span>
        </CardBody>
      </Card>
    </button>
  );
}

// ============================================================================
// Shared
// ============================================================================

function BackRow({ onBack, label = 'Back' }: { onBack: () => void; label?: string }) {
  return (
    <button type="button" onClick={onBack} className="mb-3 text-sm font-medium text-accent">
      ← {label}
    </button>
  );
}
