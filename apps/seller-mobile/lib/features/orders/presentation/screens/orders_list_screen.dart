import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/widgets/seller_filter_bar.dart';
import '../../../../core/widgets/seller_list_state.dart';
import '../../data/models/order_model.dart';
import '../providers/orders_provider.dart';
import '../widgets/order_card.dart';

class OrdersListScreen extends ConsumerStatefulWidget {
  const OrdersListScreen({super.key});

  @override
  ConsumerState<OrdersListScreen> createState() => _OrdersListScreenState();
}

class _OrdersListScreenState extends ConsumerState<OrdersListScreen> {
  final ScrollController _scrollController = ScrollController();

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_onScroll);
  }

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  void _onScroll() {
    final state = ref.read(sellerOrdersProvider);
    if (!state.isLoading &&
        state.error == null &&
        _scrollController.position.pixels >=
            _scrollController.position.maxScrollExtent - 200) {
      ref.read(sellerOrdersProvider.notifier).loadMore();
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(sellerOrdersProvider);
    final notifier = ref.read(sellerOrdersProvider.notifier);

    return Scaffold(
      appBar: AppBar(title: const Text('Commandes')),
      body: SafeArea(
        top: false,
        bottom: false,
        child: Column(
          children: [
            SellerFilterBar<OrderStatus>(
              selected: state.selectedStatus,
              onSelected: notifier.setStatusFilter,
              options: const [
                SellerFilterOption(null, 'Toutes'),
                SellerFilterOption(OrderStatus.pending, 'En attente'),
                SellerFilterOption(OrderStatus.confirmed, 'Confirmées'),
                SellerFilterOption(OrderStatus.processing, 'En préparation'),
                SellerFilterOption(
                    OrderStatus.readyForTekaPickup, 'Prêtes pour collecte'),
                SellerFilterOption(
                    OrderStatus.receivedAtTeka, 'Reçues par Teka'),
                SellerFilterOption(OrderStatus.outForDelivery, 'En livraison'),
                SellerFilterOption(OrderStatus.delivered, 'Livrées'),
                SellerFilterOption(OrderStatus.cancelled, 'Annulées'),
                SellerFilterOption(OrderStatus.returned, 'Retournées'),
                SellerFilterOption(
                    OrderStatus.shipped, 'Expédiées (ancien statut)'),
              ],
            ),
            Expanded(
              child: state.isLoading
                  ? const SellerListLoading(label: 'Chargement des commandes')
                  : RefreshIndicator(
                      onRefresh: notifier.refresh,
                      child: state.orders.isEmpty
                          ? SellerListState(child: _message(state))
                          : ListView.builder(
                              controller: _scrollController,
                              physics: const AlwaysScrollableScrollPhysics(),
                              padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                              itemCount: state.orders.length +
                                  (state.isLoadingMore || state.error != null
                                      ? 1
                                      : 0),
                              itemBuilder: (context, index) {
                                if (index < state.orders.length) {
                                  return OrderCard(order: state.orders[index]);
                                }
                                if (state.error != null) return _message(state);
                                return const Padding(
                                  padding: EdgeInsets.all(16),
                                  child: Center(
                                      child: CircularProgressIndicator(
                                    semanticsLabel:
                                        'Chargement des commandes suivantes',
                                  )),
                                );
                              },
                            ),
                    ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _message(SellerOrdersState state) {
    final notifier = ref.read(sellerOrdersProvider.notifier);
    if (state.error != null) {
      return SellerListMessage(
        icon: Icons.cloud_off_outlined,
        title: 'Impossible de charger les commandes',
        message: state.error!,
        actionLabel: 'Réessayer',
        onAction: notifier.refresh,
      );
    }
    final filtered = state.selectedStatus != null;
    return SellerListMessage(
      icon: Icons.receipt_long_outlined,
      title: filtered
          ? 'Aucune commande dans ce statut'
          : 'Aucune commande pour le moment',
      message: filtered
          ? 'Choisissez un autre statut pour consulter vos commandes.'
          : 'Vos nouvelles commandes apparaîtront ici pour être confirmées et préparées.',
      actionLabel: filtered ? 'Voir toutes les commandes' : 'Actualiser',
      onAction:
          filtered ? () => notifier.setStatusFilter(null) : notifier.refresh,
    );
  }
}
