'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { normalizeDrcPhone } from '@teka/shared';
import { apiFetch, ApiError } from '@/lib/api-client';
import { communeHint, communeRequired, retainedCommuneId } from '@/lib/commune-rules';
import { compressImageForUpload } from '@/lib/image-compress';
import { useAuthStore } from '@/lib/auth-store';


interface City {
  id: string;
  name: string;
  province: string;
}

interface Commune {
  id: string;
  name: string;
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
  communeId?: string | null;
  idDocumentCloudinaryId?: string | null;
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
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const isLoadingUser = useAuthStore((s) => s.isLoading);

  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<ApplicationState | null>(null);
  const [cities, setCities] = useState<City[]>([]);
  const [communes, setCommunes] = useState<Commune[]>([]);
  // True once the commune library of the selected city has been fetched, so
  // the form knows whether a commune is required (non-empty library) or the
  // city has no authoritative communes yet (D2/D4 — city alone is accepted).
  const [communesLoaded, setCommunesLoaded] = useState(false);
  const [communesLoading, setCommunesLoading] = useState(false);
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
  const [communeId, setCommuneId] = useState('');
  const [description, setDescription] = useState('');

  // KYC document (Phase 2): the uploaded ID/RCCM photo's Cloudinary public_id.
  const [idDocumentCloudinaryId, setIdDocumentCloudinaryId] = useState('');
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [docError, setDocError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDocumentChange = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setDocError('');
    setUploadingDoc(true);
    try {
      const compressed = await compressImageForUpload(file);
      const formData = new FormData();
      formData.append('document', compressed);
      // Through apiFetch (FormData-aware) so it carries the X-Teka-Surface
      // header (required for per-surface cookie auth) and auto-refreshes an
      // expired access token mid-upload.
      const json = await apiFetch<{ cloudinaryId: string }>(
        '/v1/sellers/documents',
        { method: 'POST', body: formData },
      );
      setIdDocumentCloudinaryId(json.data.cloudinaryId);
    } catch (err) {
      setDocError(err instanceof ApiError ? err.message : "Échec du téléchargement du document. Réessayez.");
    } finally {
      setUploadingDoc(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Load the communes for the selected city (the Commune dropdown depends on
  // the chosen Ville). communeId is reset by the city onChange, not here, so a
  // REJECTED-application prefill keeps its saved commune.
  useEffect(() => {
    if (!cityId) {
      setCommunes([]);
      setCommunesLoaded(false);
      setCommunesLoading(false);
      return;
    }
    let cancelled = false;
    setCommunesLoaded(false);
    setCommunesLoading(true);
    apiFetch<Commune[]>(`/v1/cities/${cityId}/communes`)
      .then((res) => {
        if (cancelled) return;
        setCommunes(res.data);
        setCommunesLoaded(true);
        // A prefilled (REJECTED) commune survives only if it still belongs
        // to the library; anything else is cleared, never submitted stale.
        setCommuneId((current) => retainedCommuneId(current, res.data.map((c) => c.id)));
      })
      .catch(() => {
        if (!cancelled) setCommunes([]);
      })
      .finally(() => {
        if (!cancelled) setCommunesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [cityId]);

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
          setCommuneId(app.communeId ?? '');
          setIdDocumentCloudinaryId(app.idDocumentCloudinaryId ?? '');
          setDescription(app.description ?? '');
        }
        setStatus(app);
      } catch {
        if (!cancelled) setError("Impossible de charger votre demande. Réessayez.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isLoadingUser, user, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const normalizedPhone = normalizeDrcPhone(phone);
    if (!normalizedPhone) {
      setError("Numéro de téléphone invalide. Entrez un numéro congolais valide.");
      return;
    }

    if (!cityId) {
      setError("Veuillez sélectionner une ville.");
      return;
    }
    if (communesLoading || !communesLoaded) {
      setError("Les communes de cette ville n’ont pas pu être chargées. Réessayez.");
      return;
    }
    // A commune is required whenever the city has a commune library; a city
    // without one yet (D2) is accepted alone — the API enforces the same rule.
    if (communeRequired({ loaded: communesLoaded, communeCount: communes.length }) && !communeId) {
      setError("Veuillez sélectionner votre commune.");
      return;
    }

    if (!idDocumentCloudinaryId) {
      setError("Veuillez téléverser votre pièce d’identité.");
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
          cityId,
          ...(communeId ? { communeId } : {}),
          idDocumentCloudinaryId,
          ...(description ? { description } : {}),
        }),
      });
      // Reflect the new PENDING state without a full reload.
      setStatus({ hasApplication: true, applicationStatus: 'PENDING' });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Impossible de soumettre votre demande. Réessayez.");
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoadingUser || loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">{"Chargement..."}</div>
      </div>
    );
  }

  // PENDING — under review, nothing to edit.
  if (status?.applicationStatus === 'PENDING') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="w-full max-w-md bg-white rounded-xl shadow-lg border border-border p-8 text-center">
          <h1 className="text-xl font-bold text-foreground">
            {"Demande en cours d’examen"}
          </h1>
          <p className="mt-3 text-muted-foreground text-sm">{"Votre demande de compte vendeur a été reçue. Notre équipe l’examine et vous serez notifié dès qu’une décision est prise."}</p>
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
            <h1 className="text-2xl font-bold text-foreground">{"Devenir vendeur"}</h1>
            <p className="text-muted-foreground mt-2">{"Renseignez les informations de votre activité pour soumettre votre demande."}</p>
          </div>

          {isRejected && (
            <div className="mb-4 p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-sm">
              <p className="font-medium text-destructive">{"Demande refusée"}</p>
              {status?.rejectionReason && (
                <p className="mt-1 text-foreground">{status.rejectionReason}</p>
              )}
              <p className="mt-1 text-muted-foreground text-xs">
                {"Corrigez les informations ci-dessous et soumettez à nouveau votre demande."}
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
                {"Nom de l’entreprise / boutique"}
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
                {"Type d’activité"}
              </label>
              <select
                id="businessType"
                value={businessType}
                onChange={(e) => setBusinessType(e.target.value)}
                className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="individual">{"Particulier"}</option>
                <option value="company">{"Entreprise"}</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="idType"
                  className="block text-sm font-medium text-foreground mb-1"
                >
                  {"Type de pièce"}
                </label>
                <select
                  id="idType"
                  value={idType}
                  onChange={(e) => setIdType(e.target.value)}
                  className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="national_id">{"Carte d’identité nationale"}</option>
                  <option value="passport">{"Passeport"}</option>
                  <option value="rccm">{"RCCM"}</option>
                </select>
              </div>
              <div>
                <label
                  htmlFor="idNumber"
                  className="block text-sm font-medium text-foreground mb-1"
                >
                  {"Numéro de pièce"}
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

            {/* KYC document upload */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                {"Pièce d’identité (CNI / passeport / RCCM)"}
              </label>
              <p className="text-xs text-muted-foreground mb-2">
                {"Photo lisible de votre pièce. JPEG, PNG ou WebP, 5 Mo max."}
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleDocumentChange}
                disabled={uploadingDoc}
                className="block w-full text-sm text-foreground file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-primary file:text-primary-foreground file:font-medium hover:file:bg-primary/90 file:cursor-pointer disabled:opacity-50"
              />
              {uploadingDoc && (
                <p className="mt-2 text-sm text-muted-foreground">
                  {"Téléchargement du document..."}
                </p>
              )}
              {!uploadingDoc && idDocumentCloudinaryId && (
                <p className="mt-2 text-sm text-green-700">
                  {"Document téléchargé ✓"}
                </p>
              )}
              {docError && (
                <p className="mt-2 text-sm text-destructive">{docError}</p>
              )}
            </div>

            <div>
              <label
                htmlFor="phone"
                className="block text-sm font-medium text-foreground mb-1"
              >
                {"Numéro de téléphone"}
              </label>
              <input
                id="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder={"Ex : 0812345678"}
                className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                required
              />
            </div>

            <div>
              <label
                htmlFor="cityId"
                className="block text-sm font-medium text-foreground mb-1"
              >
                {"Ville"}
              </label>
              <select
                id="cityId"
                value={cityId}
                onChange={(e) => {
                  // Changing the city invalidates the chosen commune.
                  setCityId(e.target.value);
                  setCommuneId('');
                }}
                className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                required
              >
                <option value="">{"Sélectionnez une ville"}</option>
                {cities.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.province})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="communeId"
                className="block text-sm font-medium text-foreground mb-1"
              >
                {communeRequired({ loaded: communesLoaded, communeCount: communes.length }) ? "Commune *" : "Commune"}
              </label>
              <select
                id="communeId"
                value={communes.some((c) => c.id === communeId) ? communeId : ''}
                onChange={(e) => setCommuneId(e.target.value)}
                disabled={!cityId || communesLoading || communes.length === 0}
                aria-describedby="communeHelp"
                className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 disabled:cursor-not-allowed"
                required={communeRequired({ loaded: communesLoaded, communeCount: communes.length })}
              >
                <option value="">
                  {communeHint(Boolean(cityId), { loaded: communesLoaded, loading: communesLoading, communeCount: communes.length })}
                </option>
                {communes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              {communesLoaded && communes.length === 0 && (
                <p id="communeHelp" className="text-xs text-muted-foreground mt-1">
                  {"Aucune commune enregistrée pour cette ville pour le moment. Précisez votre quartier ci-dessous."}
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="location"
                className="block text-sm font-medium text-foreground mb-1"
              >
                {"Adresse / quartier"}
              </label>
              <input
                id="location"
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder={"Ex : Lubumbashi, Katuba"}
                className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                required
              />
            </div>

            <div>
              <label
                htmlFor="description"
                className="block text-sm font-medium text-foreground mb-1"
              >
                {"Description de votre activité (facultatif)"}
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
              disabled={submitting || uploadingDoc}
              className="w-full py-2.5 px-4 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? '...' : "Soumettre ma demande"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
