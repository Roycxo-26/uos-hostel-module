import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { listAllocations, listNoShowQueue } from '../api/allocations';
import { listApplications } from '../api/applications';
import { listCases } from '../api/cases';
import { listCommonAreas, listOutages, listPendingReinspections, listPestTreatments } from '../api/commonAreas';
import * as noticesApi from '../api/operationalNotices';
import { listHostels } from '../api/structure';
import { useAuth } from '../context/AuthContext';
import { useTenantSettings } from '../context/TenantSettingsContext';
import { Alert, Button, Card, CardBody, CardHeader, PageHeader, PageSpinner, StatusPill } from '../design-system';
import { AlertIcon, BedIcon, BuildingIcon, ClipboardIcon, UserIcon, WrenchIcon } from '../design-system/icons';
import { errorMessage } from '../lib/errorMessage';
import {
  hasHostelRole,
  isPlatformAdmin,
  type Allocation,
  type Case,
  type Hostel,
  type HostelApplication,
  type OperationalNotice,
  type PestControlTreatment,
  type SanitationInspection,
  type UtilityOutage,
} from '../types';

// One shared row shape for the merged "Common area problems" queue below —
// three different tables, one queue, so the card doesn't need to know the
// difference between an inspection, an outage and a pest finding.
interface CommonAreaProblem {
  id: string;
  primary: string;
  status: string;
}

/**
 * flow.md §16 "Management" dashboard principle: exception-first, not a
 * manually-assembled report. This is deliberately not a chart-heavy
 * landing page — at Phase 1 scale, what a Warden/Admin actually needs on
 * open is "what needs my attention right now", which is queues and counts,
 * not visualisation for its own sake.
 */
export function Dashboard() {
  const { me } = useAuth();
  const { settings } = useTenantSettings();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [hostels, setHostels] = useState<Hostel[]>([]);
  const [applications, setApplications] = useState<HostelApplication[]>([]);
  const [pendingAllocation, setPendingAllocation] = useState<HostelApplication[]>([]);
  const [awaitingCheckIn, setAwaitingCheckIn] = useState<Allocation[]>([]);
  const [noShowQueue, setNoShowQueue] = useState<Allocation[]>([]);
  const [activeResidents, setActiveResidents] = useState<Allocation[]>([]);
  const [openCases, setOpenCases] = useState<Case[]>([]);
  const [commonAreaProblems, setCommonAreaProblems] = useState<CommonAreaProblem[]>([]);
  const [pendingNotices, setPendingNotices] = useState<OperationalNotice[]>([]);
  const [noticeError, setNoticeError] = useState<string | null>(null);
  const [acking, setAcking] = useState<string | null>(null);

  const isStaff = isPlatformAdmin(me) || hasHostelRole(me, 'warden');

  async function loadPendingNotices() {
    const mine = await noticesApi.listMyNotices();
    const unacked = mine.filter((ack) => !ack.acknowledgedAt);
    const notices = await Promise.all(unacked.map((ack) => noticesApi.getNotice(ack.noticeId)));
    setPendingNotices(notices);
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const [hostelList, allApps, activeAlloc, checkInAlloc] = await Promise.all([
        listHostels(),
        listApplications(),
        listAllocations('checked_in_active'),
        listAllocations('awaiting_check_in'),
      ]);
      const noShow = isStaff ? await listNoShowQueue() : [];
      // ux-flow.md §5.1: "Complaints" is one of the Warden's day-to-day
      // queues — 'reported' is specifically "awaiting triage", the exact
      // exception a Warden needs to see first.
      const cases = isStaff ? await listCases({ status: 'reported' }) : [];
      // "Common area problems" queue — deferred idea from Batch 19, built
      // now: open sanitation inspections (failed or needs-reinspection),
      // open utility outages, and open pest-control treatments, merged
      // into one exception queue the same way the other 5 cards work.
      // "Open" for outages/pest treatments means anything short of
      // 'closed' — reported-but-not-yet-fixed and fixed-but-not-yet-closed
      // both still need a Warden's eyes on them.
      const commonAreaIssues = isStaff
        ? await (async () => {
            const [inspections, outages, pests, areas] = await Promise.all([
              listPendingReinspections(),
              listOutages(),
              listPestTreatments(),
              listCommonAreas(),
            ]);
            return buildCommonAreaProblems(inspections, outages, pests, areas);
          })()
        : [];
      // Real gap found live via SELF-TEST-GUIDE.md Batch 21 — Notices
      // (Duty Roster & Notices page) had no resident-facing screen at all:
      // that page is staff-only, and publishing a notice never even
      // notified anyone. This is where residents can now actually see and
      // acknowledge what was published to them.
      if (!isStaff) await loadPendingNotices();
      if (cancelled) return;
      setHostels(hostelList);
      setApplications(allApps);
      setPendingAllocation(allApps.filter((a) => a.status === 'allocation_ready'));
      setActiveResidents(activeAlloc);
      setAwaitingCheckIn(checkInAlloc);
      setNoShowQueue(noShow);
      setOpenCases(cases);
      setCommonAreaProblems(commonAreaIssues);
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStaff]);

  async function handleAcknowledge(noticeId: string) {
    setAcking(noticeId);
    setNoticeError(null);
    try {
      await noticesApi.acknowledgeNotice(noticeId);
      await loadPendingNotices();
    } catch (err) {
      setNoticeError(errorMessage(err));
    } finally {
      setAcking(null);
    }
  }

  if (loading) return <PageSpinner />;

  const reviewQueue = applications.filter((a) => ['submitted', 'under_review'].includes(a.status));
  const totalBedCapacity = hostels.reduce((sum, h) => sum + h.capacity, 0);

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description={me?.name ? `Welcome back, ${me.name}.` : 'Welcome back.'}
        // ux-flow.md §3.2: "Raise a Complaint" is a direct spoke off the
        // resident's Dashboard hub, not buried inside another screen.
        // ux-flow.md §3.2: "Raise a Complaint" and "Initiate Checkout" are
        // both direct spokes off the resident's Dashboard hub.
        action={
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button variant="secondary" onClick={() => navigate('/checkout', { state: { openRequest: true } })}>
              Initiate checkout
            </Button>
            <Button variant="secondary" onClick={() => navigate('/cases?type=complaint', { state: { openReport: true } })}>
              Report a complaint
            </Button>
          </div>
        }
      />

      {!isStaff && pendingNotices.length > 0 && (
        <Card tone="warning" className="mb-6">
          <CardHeader>
            <p className="text-sm font-medium text-amber-800">Notices needing your acknowledgement ({pendingNotices.length})</p>
          </CardHeader>
          <CardBody>
            {noticeError && <Alert>{noticeError}</Alert>}
            <ul className="divide-y divide-slate-100">
              {pendingNotices.map((n) => (
                <li key={n.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <div>
                    <p className="flex items-center gap-2 text-slate-700">
                      {n.severity === 'critical' && (
                        <span className="inline-flex items-center rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700">Critical</span>
                      )}
                      {n.title}
                    </p>
                    {n.body && <p className="mt-0.5 text-xs text-slate-500">{n.body}</p>}
                  </div>
                  <Button size="sm" onClick={() => void handleAcknowledge(n.id)} disabled={acking === n.id}>
                    {acking === n.id ? 'Acknowledging…' : 'Acknowledge'}
                  </Button>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}

      <motion.div
        className="grid grid-cols-2 gap-3 sm:grid-cols-4"
        initial="hidden"
        animate="show"
        variants={{ hidden: {}, show: { transition: { staggerChildren: 0.06 } } }}
      >
        <Stat icon={<BuildingIcon />} label="Hostels" value={hostels.length} />
        <Stat icon={<BedIcon />} label="Rated capacity" value={totalBedCapacity} />
        <Stat icon={<UserIcon />} label="Active residents" value={activeResidents.length} />
        <Stat
          icon={<ClipboardIcon />}
          label="Awaiting check-in"
          value={awaitingCheckIn.length}
          tone={awaitingCheckIn.length ? 'warning' : undefined}
        />
      </motion.div>

      {isStaff && (
        <motion.div
          className="mt-6 grid gap-4 lg:grid-cols-2"
          initial="hidden"
          animate="show"
          variants={{ hidden: {}, show: { transition: { staggerChildren: 0.06, delayChildren: 0.1 } } }}
        >
          <ExceptionCard
            icon={<ClipboardIcon />}
            title="Applications awaiting review"
            count={reviewQueue.length}
            empty="No applications waiting on a decision."
            items={reviewQueue.slice(0, 5).map((a) => ({ id: a.id, primary: `Term ${a.term}`, status: a.status }))}
          />
          <ExceptionCard
            icon={<ClipboardIcon />}
            title={`Ready for ${settings?.terminology.bedLabel ?? 'bed'} allocation`}
            count={pendingAllocation.length}
            empty="Nothing in the allocation-ready queue."
            items={pendingAllocation.slice(0, 5).map((a) => ({ id: a.id, primary: `Term ${a.term}`, status: a.status }))}
          />
          <ExceptionCard
            icon={<BedIcon />}
            title="No-show review"
            count={noShowQueue.length}
            empty="No allocations past their check-in deadline."
            items={noShowQueue.slice(0, 5).map((a) => ({
              id: a.id,
              primary: a.checkInDeadline ? `Deadline was ${new Date(a.checkInDeadline).toLocaleDateString()}` : 'No deadline set',
              status: a.status,
            }))}
          />
          <ExceptionCard
            icon={<BedIcon />}
            title="Awaiting check-in"
            count={awaitingCheckIn.length}
            empty="No allocations pending check-in."
            items={awaitingCheckIn.slice(0, 5).map((a) => ({
              id: a.id,
              primary: a.checkInDeadline ? `Due ${new Date(a.checkInDeadline).toLocaleDateString()}` : 'No deadline set',
              status: a.status,
            }))}
          />
          <ExceptionCard
            icon={<AlertIcon />}
            title="Complaints & incidents awaiting triage"
            count={openCases.length}
            empty="Nothing waiting on triage."
            items={openCases.slice(0, 5).map((c) => ({ id: c.id, primary: c.category, status: c.status }))}
          />
          <ExceptionCard
            icon={<WrenchIcon />}
            title="Common area problems"
            count={commonAreaProblems.length}
            empty="No open sanitation, outage or pest-control issues."
            items={commonAreaProblems.slice(0, 5)}
          />
        </motion.div>
      )}
    </div>
  );
}

// Merges 3 different tables (sanitation inspections, utility outages, pest
// treatments) into one queue for the "Common area problems" card — the
// same "one exception queue per screen" shape as the app's other 5
// Dashboard cards, just fed from 3 sources instead of 1. Not exported —
// only the Dashboard's own load() calls this.
function buildCommonAreaProblems(
  inspections: SanitationInspection[],
  outages: UtilityOutage[],
  pests: PestControlTreatment[],
  areas: { id: string; name: string }[],
): CommonAreaProblem[] {
  const areaName = new Map(areas.map((a) => [a.id, a.name]));

  const fromInspections: CommonAreaProblem[] = inspections.map((i) => ({
    id: `inspection-${i.id}`,
    primary: `Sanitation — ${areaName.get(i.commonAreaId) ?? 'area'} (score ${i.cleanlinessScore})`,
    status: i.status,
  }));

  // 'closed' is the only terminal state for both outages and pest
  // treatments — everything else (reported, notified, restored, verified /
  // scheduled, resident_notified, treated, reinspected) still needs
  // someone to follow it through to close, so all of it counts as "open".
  const fromOutages: CommonAreaProblem[] = outages
    .filter((o) => o.status !== 'closed')
    .map((o) => ({
      id: `outage-${o.id}`,
      primary: `Outage — ${o.outageType.replace(/_/g, ' ')} (${o.scopeType})`,
      status: o.status,
    }));

  const fromPests: CommonAreaProblem[] = pests
    .filter((p) => p.status !== 'closed')
    .map((p) => ({
      id: `pest-${p.id}`,
      primary: `Pest — ${p.scopeType.replace(/_/g, ' ')}`,
      status: p.status,
    }));

  return [...fromInspections, ...fromOutages, ...fromPests];
}

const cardMotionVariants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' as const } },
};

function Stat({ icon, label, value, tone }: { icon: ReactNode; label: string; value: number; tone?: 'warning' }) {
  const isWarning = tone === 'warning' && value > 0;
  return (
    <motion.div variants={cardMotionVariants}>
      <Card interactive>
        <CardBody className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
            <p className={['mt-1.5 text-2xl font-semibold tabular-nums', isWarning ? 'text-amber-600' : 'text-foreground'].join(' ')}>
              {value}
            </p>
          </div>
          <span
            className={[
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
              isWarning ? 'bg-amber-50 text-amber-600' : 'bg-accent-subtle text-accent',
            ].join(' ')}
          >
            {icon}
          </span>
        </CardBody>
      </Card>
    </motion.div>
  );
}

function ExceptionCard({
  icon,
  title,
  count,
  empty,
  items,
}: {
  icon: ReactNode;
  title: string;
  count: number;
  empty: string;
  items: { id: string; primary: string; status: string }[];
}) {
  return (
    <motion.div variants={cardMotionVariants}>
      <Card interactive>
        <CardBody>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent-subtle text-accent">
                {icon}
              </span>
              {title}
            </div>
            <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-semibold tabular-nums text-slate-600">
              {count}
            </span>
          </div>
          {items.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">{empty}</p>
          ) : (
            <ul className="divide-y divide-border">
              {items.map((item) => (
                <li key={item.id} className="flex items-center justify-between py-2 text-sm">
                  <span className="text-slate-700">{item.primary}</span>
                  <StatusPill status={item.status} />
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </motion.div>
  );
}
