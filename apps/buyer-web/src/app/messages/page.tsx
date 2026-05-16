'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { Header } from '@/components/layout/header';
import { Footer } from '@/components/layout/footer';
import { apiFetch } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';
import { Card, Container, cn } from '@/components/ui';
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
    pollRef.current = setInterval(fetchConversations, 30000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
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

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col bg-surface-muted">
        <Header />
        <main className="flex-1">
          <Container className="py-6 md:py-10 max-w-2xl">
            <h1 className="text-2xl md:text-3xl font-bold text-foreground tracking-tight mb-6">
              {t('title')}
            </h1>
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Card key={i} padding="sm" className="animate-pulse">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-muted rounded-full shrink-0" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 bg-muted rounded w-1/3" />
                      <div className="h-3 bg-muted rounded w-2/3" />
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </Container>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-surface-muted">
      <Header />

      <main className="flex-1">
        <Container className="py-6 md:py-10 max-w-2xl">
          <h1 className="text-2xl md:text-3xl font-bold text-foreground tracking-tight mb-6">
            {t('title')}
          </h1>

          {conversations.length === 0 ? (
            <Card padding="lg" className="text-center">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-surface-muted mb-4">
                <svg
                  className="w-10 h-10 text-muted-foreground"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z"
                  />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-foreground tracking-tight mb-2">
                {t('noConversations')}
              </h2>
              <p className="text-sm text-muted-foreground">{t('noConversationsDesc')}</p>
            </Card>
          ) : (
            <div className="space-y-2">
              {conversations.map((conv) => {
                const unread = conv.unreadCount > 0;
                const name = getOtherPartyName(conv);
                return (
                  <Link key={conv.id} href={`/messages/${conv.id}`} className="block group">
                    <Card
                      padding="sm"
                      hover="lift"
                      className={cn(
                        unread && 'bg-primary-subtle/50 border-primary/30',
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={cn(
                            'w-12 h-12 rounded-full flex items-center justify-center shrink-0 text-base font-bold',
                            unread
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-surface-muted text-foreground',
                          )}
                        >
                          {name.charAt(0).toUpperCase()}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span
                              className={cn(
                                'text-sm truncate transition-colors group-hover:text-primary',
                                unread ? 'font-bold text-foreground' : 'font-medium text-foreground',
                              )}
                            >
                              {name}
                            </span>
                            {conv.lastMessage && (
                              <span className="text-xs text-muted-foreground shrink-0">
                                {formatRelativeTime(conv.lastMessage.createdAt)}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center justify-between gap-2 mt-0.5">
                            <p
                              className={cn(
                                'text-sm truncate',
                                unread
                                  ? 'text-foreground font-medium'
                                  : 'text-muted-foreground',
                              )}
                            >
                              {getLastMessagePreview(conv) || ' '}
                            </p>
                            {unread && (
                              <span className="shrink-0 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-[10px] font-bold text-primary-foreground bg-primary rounded-full">
                                {conv.unreadCount > 99 ? '99+' : conv.unreadCount}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </Card>
                  </Link>
                );
              })}
            </div>
          )}
        </Container>
      </main>

      <Footer />
    </div>
  );
}
