'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import { Link } from '@/i18n/navigation';
import { Header } from '@/components/layout/header';
import { apiFetch } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';
import type { Message, Conversation, PaginatedMessages, PaginatedConversations } from '@/lib/types';

function formatMessageTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  if (isToday) {
    return date.toLocaleTimeString('fr-CD', { hour: '2-digit', minute: '2-digit' });
  }

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();

  if (isYesterday) {
    return `Hier ${date.toLocaleTimeString('fr-CD', { hour: '2-digit', minute: '2-digit' })}`;
  }

  return date.toLocaleDateString('fr-CD', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function MessageThreadPage() {
  const t = useTranslations('Messaging');
  const params = useParams<{ id: string }>();
  const conversationId = params.id;
  const user = useAuthStore((s) => s.user);

  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [oldestMessageId, setOldestMessageId] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [messageText, setMessageText] = useState('');
  const [isSending, setIsSending] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const latestMessageIdRef = useRef<string | null>(null);

  // Fetch conversation details
  const fetchConversation = useCallback(async () => {
    try {
      const res = await apiFetch<PaginatedConversations>('/v1/conversations');
      const conv = res.data.data.find((c: Conversation) => c.id === conversationId);
      if (conv) setConversation(conv);
    } catch {
      // ignore
    }
  }, [conversationId]);

  // Fetch messages
  const fetchMessages = useCallback(async () => {
    try {
      const res = await apiFetch<PaginatedMessages>(
        `/v1/conversations/${conversationId}/messages?limit=30`,
      );
      const data = res.data.data;
      setMessages(data);
      setHasMore(res.data.meta.hasMore);
      if (data.length > 0) {
        setOldestMessageId(data[0].id);
        latestMessageIdRef.current = data[data.length - 1].id;
      }
    } catch {
      setMessages([]);
    } finally {
      setIsLoading(false);
    }
  }, [conversationId]);

  // Mark as read
  const markAsRead = useCallback(async () => {
    try {
      await apiFetch(`/v1/conversations/${conversationId}/read`, { method: 'POST' });
    } catch {
      // ignore
    }
  }, [conversationId]);

  // Load older messages
  async function loadOlderMessages() {
    if (!oldestMessageId || loadingOlder) return;
    setLoadingOlder(true);

    try {
      const res = await apiFetch<PaginatedMessages>(
        `/v1/conversations/${conversationId}/messages?before=${oldestMessageId}&limit=30`,
      );
      const older = res.data.data;
      if (older.length > 0) {
        setMessages((prev) => [...older, ...prev]);
        setOldestMessageId(older[0].id);
      }
      setHasMore(res.data.meta.hasMore);
    } catch {
      // failed to load older
    } finally {
      setLoadingOlder(false);
    }
  }

  // Send message
  async function handleSend() {
    const content = messageText.trim();
    if (!content || isSending) return;

    setIsSending(true);
    setMessageText('');

    // Optimistic add
    const optimisticMsg: Message = {
      id: `temp-${Date.now()}`,
      conversationId,
      senderId: user?.id || '',
      content,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticMsg]);

    try {
      const res = await apiFetch<Message>('/v1/messages', {
        method: 'POST',
        body: JSON.stringify({ conversationId, content }),
      });
      // Replace optimistic with real
      setMessages((prev) =>
        prev.map((m) => (m.id === optimisticMsg.id ? res.data : m)),
      );
      latestMessageIdRef.current = res.data.id;
    } catch {
      // Remove optimistic on failure
      setMessages((prev) => prev.filter((m) => m.id !== optimisticMsg.id));
      setMessageText(content); // Restore text
    } finally {
      setIsSending(false);
    }
  }

  // Poll for new messages every 10s
  const pollNewMessages = useCallback(async () => {
    try {
      const res = await apiFetch<PaginatedMessages>(
        `/v1/conversations/${conversationId}/messages?limit=30`,
      );
      const data = res.data.data;
      if (data.length > 0) {
        const latestId = data[data.length - 1].id;
        if (latestId !== latestMessageIdRef.current) {
          // New messages arrived
          setMessages(data);
          latestMessageIdRef.current = latestId;
          markAsRead();
        }
      }
    } catch {
      // poll failed
    }
  }, [conversationId, markAsRead]);

  // Initial load
  useEffect(() => {
    setIsLoading(true);
    Promise.all([fetchConversation(), fetchMessages()]).then(() => {
      markAsRead();
    });
  }, [fetchConversation, fetchMessages, markAsRead]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Start polling
  useEffect(() => {
    pollRef.current = setInterval(pollNewMessages, 10000);
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
      }
    };
  }, [pollNewMessages]);

  function getOtherPartyName(): string {
    if (!conversation) return '';
    if (conversation.otherParty.businessName) return conversation.otherParty.businessName;
    const parts = [conversation.otherParty.firstName, conversation.otherParty.lastName].filter(Boolean);
    return parts.length > 0 ? parts.join(' ') : 'Utilisateur';
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Header />
        <main className="flex-1 flex flex-col max-w-2xl mx-auto w-full">
          <div className="p-4 border-b border-border">
            <div className="animate-pulse h-6 bg-muted rounded w-32" />
          </div>
          <div className="flex-1 p-4 space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className={`animate-pulse flex ${i % 2 === 0 ? 'justify-start' : 'justify-end'}`}
              >
                <div className={`h-10 bg-muted rounded-xl ${i % 2 === 0 ? 'w-2/3' : 'w-1/2'}`} />
              </div>
            ))}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />

      <main className="flex-1 flex flex-col max-w-2xl mx-auto w-full">
        {/* Chat header */}
        <div className="flex items-center gap-3 p-4 border-b border-border bg-white sticky top-16 z-10">
          <Link
            href="/messages"
            className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div className="w-10 h-10 bg-muted rounded-full flex items-center justify-center shrink-0">
            <span className="text-sm font-semibold text-muted-foreground">
              {getOtherPartyName().charAt(0).toUpperCase()}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-semibold text-foreground truncate">
              {getOtherPartyName()}
            </h1>
          </div>
        </div>

        {/* Messages area */}
        <div
          ref={messagesContainerRef}
          className="flex-1 overflow-y-auto p-4 space-y-3"
        >
          {/* Load older */}
          {hasMore && (
            <div className="text-center py-2">
              <button
                onClick={loadOlderMessages}
                disabled={loadingOlder}
                className="text-sm text-primary hover:underline disabled:opacity-50"
              >
                {loadingOlder ? (
                  <svg className="animate-spin w-4 h-4 mx-auto" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : (
                  t('loadOlder')
                )}
              </button>
            </div>
          )}

          {messages.length === 0 && (
            <div className="flex items-center justify-center py-8">
              <p className="text-sm text-muted-foreground">{t('noMessages')}</p>
            </div>
          )}

          {messages.map((msg) => {
            const isMine = msg.senderId === user?.id;
            return (
              <div
                key={msg.id}
                className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[75%] px-4 py-2.5 rounded-2xl ${
                    isMine
                      ? 'bg-primary text-primary-foreground rounded-br-md'
                      : 'bg-muted text-foreground rounded-bl-md'
                  }`}
                >
                  <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
                  <p
                    className={`text-[10px] mt-1 ${
                      isMine ? 'text-primary-foreground/70' : 'text-muted-foreground'
                    }`}
                  >
                    {formatMessageTime(msg.createdAt)}
                  </p>
                </div>
              </div>
            );
          })}

          <div ref={messagesEndRef} />
        </div>

        {/* Input area */}
        <div className="p-3 border-t border-border bg-white sticky bottom-0">
          <div className="flex items-end gap-2">
            <textarea
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t('typePlaceholder')}
              rows={1}
              className="flex-1 px-4 py-2.5 border border-input rounded-xl bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring text-sm resize-none max-h-32 overflow-y-auto"
              style={{ minHeight: '42px' }}
            />
            <button
              onClick={handleSend}
              disabled={!messageText.trim() || isSending}
              className="p-2.5 bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
              aria-label={t('send')}
            >
              {isSending ? (
                <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5"
                  />
                </svg>
              )}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
