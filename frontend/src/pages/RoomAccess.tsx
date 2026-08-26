import { useEffect, useState } from 'react';
import * as casesApi from '../api/cases';
import * as roomAccessApi from '../api/roomAccess';
import * as responsibilityApi from '../api/responsibilities';
import * as structureApi from '../api/structure';
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
import { KeyIcon } from '../design-system/icons';
import { errorMessage } from '../lib/errorMessage';
import type {
  CustodyType,
  MasterKeyLog,
  PropertyCustody,
  RoomEntry,
  RoomEntryPurpose,
  SecurityEvidenceReference,
} from '../types';

/** HOSTEL-GAP-ANALYSIS.md D17.20 (TODO.md Batch 18) — governed room entry,
 * master-key tracking, resident-property custody, and a strict CCTV/
 * evidence reference boundary. Staff-only (route-guarded in App.tsx). */
function useResidentNames(): Record<string, string> {
  const [names, setNames] = useState<Record<string, string>>({});
  useEffect(() => {
    void casesApi.listResidentDirectory().then((residents) => {
      setNames(Object.fromEntries(residents.map((r) => [r.id, r.name])));
    });
  }, []);
  return names;
}

interface RoomOption {
  id: string;
  label: string;
}

async function fetchRoomOptions(): Promise<RoomOption[]> {
  const hostels = await structureApi.listHostels();
  const trees = await Promise.all(hostels.map((h) => structureApi.getHostelTree(h.id)));
  const options: RoomOption[] = [];
  for (const tree of trees) {
    for (const block of tree.blocks) {
      for (const floor of block.floors) {
        for (const room of floor.rooms) {
          options.push({ id: room.id, label: `${tree.name} / ${block.code} / Fl.${floor.number} / ${room.code}` });
        }
      }
    }
  }
  return options;
}

type Tab = 'entries' | 'keys' | 'custody' | 'evidence';

export function RoomAccess() {
  const [tab, setTab] = useState<Tab>('entries');

  return (
    <div>
      <PageHeader title="Room Access &amp; Custody" description="Governed room entry, master keys, resident property, and evidence references." />

      <div className="mb-6 flex gap-1 border-b border-slate-200">
        {(
          [
            ['entries', 'Room Entries'],
            ['keys', 'Master Keys'],
            ['custody', 'Property Custody'],
            ['evidence', 'Evidence References'],
          ] as [Tab, string][]
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            className={`px-3 py-2 text-sm font-medium ${
              tab === value ? 'border-b-2 border-accent text-accent' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'entries' && <RoomEntriesTab />}
      {tab === 'keys' && <MasterKeysTab />}
      {tab === 'custody' && <PropertyCustodyTab />}
      {tab === 'evidence' && <EvidenceReferencesTab />}
    </div>
  );
}

// ============================================================================
// Room Entries
// ============================================================================

const ENTRY_PURPOSE_LABELS: Record<RoomEntryPurpose, string> = {
  scheduled_housekeeping: 'Scheduled housekeeping',
  scheduled_inspection: 'Scheduled inspection',
  maintenance: 'Maintenance',
  welfare_check: 'Welfare check',
  security_investigation: 'Security investigation',
  emergency: 'Emergency',
  pest_treatment: 'Pest treatment',
  checkout_abandonment: 'Checkout / abandonment',
  asset_utility_inspection: 'Asset/utility inspection',
  legal_audit: 'Legal/audit',
};

function RoomEntriesTab() {
  const [entries, setEntries] = useState<RoomEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [requestOpen, setRequestOpen] = useState(false);
  const [target, setTarget] = useState<RoomEntry | null>(null);
  const [roomLabels, setRoomLabels] = useState<Record<string, string>>({});

  async function load() {
    setLoading(true);
    const [list, rooms] = await Promise.all([roomAccessApi.listEntries(), fetchRoomOptions()]);
    setEntries(list);
    setRoomLabels(Object.fromEntries(rooms.map((r) => [r.id, r.label])));
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => setRequestOpen(true)}>Request room entry</Button>
      </div>
      {loading ? (
        <PageSpinner />
      ) : entries.length === 0 ? (
        <EmptyState icon={<KeyIcon className="h-8 w-8" />} title="No room entries" description="Request one above." />
      ) : (
        <Card>
          <ul className="divide-y divide-slate-100">
            {entries.map((e) => (
              <li key={e.id}>
                <button type="button" className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left sm:px-5" onClick={() => setTarget(e)}>
                  <div className="text-sm">
                    <p className="flex items-center gap-2">
                      <StatusPill status={e.status} />
                      <span className="text-slate-700">{ENTRY_PURPOSE_LABELS[e.purpose]}</span>
                      {e.purpose === 'emergency' && (
                        <span className="inline-flex items-center rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700">Emergency bypass</span>
                      )}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">{roomLabels[e.roomId] ?? e.roomId.slice(0, 8)}</p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {requestOpen && <RequestEntrySheet onClose={() => setRequestOpen(false)} onRequested={load} />}
      {target && <EntryDetailSheet entry={target} roomLabel={roomLabels[target.roomId] ?? target.roomId} onClose={() => setTarget(null)} onChanged={load} />}
    </div>
  );
}

function RequestEntrySheet({ onClose, onRequested }: { onClose: () => void; onRequested: () => void }) {
  const [rooms, setRooms] = useState<RoomOption[]>([]);
  const [roomId, setRoomId] = useState('');
  const [purpose, setPurpose] = useState<RoomEntryPurpose>('scheduled_housekeeping');
  const [windowStart, setWindowStart] = useState('');
  const [windowEnd, setWindowEnd] = useState('');
  const [emergencyReason, setEmergencyReason] = useState('');
  const [noticeGiven, setNoticeGiven] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const isEmergency = purpose === 'emergency';

  useEffect(() => {
    void fetchRoomOptions().then(setRooms);
  }, []);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      await roomAccessApi.requestEntry({
        roomId,
        purpose,
        plannedWindowStart: !isEmergency && windowStart ? new Date(windowStart).toISOString() : undefined,
        plannedWindowEnd: !isEmergency && windowEnd ? new Date(windowEnd).toISOString() : undefined,
        emergencyBypassReason: isEmergency ? emergencyReason : undefined,
        noticeGiven,
      });
      onRequested();
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
      title="Request room entry"
      footer={
        <Button
          fullWidth
          variant={isEmergency ? 'danger' : 'primary'}
          onClick={() => void handleSubmit()}
          disabled={submitting || !roomId || (isEmergency ? !emergencyReason.trim() : !windowStart || !windowEnd)}
        >
          {submitting ? 'Submitting…' : isEmergency ? 'Authorise emergency entry now' : 'Request entry'}
        </Button>
      }
    >
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <FieldWrapper label="Room" htmlFor="re-room" required>
          <Select id="re-room" value={roomId} onChange={(e) => setRoomId(e.target.value)}>
            <option value="">Select a room</option>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </Select>
        </FieldWrapper>
        <FieldWrapper label="Purpose" htmlFor="re-purpose">
          <Select id="re-purpose" value={purpose} onChange={(e) => setPurpose(e.target.value as RoomEntryPurpose)}>
            {Object.entries(ENTRY_PURPOSE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </FieldWrapper>
        {isEmergency ? (
          <>
            <Alert tone="warning">Emergency entries skip approval and notice — authorised immediately, audited afterwards.</Alert>
            <FieldWrapper label="Emergency bypass reason" htmlFor="re-emergency" required>
              <Textarea id="re-emergency" value={emergencyReason} onChange={(e) => setEmergencyReason(e.target.value)} />
            </FieldWrapper>
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <FieldWrapper label="Window start" htmlFor="re-start" required>
                <Input id="re-start" type="datetime-local" value={windowStart} onChange={(e) => setWindowStart(e.target.value)} />
              </FieldWrapper>
              <FieldWrapper label="Window end" htmlFor="re-end" required>
                <Input id="re-end" type="datetime-local" value={windowEnd} onChange={(e) => setWindowEnd(e.target.value)} />
              </FieldWrapper>
            </div>
            <label className="flex min-h-touch cursor-pointer items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={noticeGiven} onChange={(e) => setNoticeGiven(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-accent" />
              Resident has already been given notice
            </label>
          </>
        )}
      </div>
    </Sheet>
  );
}

function EntryDetailSheet({
  entry,
  roomLabel,
  onClose,
  onChanged,
}: {
  entry: RoomEntry;
  roomLabel: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  async function run(action: string, fn: () => Promise<unknown>) {
    setSubmitting(action);
    setError(null);
    try {
      await fn();
      onChanged();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <Sheet open onClose={onClose} title="Room entry">
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <p className="text-sm text-slate-600">
          <StatusPill status={entry.status} /> — {roomLabel}
        </p>
        <p className="text-sm text-slate-700">{ENTRY_PURPOSE_LABELS[entry.purpose]}</p>
        {entry.emergencyBypassReason && <Alert tone="warning">Emergency bypass: {entry.emergencyBypassReason}</Alert>}

        <div className="flex flex-wrap gap-2">
          {entry.status === 'requested' && (
            <Button size="sm" onClick={() => void run('approve', () => roomAccessApi.approveEntry(entry.id, true))} disabled={Boolean(submitting)}>
              Approve
            </Button>
          )}
          {entry.status === 'approved' && (
            <Button size="sm" variant="secondary" onClick={() => void run('notify', () => roomAccessApi.markNotified(entry.id))} disabled={Boolean(submitting)}>
              Mark resident notified
            </Button>
          )}
          {['approved', 'notified'].includes(entry.status) && (
            <Button size="sm" onClick={() => void run('enter', () => roomAccessApi.recordEntry(entry.id))} disabled={Boolean(submitting)}>
              Record entry now
            </Button>
          )}
          {entry.status === 'entered' && (
            <Button size="sm" onClick={() => void run('exit', () => roomAccessApi.recordExit(entry.id))} disabled={Boolean(submitting)}>
              Record exit now
            </Button>
          )}
        </div>

        {['requested', 'approved', 'notified'].includes(entry.status) && (
          <FieldWrapper label="Cancel" htmlFor="re-cancel-reason">
            <div className="flex gap-2">
              <Input id="re-cancel-reason" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} className="flex-1" />
              <Button size="sm" variant="danger" onClick={() => void run('cancel', () => roomAccessApi.cancelEntry(entry.id, cancelReason))} disabled={!cancelReason.trim() || Boolean(submitting)}>
                Cancel entry
              </Button>
            </div>
          </FieldWrapper>
        )}

        {entry.entryAt && <p className="text-xs text-slate-500">Entered {new Date(entry.entryAt).toLocaleString()}</p>}
        {entry.exitAt && <p className="text-xs text-slate-500">Exited {new Date(entry.exitAt).toLocaleString()}</p>}
      </div>
    </Sheet>
  );
}

// ============================================================================
// Master Keys
// ============================================================================

function MasterKeysTab() {
  const residentNames = useResidentNames();
  const [keys, setKeys] = useState<MasterKeyLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [issueOpen, setIssueOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setKeys(await roomAccessApi.listKeyLogs());
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  async function act(id: string, fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
      await load();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => setIssueOpen(true)}>Issue a key</Button>
      </div>
      {error && <Alert>{error}</Alert>}
      {loading ? (
        <PageSpinner />
      ) : keys.length === 0 ? (
        <EmptyState icon={<KeyIcon className="h-8 w-8" />} title="No key issues on record" description="Issue a key above." />
      ) : (
        <Card>
          <ul className="divide-y divide-slate-100">
            {keys.map((k) => (
              <li key={k.id} className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
                <div className="text-sm">
                  <p className="flex items-center gap-2">
                    <StatusPill status={k.status} domain="key" />
                    <span className="font-medium text-slate-900">{k.keyIdentifier}</span>
                    <span className="text-slate-500">{residentNames[k.issuedTo] ?? k.issuedTo.slice(0, 8)}</span>
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">Due back {new Date(k.expectedReturnAt).toLocaleString()}</p>
                </div>
                {['issued', 'overdue'].includes(k.status) && (
                  <div className="flex gap-2">
                    <Button size="sm" variant="secondary" onClick={() => void act(k.id, () => roomAccessApi.returnKey(k.id))}>
                      Returned
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => void act(k.id, () => roomAccessApi.reportKeyLost(k.id, 'Reported lost by staff'))}>
                      Report lost
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
      {issueOpen && <IssueKeySheet onClose={() => setIssueOpen(false)} onIssued={load} />}
    </div>
  );
}

function IssueKeySheet({ onClose, onIssued }: { onClose: () => void; onIssued: () => void }) {
  // A master key is issued to STAFF (housekeeping/maintenance/warden), not
  // a resident — the case-staff directory, not the resident-candidate
  // list responsibilityApi.listCandidates() serves elsewhere.
  const [staff, setStaff] = useState<{ id: string; name: string }[]>([]);
  const [rooms, setRooms] = useState<RoomOption[]>([]);
  const [keyIdentifier, setKeyIdentifier] = useState('');
  const [scopeId, setScopeId] = useState('');
  const [issuedTo, setIssuedTo] = useState('');
  const [purpose, setPurpose] = useState('');
  const [expectedReturnAt, setExpectedReturnAt] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    void casesApi.listCaseStaffDirectory().then(setStaff);
    void fetchRoomOptions().then(setRooms);
  }, []);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      await roomAccessApi.issueKey({
        keyIdentifier,
        scopeType: 'room',
        scopeId,
        issuedTo,
        purpose: purpose || undefined,
        expectedReturnAt: new Date(expectedReturnAt).toISOString(),
      });
      onIssued();
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
      title="Issue a master key"
      footer={
        <Button fullWidth onClick={() => void handleSubmit()} disabled={submitting || !keyIdentifier.trim() || !scopeId || !issuedTo || !expectedReturnAt}>
          {submitting ? 'Issuing…' : 'Issue key'}
        </Button>
      }
    >
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <FieldWrapper label="Key identifier" htmlFor="ik-id" required hint="e.g. MK-B2">
          <Input id="ik-id" value={keyIdentifier} onChange={(e) => setKeyIdentifier(e.target.value)} />
        </FieldWrapper>
        <FieldWrapper label="Room this key opens" htmlFor="ik-room" required>
          <Select id="ik-room" value={scopeId} onChange={(e) => setScopeId(e.target.value)}>
            <option value="">Select a room</option>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </Select>
        </FieldWrapper>
        <FieldWrapper label="Issued to" htmlFor="ik-to" required>
          <Select id="ik-to" value={issuedTo} onChange={(e) => setIssuedTo(e.target.value)}>
            <option value="">Select staff</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </FieldWrapper>
        <FieldWrapper label="Purpose" htmlFor="ik-purpose" hint="Optional">
          <Input id="ik-purpose" value={purpose} onChange={(e) => setPurpose(e.target.value)} />
        </FieldWrapper>
        <FieldWrapper label="Expected return" htmlFor="ik-return" required>
          <Input id="ik-return" type="datetime-local" value={expectedReturnAt} onChange={(e) => setExpectedReturnAt(e.target.value)} />
        </FieldWrapper>
      </div>
    </Sheet>
  );
}

// ============================================================================
// Property Custody
// ============================================================================

const CUSTODY_TYPE_LABELS: Record<CustodyType, string> = {
  found_property: 'Found property',
  checkout_belongings: 'Left after checkout',
  emergency_secured: 'Secured during emergency',
  confiscated_item: 'Confiscated item',
  damaged_property: 'Damaged property handed in',
  key_or_token: 'Key/access token',
  security_evidence_transfer: 'Transferred to Security',
  package_dispute: 'Package dispute',
};

function PropertyCustodyTab() {
  const residentNames = useResidentNames();
  const [items, setItems] = useState<PropertyCustody[]>([]);
  const [loading, setLoading] = useState(true);
  const [recordOpen, setRecordOpen] = useState(false);
  const [target, setTarget] = useState<PropertyCustody | null>(null);

  async function load() {
    setLoading(true);
    setItems(await roomAccessApi.listCustody());
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => setRecordOpen(true)}>Record an item</Button>
      </div>
      {loading ? (
        <PageSpinner />
      ) : items.length === 0 ? (
        <EmptyState icon={<KeyIcon className="h-8 w-8" />} title="Nothing in custody" description="Record a found or handed-in item above." />
      ) : (
        <Card>
          <ul className="divide-y divide-slate-100">
            {items.map((i) => (
              <li key={i.id}>
                <button type="button" className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left sm:px-5" onClick={() => setTarget(i)}>
                  <div className="text-sm">
                    <p className="flex items-center gap-2">
                      <StatusPill status={i.status} domain="custody" />
                      <span className="text-slate-700">{i.itemDescription}</span>
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {CUSTODY_TYPE_LABELS[i.custodyType]}
                      {i.studentId && ` — ${residentNames[i.studentId] ?? i.studentId.slice(0, 8)}`}
                    </p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {recordOpen && <RecordCustodySheet onClose={() => setRecordOpen(false)} onRecorded={load} />}
      {target && <CustodyDetailSheet custody={target} onClose={() => setTarget(null)} onChanged={load} />}
    </div>
  );
}

function RecordCustodySheet({ onClose, onRecorded }: { onClose: () => void; onRecorded: () => void }) {
  const [candidates, setCandidates] = useState<{ id: string; name: string }[]>([]);
  const [custodyType, setCustodyType] = useState<CustodyType>('found_property');
  const [itemDescription, setItemDescription] = useState('');
  const [studentId, setStudentId] = useState('');
  const [foundLocation, setFoundLocation] = useState('');
  const [storageLocation, setStorageLocation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    void responsibilityApi.listCandidates().then(setCandidates);
  }, []);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      await roomAccessApi.recordCustody({
        custodyType,
        itemDescription,
        studentId: studentId || undefined,
        foundLocation: foundLocation || undefined,
        storageLocation: storageLocation || undefined,
      });
      onRecorded();
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
      title="Record an item in custody"
      footer={
        <Button fullWidth onClick={() => void handleSubmit()} disabled={submitting || !itemDescription.trim()}>
          {submitting ? 'Recording…' : 'Record item'}
        </Button>
      }
    >
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <FieldWrapper label="Type" htmlFor="rc-type">
          <Select id="rc-type" value={custodyType} onChange={(e) => setCustodyType(e.target.value as CustodyType)}>
            {Object.entries(CUSTODY_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </FieldWrapper>
        <FieldWrapper label="Item description" htmlFor="rc-desc" required>
          <Textarea id="rc-desc" value={itemDescription} onChange={(e) => setItemDescription(e.target.value)} />
        </FieldWrapper>
        <FieldWrapper label="Owner (if known)" htmlFor="rc-owner" hint="Optional">
          <Select id="rc-owner" value={studentId} onChange={(e) => setStudentId(e.target.value)}>
            <option value="">Unknown</option>
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </FieldWrapper>
        <FieldWrapper label="Found location" htmlFor="rc-location" hint="Optional">
          <Input id="rc-location" value={foundLocation} onChange={(e) => setFoundLocation(e.target.value)} />
        </FieldWrapper>
        <FieldWrapper label="Storage location" htmlFor="rc-storage" hint="Optional">
          <Input id="rc-storage" value={storageLocation} onChange={(e) => setStorageLocation(e.target.value)} />
        </FieldWrapper>
      </div>
    </Sheet>
  );
}

function CustodyDetailSheet({ custody, onClose, onChanged }: { custody: PropertyCustody; onClose: () => void; onChanged: () => void }) {
  const [releasedTo, setReleasedTo] = useState('');
  const [noticeNote, setNoticeNote] = useState('');
  const [disposalReason, setDisposalReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<string | null>(null);

  async function run(action: string, fn: () => Promise<unknown>, closeAfter = true) {
    setSubmitting(action);
    setError(null);
    try {
      await fn();
      onChanged();
      if (closeAfter) onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <Sheet open onClose={onClose} title="Custody record">
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <p className="text-sm text-slate-600">
          <StatusPill status={custody.status} domain="custody" /> — {custody.itemDescription}
        </p>
        {custody.noticeNotes && <p className="whitespace-pre-wrap text-xs text-slate-500">{custody.noticeNotes}</p>}

        {custody.status === 'in_custody' && (
          <>
            <FieldWrapper label="Log a notice attempt" htmlFor="cd-notice">
              <div className="flex gap-2">
                <Input id="cd-notice" value={noticeNote} onChange={(e) => setNoticeNote(e.target.value)} className="flex-1" />
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => void run('notice', () => roomAccessApi.addNoticeAttempt(custody.id, noticeNote), false).then(() => setNoticeNote(''))}
                  disabled={!noticeNote.trim() || Boolean(submitting)}
                >
                  Log
                </Button>
              </div>
            </FieldWrapper>
            <FieldWrapper label="Release to" htmlFor="cd-release">
              <div className="flex gap-2">
                <Input id="cd-release" value={releasedTo} onChange={(e) => setReleasedTo(e.target.value)} className="flex-1" placeholder="Name/description of recipient" />
                <Button size="sm" onClick={() => void run('release', () => roomAccessApi.releaseCustody(custody.id, releasedTo))} disabled={!releasedTo.trim() || Boolean(submitting)}>
                  Release
                </Button>
              </div>
            </FieldWrapper>
            <Button size="sm" variant="secondary" fullWidth onClick={() => void run('transfer', () => roomAccessApi.transferCustodyToSecurity(custody.id))} disabled={Boolean(submitting)}>
              Transfer to Security
            </Button>
            <FieldWrapper label="Dispose" htmlFor="cd-dispose">
              <div className="flex gap-2">
                <Input id="cd-dispose" value={disposalReason} onChange={(e) => setDisposalReason(e.target.value)} className="flex-1" placeholder="Reason" />
                <Button size="sm" variant="danger" onClick={() => void run('dispose', () => roomAccessApi.disposeCustody(custody.id, disposalReason))} disabled={!disposalReason.trim() || Boolean(submitting)}>
                  Dispose
                </Button>
              </div>
            </FieldWrapper>
          </>
        )}
      </div>
    </Sheet>
  );
}

// ============================================================================
// Evidence References
// ============================================================================

function EvidenceReferencesTab() {
  const [refs, setRefs] = useState<SecurityEvidenceReference[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);

  async function load() {
    setLoading(true);
    setRefs(await roomAccessApi.listEvidenceReferences());
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <div>
      <Alert tone="warning">
        This only stores a reference to evidence Security holds — a reference ID, a time range, a case reference. No footage
        or file is ever stored here.
      </Alert>
      <div className="my-4 flex justify-end">
        <Button onClick={() => setCreateOpen(true)}>Add a reference</Button>
      </div>
      {loading ? (
        <PageSpinner />
      ) : refs.length === 0 ? (
        <EmptyState icon={<KeyIcon className="h-8 w-8" />} title="No evidence references" description="Add one above." />
      ) : (
        <Card>
          <ul className="divide-y divide-slate-100">
            {refs.map((r) => (
              <li key={r.id} className="px-4 py-3 text-sm sm:px-5">
                <p className="flex items-center gap-2">
                  <span className="font-medium text-slate-900">{r.referenceId}</span>
                  <StatusPill status={r.legalHoldStatus} />
                </p>
                {r.caseReference && <p className="text-xs text-slate-500">Case: {r.caseReference}</p>}
              </li>
            ))}
          </ul>
        </Card>
      )}
      {createOpen && <CreateEvidenceReferenceSheet onClose={() => setCreateOpen(false)} onCreated={load} />}
    </div>
  );
}

function CreateEvidenceReferenceSheet({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [referenceId, setReferenceId] = useState('');
  const [caseReference, setCaseReference] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      await roomAccessApi.createEvidenceReference({ referenceId, caseReference: caseReference || undefined, notes: notes || undefined });
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
      title="Add an evidence reference"
      footer={
        <Button fullWidth onClick={() => void handleSubmit()} disabled={submitting || !referenceId.trim()}>
          {submitting ? 'Adding…' : 'Add reference'}
        </Button>
      }
    >
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <FieldWrapper label="Security's reference ID" htmlFor="er-id" required>
          <Input id="er-id" value={referenceId} onChange={(e) => setReferenceId(e.target.value)} />
        </FieldWrapper>
        <FieldWrapper label="Case reference" htmlFor="er-case" hint="Optional">
          <Input id="er-case" value={caseReference} onChange={(e) => setCaseReference(e.target.value)} />
        </FieldWrapper>
        <FieldWrapper label="Notes" htmlFor="er-notes" hint="Optional">
          <Textarea id="er-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </FieldWrapper>
      </div>
    </Sheet>
  );
}
