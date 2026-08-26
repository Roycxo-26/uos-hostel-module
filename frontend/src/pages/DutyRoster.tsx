import { useEffect, useState } from 'react';
import * as casesApi from '../api/cases';
import * as dutyApi from '../api/dutyRoster';
import * as noticesApi from '../api/operationalNotices';
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
import { AlertIcon } from '../design-system/icons';
import { errorMessage } from '../lib/errorMessage';
import type { CoverageValidation, DutyPrivilegeType, Hostel, NoticeScopeType, NoticeSeverity, OperationalNotice, ResidentEmergencyCard } from '../types';
import type { ResponsibilityAssignment } from '../api/responsibilities';

/** HOSTEL-GAP-ANALYSIS.md D17.22 (TODO.md Batch 21) — who's on duty right
 * now, backup if they're not around, and critical notices with real
 * acknowledgement tracking. Staff-only (route-guarded in App.tsx). */
function useResidentNames(): Record<string, string> {
  const [names, setNames] = useState<Record<string, string>>({});
  useEffect(() => {
    void casesApi.listResidentDirectory().then((residents) => {
      setNames(Object.fromEntries(residents.map((r) => [r.id, r.name])));
    });
  }, []);
  return names;
}

const DUTY_LABELS: Record<DutyPrivilegeType, string> = {
  duty_warden: 'Duty Warden',
  floor_duty_officer: 'Floor Duty Officer',
  front_desk_shift: 'Front Desk Shift',
  security_contact: 'Security Contact',
  emergency_contact: 'Emergency Contact',
};

type Tab = 'roster' | 'notices' | 'emergency-card';

export function DutyRoster() {
  const [tab, setTab] = useState<Tab>('roster');
  const [hostels, setHostels] = useState<Hostel[]>([]);

  useEffect(() => {
    void structureApi.listHostels().then(setHostels);
  }, []);

  return (
    <div>
      <PageHeader title="Duty Roster &amp; Notices" description="Who's on duty, backup coverage, and acknowledgement-tracked critical notices." />

      <div className="mb-6 flex gap-1 border-b border-slate-200">
        {(
          [
            ['roster', 'Duty Roster'],
            ['notices', 'Notices'],
            ['emergency-card', 'Emergency Card'],
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

      {tab === 'roster' && <RosterTab hostels={hostels} />}
      {tab === 'notices' && <NoticesTab hostels={hostels} />}
      {tab === 'emergency-card' && <EmergencyCardTab />}
    </div>
  );
}

// ============================================================================
// Duty Roster
// ============================================================================

function RosterTab({ hostels }: { hostels: Hostel[] }) {
  const residentNames = useResidentNames();
  const [hostelId, setHostelId] = useState(hostels[0]?.id ?? '');
  const [assignments, setAssignments] = useState<ResponsibilityAssignment[]>([]);
  const [coverage, setCoverage] = useState<CoverageValidation | null>(null);
  const [loading, setLoading] = useState(true);
  const [assignOpen, setAssignOpen] = useState(false);

  async function load(id: string) {
    if (!id) return;
    setLoading(true);
    const [list, cov] = await Promise.all([dutyApi.listDutyAssignments('hostel', id), dutyApi.getCoverageValidation('hostel', id)]);
    setAssignments(list.filter((a) => a.scopeType === 'hostel' && a.status === 'active'));
    setCoverage(cov);
    setLoading(false);
  }

  useEffect(() => {
    if (hostels[0]?.id && !hostelId) setHostelId(hostels[0].id);
  }, [hostels, hostelId]);

  useEffect(() => {
    if (hostelId) void load(hostelId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hostelId]);

  return (
    <div>
      <div className="mb-4 flex items-end justify-between gap-3">
        <div className="max-w-xs flex-1">
          <FieldWrapper label="Hostel" htmlFor="dr-hostel">
            <Select id="dr-hostel" value={hostelId} onChange={(e) => setHostelId(e.target.value)}>
              {hostels.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </Select>
          </FieldWrapper>
        </div>
        <Button onClick={() => setAssignOpen(true)}>Assign duty</Button>
      </div>

      {loading ? (
        <PageSpinner />
      ) : (
        <>
          {coverage && (
            <Card tone={coverage.hasGaps ? 'warning' : 'default'} className="mb-6">
              <div className="p-4 sm:p-5">
                <p className="mb-2 text-sm font-medium text-slate-900">Coverage right now</p>
                <ul className="space-y-1.5 text-sm">
                  {coverage.resolutions.map((r) => (
                    <li key={r.privilegeType} className="flex items-center justify-between">
                      <span className="text-slate-700">{DUTY_LABELS[r.privilegeType]}</span>
                      {r.resolvedVia === 'unresolved' ? (
                        <span className="text-xs font-medium text-rose-600">No coverage — critical gap</span>
                      ) : (
                        <span className="text-xs text-slate-500">
                          {residentNames[r.resolvedUserId ?? ''] ?? r.resolvedUserId?.slice(0, 8)} ({r.resolvedVia.replace(/_/g, ' ')})
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            </Card>
          )}

          {assignments.length === 0 ? (
            <EmptyState icon={<AlertIcon className="h-8 w-8" />} title="No active duty assignments" description="Assign duty above." />
          ) : (
            <Card>
              <ul className="divide-y divide-slate-100">
                {assignments.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm sm:px-5">
                    <div>
                      <p className="font-medium text-slate-900">{DUTY_LABELS[a.privilegeType as DutyPrivilegeType] ?? a.privilegeType}</p>
                      <p className="text-xs text-slate-500">
                        {residentNames[a.assigneeUserId] ?? a.assigneeUserId.slice(0, 8)}
                        {a.substituteUserId && ` — backup: ${residentNames[a.substituteUserId] ?? a.substituteUserId.slice(0, 8)}`}
                      </p>
                    </div>
                    <p className="text-xs text-slate-500">
                      {new Date(a.effectiveFrom).toLocaleString()} – {a.effectiveTo ? new Date(a.effectiveTo).toLocaleString() : 'open'}
                    </p>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}

      {assignOpen && hostelId && <AssignDutySheet hostelId={hostelId} onClose={() => setAssignOpen(false)} onAssigned={() => load(hostelId)} />}
    </div>
  );
}

function AssignDutySheet({ hostelId, onClose, onAssigned }: { hostelId: string; onClose: () => void; onAssigned: () => void }) {
  const [staff, setStaff] = useState<{ id: string; name: string }[]>([]);
  const [privilegeType, setPrivilegeType] = useState<DutyPrivilegeType>('duty_warden');
  const [assigneeUserId, setAssigneeUserId] = useState('');
  const [substituteUserId, setSubstituteUserId] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState('');
  const [effectiveTo, setEffectiveTo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    void casesApi.listCaseStaffDirectory().then(setStaff);
  }, []);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      await dutyApi.createDutyAssignment({
        assigneeUserId,
        privilegeType,
        scopeType: 'hostel',
        scopeId: hostelId,
        effectiveFrom: new Date(effectiveFrom).toISOString(),
        effectiveTo: new Date(effectiveTo).toISOString(),
        substituteUserId: substituteUserId || undefined,
      });
      onAssigned();
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
      title="Assign a duty shift"
      footer={
        <Button fullWidth onClick={() => void handleSubmit()} disabled={submitting || !assigneeUserId || !effectiveFrom || !effectiveTo}>
          {submitting ? 'Assigning…' : 'Assign'}
        </Button>
      }
    >
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <FieldWrapper label="Role" htmlFor="ad-role">
          <Select id="ad-role" value={privilegeType} onChange={(e) => setPrivilegeType(e.target.value as DutyPrivilegeType)}>
            {Object.entries(DUTY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </FieldWrapper>
        <FieldWrapper label="Assigned to" htmlFor="ad-assignee" required>
          <Select id="ad-assignee" value={assigneeUserId} onChange={(e) => setAssigneeUserId(e.target.value)}>
            <option value="">Select staff</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </FieldWrapper>
        <FieldWrapper label="Backup" htmlFor="ad-substitute" hint="Optional">
          <Select id="ad-substitute" value={substituteUserId} onChange={(e) => setSubstituteUserId(e.target.value)}>
            <option value="">None</option>
            {staff
              .filter((s) => s.id !== assigneeUserId)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
          </Select>
        </FieldWrapper>
        <div className="grid grid-cols-2 gap-3">
          <FieldWrapper label="From" htmlFor="ad-from" required>
            <Input id="ad-from" type="datetime-local" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
          </FieldWrapper>
          <FieldWrapper label="To" htmlFor="ad-to" required>
            <Input id="ad-to" type="datetime-local" value={effectiveTo} onChange={(e) => setEffectiveTo(e.target.value)} />
          </FieldWrapper>
        </div>
      </div>
    </Sheet>
  );
}

// ============================================================================
// Notices
// ============================================================================

function NoticesTab({ hostels }: { hostels: Hostel[] }) {
  const [notices, setNotices] = useState<OperationalNotice[]>([]);
  const [loading, setLoading] = useState(true);
  const [publishOpen, setPublishOpen] = useState(false);

  async function load() {
    setLoading(true);
    setNotices(await noticesApi.listNotices());
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => setPublishOpen(true)}>Publish a notice</Button>
      </div>
      {loading ? (
        <PageSpinner />
      ) : notices.length === 0 ? (
        <EmptyState icon={<AlertIcon className="h-8 w-8" />} title="No notices published" description="Publish one above." />
      ) : (
        <Card>
          <ul className="divide-y divide-slate-100">
            {notices.map((n) => (
              <li key={n.id} className="px-4 py-3 text-sm sm:px-5">
                <p className="flex items-center gap-2">
                  {n.severity === 'critical' && (
                    <span className="inline-flex items-center rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700">Critical</span>
                  )}
                  <span className="font-medium text-slate-900">{n.title}</span>
                  {n.supersededBy && <span className="text-xs text-slate-400">(superseded)</span>}
                </p>
                {n.body && <p className="mt-0.5 text-xs text-slate-500">{n.body}</p>}
                <p className="mt-0.5 text-xs text-slate-400">{new Date(n.publishedAt).toLocaleString()}</p>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {publishOpen && <PublishNoticeSheet hostels={hostels} onClose={() => setPublishOpen(false)} onPublished={load} />}
    </div>
  );
}

function PublishNoticeSheet({ hostels, onClose, onPublished }: { hostels: Hostel[]; onClose: () => void; onPublished: () => void }) {
  const [hostelId, setHostelId] = useState(hostels[0]?.id ?? '');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [severity, setSeverity] = useState<NoticeSeverity>('normal');
  const [requiresAcknowledgement, setRequiresAcknowledgement] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      await noticesApi.publishNotice({
        scopeType: 'hostel' as NoticeScopeType,
        scopeId: hostelId,
        title,
        body: body || undefined,
        severity,
        requiresAcknowledgement,
      });
      onPublished();
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
      title="Publish a notice"
      footer={
        <Button fullWidth variant={severity === 'critical' ? 'danger' : 'primary'} onClick={() => void handleSubmit()} disabled={submitting || !hostelId || !title.trim()}>
          {submitting ? 'Publishing…' : 'Publish — delivers to every resident in scope now'}
        </Button>
      }
    >
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <FieldWrapper label="Hostel" htmlFor="pn-hostel" required>
          <Select id="pn-hostel" value={hostelId} onChange={(e) => setHostelId(e.target.value)}>
            {hostels.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
          </Select>
        </FieldWrapper>
        <FieldWrapper label="Title" htmlFor="pn-title" required>
          <Input id="pn-title" value={title} onChange={(e) => setTitle(e.target.value)} />
        </FieldWrapper>
        <FieldWrapper label="Body" htmlFor="pn-body" hint="Optional">
          <Textarea id="pn-body" value={body} onChange={(e) => setBody(e.target.value)} />
        </FieldWrapper>
        <FieldWrapper label="Severity" htmlFor="pn-severity">
          <Select id="pn-severity" value={severity} onChange={(e) => setSeverity(e.target.value as NoticeSeverity)}>
            <option value="normal">Normal</option>
            <option value="critical">Critical</option>
          </Select>
        </FieldWrapper>
        <label className="flex min-h-touch cursor-pointer items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={requiresAcknowledgement}
            onChange={(e) => setRequiresAcknowledgement(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-accent"
          />
          Require resident acknowledgement (delivery alone won't count as read)
        </label>
      </div>
    </Sheet>
  );
}

// ============================================================================
// Emergency Card
// ============================================================================

function EmergencyCardTab() {
  const residentNames = useResidentNames();
  const [candidates, setCandidates] = useState<{ id: string; name: string }[]>([]);
  const [studentId, setStudentId] = useState('');
  const [card, setCard] = useState<ResidentEmergencyCard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void casesApi.listResidentDirectory().then(setCandidates);
  }, []);

  async function lookup() {
    setLoading(true);
    setError(null);
    try {
      setCard(await noticesApi.getResidentEmergencyCard(studentId));
    } catch (err) {
      setError(errorMessage(err));
      setCard(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-lg space-y-4">
      <Alert tone="warning">
        Purpose-restricted minimum-necessary information — current location and duty contact only, no welfare/medical detail.
      </Alert>
      {error && <Alert>{error}</Alert>}
      <FieldWrapper label="Resident" htmlFor="ec-student">
        <div className="flex gap-2">
          <Select id="ec-student" value={studentId} onChange={(e) => setStudentId(e.target.value)} className="flex-1">
            <option value="">Select a resident</option>
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <Button onClick={() => void lookup()} disabled={!studentId || loading}>
            {loading ? 'Looking up…' : 'Look up'}
          </Button>
        </div>
      </FieldWrapper>

      {card && (
        <Card>
          <div className="space-y-2 p-4 text-sm sm:p-5">
            <p className="font-medium text-slate-900">{residentNames[card.studentId] ?? card.studentId.slice(0, 8)}</p>
            {card.occupancy ? (
              <p className="text-slate-700">
                {card.occupancy.hostelName} / {card.occupancy.blockCode} / Fl.{card.occupancy.floorNumber} / {card.occupancy.roomCode} / {card.occupancy.bedCode}
              </p>
            ) : (
              <p className="text-slate-500">Not currently checked in to a bed.</p>
            )}
            <p>
              <StatusPill status={card.currentMovementStatus} />
            </p>
            {card.dutyWardenUserId && <p className="text-slate-600">Duty Warden: {residentNames[card.dutyWardenUserId] ?? card.dutyWardenUserId.slice(0, 8)}</p>}
            <p className="text-xs text-slate-400">As of {new Date(card.dataAsOf).toLocaleString()}</p>
          </div>
        </Card>
      )}
    </div>
  );
}
