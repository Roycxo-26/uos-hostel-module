import { api } from './client';
import type { Branding, FeatureFlags, PolicyDefaults, TenantSettings, Terminology } from '../types';

export async function getTenantSettings() {
  const { settings } = await api.get<{ settings: TenantSettings }>('/settings');
  return settings;
}

export async function updateTenantSettings(patch: {
  branding?: Partial<Branding>;
  terminology?: Partial<Terminology>;
  featureFlags?: Partial<FeatureFlags>;
  policyDefaults?: Partial<PolicyDefaults>;
}) {
  const { settings } = await api.patch<{ settings: TenantSettings }>('/settings', patch);
  return settings;
}
