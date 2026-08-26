import { useState } from 'react';
import type { ReactNode } from 'react';
import { updateTenantSettings } from '../api/tenantSettings';
import { useTenantSettings } from '../context/TenantSettingsContext';
import { Alert, Button, Card, CardBody, CardHeader, FieldWrapper, Input, PageHeader, PageSpinner } from '../design-system';
import { errorMessage } from '../lib/errorMessage';
import type { Branding, FeatureFlags, PolicyDefaults, Terminology } from '../types';

/**
 * This page is the actual point of "white-label" for the product — every
 * value here changes what other roles see across the whole app (labels via
 * useLabel(), accent colour via applyBranding(), features via
 * featureFlags). Admin/Super Admin only, per flow.md §5.2 "Configure hostel
 * structure"-adjacent settings capability.
 */
export function Settings() {
  const { settings, loading, refresh } = useTenantSettings();

  if (loading || !settings) return <PageSpinner />;

  return (
    <div>
      <PageHeader title="Settings" description="Branding, terminology, features and policy defaults for your institution." />
      <div className="space-y-5">
        <BrandingSection initial={settings.branding} onSaved={refresh} />
        <TerminologySection initial={settings.terminology} onSaved={refresh} />
        <FeatureFlagsSection initial={settings.featureFlags} onSaved={refresh} />
        <PolicySection initial={settings.policyDefaults} onSaved={refresh} />
      </div>
    </div>
  );
}

function SectionCard({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <p className="text-sm font-semibold text-slate-900">{title}</p>
        <p className="text-xs text-slate-500">{description}</p>
      </CardHeader>
      <CardBody>{children}</CardBody>
    </Card>
  );
}

function useSectionSave<T extends object>(key: 'branding' | 'terminology' | 'featureFlags' | 'policyDefaults', onSaved: () => void) {
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save(value: T) {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await updateTenantSettings({ [key]: value });
      onSaved();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return { save, error, saving, saved };
}

function BrandingSection({ initial, onSaved }: { initial: Branding; onSaved: () => void }) {
  const [value, setValue] = useState(initial);
  const { save, error, saving, saved } = useSectionSave<Branding>('branding', onSaved);

  return (
    <SectionCard title="Branding" description="Shown in the sidebar/top bar and applied as the app's accent colour.">
      <div className="grid gap-4 sm:grid-cols-2">
        <FieldWrapper label="Institution name" htmlFor="b-name">
          <Input id="b-name" value={value.institutionName} onChange={(e) => setValue({ ...value, institutionName: e.target.value })} />
        </FieldWrapper>
        <FieldWrapper label="Accent colour" htmlFor="b-color" hint="Hex, e.g. #3730A3">
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={value.primaryColor}
              onChange={(e) => setValue({ ...value, primaryColor: e.target.value })}
              className="h-11 w-11 shrink-0 cursor-pointer rounded-lg border border-slate-300"
              aria-label="Accent colour picker"
            />
            <Input id="b-color" value={value.primaryColor} onChange={(e) => setValue({ ...value, primaryColor: e.target.value })} />
          </div>
        </FieldWrapper>
      </div>
      {error && <Alert>{error}</Alert>}
      <div className="mt-4 flex items-center gap-3">
        <Button size="sm" onClick={() => void save(value)} disabled={saving}>
          {saving ? 'Saving…' : 'Save branding'}
        </Button>
        {saved && <span className="text-sm text-emerald-600">Saved</span>}
      </div>
    </SectionCard>
  );
}

const TERMINOLOGY_FIELDS: Array<{ key: keyof Terminology; label: string }> = [
  { key: 'hostelLabel', label: 'Hostel' },
  { key: 'blockLabel', label: 'Block' },
  { key: 'floorLabel', label: 'Floor' },
  { key: 'roomLabel', label: 'Room' },
  { key: 'bedLabel', label: 'Bed' },
  { key: 'wardenLabel', label: 'Warden' },
  { key: 'headWardenLabel', label: 'Head Warden' },
  { key: 'floorInchargeLabel', label: 'Floor Incharge' },
  // Real gap, found live via SELF-TEST-GUIDE.md C13 — this field's own
  // visible label said "Room CR", but the key it controls (roomCrLabel)
  // actually drives the "Room Head" button text on the Structure page
  // (HostelStructure.tsx) and every "Room Head" reference elsewhere in
  // the app, including this whole self-test guide's own terminology. The
  // field and what it controls disagreed on the term's own name — fixed
  // by relabeling the field to match what it actually does, not by
  // renaming the underlying key (which would just move the mismatch).
  { key: 'roomCrLabel', label: 'Room Head' },
];

function TerminologySection({ initial, onSaved }: { initial: Terminology; onSaved: () => void }) {
  const [value, setValue] = useState(initial);
  const { save, error, saving, saved } = useSectionSave<Terminology>('terminology', onSaved);

  return (
    <SectionCard title="Terminology" description="Rename these to match your institution's own vocabulary — e.g. 'Hostel' → 'Residence Hall'.">
      <div className="grid gap-4 sm:grid-cols-3">
        {TERMINOLOGY_FIELDS.map((f) => (
          <FieldWrapper key={f.key} label={f.label} htmlFor={`t-${f.key}`}>
            <Input id={`t-${f.key}`} value={value[f.key]} onChange={(e) => setValue({ ...value, [f.key]: e.target.value })} />
          </FieldWrapper>
        ))}
      </div>
      {error && <Alert>{error}</Alert>}
      <div className="mt-4 flex items-center gap-3">
        <Button size="sm" onClick={() => void save(value)} disabled={saving}>
          {saving ? 'Saving…' : 'Save terminology'}
        </Button>
        {saved && <span className="text-sm text-emerald-600">Saved</span>}
      </div>
    </SectionCard>
  );
}

const FEATURE_FLAG_FIELDS: Array<{ key: keyof FeatureFlags; label: string }> = [
  { key: 'showBlockLevel', label: 'Show block level in structure' },
  { key: 'showFloorLevel', label: 'Show floor level in structure' },
  { key: 'enableVisitorSlots', label: 'Enable visitor slot booking' },
  { key: 'enableSports', label: 'Enable sports booking' },
  { key: 'enableMealAttendance', label: 'Enable meal attendance' },
  { key: 'enableSpecialDiet', label: 'Enable special diet requests' },
  { key: 'enableParentAccess', label: 'Enable parent/guardian access' },
];

function FeatureFlagsSection({ initial, onSaved }: { initial: FeatureFlags; onSaved: () => void }) {
  const [value, setValue] = useState(initial);
  const { save, error, saving, saved } = useSectionSave<FeatureFlags>('featureFlags', onSaved);

  return (
    <SectionCard title="Feature flags" description="Turn optional workflows on or off without a code change.">
      <div className="grid gap-3 sm:grid-cols-2">
        {FEATURE_FLAG_FIELDS.map((f) => (
          <label key={f.key} className="flex min-h-touch cursor-pointer items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={value[f.key]}
              onChange={(e) => setValue({ ...value, [f.key]: e.target.checked })}
              className="h-4 w-4 rounded border-slate-300 text-accent"
            />
            {f.label}
          </label>
        ))}
      </div>
      {error && <Alert>{error}</Alert>}
      <div className="mt-4 flex items-center gap-3">
        <Button size="sm" onClick={() => void save(value)} disabled={saving}>
          {saving ? 'Saving…' : 'Save feature flags'}
        </Button>
        {saved && <span className="text-sm text-emerald-600">Saved</span>}
      </div>
    </SectionCard>
  );
}

function PolicySection({ initial, onSaved }: { initial: PolicyDefaults; onSaved: () => void }) {
  const [value, setValue] = useState(initial);
  const { save, error, saving, saved } = useSectionSave<PolicyDefaults>('policyDefaults', onSaved);

  return (
    <SectionCard
      title="Policy defaults"
      description="Tenant-configurable values for flow.md §16's Open Decisions — the workflow rule is fixed in code, only these numbers vary."
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <FieldWrapper label="Attendance window start" htmlFor="p-window">
          <Input id="p-window" type="time" value={value.attendanceWindowStart} onChange={(e) => setValue({ ...value, attendanceWindowStart: e.target.value })} />
        </FieldWrapper>
        <FieldWrapper label="Attendance cutoff" htmlFor="p-cutoff">
          <Input id="p-cutoff" type="time" value={value.attendanceCutoff} onChange={(e) => setValue({ ...value, attendanceCutoff: e.target.value })} />
        </FieldWrapper>
        <FieldWrapper label="Check-in deadline (hours)" htmlFor="p-deadline">
          <Input
            id="p-deadline"
            type="number"
            min={1}
            value={value.checkInDeadlineHours}
            onChange={(e) => setValue({ ...value, checkInDeadlineHours: Number(e.target.value) })}
          />
        </FieldWrapper>
        <FieldWrapper label="Visitor slot duration (min)" htmlFor="p-visitdur">
          <Input
            id="p-visitdur"
            type="number"
            min={1}
            value={value.visitorSlotDurationMinutes}
            onChange={(e) => setValue({ ...value, visitorSlotDurationMinutes: Number(e.target.value) })}
          />
        </FieldWrapper>
        <FieldWrapper label="Visitor slot capacity" htmlFor="p-visitcap">
          <Input
            id="p-visitcap"
            type="number"
            min={1}
            value={value.visitorSlotCapacityPerSlot}
            onChange={(e) => setValue({ ...value, visitorSlotCapacityPerSlot: Number(e.target.value) })}
          />
        </FieldWrapper>
        <FieldWrapper label="Gate pass max duration (hours)" htmlFor="p-gatepass">
          <Input
            id="p-gatepass"
            type="number"
            min={1}
            value={value.gatePassMaxDurationHours}
            onChange={(e) => setValue({ ...value, gatePassMaxDurationHours: Number(e.target.value) })}
          />
        </FieldWrapper>
        {/* Real gap, found live via SELF-TEST-GUIDE.md C13 — this policy
            default was added to the backend (settings/types.ts) as part of
            C7's return-reminder fix, fully wired into the sweep job, but
            never given a field here. It was silently stuck at the
            hardcoded default with no way for a tenant to actually change
            it — exactly the "workflow rule fixed in code, only the number
            varies" pattern this whole section exists for. */}
        <FieldWrapper label="Movement return reminder (minutes)" htmlFor="p-returnreminder" hint="How long before the return deadline to nudge staff/resident">
          <Input
            id="p-returnreminder"
            type="number"
            min={1}
            value={value.movementReturnReminderMinutes}
            onChange={(e) => setValue({ ...value, movementReturnReminderMinutes: Number(e.target.value) })}
          />
        </FieldWrapper>
      </div>
      {error && <Alert>{error}</Alert>}
      <div className="mt-4 flex items-center gap-3">
        <Button size="sm" onClick={() => void save(value)} disabled={saving}>
          {saving ? 'Saving…' : 'Save policy defaults'}
        </Button>
        {saved && <span className="text-sm text-emerald-600">Saved</span>}
      </div>
    </SectionCard>
  );
}
