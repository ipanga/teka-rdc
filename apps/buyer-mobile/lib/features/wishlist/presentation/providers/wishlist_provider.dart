import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../data/models/wishlist_model.dart';
import '../../data/wishlist_repository.dart';

class WishlistState {
  final List<WishlistItemModel> items;
  final Set<String> wishlistedIds;
  final bool isLoading;
  final String? error;
  final int page;
  final int totalPages;

  const WishlistState({
    this.items = const [],
    this.wishlistedIds = const {},
    this.isLoading = false,
    this.error,
    this.page = 1,
    this.totalPages = 1,
  });

  WishlistState copyWith({
    List<WishlistItemModel>? items,
    Set<String>? wishlistedIds,
    bool? isLoading,
    String? error,
    int? page,
    int? totalPages,
    bool clearError = false,
  }) {
    return WishlistState(
      items: items ?? this.items,
      wishlistedIds: wishlistedIds ?? this.wishlistedIds,
      isLoading: isLoading ?? this.isLoading,
      error: clearError ? null : (error ?? this.error),
      page: page ?? this.page,
      totalPages: totalPages ?? this.totalPages,
    );
  }

  bool get hasNextPage => page < totalPages;
}

class WishlistNotifier extends StateNotifier<WishlistState> {
  final WishlistRepository _repository;

  WishlistNotifier(this._repository) : super(const WishlistState()) {
    loadWishlist();
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
        error: _extractErrorMessage(e),
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
    // Optimistic update
    final previousIds = state.wishlistedIds;
    state = state.copyWith(
      wishlistedIds: {...state.wishlistedIds, productId},
    );

    try {
      await _repository.addToWishlist(productId);
    } catch (_) {
      if (!mounted) return;
      // Rollback
      state = state.copyWith(wishlistedIds: previousIds);
      rethrow;
    }
  }

  Future<void> removeFromWishlist(String productId) async {
    // Optimistic update
    final previousIds = state.wishlistedIds;
    final previousItems = state.items;
    final newIds = {...state.wishlistedIds}..remove(productId);
    final newItems =
        state.items.where((item) => item.productId != productId).toList();

    state = state.copyWith(
      wishlistedIds: newIds,
      items: newItems,
    );

    try {
      await _repository.removeFromWishlist(productId);
    } catch (_) {
      if (!mounted) return;
      // Rollback
      state = state.copyWith(
        wishlistedIds: previousIds,
        items: previousItems,
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
  }

  String _extractErrorMessage(DioException e) {
    if (e.type == DioExceptionType.connectionTimeout ||
        e.type == DioExceptionType.receiveTimeout) {
      return 'Connexion lente. Veuillez reessayer.';
    }
    if (e.type == DioExceptionType.connectionError) {
      return 'Pas de connexion internet.';
    }
    final data = e.response?.data;
    if (data is Map && data['error'] != null) {
      final error = data['error'];
      if (error is Map && error['message'] != null) {
        return error['message'].toString();
      }
      return error.toString();
    }
    return 'Une erreur est survenue. Veuillez reessayer.';
  }
}

final wishlistProvider =
    StateNotifierProvider<WishlistNotifier, WishlistState>((ref) {
  return WishlistNotifier(ref.read(wishlistRepositoryProvider));
});
