// MS5 — seller session isolation.
//
// seller-mobile keeps almost nothing on disk: no cart, no recently-viewed, no
// searches, no town, no image cache. `TypedCache`/`CacheKeys` exist but no
// feature reads them, so the only persisted state is the two tokens and
// logout already clears those. MS5's disk-residue claim therefore does not
// apply here as written.
//
// The real gap was in memory. These notifiers are not keyed on the seller id
// and had no reset, so after a logout the previous seller's notifications,
// earnings, promotions and reviews stayed readable in the notifier until the
// process died. The router sends you to login, but the state was still there.
//
// These tests assert the reset itself, which is what the provider's auth
// listener now calls on the way out.

import 'package:flutter_test/flutter_test.dart';
import 'package:seller_mobile/features/notifications/presentation/providers/notifications_provider.dart';
import 'package:seller_mobile/features/notifications/data/notifications_repository.dart';
import 'package:seller_mobile/features/notifications/data/notification_model.dart';

class _FakeRepo implements NotificationsRepository {
  @override
  dynamic noSuchMethod(Invocation invocation) => null;
}

NotificationModel _item(String id) => NotificationModel(
      id: id,
      type: 'ORDER',
      title: 'Nouvelle commande',
      body: 'Une commande vous attend',
      createdAt: DateTime(2026, 9, 9),
    );

void main() {
  group('MS5 — seller notifier reset on logout', () {
    test('reset drops the previous seller data and returns to the cold-start '
        'shape so the next sign-in re-fetches', () {
      final notifier = NotificationsNotifier(_FakeRepo());

      // Seller A's feed is loaded.
      notifier.state = notifier.state.copyWith(
        items: [_item('n-a-1'), _item('n-a-2')],
        unread: 2,
        isLoading: false,
      );
      expect(notifier.state.items, hasLength(2));

      notifier.reset();

      expect(notifier.state.items, isEmpty,
          reason: "seller A's notifications must not survive logout");
      expect(notifier.state.unread, 0, reason: 'the badge must not persist');
      expect(notifier.state.isLoading, isTrue,
          reason:
              'back to the cold-start shape, so the next sign-in re-fetches '
              'instead of showing a stale list');
      expect(notifier.state.error, isNull);

      notifier.dispose();
    });

    test('reset is safe to call when nothing was ever loaded', () {
      final notifier = NotificationsNotifier(_FakeRepo());
      expect(notifier.reset, returnsNormally);
      expect(notifier.state.items, isEmpty);
      notifier.dispose();
    });
  });
}
