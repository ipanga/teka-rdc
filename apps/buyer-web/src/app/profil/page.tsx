'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';

interface MeResponse {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  avatar: string | null;
  role: string;
}

interface SessionDto {
  id: string;
  createdAt: string;
  ipAddress: string | null;
  deviceInfo: string | null;
  current: boolean;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5050/api';

export default function BuyerProfilePage() {
  const t = useTranslations('Profile');
  const router = useRouter();
  const authUser = useAuthStore((s) => s.user);
  const setAuthUser = useAuthStore((s) => s.setUser);

  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<MeResponse | null>(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');

  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Notification preferences (auto-save on toggle)
  const [smsOrderUpdates, setSmsOrderUpdates] = useState(true);
  const [smsBroadcasts, setSmsBroadcasts] = useState(true);
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
    } catch {
      // Not authenticated — bounce to login
      router.push('/connexion?redirect=/profil');
    } finally {
      setLoading(false);
    }
  }, [router]);

  const loadNotificationPrefs = useCallback(async () => {
    try {
      const res = await apiFetch<{ smsOrderUpdates: boolean; smsBroadcasts: boolean }>(
        '/v1/users/notification-prefs',
      );
      setSmsOrderUpdates(res.data.smsOrderUpdates);
      setSmsBroadcasts(res.data.smsBroadcasts);
    } catch {
      // Defaults stay all-on
    }
  }, []);

  const loadSessions = useCallback(async () => {
    setSessionsLoading(true);
    try {
      const res = await apiFetch<SessionDto[]>('/v1/users/sessions');
      setSessions(res.data);
    } catch {
      setSessions([]);
      showFeedback('error', t('sessionsLoadError'));
    } finally {
      setSessionsLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadMe();
    loadNotificationPrefs();
    loadSessions();
  }, [loadMe, loadNotificationPrefs, loadSessions]);

  const revokeSession = async (id: string) => {
    setSessionAction(id);
    try {
      await apiFetch(`/v1/users/sessions/${id}`, { method: 'DELETE' });
      setSessions((prev) => prev?.filter((s) => s.id !== id) ?? null);
      showFeedback('success', t('sessionRevoked'));
    } catch {
      showFeedback('error', t('sessionRevokeError'));
    } finally {
      setSessionAction(null);
    }
  };

  const revokeAllOtherSessions = async () => {
    setSessionAction('all');
    try {
      const res = await apiFetch<{ revoked: number }>('/v1/users/sessions', { method: 'DELETE' });
      setSessions((prev) => prev?.filter((s) => s.current) ?? null);
      showFeedback('success', t('sessionRevokedAll', { count: res.data.revoked }));
    } catch {
      showFeedback('error', t('sessionRevokeError'));
    } finally {
      setSessionAction(null);
    }
  };

  const updateNotifPref = async (key: 'smsOrderUpdates' | 'smsBroadcasts', value: boolean) => {
    if (key === 'smsOrderUpdates') setSmsOrderUpdates(value);
    else setSmsBroadcasts(value);
    setNotifSaving(true);
    try {
      await apiFetch('/v1/users/notification-prefs', {
        method: 'PATCH',
        body: JSON.stringify({ [key]: value }),
      });
      showFeedback('success', t('notifSaved'));
    } catch {
      if (key === 'smsOrderUpdates') setSmsOrderUpdates(!value);
      else setSmsBroadcasts(!value);
      showFeedback('error', t('notifError'));
    } finally {
      setNotifSaving(false);
    }
  };

  // Soft client-side gate while loadMe runs. authProvider check could be
  // added later if we want to make this strictly buyer-only — for now any
  // authenticated role can land here (sellers/admins have their own pages
  // but won't be redirected away if they navigate to /profil).

  const showFeedback = (type: 'success' | 'error', msg: string) => {
    setFeedback({ type, msg });
    setTimeout(() => setFeedback(null), 3500);
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('image', file);
      const res = await fetch(`${API_BASE}/v1/users/avatar`, {
        method: 'POST',
        body: fd,
        credentials: 'include',
      });
      if (!res.ok) throw new Error('upload failed');
      const json = (await res.json()) as { success: boolean; data: { avatar: string } };
      setUser((u) => (u ? { ...u, avatar: json.data.avatar } : u));
      if (authUser) setAuthUser({ ...authUser, avatar: json.data.avatar });
      showFeedback('success', t('saveSuccess'));
    } catch {
      showFeedback('error', t('uploadError'));
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const body: Record<string, unknown> = {};
      if (firstName !== (user?.firstName ?? '')) body.firstName = firstName.trim();
      if (lastName !== (user?.lastName ?? '')) body.lastName = lastName.trim();
      if (email !== (user?.email ?? '')) body.email = email.trim();
      if (Object.keys(body).length === 0) {
        setSaving(false);
        return;
      }
      await apiFetch('/v1/users/profile', {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      showFeedback('success', t('saveSuccess'));
      loadMe();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : t('saveError');
      showFeedback('error', msg);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <div className="h-8 w-48 bg-muted rounded animate-pulse mb-4" />
        <div className="h-64 bg-muted rounded animate-pulse" />
      </div>
    );
  }

  const initials = ((user?.firstName?.[0] ?? '') + (user?.lastName?.[0] ?? '')).toUpperCase() || '?';

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">{t('title')}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t('subtitle')}</p>
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
        <h2 className="text-base font-semibold text-foreground mb-4">{t('sectionAvatar')}</h2>
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
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="px-4 py-2 text-sm font-medium rounded-lg border border-border bg-background hover:bg-muted transition-colors disabled:opacity-50"
            >
              {uploading ? t('uploading') : t('uploadAvatar')}
            </button>
          </div>
        </div>
      </section>

      {/* Personal */}
      <section className="mb-6 bg-white rounded-xl border border-border p-6">
        <h2 className="text-base font-semibold text-foreground mb-4">{t('sectionPersonal')}</h2>
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">{t('firstName')}</label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">{t('lastName')}</label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">{t('email')}</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <p className="text-xs text-muted-foreground mt-1">{t('emailHint')}</p>
          </div>
          {/* Phone is the WhatsApp OTP auth identifier — not editable from the
              app. Surfaced as read-only with an explanatory hint. */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">{t('phone')}</label>
            <input
              type="tel"
              value={user?.phone ?? ''}
              disabled
              className="w-full px-3 py-2 border border-input rounded-lg bg-muted text-muted-foreground cursor-not-allowed"
            />
            <p className="text-xs text-muted-foreground mt-1">{t('phoneHint')}</p>
          </div>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {saving ? t('saving') : t('save')}
          </button>
        </form>
      </section>

      {/* Notifications */}
      <section className="mb-6 bg-white rounded-xl border border-border p-6">
        <h2 className="text-base font-semibold text-foreground mb-2">{t('sectionNotifications')}</h2>
        <p className="text-sm text-muted-foreground mb-4">{t('notificationsHint')}</p>
        <div className="space-y-3">
          <NotifToggle
            label={t('notifOrderUpdates')}
            description={t('notifOrderUpdatesDesc')}
            checked={smsOrderUpdates}
            disabled={notifSaving}
            onChange={(v) => updateNotifPref('smsOrderUpdates', v)}
          />
          <NotifToggle
            label={t('notifBroadcasts')}
            description={t('notifBroadcastsDesc')}
            checked={smsBroadcasts}
            disabled={notifSaving}
            onChange={(v) => updateNotifPref('smsBroadcasts', v)}
          />
        </div>
      </section>

      {/* Sessions */}
      <section className="mb-6 bg-white rounded-xl border border-border p-6">
        <div className="flex items-start justify-between gap-4 mb-2">
          <div>
            <h2 className="text-base font-semibold text-foreground">{t('sectionSessions')}</h2>
            <p className="text-sm text-muted-foreground mt-1">{t('sessionsHint')}</p>
          </div>
          {sessions && sessions.some((s) => !s.current) && (
            <button
              type="button"
              onClick={revokeAllOtherSessions}
              disabled={sessionAction !== null}
              className="shrink-0 text-xs font-medium text-destructive hover:underline disabled:opacity-50"
            >
              {sessionAction === 'all' ? t('sessionRevoking') : t('sessionRevokeAll')}
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
                    {s.ipAddress ? t('sessionIp', { ip: s.ipAddress }) : t('sessionIpUnknown')}
                    {s.current && (
                      <span className="inline-block px-2 py-0.5 text-[10px] font-medium rounded-full bg-primary/10 text-primary">
                        {t('sessionCurrent')}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {t('sessionConnectedOn', {
                      date: new Date(s.createdAt).toLocaleString('fr-FR', {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      }),
                    })}
                  </div>
                </div>
                {!s.current && (
                  <button
                    type="button"
                    onClick={() => revokeSession(s.id)}
                    disabled={sessionAction !== null}
                    className="shrink-0 text-xs font-medium text-destructive hover:underline disabled:opacity-50"
                  >
                    {sessionAction === s.id ? t('sessionRevoking') : t('sessionRevoke')}
                  </button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground mt-3">{t('sessionsEmpty')}</p>
        )}
      </section>

      {/* Quick links */}
      <section className="bg-white rounded-xl border border-border p-6">
        <div className="flex flex-col gap-3">
          <Link
            href="/commandes"
            className="text-sm font-medium text-primary hover:underline"
          >
            {t('viewOrders')}
          </Link>
          <Link
            href="/favoris"
            className="text-sm font-medium text-primary hover:underline"
          >
            {t('viewWishlist')}
          </Link>
        </div>
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
