import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../../../l10n/app_localizations.dart';
import '../../../auth/presentation/providers/auth_provider.dart';
import '../providers/messaging_provider.dart';
import '../widgets/message_bubble.dart';

class ChatScreen extends ConsumerStatefulWidget {
  final String conversationId;

  const ChatScreen({super.key, required this.conversationId});

  @override
  ConsumerState<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends ConsumerState<ChatScreen> {
  final _messageController = TextEditingController();
  final _scrollController = ScrollController();
  Timer? _pollTimer;

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_onScroll);
    // Poll for new messages every 10 seconds
    _pollTimer = Timer.periodic(const Duration(seconds: 10), (_) {
      if (mounted) {
        ref
            .read(chatProvider(widget.conversationId).notifier)
            .pollNewMessages();
      }
    });
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    _messageController.dispose();
    _scrollController.removeListener(_onScroll);
    _scrollController.dispose();
    super.dispose();
  }

  void _onScroll() {
    // Load older messages when scrolling near the top (reversed list = bottom)
    if (_scrollController.position.extentAfter < 200) {
      ref
          .read(chatProvider(widget.conversationId).notifier)
          .loadOlderMessages();
    }
  }

  Future<void> _sendMessage() async {
    final text = _messageController.text.trim();
    if (text.isEmpty) return;

    final success = await ref
        .read(chatProvider(widget.conversationId).notifier)
        .sendMessage(text);

    if (success && mounted) {
      _messageController.clear();
      // Scroll to bottom (beginning of reversed list)
      if (_scrollController.hasClients) {
        _scrollController.animateTo(
          0.0,
          duration: const Duration(milliseconds: 300),
          curve: Curves.easeOut,
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final chatState = ref.watch(chatProvider(widget.conversationId));
    final authState = ref.watch(authProvider);
    final currentUserId = authState.user?['id'] as String? ?? '';

    // Determine the conversation partner name for the app bar
    final conversations = ref.watch(conversationsProvider);
    final conversation = conversations.conversations
        .where((c) => c.id == widget.conversationId)
        .firstOrNull;
    final partnerName = conversation?.otherParty?.fullName ?? l10n.messagesTitle;

    return Scaffold(
      appBar: AppBar(
        title: Text(partnerName),
      ),
      body: Column(
        children: [
          // Messages
          Expanded(
            child: chatState.isLoading && chatState.messages.isEmpty
                ? const Center(child: CircularProgressIndicator())
                : chatState.error != null && chatState.messages.isEmpty
                    ? _buildError(l10n)
                    : chatState.messages.isEmpty
                        ? _buildEmptyMessages(l10n)
                        : _buildMessagesList(
                            l10n, chatState, currentUserId),
          ),

          // Input bar
          _buildInputBar(l10n, chatState.isSending),
        ],
      ),
    );
  }

  Widget _buildMessagesList(
    AppLocalizations l10n,
    ChatState chatState,
    String currentUserId,
  ) {
    return ListView.builder(
      controller: _scrollController,
      reverse: true,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      itemCount: chatState.messages.length +
          (chatState.isLoadingOlder ? 1 : 0),
      itemBuilder: (context, index) {
        // Loading older indicator at the end (top of reversed list)
        if (index == chatState.messages.length) {
          return const Center(
            child: Padding(
              padding: EdgeInsets.all(16),
              child: CircularProgressIndicator(),
            ),
          );
        }

        final message = chatState.messages[index];
        final isSent = message.senderId == currentUserId;

        // Date separator
        final showDateSeparator = _shouldShowDateSeparator(
          chatState.messages,
          index,
        );

        return Column(
          children: [
            if (showDateSeparator)
              _buildDateSeparator(message.createdAtDate),
            MessageBubble(message: message, isSent: isSent),
          ],
        );
      },
    );
  }

  bool _shouldShowDateSeparator(
      List<dynamic> messages, int index) {
    if (index == messages.length - 1) return true;
    final current = messages[index].createdAtDate;
    final next = messages[index + 1].createdAtDate;
    return current.day != next.day ||
        current.month != next.month ||
        current.year != next.year;
  }

  Widget _buildDateSeparator(DateTime date) {
    final now = DateTime.now();
    final diff = now.difference(date);
    String label;

    if (diff.inDays == 0 && now.day == date.day) {
      label = "Aujourd'hui";
    } else if (diff.inDays == 1 ||
        (diff.inDays == 0 && now.day != date.day)) {
      label = 'Hier';
    } else {
      label = DateFormat('dd MMMM yyyy', 'fr').format(date);
    }

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 12),
      child: Center(
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
          decoration: BoxDecoration(
            color: TekaColors.muted,
            borderRadius: BorderRadius.circular(12),
          ),
          child: Text(
            label,
            style: const TextStyle(
              fontSize: 12,
              color: TekaColors.mutedForeground,
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildInputBar(AppLocalizations l10n, bool isSending) {
    return Container(
      padding: EdgeInsets.only(
        left: 16,
        right: 8,
        top: 8,
        bottom: MediaQuery.of(context).padding.bottom + 8,
      ),
      decoration: BoxDecoration(
        color: TekaColors.background,
        border: Border(
          top: BorderSide(color: TekaColors.border),
        ),
      ),
      child: Row(
        children: [
          Expanded(
            child: TextField(
              controller: _messageController,
              textCapitalization: TextCapitalization.sentences,
              maxLines: 4,
              minLines: 1,
              decoration: InputDecoration(
                hintText: l10n.typePlaceholder,
                hintStyle: const TextStyle(color: TekaColors.mutedForeground),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(24),
                  borderSide: BorderSide(color: TekaColors.border),
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(24),
                  borderSide: BorderSide(color: TekaColors.border),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(24),
                  borderSide: const BorderSide(color: TekaColors.tekaRed),
                ),
                contentPadding: const EdgeInsets.symmetric(
                  horizontal: 16,
                  vertical: 10,
                ),
                isDense: true,
              ),
              onSubmitted: (_) => _sendMessage(),
            ),
          ),
          const SizedBox(width: 8),
          SizedBox(
            width: 44,
            height: 44,
            child: isSending
                ? const Center(
                    child: SizedBox(
                      width: 24,
                      height: 24,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    ),
                  )
                : IconButton(
                    onPressed: _sendMessage,
                    icon: const Icon(Icons.send_rounded),
                    color: TekaColors.tekaRed,
                    tooltip: l10n.sendMessage,
                  ),
          ),
        ],
      ),
    );
  }

  Widget _buildEmptyMessages(AppLocalizations l10n) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.chat_bubble_outline,
              size: 48, color: TekaColors.mutedForeground),
          const SizedBox(height: 12),
          Text(
            l10n.noMessages,
            style: const TextStyle(color: TekaColors.mutedForeground),
          ),
        ],
      ),
    );
  }

  Widget _buildError(AppLocalizations l10n) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.error_outline,
              size: 48, color: TekaColors.destructive),
          const SizedBox(height: 12),
          Text(l10n.authGenericError),
          const SizedBox(height: 16),
          ElevatedButton(
            onPressed: () => ref
                .read(chatProvider(widget.conversationId).notifier)
                .loadMessages(),
            child: Text(l10n.loadMore),
          ),
        ],
      ),
    );
  }
}
