'use client';

import { GoogleLogin } from '@react-oauth/google';
import { useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api-client';
import { useAuthStore, type User } from '@/lib/auth-store';
import { useRouter } from '@/i18n/navigation';

interface GoogleSignInButtonProps {
  /** Where to send the user after a successful sign-in. Defaults to the homepage. */
  redirectTo?: string;
  /** Optional hook for surfacing errors to the parent form. */
  onError?: (message: string) => void;
}

/**
 * Client-only Google Sign-In button.
 *
 * The button is rendered by Google's own widget (via @react-oauth/google) inside
 * the <GoogleOAuthProvider> that wraps the locale layout. On success we POST the
 * returned id_token to /v1/auth/login/google — the backend verifies the audience,
 * upserts/links the user, and issues httpOnly cookies.
 */
export function GoogleSignInButton({ redirectTo = '/', onError }: GoogleSignInButtonProps) {
  const router = useRouter();
  const setUser = useAuthStore((s) => s.setUser);
  const [loading, setLoading] = useState(false);
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

  if (!clientId) {
    // Google client id not configured for this build — hide the button silently.
    return null;
  }

  const handleCredential = async (credential: string) => {
    setLoading(true);
    try {
      const res = await apiFetch<{ user: User }>('/v1/auth/login/google', {
        method: 'POST',
        body: JSON.stringify({ idToken: credential }),
      });
      setUser(res.data.user);
      router.push(redirectTo);
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : 'Connexion Google impossible.';
      onError?.(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={loading ? 'opacity-60 pointer-events-none' : ''}>
      <GoogleLogin
        onSuccess={(cred) => {
          if (cred.credential) {
            void handleCredential(cred.credential);
          }
        }}
        onError={() => onError?.('Connexion Google annulée ou impossible.')}
        useOneTap={false}
        width="320"
        text="continue_with"
      />
    </div>
  );
}
