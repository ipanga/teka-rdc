import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../data/models/order_model.dart';
import 'order_status_badge.dart';

class OrderTimeline extends StatelessWidget {
  final List<OrderStatusLogModel> statusLogs;

  const OrderTimeline({super.key, required this.statusLogs});

  @override
  Widget build(BuildContext context) {
    if (statusLogs.isEmpty) return const SizedBox.shrink();

    // Most recent first
    final sortedLogs = List<OrderStatusLogModel>.from(statusLogs)
      ..sort((a, b) {
        try {
          return DateTime.parse(b.createdAt)
              .compareTo(DateTime.parse(a.createdAt));
        } catch (_) {
          return 0;
        }
      });

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (var i = 0; i < sortedLogs.length; i++)
          _TimelineEntry(
            log: sortedLogs[i],
            isFirst: i == 0,
            isLast: i == sortedLogs.length - 1,
          ),
      ],
    );
  }
}

class _TimelineEntry extends StatelessWidget {
  final OrderStatusLogModel log;
  final bool isFirst;
  final bool isLast;

  const _TimelineEntry({
    required this.log,
    required this.isFirst,
    required this.isLast,
  });

  @override
  Widget build(BuildContext context) {
    final dateStr = _formatDate(log.createdAt);

    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Timeline line + dot
          SizedBox(
            width: 24,
            child: Column(
              children: [
                // Line above dot
                if (!isFirst)
                  Expanded(
                    child: Container(
                      width: 2,
                      color: TekaColors.border,
                    ),
                  )
                else
                  const SizedBox(height: 4),
                // Dot
                Container(
                  width: 12,
                  height: 12,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: isFirst ? TekaColors.tekaRed : TekaColors.border,
                    border: Border.all(
                      color: isFirst
                          ? TekaColors.tekaRed
                          : TekaColors.mutedForeground,
                      width: 2,
                    ),
                  ),
                ),
                // Line below dot
                if (!isLast)
                  Expanded(
                    child: Container(
                      width: 2,
                      color: TekaColors.border,
                    ),
                  )
                else
                  const SizedBox(height: 4),
              ],
            ),
          ),
          const SizedBox(width: 12),
          // Content
          Expanded(
            child: Padding(
              padding: const EdgeInsets.only(bottom: 16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  OrderStatusBadge(status: log.toStatus),
                  const SizedBox(height: 4),
                  Text(
                    dateStr,
                    style: const TextStyle(
                      color: TekaColors.mutedForeground,
                      fontSize: 12,
                    ),
                  ),
                  if (log.note != null && log.note!.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(top: 4),
                      child: Text(
                        log.note!,
                        style: const TextStyle(
                          color: TekaColors.foreground,
                          fontSize: 13,
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  String _formatDate(String dateStr) {
    try {
      final date = DateTime.parse(dateStr);
      return DateFormat('dd/MM/yyyy HH:mm', 'fr').format(date);
    } catch (_) {
      return dateStr;
    }
  }
}
