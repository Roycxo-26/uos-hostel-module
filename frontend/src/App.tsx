import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './layouts/AppShell';
import { AuthProvider, useAuth } from './context/AuthContext';
import { TenantSettingsProvider } from './context/TenantSettingsContext';
import { Allocations } from './pages/Allocations';
import { Applications } from './pages/Applications';
import { Cases } from './pages/Cases';
import { Checkout } from './pages/Checkout';
import { Closures } from './pages/Closures';
import { Dashboard } from './pages/Dashboard';
import { HostelStructure } from './pages/HostelStructure';
import { Kitchen } from './pages/Kitchen';
import { Login } from './pages/Login';
import { Maintenance } from './pages/Maintenance';
import { Mess } from './pages/Mess';
import { Movement } from './pages/Movement';
import { CommonAreas } from './pages/CommonAreas';
import { DutyRoster } from './pages/DutyRoster';
import { Grievances } from './pages/Grievances';
import { OccupancyVerification } from './pages/OccupancyVerification';
import { Reports } from './pages/Reports';
import { RoomAccess } from './pages/RoomAccess';
import { Safety } from './pages/Safety';
import { Settings } from './pages/Settings';
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
