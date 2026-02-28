import 'dart:async';
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../data/models/conversation_model.dart';
import '../../data/messaging_repository.dart';

class MessagingState {
  final List<ConversationModel> conversations;
  final List<MessageModel> currentMessages;
  final int unreadCount;
  final bool isLoading;
  final bool isSending;
  final String? error;

  const MessagingState({
    this.conversations = const [],
    this.currentMessages = const [],
    this.unreadCount = 0,
    this.isLoading = false,
    this.isSending = false,
    this.error,
  });

  MessagingState copyWith({
    List<ConversationModel>? conversations,
    List<MessageModel>? currentMessages,
    int? unreadCount,
    bool? isLoading,
    bool? isSending,
    String? error,
    bool clearError = false,
  }) {
    return MessagingState(
      conversations: conversations ?? this.conversations,
      currentMessages: currentMessages ?? this.currentMessages,
      unreadCount: unreadCount ?? this.unreadCount,
      isLoading: isLoading ?? this.isLoading,
      isSending: isSending ?? this.isSending,
      error: clearError ? null : (error ?? this.error),
    );
  }
}

class MessagingNotifier extends StateNotifier<MessagingState> {
  final MessagingRepository _repository;
  Timer? _pollTimer;
  String? _currentConversationId;

  MessagingNotifier(this._repository) : super(const MessagingState()) {
    loadConversations();
    loadUnreadCount();
  }

  Future<void> loadConversations() async {
    state = state.copyWith(isLoading: true, clearError: true);
    try {
      final conversations = await _repository.getConversations();
      if (!mounted) return;
      state = state.copyWith(
        conversations: conversations,
        isLoading: false,
      );
    } on DioException catch (e) {
      if (!mounted) return;
      state = state.copyWith(
        isLoading: false,
        error: _extractErrorMessage(e),
      );
    } catch (e) {
      if (!mounted) return;
      state = state.copyWith(
        isLoading: false,
        error: e.toString(),
      );
    }
  }

  Future<void> loadMessages(String conversationId) async {
    _currentConversationId = conversationId;
    state = state.copyWith(isLoading: true, clearError: true);
    try {
      final messages = await _repository.getMessages(conversationId);
      if (!mounted) return;
      state = state.copyWith(
        currentMessages: messages,
        isLoading: false,
      );

      // Mark as read
      await markAsRead(conversationId);

      // Start polling
      _startPolling(conversationId);
    } on DioException catch (e) {
      if (!mounted) return;
      state = state.copyWith(
        isLoading: false,
        error: _extractErrorMessage(e),
      );
    } catch (e) {
      if (!mounted) return;
      state = state.copyWith(
        isLoading: false,
        error: e.toString(),
      );
    }
  }

  Future<void> loadOlderMessages(String conversationId) async {
    if (state.currentMessages.isEmpty) return;

    final oldestMessageId = state.currentMessages.last.id;
    try {
      final olderMessages = await _repository.getMessages(
        conversationId,
        before: oldestMessageId,
      );
      if (!mounted) return;
      if (olderMessages.isNotEmpty) {
        state = state.copyWith(
          currentMessages: [...state.currentMessages, ...olderMessages],
        );
      }
    } catch (_) {
      // Silently fail for older messages loading
    }
  }

  Future<MessageModel?> sendMessage({
    String? conversationId,
    String? sellerId,
    required String content,
  }) async {
    state = state.copyWith(isSending: true, clearError: true);
    try {
      final message = await _repository.sendMessage(
        conversationId: conversationId,
        sellerId: sellerId,
        content: content,
      );
      if (!mounted) return message;

      // Add message to current messages list
      state = state.copyWith(
        currentMessages: [message, ...state.currentMessages],
        isSending: false,
      );

      // Update conversation id if this was a new conversation
      if (_currentConversationId == null ||
          _currentConversationId!.isEmpty) {
        _currentConversationId = message.conversationId;
      }

      // Refresh conversations list
      _refreshConversationsSilently();

      return message;
    } on DioException catch (e) {
      if (!mounted) return null;
      state = state.copyWith(
        isSending: false,
        error: _extractErrorMessage(e),
      );
      return null;
    } catch (e) {
      if (!mounted) return null;
      state = state.copyWith(
        isSending: false,
        error: e.toString(),
      );
      return null;
    }
  }

  Future<void> markAsRead(String conversationId) async {
    try {
      await _repository.markAsRead(conversationId);
      if (!mounted) return;

      // Update unread count in conversations list
      final updatedConversations = state.conversations.map((c) {
        if (c.id == conversationId) {
          return ConversationModel(
            id: c.id,
            buyerId: c.buyerId,
            sellerId: c.sellerId,
            lastMessageAt: c.lastMessageAt,
            otherParty: c.otherParty,
            lastMessage: c.lastMessage,
            unreadCount: 0,
          );
        }
        return c;
      }).toList();

      state = state.copyWith(conversations: updatedConversations);
      await loadUnreadCount();
    } catch (_) {
      // Non-critical
    }
  }

  Future<void> loadUnreadCount() async {
    try {
      final count = await _repository.getUnreadCount();
      if (!mounted) return;
      state = state.copyWith(unreadCount: count);
    } catch (_) {
      // Non-critical
    }
  }

  void _startPolling(String conversationId) {
    _stopPolling();
    _pollTimer = Timer.periodic(const Duration(seconds: 10), (_) async {
      if (!mounted) {
        _stopPolling();
        return;
      }
      try {
        final messages = await _repository.getMessages(conversationId);
        if (!mounted) return;
        if (messages.isNotEmpty) {
          // Merge new messages: keep existing older messages and add any new ones
          final existingIds =
              state.currentMessages.map((m) => m.id).toSet();
          final newMessages =
              messages.where((m) => !existingIds.contains(m.id)).toList();
          if (newMessages.isNotEmpty) {
            state = state.copyWith(
              currentMessages: [...newMessages, ...state.currentMessages],
            );
            await _repository.markAsRead(conversationId);
          }
        }
      } catch (_) {
        // Silently fail polling
      }
    });
  }

  void _stopPolling() {
    _pollTimer?.cancel();
    _pollTimer = null;
  }

  void stopPolling() {
    _stopPolling();
    _currentConversationId = null;
  }

  Future<void> _refreshConversationsSilently() async {
    try {
      final conversations = await _repository.getConversations();
      if (!mounted) return;
      state = state.copyWith(conversations: conversations);
    } catch (_) {
      // Non-critical
    }
  }

  Future<void> refresh() async {
    await loadConversations();
    await loadUnreadCount();
  }

  @override
  void dispose() {
    _stopPolling();
    super.dispose();
  }

  String _extractErrorMessage(DioException e) {
    if (e.type == DioExceptionType.connectionTimeout ||
        e.type == DioExceptionType.receiveTimeout) {
      return 'Connexion lente. Veuillez reessayer.';
    }
    if (e.type == DioExceptionType.connectionError) {
      return 'Pas de connexion internet.';
    }
    final data = e.response?.data;
    if (data is Map && data['error'] != null) {
      final error = data['error'];
      if (error is Map && error['message'] != null) {
        return error['message'].toString();
      }
      return error.toString();
    }
    return 'Une erreur est survenue. Veuillez reessayer.';
  }
}

final messagingProvider =
    StateNotifierProvider<MessagingNotifier, MessagingState>((ref) {
  return MessagingNotifier(ref.read(messagingRepositoryProvider));
});
