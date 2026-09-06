// Notification Center — PR D (2026-09-06): refetch on open / resume,
// pull-to-refresh, real error state with retry, a failed refresh keeps the
// list, tap routes to the entity.
import 'package:buyer_mobile/core/config/flavor.dart';
import 'package:buyer_mobile/features/auth/presentation/providers/auth_provider.dart';
import 'package:buyer_mobile/features/notifications/data/models/notification_model.dart';
import 'package:buyer_mobile/features/notifications/data/notifications_repository.dart';
import 'package:buyer_mobile/features/notifications/presentation/providers/notifications_provider.dart';
import 'package:buyer_mobile/features/notifications/presentation/screens/notifications_screen.dart';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import '../session/fake_auth.dart';

NotificationModel _n(String id, {String? entityType, String? entityId, bool read = false}) =>
    NotificationModel(
      id: id,
      type: entityType == 'order' ? 'ORDER' : 'BROADCAST',
      title: 'Titre $id',
      body: 'Corps $id',
      entityType: entityType,
      entityId: entityId,
      readAt: read ? DateTime(2026, 9, 1) : null,
      createdAt: DateTime(2026, 9, 1),
    );

class _Repo extends NotificationsRepository {
  _Repo() : super(Dio());
  List<NotificationModel> items = const [];
  int calls = 0;
  bool fail = false;
  @override
  Future<({List<NotificationModel> items, int unread})> getNotifications({int page = 1, int limit = 50}) async {
    calls++;
    if (fail) {
      throw DioException(requestOptions: RequestOptions(path: '/v1/notifications'), type: DioExceptionType.connectionError);
    }
    return (items: items, unread: items.where((n) => !n.isRead).length);
  }

  @override
  Future<int> getUnreadCount() async => items.where((n) => !n.isRead).length;
  @override
  Future<void> markRead(String id) async {}
  @override
  Future<void> markAllRead() async {}
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(FlavorConfig.initialize);

  late _Repo repo;
  late ProviderContainer container;
  final opened = <String>[];

  setUp(() {
    repo = _Repo();
    opened.clear();
    container = ProviderContainer(overrides: [
      notificationsRepositoryProvider.overrideWithValue(repo),
      authProvider.overrideWith((ref) => FakeAuthNotifier.signedIn('A')),
    ]);
    addTearDown(container.dispose);
  });

  Future<void> pump(WidgetTester tester) async {
    final router = GoRouter(initialLocation: '/notifications', routes: [
      GoRoute(path: '/notifications', builder: (_, __) => const NotificationsScreen()),
      GoRoute(
        path: '/orders/:id',
        builder: (_, s) {
          opened.add('/orders/${s.pathParameters['id']}');
          return const Scaffold(body: Text('ORDER'));
        },
      ),
      GoRoute(
        path: '/products/:id',
        builder: (_, s) {
          opened.add('/products/${s.pathParameters['id']}');
          return const Scaffold(body: Text('PRODUCT'));
        },
      ),
    ]);
    await tester.pumpWidget(UncontrolledProviderScope(
      container: container,
      child: MaterialApp.router(routerConfig: router),
    ));
    await tester.pumpAndSettle();
  }

  testWidgets('opening the center refetches an already-loaded feed', (tester) async {
    repo.items = [_n('n1')];
    // The feed was created earlier in the session (e.g. by a push) and is stale.
    container.listen(notificationsProvider, (_, __) {}, fireImmediately: true);
    await tester.pump();
    expect(repo.calls, 1);
    repo.items = [_n('n2'), _n('n1')];
    await pump(tester);
    expect(repo.calls, 2, reason: 'screen entry reloads');
    expect(find.text('Titre n2'), findsOneWidget);
  });

  testWidgets('pull-to-refresh and app resume reload; a failed refresh keeps the list', (tester) async {
    repo.items = [_n('n1')];
    await pump(tester);
    final before = repo.calls;
    await tester.fling(find.text('Titre n1'), const Offset(0, 400), 1000);
    await tester.pumpAndSettle();
    expect(repo.calls, before + 1, reason: 'pull-to-refresh');

    repo.fail = true;
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pumpAndSettle();
    expect(repo.calls, before + 2, reason: 'resume reloads while the screen shows');
    expect(find.text('Titre n1'), findsOneWidget, reason: 'items kept on failure');
    expect(find.byKey(const ValueKey('notifications-inline-error')), findsOneWidget);
    expect(find.textContaining('connexion'), findsOneWidget);

    repo.fail = false;
    await tester.tap(find.text('Réessayer'));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('notifications-inline-error')), findsNothing);
  });

  testWidgets('nothing loaded + failure → error state with retry; then the empty state', (tester) async {
    repo.fail = true;
    await pump(tester);
    expect(find.text('Réessayer'), findsOneWidget);
    expect(find.text('Aucune notification'), findsNothing);
    repo.fail = false;
    await tester.tap(find.text('Réessayer'));
    await tester.pumpAndSettle();
    expect(find.text('Aucune notification'), findsOneWidget);
  });

  testWidgets('tapping an order notification opens the order; a broadcast stays', (tester) async {
    repo.items = [
      _n('o1', entityType: 'order', entityId: '0cfd024b-0b0b-4d97-a2d7-65e7a071d3be'),
      _n('b1'),
    ];
    await pump(tester);
    await tester.tap(find.text('Titre b1'));
    await tester.pumpAndSettle();
    expect(opened, isEmpty);
    await tester.tap(find.text('Titre o1'));
    await tester.pumpAndSettle();
    expect(opened, ['/orders/0cfd024b-0b0b-4d97-a2d7-65e7a071d3be']);
  });

  test('deepLinkPath: product / order entities, nothing for the rest or an empty id', () {
    expect(_n('a', entityType: 'product', entityId: 'p').deepLinkPath, '/products/p');
    expect(_n('a', entityType: 'order', entityId: 'o').deepLinkPath, '/orders/o');
    expect(_n('a', entityType: 'order', entityId: '').deepLinkPath, isNull);
    expect(_n('a').deepLinkPath, isNull);
  });
}
