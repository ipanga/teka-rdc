import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../data/messaging_repository.dart';
import '../../data/models/conversation_model.dart';

// -- Conversations list state --

class ConversationsState {
  final List<ConversationModel> conversations;
  final bool isLoading;
  final bool isLoadingMore;
  final String? error;
  final int page;
  final int total;
  final int limit;

  const ConversationsState({
    this.conversations = const [],
    this.isLoading = false,
    this.isLoadingMore = false,
    this.error,
    this.page = 1,
    this.total = 0,
    this.limit = 20,
  });

  bool get hasMore => page * limit < total;

  ConversationsState copyWith({
    List<ConversationModel>? conversations,
    bool? isLoading,
    bool? isLoadingMore,
    String? error,
    int? page,
    int? total,
    int? limit,
    bool clearError = false,
  }) {
    return ConversationsState(
      conversations: conversations ?? this.conversations,
      isLoading: isLoading ?? this.isLoading,
      isLoadingMore: isLoadingMore ?? this.isLoadingMore,
      error: clearError ? null : (error ?? this.error),
      page: page ?? this.page,
      total: total ?? this.total,
      limit: limit ?? this.limit,
    );
  }
}

class ConversationsNotifier extends StateNotifier<ConversationsState> {
  final MessagingRepository _repository;

  ConversationsNotifier(this._repository) : super(const ConversationsState()) {
    loadConversations();
  }

  Future<void> loadConversations() async {
    state = state.copyWith(isLoading: true, clearError: true);
    try {
      final result = await _repository.getConversations(
        page: 1,
        limit: state.limit,
      );
      if (mounted) {
        state = state.copyWith(
          conversations: result.items,
          page: 1,
          total: result.total,
          isLoading: false,
        );
      }
    } catch (e) {
      if (mounted) {
        state = state.copyWith(
          isLoading: false,
          error: e.toString(),
        );
      }
    }
  }

  Future<void> loadMore() async {
    if (state.isLoadingMore || !state.hasMore) return;
    state = state.copyWith(isLoadingMore: true);
    try {
      final nextPage = state.page + 1;
      final result = await _repository.getConversations(
        page: nextPage,
        limit: state.limit,
      );
      if (mounted) {
        state = state.copyWith(
          conversations: [...state.conversations, ...result.items],
          page: nextPage,
          total: result.total,
          isLoadingMore: false,
        );
      }
    } catch (e) {
      if (mounted) {
        state = state.copyWith(isLoadingMore: false);
      }
    }
  }

  Future<void> refresh() async {
    await loadConversations();
  }
}

final conversationsProvider =
    StateNotifierProvider<ConversationsNotifier, ConversationsState>((ref) {
  return ConversationsNotifier(ref.read(messagingRepositoryProvider));
});

// -- Chat (messages) state --

class ChatState {
  final String conversationId;
  final List<MessageModel> messages;
  final bool isLoading;
  final bool isLoadingOlder;
  final bool isSending;
  final bool hasMore;
  final String? error;

  const ChatState({
    required this.conversationId,
    this.messages = const [],
    this.isLoading = false,
    this.isLoadingOlder = false,
    this.isSending = false,
    this.hasMore = true,
    this.error,
  });

  ChatState copyWith({
    List<MessageModel>? messages,
    bool? isLoading,
    bool? isLoadingOlder,
    bool? isSending,
    bool? hasMore,
    String? error,
    bool clearError = false,
  }) {
    return ChatState(
      conversationId: conversationId,
      messages: messages ?? this.messages,
      isLoading: isLoading ?? this.isLoading,
      isLoadingOlder: isLoadingOlder ?? this.isLoadingOlder,
      isSending: isSending ?? this.isSending,
      hasMore: hasMore ?? this.hasMore,
      error: clearError ? null : (error ?? this.error),
    );
  }
}

class ChatNotifier extends StateNotifier<ChatState> {
  final MessagingRepository _repository;

  ChatNotifier(this._repository, String conversationId)
      : super(ChatState(conversationId: conversationId)) {
    loadMessages();
    markAsRead();
  }

  Future<void> loadMessages() async {
    state = state.copyWith(isLoading: true, clearError: true);
    try {
      final messages = await _repository.getMessages(
        state.conversationId,
        limit: 30,
      );
      if (mounted) {
        state = state.copyWith(
          messages: messages,
          isLoading: false,
          hasMore: messages.length >= 30,
        );
      }
    } catch (e) {
      if (mounted) {
        state = state.copyWith(
          isLoading: false,
          error: e.toString(),
        );
      }
    }
  }

  Future<void> loadOlderMessages() async {
    if (state.isLoadingOlder || !state.hasMore || state.messages.isEmpty) return;

    state = state.copyWith(isLoadingOlder: true);
    try {
      final oldestId = state.messages.last.id;
      final olderMessages = await _repository.getMessages(
        state.conversationId,
        before: oldestId,
        limit: 30,
      );
      if (mounted) {
        state = state.copyWith(
          messages: [...state.messages, ...olderMessages],
          isLoadingOlder: false,
          hasMore: olderMessages.length >= 30,
        );
      }
    } catch (e) {
      if (mounted) {
        state = state.copyWith(isLoadingOlder: false);
      }
    }
  }

  Future<bool> sendMessage(String content) async {
    if (content.trim().isEmpty || state.isSending) return false;

    state = state.copyWith(isSending: true);
    try {
      final message = await _repository.sendMessage(
        conversationId: state.conversationId,
        content: content.trim(),
      );
      if (mounted) {
        state = state.copyWith(
          messages: [message, ...state.messages],
          isSending: false,
        );
      }
      return true;
    } catch (e) {
      if (mounted) {
        state = state.copyWith(
          isSending: false,
          error: e.toString(),
        );
      }
      return false;
    }
  }

  Future<void> markAsRead() async {
    try {
      await _repository.markAsRead(state.conversationId);
    } catch (_) {
      // Non-critical
    }
  }

  /// Poll for new messages (called by timer)
  Future<void> pollNewMessages() async {
    if (state.isLoading) return;
    try {
      final messages = await _repository.getMessages(
        state.conversationId,
        limit: 30,
      );
      if (mounted) {
        state = state.copyWith(messages: messages);
        markAsRead();
      }
    } catch (_) {
      // Polling failures are non-critical
    }
  }
}

final chatProvider =
    StateNotifierProvider.family<ChatNotifier, ChatState, String>(
        (ref, conversationId) {
  return ChatNotifier(ref.read(messagingRepositoryProvider), conversationId);
});

// -- Unread count --

class UnreadCountNotifier extends StateNotifier<int> {
  final MessagingRepository _repository;

  UnreadCountNotifier(this._repository) : super(0) {
    loadUnreadCount();
  }

  Future<void> loadUnreadCount() async {
    try {
      final count = await _repository.getUnreadCount();
      if (mounted) {
        state = count;
      }
    } catch (_) {
      // Non-critical
    }
  }
}

final unreadCountProvider =
    StateNotifierProvider<UnreadCountNotifier, int>((ref) {
  return UnreadCountNotifier(ref.read(messagingRepositoryProvider));
});
