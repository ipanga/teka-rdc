import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../router/app_router.dart';
import '../../features/auth/presentation/providers/auth_provider.dart';

/// Gate a protected inline action (add-to-cart, favorite, …) behind login while
/// keeping browsing open to guests (Guest Browsing, 2026-06-22).
///
/// Returns `true` when the user ends up authenticated — the caller then proceeds
/// with the action IN PLACE (the origin screen was never left). When a guest
/// calls it, the login flow is PUSHED over the current screen and awaited; on a
/// successful verification the verify screen pops back here (preserving the
/// browsing stack + back button) and this future completes `true`. If the guest
/// backs out without authenticating, it completes `false` and the caller
/// early-returns. Callers must `await` and early-return on `false`.
Future<bool> ensureAuthenticated(BuildContext context, WidgetRef ref) async {
  final isAuthenticated =
      ref.read(authProvider).status == AuthStatus.authenticated;
  if (isAuthenticated) return true;

  // PUSH (don't replace) so the origin screen stays mounted beneath the login
  // flow; mark the flow as push-mode so the verify screen pops back instead of
  // `go`-ing. `returnToRouteProvider` is still set as a harmless fallback.
  ref.read(returnToRouteProvider.notifier).state =
      GoRouterState.of(context).uri.toString();
  ref.read(pushAuthFlowProvider.notifier).state = true;

  final result = await context.push<bool>('/auth/connexion');

  // Reset the flag so a later REPLACE-path login isn't mistaken for push-mode.
  ref.read(pushAuthFlowProvider.notifier).state = false;

  return result == true &&
      ref.read(authProvider).status == AuthStatus.authenticated;
}
