import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:posthog_flutter/posthog_flutter.dart';
import '../../features/auth/presentation/providers/auth_provider.dart';
import '../../features/auth/presentation/screens/otp_request_screen.dart';
import '../../features/auth/presentation/screens/otp_verify_screen.dart';
import '../../features/auth/presentation/screens/claim_request_screen.dart';
import '../../features/auth/presentation/screens/claim_verify_screen.dart';
import '../../features/city/presentation/providers/city_provider.dart';
import '../../features/city/presentation/screens/city_selection_screen.dart';
import '../../features/cart/presentation/screens/cart_screen.dart';
import '../../features/catalog/presentation/screens/categories_screen.dart';
import '../../features/catalog/presentation/screens/category_screen.dart';
import '../../features/catalog/presentation/screens/product_detail_screen.dart';
import '../../features/catalog/presentation/screens/search_screen.dart';
import '../../features/catalog/presentation/screens/promotions_screen.dart';
import '../../features/checkout/data/models/checkout_model.dart';
import '../../features/checkout/presentation/screens/checkout_screen.dart';
import '../../features/checkout/presentation/screens/checkout_success_screen.dart';
import '../../features/checkout/presentation/screens/payment_pending_screen.dart';
import '../../features/home/presentation/home_screen.dart';
import '../../features/notifications/presentation/screens/notifications_screen.dart';
import '../../features/orders/presentation/screens/order_detail_screen.dart';
import '../../features/orders/presentation/screens/orders_screen.dart';
import '../../features/profile/presentation/screens/address_book_screen.dart';
import '../../features/profile/presentation/screens/notification_settings_screen.dart';
import '../../features/profile/presentation/screens/personal_info_screen.dart';
import '../../features/profile/presentation/screens/profile_screen.dart';
import '../../features/profile/presentation/screens/security_screen.dart';
import '../../features/profile/presentation/screens/account_deletion_screen.dart';
import '../../features/content/presentation/screens/content_page_screen.dart';
import '../../features/reviews/presentation/screens/product_reviews_screen.dart';
import '../../features/wishlist/presentation/screens/wishlist_screen.dart';
import 'main_shell.dart';

/// The route a guest tried to reach (or the screen they acted on) before being
/// sent to login. Consumed by the router redirect right after authentication so
/// the user returns to where they were (Guest Browsing, 2026-06-22).
final returnToRouteProvider = StateProvider<String?>((ref) => null);

/// How the current auth flow was entered, which decides how we leave it:
///   • `true`  = PUSHED over live content by `ensureAuthenticated` (an inline
///     action like add-to-cart). On success we POP back to the origin so its
///     back button + browsing stack survive, and the awaiting caller resumes
///     the action in place.
///   • `false` = REPLACED the stack by the router redirect (a guest hit a
///     protected route). On success we `go(returnTo)`.
/// This is the single deterministic signal the verify screens use — `canPop()`
/// can't distinguish the two (it's true in both).
final pushAuthFlowProvider = StateProvider<bool>((ref) => false);

/// Routes that require authentication. Everything else (home, categories,
/// product detail, search, city selection, content pages) is public for guests.
const _protectedPrefixes = <String>[
  '/cart',
  '/checkout',
  '/orders',
  '/wishlist',
  '/profile',
  '/notifications',
];

/// True when a route requires authentication (so guests are sent to login).
/// Public for unit testing.
bool isProtectedRoute(String location) =>
    _protectedPrefixes.any((p) => location == p || location.startsWith('$p/'));

/// Root navigator — hosts the full-screen routes that sit ABOVE the bottom-nav
/// shell (auth, city selection, product detail, search, checkout, orders,
/// notifications). The five tab destinations live inside the shell branches.
final _rootNavigatorKey = GlobalKey<NavigatorState>(debugLabel: 'root');

final appRouterProvider = Provider<GoRouter>((ref) {
  // Build GoRouter exactly once. Auth/city state changes trigger a
  // redirect re-evaluation via `refreshListenable` below — they must
  // NOT cause the entire GoRouter instance to be replaced, otherwise
  // every transient state change (e.g. `isLoading: true` → `false`
  // during an OTP request) resets navigation to `initialLocation`
  // mid-flight and undoes any `context.push` in progress.
  return GoRouter(
    navigatorKey: _rootNavigatorKey,
    initialLocation: '/',
    // Automatic $screen capture on every navigation. No-op when PostHog
    // isn't initialized (empty flavor key).
    observers: [PosthogObserver()],
    refreshListenable: _AuthCityRefreshNotifier(ref),
    redirect: (context, state) {
      final authState = ref.read(authProvider);
      final cityState = ref.read(cityProvider);
      final isAuth = authState.status == AuthStatus.authenticated;
      final isUnknown = authState.status == AuthStatus.unknown;
      final location = state.matchedLocation;
      final isAuthRoute = location.startsWith('/auth');
      final isCityRoute = location == '/city-selection';

      // Auth still resolving — don't redirect.
      if (isUnknown) return null;

      // City-first: everyone (guest OR authenticated) picks a delivery town
      // before browsing — products/search are town-scoped. (Guest browsing,
      // 2026-06-22: this used to gate only authenticated users.)
      if (!isCityRoute && !cityState.hasCity && !cityState.isLoading) {
        return '/city-selection';
      }

      // Guests browse freely; only protected routes require login. Save where
      // they were headed so we can return them there after they authenticate.
      // This is the REPLACE path (stack was swapped for the login screen), so
      // clear the push flag — the verify screen must `go(returnTo)`, not pop.
      if (!isAuth && !isAuthRoute && isProtectedRoute(location)) {
        ref.read(returnToRouteProvider.notifier).state = state.uri.toString();
        ref.read(pushAuthFlowProvider.notifier).state = false;
        return '/auth/connexion';
      }

      // Just authenticated while on an auth route → send them to the saved
      // return-to (the protected route / action they came from), else home.
      // SKIP this when the flow was PUSHED (`ensureAuthenticated`): there the
      // verify screen pops back to the live origin, and a `go(returnTo)` here
      // would replace (destroy) that preserved browsing stack.
      if (isAuth && isAuthRoute && !ref.read(pushAuthFlowProvider)) {
        final returnTo = ref.read(returnToRouteProvider);
        if (returnTo != null && returnTo.isNotEmpty) {
          // Clear after this redirect resolves (avoids mutating during build).
          Future.microtask(
            () => ref.read(returnToRouteProvider.notifier).state = null,
          );
          return returnTo;
        }
        return '/';
      }

      return null;
    },
    routes: [
      // ── Full-screen routes (above the bottom-nav shell) ──────────────────
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
          final cooldown = (extra?['cooldown'] as num?)?.toInt() ?? 30;
          return OtpVerifyScreen(phone: phone, initialCooldown: cooldown);
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
        builder: (context, state) =>
            SearchScreen(initialQuery: state.uri.queryParameters['q']),
      ),
      GoRoute(
        path: '/promotions',
        builder: (context, state) => const PromotionsScreen(),
      ),
      GoRoute(
        path: '/products/:id',
        builder: (context, state) {
          final productId = state.pathParameters['id']!;
          return ProductDetailScreen(productId: productId);
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
        path: '/notifications',
        builder: (context, state) => const NotificationsScreen(),
      ),
      GoRoute(
        path: '/profile/informations',
        builder: (context, state) => const PersonalInfoScreen(),
      ),
      GoRoute(
        path: '/profile/addresses',
        builder: (context, state) => const AddressBookScreen(),
      ),
      GoRoute(
        path: '/profile/notifications',
        builder: (context, state) => const NotificationSettingsScreen(),
      ),
      GoRoute(
        path: '/profile/security',
        builder: (context, state) => const SecurityScreen(),
      ),
      GoRoute(
        path: '/profile/delete-account',
        builder: (context, state) => const AccountDeletionScreen(),
      ),
      GoRoute(
        path: '/pages/:slug',
        builder: (context, state) {
          final slug = state.pathParameters['slug']!;
          return ContentPageScreen(slug: slug);
        },
      ),
      // /messages and /messages/:id retired 2026-05-17 — direct buyer↔
      // seller messaging removed in favour of "Contacter le support".

      // ── Bottom-nav shell: 5 tab destinations, one navigator each ─────────
      StatefulShellRoute.indexedStack(
        builder: (context, state, navigationShell) =>
            MainShell(navigationShell: navigationShell),
        branches: [
          StatefulShellBranch(
            observers: [PosthogObserver()],
            routes: [
              GoRoute(
                  path: '/', builder: (context, state) => const HomeScreen()),
            ],
          ),
          StatefulShellBranch(
            observers: [PosthogObserver()],
            routes: [
              GoRoute(
                path: '/categories',
                builder: (context, state) => const CategoriesScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            observers: [PosthogObserver()],
            routes: [
              GoRoute(
                path: '/wishlist',
                builder: (context, state) => const WishlistScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            observers: [PosthogObserver()],
            routes: [
              GoRoute(
                path: '/cart',
                builder: (context, state) => const CartScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            observers: [PosthogObserver()],
            routes: [
              GoRoute(
                path: '/profile',
                builder: (context, state) => const ProfileScreen(),
              ),
            ],
          ),
        ],
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
