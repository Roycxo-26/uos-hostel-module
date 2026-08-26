import type { AuthUser } from '@uos/auth';
import { db } from '../../db';
import { recordAudit } from '../../utils/audit';
import * as repo from './repository';
import { withDefaults, type Branding, type FeatureFlags, type PolicyDefaults, type TenantSettings, type Terminology } from './types';

export async function getSettings(orgId: string): Promise<TenantSettings> {
  const row = await repo.findRow();
  return withDefaults(orgId, row);
}

export async function updateSettings(
  user: AuthUser,
  patch: {
    branding?: Partial<Branding>;
    terminology?: Partial<Terminology>;
    featureFlags?: Partial<FeatureFlags>;
    policyDefaults?: Partial<PolicyDefaults>;
  }
): Promise<TenantSettings> {
  const before = await getSettings(user.org_id);

  const merged = {
    branding: { ...before.branding, ...patch.branding },
    terminology: { ...before.terminology, ...patch.terminology },
    featureFlags: { ...before.featureFlags, ...patch.featureFlags },
    policyDefaults: { ...before.policyDefaults, ...patch.policyDefaults },
  };

  const [row] = await db('tenant_settings')
    .insert({
      org_id: user.org_id,
      branding: JSON.stringify(merged.branding),
      terminology: JSON.stringify(merged.terminology),
      feature_flags: JSON.stringify(merged.featureFlags),
      policy_defaults: JSON.stringify(merged.policyDefaults),
      updated_at: db.fn.now(),
      updated_by: user.sub,
    })
    .onConflict('org_id')
    .merge()
    .returning('*');

  const after = withDefaults(user.org_id, row);

  await recordAudit({
    orgId: user.org_id,
    actorUserId: user.sub,
    action: 'settings.updated',
    entityType: 'tenant_settings',
    entityId: user.org_id,
    before,
    after,
  });

  return after;
}
