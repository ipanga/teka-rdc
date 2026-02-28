import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../features/auth/presentation/providers/auth_provider.dart';
import '../../features/auth/presentation/screens/login_screen.dart';
import '../../features/auth/presentation/screens/otp_screen.dart';
import '../../features/auth/presentation/screens/register_screen.dart';
import '../../features/cart/presentation/screens/cart_screen.dart';
import '../../features/catalog/presentation/screens/category_screen.dart';
import '../../features/catalog/presentation/screens/product_detail_screen.dart';
import '../../features/catalog/presentation/screens/search_screen.dart';
import '../../features/checkout/data/models/checkout_model.dart';
import '../../features/checkout/presentation/screens/checkout_screen.dart';
import '../../features/checkout/presentation/screens/checkout_success_screen.dart';
import '../../features/checkout/presentation/screens/payment_pending_screen.dart';
import '../../features/home/presentation/home_screen.dart';
import '../../features/messaging/presentation/screens/chat_screen.dart';
import '../../features/messaging/presentation/screens/conversations_screen.dart';
import '../../features/orders/presentation/screens/order_detail_screen.dart';
import '../../features/orders/presentation/screens/orders_screen.dart';
import '../../features/content/presentation/screens/content_page_screen.dart';
import '../../features/reviews/presentation/screens/product_reviews_screen.dart';
import '../../features/wishlist/presentation/screens/wishlist_screen.dart';

final appRouterProvider = Provider<GoRouter>((ref) {
  final authState = ref.watch(authProvider);

  return GoRouter(
    initialLocation: '/',
    refreshListenable: _AuthRefreshNotifier(ref),
    redirect: (context, state) {
      final isAuth = authState.status == AuthStatus.authenticated;
      final isLoading = authState.status == AuthStatus.unknown;
      final isAuthRoute = state.matchedLocation.startsWith('/auth');

      // Still loading, don't redirect
      if (isLoading) return null;

      // Not authenticated and not on auth route -> redirect to login
      if (!isAuth && !isAuthRoute) return '/auth/login';

      // Authenticated and on auth route -> redirect to home
      if (isAuth && isAuthRoute) return '/';

      return null;
    },
    routes: [
      GoRoute(
        path: '/',
        builder: (context, state) => const HomeScreen(),
      ),
      GoRoute(
        path: '/auth/login',
        builder: (context, state) => const LoginScreen(),
      ),
      GoRoute(
        path: '/auth/otp',
        builder: (context, state) {
          final extra = state.extra as Map<String, dynamic>? ?? {};
          return OtpScreen(
            phone: extra['phone'] as String? ?? '',
            isLogin: extra['isLogin'] as bool? ?? true,
          );
        },
      ),
      GoRoute(
        path: '/auth/register',
        builder: (context, state) {
          final extra = state.extra as Map<String, dynamic>?;
          return RegisterScreen(
            phone: extra?['phone'] as String?,
            code: extra?['code'] as String?,
          );
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
      GoRoute(
        path: '/messages',
        builder: (context, state) => const ConversationsScreen(),
      ),
      GoRoute(
        path: '/messages/:id',
        builder: (context, state) {
          final conversationId = state.pathParameters['id']!;
          final extra = state.extra as Map<String, dynamic>?;
          final sellerId = extra?['sellerId'] as String?;
          return ChatScreen(
            conversationId: conversationId,
            sellerId: sellerId,
          );
        },
      ),
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

class _AuthRefreshNotifier extends ChangeNotifier {
  _AuthRefreshNotifier(Ref ref) {
    ref.listen(authProvider, (_, __) {
      notifyListeners();
    });
  }
}
