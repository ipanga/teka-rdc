'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { normalizeDrcPhone } from '@teka/shared';
import { apiFetch, ApiError } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';

interface City {
  id: string;
  name: string;
  province: string;
}

interface ApplicationState {
  hasApplication: boolean;
  applicationStatus?: 'PENDING' | 'APPROVED' | 'REJECTED';
  rejectionReason?: string | null;
  businessName?: string;
  businessType?: string;
  idNumber?: string;
  idType?: string;
  phone?: string;
  location?: string;
  cityId?: string | null;
  description?: string | null;
}

/**
 * Seller business application. The single UI entry point to POST
 * /v1/sellers/apply. Shown to a logged-in SELLER who has no APPROVED profile:
 *   - no application / REJECTED  → editable form (REJECTED shows the reason)
 *   - PENDING                    → "under review" state
 *   - APPROVED                   → redirect to the dashboard
 */
export default function DevenirVendeurPage() {
  const t = useTranslations('SellerApplication');
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const isLoadingUser = useAuthStore((s) => s.isLoading);

  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<ApplicationState | null>(null);
  const [cities, setCities] = useState<City[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Form fields
  const [businessName, setBusinessName] = useState('');
  const [businessType, setBusinessType] = useState('individual');
  const [idType, setIdType] = useState('national_id');
  const [idNumber, setIdNumber] = useState('');
  const [phone, setPhone] = useState('');
  const [location, setLocation] = useState('');
  const [cityId, setCityId] = useState('');
  const [description, setDescription] = useState('');

  // Redirect unauthenticated users to login once the auth state resolves.
  useEffect(() => {
    if (!isLoadingUser && !user) router.replace('/login');
  }, [isLoadingUser, user, router]);

  useEffect(() => {
    if (isLoadingUser || !user) return;
    let cancelled = false;

    (async () => {
      try {
        const [appRes, citiesRes] = await Promise.all([
          apiFetch<ApplicationState>('/v1/sellers/application'),
          apiFetch<City[]>('/v1/cities'),
        ]);
        if (cancelled) return;

        const app = appRes.data;
        setCities(citiesRes.data);

        if (app.hasApplication && app.applicationStatus === 'APPROVED') {
          router.replace('/dashboard');
          return;
        }

        // Prefill from a REJECTED application so the seller can correct it.
        if (app.hasApplication) {
          setBusinessName(app.businessName ?? '');
          setBusinessType(app.businessType ?? 'individual');
          setIdType(app.idType ?? 'national_id');
          setIdNumber(app.idNumber ?? '');
          setLocation(app.location ?? '');
          setCityId(app.cityId ?? '');
          setDescription(app.description ?? '');
        }
        setStatus(app);
      } catch {
        if (!cancelled) setError(t('loadError'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isLoadingUser, user, router, t]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const normalizedPhone = normalizeDrcPhone(phone);
    if (!normalizedPhone) {
      setError(t('invalidPhone'));
      return;
    }

    setSubmitting(true);
    try {
      await apiFetch('/v1/sellers/apply', {
        method: 'POST',
        body: JSON.stringify({
          businessName,
          businessType,
          idType,
          idNumber,
          phone: normalizedPhone,
          location,
          ...(cityId ? { cityId } : {}),
          ...(description ? { description } : {}),
        }),
      });
      // Reflect the new PENDING state without a full reload.
      setStatus({ hasApplication: true, applicationStatus: 'PENDING' });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('submitError'));
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoadingUser || loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">{t('loading')}</div>
      </div>
    );
  }

  // PENDING — under review, nothing to edit.
  if (status?.applicationStatus === 'PENDING') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="w-full max-w-md bg-white rounded-xl shadow-lg border border-border p-8 text-center">
          <h1 className="text-xl font-bold text-foreground">
            {t('pendingTitle')}
          </h1>
          <p className="mt-3 text-muted-foreground text-sm">{t('pendingBody')}</p>
        </div>
      </div>
    );
  }

  const isRejected = status?.applicationStatus === 'REJECTED';

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-lg">
        <div className="bg-white rounded-xl shadow-lg border border-border p-8">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold text-foreground">{t('title')}</h1>
            <p className="text-muted-foreground mt-2">{t('subtitle')}</p>
          </div>

          {isRejected && (
            <div className="mb-4 p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-sm">
              <p className="font-medium text-destructive">{t('rejectedTitle')}</p>
              {status?.rejectionReason && (
                <p className="mt-1 text-foreground">{status.rejectionReason}</p>
              )}
              <p className="mt-1 text-muted-foreground text-xs">
                {t('rejectedHint')}
              </p>
            </div>
          )}

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="businessName"
                className="block text-sm font-medium text-foreground mb-1"
              >
                {t('businessNameLabel')}
              </label>
              <input
                id="businessName"
                type="text"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                required
                minLength={2}
              />
            </div>

            <div>
              <label
                htmlFor="businessType"
                className="block text-sm font-medium text-foreground mb-1"
              >
                {t('businessTypeLabel')}
              </label>
              <select
                id="businessType"
                value={businessType}
                onChange={(e) => setBusinessType(e.target.value)}
                className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="individual">{t('typeIndividual')}</option>
                <option value="company">{t('typeCompany')}</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="idType"
                  className="block text-sm font-medium text-foreground mb-1"
                >
                  {t('idTypeLabel')}
                </label>
                <select
                  id="idType"
                  value={idType}
                  onChange={(e) => setIdType(e.target.value)}
                  className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="national_id">{t('idNationalId')}</option>
                  <option value="passport">{t('idPassport')}</option>
                  <option value="rccm">{t('idRccm')}</option>
                </select>
              </div>
              <div>
                <label
                  htmlFor="idNumber"
                  className="block text-sm font-medium text-foreground mb-1"
                >
                  {t('idNumberLabel')}
                </label>
                <input
                  id="idNumber"
                  type="text"
                  value={idNumber}
                  onChange={(e) => setIdNumber(e.target.value)}
                  className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  required
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="phone"
                className="block text-sm font-medium text-foreground mb-1"
              >
                {t('phoneLabel')}
              </label>
              <input
                id="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder={t('phonePlaceholder')}
                className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                required
              />
            </div>

            <div>
              <label
                htmlFor="cityId"
                className="block text-sm font-medium text-foreground mb-1"
              >
                {t('cityLabel')}
              </label>
              <select
                id="cityId"
                value={cityId}
                onChange={(e) => setCityId(e.target.value)}
                className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">{t('cityPlaceholder')}</option>
                {cities.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.province})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="location"
                className="block text-sm font-medium text-foreground mb-1"
              >
                {t('locationLabel')}
              </label>
              <input
                id="location"
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder={t('locationPlaceholder')}
                className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                required
              />
            </div>

            <div>
              <label
                htmlFor="description"
                className="block text-sm font-medium text-foreground mb-1"
              >
                {t('descriptionLabel')}
              </label>
              <textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 px-4 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? '...' : t('submit')}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
