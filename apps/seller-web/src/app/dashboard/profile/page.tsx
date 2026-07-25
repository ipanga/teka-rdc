'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { apiFetch, ApiError } from '@/lib/api-client';

interface SellerProfileShape {
  businessName: string;
  phone: string;
  location: string;
  // Structured business town (Town Architecture Refactor / D4) — the seller
  // picks it from /v1/cities; `location` stays as free-text address detail.
  cityId: string | null;
  description: string | null;
  applicationStatus: 'PENDING' | 'APPROVED' | 'REJECTED';
}

interface CityOption {
  id: string;
  name: string;
  province: string;
}

interface MeResponse {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  avatar: string | null;
  sellerProfile: SellerProfileShape | null;
}

interface SessionDto {
  id: string;
  createdAt: string;
  ipAddress: string | null;
  deviceInfo: string | null;
  current: boolean;
}


export default function SellerProfilePage() {

  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<MeResponse | null>(null);

  // Personal info form state
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');

  // Business form state
  const [businessName, setBusinessName] = useState('');
  const [businessPhone, setBusinessPhone] = useState('');
  const [location, setLocation] = useState('');
  const [cityId, setCityId] = useState('');
  const [cities, setCities] = useState<CityOption[]>([]);
  const [description, setDescription] = useState('');

  // UI state
  const [savingPersonal, setSavingPersonal] = useState(false);
  const [savingBusiness, setSavingBusiness] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Password change form state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  // Notification preferences (auto-save on toggle)
  // The "Annonces" toggle drives both backend broadcast channels; the legacy
  // `smsBroadcasts` key was retired 2026-05-26 and is silently ignored.
  const [orderUpdates, setOrderUpdates] = useState(true);
  const [announcements, setAnnouncements] = useState(true);
  const [notifSaving, setNotifSaving] = useState(false);

  // Active sessions ("Appareils connectés")
  const [sessions, setSessions] = useState<SessionDto[] | null>(null);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionAction, setSessionAction] = useState<string | null>(null);

  const loadMe = useCallback(async () => {
    try {
      const res = await apiFetch<MeResponse>('/v1/auth/me');
      const me = res.data;
      setUser(me);
      setFirstName(me.firstName ?? '');
      setLastName(me.lastName ?? '');
      setEmail(me.email ?? '');
      if (me.sellerProfile) {
        setBusinessName(me.sellerProfile.businessName);
        setBusinessPhone(me.sellerProfile.phone);
        setLocation(me.sellerProfile.location);
        setCityId(me.sellerProfile.cityId ?? '');
        setDescription(me.sellerProfile.description ?? '');
      }
    } catch {
      // apiFetch surfaces auth errors via the global pattern
    } finally {
      setLoading(false);
    }
  }, []);

  const loadNotificationPrefs = useCallback(async () => {
    try {
      const res = await apiFetch<{
        smsOrderUpdates: boolean;
        pushBroadcasts: boolean;
        emailBroadcasts: boolean;
      }>('/v1/users/notification-prefs');
      setOrderUpdates(res.data.smsOrderUpdates);
      setAnnouncements(res.data.pushBroadcasts || res.data.emailBroadcasts);
    } catch {
      // Defaults stay all-on; surfaced as the optimistic state
    }
  }, []);

  const loadCities = useCallback(async () => {
    try {
      const res = await apiFetch<CityOption[]>('/v1/cities');
      setCities(res.data);
    } catch {
      // Non-fatal: the town picker just stays empty.
    }
  }, []);

  const loadSessions = useCallback(async () => {
    setSessionsLoading(true);
    try {
      const res = await apiFetch<SessionDto[]>('/v1/users/sessions');
      setSessions(res.data);
    } catch {
      setSessions([]);
      showFeedback('error', "Impossible de charger la liste des appareils");
    } finally {
      setSessionsLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadMe();
    loadNotificationPrefs();
    loadSessions();
    loadCities();
  }, [loadMe, loadNotificationPrefs, loadSessions, loadCities]);

  const revokeSession = async (id: string) => {
    setSessionAction(id);
    try {
      await apiFetch(`/v1/users/sessions/${id}`, { method: 'DELETE' });
      setSessions((prev) => prev?.filter((s) => s.id !== id) ?? null);
      showFeedback('success', "Appareil déconnecté");
    } catch {
      showFeedback('error', "Impossible de déconnecter cet appareil");
    } finally {
      setSessionAction(null);
    }
  };

  const revokeAllOtherSessions = async () => {
    setSessionAction('all');
    try {
      const res = await apiFetch<{ revoked: number }>('/v1/users/sessions', { method: 'DELETE' });
      setSessions((prev) => prev?.filter((s) => s.current) ?? null);
      showFeedback('success', res.data.revoked === 0 ? 'Aucun autre appareil' : res.data.revoked === 1 ? '1 appareil déconnecté' : `${res.data.revoked} appareils déconnectés`);
    } catch {
      showFeedback('error', "Impossible de déconnecter cet appareil");
    } finally {
      setSessionAction(null);
    }
  };

  const updateNotifPref = async (key: 'orderUpdates' | 'announcements', value: boolean) => {
    // Optimistic update — flip the toggle immediately, revert on failure.
    if (key === 'orderUpdates') setOrderUpdates(value);
    else setAnnouncements(value);
    setNotifSaving(true);
    // The single "Annonces" toggle controls both broadcast channels.
    const body =
      key === 'orderUpdates'
        ? { smsOrderUpdates: value }
        : { pushBroadcasts: value, emailBroadcasts: value };
    try {
      await apiFetch('/v1/users/notification-prefs', {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      showFeedback('success', "Préférences enregistrées");
    } catch {
      if (key === 'orderUpdates') setOrderUpdates(!value);
      else setAnnouncements(!value);
      showFeedback('error', "Erreur lors de la mise à jour");
    } finally {
      setNotifSaving(false);
    }
  };

  const showFeedback = (type: 'success' | 'error', msg: string) => {
    setFeedback({ type, msg });
    setTimeout(() => setFeedback(null), 3500);
  };

  const handleAvatarPick = () => fileInputRef.current?.click();

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file
    if (!file) return;
    setUploading(true);
    try {
      // Through apiFetch (FormData-aware) so it carries the X-Teka-Surface
      // header (required for per-surface cookie auth) and auto-refreshes an
      // expired access token mid-upload.
      const fd = new FormData();
      fd.append('image', file);
      const json = await apiFetch<{ avatar: string }>('/v1/users/avatar', {
        method: 'POST',
        body: fd,
      });
      setUser((u) => (u ? { ...u, avatar: json.data.avatar } : u));
      showFeedback('success', "Profil mis à jour");
    } catch {
      showFeedback('error', "Erreur lors de l'envoi de la photo");
    } finally {
      setUploading(false);
    }
  };

  const savePersonal = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingPersonal(true);
    try {
      const body: Record<string, unknown> = {};
      if (firstName !== (user?.firstName ?? '')) body.firstName = firstName.trim();
      if (lastName !== (user?.lastName ?? '')) body.lastName = lastName.trim();
      if (email !== (user?.email ?? '')) body.email = email.trim();
      if (Object.keys(body).length === 0) {
        setSavingPersonal(false);
        return;
      }
      await apiFetch('/v1/users/profile', {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      showFeedback('success', "Profil mis à jour");
      loadMe();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Erreur lors de l'enregistrement";
      showFeedback('error', msg);
    } finally {
      setSavingPersonal(false);
    }
  };

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      showFeedback('error', "Les deux mots de passe ne correspondent pas");
      return;
    }
    setChangingPassword(true);
    try {
      await apiFetch('/v1/auth/password/change', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      showFeedback('success', "Mot de passe modifié avec succès. Les autres appareils ont été déconnectés.");
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Erreur lors de la modification du mot de passe";
      showFeedback('error', msg);
    } finally {
      setChangingPassword(false);
    }
  };

  const saveBusiness = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingBusiness(true);
    try {
      const original = user?.sellerProfile;
      const body: Record<string, unknown> = {};
      if (businessName !== (original?.businessName ?? '')) body.businessName = businessName.trim();
      if (businessPhone !== (original?.phone ?? '')) body.phone = businessPhone.trim();
      if (location !== (original?.location ?? '')) body.location = location.trim();
      if (cityId !== (original?.cityId ?? '')) body.cityId = cityId;
      if (description !== (original?.description ?? '')) body.description = description.trim();
      if (Object.keys(body).length === 0) {
        setSavingBusiness(false);
        return;
      }
      await apiFetch('/v1/sellers/profile', {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      showFeedback('success', "Profil mis à jour");
      loadMe();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Erreur lors de l'enregistrement";
      showFeedback('error', msg);
    } finally {
      setSavingBusiness(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8">
        <div className="h-8 w-48 bg-muted rounded animate-pulse mb-4" />
        <div className="h-64 bg-muted rounded animate-pulse" />
      </div>
    );
  }

  const appStatus = user?.sellerProfile?.applicationStatus;
  const businessEditable = appStatus === 'APPROVED';
  const initials = ((user?.firstName?.[0] ?? '') + (user?.lastName?.[0] ?? '')).toUpperCase() || '?';

  return (
    <div className="p-8 max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">{"Mon profil"}</h1>
        <p className="text-sm text-muted-foreground mt-1">{"Gérez vos informations personnelles et celles de votre boutique"}</p>
      </div>

      {feedback && (
        <div className={`mb-4 px-4 py-3 rounded-lg text-sm font-medium ${
          feedback.type === 'success' ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'
        }`}>
          {feedback.msg}
        </div>
      )}

      {/* Avatar */}
      <section className="mb-6 bg-white rounded-xl border border-border p-6">
        <h2 className="text-base font-semibold text-foreground mb-4">{"Photo de profil"}</h2>
        <div className="flex items-center gap-5">
          {user?.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={user.avatar}
              alt="avatar"
              className="w-20 h-20 rounded-full object-cover bg-muted"
            />
          ) : (
            <div className="w-20 h-20 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-2xl font-semibold">
              {initials}
            </div>
          )}
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarChange}
            />
            <button
              onClick={handleAvatarPick}
              disabled={uploading}
              className="px-4 py-2 text-sm font-medium rounded-lg border border-border bg-background hover:bg-muted transition-colors disabled:opacity-50"
            >
              {uploading ? "Envoi en cours..." : "Changer la photo"}
            </button>
          </div>
        </div>
      </section>

      {/* Personal */}
      <section className="mb-6 bg-white rounded-xl border border-border p-6">
        <h2 className="text-base font-semibold text-foreground mb-4">{"Informations personnelles"}</h2>
        <form onSubmit={savePersonal} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">{"Prénom"}</label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">{"Nom"}</label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">{"Email"}</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <p className="text-xs text-muted-foreground mt-1">{"Modifier votre email vous demandera de le re-vérifier."}</p>
          </div>
          <button
            type="submit"
            disabled={savingPersonal}
            className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {savingPersonal ? "Enregistrement..." : "Enregistrer"}
          </button>
        </form>
      </section>

      {/* Business */}
      <section className="bg-white rounded-xl border border-border p-6">
        <h2 className="text-base font-semibold text-foreground mb-4">{"Informations de la boutique"}</h2>

        {appStatus === 'PENDING' && (
          <div className="mb-4 px-4 py-3 rounded-lg bg-warning/10 text-warning text-sm">
            {"Votre demande d'inscription est en cours de révision. Vous pourrez modifier les informations de la boutique une fois la demande approuvée."}
          </div>
        )}
        {appStatus === 'REJECTED' && (
          <div className="mb-4 px-4 py-3 rounded-lg bg-destructive/10 text-destructive text-sm">
            {"Votre demande a été rejetée. Contactez le support pour en savoir plus."}
          </div>
        )}

        <form onSubmit={saveBusiness} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">{"Nom de la boutique"}</label>
            <input
              type="text"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              disabled={!businessEditable}
              className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60 disabled:cursor-not-allowed"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">{"Téléphone (livraison)"}</label>
              <input
                type="tel"
                value={businessPhone}
                onChange={(e) => setBusinessPhone(e.target.value)}
                disabled={!businessEditable}
                className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60 disabled:cursor-not-allowed"
              />
              <p className="text-xs text-muted-foreground mt-1">{"Utilisé pour la communication avec les livreurs."}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">{"Ville"}</label>
              <select
                value={cityId}
                onChange={(e) => setCityId(e.target.value)}
                disabled={!businessEditable}
                className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <option value="">{"Sélectionnez votre ville"}</option>
                {cities.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} — {c.province}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">{"Adresse / quartier"}</label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              disabled={!businessEditable}
              placeholder={"Ex. : Avenue Lumumba, quartier Golf"}
              className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60 disabled:cursor-not-allowed"
            />
            <p className="text-xs text-muted-foreground mt-1">{"Détail de l'adresse (rue, quartier) en complément de la ville."}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">{"Description"}</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={!businessEditable}
              rows={4}
              placeholder={"Décrivez votre boutique en quelques phrases…"}
              className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60 disabled:cursor-not-allowed resize-none"
            />
          </div>
          <button
            type="submit"
            disabled={!businessEditable || savingBusiness}
            className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {savingBusiness ? "Enregistrement..." : "Enregistrer"}
          </button>
        </form>
      </section>

      {/* Password change */}
      <section className="mt-6 bg-white rounded-xl border border-border p-6">
        <h2 className="text-base font-semibold text-foreground mb-2">{"Mot de passe"}</h2>
        <p className="text-sm text-muted-foreground mb-4">{"Modifier votre mot de passe vous déconnectera de tous vos autres appareils."}</p>
        <form onSubmit={changePassword} className="space-y-4 max-w-md">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">{"Mot de passe actuel"}</label>
            <input
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">{"Nouveau mot de passe"}</label>
            <input
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={8}
              className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <p className="text-xs text-muted-foreground mt-1">{"Au moins 8 caractères, avec lettres et chiffres."}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">{"Confirmer le nouveau mot de passe"}</label>
            <input
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
              className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <button
            type="submit"
            disabled={
              changingPassword ||
              !currentPassword ||
              newPassword.length < 8 ||
              !confirmPassword
            }
            className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {changingPassword ? "Enregistrement..." : "Modifier le mot de passe"}
          </button>
        </form>
      </section>

      {/* Notifications */}
      <section className="mt-6 bg-white rounded-xl border border-border p-6">
        <h2 className="text-base font-semibold text-foreground mb-2">{"Notifications"}</h2>
        <p className="text-sm text-muted-foreground mb-4">{"Choisissez les notifications que vous voulez recevoir. Les codes de vérification et emails de sécurité sont toujours envoyés."}</p>
        <div className="space-y-3">
          <NotifToggle
            label={"Mises à jour de commande"}
            description={"Confirmation, préparation, livraison, annulation"}
            checked={orderUpdates}
            disabled={notifSaving}
            onChange={(v) => updateNotifPref('orderUpdates', v)}
          />
          <NotifToggle
            label={"Annonces et promotions"}
            description={"Messages marketing envoyés par l'équipe Teka"}
            checked={announcements}
            disabled={notifSaving}
            onChange={(v) => updateNotifPref('announcements', v)}
          />
        </div>
      </section>

      {/* Sessions */}
      <section className="mt-6 bg-white rounded-xl border border-border p-6">
        <div className="flex items-start justify-between gap-4 mb-2">
          <div>
            <h2 className="text-base font-semibold text-foreground">{"Appareils connectés"}</h2>
            <p className="text-sm text-muted-foreground mt-1">{"Liste des appareils actuellement connectés à votre compte. Révoquez ceux que vous ne reconnaissez pas."}</p>
          </div>
          {sessions && sessions.some((s) => !s.current) && (
            <button
              type="button"
              onClick={revokeAllOtherSessions}
              disabled={sessionAction !== null}
              className="shrink-0 text-xs font-medium text-destructive hover:underline disabled:opacity-50"
            >
              {sessionAction === 'all' ? "Déconnexion..." : "Déconnecter les autres appareils"}
            </button>
          )}
        </div>
        {sessionsLoading && !sessions ? (
          <div className="space-y-2 mt-3">
            <div className="h-14 bg-muted rounded animate-pulse" />
            <div className="h-14 bg-muted rounded animate-pulse" />
          </div>
        ) : sessions && sessions.length > 0 ? (
          <ul className="divide-y divide-border mt-3">
            {sessions.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-foreground flex items-center gap-2">
                    {s.ipAddress ? `IP ${s.ipAddress}` : "IP inconnue"}
                    {s.current && (
                      <span className="inline-block px-2 py-0.5 text-[10px] font-medium rounded-full bg-primary/10 text-primary">
                        {"Cet appareil"}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {`Connecté le ${new Date(s.createdAt).toLocaleString('fr-FR', {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    })}`}
                  </div>
                </div>
                {!s.current && (
                  <button
                    type="button"
                    onClick={() => revokeSession(s.id)}
                    disabled={sessionAction !== null}
                    className="shrink-0 text-xs font-medium text-destructive hover:underline disabled:opacity-50"
                  >
                    {sessionAction === s.id ? "Déconnexion..." : "Déconnecter"}
                  </button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground mt-3">{"Aucun autre appareil connecté"}</p>
        )}
      </section>
    </div>
  );
}

function NotifToggle({
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start justify-between gap-4 py-2 cursor-pointer">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-foreground">{label}</div>
        <div className="text-xs text-muted-foreground mt-0.5">{description}</div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
          checked ? 'bg-primary' : 'bg-muted'
        }`}
      >
        <span
          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform ${
            checked ? 'translate-x-5' : 'translate-x-0.5'
          }`}
        />
      </button>
    </label>
  );
}
