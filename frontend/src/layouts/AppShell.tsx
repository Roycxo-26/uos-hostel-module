import { useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTenantSettings } from '../context/TenantSettingsContext';
import { Avatar } from '../design-system/Avatar';
import { NotificationBell } from '../design-system/NotificationBell';
import { Sheet } from '../design-system/Sheet';
import {
  AlertIcon,
  BedIcon,
  BuildingIcon,
  ChartIcon,
  ClipboardIcon,
  DoorIcon,
  HomeIcon,
  KeyIcon,
  LogOutIcon,
  MoreIcon,
  SettingsIcon,
  UtensilsIcon,
  WrenchIcon,
} from '../design-system/icons';
import { hasHostelRole, isPlatformAdmin, type Me } from '../types';

interface NavItem {
  path: string;
  label: string;
  icon: (props: { className?: string }) => JSX.Element;
  visible?: (me: Me | null) => boolean;
  /** Desktop sidebar section header. Undefined = ungrouped (Dashboard only).
   * Matches BR §5's own nav-tree grouping, not an arbitrary split. */
  group?: string;
  /** Shows directly in the mobile bottom nav. Everything else lives behind
   * "More" — BR §5's full tree has 13 sections; even this app's earlier,
   * smaller flat list already exceeded what a bottom bar can hold well. */
  primaryMobile?: boolean;
}

// UOS HOSTEL BR.md §5's nav tree, reconciled with what's actually built:
// - "Hostel Core" groups UOS-131–133 + UOS-136 (Structure through Checkout)
//   — the residential lifecycle, matching flow.md's own domain ordering.
// - "Safety & Services" groups UOS-134's movement/headcount alongside
//   UOS-135 (split into Help Desk/Complaints vs Safety/Incidents, per the
//   BR's own two-section split — see Cases.tsx's own comment on why one
//   page serves both) and the Mess/Kitchen/Maintenance placeholders.
// - "Admin" is Reports (TODO.md Batch 9) and Settings.
const NAV_ITEMS: NavItem[] = [
  { path: '/', label: 'Dashboard', icon: HomeIcon, primaryMobile: true },

  {
    path: '/structure',
    label: 'Structure',
    icon: BuildingIcon,
    visible: (me) => isPlatformAdmin(me) || hasHostelRole(me, 'warden'),
    group: 'Hostel Core',
  },
  { path: '/applications', label: 'Applications', icon: ClipboardIcon, group: 'Hostel Core', primaryMobile: true },
  { path: '/allocations', label: 'Allocations', icon: BedIcon, group: 'Hostel Core', primaryMobile: true },
  { path: '/movement', label: 'Leave & Headcount', icon: DoorIcon, group: 'Hostel Core', primaryMobile: true },
  { path: '/checkout', label: 'Checkout', icon: KeyIcon, group: 'Hostel Core' },

  { path: '/cases?type=complaint', label: 'Help Desk / Complaints', icon: AlertIcon, group: 'Safety & Services' },
  { path: '/cases?type=incident', label: 'Safety & Incidents', icon: AlertIcon, group: 'Safety & Services' },
  // HOSTEL-GAP-ANALYSIS.md D17.21 (TODO.md Batch 20) — every resident can
  // raise and track their own grievance; only assignment/decision actions
  // are staff-gated (see Grievances.tsx). Not staff-only, unlike the
  // Batch 16-19 pages above.
  { path: '/grievances', label: 'Grievances', icon: AlertIcon, group: 'Safety & Services' },
  // HOSTEL-GAP-ANALYSIS.md D17.17 (TODO.md Batch 16) — fire/safety status
  // and evacuation-drill/emergency-muster management. Staff-only for now
  // (matches the backend's safety:manage gate on every mutating action) —
  // a resident-facing "drill in progress, assemble now" view is a real
  // future step (naturally D17.21's resident rights view territory), not
  // built here.
  {
    path: '/safety',
    label: 'Fire & Safety',
    icon: AlertIcon,
    visible: (me) => isPlatformAdmin(me) || hasHostelRole(me, 'warden'),
    group: 'Safety & Services',
  },
  // HOSTEL-GAP-ANALYSIS.md D17.18 (TODO.md Batch 17) — staff-only, same
  // reasoning as Fire & Safety above.
  {
    path: '/occupancy-verification',
    label: 'Occupancy Verification',
    icon: ClipboardIcon,
    visible: (me) => isPlatformAdmin(me) || hasHostelRole(me, 'warden'),
    group: 'Safety & Services',
  },
  // HOSTEL-GAP-ANALYSIS.md D17.20 (TODO.md Batch 18) — staff-only, same
  // reasoning as the other new Batch 16-18 pages.
  {
    path: '/room-access',
    label: 'Room Access & Custody',
    icon: KeyIcon,
    visible: (me) => isPlatformAdmin(me) || hasHostelRole(me, 'warden'),
    group: 'Safety & Services',
  },
  // HOSTEL-GAP-ANALYSIS.md D17.19 (TODO.md Batch 19) — staff-only, same
  // reasoning.
  {
    path: '/common-areas',
    label: 'Common Areas & Utilities',
    icon: WrenchIcon,
    visible: (me) => isPlatformAdmin(me) || hasHostelRole(me, 'warden'),
    group: 'Safety & Services',
  },
  // HOSTEL-GAP-ANALYSIS.md D17.22 (TODO.md Batch 21) — staff-only, same
  // reasoning as the other new Batch 16-19 pages.
  {
    path: '/duty-roster',
    label: 'Duty Roster & Notices',
    icon: AlertIcon,
    visible: (me) => isPlatformAdmin(me) || hasHostelRole(me, 'warden'),
    group: 'Safety & Services',
  },
  { path: '/mess', label: 'Mess', icon: UtensilsIcon, group: 'Safety & Services' },
  {
    path: '/kitchen',
    label: 'Kitchen',
    icon: UtensilsIcon,
    visible: (me) => isPlatformAdmin(me) || hasHostelRole(me, 'warden'),
    group: 'Safety & Services',
  },
  { path: '/maintenance', label: 'Room Maintenance', icon: WrenchIcon, group: 'Safety & Services' },

  {
    path: '/reports',
    label: 'Reports & Audit',
    icon: ChartIcon,
    visible: (me) => isPlatformAdmin(me) || hasHostelRole(me, 'warden'),
    group: 'Admin',
  },
  { path: '/settings', label: 'Settings', icon: SettingsIcon, visible: isPlatformAdmin, group: 'Admin' },
];

function humanizeRole(role: string): string {
  return role
    .split('_')
    .map((w) => w[0]?.toUpperCase() + w.slice(1))
    .join(' ');
}

function displayRole(me: Me): string {
  if (me.isSuperAdmin) return 'Super Admin';
  if (me.orgRole === 'org_admin') return 'Admin';
  const hostelRole = me.hostelRoles[0]?.role;
  return hostelRole ? humanizeRole(hostelRole) : 'Student';
}

/** A nav item's path may carry a query string (the two /cases entries) —
 * plain pathname comparison would show both as "active" simultaneously
 * whenever on /cases, regardless of which type. Full pathname+search
 * comparison for those; pathname-only for everything else, so an
 * unrelated stray query param elsewhere can't break a plain route's
 * active state. */
function isNavItemActive(item: NavItem, pathname: string, search: string): boolean {
  if (item.path.includes('?')) return pathname + search === item.path;
  return pathname === item.path;
}

/**
 * Mobile-first per the brief: a bottom tab bar is the primary navigation
 * below `md`, and only becomes a conventional left sidebar from `md` up.
 * Same NAV_ITEMS config drives both — the sidebar renders every visible
 * item grouped by section; the bottom bar renders only `primaryMobile`
 * items plus a "More" tab opening the same grouped list in a sheet.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const { user, me, logout } = useAuth();
  const { settings } = useTenantSettings();
  const location = useLocation();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  if (!user) return null;

  const items = NAV_ITEMS.filter((item) => !item.visible || item.visible(me));
  const primaryMobileItems = items.filter((item) => item.primaryMobile);
  const overflowItems = items.filter((item) => !item.primaryMobile);
  const institutionName = settings?.branding.institutionName ?? 'Hostel Management';

  const groups = new Map<string | undefined, NavItem[]>();
  for (const item of items) {
    const key = item.group;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }

  return (
    <div className="min-h-screen bg-slate-50 md:flex">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:w-64 md:shrink-0 md:flex-col md:overflow-y-auto md:border-r md:border-slate-200 md:bg-white">
        <div className="flex items-center justify-between gap-2.5 px-5 py-5">
          <div className="flex min-w-0 items-center gap-2.5">
            <Avatar label={institutionName} shape="square" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold leading-tight text-slate-900">{institutionName}</p>
              <p className="text-xs text-slate-500">Hostel Management</p>
            </div>
          </div>
          <NotificationBell />
        </div>
        <nav className="flex-1 space-y-4 px-3 pb-3">
          {[...groups.entries()].map(([group, groupItems]) => (
            <div key={group ?? '__root'}>
              {group && <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{group}</p>}
              <div className="space-y-0.5">
                {groupItems.map((item) => (
                  <SidebarLink key={item.path} item={item} active={isNavItemActive(item, location.pathname, location.search)} />
                ))}
              </div>
            </div>
          ))}
        </nav>
        <div className="border-t border-slate-200 p-3">
          <UserSummary me={me} sub={user.sub} onLogout={logout} />
        </div>
      </aside>

      <div className="flex min-h-screen flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="pt-safe sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur md:hidden">
          <div className="flex items-center justify-between gap-2 px-4 py-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <Avatar label={institutionName} shape="square" size="sm" />
              <p className="truncate text-sm font-semibold text-slate-900">{institutionName}</p>
            </div>
            <div className="flex items-center gap-1">
              <NotificationBell />
              <button
                type="button"
                onClick={() => setUserMenuOpen((v) => !v)}
                aria-label="Account menu"
                className="rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                <Avatar label={me?.name ?? user.sub} size="sm" />
              </button>
            </div>
          </div>
          {userMenuOpen && (
            <div className="border-t border-slate-200 px-4 py-3">
              <UserSummary me={me} sub={user.sub} onLogout={logout} />
            </div>
          )}
        </header>

        <main className="flex-1 pb-20 md:pb-0">
          <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">{children}</div>
        </main>

        {/* Mobile bottom nav */}
        <nav className="pb-safe fixed inset-x-0 bottom-0 z-30 flex border-t border-slate-200 bg-white md:hidden">
          {primaryMobileItems.map((item) => (
            <BottomNavLink key={item.path} item={item} active={isNavItemActive(item, location.pathname, location.search)} />
          ))}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            className="flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium text-slate-500"
          >
            <MoreIcon />
            More
            <span className="h-1 w-1 rounded-full bg-transparent" />
          </button>
        </nav>
      </div>

      {/* "More" overflow — same grouped structure as the desktop sidebar,
          just reached via a sheet instead of always-visible on mobile. */}
      <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} title="More">
        <div className="space-y-4">
          {[...groups.entries()].map(([group, groupItems]) => {
            const shown = groupItems.filter((item) => !item.primaryMobile);
            if (shown.length === 0) return null;
            return (
              <div key={group ?? '__root'}>
                {group && <p className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{group}</p>}
                <div className="space-y-0.5">
                  {shown.map((item) => {
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.path}
                        to={item.path}
                        onClick={() => setMoreOpen(false)}
                        className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
                      >
                        <Icon className="shrink-0 text-slate-500" />
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </Sheet>
    </div>
  );
}

function SidebarLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      to={item.path}
      aria-current={active ? 'page' : undefined}
      className={[
        'relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
        active ? 'bg-accent-subtle text-accent' : 'text-slate-600 hover:bg-slate-100',
      ].join(' ')}
    >
      {/* Left accent bar on the active item — a stronger, more deliberate
          "you are here" signal than a background tint alone, and the exact
          pattern most institutional/enterprise admin shells use precisely
          because it reads clearly at a glance, not just on hover. */}
      {active && <span className="absolute -left-3 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-accent" />}
      <Icon className="shrink-0" />
      {item.label}
    </Link>
  );
}

function BottomNavLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      to={item.path}
      aria-current={active ? 'page' : undefined}
      className={[
        'flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium',
        active ? 'text-accent' : 'text-slate-500',
      ].join(' ')}
    >
      <Icon />
      {item.label}
      <span className={['h-1 w-1 rounded-full transition-colors', active ? 'bg-accent' : 'bg-transparent'].join(' ')} />
    </Link>
  );
}

function UserSummary({ me, sub, onLogout }: { me: Me | null; sub: string; onLogout: () => void }) {
  const name = me?.name ?? sub.slice(0, 8);
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-2.5">
        <Avatar label={name} size="sm" />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-slate-900">{name}</p>
          <p className="truncate text-xs text-slate-500">{me ? displayRole(me) : '…'}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={onLogout}
        aria-label="Log out"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
      >
        <LogOutIcon />
      </button>
    </div>
  );
}
