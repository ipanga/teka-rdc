import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../../../../core/theme/teka_colors.dart';

class MessageBubble extends StatelessWidget {
  final String content;
  final String createdAt;
  final bool isSent;

  const MessageBubble({
    super.key,
    required this.content,
    required this.createdAt,
    required this.isSent,
  });

  @override
  Widget build(BuildContext context) {
    final timeStr = _formatTime(createdAt);

    return Align(
      alignment: isSent ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        constraints: BoxConstraints(
          maxWidth: MediaQuery.of(context).size.width * 0.75,
        ),
        margin: EdgeInsets.only(
          left: isSent ? 48 : 0,
          right: isSent ? 0 : 48,
          bottom: 4,
        ),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(
          color: isSent ? TekaColors.tekaRed : TekaColors.muted,
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
              content,
              style: TextStyle(
                color: isSent ? Colors.white : TekaColors.foreground,
                fontSize: 14,
                height: 1.4,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              timeStr,
              style: TextStyle(
                color: isSent
                    ? Colors.white.withOpacity(0.7)
                    : TekaColors.mutedForeground,
                fontSize: 10,
              ),
            ),
          ],
        ),
      ),
    );
  }

  String _formatTime(String dateStr) {
    try {
      final date = DateTime.parse(dateStr);
      return DateFormat('HH:mm', 'fr').format(date);
    } catch (_) {
      return '';
    }
  }
}
