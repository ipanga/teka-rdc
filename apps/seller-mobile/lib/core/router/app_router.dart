import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:posthog_flutter/posthog_flutter.dart';
import '../../features/auth/presentation/providers/auth_provider.dart';
import '../../features/auth/presentation/screens/forgot_password_screen.dart';
import '../../features/auth/presentation/screens/login_screen.dart';
import '../../features/auth/presentation/screens/register_screen.dart';
import '../../features/auth/presentation/screens/reset_password_screen.dart';
import '../../features/auth/presentation/screens/wrong_role_screen.dart';
import '../../features/earnings/presentation/screens/earnings_screen.dart';
import '../../features/earnings/presentation/screens/request_payout_screen.dart';
import '../../features/home/presentation/home_screen.dart';
import '../../features/notifications/presentation/screens/notifications_screen.dart';
import '../../features/orders/presentation/screens/order_detail_screen.dart';
import '../../features/orders/presentation/screens/orders_list_screen.dart';
import '../../features/products/presentation/screens/product_detail_screen.dart';
import '../../features/products/presentation/screens/product_form_screen.dart';
import '../../features/products/presentation/screens/product_images_screen.dart';
import '../../features/products/presentation/screens/products_list_screen.dart';
import '../../features/products/data/models/product_model.dart';
import '../../features/profile/presentation/screens/profile_screen.dart';
import '../../features/promotions/presentation/screens/create_promotion_screen.dart';
import '../../features/promotions/presentation/screens/promotions_list_screen.dart';
import '../../features/reviews/presentation/screens/seller_reviews_screen.dart';
import '../../features/seller_application/presentation/screens/seller_application_screen.dart';

final appRouterProvider = Provider<GoRouter>((ref) {
  // Build GoRouter exactly once. Auth state changes trigger redirect
  // re-evaluation via `refreshListenable` — they must NOT cause the
  // entire GoRouter instance to be replaced, otherwise every transient
  // state change (e.g. `isLoading: true → false` during login) resets
  // navigation to `initialLocation` mid-flight and undoes any
  // `context.push` in progress. Same bug + fix as buyer-mobile PR #162.
  return GoRouter(
    initialLocation: '/',
    // Automatic $screen capture on every navigation. No-op when PostHog
    // isn't initialized (empty flavor key).
    observers: [PosthogObserver()],
    refreshListenable: _AuthRefreshNotifier(ref),
    redirect: (context, state) {
      final authState = ref.read(authProvider);
      final status = authState.status;
      final isLoading = status == AuthStatus.unknown;
      final isAuth = status == AuthStatus.authenticated;
      final isWrongRole = status == AuthStatus.wrongRole;
      final isAuthRoute = state.matchedLocation.startsWith('/auth');

      // Approval gate: a seller without an APPROVED SellerProfile (fresh
      // registration → role SELLER but no profile, or PENDING/REJECTED) is
      // confined to the application flow until an admin approves. Status is
      // read from /me's sellerProfile (login/register populate it via
      // checkAuthStatus).
      final sellerProfile =
          authState.user?['sellerProfile'] as Map<String, dynamic>?;
      final appStatus = sellerProfile?['applicationStatus'] as String?;
      final needsApplication = isAuth && appStatus != 'APPROVED';
      final isApplicationRoute = state.matchedLocation == '/devenir-vendeur';

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

      // Unapproved seller -> confine to the application flow.
      if (needsApplication && !isApplicationRoute) return '/devenir-vendeur';

      // Approved seller landing on the application flow -> home.
      if (isAuth && !needsApplication && isApplicationRoute) return '/';

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
        path: '/auth/register',
        builder: (context, state) {
          final extra = state.extra as Map<String, dynamic>?;
          return RegisterScreen(
            phone: extra?['phone'] as String?,
            code: extra?['code'] as String?,
          );
        },
      ),
      // /auth/migrate and /auth/setup-password retired 2026-05-18 —
      // legacy SMS→email migration flow removed. Sellers register fresh
      // via /auth/register or recover via /auth/forgot-password.
      GoRoute(
        path: '/auth/forgot-password',
        builder: (context, state) => const ForgotPasswordScreen(),
      ),
      GoRoute(
        path: '/auth/reset-password',
        builder: (context, state) {
          final token = state.uri.queryParameters['token'];
          return ResetPasswordScreen(token: token);
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

      // Seller business application (onboarding gate)
      GoRoute(
        path: '/devenir-vendeur',
        builder: (context, state) => const SellerApplicationScreen(),
      ),

      // Notifications
      GoRoute(
        path: '/notifications',
        builder: (context, state) => const NotificationsScreen(),
      ),

      // Profile
      GoRoute(
        path: '/profile',
        builder: (context, state) => const ProfileScreen(),
      ),

      // /messages and /messages/:id retired 2026-05-17 — direct buyer↔
      // seller messaging removed in favour of "Contacter le support".
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
