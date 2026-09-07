import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/layout/responsive.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../../../core/theme/teka_spacing.dart';
import '../../../orders/domain/order_status.dart';
import '../../data/models/checkout_model.dart';

class CheckoutSuccessScreen extends ConsumerWidget {
  final List<CheckoutOrderModel> orders;

  const CheckoutSuccessScreen({
    super.key,
    required this.orders,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      body: ReadableColumn(
        padding: EdgeInsets.zero,
        child: SafeArea(
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
                  "Commande confirmée !",
                  style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                        fontWeight: FontWeight.bold,
                        color: TekaColors.foreground,
                      ),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 8),
                Text(
                  "Votre commande a été passée avec succès.",
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
                      borderRadius: TekaRadius.mdAll,
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
                                    // Was `order.status` — the raw enum
                                    // (« PENDING ») on the buyer's success
                                    // screen (PR D3).
                                    orderStatusLabel(order.status),
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
                const SizedBox(height: TekaSpacing.md),
                // What happens next. The screen said the order was confirmed
                // and stopped there, which on a Cash-on-Delivery marketplace
                // leaves the two questions that actually matter unanswered:
                // when do I pay, and who brings it (UX PR C). The wording
                // follows the real workflow — the seller prepares, Teka
                // collects, Teka delivers and takes the cash.
                DecoratedBox(
                  decoration: const BoxDecoration(
                    color: TekaColors.successSubtle,
                    borderRadius: TekaRadius.mdAll,
                  ),
                  child: const Padding(
                    padding: EdgeInsets.all(TekaSpacing.sm),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Icon(
                          Icons.local_shipping_outlined,
                          size: 18,
                          color: TekaColors.success,
                        ),
                        SizedBox(width: TekaSpacing.xs),
                        Expanded(
                          child: Text(
                            "Le vendeur prépare votre colis, puis Teka le "
                            "collecte et vous le livre. Vous payez en espèces "
                            "au livreur à la réception.",
                            style: TextStyle(
                              color: TekaColors.foreground,
                              fontSize: 13,
                              height: 1.4,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: TekaSpacing.xl),
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
                    child: Text("Voir mes commandes"),
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
                    child: Text("Continuer mes achats"),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
      ),
    );
  }
}
