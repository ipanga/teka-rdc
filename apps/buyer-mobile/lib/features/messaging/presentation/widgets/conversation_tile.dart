import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../data/models/conversation_model.dart';

class ConversationTile extends StatelessWidget {
  final ConversationModel conversation;
  final VoidCallback onTap;

  const ConversationTile({
    super.key,
    required this.conversation,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final name = conversation.otherParty?.displayName ?? 'Vendeur';
    final lastMessage = conversation.lastMessage ?? '';
    final hasUnread = conversation.unreadCount > 0;
    final timeStr = _formatTime(conversation.lastMessageAt);

    return InkWell(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        child: Row(
          children: [
            // Avatar
            CircleAvatar(
              radius: 24,
              backgroundColor: TekaColors.muted,
              backgroundImage: conversation.otherParty?.avatar != null &&
                      conversation.otherParty!.avatar!.isNotEmpty
                  ? NetworkImage(conversation.otherParty!.avatar!)
                  : null,
              child: conversation.otherParty?.avatar == null ||
                      conversation.otherParty!.avatar!.isEmpty
                  ? Text(
                      name.isNotEmpty ? name[0].toUpperCase() : 'V',
                      style: const TextStyle(
                        color: TekaColors.mutedForeground,
                        fontWeight: FontWeight.w600,
                        fontSize: 18,
                      ),
                    )
                  : null,
            ),
            const SizedBox(width: 12),
            // Name and last message
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          name,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            fontWeight: hasUnread
                                ? FontWeight.bold
                                : FontWeight.w500,
                            fontSize: 14,
                            color: TekaColors.foreground,
                          ),
                        ),
                      ),
                      if (timeStr.isNotEmpty)
                        Text(
                          timeStr,
                          style: TextStyle(
                            fontSize: 11,
                            color: hasUnread
                                ? TekaColors.tekaRed
                                : TekaColors.mutedForeground,
                            fontWeight: hasUnread
                                ? FontWeight.w600
                                : FontWeight.normal,
                          ),
                        ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          lastMessage,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            fontSize: 13,
                            color: hasUnread
                                ? TekaColors.foreground
                                : TekaColors.mutedForeground,
                            fontWeight: hasUnread
                                ? FontWeight.w500
                                : FontWeight.normal,
                          ),
                        ),
                      ),
                      if (hasUnread) ...[
                        const SizedBox(width: 8),
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 6,
                            vertical: 2,
                          ),
                          decoration: const BoxDecoration(
                            color: TekaColors.tekaRed,
                            shape: BoxShape.circle,
                          ),
                          constraints: const BoxConstraints(
                            minWidth: 20,
                            minHeight: 20,
                          ),
                          child: Text(
                            conversation.unreadCount > 99
                                ? '99+'
                                : '${conversation.unreadCount}',
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 10,
                              fontWeight: FontWeight.bold,
                            ),
                            textAlign: TextAlign.center,
                          ),
                        ),
                      ],
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  String _formatTime(String? dateStr) {
    if (dateStr == null || dateStr.isEmpty) return '';
    try {
      final date = DateTime.parse(dateStr);
      final now = DateTime.now();
      final diff = now.difference(date);

      if (diff.inMinutes < 1) return 'maintenant';
      if (diff.inHours < 1) return '${diff.inMinutes} min';
      if (diff.inDays < 1) return DateFormat('HH:mm', 'fr').format(date);
      if (diff.inDays < 7) return DateFormat('EEE', 'fr').format(date);
      return DateFormat('dd/MM', 'fr').format(date);
    } catch (_) {
      return '';
    }
  }
}
