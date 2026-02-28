import 'package:flutter/material.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../../../l10n/app_localizations.dart';
import '../../data/models/order_model.dart';

class OrderActionButtons extends StatelessWidget {
  final OrderStatus status;
  final VoidCallback? onConfirm;
  final VoidCallback? onReject;
  final VoidCallback? onProcess;
  final VoidCallback? onShip;
  final VoidCallback? onOutForDelivery;
  final VoidCallback? onDeliver;

  const OrderActionButtons({
    super.key,
    required this.status,
    this.onConfirm,
    this.onReject,
    this.onProcess,
    this.onShip,
    this.onOutForDelivery,
    this.onDeliver,
  });

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;

    switch (status) {
      case OrderStatus.pending:
        return Row(
          children: [
            Expanded(
              child: OutlinedButton(
                onPressed: onReject,
                style: OutlinedButton.styleFrom(
                  foregroundColor: TekaColors.destructive,
                  side: const BorderSide(color: TekaColors.destructive),
                  padding: const EdgeInsets.symmetric(vertical: 12),
                ),
                child: Text(l10n.orderReject),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: ElevatedButton(
                onPressed: onConfirm,
                style: ElevatedButton.styleFrom(
                  backgroundColor: TekaColors.tekaRed,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 12),
                ),
                child: Text(l10n.orderConfirm),
              ),
            ),
          ],
        );

      case OrderStatus.confirmed:
        return SizedBox(
          width: double.infinity,
          child: ElevatedButton(
            onPressed: onProcess,
            style: ElevatedButton.styleFrom(
              backgroundColor: TekaColors.tekaRed,
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(vertical: 12),
            ),
            child: Text(l10n.orderProcess),
          ),
        );

      case OrderStatus.processing:
        return SizedBox(
          width: double.infinity,
          child: ElevatedButton(
            onPressed: onShip,
            style: ElevatedButton.styleFrom(
              backgroundColor: TekaColors.tekaRed,
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(vertical: 12),
            ),
            child: Text(l10n.orderShip),
          ),
        );

      case OrderStatus.shipped:
        return Row(
          children: [
            Expanded(
              child: OutlinedButton(
                onPressed: onOutForDelivery,
                style: OutlinedButton.styleFrom(
                  padding: const EdgeInsets.symmetric(vertical: 12),
                ),
                child: Text(l10n.orderOutForDelivery),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: ElevatedButton(
                onPressed: onDeliver,
                style: ElevatedButton.styleFrom(
                  backgroundColor: TekaColors.tekaRed,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 12),
                ),
                child: Text(l10n.orderDeliver),
              ),
            ),
          ],
        );

      case OrderStatus.outForDelivery:
        return SizedBox(
          width: double.infinity,
          child: ElevatedButton(
            onPressed: onDeliver,
            style: ElevatedButton.styleFrom(
              backgroundColor: TekaColors.tekaRed,
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(vertical: 12),
            ),
            child: Text(l10n.orderDeliver),
          ),
        );

      case OrderStatus.delivered:
      case OrderStatus.cancelled:
      case OrderStatus.returned:
        return const SizedBox.shrink();
    }
  }
}
