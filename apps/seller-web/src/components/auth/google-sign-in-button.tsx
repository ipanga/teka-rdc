'use client';

import { GoogleLogin } from '@react-oauth/google';
import { useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api-client';
import { useAuthStore, type User } from '@/lib/auth-store';
import { useRouter } from '@/i18n/navigation';

interface GoogleSignInButtonProps {
  onError?: (message: string) => void;
  onWrongRole?: () => void;
}

/**
 * Google sign-in for the seller portal. Sellers must have role=SELLER — if a
 * Google account yields any other role, we log the user out immediately and
 * surface the "wrong role" UI (parent handles the messaging).
 */
export function GoogleSignInButton({ onError, onWrongRole }: GoogleSignInButtonProps) {
  const router = useRouter();
  const setUser = useAuthStore((s) => s.setUser);
  const [loading, setLoading] = useState(false);
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

  if (!clientId) return null;

  const handleCredential = async (credential: string) => {
    setLoading(true);
    try {
      const res = await apiFetch<{ user: User }>('/v1/auth/login/google', {
        method: 'POST',
        body: JSON.stringify({ idToken: credential }),
      });
      const user = res.data.user;
      if (user.role !== 'SELLER') {
        try {
          await apiFetch('/v1/auth/logout', { method: 'POST' });
        } catch {
          // ignore
        }
        onWrongRole?.();
        return;
      }
      setUser(user);
      router.push('/dashboard');
    } catch (err) {
      onError?.(err instanceof ApiError ? err.message : 'Connexion Google impossible.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={loading ? 'opacity-60 pointer-events-none' : ''}>
      <GoogleLogin
        onSuccess={(cred) => {
          if (cred.credential) void handleCredential(cred.credential);
        }}
        onError={() => onError?.('Connexion Google annulée ou impossible.')}
        useOneTap={false}
        width="320"
        text="continue_with"
      />
    </div>
  );
}
