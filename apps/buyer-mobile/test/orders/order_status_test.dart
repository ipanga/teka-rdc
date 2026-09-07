// PR D3 (2026-09-07) — one status mapping for the buyer app. The API's enums
// travel untouched; only what a buyer reads is French, and nothing raw leaks.
import 'package:buyer_mobile/features/orders/domain/order_status.dart';
import 'package:buyer_mobile/features/orders/presentation/widgets/order_status_badge.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('orderStatusLabel — every status a buyer can reach', () {
    const expected = {
      'PENDING': 'En attente',
      'CONFIRMED': 'Confirmée',
      'PROCESSING': 'En préparation',
      'READY_FOR_TEKA_PICKUP': 'Prête pour collecte',
      'RECEIVED_AT_TEKA': 'Reçue par Teka',
      'SHIPPED': 'Expédiée',
      'OUT_FOR_DELIVERY': 'En livraison',
      'DELIVERED': 'Livrée',
      'CANCELLED': 'Annulée',
      'RETURNED': 'Retournée',
    };
    expected.forEach((wire, label) {
      test('$wire → $label', () => expect(orderStatusLabel(wire), label));
    });

    test('covers the API enum exactly — no status without a label', () {
      expect(
        BuyerOrderStatus.values.map((s) => s.wire).toSet(),
        expected.keys.toSet(),
      );
    });

    test('is case-insensitive and tolerant of whitespace', () {
      expect(orderStatusLabel('delivered'), 'Livrée');
      expect(orderStatusLabel(' RETURNED '), 'Retournée');
    });

    test('an unknown or missing status never leaks the raw value', () {
      for (final v in [null, '', 'SOME_NEW_ENUM', 'REFUNDED_ORDER']) {
        expect(orderStatusLabel(v), 'Statut inconnu');
      }
    });
  });

  group('paymentStatusLabel', () {
    test('maps every PaymentStatus value, REFUNDED included', () {
      expect(paymentStatusLabel('PENDING'), 'En attente');
      expect(paymentStatusLabel('PROCESSING'), 'En attente');
      expect(paymentStatusLabel('COMPLETED'), 'Payé');
      expect(paymentStatusLabel('PAID'), 'Payé');
      expect(paymentStatusLabel('FAILED'), 'Échoué');
      // Used to render as the raw English enum on the order detail.
      expect(paymentStatusLabel('REFUNDED'), 'Remboursé');
    });

    test('unknown → French fallback, never the enum', () {
      expect(paymentStatusLabel('CHARGEBACK'), 'Statut inconnu');
      expect(paymentStatusLabel(null), 'Statut inconnu');
    });
  });

  group('order filters', () {
    test('offer « Toutes » plus every status, in workflow order', () {
      expect(orderStatusFilters.first.status, isNull);
      expect(orderStatusFilters.first.label, 'Toutes');
      expect(
        orderStatusFilters.skip(1).map((f) => f.status).toList(),
        BuyerOrderStatus.values,
      );
    });

    test('RETURNED is filterable (it was missing entirely)', () {
      final returned =
          orderStatusFilters.where((f) => f.status == BuyerOrderStatus.returned);
      expect(returned, hasLength(1));
      expect(returned.single.label, 'Retournées');
      expect(returned.single.wire, 'RETURNED');
    });

    test('the value sent to the API is the wire enum, never the label', () {
      expect(orderStatusFilters.first.wire, isNull);
      for (final f in orderStatusFilters.skip(1)) {
        expect(f.wire, f.status!.wire);
        expect(f.wire, matches(RegExp(r'^[A-Z_]+$')));
      }
    });

    test('every chip label is French, none is a raw enum', () {
      for (final f in orderStatusFilters) {
        expect(f.label, isNot(matches(RegExp(r'^[A-Z_]+$'))));
      }
    });
  });

  testWidgets('OrderStatusBadge renders the French label, not the enum',
      (tester) async {
    await tester.pumpWidget(const MaterialApp(
      home: Scaffold(body: OrderStatusBadge(status: 'RETURNED')),
    ));
    expect(find.text('Retournée'), findsOneWidget);
    expect(find.text('RETURNED'), findsNothing);

    await tester.pumpWidget(const MaterialApp(
      home: Scaffold(body: OrderStatusBadge(status: 'WHATEVER')),
    ));
    expect(find.text('Statut inconnu'), findsOneWidget);
    expect(find.text('WHATEVER'), findsNothing);
  });
}
