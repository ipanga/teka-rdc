'use client';

import { useEffect } from 'react';
import { useAuthStore } from '@/lib/auth-store';
import { useCityStore } from '@/lib/city-store';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const fetchUser = useAuthStore((s) => s.fetchUser);

  useEffect(() => {
    // After resolving the session, adopt the town saved on the user's profile
    // (Town Architecture Refactor) — but only when the visitor has no local
    // selection (hydrateFromProfile guards that), so the cross-device town
    // follows the user without overriding a deliberate on-device choice.
    void fetchUser().then(() => {
      const preferred = useAuthStore.getState().user?.preferredCity;
      if (preferred) useCityStore.getState().hydrateFromProfile(preferred);
    });
  }, [fetchUser]);

  return <>{children}</>;
}
