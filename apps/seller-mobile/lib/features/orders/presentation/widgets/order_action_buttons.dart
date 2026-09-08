import 'package:flutter/material.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../../../core/theme/teka_spacing.dart';
import '../../data/models/order_model.dart';

/// The seller's transition buttons for the three statuses the seller drives.
/// Colours come from the theme (primary = brand red for the one primary
/// action, destructive outline for « Refuser »). While [busy] every button is
/// disabled and the primary one shows progress in place, so a second tap
/// cannot start a second transition and the bar never disappears under the
/// seller's finger.
class OrderActionButtons extends StatelessWidget {
  final OrderStatus status;
  final bool busy;
  final VoidCallback? onConfirm;
  final VoidCallback? onReject;
  final VoidCallback? onProcess;
  final VoidCallback? onReadyForPickup;

  const OrderActionButtons({
    super.key,
    required this.status,
    this.busy = false,
    this.onConfirm,
    this.onReject,
    this.onProcess,
    this.onReadyForPickup,
  });

  /// The primary button's label for a status the seller drives; null for
  /// every Teka-managed or terminal status.
  static String? primaryLabel(OrderStatus status) => switch (status) {
        OrderStatus.pending => 'Confirmer la commande',
        OrderStatus.confirmed => 'Commencer la préparation',
        OrderStatus.processing => 'Marquer prête pour collecte',
        _ => null,
      };

  @override
  Widget build(BuildContext context) {
    final label = primaryLabel(status);
    if (label == null) return const SizedBox.shrink();
    final onPrimary = switch (status) {
      OrderStatus.pending => onConfirm,
      OrderStatus.confirmed => onProcess,
      _ => onReadyForPickup,
    };
    final primary = _BusyButton(
        label: label, busy: busy, onPressed: busy ? null : onPrimary);
    if (status != OrderStatus.pending) {
      return SizedBox(width: double.infinity, child: primary);
    }
    final reject = OutlinedButton(
      onPressed: busy ? null : onReject,
      style: OutlinedButton.styleFrom(
        foregroundColor: TekaColors.destructiveForeground,
        side: const BorderSide(color: TekaColors.destructive),
        padding: const EdgeInsets.symmetric(vertical: TekaSpacing.sm),
      ),
      child: const Text('Refuser'),
    );
    return LayoutBuilder(
      builder: (context, constraints) {
        final stack = constraints.maxWidth < 360 ||
            MediaQuery.textScalerOf(context).scale(1) > 1.3;
        if (stack) {
          return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [primary, const SizedBox(height: TekaSpacing.xs), reject],
          );
        }
        return Row(children: [
          Expanded(child: reject),
          const SizedBox(width: TekaSpacing.sm),
          Expanded(flex: 2, child: primary),
        ]);
      },
    );
  }
}

class _BusyButton extends StatelessWidget {
  const _BusyButton(
      {required this.label, required this.busy, required this.onPressed});
  final String label;
  final bool busy;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) => Semantics(
        label: busy ? '$label, en cours' : null,
        child: ElevatedButton(
          onPressed: onPressed,
          style: ElevatedButton.styleFrom(
              padding: const EdgeInsets.symmetric(vertical: TekaSpacing.sm)),
          child: busy
              ? const SizedBox(
                  width: 20,
                  height: 20,
                  child: CircularProgressIndicator(
                      strokeWidth: 2, color: Colors.white))
              : Text(label, textAlign: TextAlign.center),
        ),
      );
}
