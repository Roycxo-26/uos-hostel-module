import { useEffect, useState } from 'react';
import * as casesApi from '../api/cases';
import * as privilegeApi from '../api/privilegeChanges';
import * as responsibilityApi from '../api/responsibilities';
import type { ResidentCandidate } from '../api/responsibilities';
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
import type { PrivilegeChangeAction, PrivilegeChangeType, ResidentPrivilegeChange } from '../types';

/** D17.07 item 100 (TODO.md Batch 25) — a resident's own effective-dated
 * privilege profile (access zones, visitor-hosting, outpass rule profile,
 * mess entitlement, temporary access, hostel privilege status), distinct
 * from a bed transfer. Staff-only throughout (route-guarded in App.tsx) —
 * see privilegeChanges/service.ts's own comment on why there's no resident
 * self-service submit path here. */

const PRIVILEGE_TYPE_LABELS: Record<PrivilegeChangeType, string> = {
  access_zone: 'Access Zone',
  visitor_hosting: 'Visitor-Hosting Entitlement',
  outpass_rule_profile: 'Outpass Rule Profile',
  mess_entitlement: 'Mess Entitlement',
  temporary_access: 'Temporary Access Privilege',
  hostel_privilege_status: 'Hostel Privilege Status',
};

const ACTION_LABELS: Record<PrivilegeChangeAction, string> = {
  grant: 'Grant',
  restrict: 'Restrict',
  suspend: 'Suspend',
  restore: 'Restore',
};

function useResidentNames(): Record<string, string> {
  const [names, setNames] = useState<Record<string, string>>({});
  useEffect(() => {
    void casesApi.listResidentDirectory().then((residents) => {
      setNames(Object.fromEntries(residents.map((r) => [r.id, r.name])));
    });
  }, []);
  return names;
}

export function PrivilegeChanges() {
  const residentNames = useResidentNames();
  const [changes, setChanges] = useState<ResidentPrivilegeChange[]>([]);
  const [loading, setLoading] = useState(true);
  const [requestOpen, setRequestOpen] = useState(false);
  const [detailTarget, setDetailTarget] = useState<ResidentPrivilegeChange | null>(null);

  async function load() {
    setLoading(true);
    setChanges(await privilegeApi.listPrivilegeChanges());
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <div>
      <PageHeader
        title="Resident Privilege Changes"
        description="Access zones, visitor-hosting, outpass rules, mess entitlement and hostel privilege status — effective-dated, separate from a room/bed transfer."
        action={<Button onClick={() => setRequestOpen(true)}>Propose a change</Button>}
      />

      {loading ? (
        <PageSpinner />
      ) : changes.length === 0 ? (
        <EmptyState icon={<AlertIcon className="h-8 w-8" />} title="No privilege changes" description="Propose one above." />
      ) : (
        <Card>
          <ul className="divide-y divide-slate-100">
            {changes.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setDetailTarget(c)}>
                  <p className="flex items-center gap-2 text-sm">
                    <span className="font-medium text-slate-800">{residentNames[c.studentId] ?? c.studentId.slice(0, 8)}</span>
                    <StatusPill status={c.status} />
                    {c.supersededBy && <span className="text-xs text-slate-400">Superseded</span>}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {ACTION_LABELS[c.action]} — {PRIVILEGE_TYPE_LABELS[c.privilegeType]}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <RequestPrivilegeChangeSheet open={requestOpen} onClose={() => setRequestOpen(false)} onRequested={load} />
      {detailTarget && <PrivilegeChangeDetailSheet change={detailTarget} residentNames={residentNames} onClose={() => setDetailTarget(null)} onChanged={load} />}
    </div>
  );
}

function RequestPrivilegeChangeSheet({ open, onClose, onRequested }: { open: boolean; onClose: () => void; onRequested: () => void }) {
  const [studentId, setStudentId] = useState('');
  const [candidates, setCandidates] = useState<ResidentCandidate[]>([]);
  const [privilegeType, setPrivilegeType] = useState<PrivilegeChangeType>('access_zone');
  const [action, setAction] = useState<PrivilegeChangeAction>('grant');
  const [configText, setConfigText] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState('');
  const [effectiveTo, setEffectiveTo] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    void responsibilityApi.listCandidates().then(setCandidates);
  }, [open]);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      let proposedConfiguration: Record<string, unknown>;
      try {
        proposedConfiguration = configText.trim() ? JSON.parse(configText) : {};
      } catch {
        throw new Error('Proposed configuration must be valid JSON, e.g. {"zone": "library-24h"}');
      }
      await privilegeApi.requestPrivilegeChange({
        studentId,
        privilegeType,
        action,
        proposedConfiguration,
        effectiveFrom: new Date(effectiveFrom).toISOString(),
        effectiveTo: effectiveTo ? new Date(effectiveTo).toISOString() : undefined,
        reason,
      });
      onRequested();
      onClose();
      setStudentId('');
      setConfigText('');
      setEffectiveFrom('');
      setEffectiveTo('');
      setReason('');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit = studentId && effectiveFrom && reason.trim();

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Propose a privilege change"
      footer={
        <Button fullWidth onClick={() => void handleSubmit()} disabled={submitting || !canSubmit}>
          {submitting ? 'Submitting…' : 'Submit for approval'}
        </Button>
      }
    >
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <FieldWrapper label="Resident" htmlFor="pc-student" required>
          <Select id="pc-student" value={studentId} onChange={(e) => setStudentId(e.target.value)}>
            <option value="">Select a resident…</option>
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.email})
              </option>
            ))}
          </Select>
        </FieldWrapper>
        <FieldWrapper label="Privilege" htmlFor="pc-type">
          <Select id="pc-type" value={privilegeType} onChange={(e) => setPrivilegeType(e.target.value as PrivilegeChangeType)}>
            {Object.entries(PRIVILEGE_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </FieldWrapper>
        <FieldWrapper label="Action" htmlFor="pc-action">
          <Select id="pc-action" value={action} onChange={(e) => setAction(e.target.value as PrivilegeChangeAction)}>
            {Object.entries(ACTION_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </FieldWrapper>
        <FieldWrapper label="Proposed configuration" htmlFor="pc-config" hint='Free-form JSON, e.g. {"zone": "library-24h"} — shape depends on the privilege above'>
          <Textarea id="pc-config" value={configText} onChange={(e) => setConfigText(e.target.value)} placeholder="{}" />
        </FieldWrapper>
        <div className="grid grid-cols-2 gap-3">
          <FieldWrapper label="Effective from" htmlFor="pc-from" required>
            <Input id="pc-from" type="datetime-local" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
          </FieldWrapper>
          <FieldWrapper label="Effective to" htmlFor="pc-to" hint="Optional — open-ended if blank">
            <Input id="pc-to" type="datetime-local" value={effectiveTo} onChange={(e) => setEffectiveTo(e.target.value)} />
          </FieldWrapper>
        </div>
        <FieldWrapper label="Reason" htmlFor="pc-reason" required>
          <Textarea id="pc-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
        </FieldWrapper>
      </div>
    </Sheet>
  );
}

function PrivilegeChangeDetailSheet({
  change,
  residentNames,
  onClose,
  onChanged,
}: {
  change: ResidentPrivilegeChange;
  residentNames: Record<string, string>;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState(change);
  const [decisionReason, setDecisionReason] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [reverseConfigText, setReverseConfigText] = useState('');
  const [reverseReason, setReverseReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<string | null>(null);

  async function refresh() {
    setDetail(await privilegeApi.getPrivilegeChange(change.id));
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
    <Sheet open onClose={onClose} title={PRIVILEGE_TYPE_LABELS[detail.privilegeType]}>
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <p className="text-sm text-slate-600">
          {residentNames[detail.studentId] ?? detail.studentId.slice(0, 8)} — <StatusPill status={detail.status} />
        </p>
        <p className="text-sm text-slate-700">
          {ACTION_LABELS[detail.action]}: {detail.reason}
        </p>
        <p className="text-xs text-slate-500">
          Effective {new Date(detail.effectiveFrom).toLocaleString()}
          {detail.effectiveTo && ` – ${new Date(detail.effectiveTo).toLocaleString()}`}
        </p>
        <pre className="overflow-x-auto rounded-lg bg-slate-50 p-3 text-xs text-slate-700">{JSON.stringify(detail.proposedConfiguration, null, 2)}</pre>
        {detail.previousConfiguration && (
          <>
            <p className="text-xs font-medium text-slate-600">Previous configuration</p>
            <pre className="overflow-x-auto rounded-lg bg-slate-50 p-3 text-xs text-slate-500">{JSON.stringify(detail.previousConfiguration, null, 2)}</pre>
          </>
        )}
        {detail.residentAcknowledgedAt && <p className="text-xs text-emerald-600">Acknowledged by resident {new Date(detail.residentAcknowledgedAt).toLocaleString()}</p>}
        {detail.supersededBy && <Alert>This has been superseded by a later change.</Alert>}

        {detail.status === 'requested' && (
          <div className="space-y-2 border-t border-slate-200 pt-4">
            <p className="text-sm font-medium text-slate-800">Decide</p>
            <Textarea placeholder="Decision reason" value={decisionReason} onChange={(e) => setDecisionReason(e.target.value)} />
            <div className="flex gap-2">
              <Button size="sm" disabled={!decisionReason.trim() || Boolean(submitting)} onClick={() => void run('approve', () => privilegeApi.decidePrivilegeChange(detail.id, 'approved', decisionReason))}>
                Approve
              </Button>
              <Button size="sm" variant="danger" disabled={!decisionReason.trim() || Boolean(submitting)} onClick={() => void run('reject', () => privilegeApi.decidePrivilegeChange(detail.id, 'rejected', decisionReason))}>
                Reject
              </Button>
            </div>
            <FieldWrapper label="Cancel reason" htmlFor="pcd-cancel">
              <div className="flex gap-2">
                <Input id="pcd-cancel" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} className="flex-1" />
                <Button size="sm" variant="secondary" disabled={!cancelReason.trim() || Boolean(submitting)} onClick={() => void run('cancel', () => privilegeApi.cancelPrivilegeChange(detail.id, cancelReason))}>
                  Cancel
                </Button>
              </div>
            </FieldWrapper>
          </div>
        )}

        {detail.status === 'approved' && !detail.supersededBy && (
          <div className="space-y-2 border-t border-slate-200 pt-4">
            <p className="text-sm font-medium text-slate-800">Reverse this change</p>
            <Textarea placeholder='Restored configuration, JSON, e.g. {}' value={reverseConfigText} onChange={(e) => setReverseConfigText(e.target.value)} />
            <Textarea placeholder="Reason" value={reverseReason} onChange={(e) => setReverseReason(e.target.value)} />
            <Button
              size="sm"
              variant="danger"
              disabled={!reverseReason.trim() || Boolean(submitting)}
              onClick={() =>
                void run('reverse', () => {
                  let proposedConfiguration: Record<string, unknown>;
                  try {
                    proposedConfiguration = reverseConfigText.trim() ? JSON.parse(reverseConfigText) : {};
                  } catch {
                    throw new Error('Restored configuration must be valid JSON');
                  }
                  return privilegeApi.reversePrivilegeChange(detail.id, proposedConfiguration, reverseReason);
                })
              }
            >
              Reverse
            </Button>
          </div>
        )}
      </div>
    </Sheet>
  );
}
