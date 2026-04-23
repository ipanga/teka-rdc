'use client';

import { useEffect } from 'react';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { useAuthStore } from '@/lib/auth-store';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const fetchUser = useAuthStore((s) => s.fetchUser);
  const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  if (!googleClientId) {
    return <>{children}</>;
  }

  return (
    <GoogleOAuthProvider clientId={googleClientId}>{children}</GoogleOAuthProvider>
  );
}
