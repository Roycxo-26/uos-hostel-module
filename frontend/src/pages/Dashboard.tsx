import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { listAllocations, listNoShowQueue } from '../api/allocations';
import { listApplications } from '../api/applications';
import { listCases } from '../api/cases';
import { listHostels } from '../api/structure';
import { useAuth } from '../context/AuthContext';
import { useTenantSettings } from '../context/TenantSettingsContext';
import { Button, Card, CardBody, PageHeader, PageSpinner, StatusPill } from '../design-system';
import { AlertIcon, BedIcon, BuildingIcon, ClipboardIcon, UserIcon } from '../design-system/icons';
import { hasHostelRole, isPlatformAdmin, type Allocation, type Case, type Hostel, type HostelApplication } from '../types';

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

  const isStaff = isPlatformAdmin(me) || hasHostelRole(me, 'warden');

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
      if (cancelled) return;
      setHostels(hostelList);
      setApplications(allApps);
      setPendingAllocation(allApps.filter((a) => a.status === 'allocation_ready'));
      setActiveResidents(activeAlloc);
      setAwaitingCheckIn(checkInAlloc);
      setNoShowQueue(noShow);
      setOpenCases(cases);
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [isStaff]);

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

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat icon={<BuildingIcon />} label="Hostels" value={hostels.length} />
        <Stat icon={<BedIcon />} label="Rated capacity" value={totalBedCapacity} />
        <Stat icon={<UserIcon />} label="Active residents" value={activeResidents.length} />
        <Stat
          icon={<ClipboardIcon />}
          label="Awaiting check-in"
          value={awaitingCheckIn.length}
          tone={awaitingCheckIn.length ? 'warning' : undefined}
        />
      </div>

      {isStaff && (
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
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
        </div>
      )}
    </div>
  );
}

function Stat({ icon, label, value, tone }: { icon: ReactNode; label: string; value: number; tone?: 'warning' }) {
  const isWarning = tone === 'warning' && value > 0;
  return (
    <Card>
      <CardBody className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
          <p className={['mt-1.5 text-2xl font-semibold tabular-nums', isWarning ? 'text-amber-600' : 'text-slate-900'].join(' ')}>
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
    <Card>
      <CardBody>
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent-subtle text-accent">
              {icon}
            </span>
            {title}
          </div>
          <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold tabular-nums text-slate-600">
            {count}
          </span>
        </div>
        {items.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-400">{empty}</p>
        ) : (
          <ul className="divide-y divide-slate-100">
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
  );
}
