import { useEffect, useState } from 'react';
import * as casesApi from '../api/cases';
import * as verifyApi from '../api/occupancyVerification';
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
import { ClipboardIcon } from '../design-system/icons';
import { errorMessage } from '../lib/errorMessage';
import type { AnomalyType, Hostel, PresenceStatus, VerificationEntry, VerificationSession, VerificationType } from '../types';

/** HOSTEL-GAP-ANALYSIS.md D17.18 (TODO.md Batch 17) — does the system's
 * "who lives where" record match what staff actually find on a room-by-
 * room walk? Distinct from daily Headcount (routine roll call) and
 * Emergency Muster (evacuation headcount) — this is an audit/integrity
 * check, not an attendance one. Staff-only (route-guarded in App.tsx). */
function useResidentNames(): Record<string, string> {
  const [names, setNames] = useState<Record<string, string>>({});
  useEffect(() => {
    void casesApi.listResidentDirectory().then((residents) => {
      setNames(Object.fromEntries(residents.map((r) => [r.id, r.name])));
    });
  }, []);
  return names;
}

const ANOMALY_LABELS: Record<AnomalyType, string> = {
  EXPECTED_AND_CONFIRMED: 'Expected and confirmed',
  EXPECTED_NOT_PRESENT: 'Expected, not present',
  PRESENT_WRONG_BED: 'Present, wrong bed',
  PRESENT_WRONG_ROOM: 'Present, wrong room',
  UNAUTHORISED_PERSON_PRESENT: 'Unauthorised person present',
  DUPLICATE_OCCUPANCY_SUSPECTED: 'Duplicate occupancy suspected',
  BED_PHYSICALLY_EMPTY_BUT_SYSTEM_OCCUPIED: 'Bed empty but system shows occupied',
  OCCUPANT_PRESENT_BUT_SYSTEM_EMPTY: 'Occupant present but system shows empty',
  RESIDENT_ON_APPROVED_ABSENCE: 'Resident on approved absence',
  TEMPORARY_RELOCATION_NOT_SYNCED: 'Temporary relocation not synced',
  IDENTITY_UNVERIFIED: 'Identity not verified',
  ROOM_ACCESS_NOT_COMPLETED: 'Room access not completed',
  DATA_CORRECTION_REQUIRED: 'Data correction required',
};

export function OccupancyVerification() {
  const residentNames = useResidentNames();
  const [hostels, setHostels] = useState<Hostel[]>([]);
  const [sessions, setSessions] = useState<VerificationSession[]>([]);
  const [mismatches, setMismatches] = useState<VerificationEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [openSheetOpen, setOpenSheetOpen] = useState(false);
  const [sessionTarget, setSessionTarget] = useState<VerificationSession | null>(null);

  async function load() {
    setLoading(true);
    const [hostelList, sessionList, mismatchList] = await Promise.all([
      structureApi.listHostels(),
      verifyApi.listSessions(),
      verifyApi.listUnresolvedMismatches(),
    ]);
    setHostels(hostelList);
    setSessions(sessionList);
    setMismatches(mismatchList);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <div>
      <PageHeader
        title="Occupancy Verification"
        description="Does the room-by-room reality match the system record?"
        action={<Button onClick={() => setOpenSheetOpen(true)}>Open a verification session</Button>}
      />

      {loading ? (
        <PageSpinner />
      ) : (
        <>
          {mismatches.length > 0 && (
            <Card tone="warning" className="mb-6">
              <CardHeader>
                <p className="text-sm font-medium text-amber-800">Unresolved mismatches ({mismatches.length})</p>
              </CardHeader>
              <CardBody>
                <ul className="divide-y divide-slate-100">
                  {mismatches.map((m) => (
                    <li key={m.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                      <div>
                        <p className="text-slate-700">
                          {m.studentId ? (residentNames[m.studentId] ?? m.studentId.slice(0, 8)) : 'Unknown person'} —{' '}
                          {ANOMALY_LABELS[m.anomalyType]}
                        </p>
                        {m.evidenceNotes && <p className="text-xs text-slate-500">{m.evidenceNotes}</p>}
                      </div>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => void verifyApi.markReferredToTransfer(m.id).then(load)}
                      >
                        Mark referred to transfer
                      </Button>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          )}

          <h2 className="mb-3 text-sm font-semibold text-slate-900">Sessions</h2>
          {sessions.length === 0 ? (
            <EmptyState icon={<ClipboardIcon className="h-8 w-8" />} title="No sessions yet" description="Open a verification session above to start." />
          ) : (
            <Card>
              <ul className="divide-y divide-slate-100">
                {sessions.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left sm:px-5"
                      onClick={() => setSessionTarget(s)}
                    >
                      <div className="text-sm">
                        <p className="flex items-center gap-2">
                          <StatusPill status={s.status} />
                          <span className="text-slate-700">{s.verificationType.replace(/_/g, ' ')}</span>
                          <span className="text-xs text-slate-500">{s.scopeType}</span>
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500">{s.sessionDate}</p>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}

      {openSheetOpen && (
        <OpenSessionSheet hostels={hostels} onClose={() => setOpenSheetOpen(false)} onOpened={load} />
      )}
      {sessionTarget && (
        <SessionDetailSheet sessionId={sessionTarget.id} onClose={() => setSessionTarget(null)} onChanged={load} />
      )}
    </div>
  );
}

function OpenSessionSheet({ hostels, onClose, onOpened }: { hostels: Hostel[]; onClose: () => void; onOpened: () => void }) {
  const [hostelId, setHostelId] = useState(hostels[0]?.id ?? '');
  const [verificationType, setVerificationType] = useState<VerificationType>('scheduled');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      // Whole-hostel scope only in this UI — room/floor scoping exists in
      // the API but needs a Structure picker, a real further step (same
      // deliberate cut Safety.tsx's Plan-a-drill sheet already makes).
      await verifyApi.openSession({ scopeType: 'hostel', scopeId: hostelId, verificationType, notes: notes || undefined });
      onOpened();
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
      title="Open a verification session"
      footer={
        <Button fullWidth onClick={() => void handleSubmit()} disabled={submitting || !hostelId}>
          {submitting ? 'Opening…' : 'Open session'}
        </Button>
      }
    >
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <FieldWrapper label="Hostel" htmlFor="ov-hostel" required>
          <Select id="ov-hostel" value={hostelId} onChange={(e) => setHostelId(e.target.value)}>
            {hostels.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
          </Select>
        </FieldWrapper>
        <FieldWrapper label="Verification type" htmlFor="ov-type">
          <Select id="ov-type" value={verificationType} onChange={(e) => setVerificationType(e.target.value as VerificationType)}>
            <option value="scheduled">Scheduled</option>
            <option value="floor">Floor sweep</option>
            <option value="spot">Spot check</option>
            <option value="post_migration">Post-migration</option>
            <option value="post_transfer">Post-transfer</option>
            <option value="post_holiday">Post-holiday return</option>
            <option value="emergency">Emergency/safety-directed</option>
            <option value="audit_directed">Audit-directed</option>
          </Select>
        </FieldWrapper>
        <FieldWrapper label="Notes" htmlFor="ov-notes" hint="Optional">
          <Textarea id="ov-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </FieldWrapper>
      </div>
    </Sheet>
  );
}

function SessionDetailSheet({ sessionId, onClose, onChanged }: { sessionId: string; onClose: () => void; onChanged: () => void }) {
  const residentNames = useResidentNames();
  const [session, setSession] = useState<VerificationSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<string | null>(null);

  async function reload() {
    setSession(await verifyApi.getSession(sessionId));
  }

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  async function mark(entry: VerificationEntry, presenceStatus: PresenceStatus, anomalyType: AnomalyType) {
    setSubmitting(entry.id);
    setError(null);
    try {
      await verifyApi.markEntry(sessionId, { entryId: entry.id, presenceStatus, anomalyType });
      await reload();
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(null);
    }
  }

  async function close() {
    setSubmitting('close');
    setError(null);
    try {
      await verifyApi.closeSession(sessionId);
      await reload();
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(null);
    }
  }

  if (!session) {
    return (
      <Sheet open onClose={onClose} title="Verification session">
        <PageSpinner />
      </Sheet>
    );
  }

  return (
    <Sheet open onClose={onClose} title={`Verification — ${session.verificationType.replace(/_/g, ' ')}`}>
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <p className="text-sm text-slate-600">
          <StatusPill status={session.status} /> — {session.sessionDate}
        </p>
        <ul className="space-y-2">
          {(session.entries ?? []).map((e) => (
            <li key={e.id} className="rounded-lg border border-slate-200 p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-slate-900">
                  {e.studentId ? (residentNames[e.studentId] ?? e.studentId.slice(0, 8)) : 'Unknown'}
                </span>
                <StatusPill status={e.presenceStatus} />
              </div>
              <p className="mt-1 text-xs text-slate-500">{ANOMALY_LABELS[e.anomalyType]}</p>
              {session.status === 'open' && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Button size="sm" variant="secondary" onClick={() => void mark(e, 'observed', 'EXPECTED_AND_CONFIRMED')} disabled={Boolean(submitting)}>
                    Confirmed
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => void mark(e, 'not_observed', 'EXPECTED_NOT_PRESENT')} disabled={Boolean(submitting)}>
                    Not present
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => void mark(e, 'observed', 'PRESENT_WRONG_BED')} disabled={Boolean(submitting)}>
                    Wrong bed
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => void mark(e, 'not_observed', 'UNAUTHORISED_PERSON_PRESENT')} disabled={Boolean(submitting)}>
                    Unauthorised person found
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
        {session.status === 'open' && (
          <Button fullWidth onClick={() => void close()} disabled={Boolean(submitting)}>
            {submitting === 'close' ? 'Closing…' : 'Close session'}
          </Button>
        )}
      </div>
    </Sheet>
  );
}
