'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { apiFetch } from '@/lib/api-client';

interface Setting {
  id: string;
  key: string;
  value: string;
  type: string;
  label: string | null;
  description: string | null;
  updatedAt: string;
}

export default function SettingsPage() {
  const t = useTranslations('Settings');
  const tCommon = useTranslations('Common');

  const [settings, setSettings] = useState<Setting[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);

  // Feedback
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const showFeedback = (type: 'success' | 'error', message: string) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 3000);
  };

  const fetchSettings = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await apiFetch<Setting[]>('/v1/admin/settings');
      const data = Array.isArray(res.data) ? res.data : [];
      setSettings(data);
      const vals: Record<string, string> = {};
      data.forEach((s) => {
        vals[s.key] = s.value;
      });
      setEditValues(vals);
    } catch {
      // handled
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const handleToggle = async (setting: Setting) => {
    const newValue = setting.value === 'true' ? 'false' : 'true';
    setSavingKey(setting.key);
    try {
      await apiFetch(`/v1/admin/settings/${setting.key}`, {
        method: 'PUT',
        body: JSON.stringify({ value: newValue }),
      });
      showFeedback('success', t('saved'));
      fetchSettings();
    } catch {
      showFeedback('error', t('error'));
    } finally {
      setSavingKey(null);
    }
  };

  const handleSaveValue = async (setting: Setting) => {
    const newValue = editValues[setting.key];
    if (newValue === setting.value) return;
    setSavingKey(setting.key);
    try {
      await apiFetch(`/v1/admin/settings/${setting.key}`, {
        method: 'PUT',
        body: JSON.stringify({ value: newValue }),
      });
      showFeedback('success', t('saved'));
      fetchSettings();
    } catch {
      showFeedback('error', t('error'));
    } finally {
      setSavingKey(null);
    }
  };

  const getLabel = (setting: Setting): string => {
    return setting.label || setting.key;
  };

  const getDescription = (setting: Setting): string | null => {
    return setting.description || null;
  };

  const isBoolean = (setting: Setting): boolean => {
    return setting.type === 'boolean' || setting.value === 'true' || setting.value === 'false';
  };

  const isMaintenance = (key: string): boolean => {
    return key === 'MAINTENANCE_MODE' || key === 'maintenance_mode';
  };

  return (
    <div className="p-8">
      {feedback && (
        <div
          className={`mb-4 px-4 py-3 rounded-lg text-sm font-medium ${
            feedback.type === 'success'
              ? 'bg-success/10 text-success'
              : 'bg-destructive/10 text-destructive'
          }`}
        >
          {feedback.message}
        </div>
      )}

      <h1 className="text-2xl font-bold text-foreground mb-6">{t('title')}</h1>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-white rounded-xl border border-border p-6">
              <div className="h-5 w-40 bg-muted rounded animate-pulse mb-3" />
              <div className="h-8 w-full bg-muted rounded animate-pulse" />
            </div>
          ))}
        </div>
      ) : settings.length === 0 ? (
        <div className="bg-white rounded-xl border border-border p-8 text-center text-muted-foreground">
          {t('noSettings')}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {settings.map((setting) => {
            const isMaintenanceCard = isMaintenance(setting.key);
            const isBool = isBoolean(setting);
            const isChecked = setting.value === 'true';

            return (
              <div
                key={setting.id}
                className={`rounded-xl border p-6 ${
                  isMaintenanceCard && isChecked
                    ? 'bg-destructive/5 border-destructive/30'
                    : 'bg-white border-border'
                }`}
              >
                <div className="flex items-start justify-between mb-1">
                  <div>
                    <h3 className={`text-sm font-semibold ${
                      isMaintenanceCard && isChecked ? 'text-destructive' : 'text-foreground'
                    }`}>
                      {isMaintenanceCard && isChecked && (
                        <span className="mr-1.5" aria-label="warning">&#9888;</span>
                      )}
                      {getLabel(setting)}
                    </h3>
                    <p className="text-xs text-muted-foreground font-mono mt-0.5">{setting.key}</p>
                  </div>
                </div>

                {getDescription(setting) && (
                  <p className="text-xs text-muted-foreground mb-3">{getDescription(setting)}</p>
                )}

                {isBool ? (
                  <div className="mt-3">
                    <button
                      onClick={() => handleToggle(setting)}
                      disabled={savingKey === setting.key}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50 ${
                        isChecked ? 'bg-primary' : 'bg-gray-300'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          isChecked ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                    <span className="ml-2 text-sm text-muted-foreground">
                      {isChecked ? t('enabled') : t('disabled')}
                    </span>
                  </div>
                ) : (
                  <div className="mt-3 flex gap-2">
                    <input
                      type={setting.type === 'number' ? 'number' : 'text'}
                      value={editValues[setting.key] || ''}
                      onChange={(e) =>
                        setEditValues({ ...editValues, [setting.key]: e.target.value })
                      }
                      className="flex-1 px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                    <button
                      onClick={() => handleSaveValue(setting)}
                      disabled={savingKey === setting.key || editValues[setting.key] === setting.value}
                      className="px-3 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {savingKey === setting.key ? tCommon('loading') : tCommon('save')}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
