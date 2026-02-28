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
    final name = conversation.otherParty?.fullName ?? '---';
    final initials = conversation.otherParty?.initials ?? '?';
    final lastMessage = conversation.lastMessage?.content ?? '';
    final hasUnread = conversation.unreadCount > 0;
    final timeStr = _formatTime(conversation.lastMessageAtDate);

    return InkWell(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        decoration: BoxDecoration(
          color: hasUnread
              ? TekaColors.tekaRed.withValues(alpha: 0.04)
              : TekaColors.background,
          border: Border(
            bottom: BorderSide(color: TekaColors.border.withValues(alpha: 0.5)),
          ),
        ),
        child: Row(
          children: [
            // Avatar
            CircleAvatar(
              radius: 22,
              backgroundColor: TekaColors.muted,
              backgroundImage: conversation.otherParty?.avatar != null
                  ? NetworkImage(conversation.otherParty!.avatar!)
                  : null,
              child: conversation.otherParty?.avatar == null
                  ? Text(
                      initials,
                      style: const TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                        color: TekaColors.mutedForeground,
                      ),
                    )
                  : null,
            ),
            const SizedBox(width: 12),

            // Name + last message
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          name,
                          style: TextStyle(
                            fontWeight:
                                hasUnread ? FontWeight.w700 : FontWeight.w500,
                            fontSize: 15,
                            color: TekaColors.foreground,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      if (timeStr.isNotEmpty) ...[
                        const SizedBox(width: 8),
                        Text(
                          timeStr,
                          style: TextStyle(
                            fontSize: 12,
                            color: hasUnread
                                ? TekaColors.tekaRed
                                : TekaColors.mutedForeground,
                            fontWeight: hasUnread
                                ? FontWeight.w600
                                : FontWeight.normal,
                          ),
                        ),
                      ],
                    ],
                  ),
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          lastMessage,
                          style: TextStyle(
                            fontSize: 13,
                            color: hasUnread
                                ? TekaColors.foreground
                                : TekaColors.mutedForeground,
                            fontWeight: hasUnread
                                ? FontWeight.w500
                                : FontWeight.normal,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      if (hasUnread) ...[
                        const SizedBox(width: 8),
                        Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 7, vertical: 2),
                          decoration: BoxDecoration(
                            color: TekaColors.tekaRed,
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: Text(
                            conversation.unreadCount > 99
                                ? '99+'
                                : conversation.unreadCount.toString(),
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 11,
                              fontWeight: FontWeight.w600,
                            ),
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

  String _formatTime(DateTime? dateTime) {
    if (dateTime == null) return '';
    final now = DateTime.now();
    final diff = now.difference(dateTime);

    if (diff.inMinutes < 1) return 'maintenant';
    if (diff.inHours < 1) return '${diff.inMinutes} min';
    if (diff.inDays < 1) return DateFormat('HH:mm').format(dateTime);
    if (diff.inDays < 7) return DateFormat('EEE', 'fr').format(dateTime);
    return DateFormat('dd/MM', 'fr').format(dateTime);
  }
}
