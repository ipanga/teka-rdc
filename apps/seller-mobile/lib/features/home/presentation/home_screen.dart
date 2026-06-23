import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../../../core/theme/teka_colors.dart';
import '../../auth/presentation/providers/auth_provider.dart';
import '../../orders/data/models/order_model.dart';
import '../../orders/presentation/providers/orders_provider.dart';
import '../../products/data/models/product_model.dart';
import '../../products/presentation/providers/products_provider.dart';
import '../../products/presentation/widgets/status_badge.dart';
import '../../notifications/presentation/providers/notifications_provider.dart';

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final authState = ref.watch(authProvider);
    final productsState = ref.watch(sellerProductsProvider);
    final ordersState = ref.watch(sellerOrdersProvider);
    final userName = authState.user?['firstName'] as String? ?? '';
    final unread = ref.watch(notificationsProvider.select((s) => s.unread));

    return Scaffold(
      appBar: AppBar(
        title: const Text('Teka Vendeur'),
        actions: [
          // Notification center: bell with an unread badge.
          IconButton(
            icon: Badge(
              isLabelVisible: unread > 0,
              label: Text(unread > 9 ? '9+' : '$unread'),
              child: const Icon(Icons.notifications_outlined),
            ),
            tooltip: "Notifications",
            onPressed: () => context.push('/notifications'),
          ),
          IconButton(
            icon: const Icon(Icons.logout),
            tooltip: "Se deconnecter",
            onPressed: () async {
              await ref.read(authProvider.notifier).logout();
              if (context.mounted) context.go('/auth/login');
            },
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () =>
            ref.read(sellerProductsProvider.notifier).loadProducts(),
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            // Welcome
            Text(
              userName.isNotEmpty
                  ? 'Bonjour, $userName !'
                  : "Bienvenue sur Teka RDC",
              style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                    fontWeight: FontWeight.bold,
                    color: TekaColors.foreground,
                  ),
            ),
            const SizedBox(height: 4),
            Text(
              "Espace Vendeur",
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: TekaColors.mutedForeground,
                  ),
            ),
            const SizedBox(height: 20),

            // Stats cards
            _buildStatsGrid(context, productsState),
            const SizedBox(height: 12),

            // Orders card
            _buildOrdersCard(context, ordersState),
            const SizedBox(height: 12),

            // Earnings card
            _buildEarningsCard(context),
            const SizedBox(height: 12),

            // Reviews card
            _buildReviewsCard(context),
            const SizedBox(height: 12),

            // Promotions card
            _buildPromotionsCard(context),
            const SizedBox(height: 20),

            // Quick actions
            SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                onPressed: () => context.push('/products/new'),
                icon: const Icon(Icons.add),
                label: Text("Nouveau produit"),
                style: ElevatedButton.styleFrom(
                  padding: const EdgeInsets.symmetric(vertical: 14),
                ),
              ),
            ),
            const SizedBox(height: 24),

            // Recent products
            Row(
              children: [
                Text(
                  "Produits",
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w600,
                      ),
                ),
                const Spacer(),
                TextButton(
                  onPressed: () => context.go('/products'),
                  child: Text("Tous"),
                ),
              ],
            ),
            const SizedBox(height: 8),

            if (productsState.isLoading)
              const Center(
                child: Padding(
                  padding: EdgeInsets.all(32),
                  child: CircularProgressIndicator(),
                ),
              )
            else if (productsState.products.isEmpty)
              _buildEmptyProducts(context)
            else
              ...productsState.products
                  .take(5)
                  .map((p) => _RecentProductItem(product: p)),
          ],
        ),
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: 0,
        onDestinationSelected: (index) {
          switch (index) {
            case 0:
              break; // Already on home
            case 1:
              context.go('/orders');
              break;
            case 2:
              context.go('/products');
              break;
            case 3:
              context.go('/earnings');
              break;
            case 4:
              context.go('/profile');
              break;
          }
        },
        destinations: [
          NavigationDestination(
            icon: const Icon(Icons.home_outlined),
            selectedIcon: const Icon(Icons.home),
            label: "Accueil",
          ),
          NavigationDestination(
            icon: const Icon(Icons.receipt_long_outlined),
            selectedIcon: const Icon(Icons.receipt_long),
            label: "Commandes",
          ),
          NavigationDestination(
            icon: const Icon(Icons.inventory_2_outlined),
            selectedIcon: const Icon(Icons.inventory_2),
            label: "Produits",
          ),
          NavigationDestination(
            icon: const Icon(Icons.account_balance_wallet_outlined),
            selectedIcon: const Icon(Icons.account_balance_wallet),
            label: "Revenus",
          ),
          NavigationDestination(
            icon: const Icon(Icons.person_outline),
            selectedIcon: const Icon(Icons.person),
            label: "Profil",
          ),
        ],
      ),
    );
  }

  Widget _buildStatsGrid(
      BuildContext context, ProductsListState state) {
    final products = state.products;
    final total = state.total;
    final active = products.where((p) => p.status == ProductStatus.active).length;
    final pending =
        products.where((p) => p.status == ProductStatus.pendingReview).length;
    final drafts = products.where((p) => p.status == ProductStatus.draft).length;

    return GridView.count(
      crossAxisCount: 2,
      crossAxisSpacing: 12,
      mainAxisSpacing: 12,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      childAspectRatio: 1.6,
      children: [
        _StatCard(
          label: "Total produits",
          value: total.toString(),
          icon: Icons.inventory_2_outlined,
          color: TekaColors.tekaRed,
        ),
        _StatCard(
          label: "Actifs",
          value: active.toString(),
          icon: Icons.check_circle_outline,
          color: TekaColors.success,
        ),
        _StatCard(
          label: "En attente",
          value: pending.toString(),
          icon: Icons.hourglass_empty,
          color: TekaColors.warning,
        ),
        _StatCard(
          label: "Brouillons",
          value: drafts.toString(),
          icon: Icons.edit_note,
          color: TekaColors.mutedForeground,
        ),
      ],
    );
  }

  Widget _buildOrdersCard(
      BuildContext context, SellerOrdersState ordersState) {
    final pendingCount = ordersState.orders
        .where((o) => o.status == OrderStatus.pending)
        .length;

    return InkWell(
      onTap: () => context.push('/orders'),
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: TekaColors.tekaRed.withValues(alpha: 0.08),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: TekaColors.tekaRed.withValues(alpha: 0.2)),
        ),
        child: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: TekaColors.tekaRed.withValues(alpha: 0.15),
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Icon(Icons.receipt_long,
                  color: TekaColors.tekaRed, size: 24),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    "Commandes",
                    style: const TextStyle(
                      fontWeight: FontWeight.w600,
                      fontSize: 15,
                    ),
                  ),
                  if (pendingCount > 0)
                    Text(
                      '$pendingCount en attente',
                      style: TextStyle(
                        fontSize: 12,
                        color: TekaColors.tekaRed,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                ],
              ),
            ),
            const Icon(Icons.chevron_right,
                color: TekaColors.mutedForeground),
          ],
        ),
      ),
    );
  }

  Widget _buildEarningsCard(BuildContext context) {
    return InkWell(
      onTap: () => context.push('/earnings'),
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: TekaColors.success.withValues(alpha: 0.08),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: TekaColors.success.withValues(alpha: 0.2)),
        ),
        child: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: TekaColors.success.withValues(alpha: 0.15),
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Icon(Icons.account_balance_wallet,
                  color: TekaColors.success, size: 24),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    "Revenus",
                    style: const TextStyle(
                      fontWeight: FontWeight.w600,
                      fontSize: 15,
                    ),
                  ),
                  Text(
                    "Solde disponible",
                    style: TextStyle(
                      fontSize: 12,
                      color: TekaColors.mutedForeground,
                    ),
                  ),
                ],
              ),
            ),
            const Icon(Icons.chevron_right,
                color: TekaColors.mutedForeground),
          ],
        ),
      ),
    );
  }

  Widget _buildReviewsCard(BuildContext context) {
    return InkWell(
      onTap: () => context.push('/reviews'),
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: Colors.amber.withValues(alpha: 0.08),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: Colors.amber.withValues(alpha: 0.2)),
        ),
        child: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: Colors.amber.withValues(alpha: 0.15),
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Icon(Icons.star_outline_rounded,
                  color: Colors.amber, size: 24),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    "Avis clients",
                    style: const TextStyle(
                      fontWeight: FontWeight.w600,
                      fontSize: 15,
                    ),
                  ),
                  Text(
                    "Avis recents",
                    style: TextStyle(
                      fontSize: 12,
                      color: TekaColors.mutedForeground,
                    ),
                  ),
                ],
              ),
            ),
            const Icon(Icons.chevron_right,
                color: TekaColors.mutedForeground),
          ],
        ),
      ),
    );
  }

  Widget _buildPromotionsCard(BuildContext context) {
    return InkWell(
      onTap: () => context.push('/promotions'),
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: Colors.deepPurple.withValues(alpha: 0.08),
          borderRadius: BorderRadius.circular(12),
          border:
              Border.all(color: Colors.deepPurple.withValues(alpha: 0.2)),
        ),
        child: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: Colors.deepPurple.withValues(alpha: 0.15),
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Icon(Icons.campaign_outlined,
                  color: Colors.deepPurple, size: 24),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    "Promotions",
                    style: const TextStyle(
                      fontWeight: FontWeight.w600,
                      fontSize: 15,
                    ),
                  ),
                  Text(
                    "Creer une promotion",
                    style: TextStyle(
                      fontSize: 12,
                      color: TekaColors.mutedForeground,
                    ),
                  ),
                ],
              ),
            ),
            const Icon(Icons.chevron_right,
                color: TekaColors.mutedForeground),
          ],
        ),
      ),
    );
  }

  // _buildMessagesCard removed 2026-05-17 with the messaging feature.

  Widget _buildEmptyProducts(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: TekaColors.muted,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        children: [
          const Icon(Icons.inventory_2_outlined,
              size: 48, color: TekaColors.mutedForeground),
          const SizedBox(height: 12),
          Text(
            "Aucun produit pour le moment",
            style: const TextStyle(color: TekaColors.mutedForeground),
          ),
        ],
      ),
    );
  }
}

class _StatCard extends StatelessWidget {
  final String label;
  final String value;
  final IconData icon;
  final Color color;

  const _StatCard({
    required this.label,
    required this.value,
    required this.icon,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
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
              Text(
                value,
                style: TextStyle(
                  fontSize: 24,
                  fontWeight: FontWeight.bold,
                  color: color,
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            label,
            style: TextStyle(
              fontSize: 12,
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

class _RecentProductItem extends StatelessWidget {
  final SellerProductModel product;

  const _RecentProductItem({required this.product});

  @override
  Widget build(BuildContext context) {
    final priceFormat = NumberFormat('#,###', 'fr');

    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(8),
        side: const BorderSide(color: TekaColors.border),
      ),
      child: ListTile(
        onTap: () => context.push('/products/${product.id}'),
        contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
        leading: ClipRRect(
          borderRadius: BorderRadius.circular(6),
          child: SizedBox(
            width: 48,
            height: 48,
            child: product.coverImageUrl != null
                ? Image.network(
                    product.coverImageUrl!,
                    fit: BoxFit.cover,
                    errorBuilder: (_, __, ___) => _placeholder(),
                  )
                : _placeholder(),
          ),
        ),
        title: Text(
          product.title,
          style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500),
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
        subtitle: Text(
          '${priceFormat.format(product.priceCDFDisplay)} CDF',
          style: TextStyle(
            color: TekaColors.tekaRed,
            fontWeight: FontWeight.w600,
            fontSize: 12,
          ),
        ),
        trailing: StatusBadge(status: product.status, compact: true),
      ),
    );
  }

  Widget _placeholder() {
    return Container(
      color: TekaColors.muted,
      child: const Icon(Icons.image_outlined,
          size: 24, color: TekaColors.mutedForeground),
    );
  }
}
