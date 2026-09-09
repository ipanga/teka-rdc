import 'package:flutter_test/flutter_test.dart';
import 'package:seller_mobile/core/theme/teka_colors.dart';
import 'package:seller_mobile/features/orders/data/models/order_model.dart';
import 'package:seller_mobile/features/orders/presentation/order_status_ui.dart';
import 'package:seller_mobile/features/orders/presentation/widgets/order_action_buttons.dart';

void main() {
  test('exactly the three seller-driven statuses require a seller action', () {
    final actionable = OrderStatus.values
        .where((s) => OrderStatusUi.of(s).sellerActionRequired)
        .toList();
    expect(actionable, [
      OrderStatus.pending,
      OrderStatus.confirmed,
      OrderStatus.processing,
    ]);
    for (final s in actionable) {
      expect(OrderActionButtons.primaryLabel(s), isNotNull, reason: s.name);
    }
    for (final s in OrderStatus.values.where((s) => !actionable.contains(s))) {
      expect(OrderActionButtons.primaryLabel(s), isNull, reason: s.name);
    }
  });

  test('card action labels are short imperatives, never the status word', () {
    expect(OrderStatusUi.of(OrderStatus.pending).actionLabel, 'À confirmer');
    expect(OrderStatusUi.of(OrderStatus.confirmed).actionLabel, 'À préparer');
    expect(OrderStatusUi.of(OrderStatus.processing).actionLabel, 'À finaliser');
  });

  test('no raw enum, no English, every status has French wording', () {
    for (final s in OrderStatus.values) {
      final ui = OrderStatusUi.of(s);
      for (final text in [ui.label, ui.filterLabel, ui.step]) {
        expect(text, isNotEmpty, reason: s.name);
        expect(text, isNot(contains('_')), reason: s.name);
        expect(text, isNot(equals(orderStatusToApi(s))), reason: s.name);
      }
      expect(OrderStatusUi.labelOf(orderStatusToApi(s)), ui.label);
    }
  });

  test('tone: attention while the seller acts, neutral while Teka collects, '
      'success / destructive at the end — never brand red', () {
    for (final s in [
      OrderStatus.pending,
      OrderStatus.confirmed,
      OrderStatus.processing
    ]) {
      expect(OrderStatusUi.of(s).color, TekaColors.warningForeground);
    }
    expect(OrderStatusUi.of(OrderStatus.readyForTekaPickup).color,
        TekaColors.neutralForeground);
    expect(OrderStatusUi.of(OrderStatus.delivered).color,
        TekaColors.successForeground);
    expect(OrderStatusUi.of(OrderStatus.cancelled).color,
        TekaColors.destructiveForeground);
    for (final s in OrderStatus.values) {
      expect(OrderStatusUi.of(s).color, isNot(TekaColors.tekaRed));
    }
  });

  test('the filter bar covers every status once, seller steps first', () {
    expect(orderFilterOrder.toSet(), OrderStatus.values.toSet());
    expect(orderFilterOrder.length, OrderStatus.values.length);
    expect(orderFilterOrder.take(3), [
      OrderStatus.pending,
      OrderStatus.confirmed,
      OrderStatus.processing,
    ]);
    expect(orderFilterOrder.last, OrderStatus.shipped,
        reason: 'legacy bucket kept at the end');
  });

  test('the waiting-for-Teka step never reads as a seller task', () {
    final ready = OrderStatusUi.of(OrderStatus.readyForTekaPickup);
    expect(ready.step, contains('Teka'));
    expect(ready.step, contains('Rien à faire'));
    expect(ready.actionLabel, isNull);
  });

  test('empty copy names the bucket for the seller\'s own filters', () {
    expect(orderEmptyCopy(null).title, 'Aucune commande pour le moment');
    expect(orderEmptyCopy(OrderStatus.pending).title,
        'Aucune commande à confirmer');
    expect(orderEmptyCopy(OrderStatus.confirmed).title,
        'Aucune commande à préparer');
    expect(orderEmptyCopy(OrderStatus.processing).title,
        'Aucune commande en préparation');
    expect(orderEmptyCopy(OrderStatus.readyForTekaPickup).title,
        'Aucune commande prête pour collecte');
    expect(orderEmptyCopy(OrderStatus.delivered).title,
        'Aucune commande dans ce statut');
  });
}
