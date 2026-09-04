import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/providers/seller_refresh_provider.dart';
import '../../../auth/presentation/providers/auth_provider.dart';
import '../../../orders/data/models/order_stats.dart';
import '../../../orders/data/orders_repository.dart';
import '../../../products/data/products_repository.dart';

// Key requests by account, so a response from a former session can never be
// displayed for the next seller. No requests until identity has been restored.
final sellerOrderStatsRequestProvider = FutureProvider.autoDispose
    .family<SellerOrderStats, String>((ref, sellerId) {
  ref.watch(sellerRefreshProvider.select((revision) => revision.orders));
  return ref.read(sellerOrdersRepositoryProvider).getOrderStats();
});

final sellerProductStatsRequestProvider =
    FutureProvider.autoDispose.family<ProductStats, String>((ref, sellerId) {
  ref.watch(sellerRefreshProvider.select((revision) => revision.products));
  return ref.read(productsRepositoryProvider).getProductStats();
});

final sellerOrderStatsProvider =
    Provider.autoDispose<AsyncValue<SellerOrderStats>>((ref) {
  final id = ref.watch(authenticatedSellerIdProvider);
  return id == null
      ? const AsyncLoading()
      : ref.watch(sellerOrderStatsRequestProvider(id));
});

final dashboardStatsProvider =
    Provider.autoDispose<AsyncValue<ProductStats>>((ref) {
  final id = ref.watch(authenticatedSellerIdProvider);
  return id == null
      ? const AsyncLoading()
      : ref.watch(sellerProductStatsRequestProvider(id));
});
