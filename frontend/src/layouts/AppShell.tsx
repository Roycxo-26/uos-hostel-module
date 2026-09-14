import { motion } from 'framer-motion';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTenantSettings } from '../context/TenantSettingsContext';
import { Avatar } from '../design-system/Avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../design-system/DropdownMenu';
import { NotificationBell } from '../design-system/NotificationBell';
import { Sheet } from '../design-system/Sheet';
import { ThemeToggle } from '../design-system/ThemeToggle';
import {
  AlertIcon,
  BedIcon,
  BuildingIcon,
  CameraIcon,
  ChartIcon,
  ClipboardIcon,
  DoorIcon,
  HomeIcon,
  KeyIcon,
  LogOutIcon,
  MoreIcon,
  SettingsIcon,
  UserIcon,
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
//   page serves both), Mess/Kitchen (still placeholders) and Maintenance
//   (real since D17.08, TODO.md Batch 29 — no longer a placeholder).
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
  // HOSTEL-GAP-ANALYSIS.md D17.26 (TODO.md Batch 30, item 126) — not
  // staff-only, almost entirely a resident-to-resident consent workflow.
  { path: '/roommate', label: 'Roommate Preference', icon: UserIcon, group: 'Hostel Core' },
  { path: '/allocations', label: 'Allocations', icon: BedIcon, group: 'Hostel Core', primaryMobile: true },
  { path: '/movement', label: 'Leave & Headcount', icon: DoorIcon, group: 'Hostel Core', primaryMobile: true },
  { path: '/checkout', label: 'Checkout', icon: KeyIcon, group: 'Hostel Core' },
  // HOSTEL-GAP-ANALYSIS.md D17.07 depth (TODO.md Batch 25) — staff-only,
  // resident privilege changes sit alongside Allocations/Checkout as
  // resident-lifecycle actions, not a Safety & Services concern.
  {
    path: '/privilege-changes',
    label: 'Privilege Changes',
    icon: KeyIcon,
    visible: (me) => isPlatformAdmin(me) || hasHostelRole(me, 'warden'),
    group: 'Hostel Core',
  },
  // HOSTEL-GAP-ANALYSIS.md D17.05 (TODO.md Batch 27) — BR.md's own nav
  // grouping lists "Fees / Deposits / Checkout / Clearance" together; not
  // staff-only, unlike Privilege Changes above — every resident sees and
  // disputes their own account here.
  { path: '/finance', label: 'Finance', icon: ChartIcon, group: 'Hostel Core' },
  // HOSTEL-GAP-ANALYSIS.md D17.13 (TODO.md Batch 30) — an explicitly
  // optional feature entitlement (see Settings); not staff-only, a
  // resident tracks their own placement.
  { path: '/off-campus', label: 'Off-Campus Housing', icon: BuildingIcon, group: 'Hostel Core' },

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
  // HOSTEL-GAP-ANALYSIS.md D17.24 (TODO.md Batch 30, item 125) — not
  // staff-only, a resident requests a booking or proposes a programme
  // (see ResidenceLife.tsx).
  { path: '/residence-life', label: 'Residence Life', icon: HomeIcon, group: 'Safety & Services' },
  // HOSTEL-GAP-ANALYSIS.md D17.22 (TODO.md Batch 21) — staff-only, same
  // reasoning as the other new Batch 16-19 pages.
  {
    path: '/duty-roster',
    label: 'Duty Roster & Notices',
    icon: AlertIcon,
    visible: (me) => isPlatformAdmin(me) || hasHostelRole(me, 'warden'),
    group: 'Safety & Services',
  },
  // Frontline/offline support (12 Sep 2026) — UOS_Final.docx audit
  // §"ground and frontline worker mobile mode". Same staff-only gate as
  // the rest of this group, see Frontline.tsx's own header comment on why
  // (no distinct Floor Incharge login role exists yet).
  {
    path: '/frontline',
    label: 'Frontline',
    icon: CameraIcon,
    visible: (me) => isPlatformAdmin(me) || hasHostelRole(me, 'warden'),
    group: 'Safety & Services',
  },
  // HOSTEL-GAP-ANALYSIS.md D17.25 (TODO.md Batch 22) — staff-only, same
  // reasoning as the other new Batch 16-21 pages.
  {
    path: '/closures',
    label: 'Closures & Guest Stays',
    icon: BuildingIcon,
    visible: (me) => isPlatformAdmin(me) || hasHostelRole(me, 'warden'),
    group: 'Safety & Services',
  },
  { path: '/mess', label: 'Mess', icon: UtensilsIcon, group: 'Safety & Services' },
  // HOSTEL-GAP-ANALYSIS.md D17.23 (TODO.md Batch 30, item 124) — not
  // staff-only, a resident tracks their own order (see Laundry.tsx).
  { path: '/laundry', label: 'Laundry', icon: ClipboardIcon, group: 'Safety & Services' },
  {
    path: '/kitchen',
    label: 'Kitchen',
    icon: UtensilsIcon,
    visible: (me) => isPlatformAdmin(me) || hasHostelRole(me, 'warden'),
    group: 'Safety & Services',
  },
  { path: '/maintenance', label: 'Room Maintenance', icon: WrenchIcon, group: 'Safety & Services' },
  // HOSTEL-GAP-ANALYSIS.md D17.15 (TODO.md Batch 30) — not staff-only, a
  // resident sees their own room/floor's entry (see Gamification.tsx).
  { path: '/gamification', label: 'Gamification', icon: ChartIcon, group: 'Safety & Services' },
  // HOSTEL-GAP-ANALYSIS.md D17.06 (TODO.md Batch 28) — not staff-only, a
  // host requests/tracks their own visitor (see Visitors.tsx).
  { path: '/visitors', label: 'Visitors', icon: UserIcon, group: 'Safety & Services' },
  // HOSTEL-GAP-ANALYSIS.md D17.14 (TODO.md Batch 30, item 121) — not
  // staff-only, a resident sees and responds to campaigns open for their
  // own scope; running campaigns and analytics is staff-gated server-side
  // (see Feedback.tsx).
  { path: '/feedback', label: 'Feedback & Surveys', icon: AlertIcon, group: 'Safety & Services' },

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
 * active state.
 *
 * Real gap found live via SELF-TEST-GUIDE.md Batch 24: landing on the
 * bare, unfiltered /cases (e.g. a notification link straight to a
 * welfare/safeguarding case, which never carries a ?type — see Cases.tsx's
 * own comment on why) matched neither /cases?type=complaint nor
 * /cases?type=incident exactly, so nothing in the sidebar highlighted at
 * all — no "you are here" cue anywhere. With no search string present,
 * fall back to a pathname-only match so at least one relevant tab lights
 * up (both light up together here, which is honest — you're on a Cases
 * page, just not scoped to either one specifically). */
function isNavItemActive(item: NavItem, pathname: string, search: string): boolean {
  if (item.path.includes('?')) {
    if (search) return pathname + search === item.path;
    return pathname === item.path.split('?')[0];
  }
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
  const [moreOpen, setMoreOpen] = useState(false);

  if (!user) return null;

  const items = NAV_ITEMS.filter((item) => !item.visible || item.visible(me));
  const primaryMobileItems = items.filter((item) => item.primaryMobile);
  const institutionName = settings?.branding.institutionName ?? 'Hostel Management';

  const groups = new Map<string | undefined, NavItem[]>();
  for (const item of items) {
    const key = item.group;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }

  return (
    <div className="min-h-screen bg-background md:flex">
      <div className="ambient-surface" aria-hidden="true" />
      {/* Desktop sidebar */}
      <aside className="hidden md:sticky md:top-0 md:flex md:h-screen md:w-64 md:shrink-0 md:flex-col md:border-r md:border-border md:bg-card">
        <div className="shrink-0 flex items-center justify-between gap-2.5 px-5 py-5">
          <div className="flex min-w-0 items-center gap-2.5">
            <Avatar label={institutionName} shape="square" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold leading-tight text-foreground">{institutionName}</p>
              <p className="text-xs text-muted-foreground">Hostel Management</p>
            </div>
          </div>
        </div>
        <nav className="flex-1 space-y-4 overflow-y-auto px-3 pb-3">
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
        <div className="shrink-0 border-t border-border p-3">
          <UserMenu me={me} sub={user.sub} onLogout={logout} />
        </div>
      </aside>

      <div className="flex min-h-screen flex-1 flex-col">
        {/* Top bar — mobile brand row, and (from md up) the utility rail
            that used to live in the desktop sidebar header. Keeping it
            here instead of in the sidebar means it's reachable from the
            same spot on every viewport size. */}
        {/* Solid, not translucent — `card` is a CSS-variable-backed colour
            (see index.css) and Tailwind's `/NN` opacity modifier doesn't
            generate CSS against a var()-based colour (confirmed
            empirically; see Field.tsx's own note). */}
        <header className="pt-safe sticky top-0 z-30 border-b border-border bg-card">
          <div className="flex items-center justify-between gap-2 px-4 py-3 sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-2.5 md:hidden">
              <Avatar label={institutionName} shape="square" size="sm" />
              <p className="truncate text-sm font-semibold text-foreground">{institutionName}</p>
            </div>
            <div className="hidden md:block" />
            <div className="flex items-center gap-1">
              <ThemeToggle />
              <NotificationBell />
              <div className="md:hidden">
                <MobileUserMenu me={me} sub={user.sub} onLogout={logout} />
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 pb-20 md:pb-0">
          {/* No route-keyed AnimatePresence wrapper here on purpose: keying
              a motion.div by location.pathname forces React to fully
              unmount and remount every page on each navigation rather than
              just re-render it — wasteful (drops any in-page state on a
              search-param-only change, e.g. switching the Cases sidebar
              entry between ?type=complaint/incident), and in dev,
              StrictMode's intentional double-invoke of that fresh mount
              plays the fade twice, reading as a flash/refresh. Every page
              already gets its own "arrived with a little life" moment from
              PageHeader's own entrance animation, so nothing is lost by
              not doing it again at this level. */}
          <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">{children}</div>
        </main>

        {/* Mobile bottom nav */}
        <nav className="pb-safe fixed inset-x-0 bottom-0 z-30 flex border-t border-border bg-card md:hidden">
          {primaryMobileItems.map((item) => (
            <BottomNavLink key={item.path} item={item} active={isNavItemActive(item, location.pathname, location.search)} />
          ))}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            className="flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium text-muted-foreground"
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
                        className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-muted"
                      >
                        <Icon className="shrink-0 text-muted-foreground" />
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
        active ? 'bg-accent-subtle text-accent' : 'text-slate-600 hover:bg-muted',
      ].join(' ')}
    >
      {/* Shared-layout active indicator — framer-motion smoothly slides
          this bar from whichever item it was last on to this one instead
          of it just appearing, the one "wow, that's polished" touch
          navigation gets to show off on every single route change. */}
      {active && (
        <motion.span
          layoutId="sidebar-active-indicator"
          transition={{ type: 'spring', stiffness: 500, damping: 40 }}
          className="absolute -left-3 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-accent"
        />
      )}
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
        'flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors',
        active ? 'text-accent' : 'text-muted-foreground',
      ].join(' ')}
    >
      <Icon />
      {item.label}
      <span className={['h-1 w-1 rounded-full transition-colors', active ? 'bg-accent' : 'bg-transparent'].join(' ')} />
    </Link>
  );
}

/** Desktop sidebar footer — a real Radix dropdown instead of a static
 * summary row, so "log out" doesn't have to be the only action ever
 * offered there again. */
function UserMenu({ me, sub, onLogout }: { me: Me | null; sub: string; onLogout: () => void }) {
  const name = me?.name ?? sub.slice(0, 8);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-2.5 rounded-lg p-1.5 text-left transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <Avatar label={name} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">{name}</p>
            <p className="truncate text-xs text-muted-foreground">{me ? displayRole(me) : '…'}</p>
          </div>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="w-56">
        <DropdownMenuLabel>{name}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={onLogout} className="gap-2.5">
          <LogOutIcon size={16} />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Mobile top-bar equivalent — same menu contents, triggered from the
 * avatar instead of a footer row since there's no persistent sidebar to
 * anchor it to on small screens. */
function MobileUserMenu({ me, sub, onLogout }: { me: Me | null; sub: string; onLogout: () => void }) {
  const name = me?.name ?? sub.slice(0, 8);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label="Account menu" className="rounded-full focus-visible:outline-2 focus-visible:outline-offset-2">
          <Avatar label={name} size="sm" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          {name}
          <span className="mt-0.5 block text-[11px] font-normal text-muted-foreground">{me ? displayRole(me) : '…'}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={onLogout} className="gap-2.5">
          <LogOutIcon size={16} />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
