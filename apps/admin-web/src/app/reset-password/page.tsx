'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { apiFetch, ApiError } from '@/lib/api-client';

export default function AdminResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <AdminResetPasswordPageInner />
    </Suspense>
  );
}

function AdminResetPasswordPageInner() {
  const searchParams = useSearchParams();

  const [token, setToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [tokenMissing, setTokenMissing] = useState(false);

  useEffect(() => {
    const t = searchParams.get('token');
    if (!t) {
      setTokenMissing(true);
    } else {
      setToken(t);
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (newPassword !== confirm) {
      setError("Au moins 8 caractères, avec lettres et chiffres");
      return;
    }
    setIsLoading(true);
    try {
      await apiFetch('/v1/auth/password-reset/confirm', {
        method: 'POST',
        body: JSON.stringify({ token, newPassword }),
      });
      setSuccess(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Une erreur est survenue');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-xl shadow-lg border border-border p-8">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold text-foreground">Nouveau mot de passe</h1>
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</div>
          )}

          {tokenMissing ? (
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-destructive/10 text-destructive text-sm">
                Lien invalide ou expiré.
              </div>
              <Link href="/forgot-password" className="block text-center text-sm text-primary hover:underline">
                Mot de passe oublié ?
              </Link>
            </div>
          ) : success ? (
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-green-50 text-green-900 text-sm">
                Mot de passe réinitialisé. Vous pouvez vous connecter.
              </div>
              <Link href="/login" className="block text-center text-sm text-primary hover:underline">
                &larr; Retour à la connexion
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="newPassword" className="block text-sm font-medium text-foreground mb-1">
                  Mot de passe
                </label>
                <input
                  id="newPassword"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                  className="w-full px-3 py-2 border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                  required
                />
                <p className="mt-1 text-xs text-muted-foreground">Au moins 8 caractères, avec lettres et chiffres</p>
              </div>
              <div>
                <label htmlFor="confirm" className="block text-sm font-medium text-foreground mb-1">
                  Confirmer le mot de passe
                </label>
                <input
                  id="confirm"
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password"
                  className="w-full px-3 py-2 border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                  required
                />
              </div>
              <button
                type="submit"
                disabled={isLoading || !newPassword || !confirm}
                className="w-full py-2.5 px-4 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {isLoading ? '...' : 'Réinitialiser le mot de passe'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
