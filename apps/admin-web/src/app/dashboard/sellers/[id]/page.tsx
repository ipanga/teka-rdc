'use client';

import { useEffect, useState, useCallback, type ReactNode } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '@/lib/api-client';

interface SellerProfile {
  businessName: string;
  businessType?: string | null;
  phone?: string | null;
  location?: string | null;
  description?: string | null;
  applicationStatus?: string | null;
  avgRating?: number;
  totalReviews?: number;
  city?: { id: string; name: string } | null;
  commune?: { id: string; name: string } | null;
}

interface SellerUser {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  role: string;
  status: string;
  createdAt?: string;
  sellerProfile?: SellerProfile | null;
}

const USER_STATUS: Record<string, { label: string; style: string }> = {
  ACTIVE: { label: 'Actif', style: 'bg-success/10 text-success' },
  SUSPENDED: { label: 'Suspendu', style: 'bg-destructive/10 text-destructive' },
  BANNED: { label: 'Banni', style: 'bg-destructive/10 text-destructive' },
  PENDING: { label: 'En attente', style: 'bg-warning/10 text-warning' },
};

const APP_STATUS: Record<string, { label: string; style: string }> = {
  APPROVED: { label: 'Approuvé', style: 'bg-success/10 text-success' },
  PENDING: { label: 'En attente', style: 'bg-warning/10 text-warning' },
  REJECTED: { label: 'Rejeté', style: 'bg-destructive/10 text-destructive' },
};

export default function SellerDetailPage() {
  const params = useParams();
  const sellerId = params.id as string;
  const [seller, setSeller] = useState<SellerUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const fetchSeller = useCallback(async () => {
    setIsLoading(true);
    setNotFound(false);
    try {
      const res = await apiFetch<SellerUser>(`/v1/admin/users/${sellerId}`);
      setSeller(res.data);
    } catch {
      setNotFound(true);
    } finally {
      setIsLoading(false);
    }
  }, [sellerId]);

  useEffect(() => {
    fetchSeller();
  }, [fetchSeller]);

  if (isLoading) {
    return <div className="p-8"><p className="text-muted-foreground">Chargement...</p></div>;
  }

  if (notFound || !seller) {
    return (
      <div className="p-8">
        <p className="text-muted-foreground">Vendeur introuvable</p>
        <Link href="/dashboard/sellers" className="text-primary hover:underline text-sm mt-2 inline-block">
          Retour aux vendeurs
        </Link>
      </div>
    );
  }

  const sp = seller.sellerProfile;
  const fullName = `${seller.firstName ?? ''} ${seller.lastName ?? ''}`.trim() || '—';
  const userStatus = USER_STATUS[seller.status] ?? { label: seller.status, style: 'bg-secondary text-secondary-foreground' };
  const appStatus = sp?.applicationStatus ? APP_STATUS[sp.applicationStatus] : null;
  const rating = sp?.avgRating ?? 0;

  const Row = ({ label, value }: { label: string; value: ReactNode }) => (
    <div className="flex justify-between gap-4 py-2 border-b border-border last:border-0 text-sm">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="text-foreground text-right">{value || '—'}</span>
    </div>
  );

  return (
    <div className="p-8">
      <Link
        href="/dashboard/sellers"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Retour aux vendeurs
      </Link>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {sp?.businessName ?? fullName}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{seller.role === 'SELLER' ? 'Vendeur' : seller.role}</p>
        </div>
        <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${userStatus.style}`}>
          {userStatus.label}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Business */}
        <div className="bg-white rounded-xl border border-border p-5">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Boutique</h2>
          <Row label="Nom commercial" value={sp?.businessName} />
          <Row label="Type" value={sp?.businessType === 'company' ? 'Société' : sp?.businessType === 'individual' ? 'Particulier' : sp?.businessType} />
          <Row
            label="Note moyenne"
            value={
              sp && sp.totalReviews && sp.totalReviews > 0 ? (
                <span className="inline-flex items-center gap-1">
                  <span className="text-yellow-400">★</span>
                  <span className="font-medium">{rating.toFixed(1)}</span>
                  <span className="text-muted-foreground">({sp.totalReviews})</span>
                </span>
              ) : (
                'Aucun avis'
              )
            }
          />
          <Row label="Validation" value={appStatus ? <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${appStatus.style}`}>{appStatus.label}</span> : '—'} />
          {sp?.description && <Row label="Description" value={sp.description} />}
        </div>

        {/* Contact + location */}
        <div className="bg-white rounded-xl border border-border p-5">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Contact</h2>
          <Row label="Responsable" value={fullName} />
          <Row label="Email" value={seller.email ? <a href={`mailto:${seller.email}`} className="text-primary hover:underline">{seller.email}</a> : '—'} />
          <Row label="Téléphone" value={sp?.phone ?? seller.phone} />
          <Row label="Ville" value={sp?.city?.name} />
          <Row label="Commune" value={sp?.commune?.name} />
          <Row label="Localisation" value={sp?.location} />
        </div>
      </div>

    </div>
  );
}
