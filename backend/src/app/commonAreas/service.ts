import type { AuthUser } from '@uos/auth';
import type { z } from 'zod';
import { db } from '../../db';
import { ConflictError, NotFoundError } from '../../middlewares/errorHandler';
import { recordAudit } from '../../utils/audit';
import { notify, notifyCampusStaff } from '../../utils/notify';
import * as repo from './repository';
import type {
  closeOutageSchema,
  createCommonAreaSchema,
  notifyResidentsPestSchema,
  recordInspectionSchema,
  recordPestTreatmentSchema,
  reinspectPestSchema,
  reportOutageSchema,
  reportPestFindingSchema,
  restoreOutageSchema,
  schedulePestTreatmentSchema,
  setAlternativeArrangementSchema,
  updateCommonAreaStatusSchema,
  updateOutageEtaSchema,
  verifyOutageSchema,
} from './validators';

// ============================================================================
// D17.19 item 75 — common-area master. The Structure hierarchy has no
// concept of a shared washroom/study room/corridor today; this is that
// missing master.
// ============================================================================

export async function createCommonArea(user: AuthUser, input: z.infer<typeof createCommonAreaSchema>) {
  const hostel = await db('hostels').where({ id: input.hostelId }).first('campus_id');
  if (!hostel) throw new NotFoundError('Hostel');

  const row = await repo.createCommonArea({
    org_id: user.org_id,
    campus_id: hostel.campus_id,
    hostel_id: input.hostelId,
    floor_id: input.floorId ?? null,
    area_type: input.areaType,
    name: input.name,
    status: 'operational',
    opening_hours: input.openingHours ?? null,
    capacity: input.capacity ?? null,
    permitted_population: input.permittedPopulation ?? null,
    cleaning_schedule: input.cleaningSchedule ?? null,
    safety_restriction: input.safetyRestriction ?? null,
  });
  await recordAudit({
    orgId: user.org_id,
    campusId: hostel.campus_id,
    actorUserId: user.sub,
    action: 'common_area.created',
    entityType: 'common_area',
    entityId: row.id,
    after: row,
  });
  return row;
}

export async function updateCommonAreaStatus(user: AuthUser, id: string, input: z.infer<typeof updateCommonAreaStatusSchema>) {
  const before = await repo.findCommonAreaById(id);
  if (!before) throw new NotFoundError('Common area');

  const after = await repo.updateCommonArea(id, { status: input.status });
  await recordAudit({
    orgId: user.org_id,
    campusId: before.campus_id,
    actorUserId: user.sub,
    action: 'common_area.status_changed',
    entityType: 'common_area',
    entityId: id,
    before,
    after,
    reason: input.reason,
  });
  return after;
}

export async function getCommonArea(id: string) {
  const area = await repo.findCommonAreaById(id);
  if (!area) throw new NotFoundError('Common area');
  const inspections = await repo.listInspections(id);
  return { ...area, inspections };
}

export async function listCommonAreas(filters: { hostelId?: string; areaType?: string }) {
  return repo.listCommonAreas(filters);
}

// ============================================================================
// D17.19 item 76 — sanitation inspection.
// ============================================================================

export async function recordInspection(user: AuthUser, input: z.infer<typeof recordInspectionSchema>) {
  const area = await repo.findCommonAreaById(input.commonAreaId);
  if (!area) throw new NotFoundError('Common area');

  // A deterministic verdict from the checklist itself, not a separate
  // manual judgement call staff have to make on top of the same checks
  // they just answered: any explicit "needs correction" flag or a low
  // score fails it; nothing wrong at all passes it.
  const criticalIssue =
    !input.odourVentilationOk || !input.waterAvailabilityOk || !input.drainageOk || !input.lightingOk || !input.accessibilityOk || !input.privacyLatchOk;
  const status = input.correctiveActionNeeded ? 'needs_reinspection' : input.cleanlinessScore < 3 || criticalIssue ? 'failed' : 'passed';

  const row = await repo.createInspection({
    org_id: user.org_id,
    campus_id: area.campus_id,
    common_area_id: input.commonAreaId,
    inspected_by: user.sub,
    cleanliness_score: input.cleanlinessScore,
    odour_ventilation_ok: input.odourVentilationOk,
    water_availability_ok: input.waterAvailabilityOk,
    drainage_ok: input.drainageOk,
    consumables_available: input.consumablesAvailable ?? null,
    fixture_condition_notes: input.fixtureConditionNotes ?? null,
    lighting_ok: input.lightingOk,
    accessibility_ok: input.accessibilityOk,
    waste_bin_condition: input.wasteBinCondition ?? null,
    pest_indicator: input.pestIndicator,
    privacy_latch_ok: input.privacyLatchOk,
    safety_hazard_notes: input.safetyHazardNotes ?? null,
    photo_url: input.photoUrl ?? null,
    corrective_action_needed: input.correctiveActionNeeded,
    corrective_action_notes: input.correctiveActionNotes ?? null,
    status,
    reinspection_of: input.reinspectionOf ?? null,
  });

  await recordAudit({
    orgId: user.org_id,
    campusId: area.campus_id,
    actorUserId: user.sub,
    action: 'sanitation_inspection.recorded',
    entityType: 'sanitation_inspection',
    entityId: row.id,
    after: row,
  });

  if (status !== 'passed') {
    await notifyCampusStaff(db, user.org_id, area.campus_id, {
      type: 'sanitation_inspection.failed',
      title: `Sanitation inspection ${status === 'failed' ? 'failed' : 'needs reinspection'}: ${area.name}`,
      link: '/structure',
    });
  }
  if (input.pestIndicator) {
    await notifyCampusStaff(db, user.org_id, area.campus_id, {
      type: 'sanitation_inspection.pest_indicator',
      title: `Pest indicator flagged during inspection of ${area.name} — consider a pest-control report`,
      link: '/structure',
    });
  }

  return row;
}

export async function listPendingReinspections() {
  return repo.listFailedInspectionsNeedingReinspection();
}

// ============================================================================
// D17.19 item 77 — utility/service outage lifecycle. LAW-32: affected
// population from live occupancy, targeted notice, ETA changes as new
// episodes (not overwrites), restoration + verification before close.
// ============================================================================

export async function reportOutage(user: AuthUser, input: z.infer<typeof reportOutageSchema>) {
  const hostel = await db('hostels').where({ id: input.hostelId }).first('campus_id');
  if (!hostel) throw new NotFoundError('Hostel');

  const occupants = await repo.listOccupantsInScope(input.scopeType, input.scopeId);

  const outage = await repo.createOutage({
    org_id: user.org_id,
    campus_id: hostel.campus_id,
    hostel_id: input.hostelId,
    scope_type: input.scopeType,
    scope_id: input.scopeId,
    outage_type: input.outageType,
    severity: input.severity,
    status: 'notified',
    affected_population_count: occupants.length,
    alternative_arrangement: input.alternativeArrangement ?? null,
    reported_by: user.sub,
    estimated_restoration_at: input.estimatedRestorationAt ?? null,
  });

  await recordAudit({
    orgId: user.org_id,
    campusId: hostel.campus_id,
    actorUserId: user.sub,
    action: 'utility_outage.reported',
    entityType: 'utility_outage',
    entityId: outage.id,
    after: outage,
  });

  const etaText = input.estimatedRestorationAt ? ` — expected back by ${new Date(input.estimatedRestorationAt).toLocaleString()}` : '';
  for (const occupant of occupants) {
    await notify({
      orgId: user.org_id,
      campusId: hostel.campus_id,
      userId: occupant.student_id,
      type: 'utility_outage.reported',
      title: `${input.outageType.replace(/_/g, ' ')} outage affecting your area${etaText}`,
      body: input.alternativeArrangement,
      link: '/dashboard',
    });
  }
  await notifyCampusStaff(db, user.org_id, hostel.campus_id, {
    type: 'utility_outage.reported',
    title: `${input.outageType.replace(/_/g, ' ')} outage reported (${input.severity}) — ${occupants.length} resident(s) affected`,
    link: '/structure',
  });

  return outage;
}

export async function updateOutageEta(user: AuthUser, id: string, input: z.infer<typeof updateOutageEtaSchema>) {
  const before = await repo.findOutageById(id);
  if (!before) throw new NotFoundError('Utility outage');
  if (['restored', 'verified', 'closed'].includes(before.status)) throw new ConflictError(`Cannot update ETA on a '${before.status}' outage`);

  await repo.createOutageUpdate({
    org_id: user.org_id,
    campus_id: before.campus_id,
    outage_id: id,
    update_type: 'eta_change',
    old_value: before.estimated_restoration_at ? String(before.estimated_restoration_at) : null,
    new_value: input.estimatedRestorationAt,
    updated_by: user.sub,
  });
  const after = await repo.updateOutage(id, { estimated_restoration_at: input.estimatedRestorationAt });

  await recordAudit({
    orgId: user.org_id,
    campusId: before.campus_id,
    actorUserId: user.sub,
    action: 'utility_outage.eta_updated',
    entityType: 'utility_outage',
    entityId: id,
    before,
    after,
  });

  const occupants = await repo.listOccupantsInScope(before.scope_type, before.scope_id);
  for (const occupant of occupants) {
    await notify({
      orgId: user.org_id,
      campusId: before.campus_id,
      userId: occupant.student_id,
      type: 'utility_outage.eta_updated',
      title: `Updated restoration time: ${new Date(input.estimatedRestorationAt).toLocaleString()}`,
      link: '/dashboard',
    });
  }

  return after;
}

export async function setAlternativeArrangement(user: AuthUser, id: string, input: z.infer<typeof setAlternativeArrangementSchema>) {
  const before = await repo.findOutageById(id);
  if (!before) throw new NotFoundError('Utility outage');

  await repo.createOutageUpdate({
    org_id: user.org_id,
    campus_id: before.campus_id,
    outage_id: id,
    update_type: 'note',
    old_value: before.alternative_arrangement,
    new_value: input.alternativeArrangement,
    updated_by: user.sub,
  });
  const after = await repo.updateOutage(id, { alternative_arrangement: input.alternativeArrangement });

  await recordAudit({
    orgId: user.org_id,
    campusId: before.campus_id,
    actorUserId: user.sub,
    action: 'utility_outage.alternative_arrangement_set',
    entityType: 'utility_outage',
    entityId: id,
    before,
    after,
  });
  return after;
}

export async function restoreOutage(user: AuthUser, id: string, _input: z.infer<typeof restoreOutageSchema>) {
  const before = await repo.findOutageById(id);
  if (!before) throw new NotFoundError('Utility outage');
  if (before.status !== 'notified') throw new ConflictError(`Cannot restore an outage in status '${before.status}'`);

  const after = await repo.updateOutage(id, { status: 'restored', restored_at: db.fn.now() });
  await repo.createOutageUpdate({
    org_id: user.org_id,
    campus_id: before.campus_id,
    outage_id: id,
    update_type: 'status_change',
    old_value: before.status,
    new_value: 'restored',
    updated_by: user.sub,
  });
  await recordAudit({
    orgId: user.org_id,
    campusId: before.campus_id,
    actorUserId: user.sub,
    action: 'utility_outage.restored',
    entityType: 'utility_outage',
    entityId: id,
    before,
    after,
  });

  const occupants = await repo.listOccupantsInScope(before.scope_type, before.scope_id);
  for (const occupant of occupants) {
    await notify({
      orgId: user.org_id,
      campusId: before.campus_id,
      userId: occupant.student_id,
      type: 'utility_outage.restored',
      title: `${before.outage_type.replace(/_/g, ' ')} service has been restored`,
      link: '/dashboard',
    });
  }

  return after;
}

export async function verifyOutage(user: AuthUser, id: string, input: z.infer<typeof verifyOutageSchema>) {
  const before = await repo.findOutageById(id);
  if (!before) throw new NotFoundError('Utility outage');
  if (before.status !== 'restored') throw new ConflictError(`Cannot verify an outage in status '${before.status}'`);

  const after = await repo.updateOutage(id, { status: 'verified', verified_by: user.sub, verified_at: db.fn.now() });
  await recordAudit({
    orgId: user.org_id,
    campusId: before.campus_id,
    actorUserId: user.sub,
    action: 'utility_outage.verified',
    entityType: 'utility_outage',
    entityId: id,
    before,
    after,
    reason: input.notes,
  });
  return after;
}

// BRD's own "where required" qualifier — verification isn't mandatory for
// every outage, so close accepts either 'restored' or 'verified'.
export async function closeOutage(user: AuthUser, id: string, input: z.infer<typeof closeOutageSchema>) {
  const before = await repo.findOutageById(id);
  if (!before) throw new NotFoundError('Utility outage');
  if (!['restored', 'verified'].includes(before.status)) throw new ConflictError(`Cannot close an outage in status '${before.status}'`);

  const after = await repo.updateOutage(id, { status: 'closed', closure_notes: input.notes ?? null });
  await recordAudit({
    orgId: user.org_id,
    campusId: before.campus_id,
    actorUserId: user.sub,
    action: 'utility_outage.closed',
    entityType: 'utility_outage',
    entityId: id,
    before,
    after,
  });
  return after;
}

export async function getOutage(id: string) {
  const outage = await repo.findOutageById(id);
  if (!outage) throw new NotFoundError('Utility outage');
  const updates = await repo.listOutageUpdates(id);
  return { ...outage, updates };
}

export async function listOutages(filters: { hostelId?: string; status?: string }) {
  return repo.listOutages(filters);
}

// ============================================================================
// D17.19 item 78 — pest control lifecycle.
// ============================================================================

export async function reportPestFinding(user: AuthUser, input: z.infer<typeof reportPestFindingSchema>) {
  const campusId = await resolveScopeCampus(input.scopeType, input.scopeId);
  const priorCount = await repo.countPriorTreatmentsForScope(input.scopeId);

  const row = await repo.createPestTreatment({
    org_id: user.org_id,
    campus_id: campusId,
    scope_type: input.scopeType,
    scope_id: input.scopeId,
    finding_notes: input.findingNotes,
    status: 'finding_reported',
    recurrence_of: input.recurrenceOf ?? null,
    created_by: user.sub,
  });

  await recordAudit({
    orgId: user.org_id,
    campusId,
    actorUserId: user.sub,
    action: 'pest_control.finding_reported',
    entityType: 'pest_control_treatment',
    entityId: row.id,
    after: { ...row, priorTreatmentsForScope: priorCount },
  });

  if (priorCount > 0) {
    await notifyCampusStaff(db, user.org_id, campusId, {
      type: 'pest_control.recurrence',
      title: `Possible recurring infestation — this is treatment attempt #${priorCount + 1} for this location`,
      link: '/structure',
    });
  }

  return row;
}

async function resolveScopeCampus(scopeType: 'room' | 'common_area' | 'floor' | 'hostel', scopeId: string): Promise<string> {
  const table = { room: 'rooms', common_area: 'common_areas', floor: 'floors', hostel: 'hostels' }[scopeType];
  const row = await db(table).where({ id: scopeId }).first('campus_id');
  if (!row) throw new NotFoundError('Scope');
  return row.campus_id;
}

export async function schedulePestTreatment(user: AuthUser, id: string, input: z.infer<typeof schedulePestTreatmentSchema>) {
  const before = await repo.findPestTreatmentById(id);
  if (!before) throw new NotFoundError('Pest control treatment');
  if (before.status !== 'finding_reported') throw new ConflictError(`Cannot schedule a treatment in status '${before.status}'`);

  const after = await repo.updatePestTreatment(id, {
    status: 'scheduled',
    scheduled_at: input.scheduledAt,
    treatment_method: input.treatmentMethod ?? null,
    chemical_reference: input.chemicalReference ?? null,
  });
  await recordAudit({
    orgId: user.org_id,
    campusId: before.campus_id,
    actorUserId: user.sub,
    action: 'pest_control.scheduled',
    entityType: 'pest_control_treatment',
    entityId: id,
    before,
    after,
  });
  return after;
}

export async function notifyResidentsForPest(user: AuthUser, id: string, _input: z.infer<typeof notifyResidentsPestSchema>) {
  const before = await repo.findPestTreatmentById(id);
  if (!before) throw new NotFoundError('Pest control treatment');
  if (before.status !== 'scheduled') throw new ConflictError(`Cannot notify residents from status '${before.status}'`);

  const after = await repo.updatePestTreatment(id, { status: 'resident_notified', resident_notified_at: db.fn.now() });
  await recordAudit({
    orgId: user.org_id,
    campusId: before.campus_id,
    actorUserId: user.sub,
    action: 'pest_control.residents_notified',
    entityType: 'pest_control_treatment',
    entityId: id,
    before,
    after,
  });

  if (before.scope_type === 'room' || before.scope_type === 'floor' || before.scope_type === 'hostel') {
    const occupants = await repo.listOccupantsInScope(before.scope_type, before.scope_id);
    for (const occupant of occupants) {
      await notify({
        orgId: user.org_id,
        campusId: before.campus_id,
        userId: occupant.student_id,
        type: 'pest_control.scheduled',
        title: `Pest treatment scheduled for ${before.scheduled_at ? new Date(before.scheduled_at).toLocaleString() : 'soon'} — please prepare your space`,
        link: '/dashboard',
      });
    }
  }

  return after;
}

export async function recordPestTreatment(user: AuthUser, id: string, input: z.infer<typeof recordPestTreatmentSchema>) {
  const before = await repo.findPestTreatmentById(id);
  if (!before) throw new NotFoundError('Pest control treatment');
  if (before.status !== 'resident_notified') throw new ConflictError(`Cannot record treatment from status '${before.status}'`);

  const after = await repo.updatePestTreatment(id, {
    status: 'treated',
    treated_at: db.fn.now(),
    re_entry_safe_at: input.reEntrySafeAt ?? null,
  });
  await recordAudit({
    orgId: user.org_id,
    campusId: before.campus_id,
    actorUserId: user.sub,
    action: 'pest_control.treated',
    entityType: 'pest_control_treatment',
    entityId: id,
    before,
    after,
  });
  return after;
}

/** A passing reinspection closes the record in the same call — nothing
 * else needs to happen once it's confirmed clear. A failing one stays
 * 'reinspected' as a visible flag for staff to open a fresh finding
 * (recurrenceOf pointing back here) rather than silently looping the same
 * record. */
export async function reinspectPest(user: AuthUser, id: string, input: z.infer<typeof reinspectPestSchema>) {
  const before = await repo.findPestTreatmentById(id);
  if (!before) throw new NotFoundError('Pest control treatment');
  if (before.status !== 'treated') throw new ConflictError(`Cannot reinspect from status '${before.status}'`);

  const after = await repo.updatePestTreatment(id, {
    status: input.passed ? 'closed' : 'reinspected',
    reinspected_at: db.fn.now(),
    reinspection_result: input.result,
  });
  await recordAudit({
    orgId: user.org_id,
    campusId: before.campus_id,
    actorUserId: user.sub,
    action: 'pest_control.reinspected',
    entityType: 'pest_control_treatment',
    entityId: id,
    before,
    after,
  });
  return after;
}

export async function getPestTreatment(id: string) {
  const row = await repo.findPestTreatmentById(id);
  if (!row) throw new NotFoundError('Pest control treatment');
  return row;
}

export async function listPestTreatments(filters: { status?: string; scopeId?: string }) {
  return repo.listPestTreatments(filters);
}
