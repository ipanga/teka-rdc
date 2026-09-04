'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api-client';
import { Icon } from '@/components/ui/icons';

interface SellerNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  entityType: string | null;
  entityId: string | null;
  readAt: string | null;
  createdAt: string;
}

// Deep-link a notification to where the seller acts on it. Product
// approval/rejection → the product edit page.
function hrefFor(n: SellerNotification): string {
  if (n.entityType === 'product' && n.entityId) {
    return `/dashboard/products/${n.entityId}`;
  }
  if (n.entityType === 'order' && n.entityId) {
    return `/dashboard/orders/${n.entityId}`;
  }
  return '/dashboard/products';
}

function timeAgoFr(iso: string): string {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h} h`;
  return `il y a ${Math.floor(h / 24)} j`;
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<SellerNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const fetchUnread = useCallback(() => {
    apiFetch<{ unread: number }>('/v1/seller/notifications/unread-count')
      .then((r) => setUnread(r.data.unread))
      .catch(() => {
        // Non-critical: a failed poll just leaves the badge as-is.
      });
  }, []);

  useEffect(() => {
    fetchUnread();
    const id = setInterval(fetchUnread, 60000);
    return () => clearInterval(id);
  }, [fetchUnread]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next) {
      setLoading(true);
      try {
        const r = await apiFetch<SellerNotification[]>(
          '/v1/seller/notifications?limit=10',
        );
        setItems(r.data);
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
        n.id === id ? { ...n, readAt: new Date().toISOString() } : n,
      ),
    );
    setUnread((u) => Math.max(0, u - 1));
    void apiFetch(`/v1/seller/notifications/${id}/read`, {
      method: 'PATCH',
    }).catch(() => {});
  };

  const markAllRead = () => {
    setItems((prev) =>
      prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })),
    );
    setUnread(0);
    void apiFetch('/v1/seller/notifications/read-all', {
      method: 'PATCH',
    }).catch(() => {});
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-label="Notifications"
        className="relative flex items-center justify-center w-9 h-9 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors"
      >
        <Icon name="bell" className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 inline-flex items-center justify-center min-w-4 h-4 px-1 rounded-full bg-primary text-white text-[10px] font-semibold">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 max-h-[min(28rem,calc(100vh-5rem))] w-[min(20rem,calc(100vw-2rem))] overflow-y-auto rounded-xl border border-border bg-white text-foreground shadow-xl md:left-full md:right-auto md:top-0 md:ml-2 md:mt-0">
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
                    href={hrefFor(n)}
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
        </div>
      )}
    </div>
  );
}
