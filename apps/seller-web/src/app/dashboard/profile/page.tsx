'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { apiFetch, ApiError } from '@/lib/api-client';

interface SellerProfileShape {
  businessName: string;
  phone: string;
  location: string;
  description: string | null;
  applicationStatus: 'PENDING' | 'APPROVED' | 'REJECTED';
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

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'https://api.teka.cd/api';

export default function SellerProfilePage() {
  const t = useTranslations('Profile');

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
        setDescription(me.sellerProfile.description ?? '');
      }
    } catch {
      // apiFetch surfaces auth errors via the global pattern
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadMe(); }, [loadMe]);

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
      // apiFetch sets Content-Type: application/json by default — for
      // multipart uploads we use raw fetch + credentials so the cookie auth
      // still travels.
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
      showFeedback('success', t('saveSuccess'));
    } catch {
      showFeedback('error', t('uploadError'));
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
      showFeedback('success', t('saveSuccess'));
      loadMe();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : t('saveError');
      showFeedback('error', msg);
    } finally {
      setSavingPersonal(false);
    }
  };

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      showFeedback('error', t('passwordMismatch'));
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
      showFeedback('success', t('passwordChangeSuccess'));
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : t('passwordChangeError');
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
      if (description !== (original?.description ?? '')) body.description = description.trim();
      if (Object.keys(body).length === 0) {
        setSavingBusiness(false);
        return;
      }
      await apiFetch('/v1/sellers/profile', {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      showFeedback('success', t('saveSuccess'));
      loadMe();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : t('saveError');
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
              onClick={handleAvatarPick}
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
        <form onSubmit={savePersonal} className="space-y-4">
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
          <button
            type="submit"
            disabled={savingPersonal}
            className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {savingPersonal ? t('saving') : t('save')}
          </button>
        </form>
      </section>

      {/* Business */}
      <section className="bg-white rounded-xl border border-border p-6">
        <h2 className="text-base font-semibold text-foreground mb-4">{t('sectionBusiness')}</h2>

        {appStatus === 'PENDING' && (
          <div className="mb-4 px-4 py-3 rounded-lg bg-warning/10 text-warning text-sm">
            {t('applicationPending')}
          </div>
        )}
        {appStatus === 'REJECTED' && (
          <div className="mb-4 px-4 py-3 rounded-lg bg-destructive/10 text-destructive text-sm">
            {t('applicationRejected')}
          </div>
        )}

        <form onSubmit={saveBusiness} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">{t('businessName')}</label>
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
              <label className="block text-sm font-medium text-foreground mb-1">{t('phone')}</label>
              <input
                type="tel"
                value={businessPhone}
                onChange={(e) => setBusinessPhone(e.target.value)}
                disabled={!businessEditable}
                className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60 disabled:cursor-not-allowed"
              />
              <p className="text-xs text-muted-foreground mt-1">{t('phoneHint')}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">{t('location')}</label>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                disabled={!businessEditable}
                className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60 disabled:cursor-not-allowed"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">{t('description')}</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={!businessEditable}
              rows={4}
              placeholder={t('descriptionPlaceholder')}
              className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60 disabled:cursor-not-allowed resize-none"
            />
          </div>
          <button
            type="submit"
            disabled={!businessEditable || savingBusiness}
            className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {savingBusiness ? t('saving') : t('save')}
          </button>
        </form>
      </section>

      {/* Password change */}
      <section className="mt-6 bg-white rounded-xl border border-border p-6">
        <h2 className="text-base font-semibold text-foreground mb-2">{t('sectionPassword')}</h2>
        <p className="text-sm text-muted-foreground mb-4">{t('passwordHint')}</p>
        <form onSubmit={changePassword} className="space-y-4 max-w-md">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">{t('currentPassword')}</label>
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
            <label className="block text-sm font-medium text-foreground mb-1">{t('newPassword')}</label>
            <input
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={8}
              className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <p className="text-xs text-muted-foreground mt-1">{t('passwordRules')}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">{t('confirmPassword')}</label>
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
            {changingPassword ? t('saving') : t('changePassword')}
          </button>
        </form>
      </section>
    </div>
  );
}
