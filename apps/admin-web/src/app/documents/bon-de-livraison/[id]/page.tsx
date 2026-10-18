'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';
import { assetPath } from '@/lib/asset-path';
import { buildDeliveryDocument, type DocumentOrder } from '@/lib/delivery-document';
import { DeliveryDocumentView } from '@/components/orders/delivery-document';

/**
 * Protected A4 preview of the « Bon de livraison ». Read-only: one GET of the
 * ADMIN-only order detail; printing is the browser's (Imprimer → Enregistrer
 * en PDF). Nothing is written, numbered or paid by opening or printing it.
 */
export default function DeliveryNotePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const isAuthLoading = useAuthStore((s) => s.isLoading);
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  const [order, setOrder] = useState<DocumentOrder | null>(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  // Same role gate as the dashboard layout (defense in depth; the API is
  // authoritative and answers 403 to anyone but an ADMIN).
  useEffect(() => {
    if (isAuthLoading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    if (user.role !== 'ADMIN') logout().finally(() => router.replace('/login'));
  }, [isAuthLoading, user, logout, router]);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const res = await apiFetch<DocumentOrder>(`/v1/admin/orders/${id}`);
      setOrder(res.data);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Impossible de charger la commande. Vérifiez votre connexion et réessayez.',
      );
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  const isAdmin = !isAuthLoading && user?.role === 'ADMIN';
  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin, load]);

  // Generation time is fixed once per loaded order, so screen and paper agree.
  const result = useMemo(() => (order ? buildDeliveryDocument(order, new Date()) : null), [order]);

  if (!isAdmin || isLoading) {
    return <p className="bdl-status">Chargement…</p>;
  }

  if (error || !result) {
    return (
      <div className="bdl-status" role="alert">
        <p>{error || 'Commande introuvable.'}</p>
        <div className="bdl-toolbar-actions">
          <button type="button" className="admin-button-primary" onClick={load}>Réessayer</button>
          <Link href="/dashboard/orders" className="admin-button-secondary">Retour aux commandes</Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="bdl-toolbar" role="toolbar" aria-label="Actions du document">
        <Link href={`/dashboard/orders/${id}`} className="admin-button-secondary">
          ← Retour à la commande
        </Link>
        {result.printable && (
          <button type="button" className="admin-button-primary" onClick={() => window.print()}>
            Imprimer / Enregistrer en PDF
          </button>
        )}
      </div>
      <DeliveryDocumentView result={result} logoSrc={assetPath('/logo.svg')} />
    </>
  );
}
