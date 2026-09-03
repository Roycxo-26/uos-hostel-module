import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './layouts/AppShell';
import { AuthProvider, useAuth } from './context/AuthContext';
import { TenantSettingsProvider } from './context/TenantSettingsContext';
import { Allocations } from './pages/Allocations';
import { Applications } from './pages/Applications';
import { SsoCallback } from './pages/SsoCallback';
import { Cases } from './pages/Cases';
import { Checkout } from './pages/Checkout';
import { Closures } from './pages/Closures';
import { Dashboard } from './pages/Dashboard';
import { Finance } from './pages/Finance';
import { Gamification } from './pages/Gamification';
import { HostelStructure } from './pages/HostelStructure';
import { Kitchen } from './pages/Kitchen';
import { Laundry } from './pages/Laundry';
import { ResidenceLife } from './pages/ResidenceLife';
import { Login } from './pages/Login';
import { Maintenance } from './pages/Maintenance';
import { OffCampusHousing } from './pages/OffCampusHousing';
import { Mess } from './pages/Mess';
import { Movement } from './pages/Movement';
import { CommonAreas } from './pages/CommonAreas';
import { DutyRoster } from './pages/DutyRoster';
import { Grievances } from './pages/Grievances';
import { OccupancyVerification } from './pages/OccupancyVerification';
import { PrivilegeChanges } from './pages/PrivilegeChanges';
import { Reports } from './pages/Reports';
import { RoomAccess } from './pages/RoomAccess';
import { Safety } from './pages/Safety';
import { Settings } from './pages/Settings';
import { Visitors } from './pages/Visitors';
import { hasHostelRole, isPlatformAdmin } from './types';

function AdminOnly({ children }: { children: JSX.Element }) {
  const { user, me } = useAuth();
  if (!user || !isPlatformAdmin(me)) return <Navigate to="/" replace />;
  return children;
}

// Matches AppShell's own "Reports & Audit" nav-item visibility rule exactly
// — a route guard that disagreed with the nav link that leads to it would
// mean Warden could see the link but get bounced on arrival.
function StaffOnly({ children }: { children: JSX.Element }) {
  const { user, me } = useAuth();
  if (!user || !(isPlatformAdmin(me) || hasHostelRole(me, 'warden'))) return <Navigate to="/" replace />;
  return children;
}

function AuthenticatedApp() {
  return (
    <TenantSettingsProvider>
      <AppShell>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/structure" element={<HostelStructure />} />
          <Route path="/applications" element={<Applications />} />
          <Route path="/allocations" element={<Allocations />} />
          <Route path="/movement" element={<Movement />} />
          <Route path="/cases" element={<Cases />} />
          <Route path="/checkout" element={<Checkout />} />
          <Route path="/grievances" element={<Grievances />} />
          <Route
            path="/safety"
            element={
              <StaffOnly>
                <Safety />
              </StaffOnly>
            }
          />
          <Route
            path="/occupancy-verification"
            element={
              <StaffOnly>
                <OccupancyVerification />
              </StaffOnly>
            }
          />
          <Route
            path="/room-access"
            element={
              <StaffOnly>
                <RoomAccess />
              </StaffOnly>
            }
          />
          <Route
            path="/common-areas"
            element={
              <StaffOnly>
                <CommonAreas />
              </StaffOnly>
            }
          />
          <Route
            path="/duty-roster"
            element={
              <StaffOnly>
                <DutyRoster />
              </StaffOnly>
            }
          />
          <Route
            path="/closures"
            element={
              <StaffOnly>
                <Closures />
              </StaffOnly>
            }
          />
          <Route
            path="/privilege-changes"
            element={
              <StaffOnly>
                <PrivilegeChanges />
              </StaffOnly>
            }
          />
          {/* D17.05 (TODO.md Batch 27) — not staff-only, a resident sees
              and disputes their own financial events; raising/confirming/
              reversing is staff-gated server-side (see Finance.tsx). */}
          <Route path="/finance" element={<Finance />} />
          {/* D17.13 (TODO.md Batch 30) — not staff-only, a resident
              requests and tracks their own placement; approving providers/
              placements is staff-gated server-side (see
              OffCampusHousing.tsx). */}
          <Route path="/off-campus" element={<OffCampusHousing />} />
          {/* D17.15 (TODO.md Batch 30) — not staff-only, a resident sees
              their own room/floor's entry and can opt out or appeal;
              running competitions and per-hostel enable/disable is
              staff-gated server-side (see Gamification.tsx). */}
          <Route path="/gamification" element={<Gamification />} />
          {/* D17.23 (TODO.md Batch 30, item 124) — not staff-only, a
              resident requests and tracks their own laundry order (see
              Laundry.tsx). */}
          <Route path="/laundry" element={<Laundry />} />
          {/* D17.24 (TODO.md Batch 30, item 125) — not staff-only, a
              resident requests a booking or proposes a programme (see
              ResidenceLife.tsx). */}
          <Route path="/residence-life" element={<ResidenceLife />} />
          {/* D17.06 (TODO.md Batch 28) — not staff-only, a host requests/
              tracks their own visitor; deciding/entry/exit/handover is
              staff-gated server-side (see Visitors.tsx). */}
          <Route path="/visitors" element={<Visitors />} />
          <Route path="/mess" element={<Mess />} />
          <Route
            path="/kitchen"
            element={
              <StaffOnly>
                <Kitchen />
              </StaffOnly>
            }
          />
          <Route path="/maintenance" element={<Maintenance />} />
          <Route
            path="/reports"
            element={
              <StaffOnly>
                <Reports />
              </StaffOnly>
            }
          />
          <Route
            path="/settings"
            element={
              <AdminOnly>
                <Settings />
              </AdminOnly>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppShell>
    </TenantSettingsProvider>
  );
}

function Root() {
  const { user } = useAuth();

  // Checked before the sign-in branch below, not inside AuthenticatedApp's
  // Routes. The platform lands here with no token stored yet, so anything that
  // renders only once a user exists would show the login screen instead of
  // consuming the handoff.
  if (window.location.pathname === '/sso-callback') return <SsoCallback />;

  return user ? <AuthenticatedApp /> : <Login />;
}

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Root />
      </AuthProvider>
    </BrowserRouter>
  );
}
