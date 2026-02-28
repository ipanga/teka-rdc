import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../../../l10n/app_localizations.dart';
import '../../../auth/presentation/providers/auth_provider.dart';
import '../providers/messaging_provider.dart';
import '../widgets/message_bubble.dart';

class ChatScreen extends ConsumerStatefulWidget {
  final String conversationId;
  final String? sellerId;

  const ChatScreen({
    super.key,
    required this.conversationId,
    this.sellerId,
  });

  @override
  ConsumerState<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends ConsumerState<ChatScreen> {
  final _messageController = TextEditingController();
  final _scrollController = ScrollController();
  bool _isLoadingOlder = false;

  @override
  void initState() {
    super.initState();
    // Load messages for this conversation
    if (widget.conversationId.isNotEmpty) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        ref
            .read(messagingProvider.notifier)
            .loadMessages(widget.conversationId);
      });
    }

    _scrollController.addListener(_onScroll);
  }

  @override
  void dispose() {
    _messageController.dispose();
    _scrollController.removeListener(_onScroll);
    _scrollController.dispose();
    // Stop polling when leaving chat
    ref.read(messagingProvider.notifier).stopPolling();
    super.dispose();
  }

  void _onScroll() {
    // Load older messages when scrolling to the bottom (reversed list)
    if (_scrollController.position.pixels >=
            _scrollController.position.maxScrollExtent - 100 &&
        !_isLoadingOlder) {
      _loadOlderMessages();
    }
  }

  Future<void> _loadOlderMessages() async {
    if (_isLoadingOlder) return;
    setState(() {
      _isLoadingOlder = true;
    });
    await ref
        .read(messagingProvider.notifier)
        .loadOlderMessages(widget.conversationId);
    if (mounted) {
      setState(() {
        _isLoadingOlder = false;
      });
    }
  }

  Future<void> _sendMessage() async {
    final content = _messageController.text.trim();
    if (content.isEmpty) return;

    _messageController.clear();

    await ref.read(messagingProvider.notifier).sendMessage(
          conversationId:
              widget.conversationId.isNotEmpty ? widget.conversationId : null,
          sellerId: widget.sellerId,
          content: content,
        );

    // Scroll to bottom after sending
    if (_scrollController.hasClients) {
      _scrollController.animateTo(
        0,
        duration: const Duration(milliseconds: 300),
        curve: Curves.easeOut,
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final messagingState = ref.watch(messagingProvider);
    final authState = ref.watch(authProvider);
    final currentUserId = authState.user?['id'] as String? ?? '';

    // Get conversation title
    final conversation = messagingState.conversations.where(
      (c) => c.id == widget.conversationId,
    );
    final title = conversation.isNotEmpty
        ? conversation.first.otherParty?.displayName ?? l10n.messagesTitle
        : l10n.messagesTitle;

    return Scaffold(
      appBar: AppBar(
        title: Text(title),
      ),
      body: Column(
        children: [
          // Messages list
          Expanded(
            child: messagingState.isLoading &&
                    messagingState.currentMessages.isEmpty
                ? const Center(
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : messagingState.error != null &&
                        messagingState.currentMessages.isEmpty
                    ? Center(
                        child: Padding(
                          padding: const EdgeInsets.all(24),
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              const Icon(
                                Icons.error_outline,
                                size: 48,
                                color: TekaColors.mutedForeground,
                              ),
                              const SizedBox(height: 12),
                              Text(
                                messagingState.error!,
                                textAlign: TextAlign.center,
                                style: const TextStyle(
                                  color: TekaColors.mutedForeground,
                                ),
                              ),
                            ],
                          ),
                        ),
                      )
                    : messagingState.currentMessages.isEmpty
                        ? Center(
                            child: Column(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                const Icon(
                                  Icons.chat_bubble_outline,
                                  size: 64,
                                  color: TekaColors.mutedForeground,
                                ),
                                const SizedBox(height: 12),
                                Text(
                                  l10n.noMessages,
                                  style: const TextStyle(
                                    color: TekaColors.mutedForeground,
                                    fontSize: 14,
                                  ),
                                ),
                              ],
                            ),
                          )
                        : ListView.builder(
                            controller: _scrollController,
                            reverse: true,
                            padding: const EdgeInsets.symmetric(
                              horizontal: 16,
                              vertical: 8,
                            ),
                            itemCount:
                                messagingState.currentMessages.length +
                                    (_isLoadingOlder ? 1 : 0),
                            itemBuilder: (context, index) {
                              if (_isLoadingOlder &&
                                  index ==
                                      messagingState
                                          .currentMessages.length) {
                                return const Padding(
                                  padding: EdgeInsets.all(16),
                                  child: Center(
                                    child: SizedBox(
                                      width: 20,
                                      height: 20,
                                      child: CircularProgressIndicator(
                                        strokeWidth: 2,
                                      ),
                                    ),
                                  ),
                                );
                              }

                              final message =
                                  messagingState.currentMessages[index];
                              final isSent =
                                  message.senderId == currentUserId;

                              // Date separator
                              Widget? dateSeparator;
                              if (index <
                                  messagingState.currentMessages.length -
                                      1) {
                                final current =
                                    DateTime.tryParse(message.createdAt);
                                final next = DateTime.tryParse(messagingState
                                    .currentMessages[index + 1].createdAt);
                                if (current != null &&
                                    next != null &&
                                    (current.day != next.day ||
                                        current.month != next.month ||
                                        current.year != next.year)) {
                                  dateSeparator = _DateSeparator(
                                    date: messagingState
                                        .currentMessages[index + 1]
                                        .createdAt,
                                  );
                                }
                              } else if (index ==
                                  messagingState.currentMessages.length -
                                      1) {
                                dateSeparator = _DateSeparator(
                                  date: message.createdAt,
                                );
                              }

                              return Column(
                                children: [
                                  MessageBubble(
                                    content: message.content,
                                    createdAt: message.createdAt,
                                    isSent: isSent,
                                  ),
                                  if (dateSeparator != null) dateSeparator,
                                ],
                              );
                            },
                          ),
          ),

          // Message input
          Container(
            padding: EdgeInsets.only(
              left: 16,
              right: 8,
              top: 8,
              bottom: 8 + MediaQuery.of(context).viewPadding.bottom,
            ),
            decoration: const BoxDecoration(
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
                    maxLines: 4,
                    minLines: 1,
                    textInputAction: TextInputAction.send,
                    onSubmitted: (_) => _sendMessage(),
                    decoration: InputDecoration(
                      hintText: l10n.typePlaceholder,
                      hintStyle: const TextStyle(
                        color: TekaColors.mutedForeground,
                        fontSize: 14,
                      ),
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(24),
                        borderSide:
                            const BorderSide(color: TekaColors.border),
                      ),
                      enabledBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(24),
                        borderSide:
                            const BorderSide(color: TekaColors.border),
                      ),
                      focusedBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(24),
                        borderSide:
                            const BorderSide(color: TekaColors.tekaRed),
                      ),
                      contentPadding: const EdgeInsets.symmetric(
                        horizontal: 16,
                        vertical: 10,
                      ),
                      isDense: true,
                    ),
                    style: const TextStyle(fontSize: 14),
                  ),
                ),
                const SizedBox(width: 4),
                IconButton(
                  onPressed: messagingState.isSending ? null : _sendMessage,
                  icon: messagingState.isSending
                      ? const SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(
                          Icons.send,
                          color: TekaColors.tekaRed,
                        ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _DateSeparator extends StatelessWidget {
  final String date;

  const _DateSeparator({required this.date});

  @override
  Widget build(BuildContext context) {
    String label;
    try {
      final d = DateTime.parse(date);
      final now = DateTime.now();
      final today = DateTime(now.year, now.month, now.day);
      final yesterday = today.subtract(const Duration(days: 1));
      final dateOnly = DateTime(d.year, d.month, d.day);

      if (dateOnly == today) {
        label = "Aujourd'hui";
      } else if (dateOnly == yesterday) {
        label = 'Hier';
      } else {
        label =
            '${d.day.toString().padLeft(2, '0')}/${d.month.toString().padLeft(2, '0')}/${d.year}';
      }
    } catch (_) {
      label = date;
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
              color: TekaColors.mutedForeground,
              fontSize: 11,
            ),
          ),
        ),
      ),
    );
  }
}
