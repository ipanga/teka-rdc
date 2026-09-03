import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/theme/teka_colors.dart';
import '../../../core/widgets/seller_list_state.dart';
import '../../auth/presentation/providers/auth_provider.dart';
import '../../orders/data/models/order_model.dart';
import '../../orders/presentation/providers/orders_provider.dart';
import '../../products/data/models/product_model.dart';
import '../../products/presentation/providers/products_provider.dart';
import '../../notifications/presentation/providers/notifications_provider.dart';
import 'providers/seller_dashboard_provider.dart';

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  Future<void> _refresh(WidgetRef ref) async {
    final id = ref.read(authenticatedSellerIdProvider);
    if (id == null) return;
    // Await both server responses. Errors are rendered next to the affected
    // section; a failed refresh must never imply that the queue is empty.
    final orders = ref.refresh(sellerOrderStatsRequestProvider(id).future);
    final products = ref.refresh(sellerProductStatsRequestProvider(id).future);
    try {
      await Future.wait([orders, products]);
    } catch (_) {
      // AsyncValue carries the error and the section's retry action.
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

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final userName = ref.watch(
        authProvider.select((s) => s.user?['firstName'] as String? ?? ''));
    final orders = ref.watch(sellerOrderStatsProvider);
    final products = ref.watch(dashboardStatsProvider);
    final unread = ref.watch(notificationsProvider.select((s) => s.unread));
    final id = ref.watch(authenticatedSellerIdProvider);

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
      body: SafeArea(
        top: false,
        bottom: false,
        child: RefreshIndicator(
          onRefresh: () => _refresh(ref),
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
            children: [
              Text(userName.isEmpty ? 'Bienvenue' : 'Bonjour, $userName',
                  style: Theme.of(context)
                      .textTheme
                      .headlineSmall
                      ?.copyWith(fontWeight: FontWeight.w700)),
              const SizedBox(height: 6),
              const Text('Votre activité, une étape à la fois.',
                  style: TextStyle(color: TekaColors.neutralForeground)),
              const SizedBox(height: 24),
              _Section(
                title: 'Actions requises',
                children: [
                  orders.when(
                    skipLoadingOnRefresh: false,
                    skipLoadingOnReload: false,
                    loading: () => const _Loading(
                        label: 'Chargement des actions commandes'),
                    error: (_, __) => _Retry(
                      title: 'Commandes indisponibles',
                      onRetry: () {
                        if (id != null) {
                          ref.invalidate(sellerOrderStatsRequestProvider(id));
                        }
                      },
                    ),
                    data: (stats) => Column(children: [
                      if (stats.requiredActions == 0)
                        const _ClearMessage(
                            label: 'Aucune commande à traiter.'),
                      if (stats.pending > 0)
                        _DashboardLink(
                          title: 'Commandes à confirmer',
                          subtitle:
                              'Acceptez ou refusez les nouvelles commandes.',
                          count: stats.pending,
                          icon: Icons.receipt_long_outlined,
                          onTap: () =>
                              _openOrders(context, ref, OrderStatus.pending),
                        ),
                      if (stats.confirmed > 0)
                        _DashboardLink(
                          title: 'Commandes à préparer',
                          subtitle: 'Commencez la préparation des articles.',
                          count: stats.confirmed,
                          icon: Icons.inventory_2_outlined,
                          onTap: () =>
                              _openOrders(context, ref, OrderStatus.confirmed),
                        ),
                      if (stats.processing > 0)
                        _DashboardLink(
                          title: 'Préparations à terminer',
                          subtitle:
                              'Signalez les colis prêts pour la collecte Teka.',
                          count: stats.processing,
                          icon: Icons.local_shipping_outlined,
                          onTap: () =>
                              _openOrders(context, ref, OrderStatus.processing),
                        ),
                    ]),
                  ),
                  const Divider(height: 1),
                  products.when(
                    skipLoadingOnRefresh: false,
                    skipLoadingOnReload: false,
                    loading: () => const _Loading(
                        label: 'Chargement des actions produits'),
                    error: (_, __) => _Retry(
                      title: 'Produits indisponibles',
                      onRetry: () {
                        if (id != null) {
                          ref.invalidate(sellerProductStatsRequestProvider(id));
                        }
                      },
                    ),
                    data: (stats) => stats.rejected == 0
                        ? const _ClearMessage(
                            label: 'Aucun produit à corriger.')
                        : _DashboardLink(
                            title: 'Produits à corriger',
                            subtitle:
                                'Consultez le motif du rejet avant de modifier la fiche.',
                            count: stats.rejected,
                            icon: Icons.edit_note_outlined,
                            onTap: () => _openProducts(
                                context, ref, ProductStatus.rejected),
                          ),
                  ),
                ],
              ),
              const SizedBox(height: 20),
              FilledButton.icon(
                onPressed: () => context.push('/products/new'),
                icon: const Icon(Icons.add),
                label: const Padding(
                    padding: EdgeInsets.symmetric(vertical: 12),
                    child: Text('Nouveau produit')),
              ),
              const SizedBox(height: 20),
              _Section(title: 'Catalogue', children: [
                products.when(
                  skipLoadingOnRefresh: false,
                  skipLoadingOnReload: false,
                  loading: () =>
                      const _Loading(label: 'Chargement du catalogue'),
                  error: (_, __) => const Padding(
                    padding: EdgeInsets.all(16),
                    child: Text(
                        'Les compteurs du catalogue sont momentanément indisponibles.'),
                  ),
                  data: (stats) => Padding(
                    padding: const EdgeInsets.all(16),
                    child: LayoutBuilder(builder: (context, constraints) {
                      final columns =
                          MediaQuery.textScalerOf(context).scale(14) > 18
                              ? 2
                              : 4;
                      final width =
                          (constraints.maxWidth - 16 * (columns - 1)) / columns;
                      return Wrap(spacing: 16, runSpacing: 16, children: [
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
                _DashboardLink(
                    title: 'Tous les produits',
                    icon: Icons.inventory_2_outlined,
                    onTap: () => _openProducts(context, ref, null)),
              ]),
              const SizedBox(height: 20),
              _Section(title: 'Votre boutique', children: [
                _DashboardLink(
                    title: 'Toutes les commandes',
                    icon: Icons.receipt_long_outlined,
                    onTap: () => _openOrders(context, ref, null)),
                _DashboardLink(
                    title: 'Revenus',
                    subtitle: 'Consultez votre solde et vos versements.',
                    icon: Icons.account_balance_wallet_outlined,
                    onTap: () => context.go('/earnings')),
                _DashboardLink(
                    title: 'Avis clients',
                    icon: Icons.star_outline_rounded,
                    onTap: () => context.push('/reviews')),
                _DashboardLink(
                    title: 'Promotions',
                    icon: Icons.campaign_outlined,
                    onTap: () => context.push('/promotions')),
              ]),
            ],
          ),
        ),
      ),
    );
  }
}

class _Section extends StatelessWidget {
  const _Section({required this.title, required this.children});
  final String title;
  final List<Widget> children;
  @override
  Widget build(BuildContext context) => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Semantics(
              container: true,
              header: true,
              child: Text(title,
                  style: Theme.of(context)
                      .textTheme
                      .titleLarge
                      ?.copyWith(fontWeight: FontWeight.w700))),
          const SizedBox(height: 12),
          DecoratedBox(
            decoration: BoxDecoration(
                color: Colors.white,
                border: Border.all(color: TekaColors.border),
                borderRadius: BorderRadius.circular(12)),
            child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: children),
          ),
        ],
      );
}

class _DashboardLink extends StatelessWidget {
  const _DashboardLink(
      {required this.title,
      required this.icon,
      required this.onTap,
      this.subtitle,
      this.count});
  final String title;
  final String? subtitle;
  final IconData icon;
  final int? count;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) => Semantics(
        container: true,
        button: true,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(12),
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              if (count != null)
                ConstrainedBox(
                  constraints: const BoxConstraints(minWidth: 28, maxWidth: 72),
                  child: Text('$count',
                      style: Theme.of(context)
                          .textTheme
                          .headlineSmall
                          ?.copyWith(
                              fontWeight: FontWeight.w700,
                              color: TekaColors.tekaRed)),
                )
              else
                Padding(
                    padding: const EdgeInsets.only(top: 2),
                    child: Icon(icon,
                        size: 22, color: TekaColors.neutralForeground)),
              const SizedBox(width: 12),
              Expanded(
                  child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                    Text(title,
                        style: const TextStyle(fontWeight: FontWeight.w600)),
                    if (subtitle != null) ...[
                      const SizedBox(height: 4),
                      Text(subtitle!,
                          style: const TextStyle(
                              color: TekaColors.neutralForeground)),
                    ],
                  ])),
              const SizedBox(width: 8),
              const Icon(Icons.chevron_right,
                  color: TekaColors.neutralForeground),
            ]),
          ),
        ),
      );
}

class _ClearMessage extends StatelessWidget {
  const _ClearMessage({required this.label});
  final String label;
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.all(16),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Icon(Icons.check_circle_outline,
              size: 22, color: TekaColors.successForeground),
          const SizedBox(width: 12),
          Expanded(child: Text(label)),
        ]),
      );
}

class _Loading extends StatelessWidget {
  const _Loading({required this.label});
  final String label;
  @override
  Widget build(BuildContext context) => Semantics(
        label: label,
        liveRegion: true,
        child: const Padding(
            padding: EdgeInsets.all(16),
            child: LinearProgressIndicator(minHeight: 3)),
      );
}

class _Retry extends StatelessWidget {
  const _Retry({required this.title, required this.onRetry});
  final String title;
  final VoidCallback onRetry;
  @override
  Widget build(BuildContext context) => SellerListMessage(
        icon: Icons.cloud_off_outlined,
        title: title,
        message:
            'Impossible d’actualiser les compteurs. Réessayez pour connaître les actions à traiter.',
        actionLabel: 'Réessayer',
        onAction: onRetry,
      );
}

class _CatalogCount extends StatelessWidget {
  const _CatalogCount({required this.value, required this.label});
  final int value;
  final String label;
  @override
  Widget build(BuildContext context) =>
      Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text('$value',
            style: Theme.of(context)
                .textTheme
                .titleLarge
                ?.copyWith(fontWeight: FontWeight.w700)),
        Text(label,
            style: const TextStyle(color: TekaColors.neutralForeground)),
      ]);
}
