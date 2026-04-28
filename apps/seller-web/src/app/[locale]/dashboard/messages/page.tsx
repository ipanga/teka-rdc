'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { apiFetch, ApiError } from '@/lib/api-client';
import type { Conversation } from '@/lib/types';

interface ConversationsResponse {
  conversations: Conversation[];
  meta?: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export default function MessagesPage() {
  const t = useTranslations('Messaging');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const getProductTitle = (product?: { title: string } | null) => {
    if (!product) return '';
    return product.title || '';
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return new Intl.DateTimeFormat('fr-CD', {
        hour: '2-digit',
        minute: '2-digit',
      }).format(date);
    } else if (diffDays === 1) {
      return t('yesterday');
    } else {
      return new Intl.DateTimeFormat('fr-CD', {
        day: '2-digit',
        month: '2-digit',
      }).format(date);
    }
  };

  const loadConversations = useCallback(async (showLoading = false) => {
    if (showLoading) setIsLoading(true);
    setError('');
    try {
      const res = await apiFetch<ConversationsResponse>('/v1/conversations');
      setConversations(res.data.conversations || (Array.isArray(res.data) ? res.data as unknown as Conversation[] : []));
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError(t('errorLoading'));
      }
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadConversations(true);

    // Poll every 30 seconds
    pollRef.current = setInterval(() => {
      loadConversations(false);
    }, 30000);

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
      }
    };
  }, [loadConversations]);

  return (
    <div>
      <h1 className="text-2xl font-bold text-foreground mb-6">{t('title')}</h1>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="bg-white rounded-lg border border-border p-4 animate-pulse">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-muted" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-muted rounded w-1/3" />
                  <div className="h-3 bg-muted rounded w-2/3" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : conversations.length === 0 ? (
        <div className="bg-white rounded-xl border border-border p-12 text-center">
          <div className="text-4xl text-muted-foreground/40 mb-3">{'\u2709'}</div>
          <p className="text-muted-foreground font-medium">{t('noConversations')}</p>
          <p className="text-sm text-muted-foreground mt-1">{t('noConversationsDesc')}</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-border overflow-hidden divide-y divide-border">
          {conversations.map((conv) => {
            const buyerName = conv.buyer
              ? `${conv.buyer.firstName} ${conv.buyer.lastName}`
              : '---';
            const productTitle = getProductTitle(conv.product);
            const lastMsg = conv.lastMessage;
            const hasUnread = conv.unreadCount > 0;

            return (
              <Link
                key={conv.id}
                href={`/dashboard/messages/${conv.id}`}
                className={`block p-4 hover:bg-muted/30 transition-colors ${
                  hasUnread ? 'bg-primary/5' : ''
                }`}
              >
                <div className="flex items-start gap-3">
                  {/* Avatar */}
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium text-primary shrink-0">
                    {conv.buyer?.firstName?.[0] || '?'}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className={`text-sm truncate ${hasUnread ? 'font-bold text-foreground' : 'font-medium text-foreground'}`}>
                        {buyerName}
                      </span>
                      <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                        {lastMsg ? formatTime(lastMsg.createdAt) : formatTime(conv.createdAt)}
                      </span>
                    </div>
                    {productTitle && (
                      <p className="text-xs text-muted-foreground truncate">
                        {productTitle}
                      </p>
                    )}
                    <div className="flex items-center justify-between gap-2 mt-0.5">
                      <p className={`text-sm truncate ${hasUnread ? 'font-medium text-foreground' : 'text-muted-foreground'}`}>
                        {lastMsg?.content || '...'}
                      </p>
                      {hasUnread && (
                        <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-xs font-bold shrink-0">
                          {conv.unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
