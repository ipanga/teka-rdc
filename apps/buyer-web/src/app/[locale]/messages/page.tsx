'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Header } from '@/components/layout/header';
import { Footer } from '@/components/layout/footer';
import { apiFetch } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';
import type { Conversation, PaginatedConversations } from '@/lib/types';

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return 'now';
  if (diffMin < 60) return `${diffMin}min`;
  if (diffHour < 24) return `${diffHour}h`;
  if (diffDay < 7) return `${diffDay}j`;
  return date.toLocaleDateString('fr-CD', { day: 'numeric', month: 'short' });
}

export default function MessagesPage() {
  const t = useTranslations('Messaging');
  const user = useAuthStore((s) => s.user);

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchConversations = useCallback(async () => {
    try {
      const res = await apiFetch<PaginatedConversations>('/v1/conversations');
      setConversations(res.data.data);
    } catch {
      setConversations([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConversations();

    // Poll every 30s for unread count updates
    pollRef.current = setInterval(() => {
      fetchConversations();
    }, 30000);

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
      }
    };
  }, [fetchConversations]);

  function getOtherPartyName(conv: Conversation): string {
    if (conv.otherParty.businessName) return conv.otherParty.businessName;
    const parts = [conv.otherParty.firstName, conv.otherParty.lastName].filter(Boolean);
    return parts.length > 0 ? parts.join(' ') : 'Utilisateur';
  }

  function getLastMessagePreview(conv: Conversation): string {
    if (!conv.lastMessage) return '';
    const prefix = conv.lastMessage.senderId === user?.id ? `${t('you')}: ` : '';
    const content = conv.lastMessage.content;
    const maxLen = 50;
    return prefix + (content.length > maxLen ? content.slice(0, maxLen) + '...' : content);
  }

  // Skeleton
  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Header />
        <main className="flex-1 max-w-2xl mx-auto px-4 py-6 w-full">
          <h1 className="text-xl font-bold text-foreground mb-6">{t('title')}</h1>
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="animate-pulse flex items-center gap-3 p-4 bg-white rounded-lg border border-border">
                <div className="w-12 h-12 bg-muted rounded-full shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-muted rounded w-1/3" />
                  <div className="h-3 bg-muted rounded w-2/3" />
                </div>
              </div>
            ))}
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />

      <main className="flex-1 max-w-2xl mx-auto px-4 py-6 w-full">
        <h1 className="text-xl font-bold text-foreground mb-6">{t('title')}</h1>

        {conversations.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center py-16">
            <svg
              className="w-20 h-20 text-muted-foreground mb-4"
              fill="none"
              stroke="currentColor"
              strokeWidth={1}
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z"
              />
            </svg>
            <h2 className="text-lg font-semibold text-foreground mb-2">
              {t('noConversations')}
            </h2>
            <p className="text-sm text-muted-foreground">
              {t('noConversationsDesc')}
            </p>
          </div>
        ) : (
          /* Conversation list */
          <div className="space-y-2">
            {conversations.map((conv) => (
              <Link
                key={conv.id}
                href={`/messages/${conv.id}`}
                className={`flex items-center gap-3 p-4 bg-white rounded-lg border transition-colors hover:border-primary/30 hover:shadow-sm ${
                  conv.unreadCount > 0 ? 'border-primary/20 bg-primary/5' : 'border-border'
                }`}
              >
                {/* Avatar placeholder */}
                <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center shrink-0">
                  <span className="text-lg font-semibold text-muted-foreground">
                    {getOtherPartyName(conv).charAt(0).toUpperCase()}
                  </span>
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-sm truncate ${conv.unreadCount > 0 ? 'font-bold text-foreground' : 'font-medium text-foreground'}`}>
                      {getOtherPartyName(conv)}
                    </span>
                    {conv.lastMessage && (
                      <span className="text-xs text-muted-foreground shrink-0">
                        {formatRelativeTime(conv.lastMessage.createdAt)}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    <p className={`text-sm truncate ${conv.unreadCount > 0 ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
                      {getLastMessagePreview(conv) || '\u00A0'}
                    </p>
                    {conv.unreadCount > 0 && (
                      <span className="shrink-0 flex items-center justify-center w-5 h-5 text-[10px] font-bold text-white bg-primary rounded-full">
                        {conv.unreadCount > 99 ? '99+' : conv.unreadCount}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
