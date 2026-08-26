import { useEffect, useState } from 'react';
import * as allocationsApi from '../api/allocations';
import * as applicationsApi from '../api/applications';
import type { AuditEntry } from '../api/audit';
import * as auditApi from '../api/audit';
import * as casesApi from '../api/cases';
import * as checkoutsApi from '../api/checkouts';
import * as movementsApi from '../api/movements';
import * as structureApi from '../api/structure';
import { Card, CardBody, PageHeader, PageSpinner } from '../design-system';
import { ChartIcon } from '../design-system/icons';

/**
 * UOS HOSTEL BR.md §16 (Reports, Dashboards, KPIs) — TODO.md Batch 9. Real
 * dashboards now, not the earlier placeholder: occupancy, application
 * funnel, movement, complaints/incidents, checkout, and the audit trail
 * (backend/src/app/audit — the log has been written to since the very
 * first migration, this is the first thing that ever reads it back).
 *
 * Deliberately client-side aggregation over the existing list endpoints
 * rather than new backend aggregate endpoints — every module already
 * exposes a full list, and Phase 1 tenant scale doesn't justify a second
 * "counts only" API surface yet. Flagged here as the thing to revisit if
 * that assumption stops holding, same reasoning cases/service.ts's
 * confidential-filtering used for the same tradeoff.
 */

/** Real gap, found live — the audit trail's Actor column showed a raw
 * 8-char ID prefix with no way to tell who actually took the action, same
 * class of gap already fixed on every other list page. Same per-file hook
 * duplication this codebase already uses for these small directory
 * lookups. */
function useResidentNames(): Record<string, string> {
  const [names, setNames] = useState<Record<string, string>>({});
  useEffect(() => {
    void casesApi.listResidentDirectory().then((residents) => {
      setNames(Object.fromEntries(residents.map((r) => [r.id, r.name])));
    });
  }, []);
  return names;
}

export function Reports() {
  const residentNames = useResidentNames();
  const [loading, setLoading] = useState(true);
  const [occupancy, setOccupancy] = useState({ hostels: 0, capacity: 0, activeResidents: 0, awaitingCheckIn: 0 });
  const [applicationCounts, setApplicationCounts] = useState<Record<string, number>>({});
  const [movementCounts, setMovementCounts] = useState<Record<string, number>>({});
  const [caseCounts, setCaseCounts] = useState<{ complaint: Record<string, number>; incident: Record<string, number> }>({
    complaint: {},
    incident: {},
  });
  const [checkoutCounts, setCheckoutCounts] = useState<Record<string, number>>({});
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [auditError, setAuditError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);

      const [hostels, activeResidents, awaitingCheckIn, applications, movements, cases, checkouts] = await Promise.all([
        structureApi.listHostels(),
        allocationsApi.listAllocations('checked_in_active'),
        allocationsApi.listAllocations('awaiting_check_in'),
        applicationsApi.listApplications(),
        movementsApi.listMovements(),
        casesApi.listCases(),
        checkoutsApi.listCheckouts(),
      ]);
      if (cancelled) return;

      setOccupancy({
        hostels: hostels.length,
        capacity: hostels.reduce((sum, h) => sum + h.capacity, 0),
        activeResidents: activeResidents.length,
        awaitingCheckIn: awaitingCheckIn.length,
      });
      setApplicationCounts(countBy(applications, (a) => a.status));
      setMovementCounts(countBy(movements, (m) => m.status));
      setCaseCounts({
        complaint: countBy(
          cases.filter((c) => c.caseType === 'complaint'),
          (c) => c.status
        ),
        incident: countBy(
          cases.filter((c) => c.caseType === 'incident'),
          (c) => c.status
        ),
      });
      setCheckoutCounts(countBy(checkouts, (c) => c.status));

      // Staff-only endpoint — a Warden/Head Warden without 'audit:view' (or
      // a Student, who never has it) gets a 403 here; that's expected, not
      // a bug, so it's handled as a quiet empty state, not a page-level error.
      try {
        setAuditEntries(await auditApi.listAuditLog({ limit: 25 }));
      } catch {
        setAuditError('Audit trail requires elevated permission.');
      }

      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return <PageSpinner />;

  return (
    <div>
      <PageHeader title="Reports & Audit" description="Occupancy, workflow status, and the audit trail." />

      <h2 className="mb-3 text-sm font-semibold text-slate-900">Occupancy</h2>
      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="Hostels" value={occupancy.hostels} />
        <Tile label="Rated capacity" value={occupancy.capacity} />
        <Tile label="Active residents" value={occupancy.activeResidents} />
        <Tile label="Awaiting check-in" value={occupancy.awaitingCheckIn} />
      </div>

      <h2 className="mb-3 text-sm font-semibold text-slate-900">Applications</h2>
      <CountRow counts={applicationCounts} order={['submitted', 'under_review', 'returned', 'waitlisted', 'allocation_ready', 'allocated', 'rejected']} />

      <h2 className="mb-3 mt-8 text-sm font-semibold text-slate-900">Leave & Gate Pass</h2>
      <CountRow counts={movementCounts} order={['requested', 'approved', 'out', 'overdue', 'returned', 'rejected']} />

      <h2 className="mb-3 mt-8 text-sm font-semibold text-slate-900">Complaints</h2>
      <CountRow counts={caseCounts.complaint} order={['reported', 'assigned', 'in_progress', 'resolved', 'closed']} />

      <h2 className="mb-3 mt-8 text-sm font-semibold text-slate-900">Incidents & Discipline</h2>
      <CountRow counts={caseCounts.incident} order={['reported', 'assigned', 'in_progress', 'notice_issued', 'decided', 'appealed', 'closed']} />

      <h2 className="mb-3 mt-8 text-sm font-semibold text-slate-900">Checkout</h2>
      <CountRow counts={checkoutCounts} order={['requested', 'inspected', 'completed', 'cancelled']} />

      <h2 className="mb-3 mt-8 text-sm font-semibold text-slate-900">Audit trail (most recent 25)</h2>
      {auditError ? (
        <Card>
          <CardBody className="flex flex-col items-center gap-2 py-8 text-center">
            <ChartIcon className="h-6 w-6 text-slate-400" />
            <p className="text-sm text-slate-500">{auditError}</p>
          </CardBody>
        </Card>
      ) : auditEntries.length === 0 ? (
        <Card>
          <CardBody className="py-8 text-center text-sm text-slate-400">No audit entries yet.</CardBody>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-medium uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-2.5">Action</th>
                  <th className="px-4 py-2.5">Entity</th>
                  <th className="px-4 py-2.5">Actor</th>
                  <th className="px-4 py-2.5">When</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {auditEntries.map((e) => (
                  <tr key={e.id}>
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-700">{e.action}</td>
                    <td className="px-4 py-2.5 text-slate-600">{e.entityType}</td>
                    <td className="px-4 py-2.5 text-xs text-slate-500">{e.actorUserId ? (residentNames[e.actorUserId] ?? e.actorUserId.slice(0, 8)) : 'system'}</td>
                    <td className="px-4 py-2.5 text-slate-500">{new Date(e.createdAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function countBy<T>(rows: T[], key: (row: T) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of rows) {
    const k = key(row);
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

function humanize(status: string): string {
  return status
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function Tile({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardBody>
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
        <p className="mt-1.5 text-2xl font-semibold tabular-nums text-slate-900">{value}</p>
      </CardBody>
    </Card>
  );
}

function CountRow({ counts, order }: { counts: Record<string, number>; order: string[] }) {
  const known = order.filter((k) => counts[k] !== undefined);
  const extra = Object.keys(counts).filter((k) => !order.includes(k));
  const keys = [...known, ...extra];

  if (keys.length === 0) {
    return (
      <Card className="mb-2">
        <CardBody className="py-6 text-center text-sm text-slate-400">Nothing yet.</CardBody>
      </Card>
    );
  }

  return (
    <div className="mb-2 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
      {keys.map((k) => (
        <Card key={k}>
          <CardBody>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{humanize(k)}</p>
            <p className="mt-1.5 text-xl font-semibold tabular-nums text-slate-900">{counts[k]}</p>
          </CardBody>
        </Card>
      ))}
    </div>
  );
}
