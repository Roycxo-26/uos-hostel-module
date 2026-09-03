import { hasOrgRole, hasPermission, getPermissions, isSuperAdmin, type AuthUser } from '@uos/auth';
import { MODULE } from '../../constants';
import { ForbiddenError } from '../../middlewares/errorHandler';
import { redis } from '../../redis';
import * as repo from './repository';
import type { MessKitchenConnectionStatus } from './types';

async function canViewEventLog(user: AuthUser): Promise<boolean> {
  if (isSuperAdmin(user) || hasOrgRole(user, ['org_admin'])) return true;
  const perms = await getPermissions({ user, module: MODULE, redis });
  return hasPermission(perms, 'mess_kitchen:view_events');
}

/**
 * §24.2/§24.7 — no D18 exists to connect to in this standalone build, so
 * this is always disconnected. Not a placeholder awaiting a real
 * integration to flip it: §24.7 itself is the spec for exactly this
 * state ("Housing operations continue... marks menu and meal analytics
 * disconnected/stale... does not create a competing meal ledger or
 * claim final count"), so returning it honestly here already satisfies
 * the rule rather than working around it.
 */
export function getConnectionStatus(): MessKitchenConnectionStatus {
  return {
    menuStatus: 'D18_DISCONNECTED',
    d18Connected: false,
    lastKnownMenuAt: null,
    note: 'No Mess/Kitchen (D18) system is connected to this Hostel instance. Menu, meal attendance and food feedback are owned by D18 and are not available here — see "HOSTEL - v.1.md" §24.1.',
  };
}

export async function listEvents(user: AuthUser, filters: { eventType?: string; studentId?: string }) {
  if (!(await canViewEventLog(user))) throw new ForbiddenError('Only staff can view the Mess/Kitchen outbound event log');
  return repo.listEvents(filters);
}
