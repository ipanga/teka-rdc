// OPT-IN native client/server QA — seller app against a LOCAL disposable API.
//
// Never part of `flutter test` (that runs test/ only). Run with flutter drive
// and the TEKA_QA_* defines documented in
// docs/qa/order-integrity/native-followup/README.md. The guard refuses to
// start (before any request) unless the flavor is development, the API host
// is local and every fixture variable is present.
//
// ONE CONTINUOUS JOURNEY: a single testWidgets mounts the app ONCE (at the
// login screen) and runs six named scenarios in sequence on the same widget
// tree, ProviderContainer and GoRouter — like one seller session (no
// test-framework teardown or remount between scenarios). The first failure
// ends the journey, so later scenarios (and their fixture writes) never run.
//
// What is REAL: the email/password login screen + repository, the order
// detail and its reject / confirm actions, the orders list and its
// pull-to-refresh, the product edit form and its save, every read, the stock
// and the audit log.
// What is NOT a tap: some navigation goes through the app's own GoRouter
// (`router.push/go(<known path>)`) — stated at each step. Fixture orders are
// created by a helper BUYER session through the real cart + checkout
// endpoints; buyer / admin cancellations are real API calls made "elsewhere"
// while this app shows the order. Stock is always read back from the server.

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:integration_test/integration_test.dart';
import 'package:seller_mobile/core/router/app_router.dart';
import 'package:seller_mobile/core/widgets/seller_list_state.dart';
import 'package:seller_mobile/features/auth/presentation/providers/auth_provider.dart';
import 'package:seller_mobile/features/orders/data/models/order_model.dart';
import 'package:seller_mobile/features/orders/data/orders_repository.dart';
import 'package:seller_mobile/features/orders/presentation/providers/orders_provider.dart';

import 'support/qa_api.dart';
import 'support/qa_app.dart';
import 'support/qa_config.dart';
import 'support/qa_driver_helpers.dart';

void main() {
  final binding = IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  late QaConfig config;
  late QaApi api;
  late QaSession buyer;
  late QaSession admin;
  late QaSellerApp app;
  late QaShots shots;
  const baseline = 10; // fixture stock reset after login, every run

  Future<int> stock() async =>
      (await QaFixtures.product(app.http, config.productId)).quantity;

  Future<String> freshOrder({int quantity = 1}) =>
      QaFixtures.placeFreshOrder(buyer,
          productId: config.productId,
          addressId: config.sellerFlowAddressId,
          quantity: quantity);

  Finder dialogPrimary() => find.descendant(
      of: find.byType(AlertDialog), matching: find.byType(ElevatedButton));

  // The orders tab keeps its list in sellerOrdersProvider: navigating back to
  // it shows the CACHED rows and sends no request. A change made elsewhere is
  // only seen after a refresh — here the screen's real pull-to-refresh.
  Finder ordersList() => find.descendant(
      of: find.byType(RefreshIndicator), matching: find.byType(Scrollable));

  Future<void> pullToRefreshOrders(WidgetTester tester) async {
    bool idle() => !app.container.read(sellerOrdersProvider).isLoading;
    await pumpUntil(tester, () => idle() && ordersList().evaluate().isNotEmpty,
        waitingFor: 'liste des commandes affichée, au repos');
    var reloadStarted = false;
    final sub = app.container.listen(sellerOrdersProvider, (_, next) {
      if (next.isLoading) reloadStarted = true;
    });
    try {
      // Real gesture: a downward fling at the top of the list overscrolls
      // into the RefreshIndicator → notifier.refresh → real GET. If the list
      // was scrolled, the first fling only brings it back to the top.
      for (var attempt = 0; attempt < 3 && !reloadStarted; attempt++) {
        await tester.fling(ordersList().first, const Offset(0, 500), 1500);
        await pumpFor(tester, const Duration(milliseconds: 600));
      }
      if (!reloadStarted) {
        fail('Le geste « tirer pour actualiser » n’a déclenché aucun '
            'rechargement de la liste des commandes.');
      }
      await pumpUntil(tester, idle, waitingFor: 'actualisation terminée');
    } finally {
      sub.close();
    }
  }

  /// Scenarios 2–6 need scenario 1's seller session. Checked BEFORE any
  /// fixture request, so a lost session creates no test order.
  void requireSellerSession() {
    if (app.container.read(authProvider).status != AuthStatus.authenticated) {
      fail('Session vendeur absente — scénario arrêté avant toute création '
          'de commande.');
    }
  }

  Future<void> openOrder(WidgetTester tester, GoRouter router, String id) async {
    // Wait for THIS order (list rows show « Commande TK-… » too).
    final number =
        (await QaFixtures.sellerOrder(app.http, id))['orderNumber'] as String;
    router.push('/orders/$id'); // router nav
    await pumpUntilFound(tester, find.text('Commande $number'),
        waitingFor: 'détail de la commande vendeur');
  }

  setUpAll(() async {
    config = QaConfig.load(const [
      'TEKA_QA_BUYER_PHONE',
      'TEKA_QA_OTP',
      'TEKA_QA_SELLER_EMAIL',
      'TEKA_QA_SELLER_PASSWORD',
      'TEKA_QA_ADMIN_EMAIL',
      'TEKA_QA_ADMIN_PASSWORD',
      'TEKA_QA_PRODUCT_ID',
      'TEKA_QA_ADDRESS_ID',
    ]);
    api = QaApi(config.apiBaseUrl);
    await api.health();
    // Helper buyer (real OTP; set TEKA_QA_SELLER_FLOW_BUYER_PHONE +
    // TEKA_QA_SELLER_FLOW_ADDRESS_ID to spread the OTP rate limit).
    buyer = await api.buyerOtpLogin(config.sellerFlowBuyerPhone, config.otp,
        label: 'acheteur QA (fixtures)');
    admin = await api.loginEmail(config.adminEmail, config.adminPassword,
        label: 'admin QA');
    app = await QaSellerApp.create(config);
    shots = QaShots(binding, 'seller');
  });

  // ── Scenario 1 ───────────────────────────────────────────────────────────
  Future<void> login(WidgetTester tester) async {
    // The screen has a « Se connecter » HEADING and a button with the same
    // label: target the enabled ElevatedButton, never the first text match.
    final loginButton = find.widgetWithText(ElevatedButton, 'Se connecter');
    await pumpUntil(
        tester,
        () =>
            loginButton.evaluate().isNotEmpty &&
            tester.widget<ElevatedButton>(loginButton).onPressed != null,
        waitingFor: 'bouton « Se connecter » actif');
    await shots.take(tester, '01-connexion-vide'); // nothing typed yet
    await tester.enterText(
        find.widgetWithText(TextFormField, 'Email'), config.sellerEmail);
    await tester.enterText(find.widgetWithText(TextFormField, 'Mot de passe'),
        config.sellerPassword);
    await tapVisible(tester, loginButton); // real login POST
    await pumpUntil(
        tester,
        () =>
            app.container.read(authProvider).status ==
            AuthStatus.authenticated,
        waitingFor: 'session vendeur (compte approuvé)');
    await pumpUntilGone(tester, find.widgetWithText(TextFormField, 'Mot de passe'),
        waitingFor: 'sortie de l’écran de connexion');
    await shots.take(tester, '02-accueil-vendeur'); // password no longer shown

    // Deterministic starting stock (real seller endpoint, snapshot-guarded).
    await QaFixtures.setStock(app.http, config.productId, baseline);
    expect(await stock(), baseline);
  }

  // ── Scenario 2 ───────────────────────────────────────────────────────────
  Future<void> rejectOrder(WidgetTester tester, GoRouter router) async {
    requireSellerSession();
    final id = await freshOrder(quantity: 2);
    expect(await stock(), baseline - 2, reason: 'commande en attente : 2 réservés');

    await openOrder(tester, router, id);
    await pumpUntilFound(tester, find.text('Refuser'),
        waitingFor: 'action « Refuser » sur la commande nouvelle');
    expect(tester.takeException(), isNull);
    await shots.take(tester, '03-commande-nouvelle');

    await tapVisible(tester, find.text('Refuser')); // real tap
    await pumpUntilFound(tester, find.text('Motif du refus'),
        waitingFor: 'dialogue de refus');
    await tester.enterText(find.widgetWithText(TextField, 'Motif du refus'),
        'Rupture de stock (QA)');
    await tester.pump();
    await tester.tap(dialogPrimary()); // « Refuser la commande » → real PATCH
    await pumpUntilFound(tester, find.textContaining('Commande refusée'),
        waitingFor: 'confirmation du refus');
    await pumpUntilFound(tester, find.text('Annulée'),
        waitingFor: 'statut « Annulée » affiché');
    await pumpUntilGone(tester, find.text('Refuser'),
        waitingFor: 'action « Refuser » retirée');
    await shots.take(tester, '04-commande-refusee');

    final order = await QaFixtures.sellerOrder(app.http, id);
    expect(order['status'], 'CANCELLED');
    expect(QaFixtures.logsInto(order, 'CANCELLED'), 1);
    expect(await stock(), baseline, reason: 'restitué exactement une fois');

    // Retry through the REAL repository (the UI no longer offers it).
    await expectLater(
      app.container.read(sellerOrdersRepositoryProvider).rejectOrder(id, 'QA'),
      throwsA(isA<DioException>()
          .having((e) => e.response?.statusCode, 'status', 400)),
    );
    expect(await stock(), baseline, reason: 'aucune double restitution');
  }

  // ── Scenario 3 ───────────────────────────────────────────────────────────
  Future<void> buyerThenAdminCancellation(
      WidgetTester tester, GoRouter router) async {
    requireSellerSession();

    // Buyer cancels elsewhere while the seller looks at « nouvelle ».
    final byBuyer = await freshOrder();
    await openOrder(tester, router, byBuyer);
    final confirm = find.widgetWithText(ElevatedButton, 'Confirmer la commande');
    await pumpUntilFound(tester, confirm, waitingFor: 'action « Confirmer »');
    await QaFixtures.buyerCancel(buyer, byBuyer);
    await tapVisible(tester, confirm); // real tap on the now-stale action
    await pumpUntilFound(tester, dialogPrimary(), waitingFor: 'dialogue');
    await tester.tap(dialogPrimary()); // real PATCH → refused by the API
    await pumpUntilFound(tester, find.textContaining('a changé entre-temps'),
        waitingFor: 'avertissement « statut changé »');
    await pumpUntilFound(tester, find.text('Annulée'),
        waitingFor: 'fiche rechargée : « Annulée »');
    await shots.take(tester, '05-annulation-acheteur-detectee');
    expect((await QaFixtures.sellerOrder(app.http, byBuyer))['status'], 'CANCELLED');
    expect(await stock(), baseline);

    // Admin cancels elsewhere; the seller re-opens it from the list (taps).
    final byAdmin = await freshOrder();
    final number =
        (await QaFixtures.sellerOrder(app.http, byAdmin))['orderNumber'] as String;
    await QaFixtures.adminCancel(admin, byAdmin, 'Annulation QA');
    router.go('/orders'); // router nav to tab
    await pullToRefreshOrders(tester); // real gesture → real GET
    final row = find.text('Commande $number');
    await pumpUntilFound(tester, row,
        waitingFor: 'commande $number dans la liste');
    await tapVisible(tester, row); // real tap on the list row
    await pumpUntilFound(tester, find.text('Annulée'),
        waitingFor: 'détail « Annulée » lu du backend');
    expect(confirm, findsNothing);
    await shots.take(tester, '06-annulation-admin');
    expect(await stock(), baseline);
  }

  // ── Scenario 4 ───────────────────────────────────────────────────────────
  Future<void> staleStockConflict(WidgetTester tester, GoRouter router) async {
    requireSellerSession();
    final order = await freshOrder(quantity: 2);
    final before = await QaFixtures.product(app.http, config.productId);
    expect(before.quantity, baseline - 2);

    router.push('/products/${config.productId}/edit'); // router nav
    final qtyField = find.widgetWithText(TextFormField, 'Quantité disponible');
    final priceField = find.widgetWithText(TextFormField, 'Prix FC');
    String fieldText(Finder f) =>
        tester.widget<TextFormField>(f).controller!.text;
    await pumpUntilFound(tester, qtyField, waitingFor: 'formulaire produit');
    await pumpUntil(tester, () => fieldText(qtyField) == '${baseline - 2}',
        waitingFor: 'quantité chargée = ${baseline - 2}');

    // Meanwhile the order is cancelled on the server: stock back to 10.
    await QaFixtures.buyerCancel(buyer, order);
    expect(await stock(), baseline);

    final newPrice = '${BigInt.parse(before.priceCDF) ~/ BigInt.from(100) + BigInt.from(1000)}';
    await tester.ensureVisible(priceField);
    await tester.enterText(priceField, newPrice);
    await tester.ensureVisible(qtyField);
    await tester.enterText(qtyField, '5');
    await tester.pump();
    await tapVisible(tester, find.text('Enregistrer les modifications'));
    await pumpUntilFound(tester, find.textContaining('Le stock de ce produit a changé'),
        waitingFor: 'conflit 409 expliqué en français');
    await pumpUntil(tester, () => fieldText(qtyField) == '$baseline',
        waitingFor: 'quantité rafraîchie depuis le serveur ($baseline)');
    expect(fieldText(priceField), newPrice, reason: 'le prix saisi est conservé');
    await shots.take(tester, '07-stock-perime-409');

    final after = await QaFixtures.product(app.http, config.productId);
    expect(after.quantity, baseline, reason: 'stock serveur non écrasé');
    expect(after.priceCDF, before.priceCDF, reason: 'édition entière annulée');
    router.pop(); // leave the unsaved form
  }

  // ── Scenario 5 ───────────────────────────────────────────────────────────
  Future<void> listFailureThenRetry(WidgetTester tester, GoRouter router) async {
    requireSellerSession();
    router.go('/orders'); // router nav
    // Arm the read fault, then refresh with the real gesture: the GET is sent
    // and fails like a dropped connection.
    app.fault.failGets(RegExp(r'^/v1/sellers/orders$'));
    await pullToRefreshOrders(tester);
    expect(app.container.read(sellerOrdersProvider).error, isNotNull,
        reason: 'le GET actualisé doit avoir échoué (faute de test armée)');
    // With cached rows the screen keeps them and shows the error as the list
    // FOOTER (with « Réessayer »); with none, as the full-height message.
    final errorTitle = find.text('Impossible de charger les commandes');
    await tester.scrollUntilVisible(errorTitle, 400,
        scrollable: ordersList().first);
    await shots.take(tester, '08-liste-erreur');

    app.fault.disarm();
    await tapVisible(tester, find.widgetWithText(OutlinedButton, 'Réessayer')); // real re-read
    await pumpUntil(
        tester,
        () {
          final s = app.container.read(sellerOrdersProvider);
          return !s.isLoading && s.error == null;
        },
        waitingFor: 'liste rechargée sans erreur (GET réel)');
    await pumpUntilFound(tester, find.textContaining('TK-'),
        waitingFor: 'commandes QA listées');
    await shots.take(tester, '09-liste-chargee');
  }

  // ── Scenario 6 ───────────────────────────────────────────────────────────
  // Read-only: nothing is seeded or deleted. The « Retournées » list must be
  // REALLY empty on the QA API; if it is not, the scenario fails (never forced).
  Future<void> loadingThenEmptyReturned(WidgetTester tester) async {
    requireSellerSession();
    // Still on /orders (« Toutes ») from scenario 5; otherwise the chip tap
    // would be a no-op (setStatusFilter ignores an unchanged filter).
    expect(app.container.read(sellerOrdersProvider).selectedStatus, isNull,
        reason: 'filtre « Toutes » attendu avant le tap');

    // Hold the next list GET ~5 s (then sent for real) so the loading state
    // can be seen and captured.
    app.fault.delayGets(
        RegExp(r'^/v1/sellers/orders$'), const Duration(seconds: 5));
    final chip = find.widgetWithText(ChoiceChip, 'Retournées');
    await tapVisible(tester, chip); // real tap; scrolls the horizontal bar
    await pumpUntilFound(tester, find.byType(SellerListLoading),
        waitingFor: 'chargement de la liste « Retournées »');
    await shots.take(tester, '10-liste-chargement');

    app.fault.disarm(); // the held GET still goes out for real
    await pumpUntil(
        tester,
        () {
          final s = app.container.read(sellerOrdersProvider);
          return s.selectedStatus == OrderStatus.returned && !s.isLoading;
        },
        waitingFor: 'liste « Retournées » chargée (GET réel)',
        timeout: const Duration(seconds: 30));
    final s = app.container.read(sellerOrdersProvider);
    expect(s.error, isNull);
    expect(s.total, 0, reason: 'aucune commande retournée sur l’API QA');
    expect(s.orders, isEmpty);

    // Empty-state copy from orderEmptyCopy(OrderStatus.returned) (default
    // branch) and the filtered action of OrdersListScreen._message.
    expect(find.byType(SellerListLoading), findsNothing);
    expect(tester.widget<ChoiceChip>(chip).selected, isTrue);
    expect(find.text('Aucune commande dans ce statut'), findsOneWidget);
    expect(
        find.text('Choisissez un autre statut pour consulter vos commandes.'),
        findsOneWidget);
    expect(find.widgetWithText(OutlinedButton, 'Voir toutes les commandes'),
        findsOneWidget);
    await shots.take(tester, '11-liste-vide-retournees');
    expect(await stock(), baseline);
  }

  testWidgets('parcours vendeur continu : connexion, refus, annulations, '
      'stock périmé (409), liste en échec puis réessai, chargement puis '
      'liste vide', (tester) async {
    await app.pump(tester); // the ONLY mount of the journey
    final router = app.container.read(appRouterProvider);

    await qaScenario('Vendeur 1/6 — connexion', () => login(tester));
    await qaScenario('Vendeur 2/6 — refus', () => rejectOrder(tester, router));
    await qaScenario('Vendeur 3/6 — annulations acheteur et admin',
        () => buyerThenAdminCancellation(tester, router));
    await qaScenario('Vendeur 4/6 — stock périmé (409)',
        () => staleStockConflict(tester, router));
    await qaScenario('Vendeur 5/6 — liste en échec puis réessai',
        () => listFailureThenRetry(tester, router));
    await qaScenario('Vendeur 6/6 — chargement puis liste vide (Retournées)',
        () => loadingThenEmptyReturned(tester));
  });
}
