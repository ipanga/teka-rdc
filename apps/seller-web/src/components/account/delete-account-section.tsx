'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';

interface DeletionStatus {
  pending: boolean;
  scheduledAt: string | null;
}

/**
 * Seller "Zone sensible" — deliberate multi-step account deletion (password
 * re-auth). Requires typing SUPPRIMER + the current password, then a final
 * confirmation. On success the account is scheduled for deletion (30-day grace)
 * and the seller is signed out. If a deletion is already pending, offers cancel.
 */
export function DeleteAccountSection() {
  const router = useRouter();
  const logout = useAuthStore((s) => s.logout);

  const [status, setStatus] = useState<DeletionStatus | null>(null);
  const [open, setOpen] = useState(false);
  const [confirmPhrase, setConfirmPhrase] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<DeletionStatus>('/v1/users/account/deletion')
      .then((res) => setStatus(res.data))
      .catch(() => setStatus({ pending: false, scheduledAt: null }));
  }, []);

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('fr-FR');

  async function submit() {
    if (confirmPhrase.trim().toUpperCase() !== 'SUPPRIMER') {
      setError('Veuillez saisir SUPPRIMER pour confirmer.');
      return;
    }
    if (!window.confirm('Supprimer définitivement votre compte vendeur ? Cette action est définitive après 30 jours.')) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch<DeletionStatus>('/v1/users/account/deletion', {
        method: 'POST',
        body: JSON.stringify({ confirmPhrase: 'SUPPRIMER', password }),
      });
      const when = res.data.scheduledAt ? ` le ${formatDate(res.data.scheduledAt)}` : '';
      // Server revoked our session; clear local auth + go to login.
      await logout().catch(() => {});
      window.alert(
        `Votre compte a été programmé pour suppression${when}. Reconnectez-vous avant cette date pour le réactiver.`,
      );
      router.push('/login');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Une erreur est survenue.');
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    setBusy(true);
    setError(null);
    try {
      await apiFetch('/v1/users/account/deletion', { method: 'DELETE' });
      setStatus({ pending: false, scheduledAt: null });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Une erreur est survenue.');
    } finally {
      setBusy(false);
    }
  }

  if (status?.pending) {
    return (
      <section className="mt-6 bg-white rounded-xl border border-destructive/40 p-6">
        <h2 className="text-base font-semibold text-destructive">{"Suppression programmée"}</h2>
        <p className="text-sm text-muted-foreground mt-1">
          {status.scheduledAt
            ? `Votre compte sera définitivement supprimé le ${formatDate(status.scheduledAt)}. Vous pouvez encore l'annuler.`
            : "Une suppression de compte est en cours. Vous pouvez encore l'annuler."}
        </p>
        {error && <p className="text-sm text-destructive mt-2">{error}</p>}
        <button
          type="button"
          onClick={cancel}
          disabled={busy}
          className="mt-4 rounded-lg bg-primary text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {busy ? 'Annulation...' : 'Annuler la suppression'}
        </button>
      </section>
    );
  }

  return (
    <section className="mt-6 bg-white rounded-xl border border-destructive/40 p-6">
      <h2 className="text-base font-semibold text-destructive">{"Zone sensible"}</h2>
      <p className="text-sm text-muted-foreground mt-1">
        {"La suppression de votre compte vendeur est définitive. Vos produits sont retirés de la vente. Vos commandes et écritures comptables peuvent être conservées de façon anonymisée pour nos obligations légales. Le compte est supprimé après un délai de 30 jours ; reconnectez-vous avant pour le réactiver."}
      </p>

      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-4 rounded-lg border border-destructive text-destructive px-4 py-2 text-sm font-medium hover:bg-destructive/5"
        >
          {"Supprimer mon compte"}
        </button>
      ) : (
        <div className="mt-4 space-y-3">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              {"Saisissez SUPPRIMER pour confirmer"}
            </label>
            <input
              value={confirmPhrase}
              onChange={(e) => setConfirmPhrase(e.target.value)}
              placeholder="SUPPRIMER"
              className="w-full rounded-lg border border-border px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              {"Votre mot de passe"}
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={submit}
              disabled={busy || confirmPhrase.trim().toUpperCase() !== 'SUPPRIMER' || !password}
              className="rounded-lg bg-destructive text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              {busy ? 'Suppression...' : 'Supprimer définitivement'}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={busy}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium"
            >
              {"Annuler"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
