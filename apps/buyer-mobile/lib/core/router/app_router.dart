import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../features/auth/presentation/providers/auth_provider.dart';
import '../../features/auth/presentation/screens/otp_request_screen.dart';
import '../../features/auth/presentation/screens/otp_verify_screen.dart';
import '../../features/auth/presentation/screens/claim_request_screen.dart';
import '../../features/auth/presentation/screens/claim_verify_screen.dart';
import '../../features/city/presentation/providers/city_provider.dart';
import '../../features/city/presentation/screens/city_selection_screen.dart';
import '../../features/cart/presentation/screens/cart_screen.dart';
import '../../features/catalog/presentation/screens/category_screen.dart';
import '../../features/catalog/presentation/screens/product_detail_screen.dart';
import '../../features/catalog/presentation/screens/search_screen.dart';
import '../../features/checkout/data/models/checkout_model.dart';
import '../../features/checkout/presentation/screens/checkout_screen.dart';
import '../../features/checkout/presentation/screens/checkout_success_screen.dart';
import '../../features/checkout/presentation/screens/payment_pending_screen.dart';
import '../../features/home/presentation/home_screen.dart';
import '../../features/orders/presentation/screens/order_detail_screen.dart';
import '../../features/orders/presentation/screens/orders_screen.dart';
import '../../features/content/presentation/screens/content_page_screen.dart';
import '../../features/reviews/presentation/screens/product_reviews_screen.dart';
import '../../features/wishlist/presentation/screens/wishlist_screen.dart';

final appRouterProvider = Provider<GoRouter>((ref) {
  final authState = ref.watch(authProvider);
  final cityState = ref.watch(cityProvider);

  return GoRouter(
    initialLocation: '/',
    refreshListenable: _AuthCityRefreshNotifier(ref),
    redirect: (context, state) {
      final isAuth = authState.status == AuthStatus.authenticated;
      final isLoading = authState.status == AuthStatus.unknown;
      final isAuthRoute = state.matchedLocation.startsWith('/auth');
      final isCityRoute = state.matchedLocation == '/city-selection';

      // Still loading, don't redirect
      if (isLoading) return null;

      // Not authenticated and not on auth route -> redirect to OTP login
      if (!isAuth && !isAuthRoute) return '/auth/connexion';

      // Authenticated and on auth route -> redirect to home
      if (isAuth && isAuthRoute) return '/';

      // Authenticated but no city selected -> redirect to city selection
      // (skip if already on city selection or still loading cities)
      if (isAuth && !isCityRoute && !cityState.hasCity && !cityState.isLoading) {
        return '/city-selection';
      }

      return null;
    },
    routes: [
      GoRoute(
        path: '/',
        builder: (context, state) => const HomeScreen(),
      ),
      GoRoute(
        path: '/city-selection',
        builder: (context, state) => const CitySelectionScreen(),
      ),
      GoRoute(
        path: '/auth/connexion',
        builder: (context, state) => const OtpRequestScreen(),
      ),
      GoRoute(
        path: '/auth/otp',
        builder: (context, state) {
          final extra = state.extra as Map<String, dynamic>?;
          final phone = (extra?['phone'] as String?) ?? '';
          return OtpVerifyScreen(phone: phone);
        },
      ),
      GoRoute(
        path: '/auth/reclamer-compte',
        builder: (context, state) => const ClaimRequestScreen(),
      ),
      GoRoute(
        path: '/auth/reclamer-compte/confirmer',
        builder: (context, state) {
          final token = state.uri.queryParameters['token'];
          return ClaimVerifyScreen(token: token);
        },
      ),
      GoRoute(
        path: '/categories/:id',
        builder: (context, state) {
          final categoryId = state.pathParameters['id']!;
          final extra = state.extra as Map<String, dynamic>?;
          final categoryName = extra?['categoryName'] as String?;
          return CategoryScreen(
            categoryId: categoryId,
            categoryName: categoryName,
          );
        },
      ),
      GoRoute(
        path: '/search',
        builder: (context, state) => const SearchScreen(),
      ),
      GoRoute(
        path: '/products/:id',
        builder: (context, state) {
          final productId = state.pathParameters['id']!;
          return ProductDetailScreen(productId: productId);
        },
      ),
      GoRoute(
        path: '/cart',
        builder: (context, state) => const CartScreen(),
      ),
      GoRoute(
        path: '/checkout',
        builder: (context, state) => const CheckoutScreen(),
      ),
      GoRoute(
        path: '/checkout/success',
        builder: (context, state) {
          final extra = state.extra as Map<String, dynamic>?;
          final orders = extra?['orders'] as List<CheckoutOrderModel>? ?? [];
          return CheckoutSuccessScreen(orders: orders);
        },
      ),
      GoRoute(
        path: '/checkout/payment-pending',
        builder: (context, state) {
          final extra = state.extra as Map<String, dynamic>?;
          final orders = extra?['orders'] as List<CheckoutOrderModel>? ?? [];
          return PaymentPendingScreen(orders: orders);
        },
      ),
      GoRoute(
        path: '/orders',
        builder: (context, state) => const OrdersScreen(),
      ),
      GoRoute(
        path: '/orders/:id',
        builder: (context, state) {
          final orderId = state.pathParameters['id']!;
          return OrderDetailScreen(orderId: orderId);
        },
      ),
      GoRoute(
        path: '/wishlist',
        builder: (context, state) => const WishlistScreen(),
      ),
      // /messages and /messages/:id retired 2026-05-17 — direct buyer↔
      // seller messaging removed in favour of "Contacter le support".
      GoRoute(
        path: '/products/:id/reviews',
        builder: (context, state) {
          final productId = state.pathParameters['id']!;
          return ProductReviewsScreen(productId: productId);
        },
      ),
      GoRoute(
        path: '/pages/:slug',
        builder: (context, state) {
          final slug = state.pathParameters['slug']!;
          return ContentPageScreen(slug: slug);
        },
      ),
    ],
  );
});

class _AuthCityRefreshNotifier extends ChangeNotifier {
  _AuthCityRefreshNotifier(Ref ref) {
    ref.listen(authProvider, (_, __) {
      notifyListeners();
    });
    ref.listen(cityProvider, (_, __) {
      notifyListeners();
    });
  }
}
