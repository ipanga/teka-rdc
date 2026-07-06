import 'package:buyer_mobile/core/widgets/adaptive_leading.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

/// A full-screen route whose AppBar uses [AdaptiveLeading].
Widget _screen(String title) => Scaffold(
      appBar: AppBar(leading: const AdaptiveLeading(), title: Text(title)),
      body: Center(child: Text('$title body')),
    );

GoRouter _router() => GoRouter(
      initialLocation: '/',
      routes: [
        GoRoute(
          path: '/',
          builder: (context, state) => Scaffold(
            body: Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  ElevatedButton(
                    onPressed: () => context.push('/pushed'),
                    child: const Text('push'),
                  ),
                  ElevatedButton(
                    onPressed: () => context.go('/gone'),
                    child: const Text('go'),
                  ),
                ],
              ),
            ),
          ),
        ),
        GoRoute(path: '/pushed', builder: (context, state) => _screen('Pushed')),
        GoRoute(path: '/gone', builder: (context, state) => _screen('Gone')),
      ],
    );

void main() {
  group('AdaptiveLeading', () {
    testWidgets('pushed route → shows back arrow and pops to origin',
        (tester) async {
      await tester.pumpWidget(MaterialApp.router(routerConfig: _router()));

      await tester.tap(find.text('push'));
      await tester.pumpAndSettle();
      expect(find.text('Pushed body'), findsOneWidget);
      // Can pop → a back arrow (not a home button).
      expect(find.byIcon(Icons.arrow_back), findsOneWidget);
      expect(find.byIcon(Icons.home_outlined), findsNothing);

      await tester.tap(find.byIcon(Icons.arrow_back));
      await tester.pumpAndSettle();
      expect(find.text('push'), findsOneWidget); // back on the origin
    });

    testWidgets('go() (stack replaced) → shows home button and routes to fallback',
        (tester) async {
      await tester.pumpWidget(MaterialApp.router(routerConfig: _router()));

      await tester.tap(find.text('go'));
      await tester.pumpAndSettle();
      expect(find.text('Gone body'), findsOneWidget);
      // Nothing to pop → a home button (never a dead back arrow).
      expect(find.byIcon(Icons.home_outlined), findsOneWidget);
      expect(find.byIcon(Icons.arrow_back), findsNothing);

      await tester.tap(find.byIcon(Icons.home_outlined));
      await tester.pumpAndSettle();
      expect(find.text('push'), findsOneWidget); // routed to fallback '/'
    });
  });
}
