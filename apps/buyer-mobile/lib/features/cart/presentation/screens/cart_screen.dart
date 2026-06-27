import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../../../core/utils/price_formatter.dart';
import '../../../../core/widgets/app_states.dart';
import '../providers/cart_provider.dart';
import '../widgets/cart_item_tile.dart';

class CartScreen extends ConsumerWidget {
  const CartScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cartState = ref.watch(cartProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Panier'),
        actions: [
          if (cartState.items.isNotEmpty)
            IconButton(
              icon: const Icon(Icons.delete_sweep_outlined),
              tooltip: 'Supprimer',
              onPressed: () => _confirmClearCart(context, ref),
            ),
        ],
      ),
      body: cartState.isLoading
          ? const Center(
              child: CircularProgressIndicator(strokeWidth: 2),
            )
          : cartState.isEmpty
              ? AppEmptyState(
                  icon: Icons.shopping_cart_outlined,
                  title: 'Votre panier est vide',
                  actionLabel: 'Découvrir nos produits',
                  onAction: () => context.go('/categories'),
                )
              : RefreshIndicator(
                  color: TekaColors.tekaRed,
                  onRefresh: () => ref.read(cartProvider.notifier).fetchCart(),
                  child: ListView.builder(
                    physics: const AlwaysScrollableScrollPhysics(),
                    itemCount: cartState.items.length,
                    itemBuilder: (context, index) {
                      final item = cartState.items[index];
                      return CartItemTile(
                        item: item,
                        onQuantityChanged: (newQuantity) {
                          ref
                              .read(cartProvider.notifier)
                              .updateQuantity(item.productId, newQuantity);
                        },
                        onRemove: () {
                          ref
                              .read(cartProvider.notifier)
                              .removeItem(item.productId);
                        },
                      );
                    },
                  ),
                ),
      bottomNavigationBar: cartState.items.isNotEmpty
          ? _CartBottomBar(
              totalCDF: cartState.totalCDF,
              totalItems: cartState.totalItems,
              onCheckout: () => context.push('/checkout'),
            )
          : null,
    );
  }

  void _confirmClearCart(
    BuildContext context,
    WidgetRef ref,
  ) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Supprimer'),
        content: const Text('Supprimer tous les produits du panier ?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Annuler'),
          ),
          FilledButton(
            onPressed: () {
              ref.read(cartProvider.notifier).clearCart();
              Navigator.of(context).pop();
            },
            style: FilledButton.styleFrom(
              backgroundColor: TekaColors.destructive,
            ),
            child: const Text('Supprimer'),
          ),
        ],
      ),
    );
  }
}

class _CartBottomBar extends StatelessWidget {
  final String totalCDF;
  final int totalItems;
  final VoidCallback onCheckout;

  const _CartBottomBar({
    required this.totalCDF,
    required this.totalItems,
    required this.onCheckout,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: EdgeInsets.only(
        left: 16,
        right: 16,
        top: 12,
        bottom: 12 + MediaQuery.of(context).viewPadding.bottom,
      ),
      decoration: BoxDecoration(
        color: TekaColors.background,
        border: const Border(
          top: BorderSide(color: TekaColors.border),
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.05),
            blurRadius: 8,
            offset: const Offset(0, -2),
          ),
        ],
      ),
      child: Row(
        children: [
          // Total info
          Expanded(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Total',
                  style: TextStyle(
                    color: TekaColors.mutedForeground,
                    fontSize: 12,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  formatCDF(totalCDF),
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        color: TekaColors.tekaRed,
                        fontWeight: FontWeight.bold,
                      ),
                ),
              ],
            ),
          ),

          // Checkout button
          FilledButton(
            onPressed: onCheckout,
            style: FilledButton.styleFrom(
              backgroundColor: TekaColors.tekaRed,
              padding: const EdgeInsets.symmetric(
                horizontal: 24,
                vertical: 14,
              ),
              textStyle: const TextStyle(
                fontSize: 15,
                fontWeight: FontWeight.w600,
              ),
            ),
            child: const Text('Passer la commande'),
          ),
        ],
      ),
    );
  }
}
