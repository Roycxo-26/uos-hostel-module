import { useEffect, useState } from 'react';
import * as api from '../api/structure';
import * as responsibilityApi from '../api/responsibilities';
import type { ResidentCandidate, ResponsibilityAssignment } from '../api/responsibilities';
import { useAuth } from '../context/AuthContext';
import { useLabel, useTenantSettings } from '../context/TenantSettingsContext';
import {
  Alert,
  Button,
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
import { BuildingIcon, PlusIcon } from '../design-system/icons';
import { errorMessage } from '../lib/errorMessage';
import {
  hasHostelRole,
  isPlatformAdmin,
  type AuthUser,
  type Bed,
  type Block,
  type Floor,
  type Hostel,
  type HostelTree,
  type RoomWithBeds,
  type Terminology,
} from '../types';

type SheetState =
  | { kind: 'hostel' }
  // flow.md §19 item 18 gap-closure — edit actions, not just create. Kept as
  // distinct SheetState variants (not a mode flag on 'hostel') so each sheet
  // component stays a single-purpose form, same reasoning create/assign
  // already follow here.
  | { kind: 'edit-hostel'; hostel: HostelTree }
  | { kind: 'block'; hostelId: string }
  | { kind: 'edit-block'; block: Block }
  | { kind: 'floor'; blockId: string }
  | { kind: 'edit-floor'; floor: Floor }
  | { kind: 'room'; floorId: string }
  | { kind: 'edit-room'; room: RoomWithBeds }
  | { kind: 'room-status'; room: RoomWithBeds; roomLabel: string }
  | { kind: 'bed'; roomId: string }
  | { kind: 'bed-status'; bed: Bed; bedLabel: string }
  // UOS HOSTEL BR.md §2 / HST-WF-22 — Room Head / Floor In-charge, a
  // scoped responsibility grant, not a structure-editing action, but
  // reuses the same SheetState/sheet-picker pattern rather than a second
  // mechanism.
  | { kind: 'assign-responsibility'; scopeType: 'room' | 'floor'; scopeId: string; label: string }
  | null;

export function HostelStructure() {
  const { user, me } = useAuth();
  const { settings } = useTenantSettings();
  const t = settings?.terminology;
  // flow.md §5.2: "Configure hostel structure" is Super Admin/Admin/Head
  // Warden — Warden itself is "View/limited", not full config access.
  const canConfigure = isPlatformAdmin(me) || hasHostelRole(me, 'head_warden');
  // BR §2 / HST-WF-22: assigning Room Head/Floor In-charge is a Warden-level
  // action (backend seed grants 'responsibility:assign' to both warden and
  // head_warden) — deliberately broader than canConfigure above.
  const canAssignResponsibility = isPlatformAdmin(me) || hasHostelRole(me, 'warden');

  const [hostels, setHostels] = useState<Hostel[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tree, setTree] = useState<HostelTree | null>(null);
  const [loading, setLoading] = useState(true);
  const [sheet, setSheet] = useState<SheetState>(null);

  async function loadHostels(preferId?: string) {
    const list = await api.listHostels();
    setHostels(list);
    const nextId = preferId ?? list[0]?.id ?? null;
    setSelectedId(nextId);
    setLoading(false);
  }

  useEffect(() => {
    void loadHostels();
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setTree(null);
      return;
    }
    void api.getHostelTree(selectedId).then(setTree);
  }, [selectedId]);

  async function refreshTree() {
    if (selectedId) setTree(await api.getHostelTree(selectedId));
  }

  if (loading) return <PageSpinner />;

  return (
    <div>
      <PageHeader
        title={t?.hostelLabel ? `${t.hostelLabel} Structure` : 'Hostel Structure'}
        description={`Configure ${(t?.hostelLabel ?? 'hostel').toLowerCase()}, ${(t?.blockLabel ?? 'block').toLowerCase()}, ${(t?.floorLabel ?? 'floor').toLowerCase()}, ${(t?.roomLabel ?? 'room').toLowerCase()} and ${(t?.bedLabel ?? 'bed').toLowerCase()} hierarchy.`}
        action={
          canConfigure && (
            <Button onClick={() => setSheet({ kind: 'hostel' })}>
              <PlusIcon /> New {t?.hostelLabel ?? 'Hostel'}
            </Button>
          )
        }
      />

      {hostels.length === 0 ? (
        <EmptyState
          icon={<BuildingIcon className="h-8 w-8" />}
          title={`No ${(t?.hostelLabel ?? 'hostels').toLowerCase()}s configured yet`}
          description="Create the first one to start building out blocks, floors, rooms and beds."
          action={
            canConfigure && (
              <Button onClick={() => setSheet({ kind: 'hostel' })}>New {t?.hostelLabel ?? 'Hostel'}</Button>
            )
          }
        />
      ) : (
        <div className="space-y-5">
          <div className="max-w-xs">
            <FieldWrapper label={t?.hostelLabel ?? 'Hostel'} htmlFor="hostel-select">
              <Select id="hostel-select" value={selectedId ?? ''} onChange={(e) => setSelectedId(e.target.value)}>
                {hostels.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name} ({h.code})
                  </option>
                ))}
              </Select>
            </FieldWrapper>
          </div>

          {tree && (
            <HostelTreeView
              tree={tree}
              terminology={t}
              canConfigure={Boolean(canConfigure)}
              canAssignResponsibility={Boolean(canAssignResponsibility)}
              onEditHostel={() => setSheet({ kind: 'edit-hostel', hostel: tree })}
              onAddBlock={() => setSheet({ kind: 'block', hostelId: tree.id })}
              onEditBlock={(block) => setSheet({ kind: 'edit-block', block })}
              onAddFloor={(blockId) => setSheet({ kind: 'floor', blockId })}
              onEditFloor={(floor) => setSheet({ kind: 'edit-floor', floor })}
              onAddRoom={(floorId) => setSheet({ kind: 'room', floorId })}
              onEditRoom={(room) => setSheet({ kind: 'edit-room', room })}
              onRoomStatus={(room, roomLabel) => setSheet({ kind: 'room-status', room, roomLabel })}
              onAddBed={(roomId) => setSheet({ kind: 'bed', roomId })}
              onBedStatus={(bed, bedLabel) => setSheet({ kind: 'bed-status', bed, bedLabel })}
              onAssignResponsibility={(scopeType, scopeId, label) => setSheet({ kind: 'assign-responsibility', scopeType, scopeId, label })}
            />
          )}
        </div>
      )}

      <CreateHostelSheet
        open={sheet?.kind === 'hostel'}
        user={user}
        onClose={() => setSheet(null)}
        onCreated={(hostel) => loadHostels(hostel.id)}
      />
      {sheet?.kind === 'edit-hostel' && (
        <EditHostelSheet hostel={sheet.hostel} onClose={() => setSheet(null)} onSaved={refreshTree} />
      )}
      {sheet?.kind === 'block' && (
        <CreateChildSheet
          title={`New ${t?.blockLabel ?? 'Block'}`}
          fields={['code', 'name']}
          onSubmit={(v) => api.createBlock(sheet.hostelId, { code: v.code ?? '', name: v.name ?? '' })}
          onClose={() => setSheet(null)}
          onCreated={refreshTree}
        />
      )}
      {sheet?.kind === 'edit-block' && (
        <EditChildSheet
          title={`Edit ${t?.blockLabel ?? 'Block'}`}
          fields={['code', 'name']}
          initialValues={{ code: sheet.block.code, name: sheet.block.name }}
          onSubmit={(v) => api.updateBlock(sheet.block.id, { code: v.code, name: v.name })}
          onClose={() => setSheet(null)}
          onSaved={refreshTree}
        />
      )}
      {sheet?.kind === 'floor' && (
        <CreateChildSheet
          title={`New ${t?.floorLabel ?? 'Floor'}`}
          fields={['number', 'name']}
          onSubmit={(v) => api.createFloor(sheet.blockId, { number: v.number ?? '', name: v.name })}
          onClose={() => setSheet(null)}
          onCreated={refreshTree}
        />
      )}
      {sheet?.kind === 'edit-floor' && (
        <EditChildSheet
          title={`Edit ${t?.floorLabel ?? 'Floor'}`}
          fields={['number', 'name']}
          initialValues={{ number: sheet.floor.number, name: sheet.floor.name ?? '' }}
          onSubmit={(v) => api.updateFloor(sheet.floor.id, { number: v.number, name: v.name })}
          onClose={() => setSheet(null)}
          onSaved={refreshTree}
        />
      )}
      {sheet?.kind === 'room' && (
        <CreateChildSheet
          title={`New ${t?.roomLabel ?? 'Room'}`}
          fields={['code', 'capacity', 'permittedPopulation', 'occupancyCompatibilityRule', 'safetyRestriction']}
          onSubmit={(v) =>
            api.createRoom(sheet.floorId, {
              code: v.code ?? '',
              roomType: 'standard',
              capacity: Number(v.capacity ?? 2),
              accessibility: false,
              permittedPopulation: v.permittedPopulation || undefined,
              occupancyCompatibilityRule: v.occupancyCompatibilityRule || undefined,
              safetyRestriction: v.safetyRestriction || undefined,
            })
          }
          onClose={() => setSheet(null)}
          onCreated={refreshTree}
        />
      )}
      {sheet?.kind === 'edit-room' && (
        <EditChildSheet
          title={`Edit ${t?.roomLabel ?? 'Room'}`}
          fields={['code', 'capacity', 'permittedPopulation', 'occupancyCompatibilityRule', 'safetyRestriction']}
          initialValues={{
            code: sheet.room.code,
            capacity: String(sheet.room.capacity),
            permittedPopulation: sheet.room.permittedPopulation ?? '',
            occupancyCompatibilityRule: sheet.room.occupancyCompatibilityRule ?? '',
            safetyRestriction: sheet.room.safetyRestriction ?? '',
          }}
          onSubmit={(v) =>
            api.updateRoom(sheet.room.id, {
              code: v.code,
              capacity: Number(v.capacity),
              permittedPopulation: v.permittedPopulation,
              occupancyCompatibilityRule: v.occupancyCompatibilityRule,
              safetyRestriction: v.safetyRestriction,
            })
          }
          onClose={() => setSheet(null)}
          onSaved={refreshTree}
        />
      )}
      {sheet?.kind === 'room-status' && (
        <RoomStatusSheet room={sheet.room} label={sheet.roomLabel} onClose={() => setSheet(null)} onSaved={refreshTree} />
      )}
      {sheet?.kind === 'bed' && (
        <CreateChildSheet
          title={`New ${t?.bedLabel ?? 'Bed'}`}
          fields={['code']}
          onSubmit={(v) => api.createBed(sheet.roomId, { code: v.code ?? '' })}
          onClose={() => setSheet(null)}
          onCreated={refreshTree}
        />
      )}
      {sheet?.kind === 'bed-status' && (
        <BedStatusSheet bed={sheet.bed} label={sheet.bedLabel} onClose={() => setSheet(null)} onSaved={refreshTree} />
      )}
      {sheet?.kind === 'assign-responsibility' && (
        <AssignResponsibilitySheet
          scopeType={sheet.scopeType}
          scopeId={sheet.scopeId}
          label={sheet.label}
          onClose={() => setSheet(null)}
        />
      )}
    </div>
  );
}

function HostelTreeView({
  tree,
  terminology: t,
  canConfigure,
  canAssignResponsibility,
  onEditHostel,
  onAddBlock,
  onEditBlock,
  onAddFloor,
  onEditFloor,
  onAddRoom,
  onEditRoom,
  onRoomStatus,
  onAddBed,
  onBedStatus,
  onAssignResponsibility,
}: {
  tree: HostelTree;
  terminology: Terminology | undefined;
  canConfigure: boolean;
  canAssignResponsibility: boolean;
  onEditHostel: () => void;
  onAddBlock: () => void;
  onEditBlock: (block: Block) => void;
  onAddFloor: (blockId: string) => void;
  onEditFloor: (floor: Floor) => void;
  onAddRoom: (floorId: string) => void;
  onEditRoom: (room: RoomWithBeds) => void;
  onRoomStatus: (room: RoomWithBeds, roomLabel: string) => void;
  onAddBed: (roomId: string) => void;
  onBedStatus: (bed: Bed, bedLabel: string) => void;
  onAssignResponsibility: (scopeType: 'room' | 'floor', scopeId: string, label: string) => void;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">
            {tree.name} {tree.status !== 'active' && <StatusPill status={tree.status} />}
          </p>
          <p className="text-xs text-slate-500">
            {tree.genderPolicy} · rated capacity {tree.capacity}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canConfigure && (
            <Button size="sm" variant="secondary" onClick={onEditHostel}>
              Edit
            </Button>
          )}
          {canConfigure && (
            <Button size="sm" variant="secondary" onClick={onAddBlock}>
              <PlusIcon /> {t?.blockLabel ?? 'Block'}
            </Button>
          )}
        </div>
      </div>

      {tree.blocks.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-slate-400">
          No {(t?.blockLabel ?? 'blocks').toLowerCase()}s yet.
        </p>
      ) : (
        <div className="divide-y divide-slate-100">
          {tree.blocks.map((block) => (
            <details key={block.id} className="group px-4 py-3" open>
              <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-medium text-slate-800">
                <span>
                  {t?.blockLabel ?? 'Block'} {block.name} ({block.code})
                </span>
                <span className="flex items-center gap-1">
                  {canConfigure && (
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.preventDefault();
                        onEditBlock(block);
                      }}
                      className="rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100"
                    >
                      Edit
                    </span>
                  )}
                  {canConfigure && (
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.preventDefault();
                        onAddFloor(block.id);
                      }}
                      className="rounded-md px-2 py-1 text-xs font-medium text-accent hover:bg-accent-subtle"
                    >
                      + {t?.floorLabel ?? 'Floor'}
                    </span>
                  )}
                </span>
              </summary>

              <div className="mt-2 space-y-2 pl-3">
                {block.floors.length === 0 && (
                  <p className="text-xs text-slate-400">No {(t?.floorLabel ?? 'floors').toLowerCase()}s yet.</p>
                )}
                {block.floors.map((floor) => (
                  <details key={floor.id} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                    <summary className="flex cursor-pointer list-none items-center justify-between text-sm text-slate-700">
                      <span>
                        {t?.floorLabel ?? 'Floor'} {floor.number} {floor.name ? `— ${floor.name}` : ''}
                      </span>
                      <span className="flex items-center gap-1">
                        {canAssignResponsibility && (
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={(e) => {
                              e.preventDefault();
                              onAssignResponsibility('floor', floor.id, `${t?.floorLabel ?? 'Floor'} ${floor.number}`);
                            }}
                            className="rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100"
                          >
                            {t?.floorInchargeLabel ?? 'Floor In-charge'}
                          </span>
                        )}
                        {canConfigure && (
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={(e) => {
                              e.preventDefault();
                              onEditFloor(floor);
                            }}
                            className="rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100"
                          >
                            Edit
                          </span>
                        )}
                        {canConfigure && (
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={(e) => {
                              e.preventDefault();
                              onAddRoom(floor.id);
                            }}
                            className="rounded-md px-2 py-1 text-xs font-medium text-accent hover:bg-accent-subtle"
                          >
                            + {t?.roomLabel ?? 'Room'}
                          </span>
                        )}
                      </span>
                    </summary>

                    <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {floor.rooms.length === 0 && (
                        <p className="text-xs text-slate-400">No {(t?.roomLabel ?? 'rooms').toLowerCase()}s yet.</p>
                      )}
                      {floor.rooms.map((room) => (
                        <div key={room.id} className="rounded-lg border border-slate-200 bg-white p-2.5">
                          <div className="mb-1.5 flex items-center justify-between gap-1">
                            <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                              {t?.roomLabel ?? 'Room'} {room.code}
                              {canConfigure ? (
                                <span
                                  role="button"
                                  tabIndex={0}
                                  onClick={() => onRoomStatus(room, `${t?.roomLabel ?? 'Room'} ${room.code}`)}
                                  className="cursor-pointer"
                                  title="Change room status"
                                >
                                  <StatusPill status={room.status} />
                                </span>
                              ) : (
                                <StatusPill status={room.status} />
                              )}
                            </p>
                            <span className="flex items-center gap-1">
                              {canAssignResponsibility && (
                                <span
                                  role="button"
                                  tabIndex={0}
                                  onClick={() => onAssignResponsibility('room', room.id, `${t?.roomLabel ?? 'Room'} ${room.code}`)}
                                  className="rounded px-1.5 py-0.5 text-[11px] font-medium text-slate-500 hover:bg-slate-100"
                                >
                                  {t?.roomCrLabel ?? 'Room Head'}
                                </span>
                              )}
                              {canConfigure && (
                                <span
                                  role="button"
                                  tabIndex={0}
                                  onClick={() => onEditRoom(room)}
                                  className="rounded px-1.5 py-0.5 text-[11px] font-medium text-slate-500 hover:bg-slate-100"
                                >
                                  Edit
                                </span>
                              )}
                              {canConfigure && (
                                <span
                                  role="button"
                                  tabIndex={0}
                                  onClick={() => onAddBed(room.id)}
                                  className="rounded px-1.5 py-0.5 text-[11px] font-medium text-accent hover:bg-accent-subtle"
                                >
                                  + {t?.bedLabel ?? 'Bed'}
                                </span>
                              )}
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {room.beds.length === 0 && <span className="text-[11px] text-slate-400">No beds yet</span>}
                            {room.beds.map((bed) => (
                              <span
                                key={bed.id}
                                role={canConfigure ? 'button' : undefined}
                                tabIndex={canConfigure ? 0 : undefined}
                                onClick={canConfigure ? () => onBedStatus(bed, `${t?.bedLabel ?? 'Bed'} ${bed.code}`) : undefined}
                                title={canConfigure ? 'Change bed status' : undefined}
                                className={`inline-flex items-center gap-1 rounded-md border border-slate-200 px-1.5 py-1 text-[11px] ${canConfigure ? 'cursor-pointer hover:border-slate-300 hover:bg-slate-50' : ''}`}
                              >
                                {bed.code}
                                <StatusPill status={bed.status} />
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </details>
                ))}
              </div>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}

function CreateHostelSheet({
  open,
  user,
  onClose,
  onCreated,
}: {
  open: boolean;
  user: AuthUser | null;
  onClose: () => void;
  onCreated: (hostel: Hostel) => void;
}) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [genderPolicy, setGenderPolicy] = useState('co-ed');
  const [capacity, setCapacity] = useState('40');
  const [campusId, setCampusId] = useState('');
  // UOS HOSTEL BR.md §3 — effective-dated configuration + category/
  // accessibility policy, all optional. categoryPolicy is comma-separated
  // free text here, not a fixed dropdown — see backend validators.ts's own
  // comment on why this stays tenant-open, not a closed enum.
  const [effectiveFrom, setEffectiveFrom] = useState('');
  const [effectiveTo, setEffectiveTo] = useState('');
  const [categoryPolicy, setCategoryPolicy] = useState('');
  const [accessibilityPolicy, setAccessibilityPolicy] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // flow.md §14 "resolveCampusId": an org_admin/super_admin session has no
  // campus pinned to it (campus_scope=ALL), so which campus a new hostel
  // belongs to has to be picked explicitly. Every other role's session is
  // already bound to one campus — nothing to ask.
  const needsCampusPicker = user?.campusScope === 'ALL';

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const hostel = await api.createHostel({
        code,
        name,
        genderPolicy,
        capacity: Number(capacity),
        ...(needsCampusPicker ? { campusId } : {}),
        ...(effectiveFrom ? { effectiveFrom } : {}),
        ...(effectiveTo ? { effectiveTo } : {}),
        ...(categoryPolicy
          ? { categoryPolicy: categoryPolicy.split(',').map((c) => c.trim()).filter(Boolean) }
          : {}),
        ...(accessibilityPolicy ? { accessibilityPolicy } : {}),
      });
      onCreated(hostel);
      onClose();
      setCode('');
      setName('');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="New Hostel"
      footer={
        <Button fullWidth onClick={() => void handleSubmit()} disabled={submitting || !code || !name || (needsCampusPicker && !campusId)}>
          {submitting ? 'Creating…' : 'Create'}
        </Button>
      }
    >
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        {needsCampusPicker && (
          <FieldWrapper label="Campus ID" htmlFor="h-campus" required hint="No campus picker yet — paste the campus UUID">
            <Input id="h-campus" value={campusId} onChange={(e) => setCampusId(e.target.value)} placeholder="00000000-0000-0000-0000-0000000000c1" />
          </FieldWrapper>
        )}
        <FieldWrapper label="Code" htmlFor="h-code" required hint="Short unique identifier, e.g. HA">
          <Input id="h-code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={20} />
        </FieldWrapper>
        <FieldWrapper label="Name" htmlFor="h-name" required>
          <Input id="h-name" value={name} onChange={(e) => setName(e.target.value)} />
        </FieldWrapper>
        <FieldWrapper label="Gender policy" htmlFor="h-gender" required>
          <Select id="h-gender" value={genderPolicy} onChange={(e) => setGenderPolicy(e.target.value)}>
            <option value="co-ed">Co-ed</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
          </Select>
        </FieldWrapper>
        <FieldWrapper label="Rated capacity" htmlFor="h-capacity">
          <Input id="h-capacity" type="number" min={0} value={capacity} onChange={(e) => setCapacity(e.target.value)} />
        </FieldWrapper>
        <div className="grid grid-cols-2 gap-3">
          <FieldWrapper label="Effective from" htmlFor="h-eff-from" hint="Optional">
            <Input id="h-eff-from" type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
          </FieldWrapper>
          <FieldWrapper label="Effective to" htmlFor="h-eff-to" hint="Optional">
            <Input id="h-eff-to" type="date" value={effectiveTo} onChange={(e) => setEffectiveTo(e.target.value)} />
          </FieldWrapper>
        </div>
        <FieldWrapper label="Category policy" htmlFor="h-category" hint="Comma-separated, e.g. general, reserved, international — tenant-defined, not fixed">
          <Input id="h-category" value={categoryPolicy} onChange={(e) => setCategoryPolicy(e.target.value)} />
        </FieldWrapper>
        <FieldWrapper label="Accessibility policy" htmlFor="h-accessibility" hint="Free-text statement, e.g. wheelchair-accessible entrance and lift available">
          <Textarea id="h-accessibility" value={accessibilityPolicy} onChange={(e) => setAccessibilityPolicy(e.target.value)} />
        </FieldWrapper>
      </div>
    </Sheet>
  );
}

/**
 * flow.md §19 item 18 gap-closure — edit, not just create. Deliberately a
 * separate component from CreateHostelSheet rather than a shared one with a
 * mode flag: the two forms diverge (no campus picker here — updateHostelSchema
 * omits campusId entirely, campus is fixed once created; an `active` toggle
 * here that create has no equivalent for), and this stays simpler to read
 * than threading conditionals through the create form for both cases.
 */
function EditHostelSheet({ hostel, onClose, onSaved }: { hostel: HostelTree; onClose: () => void; onSaved: () => void }) {
  const [code, setCode] = useState(hostel.code);
  const [name, setName] = useState(hostel.name);
  const [genderPolicy, setGenderPolicy] = useState(hostel.genderPolicy);
  const [capacity, setCapacity] = useState(String(hostel.capacity));
  const [status, setStatus] = useState(hostel.status);
  const [effectiveFrom, setEffectiveFrom] = useState(hostel.effectiveFrom ?? '');
  const [effectiveTo, setEffectiveTo] = useState(hostel.effectiveTo ?? '');
  const [categoryPolicy, setCategoryPolicy] = useState((hostel.categoryPolicy ?? []).join(', '));
  const [accessibilityPolicy, setAccessibilityPolicy] = useState(hostel.accessibilityPolicy ?? '');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      await api.updateHostel(hostel.id, {
        code,
        name,
        genderPolicy,
        capacity: Number(capacity),
        status,
        ...(effectiveFrom ? { effectiveFrom } : {}),
        ...(effectiveTo ? { effectiveTo } : {}),
        categoryPolicy: categoryPolicy
          .split(',')
          .map((c) => c.trim())
          .filter(Boolean),
        accessibilityPolicy,
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title="Edit Hostel"
      footer={
        <Button fullWidth onClick={() => void handleSubmit()} disabled={submitting || !code || !name}>
          {submitting ? 'Saving…' : 'Save changes'}
        </Button>
      }
    >
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <FieldWrapper label="Code" htmlFor="eh-code" required>
          <Input id="eh-code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={20} />
        </FieldWrapper>
        <FieldWrapper label="Name" htmlFor="eh-name" required>
          <Input id="eh-name" value={name} onChange={(e) => setName(e.target.value)} />
        </FieldWrapper>
        <FieldWrapper label="Gender policy" htmlFor="eh-gender" required>
          <Select id="eh-gender" value={genderPolicy} onChange={(e) => setGenderPolicy(e.target.value as typeof genderPolicy)}>
            <option value="co-ed">Co-ed</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
          </Select>
        </FieldWrapper>
        <FieldWrapper label="Rated capacity" htmlFor="eh-capacity">
          <Input id="eh-capacity" type="number" min={0} value={capacity} onChange={(e) => setCapacity(e.target.value)} />
        </FieldWrapper>
        <FieldWrapper label="Lifecycle status" htmlFor="eh-status">
          <Select id="eh-status" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
            <option value="deactivated">Deactivated</option>
            <option value="retired">Retired</option>
          </Select>
        </FieldWrapper>
        <div className="grid grid-cols-2 gap-3">
          <FieldWrapper label="Effective from" htmlFor="eh-eff-from" hint="Optional">
            <Input id="eh-eff-from" type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
          </FieldWrapper>
          <FieldWrapper label="Effective to" htmlFor="eh-eff-to" hint="Optional">
            <Input id="eh-eff-to" type="date" value={effectiveTo} onChange={(e) => setEffectiveTo(e.target.value)} />
          </FieldWrapper>
        </div>
        <FieldWrapper label="Category policy" htmlFor="eh-category" hint="Comma-separated, e.g. general, reserved, international">
          <Input id="eh-category" value={categoryPolicy} onChange={(e) => setCategoryPolicy(e.target.value)} />
        </FieldWrapper>
        <FieldWrapper label="Accessibility policy" htmlFor="eh-accessibility">
          <Textarea id="eh-accessibility" value={accessibilityPolicy} onChange={(e) => setAccessibilityPolicy(e.target.value)} />
        </FieldWrapper>
      </div>
    </Sheet>
  );
}

/** flow.md §19 item 18 gap-closure — the Block/Floor/Room edit half of the
 * follow-up this note originally flagged as "not fixed yet." Prefilled
 * mirror of CreateChildSheet (same fields-array pattern), separate
 * component rather than a create/edit mode flag on that one: the two only
 * share field rendering, not submit/validation behavior (create always
 * starts blank; edit's `canSubmit` shouldn't block on a value that was
 * already valid coming in, and initialValues need a way in). */
function EditChildSheet({
  title,
  fields,
  initialValues,
  onSubmit,
  onClose,
  onSaved,
}: {
  title: string;
  fields: Array<'code' | 'name' | 'number' | 'capacity' | 'permittedPopulation' | 'occupancyCompatibilityRule' | 'safetyRestriction'>;
  initialValues: Record<string, string>;
  onSubmit: (values: Record<string, string>) => Promise<unknown>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(initialValues);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // D17.01 item 45 — the three fields replacing the old single
  // `restrictions` blob.
  const labels: Record<string, string> = {
    code: 'Code',
    name: 'Name (optional)',
    number: 'Number',
    capacity: 'Capacity',
    permittedPopulation: 'Permitted population (optional)',
    occupancyCompatibilityRule: 'Occupancy compatibility rule (optional)',
    safetyRestriction: 'Safety restriction (optional)',
  };
  const requiredFields = new Set(['code', 'number']);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(values);
      onSaved();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit = fields.filter((f) => requiredFields.has(f)).every((f) => values[f]);

  return (
    <Sheet
      open
      onClose={onClose}
      title={title}
      footer={
        <Button fullWidth onClick={() => void handleSubmit()} disabled={submitting || !canSubmit}>
          {submitting ? 'Saving…' : 'Save changes'}
        </Button>
      }
    >
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        {fields.map((field) => (
          <FieldWrapper key={field} label={labels[field] ?? field} htmlFor={`ef-${field}`} required={requiredFields.has(field)}>
            <Input
              id={`ef-${field}`}
              type={field === 'capacity' ? 'number' : 'text'}
              value={values[field] ?? ''}
              onChange={(e) => setValues((v) => ({ ...v, [field]: e.target.value }))}
            />
          </FieldWrapper>
        ))}
      </div>
    </Sheet>
  );
}

/** flow.md §19 item 18 gap-closure, widened for HOSTEL-GAP-ANALYSIS.md
 * D17.01 items 43/46/47: a plain Active/Inactive toggle became a real
 * four-state lifecycle picker, with a mandatory reason (+ optional review
 * date) leaving 'active' — this is also how a room gets safety-blocked
 * today, ahead of D17.17 giving safety findings a dedicated object:
 * status='suspended' with a reason describing the finding. Any non-active
 * target is still blocked server-side if the room has a bed with
 * active/reserved/occupied status (flow.md §18 DoD) — this surfaces that
 * ConflictError, doesn't pre-guess it. */
function RoomStatusSheet({
  room,
  label,
  onClose,
  onSaved,
}: {
  room: RoomWithBeds;
  label: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [status, setStatus] = useState(room.status);
  const [reason, setReason] = useState('');
  const [reviewDate, setReviewDate] = useState('');
  const [reasonCategory, setReasonCategory] = useState<'safety' | 'maintenance' | 'policy' | 'other'>('maintenance');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const leavingActive = status !== 'active';

  async function handleSave() {
    setSubmitting(true);
    setError(null);
    try {
      await api.updateRoomStatus(
        room.id,
        status,
        leavingActive ? reason : undefined,
        leavingActive && reviewDate ? reviewDate : undefined,
        leavingActive ? reasonCategory : undefined
      );
      onSaved();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={label}
      footer={
        <Button fullWidth onClick={() => void handleSave()} disabled={submitting || (leavingActive && !reason.trim())}>
          {submitting ? 'Saving…' : 'Save status'}
        </Button>
      }
    >
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <p className="text-sm text-slate-600">
          Current status: <StatusPill status={room.status} />
          {room.statusReasonCategory && <span className="ml-2 text-xs uppercase tracking-wide text-slate-400">{room.statusReasonCategory}</span>}
          {room.statusReason && <span className="ml-2 text-slate-500">— {room.statusReason}</span>}
        </p>
        <FieldWrapper label="New status" htmlFor="rs-status">
          <Select id="rs-status" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
            <option value="active">Active</option>
            <option value="suspended">Suspended (e.g. safety block)</option>
            <option value="deactivated">Deactivated</option>
            <option value="retired">Retired</option>
          </Select>
        </FieldWrapper>
        {leavingActive && (
          <>
            <Alert tone="warning">
              Rejected if this room still has a bed with active/reserved/occupied status — resolve or transfer occupancy first.
            </Alert>
            {/* D17.17 item 67 — 'safety' is the one category that actually
                blocks new allocation/offer on this room (allocations
                service checks it), not just a label. */}
            <FieldWrapper label="Category" htmlFor="rs-category" hint="'Safety' also blocks new allocation/offer on this room">
              <Select id="rs-category" value={reasonCategory} onChange={(e) => setReasonCategory(e.target.value as typeof reasonCategory)}>
                <option value="safety">Safety</option>
                <option value="maintenance">Maintenance</option>
                <option value="policy">Policy</option>
                <option value="other">Other</option>
              </Select>
            </FieldWrapper>
            <FieldWrapper label="Reason" htmlFor="rs-reason" required hint="e.g. a safety finding, planned renovation, or permanent closure">
              <Textarea id="rs-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
            </FieldWrapper>
            <FieldWrapper label="Review date" htmlFor="rs-review" hint="Optional — when this status should be revisited">
              <Input id="rs-review" type="date" value={reviewDate} onChange={(e) => setReviewDate(e.target.value)} />
            </FieldWrapper>
          </>
        )}
      </div>
    </Sheet>
  );
}

/**
 * flow.md §19 item 18 gap-closure. `available`/`blocked`/`maintenance` only —
 * `reserved`/`allocated`/`occupied` are set exclusively by the allocation/
 * check-in workflows (structure/validators.ts's updateBedStatusSchema), so
 * those three aren't offered here at all rather than offered-then-rejected.
 *
 * Code rename is a second, independent action in the same sheet (own button,
 * same two-actions-one-sheet pattern Allocations.tsx's NoShowSheet already
 * uses for Extend/Release) rather than folded into the status submit — a
 * label correction has no occupancy implication and shouldn't be forced to
 * carry a mandatory status-change reason it has nothing to do with.
 */
function BedStatusSheet({
  bed,
  label,
  onClose,
  onSaved,
}: {
  bed: Bed;
  label: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [code, setCode] = useState(bed.code);
  const [bedCategory, setBedCategory] = useState<'resident' | 'guest_short_stay'>(bed.bedCategory);
  const [status, setStatus] = useState<'available' | 'blocked' | 'maintenance'>(
    bed.status === 'blocked' || bed.status === 'maintenance' ? bed.status : 'available'
  );
  const [reason, setReason] = useState('');
  const [reviewDate, setReviewDate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<'code' | 'status' | null>(null);

  async function handleSaveCode() {
    setSubmitting('code');
    setError(null);
    try {
      await api.updateBed(bed.id, {
        ...(code !== bed.code && { code }),
        ...(bedCategory !== bed.bedCategory && { bedCategory }),
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(null);
    }
  }

  async function handleSaveStatus() {
    setSubmitting('status');
    setError(null);
    try {
      await api.updateBedStatus(bed.id, { status, reason, reviewDate: reviewDate || undefined });
      onSaved();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={label}
      footer={
        <div className="flex gap-2">
          <Button
            variant="secondary"
            fullWidth
            onClick={() => void handleSaveCode()}
            disabled={Boolean(submitting) || !code.trim() || (code === bed.code && bedCategory === bed.bedCategory)}
          >
            {submitting === 'code' ? 'Saving…' : 'Save'}
          </Button>
          <Button fullWidth onClick={() => void handleSaveStatus()} disabled={Boolean(submitting) || !reason.trim()}>
            {submitting === 'status' ? 'Saving…' : 'Save status'}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <FieldWrapper label="Code" htmlFor="bs-code">
          <Input id="bs-code" value={code} onChange={(e) => setCode(e.target.value)} maxLength={10} />
        </FieldWrapper>
        {/* D17.25 item 89 — a guest-category bed is excluded from ordinary
            resident allocation entirely; only switchable while the bed is
            'available' (backend-enforced, mirrored here as a disabled
            control rather than a silently-rejected submit). */}
        <FieldWrapper label="Category" htmlFor="bs-category" hint={bed.status !== 'available' ? `Bed must be Available to change this (currently ${bed.status})` : undefined}>
          <Select
            id="bs-category"
            value={bedCategory}
            onChange={(e) => setBedCategory(e.target.value as 'resident' | 'guest_short_stay')}
            disabled={bed.status !== 'available'}
          >
            <option value="resident">Resident</option>
            <option value="guest_short_stay">Guest short-stay</option>
          </Select>
        </FieldWrapper>
        <p className="text-sm text-slate-600">
          Current status: <StatusPill status={bed.status} />
          {bed.statusReason && <span className="ml-2 text-slate-500">— {bed.statusReason}</span>}
        </p>
        {['reserved', 'allocated', 'occupied'].includes(bed.status) && (
          <Alert tone="warning">
            This bed is currently '{bed.status}' via an active allocation — setting it back to Available here will be
            rejected; release it through the allocation/checkout workflow instead. Blocked/Maintenance are still fine to
            set manually.
          </Alert>
        )}
        <FieldWrapper label="New status" htmlFor="bs-status">
          <Select id="bs-status" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
            <option value="available">Available</option>
            <option value="blocked">Blocked</option>
            <option value="maintenance">Maintenance</option>
          </Select>
        </FieldWrapper>
        <FieldWrapper label="Reason" htmlFor="bs-reason" required>
          <Textarea id="bs-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
        </FieldWrapper>
        <FieldWrapper label="Review date" htmlFor="bs-review" hint="Optional — when this status should be revisited">
          <Input id="bs-review" type="date" value={reviewDate} onChange={(e) => setReviewDate(e.target.value)} />
        </FieldWrapper>
      </div>
    </Sheet>
  );
}

/** One generic sheet for Block/Floor/Room/Bed creation — the fields differ
 * slightly but the create/close/refresh mechanics don't, so this covers all
 * four instead of near-duplicating the same component four times. */
function CreateChildSheet({
  title,
  fields,
  onSubmit,
  onClose,
  onCreated,
}: {
  title: string;
  fields: Array<'code' | 'name' | 'number' | 'capacity' | 'permittedPopulation' | 'occupancyCompatibilityRule' | 'safetyRestriction'>;
  onSubmit: (values: Record<string, string>) => Promise<unknown>;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const labels: Record<string, string> = {
    code: 'Code',
    name: 'Name (optional)',
    number: 'Number',
    capacity: 'Capacity',
    permittedPopulation: 'Permitted population (optional)',
    occupancyCompatibilityRule: 'Occupancy compatibility rule (optional)',
    safetyRestriction: 'Safety restriction (optional)',
  };
  const requiredFields = new Set(['code', 'number']);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(values);
      onCreated();
      onClose();
      setValues({});
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit = fields.filter((f) => requiredFields.has(f)).every((f) => values[f]);

  return (
    <Sheet
      open
      onClose={onClose}
      title={title}
      footer={
        <Button fullWidth onClick={() => void handleSubmit()} disabled={submitting || !canSubmit}>
          {submitting ? 'Creating…' : 'Create'}
        </Button>
      }
    >
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        {fields.map((field) => (
          <FieldWrapper key={field} label={labels[field] ?? field} htmlFor={`f-${field}`} required={requiredFields.has(field)}>
            <Input
              id={`f-${field}`}
              type={field === 'capacity' ? 'number' : 'text'}
              value={values[field] ?? ''}
              onChange={(e) => setValues((v) => ({ ...v, [field]: e.target.value }))}
            />
          </FieldWrapper>
        ))}
      </div>
    </Sheet>
  );
}

/**
 * UOS HOSTEL BR.md §2 / HST-WF-22: assign a Room Head (scopeType='room') or
 * Floor In-charge (scopeType='floor') — a scoped, time-bound grant, not a
 * base role (see backend/src/app/responsibilities/service.ts's own
 * comment). Lists current assignments for this exact scope and lets staff
 * revoke one, same list-then-act pattern as Applications.tsx's
 * AttachmentsEditor.
 */
function AssignResponsibilitySheet({
  scopeType,
  scopeId,
  label,
  onClose,
}: {
  scopeType: 'room' | 'floor';
  scopeId: string;
  label: string;
  onClose: () => void;
}) {
  // Real gap, found live via SELF-TEST-GUIDE.md C13 — same hardcoded-title
  // bug as Movement.tsx's headcount hint text, just one screen over: this
  // sheet's own title never reflected a renamed "Room Head"/"Floor
  // In-charge" term, even though the buttons that open it (line ~384/447
  // below) already correctly do.
  const roomHeadLabel = useLabel('roomCrLabel', 'Room Head');
  const floorInchargeLabel = useLabel('floorInchargeLabel', 'Floor In-charge');
  const [assignments, setAssignments] = useState<ResponsibilityAssignment[]>([]);
  const [candidates, setCandidates] = useState<ResidentCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState('');
  const [effectiveTo, setEffectiveTo] = useState('');
  const [substituteDrafts, setSubstituteDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<'assign' | string | null>(null);

  const privilegeType = scopeType === 'room' ? 'room_head' : 'floor_incharge';

  // flow.md §19 item 15 gap-closure — real candidates, campus-wide (not
  // scope-dependent, so it only needs fetching once), instead of a raw
  // UUID paste field with no way to discover a value for it.
  function residentLabel(id: string): string {
    const c = candidates.find((x) => x.id === id);
    return c ? `${c.name} (${c.email})` : id.slice(0, 8);
  }

  async function refresh() {
    setLoading(true);
    const [list, residents] = await Promise.all([
      responsibilityApi.listAssignments({ scopeType, scopeId }),
      responsibilityApi.listCandidates(),
    ]);
    setAssignments(list);
    setCandidates(residents);
    setLoading(false);
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeType, scopeId]);

  async function handleAssign() {
    setSubmitting('assign');
    setError(null);
    try {
      await responsibilityApi.assignResponsibility({
        assigneeUserId: userId,
        privilegeType,
        scopeType,
        scopeId,
        ...(effectiveTo ? { effectiveTo: new Date(effectiveTo).toISOString() } : {}),
      });
      setUserId('');
      setEffectiveTo('');
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(null);
    }
  }

  async function handleRevoke(id: string) {
    setSubmitting(id);
    setError(null);
    try {
      await responsibilityApi.revokeAssignment(id, 'Revoked from Structure screen');
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(null);
    }
  }

  // UAT.md Batch 10 gap-closure — name a substitute for when the primary
  // assignee is unavailable, the scoped-responsibility equivalent of
  // flow.md §5A's delegation framework. See headcount/service.ts's
  // canActOnScope for the actual enforcement point.
  async function handleSetSubstitute(id: string) {
    setSubmitting(`sub-${id}`);
    setError(null);
    try {
      const draft = (substituteDrafts[id] ?? '').trim();
      await responsibilityApi.setSubstitute(id, draft || null);
      setSubstituteDrafts((d) => ({ ...d, [id]: '' }));
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(null);
    }
  }

  const activeAssignments = assignments.filter((a) => a.status === 'active');

  return (
    <Sheet open onClose={onClose} title={`${scopeType === 'room' ? roomHeadLabel : floorInchargeLabel} — ${label}`}>
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}

        {loading ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : activeAssignments.length === 0 ? (
          <p className="text-sm text-slate-500">No active assignment for this {scopeType}.</p>
        ) : (
          <ul className="space-y-2">
            {activeAssignments.map((a) => (
              <li key={a.id} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-slate-600">{residentLabel(a.assigneeUserId)}</span>
                  <Button size="sm" variant="danger" onClick={() => void handleRevoke(a.id)} disabled={submitting === a.id}>
                    {submitting === a.id ? 'Revoking…' : 'Revoke'}
                  </Button>
                </div>
                <div className="mt-2 border-t border-slate-200 pt-2">
                  {a.substituteUserId ? (
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-slate-500">Substitute: {residentLabel(a.substituteUserId)}</span>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => void handleSetSubstitute(a.id)}
                        disabled={submitting === `sub-${a.id}`}
                      >
                        {submitting === `sub-${a.id}` ? 'Clearing…' : 'Clear'}
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Select
                        aria-label="Substitute"
                        value={substituteDrafts[a.id] ?? ''}
                        onChange={(e) => setSubstituteDrafts((d) => ({ ...d, [a.id]: e.target.value }))}
                        className="flex-1 text-xs"
                      >
                        <option value="">Name a substitute…</option>
                        {candidates
                          .filter((c) => c.id !== a.assigneeUserId)
                          .map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name} ({c.email})
                            </option>
                          ))}
                      </Select>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => void handleSetSubstitute(a.id)}
                        disabled={!(substituteDrafts[a.id] ?? '').trim() || submitting === `sub-${a.id}`}
                      >
                        {submitting === `sub-${a.id}` ? 'Setting…' : 'Set'}
                      </Button>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="border-t border-slate-200 pt-4">
          <FieldWrapper label="Assign to" htmlFor="ra-user">
            <Select id="ra-user" value={userId} onChange={(e) => setUserId(e.target.value)}>
              <option value="">Select a resident…</option>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.email})
                </option>
              ))}
            </Select>
          </FieldWrapper>
          {!loading && candidates.length === 0 && (
            <div className="mt-2">
              <Alert tone="warning">No residents found yet — students need an active `student` role before they can be assigned here.</Alert>
            </div>
          )}
          <div className="mt-3">
            <FieldWrapper label="Effective to (optional)" htmlFor="ra-until" hint="Leave blank for an open-ended assignment">
              <Input id="ra-until" type="datetime-local" value={effectiveTo} onChange={(e) => setEffectiveTo(e.target.value)} />
            </FieldWrapper>
          </div>
          <Button fullWidth className="mt-3" onClick={() => void handleAssign()} disabled={!userId.trim() || submitting === 'assign'}>
            {submitting === 'assign' ? 'Assigning…' : 'Assign'}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
