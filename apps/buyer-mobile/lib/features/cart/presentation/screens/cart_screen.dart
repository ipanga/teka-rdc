import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../../../core/utils/price_formatter.dart';
import '../../../../l10n/app_localizations.dart';
import '../providers/cart_provider.dart';
import '../widgets/cart_item_tile.dart';

class CartScreen extends ConsumerWidget {
  const CartScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context)!;
    final locale = Localizations.localeOf(context).languageCode;
    final cartState = ref.watch(cartProvider);

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.cart),
        actions: [
          if (cartState.items.isNotEmpty)
            IconButton(
              icon: const Icon(Icons.delete_sweep_outlined),
              tooltip: l10n.cartRemove,
              onPressed: () => _confirmClearCart(context, ref, l10n),
            ),
        ],
      ),
      body: cartState.isLoading
          ? const Center(
              child: CircularProgressIndicator(strokeWidth: 2),
            )
          : cartState.isEmpty
              ? _EmptyCartView(l10n: l10n)
              : RefreshIndicator(
                  color: TekaColors.tekaRed,
                  onRefresh: () =>
                      ref.read(cartProvider.notifier).fetchCart(),
                  child: ListView.builder(
                    physics: const AlwaysScrollableScrollPhysics(),
                    itemCount: cartState.items.length,
                    itemBuilder: (context, index) {
                      final item = cartState.items[index];
                      return CartItemTile(
                        item: item,
                        locale: locale,
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
              l10n: l10n,
              onCheckout: () => context.push('/checkout'),
            )
          : null,
    );
  }

  void _confirmClearCart(
    BuildContext context,
    WidgetRef ref,
    AppLocalizations l10n,
  ) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(l10n.cartRemove),
        content: Text(l10n.cartEmpty),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: Text(l10n.filterReset),
          ),
          FilledButton(
            onPressed: () {
              ref.read(cartProvider.notifier).clearCart();
              Navigator.of(context).pop();
            },
            style: FilledButton.styleFrom(
              backgroundColor: TekaColors.destructive,
            ),
            child: Text(l10n.cartRemove),
          ),
        ],
      ),
    );
  }
}

class _EmptyCartView extends StatelessWidget {
  final AppLocalizations l10n;

  const _EmptyCartView({required this.l10n});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(
              Icons.shopping_cart_outlined,
              size: 80,
              color: TekaColors.mutedForeground,
            ),
            const SizedBox(height: 16),
            Text(
              l10n.cartEmpty,
              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    color: TekaColors.mutedForeground,
                    fontWeight: FontWeight.w600,
                  ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 24),
            FilledButton(
              onPressed: () => context.go('/'),
              style: FilledButton.styleFrom(
                backgroundColor: TekaColors.tekaRed,
                padding:
                    const EdgeInsets.symmetric(horizontal: 32, vertical: 14),
              ),
              child: Text(l10n.cartEmptyAction),
            ),
          ],
        ),
      ),
    );
  }
}

class _CartBottomBar extends StatelessWidget {
  final String totalCDF;
  final int totalItems;
  final AppLocalizations l10n;
  final VoidCallback onCheckout;

  const _CartBottomBar({
    required this.totalCDF,
    required this.totalItems,
    required this.l10n,
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
            color: Colors.black.withOpacity(0.05),
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
                Text(
                  l10n.cartTotal,
                  style: const TextStyle(
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
            child: Text(l10n.cartCheckout),
          ),
        ],
      ),
    );
  }
}
