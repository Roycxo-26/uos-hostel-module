import { useEffect, useState } from 'react';
import * as commonAreasApi from '../api/commonAreas';
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
import { WrenchIcon } from '../design-system/icons';
import { errorMessage } from '../lib/errorMessage';
import type {
  CommonArea,
  CommonAreaType,
  Hostel,
  OutageScopeType,
  OutageSeverity,
  OutageType,
  PestControlTreatment,
  UtilityOutage,
} from '../types';

/** HOSTEL-GAP-ANALYSIS.md D17.19 (TODO.md Batch 19) — shared spaces,
 * cleaning checks, building-wide outages, and pest control. The one
 * capability with no existing Structure master to build on, per the gap
 * ledger's own note. Staff-only (route-guarded in App.tsx). */
const AREA_TYPE_LABELS: Record<CommonAreaType, string> = {
  washroom: 'Washroom',
  bathing_area: 'Bathing area',
  corridor: 'Corridor',
  drinking_water: 'Drinking water point',
  study_room: 'Study room',
  recreation: 'Recreation room',
  gym: 'Gym',
  terrace: 'Terrace/balcony',
  common_kitchen: 'Common kitchen',
  laundry_area: 'Laundry area',
  visitor_waiting: 'Visitor waiting area',
  prayer_room: 'Prayer/quiet room',
  garden: 'Garden/courtyard',
  lift: 'Lift',
  other: 'Other',
};

type Tab = 'areas' | 'outages' | 'pest';

export function CommonAreas() {
  const [tab, setTab] = useState<Tab>('areas');
  const [hostels, setHostels] = useState<Hostel[]>([]);

  useEffect(() => {
    void structureApi.listHostels().then(setHostels);
  }, []);

  return (
    <div>
      <PageHeader title="Common Areas &amp; Utilities" description="Shared spaces, cleaning checks, outages and pest control." />

      <div className="mb-6 flex gap-1 border-b border-slate-200">
        {(
          [
            ['areas', 'Common Areas'],
            ['outages', 'Utility Outages'],
            ['pest', 'Pest Control'],
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

      {tab === 'areas' && <AreasTab hostels={hostels} />}
      {tab === 'outages' && <OutagesTab hostels={hostels} />}
      {tab === 'pest' && <PestTab />}
    </div>
  );
}

// ============================================================================
// Common Areas
// ============================================================================

function AreasTab({ hostels }: { hostels: Hostel[] }) {
  const [areas, setAreas] = useState<CommonArea[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [target, setTarget] = useState<CommonArea | null>(null);

  async function load() {
    setLoading(true);
    setAreas(await commonAreasApi.listCommonAreas());
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => setCreateOpen(true)}>Add a common area</Button>
      </div>
      {loading ? (
        <PageSpinner />
      ) : areas.length === 0 ? (
        <EmptyState icon={<WrenchIcon className="h-8 w-8" />} title="No common areas yet" description="Add a washroom, study room, corridor, etc. above." />
      ) : (
        <Card>
          <ul className="divide-y divide-slate-100">
            {areas.map((a) => (
              <li key={a.id}>
                <button type="button" className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left sm:px-5" onClick={() => setTarget(a)}>
                  <div className="text-sm">
                    <p className="flex items-center gap-2">
                      <StatusPill status={a.status} />
                      <span className="font-medium text-slate-900">{a.name}</span>
                      <span className="text-xs text-slate-500">{AREA_TYPE_LABELS[a.areaType]}</span>
                    </p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {createOpen && <CreateAreaSheet hostels={hostels} onClose={() => setCreateOpen(false)} onCreated={load} />}
      {target && <AreaDetailSheet area={target} onClose={() => setTarget(null)} onChanged={load} />}
    </div>
  );
}

function CreateAreaSheet({ hostels, onClose, onCreated }: { hostels: Hostel[]; onClose: () => void; onCreated: () => void }) {
  const [hostelId, setHostelId] = useState(hostels[0]?.id ?? '');
  const [areaType, setAreaType] = useState<CommonAreaType>('washroom');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      await commonAreasApi.createCommonArea({ hostelId, areaType, name });
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
      title="Add a common area"
      footer={
        <Button fullWidth onClick={() => void handleSubmit()} disabled={submitting || !hostelId || !name.trim()}>
          {submitting ? 'Adding…' : 'Add area'}
        </Button>
      }
    >
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <FieldWrapper label="Hostel" htmlFor="ca-hostel" required>
          <Select id="ca-hostel" value={hostelId} onChange={(e) => setHostelId(e.target.value)}>
            {hostels.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
          </Select>
        </FieldWrapper>
        <FieldWrapper label="Type" htmlFor="ca-type">
          <Select id="ca-type" value={areaType} onChange={(e) => setAreaType(e.target.value as CommonAreaType)}>
            {Object.entries(AREA_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </FieldWrapper>
        <FieldWrapper label="Name" htmlFor="ca-name" required hint="e.g. 2nd Floor Washroom">
          <Input id="ca-name" value={name} onChange={(e) => setName(e.target.value)} />
        </FieldWrapper>
      </div>
    </Sheet>
  );
}

function AreaDetailSheet({ area, onClose, onChanged }: { area: CommonArea; onClose: () => void; onChanged: () => void }) {
  const [full, setFull] = useState<CommonArea | null>(null);
  const [score, setScore] = useState(5);
  const [pestIndicator, setPestIndicator] = useState(false);
  const [correctiveActionNeeded, setCorrectiveActionNeeded] = useState(false);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<string | null>(null);

  async function reload() {
    setFull(await commonAreasApi.getCommonArea(area.id));
  }

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [area.id]);

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

  return (
    <Sheet open onClose={onClose} title={area.name}>
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <p className="text-sm text-slate-600">
          <StatusPill status={area.status} /> — {AREA_TYPE_LABELS[area.areaType]}
        </p>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={() => void run('operational', () => commonAreasApi.updateCommonAreaStatus(area.id, 'operational'))} disabled={Boolean(submitting)}>
            Mark operational
          </Button>
          <Button size="sm" variant="danger" onClick={() => void run('maintenance', () => commonAreasApi.updateCommonAreaStatus(area.id, 'under_maintenance'))} disabled={Boolean(submitting)}>
            Mark under maintenance
          </Button>
        </div>

        <div className="rounded-lg border border-slate-200 p-3">
          <p className="mb-2 text-sm font-medium text-slate-900">Record a sanitation inspection</p>
          <FieldWrapper label="Cleanliness score (1-5)" htmlFor="ai-score">
            <Input id="ai-score" type="number" min={1} max={5} value={score} onChange={(e) => setScore(Number(e.target.value))} />
          </FieldWrapper>
          <label className="mt-2 flex items-center gap-2 text-xs text-slate-600">
            <input type="checkbox" checked={pestIndicator} onChange={(e) => setPestIndicator(e.target.checked)} className="h-3.5 w-3.5 rounded border-slate-300 text-accent" />
            Pest indicator found
          </label>
          <label className="mt-1 flex items-center gap-2 text-xs text-slate-600">
            <input type="checkbox" checked={correctiveActionNeeded} onChange={(e) => setCorrectiveActionNeeded(e.target.checked)} className="h-3.5 w-3.5 rounded border-slate-300 text-accent" />
            Needs corrective action
          </label>
          <div className="mt-2">
            <Textarea placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <Button
            size="sm"
            className="mt-2"
            onClick={() =>
              void run('inspect', () =>
                commonAreasApi.recordInspection({
                  commonAreaId: area.id,
                  cleanlinessScore: score,
                  pestIndicator,
                  correctiveActionNeeded,
                  correctiveActionNotes: notes || undefined,
                })
              )
            }
            disabled={Boolean(submitting)}
          >
            Record inspection
          </Button>
        </div>

        {full?.inspections && full.inspections.length > 0 && (
          <div>
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">Recent inspections</p>
            <ul className="space-y-1 text-sm">
              {full.inspections.slice(0, 5).map((insp) => (
                <li key={insp.id} className="flex items-center gap-2">
                  <StatusPill status={insp.status} />
                  <span className="text-slate-600">Score {insp.cleanlinessScore}/5 — {new Date(insp.inspectedAt).toLocaleDateString()}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Sheet>
  );
}

// ============================================================================
// Utility Outages
// ============================================================================

const OUTAGE_TYPE_LABELS: Record<OutageType, string> = {
  water_shortage: 'Water shortage',
  drinking_water: 'Drinking water issue',
  hot_water: 'Hot water failure',
  electricity: 'Electricity failure',
  generator_backup: 'Generator/backup power',
  lift: 'Lift outage',
  internet: 'Internet/network',
  sewage_drainage: 'Sewage/drainage',
  sanitation_closure: 'Sanitation closure',
  gas_fuel: 'Gas/fuel',
  other: 'Other',
};

function OutagesTab({ hostels }: { hostels: Hostel[] }) {
  const [outages, setOutages] = useState<UtilityOutage[]>([]);
  const [loading, setLoading] = useState(true);
  const [reportOpen, setReportOpen] = useState(false);
  const [target, setTarget] = useState<UtilityOutage | null>(null);

  async function load() {
    setLoading(true);
    setOutages(await commonAreasApi.listOutages());
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <Button variant="danger" onClick={() => setReportOpen(true)}>
          Report an outage
        </Button>
      </div>
      {loading ? (
        <PageSpinner />
      ) : outages.length === 0 ? (
        <EmptyState icon={<WrenchIcon className="h-8 w-8" />} title="No outages on record" description="Report one above." />
      ) : (
        <Card>
          <ul className="divide-y divide-slate-100">
            {outages.map((o) => (
              <li key={o.id}>
                <button type="button" className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left sm:px-5" onClick={() => setTarget(o)}>
                  <div className="text-sm">
                    <p className="flex items-center gap-2">
                      <StatusPill status={o.status} />
                      <span className="font-medium text-slate-900">{OUTAGE_TYPE_LABELS[o.outageType]}</span>
                      <span className="text-xs text-slate-500">{o.severity}</span>
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">{o.affectedPopulationCount ?? 0} resident(s) affected</p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {reportOpen && <ReportOutageSheet hostels={hostels} onClose={() => setReportOpen(false)} onReported={load} />}
      {target && <OutageDetailSheet outage={target} onClose={() => setTarget(null)} onChanged={load} />}
    </div>
  );
}

function ReportOutageSheet({ hostels, onClose, onReported }: { hostels: Hostel[]; onClose: () => void; onReported: () => void }) {
  const [hostelId, setHostelId] = useState(hostels[0]?.id ?? '');
  const [outageType, setOutageType] = useState<OutageType>('water_shortage');
  const [severity, setSeverity] = useState<OutageSeverity>('minor');
  const [alternativeArrangement, setAlternativeArrangement] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      // Whole-hostel scope only in this UI — same deliberate cut Batches
      // 16/17's own scope pickers already made.
      await commonAreasApi.reportOutage({
        hostelId,
        scopeType: 'hostel' as OutageScopeType,
        scopeId: hostelId,
        outageType,
        severity,
        alternativeArrangement: alternativeArrangement || undefined,
      });
      onReported();
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
      title="Report a utility outage"
      footer={
        <Button fullWidth variant="danger" onClick={() => void handleSubmit()} disabled={submitting || !hostelId}>
          {submitting ? 'Reporting…' : 'Report — notifies affected residents now'}
        </Button>
      }
    >
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <FieldWrapper label="Hostel" htmlFor="ro-hostel" required>
          <Select id="ro-hostel" value={hostelId} onChange={(e) => setHostelId(e.target.value)}>
            {hostels.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
          </Select>
        </FieldWrapper>
        <FieldWrapper label="Type" htmlFor="ro-type">
          <Select id="ro-type" value={outageType} onChange={(e) => setOutageType(e.target.value as OutageType)}>
            {Object.entries(OUTAGE_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </FieldWrapper>
        <FieldWrapper label="Severity" htmlFor="ro-severity">
          <Select id="ro-severity" value={severity} onChange={(e) => setSeverity(e.target.value as OutageSeverity)}>
            <option value="minor">Minor</option>
            <option value="major">Major</option>
            <option value="critical">Critical</option>
          </Select>
        </FieldWrapper>
        <FieldWrapper label="Alternative arrangement" htmlFor="ro-alt" hint="Optional — e.g. water tanker at the front gate">
          <Textarea id="ro-alt" value={alternativeArrangement} onChange={(e) => setAlternativeArrangement(e.target.value)} />
        </FieldWrapper>
      </div>
    </Sheet>
  );
}

function OutageDetailSheet({ outage, onClose, onChanged }: { outage: UtilityOutage; onClose: () => void; onChanged: () => void }) {
  const [full, setFull] = useState<UtilityOutage | null>(null);
  const [newEta, setNewEta] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<string | null>(null);

  async function reload() {
    setFull(await commonAreasApi.getOutage(outage.id));
  }

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outage.id]);

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

  return (
    <Sheet open onClose={onClose} title={OUTAGE_TYPE_LABELS[outage.outageType]}>
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <p className="text-sm text-slate-600">
          <StatusPill status={outage.status} /> — {outage.affectedPopulationCount ?? 0} resident(s) affected
        </p>
        {outage.status === 'notified' && (
          <>
            <FieldWrapper label="Update ETA" htmlFor="od-eta">
              <div className="flex gap-2">
                <Input id="od-eta" type="datetime-local" value={newEta} onChange={(e) => setNewEta(e.target.value)} className="flex-1" />
                <Button size="sm" variant="secondary" onClick={() => void run('eta', () => commonAreasApi.updateOutageEta(outage.id, new Date(newEta).toISOString()))} disabled={!newEta || Boolean(submitting)}>
                  Update
                </Button>
              </div>
            </FieldWrapper>
            <Button fullWidth onClick={() => void run('restore', () => commonAreasApi.restoreOutage(outage.id))} disabled={Boolean(submitting)}>
              Mark restored
            </Button>
          </>
        )}
        {outage.status === 'restored' && (
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => void run('verify', () => commonAreasApi.verifyOutage(outage.id))} disabled={Boolean(submitting)}>
              Verify restoration
            </Button>
            <Button size="sm" onClick={() => void run('close', () => commonAreasApi.closeOutage(outage.id))} disabled={Boolean(submitting)}>
              Close
            </Button>
          </div>
        )}
        {outage.status === 'verified' && (
          <Button fullWidth onClick={() => void run('close', () => commonAreasApi.closeOutage(outage.id))} disabled={Boolean(submitting)}>
            Close
          </Button>
        )}

        {full?.updates && full.updates.length > 0 && (
          <div>
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">Update history</p>
            <ul className="space-y-1 text-xs text-slate-600">
              {full.updates.map((u) => (
                <li key={u.id}>
                  [{new Date(u.createdAt).toLocaleString()}] {u.updateType}: {u.oldValue ?? '—'} → {u.newValue ?? '—'}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Sheet>
  );
}

// ============================================================================
// Pest Control
// ============================================================================

function PestTab() {
  const [treatments, setTreatments] = useState<PestControlTreatment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState<PestControlTreatment | null>(null);
  const [reportOpen, setReportOpen] = useState(false);

  async function load() {
    setLoading(true);
    setTreatments(await commonAreasApi.listPestTreatments());
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => setReportOpen(true)}>Report a finding</Button>
      </div>
      {error && <Alert>{error}</Alert>}
      {loading ? (
        <PageSpinner />
      ) : treatments.length === 0 ? (
        <EmptyState icon={<WrenchIcon className="h-8 w-8" />} title="No pest findings on record" description="Report one above." />
      ) : (
        <Card>
          <ul className="divide-y divide-slate-100">
            {treatments.map((t) => (
              <li key={t.id}>
                <button type="button" className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left sm:px-5" onClick={() => setTarget(t)}>
                  <div className="text-sm">
                    <p>
                      <StatusPill status={t.status} />
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">{t.findingNotes}</p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {reportOpen && <ReportPestFindingSheet onClose={() => setReportOpen(false)} onReported={load} />}
      {target && <PestDetailSheet treatment={target} onClose={() => setTarget(null)} onChanged={load} />}
    </div>
  );
}

function ReportPestFindingSheet({ onClose, onReported }: { onClose: () => void; onReported: () => void }) {
  const [rooms, setRooms] = useState<{ id: string; label: string }[]>([]);
  const [scopeId, setScopeId] = useState('');
  const [findingNotes, setFindingNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    void (async () => {
      const hostels = await structureApi.listHostels();
      const trees = await Promise.all(hostels.map((h) => structureApi.getHostelTree(h.id)));
      const options: { id: string; label: string }[] = [];
      for (const tree of trees) {
        for (const block of tree.blocks) {
          for (const floor of block.floors) {
            for (const room of floor.rooms) {
              options.push({ id: room.id, label: `${tree.name} / ${block.code} / Fl.${floor.number} / ${room.code}` });
            }
          }
        }
      }
      setRooms(options);
    })();
  }, []);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      await commonAreasApi.reportPestFinding({ scopeType: 'room', scopeId, findingNotes });
      onReported();
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
      title="Report a pest finding"
      footer={
        <Button fullWidth onClick={() => void handleSubmit()} disabled={submitting || !scopeId || !findingNotes.trim()}>
          {submitting ? 'Reporting…' : 'Report finding'}
        </Button>
      }
    >
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <FieldWrapper label="Room" htmlFor="pf-room" required>
          <Select id="pf-room" value={scopeId} onChange={(e) => setScopeId(e.target.value)}>
            <option value="">Select a room</option>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </Select>
        </FieldWrapper>
        <FieldWrapper label="Finding" htmlFor="pf-notes" required>
          <Textarea id="pf-notes" value={findingNotes} onChange={(e) => setFindingNotes(e.target.value)} />
        </FieldWrapper>
      </div>
    </Sheet>
  );
}

function PestDetailSheet({ treatment, onClose, onChanged }: { treatment: PestControlTreatment; onClose: () => void; onChanged: () => void }) {
  const [scheduledAt, setScheduledAt] = useState('');
  const [result, setResult] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<string | null>(null);

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
    <Sheet open onClose={onClose} title="Pest control treatment">
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <p className="text-sm text-slate-600">
          <StatusPill status={treatment.status} />
        </p>
        <p className="text-sm text-slate-700">{treatment.findingNotes}</p>

        {treatment.status === 'finding_reported' && (
          <FieldWrapper label="Schedule treatment" htmlFor="pd-schedule">
            <div className="flex gap-2">
              <Input id="pd-schedule" type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} className="flex-1" />
              <Button
                size="sm"
                onClick={() => void run('schedule', () => commonAreasApi.schedulePestTreatment(treatment.id, { scheduledAt: new Date(scheduledAt).toISOString() }))}
                disabled={!scheduledAt || Boolean(submitting)}
              >
                Schedule
              </Button>
            </div>
          </FieldWrapper>
        )}
        {treatment.status === 'scheduled' && (
          <Button fullWidth onClick={() => void run('notify', () => commonAreasApi.notifyResidentsForPest(treatment.id))} disabled={Boolean(submitting)}>
            Notify residents
          </Button>
        )}
        {treatment.status === 'resident_notified' && (
          <Button fullWidth onClick={() => void run('treat', () => commonAreasApi.recordPestTreatment(treatment.id))} disabled={Boolean(submitting)}>
            Record treatment performed
          </Button>
        )}
        {treatment.status === 'treated' && (
          <FieldWrapper label="Reinspection result" htmlFor="pd-result">
            <Textarea id="pd-result" value={result} onChange={(e) => setResult(e.target.value)} />
            <div className="mt-2 flex gap-2">
              <Button size="sm" onClick={() => void run('pass', () => commonAreasApi.reinspectPest(treatment.id, result, true))} disabled={!result.trim() || Boolean(submitting)}>
                Passed — close
              </Button>
              <Button size="sm" variant="danger" onClick={() => void run('fail', () => commonAreasApi.reinspectPest(treatment.id, result, false))} disabled={!result.trim() || Boolean(submitting)}>
                Still an issue
              </Button>
            </div>
          </FieldWrapper>
        )}
      </div>
    </Sheet>
  );
}
