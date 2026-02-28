import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

class WalletCard extends StatelessWidget {
  final String label;
  final int amountCDF;
  final IconData icon;
  final Color color;

  const WalletCard({
    super.key,
    required this.label,
    required this.amountCDF,
    required this.icon,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    final priceFormat = NumberFormat('#,###', 'fr');

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withValues(alpha: 0.2)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Row(
            children: [
              Icon(icon, size: 18, color: color),
              const Spacer(),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            '${priceFormat.format(amountCDF)} CDF',
            style: TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.bold,
              color: color,
            ),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
          const SizedBox(height: 2),
          Text(
            label,
            style: TextStyle(
              fontSize: 11,
              color: color.withValues(alpha: 0.8),
              fontWeight: FontWeight.w500,
            ),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ],
      ),
    );
  }
}
