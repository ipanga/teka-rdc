'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { apiFetch, ApiError } from '@/lib/api-client';

/**
 * Contact form — plain HTML form posting to `/v1/contact` with a honeypot
 * field (`website`) that real users never fill. The API rate-limits per IP
 * and rejects any submission where the honeypot is non-empty.
 *
 * Client-only island so the rest of the Contact page stays SSR/SEO-friendly.
 */
export function ContactForm({ locale: _locale }: { locale: string }) {
  const t = useTranslations('Contact');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const form = e.currentTarget;
    const data = new FormData(form);
    const payload = {
      name: String(data.get('name') ?? '').trim(),
      email: String(data.get('email') ?? '').trim().toLowerCase(),
      phone: String(data.get('phone') ?? '').trim() || undefined,
      subject: String(data.get('subject') ?? '').trim(),
      message: String(data.get('message') ?? '').trim(),
      website: String(data.get('website') ?? ''), // honeypot
    };

    try {
      await apiFetch('/v1/contact', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setSent(true);
      form.reset();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message || t('genericError'));
      } else {
        setError(t('genericError'));
      }
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div
        role="status"
        className="rounded-xl border border-success/30 bg-success/5 p-6 text-center"
      >
        <h2 className="text-lg font-semibold text-foreground mb-1">
          {t('thanksTitle')}
        </h2>
        <p className="text-sm text-muted-foreground">{t('thanksBody')}</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-foreground mb-1">
        {t('formTitle')}
      </h2>
      <p className="text-sm text-muted-foreground mb-4">{t('formSubtitle')}</p>

      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {/* Honeypot — visually hidden. Real users never fill this. */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            left: '-10000px',
            width: 1,
            height: 1,
            overflow: 'hidden',
          }}
        >
          <label>
            {t('websiteLabel')}
            <input
              type="text"
              name="website"
              tabIndex={-1}
              autoComplete="off"
              defaultValue=""
            />
          </label>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="contact-name"
              className="block text-sm font-medium text-foreground mb-1"
            >
              {t('nameLabel')}
            </label>
            <input
              id="contact-name"
              name="name"
              required
              minLength={2}
              maxLength={80}
              autoComplete="name"
              className="w-full px-3 py-2 border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label
              htmlFor="contact-email"
              className="block text-sm font-medium text-foreground mb-1"
            >
              {t('emailLabel')}
            </label>
            <input
              id="contact-email"
              name="email"
              type="email"
              required
              autoComplete="email"
              className="w-full px-3 py-2 border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="contact-phone"
              className="block text-sm font-medium text-foreground mb-1"
            >
              {t('phoneLabel')}{' '}
              <span className="text-muted-foreground font-normal">
                ({t('optional')})
              </span>
            </label>
            <input
              id="contact-phone"
              name="phone"
              type="tel"
              autoComplete="tel"
              placeholder="+243 999 000 000"
              className="w-full px-3 py-2 border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label
              htmlFor="contact-subject"
              className="block text-sm font-medium text-foreground mb-1"
            >
              {t('subjectLabel')}
            </label>
            <input
              id="contact-subject"
              name="subject"
              required
              minLength={3}
              maxLength={120}
              className="w-full px-3 py-2 border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>

        <div>
          <label
            htmlFor="contact-message"
            className="block text-sm font-medium text-foreground mb-1"
          >
            {t('messageLabel')}
          </label>
          <textarea
            id="contact-message"
            name="message"
            required
            minLength={10}
            maxLength={2000}
            rows={6}
            className="w-full px-3 py-2 border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-ring resize-y"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            {t('messageHint')}
          </p>
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full sm:w-auto inline-flex justify-center items-center px-6 py-2.5 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? t('sending') : t('send')}
        </button>
      </form>
    </div>
  );
}
