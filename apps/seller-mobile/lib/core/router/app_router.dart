import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../features/auth/presentation/providers/auth_provider.dart';
import '../../features/auth/presentation/screens/login_screen.dart';
import '../../features/auth/presentation/screens/otp_screen.dart';
import '../../features/auth/presentation/screens/register_screen.dart';
import '../../features/auth/presentation/screens/wrong_role_screen.dart';
import '../../features/earnings/presentation/screens/earnings_screen.dart';
import '../../features/earnings/presentation/screens/request_payout_screen.dart';
import '../../features/home/presentation/home_screen.dart';
import '../../features/messaging/presentation/screens/chat_screen.dart';
import '../../features/messaging/presentation/screens/conversations_screen.dart';
import '../../features/orders/presentation/screens/order_detail_screen.dart';
import '../../features/orders/presentation/screens/orders_list_screen.dart';
import '../../features/products/presentation/screens/product_detail_screen.dart';
import '../../features/products/presentation/screens/product_form_screen.dart';
import '../../features/products/presentation/screens/product_images_screen.dart';
import '../../features/products/presentation/screens/products_list_screen.dart';
import '../../features/products/data/models/product_model.dart';
import '../../features/promotions/presentation/screens/create_promotion_screen.dart';
import '../../features/promotions/presentation/screens/promotions_list_screen.dart';
import '../../features/reviews/presentation/screens/seller_reviews_screen.dart';

final appRouterProvider = Provider<GoRouter>((ref) {
  final authState = ref.watch(authProvider);

  return GoRouter(
    initialLocation: '/',
    refreshListenable: _AuthRefreshNotifier(ref),
    redirect: (context, state) {
      final status = authState.status;
      final isLoading = status == AuthStatus.unknown;
      final isAuth = status == AuthStatus.authenticated;
      final isWrongRole = status == AuthStatus.wrongRole;
      final isAuthRoute = state.matchedLocation.startsWith('/auth');

      // Still loading, don't redirect
      if (isLoading) return null;

      // Wrong role -> show wrong role screen
      if (isWrongRole && state.matchedLocation != '/auth/wrong-role' &&
          state.matchedLocation != '/auth/register') {
        return '/auth/wrong-role';
      }

      // Not authenticated and not on auth route -> redirect to login
      if (!isAuth && !isWrongRole && !isAuthRoute) return '/auth/login';

      // Authenticated and on auth route -> redirect to home
      if (isAuth && isAuthRoute) return '/';

      return null;
    },
    routes: [
      GoRoute(
        path: '/',
        builder: (context, state) => const HomeScreen(),
      ),

      // Auth routes
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
        path: '/auth/wrong-role',
        builder: (context, state) => const WrongRoleScreen(),
      ),

      // Earnings routes
      GoRoute(
        path: '/earnings',
        builder: (context, state) => const EarningsScreen(),
      ),
      GoRoute(
        path: '/earnings/request-payout',
        builder: (context, state) => const RequestPayoutScreen(),
      ),

      // Order routes
      GoRoute(
        path: '/orders',
        builder: (context, state) => const OrdersListScreen(),
      ),
      GoRoute(
        path: '/orders/:id',
        builder: (context, state) {
          final id = state.pathParameters['id']!;
          return OrderDetailScreen(orderId: id);
        },
      ),

      // Product routes
      GoRoute(
        path: '/products',
        builder: (context, state) => const ProductsListScreen(),
      ),
      GoRoute(
        path: '/products/new',
        builder: (context, state) => const ProductFormScreen(),
      ),
      GoRoute(
        path: '/products/:id',
        builder: (context, state) {
          final id = state.pathParameters['id']!;
          return ProductDetailScreen(productId: id);
        },
      ),
      GoRoute(
        path: '/products/:id/edit',
        builder: (context, state) {
          final extra = state.extra as SellerProductModel?;
          return ProductFormScreen(product: extra);
        },
      ),
      GoRoute(
        path: '/products/:id/images',
        builder: (context, state) {
          final id = state.pathParameters['id']!;
          return ProductImagesScreen(productId: id);
        },
      ),

      // Promotions routes
      GoRoute(
        path: '/promotions',
        builder: (context, state) => const PromotionsListScreen(),
      ),
      GoRoute(
        path: '/promotions/create',
        builder: (context, state) => const CreatePromotionScreen(),
      ),

      // Reviews routes
      GoRoute(
        path: '/reviews',
        builder: (context, state) => const SellerReviewsScreen(),
      ),

      // Messaging routes
      GoRoute(
        path: '/messages',
        builder: (context, state) => const ConversationsScreen(),
      ),
      GoRoute(
        path: '/messages/:id',
        builder: (context, state) {
          final id = state.pathParameters['id']!;
          return ChatScreen(conversationId: id);
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
