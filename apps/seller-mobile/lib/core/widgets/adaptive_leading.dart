import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

/// Leading control for full-screen (root-navigator) `AppBar`s.
///
/// Full-screen routes live ABOVE the bottom-nav shell, so — by design — they
/// carry no bottom bar and must provide their own way out. Whether Flutter's
/// automatic back arrow appears depends on HOW the screen was reached:
///   • `context.push('/x')` leaves a page to pop → back arrow shows, pop works.
///   • `context.go('/x')`  REPLACES the whole stack → `canPop()` is false → a
///     plain `AppBar` renders NO leading → the user is trapped (no back, no bar).
///
/// That second case is how the product detail trapped sellers when opened via
/// `go('/products/:id')` right after creating a product, and it can happen on
/// any screen opened from a push-notification deep link.
///
/// [AdaptiveLeading] removes the dependency on the entry method: it pops when
/// there is somewhere to pop back to, otherwise it routes to a safe fallback
/// (the dashboard by default). Use it as `AppBar.leading` on every full-screen
/// route so no screen can ever become a dead end.
class AdaptiveLeading extends StatelessWidget {
  const AdaptiveLeading({super.key, this.fallbackLocation = '/'});

  /// Where to send the user when there is nothing to pop back to.
  final String fallbackLocation;

  @override
  Widget build(BuildContext context) {
    final canPop = Navigator.of(context).canPop();
    return IconButton(
      // Back arrow when we can pop, Home when we can't — so the control always
      // matches what it will actually do.
      icon: Icon(canPop ? Icons.arrow_back : Icons.home_outlined),
      tooltip: canPop ? 'Retour' : 'Tableau de bord',
      onPressed: () =>
          canPop ? context.pop() : context.go(fallbackLocation),
    );
  }
}
