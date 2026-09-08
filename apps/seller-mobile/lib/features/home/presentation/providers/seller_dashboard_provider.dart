import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/providers/seller_refresh_provider.dart';
import '../../../auth/presentation/providers/auth_provider.dart';
import '../../../orders/data/models/order_stats.dart';
import '../../../orders/data/orders_repository.dart';
import '../../../products/data/products_repository.dart';
import '../../../verification/data/verification_repository.dart';

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

/// Third dashboard source (Seller UX PR B): one cheap seller-scoped GET, so
/// a rejected verification is a dashboard task rather than a buried tile.
final sellerVerificationRequestProvider = FutureProvider.autoDispose
    .family<VerificationStatusModel, String>((ref, sellerId) {
  ref.watch(sellerRefreshProvider.select((revision) => revision.verification));
  return ref.read(verificationRepositoryProvider).getStatus();
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

final sellerVerificationProvider =
    Provider.autoDispose<AsyncValue<VerificationStatusModel>>((ref) {
  final id = ref.watch(authenticatedSellerIdProvider);
  return id == null
      ? const AsyncLoading()
      : ref.watch(sellerVerificationRequestProvider(id));
});
