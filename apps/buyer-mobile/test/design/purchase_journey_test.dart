import 'dart:io';

import 'package:buyer_mobile/core/widgets/product_skeletons.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

/// PDP, cart and checkout (UX PR C, 2026-09-07).
///
/// The purchase journey is the part of the app where an unclear number or an
/// unaccented word costs real money, so these lean on source guards for copy
/// and structure and on widget tests for what a buyer actually sees.
void main() {
  group('PDP gallery loading', () {
    testWidgets('shows an image affordance, not a blank panel', (tester) async {
      tester.view.physicalSize = const Size(390, 900);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(body: ProductGallerySkeleton()),
        ),
      );
      await tester.pump();
      // The shimmer is still there…
      expect(find.byType(ShimmerBox), findsOneWidget);
      // …and so is the hint that a picture is coming.
      expect(find.byIcon(Icons.image_outlined), findsOneWidget);
    });

    testWidgets('reserves the same height the real gallery will take',
        (tester) async {
      for (final width in <double>[360, 390, 800, 1280]) {
        tester.view.physicalSize = Size(width, 1400);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.reset);
        await tester.pumpWidget(
          const MaterialApp(home: Scaffold(body: ProductGallerySkeleton())),
        );
        await tester.pump();
        final height =
            tester.getSize(find.byType(ProductGallerySkeleton)).height;
        expect(height, greaterThan(0), reason: 'width $width');
        // Capped on a tablet, never a full-width square wall.
        if (width >= 600) {
          expect(height, lessThan(width), reason: 'width $width');
        }
        expect(tester.takeException(), isNull);
      }
    });
  });

  group('French copy on the purchase journey', () {
    final checkout = File(
      'lib/features/checkout/presentation/screens/checkout_screen.dart',
    ).readAsStringSync();

    test('the review heading and the COD line are accented', () {
      // Both shipped unaccented: « Recapitulatif » and « Payez a la
      // reception… » on the two most-read checkout screens.
      expect(checkout.contains('Recapitulatif'), isFalse);
      expect(checkout.contains('Récapitulatif'), isTrue);
      expect(checkout.contains('Payez a la reception'), isFalse);
      expect(checkout.contains('à la réception'), isTrue);
    });

    test('checkout never offers a payment method that does not exist', () {
      for (final ghost in [
        'Mobile Money',
        'M-Pesa',
        'Airtel Money',
        'Orange Money',
        'Carte bancaire',
        'Visa',
      ]) {
        expect(checkout.contains(ghost), isFalse, reason: ghost);
      }
    });

    test('the recap says Teka collects the cash, never the seller', () {
      expect(checkout.contains('livreur Teka encaisse'), isTrue);
    });

    test('the steps are labelled, not bare numbers', () {
      expect(checkout.contains("['Adresse', 'Paiement', 'Vérification']"),
          isTrue);
    });

    test('the address empty state uses the shared shell', () {
      expect(checkout.contains('AppEmptyState('), isTrue);
      expect(checkout.contains('Icons.location_off_outlined'), isTrue);
    });
  });

  group('cart price hierarchy', () {
    final tile = File(
      'lib/features/cart/presentation/widgets/cart_item_tile.dart',
    ).readAsStringSync();
    final cart = File(
      'lib/features/cart/presentation/screens/cart_screen.dart',
    ).readAsStringSync();

    test('the unit price and the line total are each labelled', () {
      // With a quantity of 1 the two numbers are identical; without labels a
      // buyer at quantity 3 cannot tell which is which.
      expect(tile.contains('/ unité'), isTrue);
      expect(tile.contains('"Sous-total"'), isTrue);
    });

    test('the unit price no longer borrows the brand red', () {
      // Red means promotion elsewhere in the app; the PDP has always shown the
      // effective price in foreground.
      expect(
        RegExp(r'unitPrice[\s\S]{0,200}TekaColors\.tekaRed').hasMatch(tile),
        isFalse,
      );
    });

    test('the cart bar says subtotal, because delivery is not known yet', () {
      expect(cart.contains("'Sous-total'"), isTrue);
      expect(cart.contains("'Livraison calculée à la commande'"), isTrue);
    });
  });

  group('order success', () {
    final success = File(
      'lib/features/checkout/presentation/screens/checkout_success_screen.dart',
    ).readAsStringSync();

    test('tells the buyer what happens next and when they pay', () {
      expect(success.contains('Teka le '), isTrue);
      expect(success.contains('payez en espèces') ||
          success.contains('Vous payez en espèces'), isTrue);
    });

    test('never prints a raw order status', () {
      expect(success.contains('orderStatusLabel('), isTrue);
      expect(success.contains('order.status,\n'), isFalse);
    });
  });

  group('sticky purchase bar', () {
    test('is lifted off the content by a sanctioned shadow', () {
      final pdp = File(
        'lib/features/catalog/presentation/screens/product_detail_screen.dart',
      ).readAsStringSync();
      expect(pdp.contains('TekaColors.shadowMedium'), isTrue);
      // The old ad-hoc 5% black is gone.
      expect(pdp.contains('Colors.black.withValues(alpha: 0.05)'), isFalse);
    });
  });
}
