import { useEffect, useState } from 'react';
import * as messKitchenApi from '../api/messKitchen';
import { useAuth } from '../context/AuthContext';
import { useTenantSettings } from '../context/TenantSettingsContext';
import { Alert, Card, PageHeader, PageSpinner } from '../design-system';
import { hasHostelRole, isPlatformAdmin, type MessKitchenConnectionStatus, type MessKitchenOutboxEvent } from '../types';

/** D17.16 (TODO.md Batch 30, item 123) — "HOSTEL - v.1.md" §24.1: D18
 * (Mess) owns the menu, meal plan, attendance, diet controls and food
 * feedback outright. This page does not fabricate any of that — it shows
 * the honest connection status §24.2/§24.7 specify, and for staff, the
 * outbound event log D17 actually does own (§24.4). No D18 exists in this
 * standalone build, so the status is always disconnected — that's the
 * correct, specified behaviour, not a bug. */

const EVENT_LABELS: Record<string, string> = {
  'd17.occupancy-started.v1': 'Occupancy started',
  'd17.occupancy-ended.v1': 'Occupancy ended',
  'd17.outpass-departed.v1': 'Outpass departed',
  'd17.outpass-returned.v1': 'Outpass returned',
  'd17.leave-approved.v1': 'Leave approved',
  'd17.leave-cancelled.v1': 'Leave cancelled',
  'd17.visitor-meal-approved.v1': 'Visitor meal approved',
  'd17.temporary-absence-updated.v1': 'Temporary absence updated',
};

export function Mess() {
  const { me } = useAuth();
  const isStaff = isPlatformAdmin(me) || hasHostelRole(me, 'warden');
  const { settings } = useTenantSettings();
  const [status, setStatus] = useState<MessKitchenConnectionStatus | null>(null);
  const [events, setEvents] = useState<MessKitchenOutboxEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void messKitchenApi.getConnectionStatus().then((s) => {
      setStatus(s);
      setLoading(false);
    });
    if (isStaff) void messKitchenApi.listEvents().then(setEvents);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading || !status) return <PageSpinner />;

  return (
    <div>
      <PageHeader title="Mess" description="Meal plan, menu, attendance and special diet are owned by the Mess/Kitchen system (D18), not Hostel." />

      <Alert tone="warning">
        <strong>{status.menuStatus.replace(/_/g, ' ')}</strong> — {status.note}
      </Alert>

      {settings?.featureFlags.enableMealAttendance && (
        <Card className="mt-4">
          <div className="p-4 sm:p-5">
            <p className="text-sm font-medium text-slate-900">Meal attendance</p>
            <p className="mt-1 text-sm text-slate-500">Not available — no Mess system is connected to record or show meal attendance/tokens.</p>
          </div>
        </Card>
      )}

      {settings?.featureFlags.enableSpecialDiet && (
        <Card className="mt-4">
          <div className="p-4 sm:p-5">
            <p className="text-sm font-medium text-slate-900">Special diet requests</p>
            <p className="mt-1 text-sm text-slate-500">Not available — special diet/allergen controls are owned by the Mess system, which isn't connected.</p>
          </div>
        </Card>
      )}

      {isStaff && (
        <Card className="mt-4">
          <div className="p-4 sm:p-5">
            <p className="mb-2 text-sm font-medium text-slate-900">Outbound events Hostel has published ({events.length})</p>
            <p className="mb-3 text-xs text-slate-500">
              What Hostel actually owns and supplies toward a meal count — occupancy, outpass and leave changes. Every event stays queued; there's no Mess system to deliver to yet.
            </p>
            {events.length === 0 ? (
              <p className="text-sm text-slate-500">None published yet.</p>
            ) : (
              <ul className="max-h-96 space-y-1.5 overflow-y-auto text-sm">
                {events.slice(0, 50).map((e) => (
                  <li key={e.id} className="flex items-center justify-between text-xs text-slate-600">
                    <span>{EVENT_LABELS[e.eventType] ?? e.eventType}</span>
                    <span className="text-slate-400">{new Date(e.occurredAt).toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
