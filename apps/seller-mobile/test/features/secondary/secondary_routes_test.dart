import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:seller_mobile/core/theme/app_theme.dart';
import 'package:seller_mobile/features/earnings/data/earnings_repository.dart';
import 'package:seller_mobile/features/earnings/data/models/earning_model.dart';
import 'package:seller_mobile/features/earnings/presentation/providers/earnings_provider.dart';
import 'package:seller_mobile/features/earnings/presentation/screens/earnings_screen.dart';
import 'package:seller_mobile/features/notifications/data/notification_model.dart';
import 'package:seller_mobile/features/notifications/data/notifications_repository.dart';
import 'package:seller_mobile/features/notifications/presentation/providers/notifications_provider.dart';
import 'package:seller_mobile/features/notifications/presentation/screens/notifications_screen.dart';
import 'package:seller_mobile/features/profile/presentation/screens/help_support_screen.dart';

class _NotificationsRepo extends NotificationsRepository {
  _NotificationsRepo() : super(Dio());

  @override
  Future<NotificationsPage> getNotifications({
    int page = 1,
    int limit = 20,
  }) async {
    return NotificationsPage(
      items: [
        NotificationModel(
          id: 'n$page',
          type: 'ORDER',
          title: 'Notification $page',
          body: 'Une longue notification opérationnelle en français.',
          createdAt: DateTime(2026, 9, 3),
        ),
      ],
      unread: 1,
      total: 31,
      page: page,
      limit: limit,
    );
  }
}

class _NotificationsFixture extends NotificationsNotifier {
  _NotificationsFixture(NotificationsState initial)
      : super(_NotificationsRepo()) {
    state = initial;
  }
}

class _EarningsFixture extends EarningsNotifier {
  _EarningsFixture(EarningsState initial) : super(EarningsRepository(Dio())) {
    state = initial;
  }

  @override
  Future<void> loadPayouts({int page = 1}) async {}
}

Future<void> _pump(
  WidgetTester tester,
  Widget child, {
  List<Override> overrides = const [],
}) async {
  tester.view.physicalSize = const Size(320, 568);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await tester.pumpWidget(
    ProviderScope(
      overrides: overrides,
      child: MaterialApp(
        theme: AppTheme.lightTheme,
        builder: (context, appChild) => MediaQuery(
          data: MediaQuery.of(context).copyWith(
            textScaler: const TextScaler.linear(2),
          ),
          child: appChild!,
        ),
        home: child,
      ),
    ),
  );
  await tester.pump();
}

void main() {
  testWidgets('notification failure is distinct from an empty inbox',
      (tester) async {
    final notifier = _NotificationsFixture(
      const NotificationsState(error: 'Service momentanément indisponible'),
    );
    await _pump(
      tester,
      const NotificationsScreen(),
      overrides: [
        notificationsProvider.overrideWith((ref) => notifier),
      ],
    );

    expect(find.text('Service momentanément indisponible'), findsOneWidget);
    expect(find.text('Aucune notification'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  test('notifications load subsequent pages without replacing page one',
      () async {
    final notifier = _NotificationsFixture(
      NotificationsState(
        items: [
          NotificationModel(
            id: 'n1',
            type: 'ORDER',
            title: 'Première',
            body: 'Page un',
            createdAt: DateTime(2026, 9, 3),
          ),
        ],
        unread: 1,
        page: 1,
        total: 31,
        limit: 30,
      ),
    );
    addTearDown(notifier.dispose);

    await notifier.loadMore();
    expect(notifier.state.items.map((item) => item.id), ['n1', 'n2']);
    expect(notifier.state.page, 2);
  });

  testWidgets('earnings summary scrolls on a short screen with 2x text',
      (tester) async {
    final notifier = _EarningsFixture(
      const EarningsState(
        wallet: SellerWallet(
          balanceCDF: '1234567800',
          pendingCDF: '500000',
          totalEarnedCDF: '2345678900',
          totalCommissionCDF: '345678900',
          pendingPayoutCDF: '0',
        ),
      ),
    );
    await _pump(
      tester,
      const EarningsScreen(),
      overrides: [earningsProvider.overrideWith((ref) => notifier)],
    );

    expect(find.text('Solde disponible'), findsOneWidget);
    expect(find.byType(NestedScrollView), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('support contacts and copy actions fit enlarged text',
      (tester) async {
    await _pump(tester, const HelpSupportScreen());

    expect(find.text('Aide et support'), findsOneWidget);
    await tester.drag(find.byType(ListView), const Offset(0, -800));
    await tester.pump();
    expect(find.text('contact@teka.cd'), findsOneWidget);
    expect(find.byTooltip('Copier Email'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
