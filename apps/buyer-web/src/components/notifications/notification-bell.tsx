'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';

export interface BuyerNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  entityType: string | null;
  entityId: string | null;
  readAt: string | null;
  createdAt: string;
}

// Deep-link: a product notification opens the PDP (a bare /{id} 308-redirects
// to the canonical /{ville}/{slug}-{shortCode} URL); anything else opens the
// Notification Center.
export function hrefForNotification(n: BuyerNotification): string {
  if (
    (n.type === 'PRODUCT_PROMO' || n.entityType === 'product') &&
    n.entityId
  ) {
    return `/${n.entityId}`;
  }
  return '/notifications';
}

function timeAgoFr(iso: string): string {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h} h`;
  return `il y a ${Math.floor(h / 24)} j`;
}

/**
 * Buyer header notification bell — a client island (no SSR/SEO impact). Renders
 * only for a logged-in buyer; polls the unread count every 60s and lazy-loads
 * the latest 10 on open. Mirrors the admin notification-bell.
 */
export function NotificationBell({ compact = false }: { compact?: boolean }) {
  const user = useAuthStore((s) => s.user);
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<BuyerNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const fetchUnread = useCallback(() => {
    apiFetch<{ unread: number }>('/v1/notifications/unread-count')
      .then((r) => setUnread(r.data.unread))
      .catch(() => {});
  }, []);

  // Poll the cheap unread count while logged in.
  useEffect(() => {
    if (!user) {
      setUnread(0);
      return;
    }
    fetchUnread();
    const id = setInterval(fetchUnread, 60000);
    return () => clearInterval(id);
  }, [user, fetchUnread]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  if (!user) return null;

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next) {
      setLoading(true);
      try {
        const r = await apiFetch<BuyerNotification[]>(
          '/v1/notifications?limit=10',
        );
        setItems(r.data);
        fetchUnread();
      } catch {
        // handled by apiFetch
      } finally {
        setLoading(false);
      }
    }
  };

  const markRead = (id: string) => {
    setItems((prev) =>
      prev.map((n) =>
        n.id === id ? { ...n, readAt: n.readAt ?? new Date().toISOString() } : n,
      ),
    );
    setUnread((u) => Math.max(0, u - 1));
    void apiFetch(`/v1/notifications/${id}/read`, { method: 'PATCH' }).catch(
      () => {},
    );
  };

  const markAllRead = () => {
    setItems((prev) =>
      prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })),
    );
    setUnread(0);
    void apiFetch('/v1/notifications/read-all', { method: 'PATCH' }).catch(
      () => {},
    );
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-label="Notifications"
        className={`relative flex items-center justify-center ${
          compact ? 'w-9 h-9' : 'w-10 h-10'
        } rounded-lg text-foreground hover:bg-surface-muted transition-colors`}
      >
        <svg
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.8}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 inline-flex items-center justify-center min-w-4 h-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 max-h-[28rem] overflow-y-auto bg-white text-foreground rounded-xl border border-border shadow-lg z-50">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border sticky top-0 bg-white">
            <p className="text-sm font-semibold">Notifications</p>
            {unread > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                className="text-xs text-primary hover:underline"
              >
                Tout marquer comme lu
              </button>
            )}
          </div>

          {loading ? (
            <p className="px-4 py-6 text-sm text-muted-foreground text-center">
              Chargement...
            </p>
          ) : items.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground text-center">
              Aucune notification
            </p>
          ) : (
            <ul>
              {items.map((n) => (
                <li key={n.id}>
                  <Link
                    href={hrefForNotification(n)}
                    onClick={() => {
                      markRead(n.id);
                      setOpen(false);
                    }}
                    className={`block px-4 py-3 border-b border-border hover:bg-muted/50 transition-colors ${
                      n.readAt ? '' : 'bg-primary/5'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      {!n.readAt && (
                        <span className="mt-1.5 w-2 h-2 rounded-full bg-primary shrink-0" />
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">
                          {n.title}
                        </p>
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          {n.body}
                        </p>
                        <p className="text-[11px] text-muted-foreground mt-1">
                          {timeAgoFr(n.createdAt)}
                        </p>
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <Link
            href="/notifications"
            onClick={() => setOpen(false)}
            className="block px-4 py-3 text-center text-sm text-primary hover:bg-muted/50 border-t border-border"
          >
            Voir toutes les notifications
          </Link>
        </div>
      )}
    </div>
  );
}
