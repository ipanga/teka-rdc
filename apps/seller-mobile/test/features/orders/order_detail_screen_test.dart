import 'dart:async';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:seller_mobile/core/providers/seller_refresh_provider.dart';
import 'package:seller_mobile/core/theme/app_theme.dart';
import 'package:seller_mobile/core/theme/teka_colors.dart';
import 'package:seller_mobile/features/auth/presentation/providers/auth_provider.dart';
import 'package:seller_mobile/features/orders/data/models/order_model.dart';
import 'package:seller_mobile/features/orders/data/orders_repository.dart';
import 'package:seller_mobile/features/orders/presentation/screens/order_detail_screen.dart';
import 'package:seller_mobile/features/orders/presentation/widgets/order_action_buttons.dart';
import '../../support/seller_dashboard_fixtures.dart';

/// Local repository: the detail's only data source, with the transitions
/// the API exposes and the failure shapes it returns.
class _Repo extends SellerOrdersRepository {
  _Repo(this.order) : super(Dio());
  SellerOrderModel order;
  final detailFetches = <Completer<SellerOrderModel>>[];
  bool holdDetail = false;
  Object? failTransitionWith;

  /// Status the server holds when the client's attempt is stale.
  OrderStatus? serverStatus;
  int transitions = 0;
  int listCalls = 0;

  SellerOrderModel _with(OrderStatus status, {String? note}) => _order(
        status,
        logs: [
          ...order.statusLogs,
          OrderStatusLogModel(
              id: 'log-${order.statusLogs.length}',
              fromStatus: orderStatusToApi(order.status),
              toStatus: orderStatusToApi(status),
              note: note,
              createdAt: DateTime(2026, 9, 8, 12, 0)),
        ],
      );

  @override
  Future<SellerOrderModel> getOrderById(String id) {
    if (serverStatus != null && order.status != serverStatus) {
      order = _with(serverStatus!);
    }
    if (!holdDetail) return Future.value(order);
    final completer = Completer<SellerOrderModel>();
    detailFetches.add(completer);
    return completer.future;
  }

  @override
  Future<PaginatedOrdersResponse> getOrders(
      {int page = 1, int limit = 20, String? status}) async {
    listCalls++;
    return PaginatedOrdersResponse(
        items: const [], total: 0, page: page, limit: limit);
  }

  Future<SellerOrderModel> _transition(OrderStatus to, {String? note}) async {
    transitions++;
    if (failTransitionWith != null) throw failTransitionWith!;
    order = _with(to, note: note);
    return _changed(order);
  }

  SellerOrderModel _changed(SellerOrderModel o) {
    // Mirror the real repository: a successful mutation bumps the revision.
    onChangedHook?.call();
    return o;
  }

  void Function()? onChangedHook;

  @override
  Future<SellerOrderModel> confirmOrder(String id) =>
      _transition(OrderStatus.confirmed);
  @override
  Future<SellerOrderModel> processOrder(String id) =>
      _transition(OrderStatus.processing);
  @override
  Future<SellerOrderModel> markReadyForPickup(String id) =>
      _transition(OrderStatus.readyForTekaPickup);
  @override
  Future<SellerOrderModel> rejectOrder(String id, String reason) =>
      _transition(OrderStatus.cancelled, note: reason);
}

SellerOrderModel _order(OrderStatus status,
        {List<OrderStatusLogModel> logs = const []}) =>
    SellerOrderModel(
      id: 'order-1',
      orderNumber: 'TK-20260908-QA01',
      status: status,
      paymentMethod: 'COD',
      paymentStatus: status == OrderStatus.delivered ? 'COMPLETED' : 'PENDING',
      totalCDF: '8800000',
      subtotalCDF: '8500000',
      deliveryFeeCDF: '300000',
      createdAt: DateTime(2026, 9, 8, 9, 30),
      buyer: const OrderBuyerModel(
          id: 'b', firstName: 'Jean', lastName: 'Mulamba', phone: '+243999000002'),
      itemCount: 2,
      items: const [
        OrderItemModel(
            id: 'i1',
            productId: 'p1',
            productTitle: 'Chemise Homme en Lin - Blanche',
            quantity: 2,
            unitPriceCDF: '3500000',
            totalCDF: '7000000'),
        OrderItemModel(
            id: 'i2',
            productId: 'p2',
            productTitle: 'Ballon de Football - Taille 5',
            quantity: 1,
            unitPriceCDF: '1500000',
            totalCDF: '1500000'),
      ],
      deliveryAddress: const OrderAddressModel(
          town: 'Lubumbashi',
          neighborhood: 'Kenya',
          avenue: 'Avenue Lumumba 12',
          reference: 'Près du marché',
          recipientName: 'Jean Mulamba',
          recipientPhone: '+243999000002'),
      statusLogs: logs.isEmpty
          ? [
              OrderStatusLogModel(
                  id: 'log-0',
                  toStatus: 'PENDING',
                  createdAt: DateTime(2026, 9, 8, 9, 30)),
            ]
          : logs,
      financials: const OrderFinancials(
          grossCDF: '8500000',
          commissionCDF: '850000',
          netCDF: '7650000',
          commissionRate: '0.1',
          isFinal: false),
    );

Future<(ProviderContainer, _Repo, GoRouter)> _pump(
  WidgetTester tester, {
  required SellerOrderModel order,
  double width = 390,
  double height = 844,
  double scale = 1,
  bool settle = true,
}) async {
  tester.view.physicalSize = Size(width, height);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  final repo = _Repo(order);
  final container = ProviderContainer(overrides: [
    authProvider.overrideWith((_) => FixtureAuthNotifier()),
    sellerOrdersRepositoryProvider.overrideWith((ref) {
      repo.onChangedHook =
          () => ref.read(sellerRefreshProvider.notifier).ordersChanged();
      return repo;
    }),
  ]);
  addTearDown(container.dispose);
  final router = GoRouter(initialLocation: '/orders/order-1', routes: [
    GoRoute(
        path: '/orders',
        builder: (_, __) => const Scaffold(body: Text('Liste des commandes'))),
    GoRoute(
        path: '/orders/:id',
        builder: (_, state) =>
            OrderDetailScreen(orderId: state.pathParameters['id']!)),
    GoRoute(path: '/', builder: (_, __) => const Scaffold(body: Text('Accueil'))),
  ]);
  addTearDown(router.dispose);
  await tester.pumpWidget(UncontrolledProviderScope(
    container: container,
    child: MaterialApp.router(
      theme: AppTheme.lightTheme,
      locale: const Locale('fr'),
      supportedLocales: const [Locale('fr')],
      localizationsDelegates: GlobalMaterialLocalizations.delegates,
      routerConfig: router,
      builder: (context, child) => MediaQuery(
          data: MediaQuery.of(context)
              .copyWith(textScaler: TextScaler.linear(scale)),
          child: child!),
    ),
  ));
  if (settle) await tester.pumpAndSettle();
  return (container, repo, router);
}

Future<void> _confirmInDialog(WidgetTester tester, String label) async {
  await tester.tap(find.descendant(
      of: find.byType(AlertDialog),
      matching: find.widgetWithText(ElevatedButton, label)));
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('first paint is a shaped skeleton with the action bar area, '
      'never a bare spinner', (tester) async {
    final repo = _Repo(_order(OrderStatus.pending))..holdDetail = true;
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(ProviderScope(
      overrides: [
        authProvider.overrideWith((_) => FixtureAuthNotifier()),
        sellerOrdersRepositoryProvider.overrideWithValue(repo),
      ],
      child: MaterialApp(
        theme: AppTheme.lightTheme,
        locale: const Locale('fr'),
        supportedLocales: const [Locale('fr')],
        localizationsDelegates: GlobalMaterialLocalizations.delegates,
        home: const OrderDetailScreen(orderId: 'order-1'),
      ),
    ));
    await tester.pump();
    expect(find.byType(OrderDetailSkeleton), findsOneWidget);
    expect(find.bySemanticsLabel('Chargement de la commande'), findsOneWidget);
    expect(find.byType(CircularProgressIndicator), findsNothing);
    expect(tester.takeException(), isNull);
    repo.detailFetches.single.complete(repo.order);
    await tester.pumpAndSettle();
    expect(find.byType(OrderDetailSkeleton), findsNothing);
    expect(find.text('Commande TK-20260908-QA01'), findsOneWidget);
  });

  testWidgets('load failure shows the shared error state and retries',
      (tester) async {
    final repo = _Repo(_order(OrderStatus.pending))..holdDetail = true;
    await tester.pumpWidget(ProviderScope(
      overrides: [
        authProvider.overrideWith((_) => FixtureAuthNotifier()),
        sellerOrdersRepositoryProvider.overrideWithValue(repo),
      ],
      child: MaterialApp(
        theme: AppTheme.lightTheme,
        locale: const Locale('fr'),
        supportedLocales: const [Locale('fr')],
        localizationsDelegates: GlobalMaterialLocalizations.delegates,
        home: const OrderDetailScreen(orderId: 'order-1'),
      ),
    ));
    await tester.pump();
    repo.detailFetches.single.completeError(DioException(
        requestOptions: RequestOptions(path: '/v1/sellers/orders/order-1'),
        type: DioExceptionType.connectionError));
    await tester.pumpAndSettle();
    expect(find.text('Impossible de charger la commande'), findsOneWidget);
    repo.holdDetail = false;
    await tester.tap(find.text('Réessayer'));
    await tester.pumpAndSettle();
    expect(find.text('Commande TK-20260908-QA01'), findsOneWidget);
  });

  group('seller action by status', () {
    for (final (status, label) in [
      (OrderStatus.pending, 'Confirmer la commande'),
      (OrderStatus.confirmed, 'Commencer la préparation'),
      (OrderStatus.processing, 'Marquer prête pour collecte'),
    ]) {
      testWidgets('${status.name}: primary CTA « $label » + « Votre action »',
          (tester) async {
        await _pump(tester, order: _order(status));
        expect(find.widgetWithText(ElevatedButton, label), findsOneWidget);
        expect(find.text('Votre action'), findsOneWidget);
        expect(find.text('Refuser'),
            status == OrderStatus.pending ? findsOneWidget : findsNothing);
      });
    }

    testWidgets('ready for pickup: neutral waiting line, no button',
        (tester) async {
      await _pump(tester, order: _order(OrderStatus.readyForTekaPickup));
      expect(find.byType(OrderActionButtons), findsNothing);
      expect(find.byType(ElevatedButton), findsNothing);
      expect(find.text('En attente de collecte par Teka'), findsOneWidget);
      expect(find.text('Prise en charge par Teka'), findsOneWidget);
    });

    for (final status in [
      OrderStatus.receivedAtTeka,
      OrderStatus.outForDelivery,
      OrderStatus.delivered,
      OrderStatus.cancelled,
      OrderStatus.returned,
    ]) {
      testWidgets('${status.name}: no bar, step explained', (tester) async {
        await _pump(tester, order: _order(status));
        expect(find.byType(OrderActionButtons), findsNothing);
        expect(find.text('En attente de collecte par Teka'), findsNothing);
        expect(find.text('Votre action'), findsNothing);
        final terminal = status == OrderStatus.delivered ||
            status == OrderStatus.cancelled ||
            status == OrderStatus.returned;
        expect(find.text('Commande clôturée'),
            terminal ? findsOneWidget : findsNothing);
        expect(find.text('Prise en charge par Teka'),
            terminal ? findsNothing : findsOneWidget);
        expect(tester.takeException(), isNull);
      });
    }
  });

  testWidgets('a cancelled order shows no seller estimate and no collection',
      (tester) async {
    await _pump(tester, order: _order(OrderStatus.cancelled));
    expect(find.text('Paiement à la livraison · aucun encaissement'),
        findsOneWidget);
    await tester.scrollUntilVisible(find.text('Historique'), 300,
        scrollable: find.byType(Scrollable).first);
    expect(find.text('Montant à recevoir'), findsNothing);
  });

  testWidgets('buyer section shows the name and the town only — no phone, '
      'no street, no recipient phone', (tester) async {
    await _pump(tester, order: _order(OrderStatus.pending));
    expect(find.text('Jean Mulamba'), findsOneWidget);
    expect(find.textContaining('Lubumbashi'), findsOneWidget);
    expect(find.textContaining('+243999000002'), findsNothing);
    expect(find.textContaining('Avenue Lumumba'), findsNothing);
    expect(find.textContaining('Près du marché'), findsNothing);
  });

  testWidgets('money reads in foreground with FC formatting; the seller '
      'share is labelled apart from the buyer total', (tester) async {
    await _pump(tester, order: _order(OrderStatus.pending));
    await tester.scrollUntilVisible(find.text('Montant à recevoir'), 300,
        scrollable: find.byType(Scrollable).first);
    expect(find.text('Total payé par l’acheteur'), findsOneWidget);
    expect(find.text('88.000 FC'), findsOneWidget);
    expect(find.text('Montant à recevoir'), findsOneWidget);
    expect(find.text('76.500 FC'), findsOneWidget);
    expect(find.text('Quantité : 2 × 35.000 FC'), findsOneWidget);
    expect(find.textContaining('CDF'), findsNothing);
    final total = tester.widget<Text>(find.text('88.000 FC'));
    expect(total.style?.color, isNot(TekaColors.tekaRed));
  });

  testWidgets('timeline renders exactly the status logs, in order, with '
      'status tones and no invented future step', (tester) async {
    final logs = [
      OrderStatusLogModel(
          id: 'a', toStatus: 'PENDING', createdAt: DateTime(2026, 9, 8, 9, 30)),
      OrderStatusLogModel(
          id: 'b',
          fromStatus: 'PENDING',
          toStatus: 'CONFIRMED',
          createdAt: DateTime(2026, 9, 8, 10, 0)),
    ];
    await _pump(tester, order: _order(OrderStatus.confirmed, logs: logs));
    await tester.scrollUntilVisible(find.text('Historique'), 300,
        scrollable: find.byType(Scrollable).first);
    final history = find.ancestor(
        of: find.text('Historique'), matching: find.byType(Container)).first;
    expect(find.descendant(of: history, matching: find.text('En attente')),
        findsOneWidget);
    expect(find.descendant(of: history, matching: find.text('Confirmée')),
        findsOneWidget);
    expect(find.descendant(of: history, matching: find.text('En préparation')),
        findsNothing, reason: 'the next step is not a timeline entry');
    expect(
        find.descendant(of: history, matching: find.text('08/09/2026 · 10:00')),
        findsOneWidget);
  });

  testWidgets('confirm: specific dialog, busy bar, success, revision bump; '
      'the dialog button cannot pop twice', (tester) async {
    final (container, repo, _) =
        await _pump(tester, order: _order(OrderStatus.pending));
    final before = container.read(sellerRefreshProvider).orders;
    await tester.tap(find.widgetWithText(ElevatedButton, 'Confirmer la commande'));
    await tester.pumpAndSettle();
    expect(find.byType(AlertDialog), findsOneWidget);
    expect(find.textContaining('Vous ne pourrez plus la refuser'),
        findsOneWidget);
    expect(find.text('Confirmer cette action ?'), findsNothing);
    final button = find.descendant(
        of: find.byType(AlertDialog),
        matching: find.widgetWithText(ElevatedButton, 'Confirmer la commande'));
    await tester.tap(button);
    await tester.tap(button, warnIfMissed: false);
    await tester.pumpAndSettle();
    expect(repo.transitions, 1);
    expect(find.byType(OrderDetailScreen), findsOneWidget,
        reason: 'a second pop must not close the detail');
    expect(find.text('Commande mise à jour.'), findsOneWidget);
    expect(container.read(sellerRefreshProvider).orders, before + 1,
        reason: 'the list, the Action Center and the badge refetch');
    expect(find.text('Commencer la préparation'), findsOneWidget,
        reason: 'the detail now shows the next step');
    expect(repo.listCalls, greaterThanOrEqualTo(1));
  });

  testWidgets('refuse: reason required, button disabled until typed, '
      'cancellation explained', (tester) async {
    final (_, repo, _) = await _pump(tester, order: _order(OrderStatus.pending));
    await tester.tap(find.text('Refuser'));
    await tester.pumpAndSettle();
    final button = find.descendant(
        of: find.byType(AlertDialog),
        matching: find.widgetWithText(ElevatedButton, 'Refuser la commande'));
    expect(tester.widget<ElevatedButton>(button).onPressed, isNull);
    expect(find.textContaining('annulée définitivement'), findsOneWidget);
    await tester.enterText(find.byType(TextField), 'Rupture de stock');
    await tester.pump();
    expect(tester.widget<ElevatedButton>(button).onPressed, isNotNull);
    await tester.tap(button);
    await tester.pumpAndSettle();
    expect(repo.transitions, 1);
    expect(repo.order.status, OrderStatus.cancelled);
    expect(repo.order.statusLogs.last.note, 'Rupture de stock');
    expect(find.text('Commande refusée. L’acheteur a été informé.'),
        findsOneWidget);
    expect(find.byType(OrderActionButtons), findsNothing);
  });

  testWidgets('transition failure: state kept, the API\'s French message '
      'shown, retry possible', (tester) async {
    final (_, repo, _) = await _pump(tester, order: _order(OrderStatus.pending));
    repo.failTransitionWith = DioException(
      requestOptions: RequestOptions(path: '/x'),
      response: Response(
          requestOptions: RequestOptions(path: '/x'),
          statusCode: 400,
          data: {
            'success': false,
            'error': {'status': 400, 'message': 'Stock insuffisant pour confirmer.'}
          }),
      type: DioExceptionType.badResponse,
    );
    await tester.tap(find.widgetWithText(ElevatedButton, 'Confirmer la commande'));
    await tester.pumpAndSettle();
    await _confirmInDialog(tester, 'Confirmer la commande');
    expect(find.text('Stock insuffisant pour confirmer.'), findsOneWidget);
    expect(find.widgetWithText(ElevatedButton, 'Confirmer la commande'),
        findsOneWidget, reason: 'still pending: the seller can retry');
    expect(
        tester
            .widget<ElevatedButton>(
                find.widgetWithText(ElevatedButton, 'Confirmer la commande'))
            .onPressed,
        isNotNull);
  });

  testWidgets('stale transition: the order is reloaded and the seller is '
      'told the status changed', (tester) async {
    final (_, repo, _) = await _pump(tester, order: _order(OrderStatus.pending));
    // Another device already confirmed it; the API refuses PENDING→CONFIRMED.
    repo.serverStatus = OrderStatus.confirmed;
    repo.failTransitionWith = DioException(
      requestOptions: RequestOptions(path: '/x'),
      response: Response(
          requestOptions: RequestOptions(path: '/x'),
          statusCode: 400,
          data: {
            'success': false,
            'error': {'status': 400, 'message': 'Transition de statut invalide.'}
          }),
      type: DioExceptionType.badResponse,
    );
    await tester.tap(find.widgetWithText(ElevatedButton, 'Confirmer la commande'));
    await tester.pumpAndSettle();
    await _confirmInDialog(tester, 'Confirmer la commande');
    expect(find.textContaining('a changé entre-temps'), findsOneWidget);
    expect(find.text('Commencer la préparation'), findsOneWidget,
        reason: 'the fiche shows the server status');
    expect(find.text('Transition de statut invalide.'), findsNothing);
  });

  testWidgets('a successful transition shows the next step at once, before '
      'the slow detail refetch lands', (tester) async {
    final (_, repo, _) = await _pump(tester, order: _order(OrderStatus.pending));
    await tester.tap(find.widgetWithText(ElevatedButton, 'Confirmer la commande'));
    await tester.pumpAndSettle();
    repo.holdDetail = true; // the refetch after the transition never answers
    await _confirmInDialog(tester, 'Confirmer la commande');
    expect(find.text('Commencer la préparation'), findsOneWidget);
    expect(find.text('Confirmer la commande'), findsNothing);
    await tester.scrollUntilVisible(find.text('Montant à recevoir'), 300,
        scrollable: find.byType(Scrollable).first);
    expect(find.text('Montant à recevoir'), findsOneWidget,
        reason: 'financials kept from the detail while the refetch runs');
    expect(repo.detailFetches, isNotEmpty);
  });

  testWidgets('status changes while a dialog is open: the stale attempt is '
      'reported as a change, not as an error', (tester) async {
    final (container, repo, _) =
        await _pump(tester, order: _order(OrderStatus.confirmed));
    await tester.tap(
        find.widgetWithText(ElevatedButton, 'Commencer la préparation'));
    await tester.pumpAndSettle();
    // A push refreshes the order to PROCESSING behind the dialog.
    repo.order = _order(OrderStatus.processing);
    container.read(sellerRefreshProvider.notifier).handlePush(
        {'screen': 'order-details', 'orderId': 'order-1'});
    await tester.pump(const Duration(milliseconds: 350));
    await tester.pumpAndSettle();
    repo.failTransitionWith = DioException(
      requestOptions: RequestOptions(path: '/x'),
      response: Response(
          requestOptions: RequestOptions(path: '/x'),
          statusCode: 400,
          data: {
            'success': false,
            'error': {'status': 400, 'message': 'Transition de statut invalide.'}
          }),
      type: DioExceptionType.badResponse,
    );
    await _confirmInDialog(tester, 'Commencer la préparation');
    expect(find.textContaining('a changé entre-temps'), findsOneWidget);
    expect(find.text('Transition de statut invalide.'), findsNothing);
    expect(find.text('Marquer prête pour collecte'), findsOneWidget);
  });

  testWidgets('a push or resume revision refetches an open detail',
      (tester) async {
    final (container, repo, _) =
        await _pump(tester, order: _order(OrderStatus.pending));
    repo.order = _order(OrderStatus.confirmed);
    container.read(sellerRefreshProvider.notifier).handlePush(
        {'screen': 'order-details', 'orderId': 'order-1'});
    await tester.pump(const Duration(milliseconds: 350));
    await tester.pumpAndSettle();
    expect(find.text('Commencer la préparation'), findsOneWidget);
  });

  for (final width in [320.0, 360.0, 390.0, 412.0]) {
    for (final scale in [1.0, 1.5]) {
      testWidgets('pending detail fits $width at $scale×', (tester) async {
        await _pump(tester,
            order: _order(OrderStatus.pending), width: width, scale: scale);
        expect(find.text('Confirmer la commande'), findsOneWidget);
        expect(find.text('Refuser'), findsOneWidget);
        await tester.scrollUntilVisible(find.text('Historique'), 300,
            scrollable: find.byType(Scrollable).first);
        expect(tester.takeException(), isNull);
      });
    }
  }

  for (final (width, height) in [(600.0, 960.0), (834.0, 1194.0), (1024.0, 768.0), (1280.0, 800.0)]) {
    testWidgets('tablet $width×$height: content and bar in a readable column',
        (tester) async {
      await _pump(tester,
          order: _order(OrderStatus.pending), width: width, height: height);
      final title = tester.getRect(find.text('Commande TK-20260908-QA01'));
      expect(title.left, greaterThan(0));
      final bar = tester.getRect(find.byType(OrderActionButtons));
      expect(bar.width, lessThanOrEqualTo(720));
      expect((bar.left - (width - bar.width) / 2).abs(), lessThan(1),
          reason: 'centred');
      expect(tester.takeException(), isNull);
    });
  }
}
