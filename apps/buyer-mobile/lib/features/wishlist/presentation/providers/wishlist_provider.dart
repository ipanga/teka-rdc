import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/analytics/posthog_analytics.dart';
import '../../../../core/network/dio_error_messages.dart';
import '../../data/models/wishlist_model.dart';
import '../../data/wishlist_repository.dart';

class WishlistState {
  final List<WishlistItemModel> items;
  final Set<String> wishlistedIds;
  final bool isLoading;
  final String? error;
  final int page;
  final int totalPages;
  // Active-filtered total for the header badge (authoritative via
  // GET /v1/wishlist/count; adjusted optimistically on add/remove).
  final int count;

  const WishlistState({
    this.items = const [],
    this.wishlistedIds = const {},
    this.isLoading = false,
    this.error,
    this.page = 1,
    this.totalPages = 1,
    this.count = 0,
  });

  WishlistState copyWith({
    List<WishlistItemModel>? items,
    Set<String>? wishlistedIds,
    bool? isLoading,
    String? error,
    int? page,
    int? totalPages,
    int? count,
    bool clearError = false,
  }) {
    return WishlistState(
      items: items ?? this.items,
      wishlistedIds: wishlistedIds ?? this.wishlistedIds,
      isLoading: isLoading ?? this.isLoading,
      error: clearError ? null : (error ?? this.error),
      page: page ?? this.page,
      totalPages: totalPages ?? this.totalPages,
      count: count ?? this.count,
    );
  }

  bool get hasNextPage => page < totalPages;
}

class WishlistNotifier extends StateNotifier<WishlistState> {
  final WishlistRepository _repository;

  WishlistNotifier(this._repository) : super(const WishlistState()) {
    loadWishlist();
    loadCount();
  }

  /// Refresh the authoritative active-filtered count (header badge).
  /// Non-critical: silently keeps the current value on failure.
  Future<void> loadCount() async {
    try {
      final count = await _repository.getCount();
      if (!mounted) return;
      state = state.copyWith(count: count);
    } catch (_) {
      // ignore — badge keeps its last value
    }
  }

  Future<void> loadWishlist({int page = 1}) async {
    state = state.copyWith(isLoading: true, clearError: true);
    try {
      final result = await _repository.getWishlist(page: page);
      if (!mounted) return;

      final ids = <String>{...state.wishlistedIds};
      for (final item in result.data) {
        ids.add(item.productId);
      }

      state = state.copyWith(
        items: result.data,
        wishlistedIds: ids,
        page: result.page,
        totalPages: result.totalPages,
        isLoading: false,
      );
    } on DioException catch (e) {
      if (!mounted) return;
      state = state.copyWith(
        isLoading: false,
        error: extractDioErrorMessage(e),
      );
    } catch (e) {
      if (!mounted) return;
      state = state.copyWith(
        isLoading: false,
        error: e.toString(),
      );
    }
  }

  Future<void> loadMore() async {
    if (state.isLoading || !state.hasNextPage) return;
    await loadWishlist(page: state.page + 1);
  }

  Future<void> addToWishlist(String productId) async {
    // Skip if already wishlisted (keeps the count honest on double-tap).
    if (state.wishlistedIds.contains(productId)) return;

    // Optimistic update
    final previousIds = state.wishlistedIds;
    final previousCount = state.count;
    state = state.copyWith(
      wishlistedIds: {...state.wishlistedIds, productId},
      count: previousCount + 1,
    );

    try {
      await _repository.addToWishlist(productId);
      const PosthogAnalytics().capture(
        'wishlist_added',
        properties: {'productId': productId},
      );
    } catch (_) {
      if (!mounted) return;
      // Rollback. The API rejects inactive/deleted products (404) — the
      // optimistic add is reverted and the error rethrown so the UI can
      // surface it (see WishlistButton).
      state = state.copyWith(
        wishlistedIds: previousIds,
        count: previousCount,
      );
      rethrow;
    }
  }

  Future<void> removeFromWishlist(String productId) async {
    // Optimistic update
    final previousIds = state.wishlistedIds;
    final previousItems = state.items;
    final previousCount = state.count;
    final wasWishlisted = previousIds.contains(productId);
    final newIds = {...state.wishlistedIds}..remove(productId);
    final newItems =
        state.items.where((item) => item.productId != productId).toList();

    state = state.copyWith(
      wishlistedIds: newIds,
      items: newItems,
      // Only decrement if it was counted; floor at 0.
      count: wasWishlisted ? (previousCount - 1).clamp(0, previousCount) : previousCount,
    );

    try {
      await _repository.removeFromWishlist(productId);
      const PosthogAnalytics().capture(
        'wishlist_removed',
        properties: {'productId': productId},
      );
    } catch (_) {
      if (!mounted) return;
      // Rollback
      state = state.copyWith(
        wishlistedIds: previousIds,
        items: previousItems,
        count: previousCount,
      );
      rethrow;
    }
  }

  Future<void> toggleWishlist(String productId) async {
    if (state.wishlistedIds.contains(productId)) {
      await removeFromWishlist(productId);
    } else {
      await addToWishlist(productId);
    }
  }

  bool isWishlisted(String productId) {
    return state.wishlistedIds.contains(productId);
  }

  Future<void> loadWishlistIds(List<String> productIds) async {
    try {
      final ids = await _repository.checkWishlistIds(productIds);
      if (!mounted) return;
      state = state.copyWith(
        wishlistedIds: {...state.wishlistedIds, ...ids},
      );
    } catch (_) {
      // Non-critical, silently fail
    }
  }

  Future<void> refresh() async {
    await loadWishlist(page: 1);
    await loadCount();
  }

}

final wishlistProvider =
    StateNotifierProvider<WishlistNotifier, WishlistState>((ref) {
  return WishlistNotifier(ref.read(wishlistRepositoryProvider));
});
