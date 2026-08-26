import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import { getTenantSettings } from '../api/tenantSettings';
import { applyBranding } from '../lib/applyBranding';
import { useAuth } from './AuthContext';
import type { TenantSettings } from '../types';

interface TenantSettingsContextValue {
  settings: TenantSettings | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

const TenantSettingsContext = createContext<TenantSettingsContextValue | undefined>(undefined);

/**
 * Loads once per session and stays available everywhere via useTenantSettings()
 * — this is what every screen reads instead of hardcoding "Hostel", "Warden",
 * or a feature's on/off state. See backend/src/app/settings for the shape
 * and the rationale.
 */
export function TenantSettingsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [settings, setSettings] = useState<TenantSettings | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!user) {
      setSettings(null);
      return;
    }
    setLoading(true);
    try {
      const result = await getTenantSettings();
      setSettings(result);
      applyBranding(result.branding.primaryColor);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <TenantSettingsContext.Provider value={{ settings, loading, refresh }}>
      {children}
    </TenantSettingsContext.Provider>
  );
}

export function useTenantSettings(): TenantSettingsContextValue {
  const ctx = useContext(TenantSettingsContext);
  if (!ctx) throw new Error('useTenantSettings must be used within TenantSettingsProvider');
  return ctx;
}

/** Convenience hook for the common case of reading one terminology label
 * with a sane fallback while settings are still loading. */
export function useLabel(key: keyof TenantSettings['terminology'], fallback: string): string {
  const { settings } = useTenantSettings();
  return settings?.terminology[key] ?? fallback;
}
