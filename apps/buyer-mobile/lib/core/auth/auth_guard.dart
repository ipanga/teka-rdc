import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../router/app_router.dart';
import '../../features/auth/presentation/providers/auth_provider.dart';

/// Gate a protected inline action (add-to-cart, favorite, …) behind login while
/// keeping browsing open to guests (Guest Browsing, 2026-06-22).
///
/// Returns `true` when the user is authenticated — the caller proceeds. When a
/// guest calls it, it records the current screen as the return-to target and
/// routes to login, so after authenticating the router brings them straight
/// back here; callers must early-return on `false`.
bool ensureAuthenticated(BuildContext context, WidgetRef ref) {
  final isAuthenticated =
      ref.read(authProvider).status == AuthStatus.authenticated;
  if (isAuthenticated) return true;

  ref.read(returnToRouteProvider.notifier).state =
      GoRouterState.of(context).uri.toString();
  context.go('/auth/connexion');
  return false;
}
