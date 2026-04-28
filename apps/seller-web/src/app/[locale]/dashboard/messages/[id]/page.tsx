'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import { Link } from '@/i18n/navigation';
import { apiFetch, ApiError } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';
import type { Message, Conversation } from '@/lib/types';

interface MessagesResponse {
  messages: Message[];
  meta?: {
    hasMore: boolean;
  };
}

export default function ConversationPage() {
  const t = useTranslations('Messaging');
  const params = useParams();
  const conversationId = params.id as string;
  const currentUser = useAuthStore((s) => s.user);

  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [error, setError] = useState('');
  const [messageInput, setMessageInput] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const shouldScrollRef = useRef(true);

  const getProductTitle = (product?: { title: string } | null) => {
    if (!product) return '';
    return product.title || '';
  };

  const formatMessageTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return new Intl.DateTimeFormat('fr-CD', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  };

  const formatMessageDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return t('today');
    if (diffDays === 1) return t('yesterday');

    return new Intl.DateTimeFormat('fr-CD', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    }).format(date);
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Mark conversation as read
  const markAsRead = useCallback(async () => {
    try {
      await apiFetch(`/v1/conversations/${conversationId}/read`, {
        method: 'POST',
      });
    } catch {
      // Silently ignore
    }
  }, [conversationId]);

  // Load conversation details
  const loadConversation = useCallback(async () => {
    try {
      const res = await apiFetch<Conversation>(`/v1/conversations/${conversationId}/messages?limit=1`);
      // The conversation info may come as part of the messages endpoint or a separate call
      // We'll extract it from the conversations list
      const convRes = await apiFetch<{ conversations: Conversation[] }>('/v1/conversations');
      const convs = convRes.data.conversations || (Array.isArray(convRes.data) ? convRes.data as unknown as Conversation[] : []);
      const conv = convs.find((c: Conversation) => c.id === conversationId);
      if (conv) {
        setConversation(conv);
      }
    } catch {
      // Silently ignore
    }
  }, [conversationId]);

  // Load messages
  const loadMessages = useCallback(async (showLoading = false) => {
    if (showLoading) setIsLoading(true);
    setError('');
    try {
      const res = await apiFetch<MessagesResponse>(
        `/v1/conversations/${conversationId}/messages?limit=30`
      );
      const msgs = res.data.messages || (Array.isArray(res.data) ? res.data as unknown as Message[] : []);
      setMessages(msgs);
      setHasMore(res.data.meta?.hasMore ?? false);

      if (shouldScrollRef.current) {
        setTimeout(scrollToBottom, 100);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError(t('errorLoading'));
      }
    } finally {
      setIsLoading(false);
    }
  }, [conversationId, t]);

  // Load older messages
  const loadOlderMessages = async () => {
    if (!messages.length || loadingOlder) return;
    setLoadingOlder(true);
    shouldScrollRef.current = false;
    try {
      const oldestId = messages[0].id;
      const res = await apiFetch<MessagesResponse>(
        `/v1/conversations/${conversationId}/messages?before=${oldestId}&limit=30`
      );
      const olderMsgs = res.data.messages || (Array.isArray(res.data) ? res.data as unknown as Message[] : []);
      setMessages((prev) => [...olderMsgs, ...prev]);
      setHasMore(res.data.meta?.hasMore ?? false);
    } catch {
      // Silently ignore
    } finally {
      setLoadingOlder(false);
      shouldScrollRef.current = true;
    }
  };

  // Send message
  const handleSend = async () => {
    const content = messageInput.trim();
    if (!content || isSending) return;

    setIsSending(true);
    setError('');

    // Optimistic add
    const tempMsg: Message = {
      id: `temp-${Date.now()}`,
      content,
      senderId: currentUser?.id || '',
      conversationId,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempMsg]);
    setMessageInput('');
    setTimeout(scrollToBottom, 50);

    try {
      await apiFetch('/v1/messages', {
        method: 'POST',
        body: JSON.stringify({ conversationId, content }),
      });
      // Reload messages to get server-confirmed state
      await loadMessages(false);
    } catch (err) {
      // Remove optimistic message on failure
      setMessages((prev) => prev.filter((m) => m.id !== tempMsg.id));
      setMessageInput(content);
      if (err instanceof ApiError) {
        setError(t('errorSending'));
      }
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Initial load
  useEffect(() => {
    loadConversation();
    loadMessages(true);
    markAsRead();

    // Poll every 10 seconds
    pollRef.current = setInterval(() => {
      loadMessages(false);
      markAsRead();
    }, 10000);

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
      }
    };
  }, [loadConversation, loadMessages, markAsRead]);

  // Group messages by date
  const groupedMessages: { date: string; messages: Message[] }[] = [];
  for (const msg of messages) {
    const dateKey = new Date(msg.createdAt).toDateString();
    const lastGroup = groupedMessages[groupedMessages.length - 1];
    if (lastGroup && lastGroup.date === dateKey) {
      lastGroup.messages.push(msg);
    } else {
      groupedMessages.push({ date: dateKey, messages: [msg] });
    }
  }

  const buyerName = conversation?.buyer
    ? `${conversation.buyer.firstName} ${conversation.buyer.lastName}`
    : '...';
  const productTitle = getProductTitle(conversation?.product);

  return (
    <div className="flex flex-col h-[calc(100vh-7rem)]">
      {/* Header */}
      <div className="flex items-center gap-3 pb-4 border-b border-border shrink-0">
        <Link
          href="/dashboard/messages"
          className="inline-flex items-center justify-center w-8 h-8 rounded-lg hover:bg-muted transition-colors text-foreground"
        >
          {'\u2190'}
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-semibold text-foreground truncate">
            {buyerName}
          </h1>
          {productTitle && (
            <p className="text-xs text-muted-foreground truncate">{productTitle}</p>
          )}
        </div>
      </div>

      {error && (
        <div className="mt-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm shrink-0">
          {error}
        </div>
      )}

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto py-4 space-y-4 min-h-0">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="animate-pulse text-muted-foreground">...</div>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-center">
            <div>
              <div className="text-4xl text-muted-foreground/40 mb-3">{'\u2709'}</div>
              <p className="text-muted-foreground">{t('noMessages')}</p>
            </div>
          </div>
        ) : (
          <>
            {/* Load older button */}
            {hasMore && (
              <div className="text-center">
                <button
                  onClick={loadOlderMessages}
                  disabled={loadingOlder}
                  className="px-4 py-1.5 text-xs font-medium text-primary hover:text-primary/80 disabled:opacity-50 transition-colors"
                >
                  {loadingOlder ? '...' : t('loadOlder')}
                </button>
              </div>
            )}

            {groupedMessages.map((group) => (
              <div key={group.date}>
                {/* Date separator */}
                <div className="flex items-center gap-3 my-3">
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-xs text-muted-foreground font-medium">
                    {formatMessageDate(group.messages[0].createdAt)}
                  </span>
                  <div className="flex-1 h-px bg-border" />
                </div>

                {/* Messages */}
                <div className="space-y-2">
                  {group.messages.map((msg) => {
                    const isMine = msg.senderId === currentUser?.id;
                    return (
                      <div
                        key={msg.id}
                        className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${
                            isMine
                              ? 'bg-primary text-primary-foreground rounded-br-md'
                              : 'bg-muted text-foreground rounded-bl-md'
                          }`}
                        >
                          <p className="text-sm whitespace-pre-wrap break-words">
                            {msg.content}
                          </p>
                          <div
                            className={`flex items-center gap-1 mt-1 ${
                              isMine ? 'justify-end' : 'justify-start'
                            }`}
                          >
                            <span
                              className={`text-[10px] ${
                                isMine
                                  ? 'text-primary-foreground/60'
                                  : 'text-muted-foreground'
                              }`}
                            >
                              {formatMessageTime(msg.createdAt)}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input area */}
      <div className="pt-3 border-t border-border shrink-0">
        <div className="flex items-end gap-2">
          <textarea
            value={messageInput}
            onChange={(e) => setMessageInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('typePlaceholder')}
            rows={1}
            className="flex-1 rounded-xl border border-border px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-none max-h-32"
            style={{ minHeight: '42px' }}
          />
          <button
            onClick={handleSend}
            disabled={!messageInput.trim() || isSending}
            className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
          >
            {isSending ? (
              <span className="text-sm">...</span>
            ) : (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="w-5 h-5"
              >
                <path d="M3.478 2.404a.75.75 0 0 0-.926.941l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.404Z" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
