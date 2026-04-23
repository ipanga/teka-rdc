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

  // If the Google client ID isn't configured for this build, skip the provider —
  // the GoogleSignInButton will render nothing and the rest of the app continues.
  if (!googleClientId) {
    return <>{children}</>;
  }

  return (
    <GoogleOAuthProvider clientId={googleClientId}>{children}</GoogleOAuthProvider>
  );
}
