import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../../../l10n/app_localizations.dart';
import '../../data/models/checkout_model.dart';

class CheckoutSuccessScreen extends ConsumerWidget {
  final List<CheckoutOrderModel> orders;

  const CheckoutSuccessScreen({
    super.key,
    required this.orders,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context)!;

    return Scaffold(
      body: SafeArea(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(32),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(
                  Icons.check_circle,
                  color: TekaColors.success,
                  size: 80,
                ),
                const SizedBox(height: 24),
                Text(
                  l10n.checkoutSuccess,
                  style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                        fontWeight: FontWeight.bold,
                        color: TekaColors.foreground,
                      ),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 8),
                Text(
                  l10n.checkoutSuccessMessage,
                  style: const TextStyle(
                    color: TekaColors.mutedForeground,
                    fontSize: 14,
                  ),
                  textAlign: TextAlign.center,
                ),
                if (orders.isNotEmpty) ...[
                  const SizedBox(height: 20),
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: TekaColors.muted,
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Column(
                      children: orders
                          .map(
                            (order) => Padding(
                              padding: const EdgeInsets.symmetric(vertical: 4),
                              child: Row(
                                mainAxisAlignment:
                                    MainAxisAlignment.spaceBetween,
                                children: [
                                  Text(
                                    '#${order.orderNumber}',
                                    style: const TextStyle(
                                      fontWeight: FontWeight.w600,
                                      fontSize: 14,
                                      color: TekaColors.foreground,
                                    ),
                                  ),
                                  Text(
                                    order.status,
                                    style: const TextStyle(
                                      color: TekaColors.mutedForeground,
                                      fontSize: 13,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          )
                          .toList(),
                    ),
                  ),
                ],
                const SizedBox(height: 32),
                SizedBox(
                  width: double.infinity,
                  child: FilledButton(
                    onPressed: () => context.go('/orders'),
                    style: FilledButton.styleFrom(
                      backgroundColor: TekaColors.tekaRed,
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      textStyle: const TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    child: Text(l10n.checkoutViewOrders),
                  ),
                ),
                const SizedBox(height: 12),
                SizedBox(
                  width: double.infinity,
                  child: OutlinedButton(
                    onPressed: () => context.go('/'),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: TekaColors.foreground,
                      side: const BorderSide(color: TekaColors.border),
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      textStyle: const TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    child: Text(l10n.checkoutContinueShopping),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
