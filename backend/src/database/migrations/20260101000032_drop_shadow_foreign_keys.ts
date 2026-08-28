import type { Knex } from 'knex';

// Removes every foreign key that points into a shadow table — 120 of them,
// across 45 tables.
//
// These came from the module template, which created them and told you to copy
// the pattern ("Copy this shape for every actor column your module adds") while
// a later migration in the same template said to add none. That contradiction
// was ours; the template is fixed.
//
// Nothing is failing today, so this is not urgent. It is worth doing because
// shadow tables hold a slice of the university rather than all of it, and a
// constraint pointed at one limits what this module is able to record:
//
//   Deletion — the one that will bite. shadow_user_access.user_id and
//   user_roles.user_id both cascade from shadow_users. Nothing deletes from
//   shadow_users yet, so they cannot fire. The day this module implements
//   access-loss handling — and it must eventually, since the reconcile list is
//   the only way a module learns someone lost access — a person dropping out
//   takes their entire role history with them, silently. RESTRICT is no better:
//   it makes an ordinary stand-down fail against history it should not protect.
//
//   Reach. shadow_users holds only people entitled to THIS module, not the
//   university. Every person hostel names today is a hostel user, so this does
//   not bite here — but it did in another module, where an approval could not be
//   routed to a department head who had no access to it.
//
// Not a reason, despite an earlier claim: there is no backfill ordering race.
// backfillOnce() is sequential and deliberately ordered, and onUserSync writes
// the shadow_users row before the access rows in the same handler.
//
// Nothing replaces these. Sync owns the shadow tables, and a reader that needs a
// name for an id has to handle not finding one. Hold the id, join when you can,
// cope when you cannot.
//
// Dropping a foreign key cannot invalidate existing data: a constraint only ever
// rejects writes, so removing one accepts strictly more than before.
const SHADOW_FOREIGN_KEYS: Array<{ table: string; constraint: string }> = [
  { table: 'allocation_offers', constraint: 'allocation_offers_campus_id_foreign' },
  { table: 'allocation_offers', constraint: 'allocation_offers_offered_by_foreign' },
  { table: 'allocation_offers', constraint: 'allocation_offers_student_id_foreign' },
  { table: 'allocations', constraint: 'allocations_approver_user_id_foreign' },
  { table: 'allocations', constraint: 'allocations_campus_id_foreign' },
  { table: 'allocations', constraint: 'allocations_student_id_foreign' },
  { table: 'approval_resolutions', constraint: 'approval_resolutions_actual_approver_user_id_foreign' },
  { table: 'approval_resolutions', constraint: 'approval_resolutions_campus_id_foreign' },
  { table: 'approval_resolutions', constraint: 'approval_resolutions_planned_approver_user_id_foreign' },
  { table: 'approval_resolutions', constraint: 'approval_resolutions_retrospective_reviewer_user_id_foreign' },
  { table: 'approver_delegations', constraint: 'approver_delegations_campus_id_foreign' },
  { table: 'approver_delegations', constraint: 'approver_delegations_created_by_foreign' },
  { table: 'approver_delegations', constraint: 'approver_delegations_delegate_user_id_foreign' },
  { table: 'audit_log', constraint: 'audit_log_actor_user_id_foreign' },
  { table: 'audit_log', constraint: 'audit_log_campus_id_foreign' },
  { table: 'bed_holds', constraint: 'bed_holds_campus_id_foreign' },
  { table: 'bed_holds', constraint: 'bed_holds_held_by_foreign' },
  { table: 'beds', constraint: 'beds_campus_id_foreign' },
  { table: 'blocks', constraint: 'blocks_campus_id_foreign' },
  { table: 'blocks', constraint: 'blocks_warden_user_id_foreign' },
  { table: 'cases', constraint: 'cases_assigned_to_foreign' },
  { table: 'cases', constraint: 'cases_campus_id_foreign' },
  { table: 'cases', constraint: 'cases_decided_by_foreign' },
  { table: 'cases', constraint: 'cases_reporter_user_id_foreign' },
  { table: 'cases', constraint: 'cases_subject_user_id_foreign' },
  { table: 'checkin_inventory_items', constraint: 'checkin_inventory_items_campus_id_foreign' },
  { table: 'checkins', constraint: 'checkins_campus_id_foreign' },
  { table: 'checkins', constraint: 'checkins_checked_in_by_foreign' },
  { table: 'checkouts', constraint: 'checkouts_approved_by_foreign' },
  { table: 'checkouts', constraint: 'checkouts_campus_id_foreign' },
  { table: 'checkouts', constraint: 'checkouts_student_id_foreign' },
  { table: 'common_areas', constraint: 'common_areas_campus_id_foreign' },
  { table: 'entity_code_aliases', constraint: 'entity_code_aliases_campus_id_foreign' },
  { table: 'evacuation_drill_entries', constraint: 'evacuation_drill_entries_campus_id_foreign' },
  { table: 'evacuation_drill_entries', constraint: 'evacuation_drill_entries_recorded_by_foreign' },
  { table: 'evacuation_drill_entries', constraint: 'evacuation_drill_entries_student_id_foreign' },
  { table: 'evacuation_drills', constraint: 'evacuation_drills_campus_id_foreign' },
  { table: 'evacuation_drills', constraint: 'evacuation_drills_closed_by_foreign' },
  { table: 'evacuation_drills', constraint: 'evacuation_drills_opened_by_foreign' },
  { table: 'floors', constraint: 'floors_campus_id_foreign' },
  { table: 'floors', constraint: 'floors_floor_incharge_user_id_foreign' },
  { table: 'grievances', constraint: 'grievances_assigned_reviewer_foreign' },
  { table: 'grievances', constraint: 'grievances_campus_id_foreign' },
  { table: 'grievances', constraint: 'grievances_decided_by_foreign' },
  { table: 'grievances', constraint: 'grievances_final_decided_by_foreign' },
  { table: 'grievances', constraint: 'grievances_independent_reviewer_foreign' },
  { table: 'grievances', constraint: 'grievances_raised_by_foreign' },
  { table: 'grievances', constraint: 'grievances_subject_user_id_foreign' },
  { table: 'headcount_entries', constraint: 'headcount_entries_campus_id_foreign' },
  { table: 'headcount_entries', constraint: 'headcount_entries_recorded_by_foreign' },
  { table: 'headcount_entries', constraint: 'headcount_entries_student_id_foreign' },
  { table: 'headcount_sessions', constraint: 'headcount_sessions_campus_id_foreign' },
  { table: 'headcount_sessions', constraint: 'headcount_sessions_closed_by_foreign' },
  { table: 'headcount_sessions', constraint: 'headcount_sessions_opened_by_foreign' },
  { table: 'hostel_applications', constraint: 'hostel_applications_campus_id_foreign' },
  { table: 'hostel_applications', constraint: 'hostel_applications_decided_by_foreign' },
  { table: 'hostel_applications', constraint: 'hostel_applications_student_id_foreign' },
  { table: 'hostels', constraint: 'hostels_campus_id_foreign' },
  { table: 'master_key_log', constraint: 'master_key_log_campus_id_foreign' },
  { table: 'master_key_log', constraint: 'master_key_log_issued_by_foreign' },
  { table: 'master_key_log', constraint: 'master_key_log_issued_to_foreign' },
  { table: 'movement_requests', constraint: 'movement_requests_campus_id_foreign' },
  { table: 'movement_requests', constraint: 'movement_requests_decided_by_foreign' },
  { table: 'movement_requests', constraint: 'movement_requests_exit_recorded_by_foreign' },
  { table: 'movement_requests', constraint: 'movement_requests_return_recorded_by_foreign' },
  { table: 'movement_requests', constraint: 'movement_requests_student_id_foreign' },
  { table: 'notifications', constraint: 'notifications_campus_id_foreign' },
  { table: 'notifications', constraint: 'notifications_user_id_foreign' },
  { table: 'occupancy_verification_entries', constraint: 'occupancy_verification_entries_campus_id_foreign' },
  { table: 'occupancy_verification_entries', constraint: 'occupancy_verification_entries_follow_up_owner_foreign' },
  { table: 'occupancy_verification_entries', constraint: 'occupancy_verification_entries_recorded_by_foreign' },
  { table: 'occupancy_verification_entries', constraint: 'occupancy_verification_entries_student_id_foreign' },
  { table: 'occupancy_verification_sessions', constraint: 'occupancy_verification_sessions_campus_id_foreign' },
  { table: 'occupancy_verification_sessions', constraint: 'occupancy_verification_sessions_closed_by_foreign' },
  { table: 'occupancy_verification_sessions', constraint: 'occupancy_verification_sessions_opened_by_foreign' },
  { table: 'operational_notice_acknowledgements', constraint: 'operational_notice_acknowledgements_campus_id_foreign' },
  { table: 'operational_notice_acknowledgements', constraint: 'operational_notice_acknowledgements_student_id_foreign' },
  { table: 'operational_notices', constraint: 'operational_notices_campus_id_foreign' },
  { table: 'operational_notices', constraint: 'operational_notices_published_by_foreign' },
  { table: 'pest_control_treatments', constraint: 'pest_control_treatments_campus_id_foreign' },
  { table: 'pest_control_treatments', constraint: 'pest_control_treatments_created_by_foreign' },
  { table: 'policy_acknowledgements', constraint: 'policy_acknowledgements_campus_id_foreign' },
  { table: 'policy_acknowledgements', constraint: 'policy_acknowledgements_student_id_foreign' },
  { table: 'policy_versions', constraint: 'policy_versions_campus_id_foreign' },
  { table: 'policy_versions', constraint: 'policy_versions_published_by_foreign' },
  { table: 'property_custody', constraint: 'property_custody_campus_id_foreign' },
  { table: 'property_custody', constraint: 'property_custody_claimant_user_id_foreign' },
  { table: 'property_custody', constraint: 'property_custody_collected_by_foreign' },
  { table: 'property_custody', constraint: 'property_custody_student_id_foreign' },
  { table: 'property_custody', constraint: 'property_custody_witness_user_id_foreign' },
  { table: 'responsibility_assignments', constraint: 'attendance_responsibility_assignments_assigned_by_foreign' },
  { table: 'responsibility_assignments', constraint: 'attendance_responsibility_assignments_assignee_user_id_foreign' },
  { table: 'responsibility_assignments', constraint: 'attendance_responsibility_assignments_campus_id_foreign' },
  { table: 'responsibility_assignments', constraint: 'attendance_responsibility_assignments_substitute_user_id_foreig' },
  { table: 'room_entries', constraint: 'room_entries_approved_by_foreign' },
  { table: 'room_entries', constraint: 'room_entries_campus_id_foreign' },
  { table: 'room_entries', constraint: 'room_entries_entered_by_foreign' },
  { table: 'room_entries', constraint: 'room_entries_requested_by_foreign' },
  { table: 'room_entries', constraint: 'room_entries_witness_user_id_foreign' },
  { table: 'rooms', constraint: 'rooms_campus_id_foreign' },
  { table: 'sanitation_inspections', constraint: 'sanitation_inspections_campus_id_foreign' },
  { table: 'sanitation_inspections', constraint: 'sanitation_inspections_inspected_by_foreign' },
  { table: 'security_evidence_references', constraint: 'security_evidence_references_campus_id_foreign' },
  { table: 'security_evidence_references', constraint: 'security_evidence_references_created_by_foreign' },
  { table: 'shadow_user_access', constraint: 'shadow_user_access_campus_id_foreign' },
  { table: 'shadow_user_access', constraint: 'shadow_user_access_user_id_foreign' },
  { table: 'tenant_settings', constraint: 'tenant_settings_updated_by_foreign' },
  { table: 'transfer_requests', constraint: 'transfer_requests_campus_id_foreign' },
  { table: 'transfer_requests', constraint: 'transfer_requests_decided_by_foreign' },
  { table: 'transfer_requests', constraint: 'transfer_requests_executed_by_foreign' },
  { table: 'transfer_requests', constraint: 'transfer_requests_student_id_foreign' },
  { table: 'user_roles', constraint: 'user_roles_campus_id_foreign' },
  { table: 'user_roles', constraint: 'user_roles_user_id_foreign' },
  { table: 'utility_outage_updates', constraint: 'utility_outage_updates_campus_id_foreign' },
  { table: 'utility_outage_updates', constraint: 'utility_outage_updates_updated_by_foreign' },
  { table: 'utility_outages', constraint: 'utility_outages_campus_id_foreign' },
  { table: 'utility_outages', constraint: 'utility_outages_reported_by_foreign' },
  { table: 'utility_outages', constraint: 'utility_outages_verified_by_foreign' },
  { table: 'waitlist_entries', constraint: 'waitlist_entries_campus_id_foreign' },
  { table: 'waitlist_entries', constraint: 'waitlist_entries_student_id_foreign' },
];

export async function up(knex: Knex): Promise<void> {
  for (const { table, constraint } of SHADOW_FOREIGN_KEYS) {
    await knex.raw('ALTER TABLE hostel.?? DROP CONSTRAINT IF EXISTS ??', [table, constraint]);
  }
}

// Deliberately empty. Re-adding these would reject rows that are valid now — an
// allocation naming someone outside shadow_users, for one — so the rollback
// would fail on exactly the data this migration exists to allow.
export async function down(): Promise<void> {}
