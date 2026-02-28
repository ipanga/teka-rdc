import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../data/models/conversation_model.dart';

class MessageBubble extends StatelessWidget {
  final MessageModel message;
  final bool isSent;

  const MessageBubble({
    super.key,
    required this.message,
    required this.isSent,
  });

  @override
  Widget build(BuildContext context) {
    final timeStr = DateFormat('HH:mm').format(message.createdAtDate);

    return Align(
      alignment: isSent ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: EdgeInsets.only(
          left: isSent ? 48 : 0,
          right: isSent ? 0 : 48,
          bottom: 6,
        ),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(
          color: isSent
              ? TekaColors.tekaRed
              : TekaColors.muted,
          borderRadius: BorderRadius.only(
            topLeft: const Radius.circular(16),
            topRight: const Radius.circular(16),
            bottomLeft: isSent
                ? const Radius.circular(16)
                : const Radius.circular(4),
            bottomRight: isSent
                ? const Radius.circular(4)
                : const Radius.circular(16),
          ),
        ),
        child: Column(
          crossAxisAlignment:
              isSent ? CrossAxisAlignment.end : CrossAxisAlignment.start,
          children: [
            Text(
              message.content,
              style: TextStyle(
                fontSize: 14,
                height: 1.4,
                color: isSent ? Colors.white : TekaColors.foreground,
              ),
            ),
            const SizedBox(height: 3),
            Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  timeStr,
                  style: TextStyle(
                    fontSize: 11,
                    color: isSent
                        ? Colors.white.withValues(alpha: 0.7)
                        : TekaColors.mutedForeground,
                  ),
                ),
                if (isSent) ...[
                  const SizedBox(width: 4),
                  Icon(
                    message.isRead ? Icons.done_all : Icons.done,
                    size: 14,
                    color: message.isRead
                        ? Colors.white
                        : Colors.white.withValues(alpha: 0.7),
                  ),
                ],
              ],
            ),
          ],
        ),
      ),
    );
  }
}
