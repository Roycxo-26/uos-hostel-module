import { useEffect, useState } from 'react';
import * as casesApi from '../api/cases';
import * as safetyApi from '../api/safety';
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
import { AlertIcon } from '../design-system/icons';
import { errorMessage } from '../lib/errorMessage';
import type { EvacuationDrill, Hostel, SafetyStatus } from '../types';

/** HOSTEL-GAP-ANALYSIS.md D17.11 + D17.17 (TODO.md Batch 16) — the BRD's
 * own #1 P0 Red-Team finding. Everything on this page is staff-only
 * (route-guarded in App.tsx), matching the backend's safety:manage gate on
 * every mutating action here. */
function useResidentNames(): Record<string, string> {
  const [names, setNames] = useState<Record<string, string>>({});
  useEffect(() => {
    void casesApi.listResidentDirectory().then((residents) => {
      setNames(Object.fromEntries(residents.map((r) => [r.id, r.name])));
    });
  }, []);
  return names;
}

const SAFETY_STATUS_OPTIONS: SafetyStatus[] = [
  'NOT_ASSESSED',
  'COMPLIANT_CURRENT',
  'INSPECTION_DUE',
  'FINDING_OPEN_NON_CRITICAL',
  'FINDING_OPEN_CRITICAL',
  'SAFETY_RESTRICTION_ACTIVE',
  'EVACUATION_READINESS_DEGRADED',
  'CERTIFICATE_EXPIRED_OR_UNKNOWN',
  'MANUAL_VERIFICATION_REQUIRED',
  'CLOSED_FOR_SAFETY',
];

const CRITICAL_STATUSES = new Set(['FINDING_OPEN_CRITICAL', 'SAFETY_RESTRICTION_ACTIVE', 'EVACUATION_READINESS_DEGRADED', 'CLOSED_FOR_SAFETY']);

export function Safety() {
  const [hostels, setHostels] = useState<Hostel[]>([]);
  const [hostelId, setHostelId] = useState('');
  const [drills, setDrills] = useState<EvacuationDrill[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusSheetOpen, setStatusSheetOpen] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const [emergencyOpen, setEmergencyOpen] = useState(false);
  const [drillTarget, setDrillTarget] = useState<EvacuationDrill | null>(null);

  const hostel = hostels.find((h) => h.id === hostelId);

  async function load(currentHostelId?: string) {
    setLoading(true);
    const list = await structureApi.listHostels();
    setHostels(list);
    const id = currentHostelId ?? hostelId ?? list[0]?.id;
    if (id) {
      setHostelId(id);
      setDrills(await safetyApi.listDrills({ hostelId: id }));
    }
    setLoading(false);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function switchHostel(id: string) {
    setHostelId(id);
    setLoading(true);
    setDrills(await safetyApi.listDrills({ hostelId: id }));
    setLoading(false);
  }

  return (
    <div>
      <PageHeader
        title="Fire & Safety"
        description="Safety status, evacuation drills and emergency muster."
        action={
          hostel && (
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button variant="secondary" onClick={() => setPlanOpen(true)}>
                Plan a drill
              </Button>
              <Button variant="danger" onClick={() => setEmergencyOpen(true)}>
                Trigger emergency muster
              </Button>
            </div>
          )
        }
      />

      {loading ? (
        <PageSpinner />
      ) : hostels.length === 0 ? (
        <EmptyState icon={<AlertIcon className="h-8 w-8" />} title="No hostels configured" description="Set up a hostel in Structure first." />
      ) : (
        <>
          <div className="mb-5 max-w-xs">
            <FieldWrapper label="Hostel" htmlFor="safety-hostel">
              <Select id="safety-hostel" value={hostelId} onChange={(e) => void switchHostel(e.target.value)}>
                {hostels.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))}
              </Select>
            </FieldWrapper>
          </div>

          {hostel && (
            <Card tone={CRITICAL_STATUSES.has(hostel.safetyStatus) ? 'warning' : 'default'} className="mb-6">
              <CardHeader className="flex items-center justify-between">
                <p className="text-sm font-medium text-slate-900">Safety status</p>
                <Button size="sm" variant="secondary" onClick={() => setStatusSheetOpen(true)}>
                  Update status
                </Button>
              </CardHeader>
              <CardBody className="space-y-2 text-sm">
                <p>
                  <StatusPill status={hostel.safetyStatus} />
                </p>
                {hostel.safetyStatusOwner && <p className="text-slate-600">Owner: {hostel.safetyStatusOwner}</p>}
                {hostel.safetyDataAsOf ? (
                  <p className="text-slate-500">As of {new Date(hostel.safetyDataAsOf).toLocaleString()}</p>
                ) : (
                  <p className="text-slate-500">Never assessed — no data-as-of date on record.</p>
                )}
                {hostel.safetyProfile?.assemblyPoints && hostel.safetyProfile.assemblyPoints.length > 0 && (
                  <p className="text-slate-600">Assembly points: {hostel.safetyProfile.assemblyPoints.join(', ')}</p>
                )}
              </CardBody>
            </Card>
          )}

          <h2 className="mb-3 text-sm font-semibold text-slate-900">Drills &amp; musters</h2>
          {drills.length === 0 ? (
            <EmptyState icon={<AlertIcon className="h-8 w-8" />} title="No drills yet" description="Plan a drill or trigger an emergency muster above." />
          ) : (
            <Card>
              <ul className="divide-y divide-slate-100">
                {drills.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
                    <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setDrillTarget(d)}>
                      <p className="flex items-center gap-2 text-sm">
                        {d.drillType === 'real_emergency' && (
                          <span className="inline-flex items-center rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-medium text-rose-700">EMERGENCY</span>
                        )}
                        <StatusPill status={d.status} />
                        <span className="text-slate-500">{d.scopeType}</span>
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {d.plannedDate ? `Planned ${d.plannedDate}` : d.startedAt ? `Started ${new Date(d.startedAt).toLocaleString()}` : 'Not started'}
                        {d.status === 'completed' && d.unresolvedCount > 0 && (
                          <span className="ml-2 font-medium text-rose-600">{d.unresolvedCount} unresolved</span>
                        )}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}

      {hostel && statusSheetOpen && (
        <SafetyStatusSheet hostel={hostel} onClose={() => setStatusSheetOpen(false)} onSaved={() => load(hostelId)} />
      )}
      {hostel && planOpen && <PlanDrillSheet hostelId={hostel.id} onClose={() => setPlanOpen(false)} onPlanned={() => load(hostelId)} />}
      {hostel && emergencyOpen && (
        <EmergencyMusterSheet hostelId={hostel.id} onClose={() => setEmergencyOpen(false)} onTriggered={() => load(hostelId)} />
      )}
      {drillTarget && <DrillDetailSheet drillId={drillTarget.id} onClose={() => setDrillTarget(null)} onChanged={() => load(hostelId)} />}
    </div>
  );
}

function SafetyStatusSheet({ hostel, onClose, onSaved }: { hostel: Hostel; onClose: () => void; onSaved: () => void }) {
  const [status, setStatus] = useState<SafetyStatus>(hostel.safetyStatus);
  const [owner, setOwner] = useState(hostel.safetyStatusOwner ?? '');
  const [dataAsOf, setDataAsOf] = useState(() => new Date().toISOString().slice(0, 16));
  const [assemblyPoints, setAssemblyPoints] = useState((hostel.safetyProfile?.assemblyPoints ?? []).join(', '));
  const [certificateReference, setCertificateReference] = useState(hostel.safetyProfile?.certificateReference ?? '');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      await safetyApi.updateSafetyStatus(hostel.id, {
        status,
        owner,
        dataAsOf: new Date(dataAsOf).toISOString(),
        profile: {
          ...hostel.safetyProfile,
          certificateReference: certificateReference || undefined,
          assemblyPoints: assemblyPoints
            ? assemblyPoints.split(',').map((a) => a.trim()).filter(Boolean)
            : undefined,
        },
      });
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
      title="Update safety status"
      footer={
        <Button fullWidth onClick={() => void handleSubmit()} disabled={submitting || !owner.trim()}>
          {submitting ? 'Saving…' : 'Save status'}
        </Button>
      }
    >
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <FieldWrapper label="Status" htmlFor="ss-status">
          <Select id="ss-status" value={status} onChange={(e) => setStatus(e.target.value as SafetyStatus)}>
            {SAFETY_STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s.replace(/_/g, ' ')}
              </option>
            ))}
          </Select>
        </FieldWrapper>
        <FieldWrapper label="Owner" htmlFor="ss-owner" required hint="Who's authoritative for this — a name, role, or team">
          <Input id="ss-owner" value={owner} onChange={(e) => setOwner(e.target.value)} />
        </FieldWrapper>
        <FieldWrapper label="Data as of" htmlFor="ss-dataasof" required hint="When this status was actually assessed — cannot be in the future">
          <Input id="ss-dataasof" type="datetime-local" value={dataAsOf} onChange={(e) => setDataAsOf(e.target.value)} />
        </FieldWrapper>
        <FieldWrapper label="Certificate reference" htmlFor="ss-cert" hint="Optional">
          <Input id="ss-cert" value={certificateReference} onChange={(e) => setCertificateReference(e.target.value)} />
        </FieldWrapper>
        <FieldWrapper label="Assembly points" htmlFor="ss-assembly" hint="Comma-separated, e.g. Front lawn, Block B car park">
          <Input id="ss-assembly" value={assemblyPoints} onChange={(e) => setAssemblyPoints(e.target.value)} />
        </FieldWrapper>
      </div>
    </Sheet>
  );
}

function PlanDrillSheet({ hostelId, onClose, onPlanned }: { hostelId: string; onClose: () => void; onPlanned: () => void }) {
  const [scopeType, setScopeType] = useState<'room' | 'floor' | 'hostel'>('hostel');
  const [plannedDate, setPlannedDate] = useState('');
  const [assemblyPoints, setAssemblyPoints] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      // Hostel-wide drills use the hostel id itself as scopeId — room/floor
      // scoped drills need picking a specific room/floor, which this
      // lightweight sheet doesn't offer yet (a real further step, same as
      // Headcount's own scope picker); scoping down to Structure to pick
      // one is the honest next step, not faked here.
      await safetyApi.planDrill({ hostelId, scopeType, scopeId: hostelId, plannedDate, assemblyPoints: assemblyPoints ? assemblyPoints.split(',').map((a) => a.trim()) : undefined });
      onPlanned();
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
      title="Plan an evacuation drill"
      footer={
        <Button fullWidth onClick={() => void handleSubmit()} disabled={submitting || !plannedDate}>
          {submitting ? 'Planning…' : 'Plan drill'}
        </Button>
      }
    >
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <FieldWrapper label="Scope" htmlFor="pd-scope">
          <Select id="pd-scope" value={scopeType} onChange={(e) => setScopeType(e.target.value as typeof scopeType)}>
            <option value="hostel">Whole hostel</option>
          </Select>
        </FieldWrapper>
        <FieldWrapper label="Planned date" htmlFor="pd-date" required>
          <Input id="pd-date" type="date" value={plannedDate} onChange={(e) => setPlannedDate(e.target.value)} />
        </FieldWrapper>
        <FieldWrapper label="Assembly points" htmlFor="pd-assembly" hint="Comma-separated">
          <Input id="pd-assembly" value={assemblyPoints} onChange={(e) => setAssemblyPoints(e.target.value)} />
        </FieldWrapper>
      </div>
    </Sheet>
  );
}

function EmergencyMusterSheet({ hostelId, onClose, onTriggered }: { hostelId: string; onClose: () => void; onTriggered: () => void }) {
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      await safetyApi.triggerEmergencyMuster({ hostelId, scopeType: 'hostel', scopeId: hostelId });
      onTriggered();
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
      title="Trigger emergency muster"
      footer={
        <Button fullWidth variant="danger" onClick={() => void handleSubmit()} disabled={submitting || !confirmed}>
          {submitting ? 'Triggering…' : 'Trigger emergency muster now'}
        </Button>
      }
    >
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <Alert>
          This immediately starts an emergency muster for the whole hostel — every campus staff member is notified at
          maximum urgency, and every checked-in resident is added to the roster to account for.
        </Alert>
        <label className="flex min-h-touch cursor-pointer items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-accent" />
          I confirm this is a real emergency, not a drill
        </label>
      </div>
    </Sheet>
  );
}

function DrillDetailSheet({ drillId, onClose, onChanged }: { drillId: string; onClose: () => void; onChanged: () => void }) {
  const residentNames = useResidentNames();
  const [drill, setDrill] = useState<EvacuationDrill | null>(null);
  const [findings, setFindings] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<string | null>(null);

  async function reload() {
    setDrill(await safetyApi.getDrill(drillId));
  }

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drillId]);

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

  if (!drill) {
    return (
      <Sheet open onClose={onClose} title="Drill">
        <PageSpinner />
      </Sheet>
    );
  }

  const unresolved = (drill.entries ?? []).filter((e) => e.status === 'unresolved');

  return (
    <Sheet open onClose={onClose} title={drill.drillType === 'real_emergency' ? 'Emergency muster' : 'Evacuation drill'}>
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <p className="text-sm text-slate-600">
          <StatusPill status={drill.status} /> — {drill.scopeType}
        </p>

        {drill.status === 'planned' && (
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => void run('validate', () => safetyApi.validateCoverage(drill.id))} disabled={Boolean(submitting)}>
              Validate coverage
            </Button>
            <Button size="sm" onClick={() => void run('start', () => safetyApi.startDrill(drill.id))} disabled={Boolean(submitting)}>
              Start drill
            </Button>
          </div>
        )}
        {drill.status === 'coverage_validated' && (
          <Button size="sm" onClick={() => void run('start', () => safetyApi.startDrill(drill.id))} disabled={Boolean(submitting)}>
            Start drill
          </Button>
        )}
        {['planned', 'coverage_validated'].includes(drill.status) && (
          <FieldWrapper label="Cancel reason" htmlFor="dd-cancel">
            <div className="flex gap-2">
              <Input id="dd-cancel" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} className="flex-1" />
              <Button
                size="sm"
                variant="danger"
                onClick={() => void run('cancel', () => safetyApi.cancelDrill(drill.id, cancelReason))}
                disabled={!cancelReason.trim() || Boolean(submitting)}
              >
                Cancel drill
              </Button>
            </div>
          </FieldWrapper>
        )}

        {drill.status === 'in_progress' && (
          <>
            <p className="text-sm font-medium text-slate-900">
              Roster ({(drill.entries ?? []).length}) — {unresolved.length} unresolved
            </p>
            <ul className="max-h-64 space-y-1.5 overflow-y-auto">
              {(drill.entries ?? []).map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-sm">
                  <span>{residentNames[e.studentId] ?? e.studentId.slice(0, 8)}</span>
                  <span className="flex items-center gap-2">
                    <StatusPill status={e.status} />
                    {e.status === 'unresolved' && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => void run(`entry-${e.studentId}`, () => safetyApi.markDrillEntry(drill.id, e.studentId, 'accounted_for'))}
                        disabled={Boolean(submitting)}
                      >
                        Accounted for
                      </Button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
            <FieldWrapper label="Findings" htmlFor="dd-findings" hint="Optional — response time, issues found, corrective actions needed">
              <Textarea id="dd-findings" value={findings} onChange={(e) => setFindings(e.target.value)} />
            </FieldWrapper>
            <Button fullWidth onClick={() => void run('complete', () => safetyApi.completeDrill(drill.id, findings || undefined))} disabled={Boolean(submitting)}>
              {submitting === 'complete' ? 'Completing…' : 'Complete drill'}
            </Button>
          </>
        )}

        {drill.status === 'completed' && (
          <>
            {drill.unresolvedCount > 0 && (
              <Alert>{drill.unresolvedCount} resident(s) remained unresolved when this was closed — escalated to emergency/safety command.</Alert>
            )}
            {drill.findings && <p className="text-sm text-slate-700">{drill.findings}</p>}
          </>
        )}
      </div>
    </Sheet>
  );
}
