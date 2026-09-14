import { useEffect, useState } from 'react';
import * as casesApi from '../api/cases';
import * as delegationsApi from '../api/delegations';
import * as dutyApi from '../api/dutyRoster';
import * as noticesApi from '../api/operationalNotices';
import * as responsibilitiesApi from '../api/responsibilities';
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
import type {
  ApproverDelegation,
  CoverageValidation,
  DelegatableEntityType,
  DelegatableRole,
  DutyPrivilegeType,
  FinanceOfficerPrivilegeType,
  Hostel,
  NoticeScopeType,
  NoticeSeverity,
  OperationalNotice,
  ResidentEmergencyCard,
  SafeguardingPrivilegeType,
} from '../types';
import { DELEGATABLE_ENTITY_TYPES } from '../types';
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

/** Same shape as useResidentNames above, but for staff — a delegation's
 * "created by" / "delegated to" are always Warden/Head Warden holders, not
 * residents, so this is the delegate-name lookup for DelegationTab. */
function useStaffNames(): Record<string, string> {
  const [names, setNames] = useState<Record<string, string>>({});
  useEffect(() => {
    void casesApi.listCaseStaffDirectory().then((staff) => {
      setNames(Object.fromEntries(staff.map((s) => [s.id, s.name])));
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

// D17.09 depth (TODO.md Batch 24).
const SAFEGUARDING_LABELS: Record<SafeguardingPrivilegeType, string> = {
  safeguarding_lead: 'Designated Safeguarding Lead',
  safeguarding_deputy: 'Deputy Safeguarding Lead',
  welfare_officer: 'Student Welfare Officer',
  counsellor: 'Counsellor',
};
const SAFEGUARDING_PRIVILEGE_TYPES = Object.keys(SAFEGUARDING_LABELS) as SafeguardingPrivilegeType[];

// D17.05 (TODO.md Batch 27) — the standing Finance Officer role;
// finance/service.ts's canConfirmFinance checks for it.
const FINANCE_LABELS: Record<FinanceOfficerPrivilegeType, string> = {
  finance_officer: 'Finance Officer',
};
const FINANCE_PRIVILEGE_TYPES = Object.keys(FINANCE_LABELS) as FinanceOfficerPrivilegeType[];

// UOS_Final.docx audit (12 Sep 2026) §6.4.
const DELEGATABLE_ROLE_LABELS: Record<DelegatableRole, string> = { warden: 'Warden', head_warden: 'Head Warden' };
const ENTITY_TYPE_LABELS: Record<DelegatableEntityType, string> = {
  case: 'Complaints & incidents',
  checkout: 'Checkout',
  closure_case: 'Shutdown/reopening',
  movement_extension_request: 'Gate pass extensions',
  movement_request: 'Gate pass / leave requests',
  resident_privilege_change: 'Privilege changes / suspension',
  transfer_request: 'Transfer requests',
};

type Tab = 'roster' | 'delegation' | 'notices' | 'emergency-card';

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
            ['delegation', 'Delegation'],
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
      {tab === 'delegation' && <DelegationTab hostels={hostels} />}
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
  const [assignSafeguardingOpen, setAssignSafeguardingOpen] = useState(false);
  const [assignFinanceOpen, setAssignFinanceOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);

  const dutyAssignments = assignments.filter((a) => a.privilegeType in DUTY_LABELS);
  const safeguardingAssignments = assignments.filter((a) => SAFEGUARDING_PRIVILEGE_TYPES.includes(a.privilegeType as SafeguardingPrivilegeType));
  const financeAssignments = assignments.filter((a) => FINANCE_PRIVILEGE_TYPES.includes(a.privilegeType as FinanceOfficerPrivilegeType));

  async function load(id: string) {
    if (!id) return;
    setLoading(true);
    const [list, cov] = await Promise.all([dutyApi.listDutyAssignments('hostel', id), dutyApi.getCoverageValidation('hostel', id)]);
    setAssignments(list.filter((a) => a.scopeType === 'hostel' && a.status === 'active'));
    setCoverage(cov);
    setLoading(false);
  }

  // Real gap found live via SELF-TEST-GUIDE.md Batch 21 — the escalation
  // ladder test ("revoke the primary, with a substitute set, coverage
  // should fall to the substitute") had no way to actually revoke an
  // assignment from this page: revokeAssignment already existed and is
  // used the same way on Structure.tsx's Room Head panel, just never
  // wired up here.
  async function handleRevoke(id: string) {
    setRevoking(id);
    setError(null);
    try {
      await responsibilitiesApi.revokeAssignment(id, 'Revoked from Duty Roster screen');
      await load(hostelId);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setRevoking(null);
    }
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
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setAssignSafeguardingOpen(true)}>
            Assign safeguarding role
          </Button>
          <Button variant="secondary" onClick={() => setAssignFinanceOpen(true)}>
            Assign Finance Officer
          </Button>
          <Button onClick={() => setAssignOpen(true)}>Assign duty</Button>
        </div>
      </div>

      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}

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

          {dutyAssignments.length === 0 ? (
            <EmptyState icon={<AlertIcon className="h-8 w-8" />} title="No active duty assignments" description="Assign duty above." />
          ) : (
            <Card>
              <ul className="divide-y divide-slate-100">
                {dutyAssignments.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm sm:px-5">
                    <div>
                      <p className="font-medium text-slate-900">{DUTY_LABELS[a.privilegeType as DutyPrivilegeType] ?? a.privilegeType}</p>
                      <p className="text-xs text-slate-500">
                        {residentNames[a.assigneeUserId] ?? a.assigneeUserId.slice(0, 8)}
                        {a.substituteUserId && ` — backup: ${residentNames[a.substituteUserId] ?? a.substituteUserId.slice(0, 8)}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <p className="text-xs text-slate-500">
                        {new Date(a.effectiveFrom).toLocaleString()} – {a.effectiveTo ? new Date(a.effectiveTo).toLocaleString() : 'open'}
                      </p>
                      <Button size="sm" variant="danger" onClick={() => void handleRevoke(a.id)} disabled={revoking === a.id}>
                        {revoking === a.id ? 'Revoking…' : 'Revoke'}
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {/* D17.09 depth (TODO.md Batch 24) — the standing safeguarding
              team, kept visually separate from the duty roster above: this
              is who gets restricted access to welfare/safeguarding cases
              (see cases/service.ts's canManageWelfareCase), not a shift. */}
          <h2 className="mb-3 mt-8 text-sm font-semibold text-slate-900">Safeguarding team</h2>
          {safeguardingAssignments.length === 0 ? (
            <EmptyState
              icon={<AlertIcon className="h-8 w-8" />}
              title="No standing safeguarding team members"
              description="Assign one above — without at least one, a welfare/safeguarding case has nobody to notify."
            />
          ) : (
            <Card>
              <ul className="divide-y divide-slate-100">
                {safeguardingAssignments.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm sm:px-5">
                    <div>
                      <p className="font-medium text-slate-900">{SAFEGUARDING_LABELS[a.privilegeType as SafeguardingPrivilegeType] ?? a.privilegeType}</p>
                      <p className="text-xs text-slate-500">{residentNames[a.assigneeUserId] ?? a.assigneeUserId.slice(0, 8)}</p>
                    </div>
                    <p className="text-xs text-slate-500">
                      {new Date(a.effectiveFrom).toLocaleString()} – {a.effectiveTo ? new Date(a.effectiveTo).toLocaleString() : 'open'}
                    </p>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {/* D17.05 (TODO.md Batch 27) — the standing Finance Officer role;
              finance/service.ts's canConfirmFinance checks for it,
              alongside a Head Warden's own finance_event:confirm
              permission. */}
          <h2 className="mb-3 mt-8 text-sm font-semibold text-slate-900">Finance team</h2>
          {financeAssignments.length === 0 ? (
            <EmptyState
              icon={<AlertIcon className="h-8 w-8" />}
              title="No standing Finance Officer"
              description="Assign one above — otherwise only a Head Warden can confirm a financial event."
            />
          ) : (
            <Card>
              <ul className="divide-y divide-slate-100">
                {financeAssignments.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm sm:px-5">
                    <div>
                      <p className="font-medium text-slate-900">{FINANCE_LABELS[a.privilegeType as FinanceOfficerPrivilegeType] ?? a.privilegeType}</p>
                      <p className="text-xs text-slate-500">{residentNames[a.assigneeUserId] ?? a.assigneeUserId.slice(0, 8)}</p>
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
      {assignSafeguardingOpen && hostelId && (
        <AssignSafeguardingSheet hostelId={hostelId} onClose={() => setAssignSafeguardingOpen(false)} onAssigned={() => load(hostelId)} />
      )}
      {assignFinanceOpen && hostelId && <AssignFinanceOfficerSheet hostelId={hostelId} onClose={() => setAssignFinanceOpen(false)} onAssigned={() => load(hostelId)} />}
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

/** D17.09 depth (TODO.md Batch 24) — a standing appointment, not a shift:
 * open-ended by default (matches Room Head/Floor In-charge's own open-
 * ended shape), no substitute concept, always hostel-scoped. Separate
 * from AssignDutySheet above rather than a shared form with conditional
 * fields — the two have different required-field shapes entirely
 * (mandatory window vs. optional window, backup vs. no backup). */
function AssignSafeguardingSheet({ hostelId, onClose, onAssigned }: { hostelId: string; onClose: () => void; onAssigned: () => void }) {
  const [staff, setStaff] = useState<{ id: string; name: string }[]>([]);
  const [privilegeType, setPrivilegeType] = useState<SafeguardingPrivilegeType>('safeguarding_lead');
  const [assigneeUserId, setAssigneeUserId] = useState('');
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
      await dutyApi.createSafeguardingAssignment({
        assigneeUserId,
        privilegeType,
        scopeId: hostelId,
        effectiveFrom: effectiveFrom ? new Date(effectiveFrom).toISOString() : undefined,
        effectiveTo: effectiveTo ? new Date(effectiveTo).toISOString() : undefined,
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
      title="Assign a safeguarding role"
      footer={
        <Button fullWidth onClick={() => void handleSubmit()} disabled={submitting || !assigneeUserId}>
          {submitting ? 'Assigning…' : 'Assign'}
        </Button>
      }
    >
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <Alert>This grants restricted access to welfare/safeguarding cases — not the general Warden case-management pool.</Alert>
        <FieldWrapper label="Role" htmlFor="as-role">
          <Select id="as-role" value={privilegeType} onChange={(e) => setPrivilegeType(e.target.value as SafeguardingPrivilegeType)}>
            {Object.entries(SAFEGUARDING_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </FieldWrapper>
        <FieldWrapper label="Assigned to" htmlFor="as-assignee" required>
          <Select id="as-assignee" value={assigneeUserId} onChange={(e) => setAssigneeUserId(e.target.value)}>
            <option value="">Select staff</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </FieldWrapper>
        <div className="grid grid-cols-2 gap-3">
          <FieldWrapper label="From" htmlFor="as-from" hint="Optional — defaults to now">
            <Input id="as-from" type="datetime-local" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
          </FieldWrapper>
          <FieldWrapper label="To" htmlFor="as-to" hint="Optional — open-ended if blank">
            <Input id="as-to" type="datetime-local" value={effectiveTo} onChange={(e) => setEffectiveTo(e.target.value)} />
          </FieldWrapper>
        </div>
      </div>
    </Sheet>
  );
}

// D17.05 (TODO.md Batch 27) — mirrors AssignSafeguardingSheet above exactly
// (a single fixed role, so no role <select> is needed).
function AssignFinanceOfficerSheet({ hostelId, onClose, onAssigned }: { hostelId: string; onClose: () => void; onAssigned: () => void }) {
  const [staff, setStaff] = useState<{ id: string; name: string }[]>([]);
  const [assigneeUserId, setAssigneeUserId] = useState('');
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
      await dutyApi.createFinanceRoleAssignment({
        assigneeUserId,
        privilegeType: 'finance_officer',
        effectiveFrom: effectiveFrom ? new Date(effectiveFrom).toISOString() : undefined,
        effectiveTo: effectiveTo ? new Date(effectiveTo).toISOString() : undefined,
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
      title="Assign a Finance Officer"
      footer={
        <Button fullWidth onClick={() => void handleSubmit()} disabled={submitting || !assigneeUserId}>
          {submitting ? 'Assigning…' : 'Assign'}
        </Button>
      }
    >
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <Alert>This lets them confirm financial events as Finance-authoritative, alongside a Head Warden's own authority to do the same.</Alert>
        <FieldWrapper label="Assigned to" htmlFor="af-assignee" required>
          <Select id="af-assignee" value={assigneeUserId} onChange={(e) => setAssigneeUserId(e.target.value)}>
            <option value="">Select staff</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </FieldWrapper>
        <div className="grid grid-cols-2 gap-3">
          <FieldWrapper label="From" htmlFor="af-from" hint="Optional — defaults to now">
            <Input id="af-from" type="datetime-local" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
          </FieldWrapper>
          <FieldWrapper label="To" htmlFor="af-to" hint="Optional — open-ended if blank">
            <Input id="af-to" type="datetime-local" value={effectiveTo} onChange={(e) => setEffectiveTo(e.target.value)} />
          </FieldWrapper>
        </div>
      </div>
    </Sheet>
  );
}

// ============================================================================
// Delegation — UOS_Final.docx audit (12 Sep 2026) §6.4. "Let someone else
// act with my approval authority while I'm away." Real gap found building
// this: hostel.approver_delegations (TODO.md Batch 2) and the checking
// side (utils/approvalResolution.ts) already existed and were already
// consumed by 6 approval workflows — nobody could ever actually create one.
// ============================================================================

function DelegationTab({ hostels }: { hostels: Hostel[] }) {
  const staffNames = useStaffNames();
  const [hostelId, setHostelId] = useState(hostels[0]?.id ?? '');
  const [delegations, setDelegations] = useState<ApproverDelegation[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [revoking, setRevoking] = useState<ApproverDelegation | null>(null);
  const [error, setError] = useState<string | null>(null);

  // A delegation belongs to a campus (hostel.approver_delegations.campus_id
  // — it's role-level authority, not tied to one hostel), but this page
  // otherwise scopes everything by hostel — deriving the campus from the
  // selected hostel keeps the same "pick a hostel above" shape as the
  // other tabs instead of asking staff to pick a campus separately.
  const campusId = hostels.find((h) => h.id === hostelId)?.campusId ?? '';

  async function load() {
    if (!campusId) return;
    setLoading(true);
    setError(null);
    try {
      setDelegations(await delegationsApi.listDelegations({ campusId, active: true }));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (hostels[0]?.id && !hostelId) setHostelId(hostels[0].id);
  }, [hostels, hostelId]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campusId]);

  return (
    <div>
      <Alert>
        Delegation hands your own approval authority to someone else for a fixed window — for example, a Warden going on leave lets a
        colleague decide transfers/checkouts/complaints in their place. It stops the moment you revoke it, and you can keep specific
        decisions for yourself even while delegating everything else.
      </Alert>
      <div className="mb-4 mt-4 flex items-end justify-between gap-3">
        <div className="max-w-xs flex-1">
          <FieldWrapper label="Hostel" htmlFor="dl-hostel" hint="Used only to pick the campus — a delegation covers the whole campus, not one hostel">
            <Select id="dl-hostel" value={hostelId} onChange={(e) => setHostelId(e.target.value)}>
              {hostels.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </Select>
          </FieldWrapper>
        </div>
        <Button onClick={() => setCreateOpen(true)} disabled={!campusId}>
          Delegate approval authority
        </Button>
      </div>

      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}

      {loading ? (
        <PageSpinner />
      ) : delegations.length === 0 ? (
        <EmptyState icon={<AlertIcon className="h-8 w-8" />} title="No active delegations" description="Nobody is currently covering for anyone at this campus." />
      ) : (
        <Card>
          <ul className="divide-y divide-slate-100">
            {delegations.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm sm:px-5">
                <div>
                  <p className="font-medium text-slate-900">
                    {DELEGATABLE_ROLE_LABELS[d.role]} authority → {staffNames[d.delegateUserId] ?? d.delegateUserId.slice(0, 8)}
                  </p>
                  <p className="text-xs text-slate-500">{d.reason}</p>
                  {d.exclusions.length > 0 && (
                    <p className="mt-0.5 text-xs text-amber-700">Except: {d.exclusions.map((e) => ENTITY_TYPE_LABELS[e]).join(', ')}</p>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <p className="text-xs text-slate-500">
                    {new Date(d.effectiveFrom).toLocaleString()} – {new Date(d.effectiveTo).toLocaleString()}
                  </p>
                  <Button size="sm" variant="danger" onClick={() => setRevoking(d)}>
                    Revoke
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {createOpen && campusId && <CreateDelegationSheet campusId={campusId} onClose={() => setCreateOpen(false)} onCreated={load} />}
      {revoking && (
        <RevokeDelegationSheet
          delegation={revoking}
          delegateName={staffNames[revoking.delegateUserId] ?? revoking.delegateUserId.slice(0, 8)}
          onClose={() => setRevoking(null)}
          onRevoked={load}
        />
      )}
    </div>
  );
}

function CreateDelegationSheet({ campusId, onClose, onCreated }: { campusId: string; onClose: () => void; onCreated: () => void }) {
  const [candidates, setCandidates] = useState<{ id: string; role: DelegatableRole; name: string; email: string }[]>([]);
  const [role, setRole] = useState<DelegatableRole>('warden');
  const [delegateUserId, setDelegateUserId] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState('');
  const [effectiveTo, setEffectiveTo] = useState('');
  const [reason, setReason] = useState('');
  const [exclusions, setExclusions] = useState<DelegatableEntityType[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    void delegationsApi.listDelegationCandidates(campusId).then(setCandidates);
  }, [campusId]);

  function toggleExclusion(type: DelegatableEntityType) {
    setExclusions((prev) => (prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]));
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      await delegationsApi.createDelegation({
        campusId,
        role,
        delegateUserId,
        effectiveFrom: new Date(effectiveFrom).toISOString(),
        effectiveTo: new Date(effectiveTo).toISOString(),
        reason,
        exclusions,
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
      title="Delegate approval authority"
      footer={
        <Button fullWidth onClick={() => void handleSubmit()} disabled={submitting || !delegateUserId || !effectiveFrom || !effectiveTo || !reason.trim()}>
          {submitting ? 'Delegating…' : 'Delegate'}
        </Button>
      }
    >
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <Alert tone="warning">
          You can only delegate a role you hold yourself (or outrank) at this campus — a Warden can delegate Warden authority, only a
          Head Warden can delegate Head Warden authority.
        </Alert>
        <FieldWrapper label="Role being delegated" htmlFor="dc-role">
          <Select id="dc-role" value={role} onChange={(e) => setRole(e.target.value as DelegatableRole)}>
            {Object.entries(DELEGATABLE_ROLE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </FieldWrapper>
        <FieldWrapper label="Delegate to" htmlFor="dc-delegate" required>
          <Select id="dc-delegate" value={delegateUserId} onChange={(e) => setDelegateUserId(e.target.value)}>
            <option value="">Select staff</option>
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({DELEGATABLE_ROLE_LABELS[c.role]})
              </option>
            ))}
          </Select>
        </FieldWrapper>
        <div className="grid grid-cols-2 gap-3">
          <FieldWrapper label="From" htmlFor="dc-from" required>
            <Input id="dc-from" type="datetime-local" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
          </FieldWrapper>
          <FieldWrapper label="To" htmlFor="dc-to" required>
            <Input id="dc-to" type="datetime-local" value={effectiveTo} onChange={(e) => setEffectiveTo(e.target.value)} />
          </FieldWrapper>
        </div>
        <FieldWrapper label="Reason" htmlFor="dc-reason" required>
          <Textarea id="dc-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
        </FieldWrapper>
        <FieldWrapper label="Keep these for yourself" htmlFor="dc-exclusions" hint="Optional — the delegate covers everything else">
          <div className="space-y-1.5">
            {DELEGATABLE_ENTITY_TYPES.map((type) => (
              <label key={type} className="flex min-h-touch cursor-pointer items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={exclusions.includes(type)}
                  onChange={() => toggleExclusion(type)}
                  className="h-4 w-4 rounded border-slate-300 text-accent"
                />
                {ENTITY_TYPE_LABELS[type]}
              </label>
            ))}
          </div>
        </FieldWrapper>
      </div>
    </Sheet>
  );
}

function RevokeDelegationSheet({
  delegation,
  delegateName,
  onClose,
  onRevoked,
}: {
  delegation: ApproverDelegation;
  delegateName: string;
  onClose: () => void;
  onRevoked: () => void;
}) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      await delegationsApi.revokeDelegation(delegation.id, reason);
      onRevoked();
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
      title="Revoke this delegation"
      footer={
        <Button fullWidth variant="danger" onClick={() => void handleSubmit()} disabled={submitting || !reason.trim()}>
          {submitting ? 'Revoking…' : 'Revoke now'}
        </Button>
      }
    >
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <p className="text-sm text-slate-600">
          Takes effect immediately — {delegateName} will lose {DELEGATABLE_ROLE_LABELS[delegation.role]} approval authority as soon as
          you revoke.
        </p>
        <FieldWrapper label="Reason" htmlFor="dr-reason" required>
          <Textarea id="dr-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
        </FieldWrapper>
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
