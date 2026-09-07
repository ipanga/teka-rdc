// PR D3 (2026-09-07) — « Mes commandes »: French filter chips over every
// status, and a refresh that never blanks the list.
import 'package:buyer_mobile/core/config/flavor.dart';
import 'package:buyer_mobile/features/orders/data/models/order_model.dart';
import 'package:buyer_mobile/features/orders/data/orders_repository.dart';
import 'package:buyer_mobile/features/orders/presentation/screens/orders_screen.dart';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

OrderModel _order(String number, String status) => OrderModel.fromJson({
      'id': 'o-$number',
      'orderNumber': number,
      'status': status,
      'paymentStatus': 'PENDING',
      'paymentMethod': 'COD',
      'subtotalCDF': '2500000',
      'deliveryFeeCDF': '0',
      'totalCDF': '2500000',
      'createdAt': '2026-09-07T06:00:00.000Z',
      'items': const [],
    });

class _Repo extends OrdersRepository {
  _Repo() : super(Dio());
  List<OrderModel> orders = [];
  String? lastStatus;
  bool fail = false;
  int calls = 0;

  @override
  Future<({List<OrderModel> orders, int total, int totalPages})> getOrders({
    int page = 1,
    int limit = 20,
    String? status,
  }) async {
    calls++;
    lastStatus = status;
    if (fail) {
      throw DioException(
        requestOptions: RequestOptions(path: '/v1/orders'),
        type: DioExceptionType.connectionError,
      );
    }
    final list = status == null
        ? orders
        : orders.where((o) => o.status == status).toList();
    return (orders: list, total: list.length, totalPages: 1);
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(FlavorConfig.initialize);

  late _Repo repo;

  Future<void> pump(WidgetTester tester) async {
    await tester.pumpWidget(ProviderScope(
      overrides: [ordersRepositoryProvider.overrideWithValue(repo)],
      child: const MaterialApp(home: OrdersScreen()),
    ));
    await tester.pumpAndSettle();
  }

  setUp(() {
    repo = _Repo()
      ..orders = [_order('TK-1', 'DELIVERED'), _order('TK-2', 'RETURNED')];
  });

  testWidgets('every filter chip is French; no raw enum is displayed',
      (tester) async {
    await pump(tester);
    // The chips live in a horizontal list, so scroll each into view first.
    for (final label in ['Toutes', 'En attente', 'Livrées', 'Retournées']) {
      final chip = find.text(label);
      await tester.scrollUntilVisible(chip, 120,
          scrollable: find.byType(Scrollable).first);
      expect(chip, findsOneWidget, reason: label);
    }
    for (final wire in ['DELIVERED', 'RETURNED', 'PENDING']) {
      expect(find.text(wire), findsNothing, reason: wire);
    }
  });

  testWidgets('the « Retournées » filter asks the API for RETURNED',
      (tester) async {
    await pump(tester);
    final chip = find.widgetWithText(FilterChip, 'Retournées');
    await tester.scrollUntilVisible(chip, 150,
        scrollable: find.byType(Scrollable).first);
    // The chip row is centered in a readable column on a tablet-width test
    // surface, so scrollUntilVisible can stop with the chip flush against the
    // edge; ensureVisible brings its centre inside the viewport before the tap.
    await tester.ensureVisible(chip);
    await tester.pumpAndSettle();
    await tester.tap(chip, warnIfMissed: false);
    await tester.pumpAndSettle();
    expect(repo.lastStatus, 'RETURNED');
    expect(find.text('Commande TK-2'), findsOneWidget);
    expect(find.text('Commande TK-1'), findsNothing);
  });

  testWidgets('a failed refresh keeps the orders and shows an inline retry',
      (tester) async {
    await pump(tester);
    expect(find.text('Commande TK-1'), findsOneWidget);

    repo.fail = true;
    await tester.fling(find.text('Commande TK-1'), const Offset(0, 400), 1000);
    await tester.pumpAndSettle();

    expect(find.text('Commande TK-1'), findsOneWidget, reason: 'list kept');
    expect(find.byKey(const ValueKey('orders-inline-error')), findsOneWidget);
    expect(find.textContaining('connexion'), findsOneWidget);

    repo.fail = false;
    await tester.tap(find.text('Réessayer'));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('orders-inline-error')), findsNothing);
    expect(find.text('Commande TK-1'), findsOneWidget);
  });

  testWidgets('nothing loaded + failure → error state with retry',
      (tester) async {
    repo
      ..orders = []
      ..fail = true;
    await pump(tester);
    expect(find.text('Réessayer'), findsOneWidget);
    repo.fail = false;
    repo.orders = [_order('TK-9', 'DELIVERED')];
    await tester.tap(find.text('Réessayer'));
    await tester.pumpAndSettle();
    expect(find.text('Commande TK-9'), findsOneWidget);
  });

  testWidgets('an empty list stays pull-to-refreshable', (tester) async {
    repo.orders = [];
    await pump(tester);
    expect(find.text("Vous n'avez aucune commande"), findsOneWidget);
    final before = repo.calls;
    await tester.fling(
        find.text("Vous n'avez aucune commande"), const Offset(0, 400), 1000);
    await tester.pumpAndSettle();
    expect(repo.calls, greaterThan(before));
  });
}
