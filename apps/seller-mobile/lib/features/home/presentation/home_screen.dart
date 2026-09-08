import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/analytics/posthog_analytics.dart';
import '../../../core/layout/responsive.dart';
import '../../../core/theme/teka_colors.dart';
import '../../../core/theme/teka_spacing.dart';
import '../../auth/presentation/providers/auth_provider.dart';
import '../../orders/data/models/order_model.dart';
import '../../orders/presentation/providers/orders_provider.dart';
import '../../products/data/models/product_model.dart';
import '../../products/presentation/providers/products_provider.dart';
import '../../notifications/presentation/providers/notifications_provider.dart';
import '../domain/action_center.dart';
import 'providers/seller_dashboard_provider.dart';
import 'widgets/dashboard_rows.dart';

/// Seller home. Answers, in this order: what must I do (Action Center),
/// what is in Teka's hands (Suivi), how is the catalogue doing, where else
/// can I go. Counts always come from the seller-scoped stats endpoints and
/// refresh through `sellerRefreshProvider` (mutation, push, resume) — the
/// screen never polls.
class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  Future<void> _refresh(WidgetRef ref) async {
    final id = ref.read(authenticatedSellerIdProvider);
    if (id == null) return;
    // Await every source. Errors are rendered next to the affected row; a
    // failed refresh must never imply that the queue is empty.
    final orders = ref.refresh(sellerOrderStatsRequestProvider(id).future);
    final products = ref.refresh(sellerProductStatsRequestProvider(id).future);
    final verification =
        ref.refresh(sellerVerificationRequestProvider(id).future);
    try {
      await Future.wait([orders, products, verification]);
    } catch (_) {
      // AsyncValue carries the error and the row's retry action.
    }
  }

  void _openOrders(BuildContext context, WidgetRef ref, OrderStatus? status) {
    ref.read(sellerOrdersProvider.notifier).openActionFilter(status);
    context.go(status == null
        ? '/orders'
        : '/orders?status=${orderStatusToApi(status)}');
  }

  void _openProducts(
      BuildContext context, WidgetRef ref, ProductStatus? status) {
    // A catalogue search left in another tab must not hide required work.
    ref.read(sellerProductsProvider.notifier).openActionFilter(status);
    context.go(status == null
        ? '/products'
        : '/products?status=${productStatusToApi(status)}');
  }

  /// Every task row navigates through here so the list filter the row
  /// promises is applied by the module that owns it (never re-parsed from
  /// the route by dashboard code).
  void _openAction(BuildContext context, WidgetRef ref, ActionItem item) {
    const PosthogAnalytics().capture(
      'seller_action_center_tapped',
      properties: {'task': item.kind.name, 'origin': 'dashboard'},
    );
    switch (item.kind) {
      case ActionKind.ordersToConfirm:
        _openOrders(context, ref, OrderStatus.pending);
      case ActionKind.ordersToPrepare:
        _openOrders(context, ref, OrderStatus.confirmed);
      case ActionKind.ordersToFinish:
        _openOrders(context, ref, OrderStatus.processing);
      case ActionKind.productsRejected:
        _openProducts(context, ref, ProductStatus.rejected);
      case ActionKind.verificationRejected:
        context.push(item.route);
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final userName = ref.watch(
        authProvider.select((s) => s.user?['firstName'] as String? ?? ''));
    final orders = ref.watch(sellerOrderStatsProvider);
    final products = ref.watch(dashboardStatsProvider);
    final verification = ref.watch(sellerVerificationProvider);
    final unread = ref.watch(notificationsProvider.select((s) => s.unread));
    final id = ref.watch(authenticatedSellerIdProvider);
    final theme = Theme.of(context).textTheme;

    // A source that is (re)loading contributes nothing: a pull-to-refresh
    // must never keep showing the count it is about to replace.
    T? settled<T>(AsyncValue<T> source) =>
        source.isLoading ? null : source.valueOrNull;
    final items = buildActionItems(
      orders: settled(orders),
      products: settled(products),
      verification: settled(verification),
    );
    final sources = [orders, products, verification];
    final anyLoading = sources.any((s) => s.isLoading);
    final allLoaded = sources.every((s) => s.hasValue && !s.isLoading);
    final readyForPickup = settled(orders)?.readyForPickup ?? 0;

    return Scaffold(
      appBar: AppBar(
        title: Image.asset('assets/brand/logo_teka_cd.png',
            height: 26, semanticLabel: 'Teka RDC Vendeur'),
        actions: [
          IconButton(
            icon: ExcludeSemantics(
                child: Badge(
              isLabelVisible: unread > 0,
              label: Text(unread > 9 ? '9+' : '$unread'),
              child: const Icon(Icons.notifications_outlined),
            )),
            tooltip: unread == 0
                ? 'Notifications'
                : 'Notifications, $unread non lues',
            onPressed: () => context.push('/notifications'),
          ),
          IconButton(
            icon: const Icon(Icons.logout),
            tooltip: 'Se déconnecter',
            onPressed: () async {
              await ref.read(authProvider.notifier).logout();
              if (context.mounted) context.go('/auth/login');
            },
          ),
        ],
      ),
      body: ReadableColumn(
        padding: EdgeInsets.zero,
        child: SafeArea(
          top: false,
          bottom: false,
          child: RefreshIndicator(
            onRefresh: () => _refresh(ref),
            child: ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.fromLTRB(TekaSpacing.md,
                  TekaSpacing.sm, TekaSpacing.md, TekaSpacing.xl),
              children: [
                Text(userName.isEmpty ? 'Bienvenue' : 'Bonjour, $userName',
                    style: theme.headlineSmall),
                const SizedBox(height: TekaSpacing.xxs),
                Text('Votre activité, une étape à la fois.',
                    style: theme.bodyMedium
                        ?.copyWith(color: TekaColors.neutralForeground)),
                const SizedBox(height: TekaSpacing.xl),
                DashboardSection(
                  title: 'Actions requises',
                  // The total appears once every source has answered, so the
                  // number never grows under the seller's eyes.
                  trailing: allLoaded && items.isNotEmpty
                      ? Semantics(
                          label:
                              '${totalPending(items)} actions en attente',
                          child: ExcludeSemantics(
                            child: CountPill(
                                count: totalPending(items),
                                colors: PillColors.neutral),
                          ),
                        )
                      : null,
                  children: [
                    for (final item in items)
                      DashboardRow(
                        title: item.title,
                        subtitle: item.subtitle,
                        icon: item.icon,
                        count: item.count,
                        colors: PillColors.of(item.tone),
                        iconColor: PillColors.of(item.tone).foreground,
                        onTap: () => _openAction(context, ref, item),
                      ),
                    if (orders.hasError)
                      DashboardErrorRow(
                        title: 'Commandes indisponibles',
                        onRetry: () {
                          if (id != null) {
                            ref.invalidate(sellerOrderStatsRequestProvider(id));
                          }
                        },
                      ),
                    if (products.hasError)
                      DashboardErrorRow(
                        title: 'Produits indisponibles',
                        onRetry: () {
                          if (id != null) {
                            ref.invalidate(
                                sellerProductStatsRequestProvider(id));
                          }
                        },
                      ),
                    if (verification.hasError)
                      DashboardErrorRow(
                        title: 'Vérification indisponible',
                        onRetry: () {
                          if (id != null) {
                            ref.invalidate(
                                sellerVerificationRequestProvider(id));
                          }
                        },
                      ),
                    if (anyLoading)
                      DashboardRowsSkeleton(
                          label: 'Chargement des actions',
                          rows: items.isEmpty ? 2 : 1),
                    if (allLoaded && items.isEmpty)
                      const DashboardClearRow(
                          label: 'Aucune action requise pour le moment.'),
                  ],
                ),
                const SizedBox(height: TekaSpacing.lg),
                FilledButton.icon(
                  onPressed: () => context.push('/products/new'),
                  icon: const Icon(Icons.add),
                  label: const Padding(
                      padding: EdgeInsets.symmetric(vertical: TekaSpacing.sm),
                      child: Text('Nouveau produit')),
                ),
                if (readyForPickup > 0) ...[
                  const SizedBox(height: TekaSpacing.lg),
                  DashboardSection(title: 'Suivi', children: [
                    DashboardRow(
                      title: 'Prêtes pour la collecte Teka',
                      subtitle:
                          'Teka passe récupérer ces colis ; rien à faire de votre côté.',
                      icon: Icons.local_shipping_outlined,
                      count: readyForPickup,
                      onTap: () => _openOrders(
                          context, ref, OrderStatus.readyForTekaPickup),
                    ),
                  ]),
                ],
                const SizedBox(height: TekaSpacing.lg),
                DashboardSection(title: 'Catalogue', children: [
                  products.when(
                    skipLoadingOnRefresh: false,
                    skipLoadingOnReload: false,
                    loading: () => const _CatalogueSkeleton(),
                    error: (_, __) => Padding(
                      padding: const EdgeInsets.all(TekaSpacing.md),
                      child: Text(
                          'Les compteurs du catalogue sont momentanément indisponibles.',
                          style: theme.bodyMedium?.copyWith(
                              color: TekaColors.neutralForeground)),
                    ),
                    data: (stats) => Padding(
                      padding: const EdgeInsets.all(TekaSpacing.md),
                      child: LayoutBuilder(builder: (context, constraints) {
                        final columns =
                            MediaQuery.textScalerOf(context).scale(14) > 18
                                ? 2
                                : 4;
                        final width = (constraints.maxWidth -
                                TekaSpacing.md * (columns - 1)) /
                            columns;
                        return Wrap(
                            spacing: TekaSpacing.md,
                            runSpacing: TekaSpacing.md,
                            children: [
                              for (final item in [
                                (stats.total, 'Total'),
                                (stats.active, 'Actifs'),
                                (stats.pendingReview, 'En validation'),
                                (stats.draft, 'Brouillons'),
                              ])
                                SizedBox(
                                    width: width,
                                    child: _CatalogCount(
                                        value: item.$1, label: item.$2)),
                            ]);
                      }),
                    ),
                  ),
                  DashboardRow(
                      title: 'Tous les produits',
                      icon: Icons.inventory_2_outlined,
                      onTap: () => _openProducts(context, ref, null)),
                ]),
                const SizedBox(height: TekaSpacing.lg),
                DashboardSection(title: 'Votre boutique', children: [
                  DashboardRow(
                      title: 'Toutes les commandes',
                      icon: Icons.receipt_long_outlined,
                      onTap: () => _openOrders(context, ref, null)),
                  DashboardRow(
                      title: 'Revenus',
                      subtitle: 'Consultez votre solde et vos versements.',
                      icon: Icons.account_balance_wallet_outlined,
                      onTap: () => context.go('/earnings')),
                  DashboardRow(
                      title: 'Avis clients',
                      icon: Icons.star_outline_rounded,
                      onTap: () => context.push('/reviews')),
                  DashboardRow(
                      title: 'Promotions',
                      icon: Icons.campaign_outlined,
                      onTap: () => context.push('/promotions')),
                ]),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _CatalogueSkeleton extends StatelessWidget {
  const _CatalogueSkeleton();
  @override
  Widget build(BuildContext context) => Semantics(
        label: 'Chargement du catalogue',
        liveRegion: true,
        child: ExcludeSemantics(
          child: Padding(
            padding: const EdgeInsets.all(TekaSpacing.md),
            child: Wrap(
                spacing: TekaSpacing.md,
                runSpacing: TekaSpacing.md,
                children: [
                  for (var i = 0; i < 4; i++)
                    const Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          SkeletonBlock(width: 28, height: 22),
                          SizedBox(height: TekaSpacing.xxs),
                          SkeletonBlock(width: 56, height: 12),
                        ]),
                ]),
          ),
        ),
      );
}

class _CatalogCount extends StatelessWidget {
  const _CatalogCount({required this.value, required this.label});
  final int value;
  final String label;
  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context).textTheme;
    return Semantics(
      label: '$value $label',
      child: ExcludeSemantics(
        child:
            Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('$value', style: theme.titleLarge),
          Text(label,
              style: theme.bodySmall
                  ?.copyWith(color: TekaColors.neutralForeground)),
        ]),
      ),
    );
  }
}
