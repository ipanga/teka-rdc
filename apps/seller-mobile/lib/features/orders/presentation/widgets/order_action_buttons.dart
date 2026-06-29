import 'package:flutter/material.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../data/models/order_model.dart';

class OrderActionButtons extends StatelessWidget {
  final OrderStatus status;
  final VoidCallback? onConfirm;
  final VoidCallback? onReject;
  final VoidCallback? onProcess;
  final VoidCallback? onReadyForPickup;

  const OrderActionButtons({
    super.key,
    required this.status,
    this.onConfirm,
    this.onReject,
    this.onProcess,
    this.onReadyForPickup,
  });

  @override
  Widget build(BuildContext context) {
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
                child: Text("Rejeter"),
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
                child: Text("Confirmer"),
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
            child: Text("Preparer"),
          ),
        );

      case OrderStatus.processing:
        return SizedBox(
          width: double.infinity,
          child: ElevatedButton(
            onPressed: onReadyForPickup,
            style: ElevatedButton.styleFrom(
              backgroundColor: TekaColors.tekaRed,
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(vertical: 12),
            ),
            child: Text("Prête pour collecte"),
          ),
        );

      // Once ready for pickup, delivery + cash collection are handled by Teka —
      // the seller has no further action.
      case OrderStatus.readyForTekaPickup:
      case OrderStatus.receivedAtTeka:
      case OrderStatus.shipped:
      case OrderStatus.outForDelivery:
      case OrderStatus.delivered:
      case OrderStatus.cancelled:
      case OrderStatus.returned:
        return const SizedBox.shrink();
    }
  }
}
