'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Header } from '@/components/layout/header';
import { Footer } from '@/components/layout/footer';
import { Container } from '@/components/ui';
import { apiFetch } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';
import { track } from '@/lib/analytics';
import {
  hrefForNotification,
  type BuyerNotification,
} from '@/components/notifications/notification-bell';

function timeAgoFr(iso: string): string {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h} h`;
  return `il y a ${Math.floor(h / 24)} j`;
}

/**
 * Buyer Notification Center — a private client island (the route wrapper marks
 * it `noindex`, so it never touches SEO). Lists all of the buyer's
 * notifications with read/unread state, mark-read on click + mark-all-read; a
 * product notification deep-links to the PDP.
 */
export default function NotificationsPage() {
  const user = useAuthStore((s) => s.user);
  const authLoading = useAuthStore((s) => s.isLoading);
  const [items, setItems] = useState<BuyerNotification[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const r = await apiFetch<BuyerNotification[]>('/v1/notifications?limit=50');
      setItems(r.data);
    } catch {
      setItems([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setIsLoading(false);
      return;
    }
    load();
  }, [authLoading, user, load]);

  const markRead = (id: string) => {
    setItems((prev) =>
      prev.map((n) =>
        n.id === id ? { ...n, readAt: n.readAt ?? new Date().toISOString() } : n,
      ),
    );
    void apiFetch(`/v1/notifications/${id}/read`, { method: 'PATCH' }).catch(
      () => {},
    );
  };

  const markAllRead = () => {
    setItems((prev) =>
      prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })),
    );
    void apiFetch('/v1/notifications/read-all', { method: 'PATCH' }).catch(
      () => {},
    );
  };

  const hasUnread = items.some((n) => !n.readAt);

  return (
    <div className="min-h-screen flex flex-col bg-surface-muted">
      <Header />
      <main className="flex-1">
        <Container className="py-8 md:py-12 max-w-3xl">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-foreground tracking-tight">
                {"Notifications"}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {"Suivez vos commandes, offres et informations importantes."}
              </p>
            </div>
            {hasUnread && (
              <button
                type="button"
                onClick={markAllRead}
                className="text-sm text-primary hover:underline shrink-0"
              >
                Tout marquer comme lu
              </button>
            )}
          </div>

          {!user && !authLoading ? (
            <div className="mt-4 rounded-xl border border-border bg-surface p-8 text-center">
              <div className="mx-auto mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-primary-subtle text-primary">
                <svg className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a3 3 0 1 1-5.714 0" />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-foreground tracking-tight">
                Connectez-vous pour voir vos notifications
              </h2>
              <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                Suivez vos commandes, les offres et les messages importants de Teka RDC.
              </p>
              <Link
                href="/connexion?redirect=/notifications"
                className="mt-5 inline-flex rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Se connecter
              </Link>
            </div>
          ) : isLoading ? (
            <div className="space-y-3 mt-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="h-20 rounded-xl bg-surface border border-border animate-pulse"
                />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="mt-4 rounded-xl border border-border bg-surface p-8 text-center">
              <div className="mx-auto mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-surface-muted text-muted-foreground">
                <svg className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a3 3 0 1 1-5.714 0" />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-foreground tracking-tight">
                Aucune notification
              </h2>
              <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                Les nouvelles commandes, promotions et informations importantes apparaîtront ici.
              </p>
            </div>
          ) : (
            <ul className="mt-4 space-y-2">
              {items.map((n) => (
                <li key={n.id}>
                  <Link
                    href={hrefForNotification(n)}
                    onClick={() => {
                      track('notification_opened', { notificationId: n.id, type: n.type });
                      markRead(n.id);
                    }}
                    className={`block rounded-xl border p-4 transition-colors hover:border-border-strong ${
                      n.readAt
                        ? 'bg-surface border-border'
                        : 'bg-primary/5 border-primary/20'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      {!n.readAt && (
                        <span className="mt-1.5 w-2 h-2 rounded-full bg-primary shrink-0" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-foreground">
                          {n.title}
                        </p>
                        <p className="text-sm text-muted-foreground mt-0.5 whitespace-pre-wrap">
                          {n.body}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1.5">
                          {timeAgoFr(n.createdAt)}
                        </p>
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Container>
      </main>
      <Footer />
    </div>
  );
}
