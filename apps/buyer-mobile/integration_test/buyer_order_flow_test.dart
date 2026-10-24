// OPT-IN native client/server QA — buyer app against a LOCAL disposable API.
//
// Never part of `flutter test` (that runs test/ only). Run with flutter drive
// and the TEKA_QA_* defines documented in
// docs/qa/order-integrity/native-followup/README.md. The guard below refuses
// to start (before any request) unless the flavor is development, the API
// host is local and every fixture variable is present.
//
// ONE CONTINUOUS JOURNEY: a single testWidgets mounts the app ONCE and runs
// three named scenarios in sequence on the same widget tree, ProviderContainer
// and GoRouter — exactly like one user session (no test-framework teardown or
// remount between login, cancel, re-read and retry). The first failure ends
// the journey, so later scenarios (and their fixture writes) never run.
//
// What is REAL: the auth screens + repository (mock WhatsApp OTP of the
// development API), town selection, product detail, cart, checkout, order
// detail, the cancel POST, every read, the stock and the audit log.
// What is NOT a tap: some navigation goes through the app's own GoRouter
// (`router.go/push(<known path>)`) instead of tapping tabs — stated at each
// step. Setup/assertions use real endpoints: the seller session for stock,
// the admin session for cleanup, the app's own buyer session for order reads.
// One in-memory buyer session for the whole journey (OTP issuance is limited
// to 3 per phone per 10 minutes).

import 'package:buyer_mobile/core/router/app_router.dart';
import 'package:buyer_mobile/features/auth/presentation/providers/auth_provider.dart';
import 'package:buyer_mobile/features/city/presentation/providers/city_provider.dart';
import 'package:buyer_mobile/features/orders/data/orders_repository.dart';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:integration_test/integration_test.dart';

import 'support/qa_api.dart';
import 'support/qa_app.dart';
import 'support/qa_config.dart';
import 'support/qa_driver_helpers.dart';

void main() {
  final binding = IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  late QaConfig config;
  late QaApi api;
  late QaSession seller;
  late QaSession admin;
  late QaBuyerApp app;
  late QaShots shots;
  const baseline = 10; // fixture stock set at the start of every run

  Future<int> stock() async =>
      (await QaFixtures.product(seller, config.productId)).quantity;

  // The cancel dialog's TITLE and its confirm FilledButton share the text
  // « Annuler la commande »: target the button, never the first text match.
  Finder dialogConfirmCancel() => find.descendant(
      of: find.byType(AlertDialog),
      matching: find.widgetWithText(FilledButton, 'Annuler la commande'));

  /// Scenarios 2–3 need scenario 1's buyer session. Checked BEFORE any
  /// fixture request, so a lost session creates no test order.
  void requireBuyerSession() {
    if (app.container.read(authProvider).status != AuthStatus.authenticated) {
      fail('Session acheteur absente — scénario arrêté avant toute création '
          'de commande.');
    }
  }

  void noFlutterErrors(WidgetTester tester, String where) {
    final error = tester.takeException();
    expect(error, isNull, reason: 'Erreur Flutter sur « $where » : $error');
  }

  setUpAll(() async {
    // Fail-closed: throws (no request sent) on any missing / unsafe value.
    config = QaConfig.load(const [
      'TEKA_QA_BUYER_PHONE',
      'TEKA_QA_OTP',
      'TEKA_QA_SELLER_EMAIL',
      'TEKA_QA_SELLER_PASSWORD',
      'TEKA_QA_ADMIN_EMAIL',
      'TEKA_QA_ADMIN_PASSWORD',
      'TEKA_QA_PRODUCT_ID',
      'TEKA_QA_CITY_ID',
      'TEKA_QA_ADDRESS_ID',
    ]);
    api = QaApi(config.apiBaseUrl);
    await api.health(); // "backend down / wrong host" fails here, not in the UI
    seller = await api.loginEmail(config.sellerEmail, config.sellerPassword,
        label: 'vendeur QA');
    admin = await api.loginEmail(config.adminEmail, config.adminPassword,
        label: 'admin QA');
    // Deterministic starting stock through the real seller endpoint
    // (absolute reset guarded by expectedQuantity). Fixture product only.
    await QaFixtures.setStock(seller, config.productId, baseline);
    expect(await stock(), baseline, reason: 'stock de départ du produit QA');
    app = await QaBuyerApp.create(config);
    shots = QaShots(binding, 'buyer');
  });

  // ── Scenario 1 ───────────────────────────────────────────────────────────
  /// Town gate, real OTP login, PDP in FC, cart, COD checkout. Returns the id
  /// of the order created by the UI checkout.
  Future<String> loginBrowseAndCheckout(
      WidgetTester tester, GoRouter router, String cityName) async {
    // The router's REAL town gate: guest + towns loaded + no town →
    // /city-selection. Strict — a wrong screen here is a finding, not a
    // timing issue (both inputs are already resolved).
    try {
      await pumpUntil(tester, () => app.route == '/city-selection',
          waitingFor: 'redirection réelle vers /city-selection',
          timeout: const Duration(seconds: 15));
    } on TestFailure catch (e) {
      await shots.take(tester, '01-ERREUR-pas-de-choix-ville');
      fail('$e\nÉtat : ${app.stateSummary()}');
    }
    await pumpUntilFound(tester, find.text(cityName),
        waitingFor: 'ville « $cityName » listée sur l’écran de choix');
    await shots.take(tester, '01-choix-ville');
    await tapVisible(tester, find.text(cityName)); // real tap → selectCity
    await pumpUntil(
        tester,
        () =>
            app.container.read(cityProvider).selectedCity?.id == config.cityId,
        waitingFor: 'ville QA enregistrée');
    // Selected-town behaviour: the gate opens and the town is displayed.
    await pumpUntil(tester, () => app.route != '/city-selection',
        waitingFor: 'sortie de l’écran de choix après sélection');
    await pumpUntilFound(tester, find.textContaining(cityName),
        waitingFor: 'ville « $cityName » affichée après sélection');
    qaStep('ville choisie : ${app.stateSummary()}');

    // Protected route → the router's real redirect to the login screen.
    router.go('/orders'); // router navigation (not a tab tap)
    await pumpUntilFound(tester, find.text('Recevoir mon code'),
        waitingFor: 'écran « Connexion ou inscription »');
    await shots.take(tester, '02-connexion-vide'); // before any digit is typed
    await tester.enterText(
        find.widgetWithText(TextField, 'Numéro WhatsApp'),
        config.buyerPhone.substring(4)); // 9 national digits, as a user types
    await tapVisible(tester,
        find.widgetWithText(FilledButton, 'Recevoir mon code')); // real OTP request
    await pumpUntilFound(tester, find.text('Code WhatsApp'),
        waitingFor: 'écran du code WhatsApp');
    // 6 digits auto-submit → real verify; no screenshot while the code shows.
    await tester.enterText(
        find.widgetWithText(TextField, 'Code à 6 chiffres'), config.otp);
    await pumpUntil(
        tester,
        () =>
            app.container.read(authProvider).status ==
            AuthStatus.authenticated,
        waitingFor: 'session acheteur ouverte par le vrai /otp/verify');

    // Clean, specific starting cart for this run (the buyer's own cart only).
    await app.http.send('DELETE', '/v1/cart');
    final ordersBefore = await QaFixtures.buyerOrderIds(app.http);

    // Product detail (router navigation to the known PDP path).
    router.push('/products/${config.productId}');
    await pumpUntilFound(tester, find.text('Ajouter au panier'),
        waitingFor: 'fiche produit');
    expect(find.textContaining(' FC'), findsWidgets,
        reason: 'prix affiché en francs congolais');
    noFlutterErrors(tester, 'fiche produit');
    await shots.take(tester, '03-fiche-produit');
    await tapVisible(tester, find.text('Ajouter au panier')); // real tap
    await pumpUntilFound(tester, find.text('Produit ajouté au panier'),
        waitingFor: 'confirmation d’ajout au panier');

    router.go('/cart'); // router navigation to the cart tab
    await pumpUntilFound(tester, find.text('Passer la commande'),
        waitingFor: 'panier');
    noFlutterErrors(tester, 'panier');
    await shots.take(tester, '04-panier');
    await tapVisible(tester, find.text('Passer la commande'));

    Finder primary(String label) => find.widgetWithText(FilledButton, label);
    bool enabled(String label) {
      final f = primary(label);
      return f.evaluate().isNotEmpty &&
          tester.widget<FilledButton>(f.first).onPressed != null;
    }

    await pumpUntil(tester, () => enabled('Suivant'),
        waitingFor: 'adresse de livraison chargée et sélectionnée');
    await tapVisible(tester, primary('Suivant')); // → paiement (COD)
    await pumpUntilFound(tester, find.text('Paiement à la livraison'),
        waitingFor: 'étape paiement');
    await pumpUntil(tester, () => enabled('Suivant'),
        waitingFor: 'paiement à la livraison sélectionné');
    await tapVisible(tester, primary('Suivant')); // → vérification
    await pumpUntil(tester, () => enabled('Confirmer la commande'),
        waitingFor: 'devis de livraison (zone couverte) et bouton actif');
    noFlutterErrors(tester, 'vérification de commande');
    await shots.take(tester, '05-verification');
    await tapVisible(tester, primary('Confirmer la commande')); // real checkout
    await pumpUntilFound(tester, find.text('Voir mes commandes'),
        waitingFor: 'écran de confirmation de commande',
        timeout: const Duration(seconds: 40));
    await shots.take(tester, '06-commande-confirmee');

    // Backend truth: exactly one new order, COD pending, stock taken once.
    final created =
        (await QaFixtures.buyerOrderIds(app.http)).difference(ordersBefore);
    expect(created, hasLength(1), reason: 'une seule commande créée');
    final id = created.single;
    final order = await QaFixtures.buyerOrder(app.http, id);
    expect(order['status'], 'PENDING');
    expect(order['paymentMethod'], 'COD');
    expect(order['paymentStatus'], 'PENDING');
    expect(await stock(), baseline - 1, reason: 'stock décrémenté une fois');
    return id;
  }

  // ── Scenario 2 ───────────────────────────────────────────────────────────
  /// Real cancel from the detail: immediate state, stock restored once,
  /// retry refused.
  Future<void> cancelFromDetail(
      WidgetTester tester, GoRouter router, String id) async {
    requireBuyerSession();

    // Loading state: the detail GET is held 2 s (then sent for real).
    app.fault.delayGets(RegExp('^/v1/orders/$id\$'), const Duration(seconds: 2));
    router.push('/orders/$id');
    await pumpFor(tester, const Duration(milliseconds: 600));
    expect(find.text('Annuler la commande'), findsNothing,
        reason: 'pas d’action pendant le chargement');
    await shots.take(tester, '07-detail-chargement');
    app.fault.disarm();

    final cancelButton = find.widgetWithText(OutlinedButton, 'Annuler la commande');
    await pumpUntilFound(tester, cancelButton,
        waitingFor: 'détail « En attente » avec l’action d’annulation');
    expect(find.text('En attente'), findsWidgets);
    noFlutterErrors(tester, 'détail de commande');
    await shots.take(tester, '08-detail-en-attente');

    await tapVisible(tester, cancelButton); // real tap
    await pumpUntilFound(tester, find.text('Voulez-vous annuler cette commande ?'),
        waitingFor: 'dialogue de confirmation');
    await tester.tap(dialogConfirmCancel()); // real cancel POST
    await pumpUntilFound(tester, find.text('Commande annulée'),
        waitingFor: 'message « Commande annulée »');
    await pumpUntilFound(tester, find.text('Annulée'),
        waitingFor: 'statut « Annulée » affiché');
    await pumpUntilGone(tester, cancelButton,
        waitingFor: 'action d’annulation retirée');
    await shots.take(tester, '09-commande-annulee');

    final order = await QaFixtures.buyerOrder(app.http, id);
    expect(order['status'], 'CANCELLED');
    expect(order['paymentStatus'], 'FAILED', reason: 'COD non payé → FAILED');
    expect(QaFixtures.logsInto(order, 'CANCELLED'), 1);
    expect(await stock(), baseline, reason: 'stock restauré exactement une fois');

    // Retry: the UI no longer offers it, so the REAL repository call is made
    // directly (not a tap) — the API must refuse and restore nothing.
    await expectLater(
      app.container.read(ordersRepositoryProvider).cancelOrder(id),
      throwsA(isA<DioException>()
          .having((e) => e.response?.statusCode, 'status', 400)),
    );
    expect(await stock(), baseline, reason: 'aucune double restauration');
    expect(
        QaFixtures.logsInto(await QaFixtures.buyerOrder(app.http, id), 'CANCELLED'),
        1);
  }

  // ── Scenario 3 ───────────────────────────────────────────────────────────
  /// Transient read failure then retry; cancellation refused after the
  /// seller handed the parcel to Teka.
  Future<void> readFailureThenRefusedCancel(
      WidgetTester tester, GoRouter router) async {
    requireBuyerSession();
    // Fresh order for THIS run through the real cart + checkout endpoints.
    final id = await QaFixtures.placeFreshOrder(app.http,
        productId: config.productId, addressId: config.addressId);
    expect(await stock(), baseline - 1);

    // Transient read failure (test-only fault on this GET only).
    app.fault.failGets(RegExp('^/v1/orders/$id\$'));
    router.push('/orders/$id');
    await pumpUntilFound(tester, find.text('Impossible de charger cette commande.'),
        waitingFor: 'état d’erreur en français');
    await shots.take(tester, '10-detail-erreur-reseau');
    app.fault.disarm();
    await tapVisible(tester, find.text('Réessayer')); // real re-read
    final cancelButton = find.widgetWithText(OutlinedButton, 'Annuler la commande');
    await pumpUntilFound(tester, cancelButton, waitingFor: 'détail rechargé');

    // Actor race: the seller hands the parcel to Teka while this screen
    // still shows « En attente ».
    for (final step in ['confirm', 'process', 'ready-for-pickup']) {
      await QaFixtures.sellerTransition(seller, id, step);
    }

    await tapVisible(tester, cancelButton);
    await pumpUntilFound(tester, find.text('Voulez-vous annuler cette commande ?'),
        waitingFor: 'dialogue de confirmation');
    await tester.tap(dialogConfirmCancel()); // real POST → refused
    await pumpUntilFound(tester, find.textContaining('ne peut plus être annulée'),
        waitingFor: 'refus de l’API affiché en français');
    await pumpUntilFound(tester, find.text('Prête pour collecte'),
        waitingFor: 'statut réel rechargé après le refus');
    await pumpUntilGone(tester, cancelButton,
        waitingFor: 'action d’annulation retirée');
    await shots.take(tester, '11-annulation-refusee');

    final order = await QaFixtures.buyerOrder(app.http, id);
    expect(order['status'], 'READY_FOR_TEKA_PICKUP');
    expect(QaFixtures.logsInto(order, 'CANCELLED'), 0);
    expect(await stock(), baseline - 1, reason: 'aucune restauration sur refus');

    // Cleanup through the real admin cancellation (restores once).
    await QaFixtures.adminCancel(admin, id, 'Nettoyage QA');
    expect(await stock(), baseline);
  }

  testWidgets('parcours acheteur continu : connexion, commande COD, annulation, '
      'échec de lecture et annulation refusée', (tester) async {
    // Real startup, synchronised BEFORE the single mount (see
    // QaBuyerApp.startSessionAndTowns): empty in-memory token store → guest,
    // real GET /v1/cities through the app's own repository.
    await app.startSessionAndTowns();
    expect(app.container.read(authProvider).status, AuthStatus.unauthenticated,
        reason: 'stockage vide → session invitée (${app.stateSummary()})');
    final towns = app.container.read(cityProvider);
    expect(towns.error, isNull,
        reason: 'GET /v1/cities réel en échec (${app.stateSummary()})');
    expect(towns.hasCity, isFalse, reason: 'aucune ville sur stockage vide');
    final fixtureTown = towns.cities.where((c) => c.id == config.cityId).toList();
    expect(fixtureTown, hasLength(1),
        reason: 'TEKA_QA_CITY_ID absente des villes actives renvoyées à l’app');

    await app.pump(tester); // the ONLY mount of the journey
    final router = app.container.read(appRouterProvider);

    final orderId = await qaScenario(
        'Acheteur 1/3 — connexion, fiche produit, commande COD',
        () => loginBrowseAndCheckout(tester, router, fixtureTown.single.name));
    await qaScenario('Acheteur 2/3 — annulation',
        () => cancelFromDetail(tester, router, orderId));
    await qaScenario('Acheteur 3/3 — échec de lecture, annulation refusée',
        () => readFailureThenRefusedCancel(tester, router));
  });
}
